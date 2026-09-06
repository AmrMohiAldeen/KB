using Kb.Application.Migrations.HelpJuice;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Kb.Infrastructure.Migrations.HelpJuice;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Kb.Tests.Migrations;

public sealed class HelpJuiceImportWriterTests
{
    [Fact]
    public async Task Published_and_unpublished_imports_both_queue_internal_search()
    {
        await using var f=await Fixture.CreateAsync();
        var published=await f.Writer.WriteArticleAsync(f.OperationId,Article("published",true,f.UserId),MigrationConflictBehaviors.Skip,default);
        var draft=await f.Writer.WriteArticleAsync(f.OperationId,Article("draft",false,f.UserId),MigrationConflictBehaviors.Skip,default);
        f.Context.ChangeTracker.Clear();
        Assert.Equal(ArticleStatuses.Published,(await f.Context.Articles.SingleAsync(x=>x.ArticleId==published.InternalId)).Status);
        Assert.Equal(ArticleStatuses.Draft,(await f.Context.Articles.SingleAsync(x=>x.ArticleId==draft.InternalId)).Status);
        Assert.Equal(ArticleStatuses.Approved,(await f.Context.ArticleDrafts.SingleAsync(x=>x.ArticleIdFk==published.InternalId)).Status);
        Assert.Equal(ArticleStatuses.Draft,(await f.Context.ArticleDrafts.SingleAsync(x=>x.ArticleIdFk==draft.InternalId)).Status);
        var version=Assert.Single(await f.Context.ArticleVersions.ToListAsync());Assert.Equal(published.VersionId,version.VersionId);Assert.Equal(ArticleSnapshotReasons.Published,version.SnapshotReason);
        var search=await f.Context.SearchIndexJobs.OrderBy(x=>x.ArticleIdFk).ToListAsync();Assert.Equal(2,search.Count);Assert.All(search,job=>{Assert.Equal(JobStatuses.Pending,job.Status);Assert.Equal(SearchIndexScopes.Internal,job.IndexScope);});
    }

    [Fact]
    public async Task Retry_with_skip_conflict_behavior_does_not_duplicate_article_version_or_search_job()
    {
        await using var f=await Fixture.CreateAsync();var first=await f.Writer.WriteArticleAsync(f.OperationId,Article("same",true,f.UserId),MigrationConflictBehaviors.Skip,default);
        var retry=await f.Writer.WriteArticleAsync(f.OperationId,Article("same",true,f.UserId),MigrationConflictBehaviors.Skip,default);
        Assert.Equal(MigrationWriteDisposition.Skipped,retry.Disposition);Assert.Equal(first.InternalId,retry.InternalId);Assert.Equal(1,await f.Context.Articles.CountAsync());Assert.Equal(1,await f.Context.ArticleVersions.CountAsync());Assert.Equal(1,await f.Context.SearchIndexJobs.CountAsync());
    }

    [Fact]
    public async Task Create_copy_allocates_a_unique_destination_slug_on_conflict()
    {
        await using var f=await Fixture.CreateAsync();
        _=await f.Writer.WriteArticleAsync(f.OperationId,Article("first",false,f.UserId) with { Slug="same" },MigrationConflictBehaviors.CreateCopy,default);
        _=await f.Writer.WriteArticleAsync(f.OperationId,Article("second",false,f.UserId) with { Slug="same" },MigrationConflictBehaviors.CreateCopy,default);
        Assert.Equal(["same","same-second"],await f.Context.Articles.OrderBy(x=>x.Slug).Select(x=>x.Slug).ToArrayAsync());
    }

    [Fact]
    public async Task One_failed_article_does_not_prevent_a_later_valid_article()
    {
        await using var f=await Fixture.CreateAsync();var invalid=Article("bad",false,f.UserId) with { CategoryId=Guid.NewGuid() };
        await Assert.ThrowsAnyAsync<Exception>(()=>f.Writer.WriteArticleAsync(f.OperationId,invalid,MigrationConflictBehaviors.Skip,default));
        f.Context.ChangeTracker.Clear();var valid=await f.Writer.WriteArticleAsync(f.OperationId,Article("good",false,f.UserId),MigrationConflictBehaviors.Skip,default);
        Assert.NotEqual(Guid.Empty,valid.InternalId);Assert.Single(await f.Context.Articles.ToListAsync());
    }

