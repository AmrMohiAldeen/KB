using System.Data;
using System.Text.Json;
using Kb.Application.Exceptions;
using Kb.Application.Migrations.HelpJuice;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Kb.Infrastructure.Search;

namespace Kb.Infrastructure.Migrations.HelpJuice;

public sealed class HelpJuiceImportWriter(KbDbContext db, TimeProvider timeProvider) : IHelpJuiceImportWriter
{
    public void ResetState() => db.ChangeTracker.Clear();

    public async Task WriteOperationAuditAsync(Guid operationId, string action, string status, Guid actorId,
        CancellationToken ct)
    {
        db.ArticleAuditLogs.Add(new ArticleAuditLog
        {
            AuditLogId = NewId(), ActorIdFk = actorId, ActionType = action,
            EntityType = "HelpJuiceMigration", EntityId = operationId,
            MetaDataJson = JsonSerializer.Serialize(new { migrationOperationId = operationId, sourceSystem = "HelpJuice", status }),
            CreatedAt = timeProvider.GetUtcNow().UtcDateTime
        });
        await SaveAsync(ct);
    }

    public async Task<Guid> StartOrResumeJobAsync(Guid proposedJobId, string packageHash, string optionsJson,
        Guid actorId, DateTime startedAt, CancellationToken ct)
    {
        var existing = await db.MigrationJobs.OrderByDescending(x => x.StartedAt).FirstOrDefaultAsync(x =>
            x.SourceSystem == "HelpJuice" && x.PackageHash == packageHash &&
            x.Status != HelpJuiceMigrationStatuses.Completed, ct);
        if (existing is not null)
        {
            existing.Status = "Running"; existing.OptionsJson = optionsJson; existing.StartedAt = startedAt;
            existing.CompletedAt = null; existing.SummaryJson = null;
            await SaveAsync(ct); return existing.MigrationJobId;
        }
        db.MigrationJobs.Add(new MigrationJob
        {
            MigrationJobId = proposedJobId, SourceSystem = "HelpJuice", PackageHash = packageHash,
            Status = "Running", RequestedByFk = actorId, OptionsJson = optionsJson, StartedAt = startedAt
        });
        await SaveAsync(ct); return proposedJobId;
    }

    public async Task PersistJobResultAsync(Guid jobId, string status, string summaryJson,
        IReadOnlyList<MigrationIssueData> issues, DateTime completedAt, CancellationToken ct)
    {
        var job = await db.MigrationJobs.SingleAsync(x => x.MigrationJobId == jobId, ct);
        job.Status = status; job.SummaryJson = summaryJson; job.CompletedAt = completedAt;
        var previous = await db.MigrationJobIssues.Where(x => x.MigrationJobIdFk == jobId).ToListAsync(ct);
        db.MigrationJobIssues.RemoveRange(previous);
        foreach (var issue in issues)
            db.MigrationJobIssues.Add(new MigrationJobIssue
            {
                MigrationIssueId = issue.Id, MigrationJobIdFk = jobId, Severity = issue.Severity,
                FileName = issue.FileName, RowNumber = issue.RowNumber,
                ExternalEntityType = issue.ExternalEntityType, ExternalId = issue.ExternalId,
                ErrorCode = issue.ErrorCode, Message = issue.Message,
                SourceDataSummary = issue.SourceDataSummary, CreatedAt = issue.CreatedAt
            });
        await SaveAsync(ct);
    }

    public async Task<IReadOnlySet<string>> GetActiveArticleSlugsAsync(CancellationToken ct) =>
        (await db.Articles.AsNoTracking().Where(x => x.DeletedAt == null).Select(x => x.Slug).ToListAsync(ct))
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    public async Task<IReadOnlyDictionary<string, string>> GetMappedArticleSlugsAsync(CancellationToken ct)
    {
        var mappings = await (from mapping in db.MigrationExternalMappings.AsNoTracking()
            join article in db.Articles.AsNoTracking() on mapping.InternalId equals article.ArticleId
            where mapping.SourceSystem == "HelpJuice" && mapping.ExternalEntityType == "Article" && article.DeletedAt == null
            select new { mapping.ExternalId, article.Slug }).ToListAsync(ct);
        return mappings.ToDictionary(item => item.ExternalId, item => item.Slug, StringComparer.OrdinalIgnoreCase);
    }

    public async Task<IReadOnlyDictionary<string, HelpJuiceAuthorMapping>> ResolveHelpJuiceAuthorsAsync(
        IReadOnlyCollection<string> helpJuiceUserIds, CancellationToken ct)
    {
        var normalizedIds = helpJuiceUserIds.Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim().ToUpperInvariant()).Distinct(StringComparer.Ordinal).ToArray();
        if (normalizedIds.Length == 0)
            return new Dictionary<string, HelpJuiceAuthorMapping>(StringComparer.OrdinalIgnoreCase);

        var users = await db.Users.AsNoTracking()
            .Where(user => user.HelpJuiceUserId != null &&
                           normalizedIds.Contains(user.HelpJuiceUserId!.ToUpper()))
            .Select(user => new { user.HelpJuiceUserId, user.UserId, user.FullName })
            .ToListAsync(ct);
        return users.ToDictionary(user => user.HelpJuiceUserId!,
            user => new HelpJuiceAuthorMapping(user.HelpJuiceUserId!, user.UserId, user.FullName),
            StringComparer.OrdinalIgnoreCase);
    }

    public async Task<MigrationWriteResult> WriteCategoryAsync(Guid operationId, ImportedCategoryData source,
        string behavior, Guid actorId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var mapping = await FindMappingAsync("Category", source.ExternalId, ct);
        var existing = mapping is null
            ? await db.Categories.SingleOrDefaultAsync(x => x.Slug == source.Slug, ct)
            : await db.Categories.SingleOrDefaultAsync(x => x.CategoryId == mapping.InternalId, ct)
                ?? throw new ConflictException($"Mapped HelpJuice category '{source.ExternalId}' no longer exists.");
        if (existing is not null && (mapping is not null && !behavior.Equals(MigrationConflictBehaviors.UpdateExisting, StringComparison.OrdinalIgnoreCase) || behavior.Equals(MigrationConflictBehaviors.Skip, StringComparison.OrdinalIgnoreCase)))
        { if(mapping is null)AddMapping("Category",source.ExternalId,existing.CategoryId,null,new{source.Name,existing.Slug});AddAudit(actorId,"MigrationCategorySkipped","Category",existing.CategoryId,null,operationId); await SaveAsync(ct); await tx.CommitAsync(ct); return new(existing.CategoryId,MigrationWriteDisposition.Skipped); }
        if (existing is not null && behavior.Equals(MigrationConflictBehaviors.UpdateExisting,StringComparison.OrdinalIgnoreCase))
        {
            existing.Name=Normalize(source.Name,200); existing.ParentCategoryIdFk=source.ParentId; existing.Depth=source.Depth;
            existing.SortOrder=source.SortOrder; existing.Visibility=source.Visibility;
            existing.Path=await BuildCategoryPath(source.ParentId,existing.CategoryId,ct);
            if(mapping is null)AddMapping("Category",source.ExternalId,existing.CategoryId,null,new{source.Name,source.Depth});
            await SearchIndexJobQueue.EnqueueCategoryAsync(db,existing.CategoryId,SearchIndexJobTypes.Upsert,timeProvider.GetUtcNow().UtcDateTime,ct);
            AddAudit(actorId,"MigrationCategoryUpdated","Category",existing.CategoryId,null,operationId); await SaveAsync(ct); await tx.CommitAsync(ct); return new(existing.CategoryId,MigrationWriteDisposition.Updated);
        }
        var slug=await AllocateCategorySlugAsync(source.Slug,ct); var id=Guid.NewGuid();
        var category=new Category{CategoryId=id,Name=Normalize(source.Name,200),Slug=slug,ParentCategoryIdFk=source.ParentId,Depth=source.Depth,SortOrder=source.SortOrder,Visibility=source.Visibility,Path=await BuildCategoryPath(source.ParentId,id,ct)};
        db.Categories.Add(category); AddMapping("Category",source.ExternalId,id,null,new { source.Name, source.Depth }); AddAudit(actorId,"MigrationCategoryImported","Category",id,null,operationId);
        await SearchIndexJobQueue.EnqueueCategoryAsync(db,id,SearchIndexJobTypes.Upsert,timeProvider.GetUtcNow().UtcDateTime,ct);
        await SaveAsync(ct); await tx.CommitAsync(ct); return new(id,MigrationWriteDisposition.Imported);
    }

    public async Task<MigrationWriteResult> WriteMediaAsync(Guid operationId, ImportedMediaData media, CancellationToken ct)
    {
        var mapping = await FindMappingAsync("Media", media.ExternalId, ct);
        var existing = mapping is null
            ? await db.MediaFiles.SingleOrDefaultAsync(x => x.MediaId == media.Id, ct)
            : await db.MediaFiles.SingleOrDefaultAsync(x => x.MediaId == mapping.InternalId, ct);
        if(mapping is not null&&existing is null)throw new ConflictException($"Mapped HelpJuice media '{media.ExternalId}' no longer exists.");
        if (existing is not null) return new(existing.MediaId, MigrationWriteDisposition.Skipped);
        if (mapping is null && !string.IsNullOrWhiteSpace(media.Hash))
        {
            var hashMapping = await db.MigrationExternalMappings.AsNoTracking()
                .Where(x => x.SourceSystem == "HelpJuice" && x.ExternalEntityType == "Media" && x.ContentHash == media.Hash)
                .OrderBy(x => x.CreatedAt).FirstOrDefaultAsync(ct);
            if (hashMapping is not null && await db.MediaFiles.AnyAsync(x => x.MediaId == hashMapping.InternalId, ct))
            {
                AddMapping("Media", media.ExternalId, hashMapping.InternalId, media.Hash,
                    new { media.OriginalFileName, media.MimeType, DeduplicatedBy = "sha256" });
                AddAudit(media.UserId,"MigrationMediaReused","Media",hashMapping.InternalId,null,operationId);
                await SaveAsync(ct);
                return new(hashMapping.InternalId, MigrationWriteDisposition.Skipped);
            }
        }
        db.MediaFiles.Add(new MediaFile{MediaId=media.Id,OriginalFileName=Normalize(media.OriginalFileName,260),StoredFileName=media.StoredFileName,MimeType=media.MimeType,FileExtension=media.Extension,FileSizeBytes=media.Size,StoragePath=media.StoragePath,Status=MediaStatuses.Active,UploadedByFk=media.UserId,UploadedAt=media.UploadedAt});
        AddMapping("Media",media.ExternalId,media.Id,media.Hash,new { media.OriginalFileName, media.MimeType });
        AddAudit(media.UserId,"MigrationMediaImported","Media",media.Id,null,operationId); await SaveAsync(ct); return new(media.Id,MigrationWriteDisposition.Imported);
    }

    public async Task<MigrationWriteResult> WriteArticleAsync(Guid operationId, ImportedArticleData source,
        string behavior, CancellationToken ct)
    {
        await using var tx=await db.Database.BeginTransactionAsync(IsolationLevel.Serializable,ct);
        var mapping=await FindMappingAsync("Article",source.ExternalId,ct);
        var existing=mapping is null
            ? await db.Articles.Include(x=>x.CurrentDraftIdFkNavigation).SingleOrDefaultAsync(x=>x.Slug==source.Slug&&x.DeletedAt==null,ct)
            : await db.Articles.Include(x=>x.CurrentDraftIdFkNavigation).SingleOrDefaultAsync(x=>x.ArticleId==mapping.InternalId&&x.DeletedAt==null,ct)
                ?? throw new ConflictException($"Mapped HelpJuice article '{source.ExternalId}' no longer exists.");
        if(mapping is null&&existing is not null&&!behavior.Equals(MigrationConflictBehaviors.UpdateExisting,StringComparison.OrdinalIgnoreCase)) existing=null;
        if(existing is not null&&(mapping is not null&&!behavior.Equals(MigrationConflictBehaviors.UpdateExisting,StringComparison.OrdinalIgnoreCase)||behavior.Equals(MigrationConflictBehaviors.Skip,StringComparison.OrdinalIgnoreCase)))
        {
            if(source.AuthorResolved&&Reattribute(existing,source.AuthorId))
            {
                await SearchIndexJobQueue.EnqueueArticleAsync(db,existing.ArticleId,SearchIndexJobTypes.Upsert,timeProvider.GetUtcNow().UtcDateTime,ct);
                AddAudit(source.ActorId,"MigrationArticleAuthorReconciled","Article",existing.ArticleId,existing.ArticleId,operationId);
                await SaveAsync(ct);await tx.CommitAsync(ct);
                return new(existing.ArticleId,MigrationWriteDisposition.Updated,existing.CurrentDraftIdFk,
                    StagedContentConsumed:false);
            }
            AddAudit(source.ActorId,"MigrationArticleSkipped","Article",existing.ArticleId,existing.ArticleId,operationId);await SaveAsync(ct);await tx.CommitAsync(ct);return new(existing.ArticleId,MigrationWriteDisposition.Skipped,existing.CurrentDraftIdFk,StagedContentConsumed:false);
        }

        var disposition=MigrationWriteDisposition.Imported; Article article; ArticleDraft draft;
        if(existing is not null&&behavior.Equals(MigrationConflictBehaviors.UpdateExisting,StringComparison.OrdinalIgnoreCase))
        {
            disposition=MigrationWriteDisposition.Updated; article=existing; draft=existing.CurrentDraftIdFkNavigation??throw new ConflictException("The destination article has no current draft.");
            article.Title=Normalize(source.Title,300);article.CategoryIdFk=source.CategoryId;article.UpdatedAt=source.UpdatedAt;article.Status=source.Status;article.Position=source.Position;article.Visibility=source.Visibility;
            if(source.AuthorResolved)Reattribute(article,source.AuthorId);
            draft.ContentJsonStoragePath=source.Content.JsonPath;draft.RenderedHtmlStoragePath=source.Content.HtmlPath;draft.PlainTextStoragePath=source.Content.TextPath;draft.ContentHash=source.Content.Hash;draft.ContentSizeBytes=source.Content.Size;draft.UpdatedAt=source.UpdatedAt;draft.Status=DraftStatus(source.Status);Touch(draft);
        }
        else
        {
            var slug=await AllocateArticleSlugAsync(source.Slug,source.ExternalId,ct);var articleId=Guid.NewGuid();var draftId=Guid.NewGuid();
            article=new Article{ArticleId=articleId,Title=Normalize(source.Title,300),Slug=slug,CategoryIdFk=source.CategoryId,AuthorIdFk=source.AuthorId,Status=source.Status,Visibility=source.Visibility,Position=source.Position,CreatedAt=source.CreatedAt,UpdatedAt=source.UpdatedAt,CurrentDraftIdFk=null};
            draft=new ArticleDraft{DraftId=draftId,ArticleIdFk=articleId,DraftNumber=1,ContentJsonStoragePath=source.Content.JsonPath,RenderedHtmlStoragePath=source.Content.HtmlPath,PlainTextStoragePath=source.Content.TextPath,ContentHash=source.Content.Hash,ContentSizeBytes=source.Content.Size,IsLocked=false,CreatedByFk=source.AuthorId,UpdatedByFk=source.AuthorId,CreatedAt=source.CreatedAt,UpdatedAt=source.UpdatedAt,Status=DraftStatus(source.Status)};Touch(draft);
            db.Articles.Add(article);await db.SaveChangesAsync(ct);
            if(db.Database.IsSqlServer()){db.ArticleDrafts.Add(draft);await db.SaveChangesAsync(ct);}
            else
            {
                var rowVersion=Guid.NewGuid().ToByteArray();
                await db.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO ARTICLE_DRAFTS
                        (DraftID, ArticleID_FK, DraftNumber, ContentJsonStoragePath, RenderedHtmlStoragePath,
                         PlainTextStoragePath, ContentHash, ContentSizeBytes, RowVersion, IsLocked,
                         CreatedBy_FK, UpdatedBy_FK, CreatedAt, UpdatedAt, Status)
                    VALUES ({draft.DraftId}, {draft.ArticleIdFk}, {draft.DraftNumber}, {draft.ContentJsonStoragePath},
                            {draft.RenderedHtmlStoragePath}, {draft.PlainTextStoragePath}, {draft.ContentHash},
                            {draft.ContentSizeBytes}, {rowVersion}, {false}, {draft.CreatedByFk}, {draft.UpdatedByFk},
                            {draft.CreatedAt}, {draft.UpdatedAt}, {draft.Status})
                    """,ct);
            }
            article.CurrentDraftIdFk=draftId;
            AddMapping("Article",source.ExternalId,articleId,source.Content.Hash,new { source.Title, source.Slug, source.SourceMetadata });
        }
        if(mapping is null&&disposition==MigrationWriteDisposition.Updated) AddMapping("Article",source.ExternalId,article.ArticleId,source.Content.Hash,new { source.Title, article.Slug, source.SourceMetadata });
        Guid? versionId=null;
        if(source.CreatePublishedVersion)
        {
            var existingVersion=await db.ArticleVersions.AsNoTracking().Where(x=>x.ArticleIdFk==article.ArticleId&&x.ContentHash==source.Content.Hash).OrderByDescending(x=>x.VersionNumber).FirstOrDefaultAsync(ct);
            if(existingVersion is not null) versionId=existingVersion.VersionId;
            else
            {
                versionId=Guid.NewGuid();var number=await db.ArticleVersions.Where(x=>x.ArticleIdFk==article.ArticleId).MaxAsync(x=>(int?)x.VersionNumber,ct)??0;number++;
                var version=new ArticleVersion{VersionId=versionId.Value,ArticleIdFk=article.ArticleId,VersionNumber=number,SourceDraftIdFk=draft.DraftId,SourceDraftNumber=draft.DraftNumber,SnapshotReason=ArticleSnapshotReasons.Published,ContentJsonStoragePath=source.Content.VersionJsonPath??source.Content.JsonPath,RenderedHtmlStoragePath=source.Content.VersionHtmlPath??source.Content.HtmlPath,PlainTextStoragePath=source.Content.VersionTextPath??source.Content.TextPath,ContentHash=source.Content.Hash,ContentSizeBytes=source.Content.Size,CreatedAt=source.UpdatedAt,CreatedByFk=source.AuthorId,PublishedByFk=source.AuthorId,PublishedAt=source.PublishedAt};
                db.ArticleVersions.Add(version);
                AddAudit(source.ActorId,"MigrationPublishedVersionCreated","ArticleVersion",versionId,article.ArticleId,operationId);
            }
            article.LastPublishedVersionIdFk=versionId;
            await SynchronizeReferencesAsync(source.Content.MediaIds,article.ArticleId,"Version",versionId.Value,ct);
        }
        await SynchronizeReferencesAsync(source.Content.MediaIds,article.ArticleId,"Draft",draft.DraftId,ct);
        await SearchIndexJobQueue.EnqueueArticleAsync(db,article.ArticleId,SearchIndexJobTypes.Upsert,timeProvider.GetUtcNow().UtcDateTime,ct);
        AddAudit(source.ActorId,disposition==MigrationWriteDisposition.Updated?"MigrationArticleUpdated":"MigrationArticleImported","Article",article.ArticleId,article.ArticleId,operationId);
        await SaveAsync(ct);await tx.CommitAsync(ct);return new(article.ArticleId,disposition,draft.DraftId,versionId);
    }

    private static bool Reattribute(Article article,Guid authorId)
    {
        var changed=article.AuthorIdFk!=authorId;
        article.AuthorIdFk=authorId;
        if(article.CurrentDraftIdFkNavigation is { } draft)
        {
            changed|=draft.CreatedByFk!=authorId||draft.UpdatedByFk!=authorId;
            draft.CreatedByFk=authorId;draft.UpdatedByFk=authorId;
        }
        return changed;
    }

    private async Task SynchronizeReferencesAsync(IEnumerable<Guid> ids,Guid articleId,string type,Guid entityId,CancellationToken ct){var desired=ids.ToHashSet();var existing=await db.MediaReferences.Where(x=>x.ReferenceEntityType==type&&x.ReferenceEntityId==entityId).ToListAsync(ct);db.MediaReferences.RemoveRange(existing.Where(x=>!desired.Contains(x.MediaIdFk)));var current=existing.Select(x=>x.MediaIdFk).ToHashSet();foreach(var id in desired.Where(id=>!current.Contains(id)))db.MediaReferences.Add(new(){ReferenceId=NewId(),MediaIdFk=id,ArticleIdFk=articleId,ReferenceEntityType=type,ReferenceEntityId=entityId});}
    private void AddAudit(Guid actor,string action,string type,Guid? entityId,Guid? articleId,Guid operationId)=>db.ArticleAuditLogs.Add(new(){AuditLogId=NewId(),ActorIdFk=actor,ArticleIdFk=articleId,ActionType=action,EntityType=type,EntityId=entityId,MetaDataJson=JsonSerializer.Serialize(new{migrationOperationId=operationId,sourceSystem="HelpJuice"}),CreatedAt=timeProvider.GetUtcNow().UtcDateTime});
    private async Task<string> BuildCategoryPath(Guid? parent,Guid id,CancellationToken ct){if(parent is null)return $"/{id:N}/";var path=await db.Categories.Where(x=>x.CategoryId==parent).Select(x=>x.Path).SingleOrDefaultAsync(ct)??throw new ConflictException("Imported category parent is unavailable.");return $"{path}{id:N}/";}
    private async Task<string> AllocateCategorySlugAsync(string source,CancellationToken ct){var stem=source.Length==0?"category":source;for(var n=1;n<100000;n++){var suffix=n==1?"":$"-{n}";var candidate=stem[..Math.Min(stem.Length,250-suffix.Length)].TrimEnd('-')+suffix;if(!await db.Categories.AnyAsync(x=>x.Slug==candidate,ct))return candidate;}throw new ConflictException("A unique category slug could not be allocated.");}
    private async Task<string> AllocateArticleSlugAsync(string source,string externalId,CancellationToken ct){var stem=source.Length==0?"article":source;if(!await db.Articles.AnyAsync(x=>x.Slug==stem&&x.DeletedAt==null,ct))return stem;var repaired=HelpJuiceSourceParser.AppendExternalId(stem,externalId,350);if(!await db.Articles.AnyAsync(x=>x.Slug==repaired&&x.DeletedAt==null,ct))return repaired;for(var n=2;n<100000;n++){var suffix=$"-{n}";var candidate=repaired[..Math.Min(repaired.Length,350-suffix.Length)].TrimEnd('-')+suffix;if(!await db.Articles.AnyAsync(x=>x.Slug==candidate&&x.DeletedAt==null,ct))return candidate;}throw new ConflictException("A unique article slug could not be allocated.");}
    private async Task SaveAsync(CancellationToken ct){await db.SaveChangesAsync(ct);db.ChangeTracker.Clear();}
    private void Touch(ArticleDraft draft){if(!db.Database.IsSqlServer())draft.RowVersion=Guid.NewGuid().ToByteArray();}
    private Guid NewId()=>db.Database.IsSqlServer()?Guid.Empty:Guid.NewGuid();private static string Normalize(string value,int max){var v=value.Trim();return v[..Math.Min(v.Length,max)];}
    private static string DraftStatus(string articleStatus)=>articleStatus==ArticleStatuses.Published?ArticleStatuses.Approved:articleStatus;
    private Task<MigrationExternalMapping?> FindMappingAsync(string type,string externalId,CancellationToken ct)=>db.MigrationExternalMappings.SingleOrDefaultAsync(x=>x.SourceSystem=="HelpJuice"&&x.ExternalEntityType==type&&x.ExternalId==externalId,ct);
    private void AddMapping(string type,string externalId,Guid internalId,string? hash,object metadata)=>db.MigrationExternalMappings.Add(new(){MappingId=Guid.NewGuid(),SourceSystem="HelpJuice",ExternalEntityType=type,ExternalId=externalId,InternalId=internalId,ContentHash=hash,MetadataJson=JsonSerializer.Serialize(metadata),CreatedAt=timeProvider.GetUtcNow().UtcDateTime,UpdatedAt=timeProvider.GetUtcNow().UtcDateTime});
}