    [Fact]
    public async Task A_cancelled_request_token_stops_the_next_write()
    {
        await using var f=await Fixture.CreateAsync();using var cancellation=new CancellationTokenSource();cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>f.Writer.WriteArticleAsync(f.OperationId,Article("cancelled",false,f.UserId),MigrationConflictBehaviors.Skip,cancellation.Token));
    }

    [Fact]
    public async Task Archived_published_source_keeps_version_and_is_internally_searchable()
    {
        await using var f=await Fixture.CreateAsync();
        var archived=Article("archived",true,f.UserId) with { Status=ArticleStatuses.Archived };
        var result=await f.Writer.WriteArticleAsync(f.OperationId,archived,MigrationConflictBehaviors.Skip,default);
        Assert.Equal(ArticleStatuses.Archived,(await f.Context.Articles.SingleAsync(x=>x.ArticleId==result.InternalId)).Status);
        Assert.Single(await f.Context.ArticleVersions.ToListAsync());
        var job=Assert.Single(await f.Context.SearchIndexJobs.ToListAsync());
        Assert.Equal(SearchIndexJobTypes.Upsert,job.JobType);
    }

    [Fact]
    public async Task External_mapping_makes_retry_idempotent_even_when_requested_slug_changes()
    {
        await using var f=await Fixture.CreateAsync();
        var first=await f.Writer.WriteArticleAsync(f.OperationId,Article("external-1",true,f.UserId) with { Slug="original" },MigrationConflictBehaviors.Skip,default);
        Assert.Equal("original",(await f.Writer.GetMappedArticleSlugsAsync(default))["external-1"]);
        var retry=await f.Writer.WriteArticleAsync(Guid.NewGuid(),Article("external-1",true,f.UserId) with { Slug="different-after-preview" },MigrationConflictBehaviors.CreateCopy,default);
        Assert.Equal(first.InternalId,retry.InternalId);Assert.Equal(MigrationWriteDisposition.Skipped,retry.Disposition);
        Assert.Single(await f.Context.Articles.ToListAsync());Assert.Single(await f.Context.MigrationExternalMappings.Where(x=>x.ExternalEntityType=="Article").ToListAsync());
    }

    [Fact]
    public async Task HelpJuice_author_mapping_is_case_insensitive()
    {
        await using var f=await Fixture.CreateAsync();
        var authorId=await f.AddUserAsync("Source Author","HJ-42");

        var mappings=await f.Writer.ResolveHelpJuiceAuthorsAsync(["hj-42","missing"],default);

        var mapping=Assert.Single(mappings);
        Assert.Equal("HJ-42",mapping.Key);
        Assert.Equal(authorId,mapping.Value.UserId);
        Assert.Equal("Source Author",mapping.Value.Name);
    }

    [Fact]
    public async Task Source_author_owns_article_and_content_while_migration_actor_owns_audit()
    {
        await using var f=await Fixture.CreateAsync();
        var authorId=await f.AddUserAsync("Source Author","author-1");
        var source=Article("attributed",true,f.UserId) with { AuthorId=authorId, Visibility="Internal" };

        var result=await f.Writer.WriteArticleAsync(f.OperationId,source,MigrationConflictBehaviors.Skip,default);

        f.Context.ChangeTracker.Clear();
        var article=await f.Context.Articles.SingleAsync(x=>x.ArticleId==result.InternalId);
        var draft=await f.Context.ArticleDrafts.SingleAsync(x=>x.ArticleIdFk==result.InternalId);
        var version=await f.Context.ArticleVersions.SingleAsync(x=>x.ArticleIdFk==result.InternalId);
        Assert.Equal(authorId,article.AuthorIdFk);Assert.Equal("Internal",article.Visibility);
        Assert.Equal(authorId,draft.CreatedByFk);Assert.Equal(authorId,draft.UpdatedByFk);
        Assert.Equal(authorId,version.CreatedByFk);Assert.Equal(authorId,version.PublishedByFk);
        Assert.All(await f.Context.ArticleAuditLogs.Where(x=>x.ArticleIdFk==result.InternalId).ToListAsync(),
            audit=>Assert.Equal(f.UserId,audit.ActorIdFk));
    }

    [Fact]
    public async Task Update_changes_article_owner_and_draft_attribution()
    {
        await using var f=await Fixture.CreateAsync();
        var authorId=await f.AddUserAsync("Replacement Author","author-2");
        var original=Article("owner-update",false,f.UserId);
        var first=await f.Writer.WriteArticleAsync(f.OperationId,original,MigrationConflictBehaviors.Skip,default);

        _=await f.Writer.WriteArticleAsync(Guid.NewGuid(),original with { AuthorId=authorId },
            MigrationConflictBehaviors.UpdateExisting,default);

        f.Context.ChangeTracker.Clear();
        var article=await f.Context.Articles.SingleAsync(x=>x.ArticleId==first.InternalId);
        var draft=await f.Context.ArticleDrafts.SingleAsync(x=>x.ArticleIdFk==first.InternalId);
        Assert.Equal(authorId,article.AuthorIdFk);
        Assert.Equal(authorId,draft.CreatedByFk);
        Assert.Equal(authorId,draft.UpdatedByFk);
    }

    [Fact]
    public async Task Skip_retry_reconciles_an_author_that_resolves_after_users_migration()
    {
        await using var f=await Fixture.CreateAsync();
        var original=Article("late-author",true,f.UserId) with { AuthorResolved=false };
        var first=await f.Writer.WriteArticleAsync(f.OperationId,original,MigrationConflictBehaviors.Skip,default);
        var authorId=await f.AddUserAsync("Late Author","late-author-id");

        var retry=await f.Writer.WriteArticleAsync(Guid.NewGuid(),
            original with { AuthorId=authorId,AuthorResolved=true },MigrationConflictBehaviors.Skip,default);

        Assert.Equal(MigrationWriteDisposition.Updated,retry.Disposition);
        f.Context.ChangeTracker.Clear();
        Assert.Equal(authorId,(await f.Context.Articles.SingleAsync(x=>x.ArticleId==first.InternalId)).AuthorIdFk);
        Assert.Equal(authorId,(await f.Context.ArticleDrafts.SingleAsync(x=>x.ArticleIdFk==first.InternalId)).CreatedByFk);
    }

    [Fact]
    public async Task Media_with_the_same_sha256_hash_reuses_one_MediaFile_and_records_each_source_mapping()
    {
        await using var f=await Fixture.CreateAsync();
        const string hash="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        ImportedMediaData Media(string externalId,Guid id,string name)=>new(externalId,id,name,$"{id:N}.png","image/png",".png",12,
            $"migration-imports/helpjuice/media/{hash}.png",hash,f.UserId,DateTime.UtcNow);

        var first=await f.Writer.WriteMediaAsync(f.OperationId,Media("url:one",Guid.NewGuid(),"one.png"),default);
        var duplicate=await f.Writer.WriteMediaAsync(f.OperationId,Media("url:two",Guid.NewGuid(),"two.png"),default);

        Assert.Equal(first.InternalId,duplicate.InternalId);
        Assert.Equal(MigrationWriteDisposition.Skipped,duplicate.Disposition);
        Assert.Equal(1,await f.Context.MediaFiles.CountAsync());
        Assert.Equal(2,await f.Context.MigrationExternalMappings.CountAsync(mapping=>mapping.ExternalEntityType=="Media"));
    }

    [Fact]
    public async Task Import_preserves_every_category_and_keeps_the_first_as_legacy_primary()
    {
        await using var f = await Fixture.CreateAsync();
        var firstCategory = Guid.NewGuid();
        var secondCategory = Guid.NewGuid();
        f.Context.Categories.AddRange(
            new Category { CategoryId = firstCategory, Name = "First", Slug = "first", Depth = 0, SortOrder = 0 },
            new Category { CategoryId = secondCategory, Name = "Second", Slug = "second", Depth = 0, SortOrder = 1 });
        await f.Context.SaveChangesAsync();

        var result = await f.Writer.WriteArticleAsync(f.OperationId,
            Article("multiple-categories", false, f.UserId) with
            {
                CategoryId = firstCategory, CategoryIds = [firstCategory, secondCategory]
            }, MigrationConflictBehaviors.Skip, default);

        f.Context.ChangeTracker.Clear();
        Assert.Equal(firstCategory, (await f.Context.Articles.SingleAsync(article =>
            article.ArticleId == result.InternalId)).CategoryIdFk);
        var links = await f.Context.ArticleCategories.Where(link => link.ArticleIdFk == result.InternalId)
            .OrderBy(link => link.SortOrder).ToListAsync();
        Assert.Equal([firstCategory, secondCategory], links.Select(link => link.CategoryIdFk));
        Assert.True(links[0].IsPrimary);
        Assert.False(links[1].IsPrimary);
    }

    [Fact]
    public async Task Explicit_locales_and_translation_group_are_preserved_without_duplicate_content_on_retry()
    {
        await using var f = await Fixture.CreateAsync();
        var group = Guid.NewGuid();
        var english = await f.Writer.WriteArticleAsync(f.OperationId,
            Article("source-en", true, f.UserId) with { LocaleCode = "en", TranslationGroupId = group },
            MigrationConflictBehaviors.Skip, default);
        var arabic = await f.Writer.WriteArticleAsync(f.OperationId,
            Article("source-ar", true, f.UserId) with { LocaleCode = "ar", TranslationGroupId = group },
            MigrationConflictBehaviors.Skip, default);
        var retry = await f.Writer.WriteArticleAsync(Guid.NewGuid(),
            Article("source-ar", true, f.UserId) with { LocaleCode = "ar", TranslationGroupId = group },
            MigrationConflictBehaviors.Skip, default);

        f.Context.ChangeTracker.Clear();
        var articles = await f.Context.Articles.OrderBy(article => article.LocaleCode).ToListAsync();
        Assert.Equal(["ar", "en"], articles.Select(article => article.LocaleCode));
        Assert.All(articles, article => Assert.Equal(group, article.TranslationGroupId));
        Assert.Equal(MigrationWriteDisposition.Skipped, retry.Disposition);
        Assert.Equal(arabic.InternalId, retry.InternalId);
        Assert.Equal(2, await f.Context.ArticleVersions.CountAsync());
        Assert.Equal(1, await f.Context.ArticleTranslationGroups.CountAsync(item => item.TranslationGroupId == group));
        Assert.NotEqual(english.InternalId, arabic.InternalId);
    }

    [Fact]
    public async Task Translated_categories_reuse_the_destination_and_store_localized_metadata()
    {
        await using var f = await Fixture.CreateAsync();
        f.Context.KbLanguages.Add(new KbLanguage { LanguageId = Guid.NewGuid(), LocaleCode = "ar", DisplayName = "Arabic",
            NativeName = "العربية", IsEnabled = true, IsRtl = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
        await f.Context.SaveChangesAsync();

        var english = await f.Writer.WriteCategoryAsync(f.OperationId,
            new("guides-en", "Guides", "guides", null, 0, 0, "Public", "en", "guides-en"),
            MigrationConflictBehaviors.Skip, f.UserId, default);
        var arabic = await f.Writer.WriteCategoryAsync(f.OperationId,
            new("guides-ar", "الإرشادات", "guides-ar", null, 0, 0, "Public", "ar", "guides-en"),
            MigrationConflictBehaviors.Skip, f.UserId, default);

        f.Context.ChangeTracker.Clear();
        Assert.Equal(english.InternalId, arabic.InternalId);
        Assert.Single(await f.Context.Categories.ToListAsync());
        var localization = await f.Context.CategoryLocalizations.SingleAsync(item => item.CategoryId == english.InternalId && item.LocaleCode == "ar");
        Assert.Equal("الإرشادات", localization.Name);
        Assert.Equal(2, await f.Context.MigrationExternalMappings.CountAsync(item => item.ExternalEntityType == "Category"));
    }

    private static ImportedArticleData Article(string id,bool published,Guid actor)=>new(id,id,id,null,null,actor,actor,true,published?ArticleStatuses.Published:ArticleStatuses.Draft,published,DateTime.UtcNow.AddDays(-1),DateTime.UtcNow,null,new($"draft/{id}.json",$"draft/{id}.html",$"draft/{id}.txt","a".PadLeft(64,'0'),20,[],published?$"version/{id}.json":null,published?$"version/{id}.html":null,published?$"version/{id}.txt":null));

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;public KbDbContext Context{get;}public HelpJuiceImportWriter Writer{get;}public Guid UserId{get;}public Guid OperationId{get;}
        private Fixture(SqliteConnection c,KbDbContext db,HelpJuiceImportWriter writer,Guid user,Guid operationId){connection=c;Context=db;Writer=writer;UserId=user;OperationId=operationId;}
        public static async Task<Fixture>CreateAsync(){var c=new SqliteConnection("Data Source=:memory:");await c.OpenAsync();var db=new KbDbContext(new DbContextOptionsBuilder<KbDbContext>().UseSqlite(c).Options);await db.Database.EnsureCreatedAsync();var user=Guid.NewGuid();db.Users.Add(new(){UserId=user,Email=$"{user:N}@test.local",FullName="Admin",IsActive=true,CreatedAt=DateTime.UtcNow});await db.SaveChangesAsync();return new(c,db,new(db,TimeProvider.System),user,Guid.NewGuid());}
        public async Task<Guid>AddUserAsync(string name,string helpJuiceId){var id=Guid.NewGuid();Context.Users.Add(new(){UserId=id,Email=$"{id:N}@test.local",FullName=name,IsActive=true,CreatedAt=DateTime.UtcNow,HelpJuiceUserId=helpJuiceId});await Context.SaveChangesAsync();Context.ChangeTracker.Clear();return id;}
        public async ValueTask DisposeAsync(){await Context.DisposeAsync();await connection.DisposeAsync();}
    }
}
