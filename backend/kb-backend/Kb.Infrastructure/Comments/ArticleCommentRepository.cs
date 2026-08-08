using System.Data;
using System.Text.Json;
using Kb.Application.Comments;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Comments;

public sealed class ArticleCommentRepository(KbDbContext dbContext) : IArticleCommentRepository
{
    public Task<ArticleCommentContextData?> GetArticleContextAsync(
        Guid articleId,
        CancellationToken cancellationToken) =>
        dbContext.Articles.AsNoTracking()
            .Where(article =>
                article.ArticleId == articleId &&
                article.DeletedAt == null &&
                article.Status != ArticleStatuses.Deleted &&
                article.Status != ArticleStatuses.Archived)
            .Select(article => new ArticleCommentContextData(article.ArticleId, article.CurrentDraftIdFk))
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<ArticleCommentData>> ListAsync(
        Guid articleId,
        CancellationToken cancellationToken)
    {
        var rows = await Query()
            .Where(comment => comment.ArticleIdFk == articleId)
            .OrderBy(comment => comment.CreatedAt)
            .ThenBy(comment => comment.CommentId)
            .ToListAsync(cancellationToken);
        return rows.Select(Map).ToArray();
    }

    public async Task<ArticleCommentData?> GetAsync(
        Guid articleId,
        Guid commentId,
        CancellationToken cancellationToken)
    {
        var value = await Query()
            .SingleOrDefaultAsync(comment =>
                comment.ArticleIdFk == articleId && comment.CommentId == commentId,
                cancellationToken);
        return value is null ? null : Map(value);
    }

    public async Task<ArticleCommentData> InsertAsync(
        NewArticleCommentData comment,
        CommentAuditData audit,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);
        try
        {
            var entity = new ArticleComment
            {
                CommentId = NewId(),
                ArticleIdFk = comment.ArticleId,
                ParentCommentIdFk = comment.ParentCommentId,
                Body = comment.Body,
                CurrentDraftIdFk = comment.CurrentDraftId,
                OriginDraftIdFk = comment.OriginDraftId,
                AnchorType = comment.AnchorType,
                AnchorDataJson = comment.AnchorDataJson,
                AnchorStatus = comment.AnchorStatus,
                Status = comment.Status,
                CreatedByFk = comment.CreatedById,
                CreatedAt = comment.CreatedAt,
                UpdatedAt = comment.CreatedAt,
                RowVersion = NewRowVersion()
            };
            dbContext.ArticleComments.Add(entity);
            AddAudit(comment.ArticleId, entity.CommentId, audit);
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            dbContext.ChangeTracker.Clear();
            return await GetAsync(comment.ArticleId, entity.CommentId, cancellationToken)
                   ?? throw new ConcurrencyConflictException("The created comment could not be read back.");
        }
        catch
        {
            await RollbackAsync(transaction);
            dbContext.ChangeTracker.Clear();
            throw;
        }
    }

    public Task<ArticleCommentData> UpdateBodyAsync(
        Guid articleId,
        Guid commentId,
        string body,
        byte[] rowVersion,
        DateTime updatedAt,
        CommentAuditData audit,
        CancellationToken cancellationToken) =>
        MutateAsync(articleId, commentId, rowVersion, audit, query =>
            dbContext.Database.IsSqlServer()
                ? query.ExecuteUpdateAsync(setters => setters
                    .SetProperty(comment => comment.Body, body)
                    .SetProperty(comment => comment.UpdatedAt, updatedAt), cancellationToken)
                : query.ExecuteUpdateAsync(setters => setters
                    .SetProperty(comment => comment.Body, body)
                    .SetProperty(comment => comment.UpdatedAt, updatedAt)
                    .SetProperty(comment => comment.RowVersion, Guid.NewGuid().ToByteArray()),
                    cancellationToken), cancellationToken);

    public async Task SoftDeleteAsync(
        Guid articleId,
        Guid commentId,
        byte[] rowVersion,
        DateTime deletedAt,
        CommentAuditData audit,
        CancellationToken cancellationToken)
    {
        await MutateAsync(articleId, commentId, rowVersion, audit, query =>
            dbContext.Database.IsSqlServer()
                ? query.ExecuteUpdateAsync(setters => setters
                    .SetProperty(comment => comment.DeletedAt, deletedAt)
                    .SetProperty(comment => comment.UpdatedAt, deletedAt), cancellationToken)
                : query.ExecuteUpdateAsync(setters => setters
                    .SetProperty(comment => comment.DeletedAt, deletedAt)
                    .SetProperty(comment => comment.UpdatedAt, deletedAt)
                    .SetProperty(comment => comment.RowVersion, Guid.NewGuid().ToByteArray()),
                    cancellationToken), cancellationToken);
    }

    public Task<ArticleCommentData> SetResolvedAsync(
        Guid articleId,
        Guid commentId,
        bool resolved,
        Guid actorId,
        byte[] rowVersion,
        DateTime updatedAt,
        CommentAuditData audit,
        CancellationToken cancellationToken)
    {
        var status = resolved ? CommentThreadStatuses.Resolved : CommentThreadStatuses.Open;
        var resolvedBy = resolved ? actorId : (Guid?)null;
        var resolvedAt = resolved ? updatedAt : (DateTime?)null;
        return MutateAsync(articleId, commentId, rowVersion, audit, query =>
            dbContext.Database.IsSqlServer()
                ? query.ExecuteUpdateAsync(setters => setters
                    .SetProperty(comment => comment.Status, status)
                    .SetProperty(comment => comment.ResolvedByFk, resolvedBy)
                    .SetProperty(comment => comment.ResolvedAt, resolvedAt)
                    .SetProperty(comment => comment.UpdatedAt, updatedAt), cancellationToken)
                : query.ExecuteUpdateAsync(setters => setters
                    .SetProperty(comment => comment.Status, status)
                    .SetProperty(comment => comment.ResolvedByFk, resolvedBy)
                    .SetProperty(comment => comment.ResolvedAt, resolvedAt)
                    .SetProperty(comment => comment.UpdatedAt, updatedAt)
                    .SetProperty(comment => comment.RowVersion, Guid.NewGuid().ToByteArray()),
                    cancellationToken), cancellationToken);
    }

    public async Task<IReadOnlyList<CommentAnchorSource>> ListAttachedAnchorsAsync(
        Guid articleId,
        Guid draftId,
        CancellationToken cancellationToken) =>
        await dbContext.ArticleComments.AsNoTracking()
            .Where(comment =>
                comment.ArticleIdFk == articleId &&
                comment.ParentCommentIdFk == null &&
                comment.DeletedAt == null &&
                comment.Status == CommentThreadStatuses.Open &&
                comment.CurrentDraftIdFk == draftId &&
                comment.AnchorType != null &&
                comment.AnchorDataJson != null)
            .OrderBy(comment => comment.CreatedAt)
            .Select(comment => new CommentAnchorSource(
                comment.CommentId,
                comment.CurrentDraftIdFk!.Value,
                comment.AnchorType!,
                comment.AnchorDataJson!,
                comment.AnchorStatus))
            .ToListAsync(cancellationToken);

    public async Task ApplyAnchorUpdatesAsync(
        Guid articleId,
        Guid actorId,
        IReadOnlyList<CommentAnchorUpdate> updates,
        DateTime updatedAt,
        CancellationToken cancellationToken)
    {
        if (updates.Count == 0) return;
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);
        try
        {
            foreach (var update in updates)
            {
                var query = dbContext.ArticleComments.Where(comment =>
                    comment.ArticleIdFk == articleId &&
                    comment.CommentId == update.CommentId &&
                    comment.DeletedAt == null &&
                    comment.Status == CommentThreadStatuses.Open);
                var changed = dbContext.Database.IsSqlServer()
                    ? await query.ExecuteUpdateAsync(setters => setters
                        .SetProperty(comment => comment.CurrentDraftIdFk, update.DraftId)
                        .SetProperty(comment => comment.AnchorDataJson, update.AnchorDataJson)
                        .SetProperty(comment => comment.AnchorStatus, update.AnchorStatus)
                        .SetProperty(comment => comment.UpdatedAt, updatedAt), cancellationToken)
                    : await query.ExecuteUpdateAsync(setters => setters
                        .SetProperty(comment => comment.CurrentDraftIdFk, update.DraftId)
                        .SetProperty(comment => comment.AnchorDataJson, update.AnchorDataJson)
                        .SetProperty(comment => comment.AnchorStatus, update.AnchorStatus)
                        .SetProperty(comment => comment.UpdatedAt, updatedAt)
                        .SetProperty(comment => comment.RowVersion, Guid.NewGuid().ToByteArray()),
                        cancellationToken);
                if (changed == 1 && update.PreviousAnchorStatus != update.AnchorStatus)
                    AddAudit(articleId, update.CommentId, new(
                        actorId,
                        ArticleAuditActions.CommentAnchorChanged,
                        JsonSerializer.Serialize(new
                        {
                            articleId,
                            commentId = update.CommentId,
                            draftId = update.DraftId,
                            from = update.PreviousAnchorStatus,
                            to = update.AnchorStatus
                        }),
                        updatedAt));
            }
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            dbContext.ChangeTracker.Clear();
        }
        catch
        {
            await RollbackAsync(transaction);
            dbContext.ChangeTracker.Clear();
            throw;
        }
    }

    public Task<bool> HasUnresolvedDraftDependenciesAsync(
        Guid draftId,
        CancellationToken cancellationToken) =>
        dbContext.ArticleComments.AsNoTracking().AnyAsync(comment =>
            comment.ParentCommentIdFk == null &&
            comment.DeletedAt == null &&
            comment.Status == CommentThreadStatuses.Open &&
            (comment.CurrentDraftIdFk == draftId || comment.OriginDraftIdFk == draftId),
            cancellationToken);

    private async Task<ArticleCommentData> MutateAsync(
        Guid articleId,
        Guid commentId,
        byte[] rowVersion,
        CommentAuditData audit,
        Func<IQueryable<ArticleComment>, Task<int>> update,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);
        try
        {
            var query = dbContext.ArticleComments.Where(comment =>
                comment.ArticleIdFk == articleId &&
                comment.CommentId == commentId &&
                comment.RowVersion == rowVersion);
            if (await update(query) != 1)
                throw new ConcurrencyConflictException();
            AddAudit(articleId, commentId, audit);
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            dbContext.ChangeTracker.Clear();
            return await GetAsync(articleId, commentId, cancellationToken)
                   ?? throw new ConcurrencyConflictException("The changed comment could not be read back.");
        }
        catch (DbUpdateConcurrencyException)
        {
            await RollbackAsync(transaction);
            dbContext.ChangeTracker.Clear();
            throw new ConcurrencyConflictException();
        }
        catch
        {
            await RollbackAsync(transaction);
            dbContext.ChangeTracker.Clear();
            throw;
        }
    }

    private IQueryable<ArticleComment> Query() => dbContext.ArticleComments.AsNoTracking()
        .Include(comment => comment.CreatedByFkNavigation)
        .Include(comment => comment.ResolvedByFkNavigation);

    private static ArticleCommentData Map(ArticleComment comment)
    {
        JsonElement? anchor = null;
        if (!string.IsNullOrWhiteSpace(comment.AnchorDataJson))
        {
            using var document = JsonDocument.Parse(comment.AnchorDataJson);
            anchor = document.RootElement.Clone();
        }
        return new(
            comment.CommentId,
            comment.ArticleIdFk,
            comment.ParentCommentIdFk,
            comment.Body,
            comment.CurrentDraftIdFk,
            comment.OriginDraftIdFk,
            comment.AnchorType,
            anchor,
            comment.AnchorStatus,
            comment.Status,
            new(comment.CreatedByFkNavigation.UserId, comment.CreatedByFkNavigation.FullName),
            comment.CreatedAt,
            comment.UpdatedAt,
            comment.ResolvedByFkNavigation is null
                ? null
                : new(comment.ResolvedByFkNavigation.UserId, comment.ResolvedByFkNavigation.FullName),
            comment.ResolvedAt,
            comment.DeletedAt,
            comment.RowVersion);
    }

    private void AddAudit(Guid articleId, Guid commentId, CommentAuditData audit) =>
        dbContext.ArticleAuditLogs.Add(new ArticleAuditLog
        {
            AuditLogId = NewId(),
            ArticleIdFk = articleId,
            ActorIdFk = audit.ActorId,
            ActionType = audit.Action,
            EntityType = ArticleAuditEntityTypes.Comment,
            EntityId = commentId,
            MetaDataJson = audit.MetadataJson,
            CreatedAt = audit.CreatedAt
        });

    private Guid NewId() => dbContext.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid();
    private byte[] NewRowVersion() => dbContext.Database.IsSqlServer() ? [] : Guid.NewGuid().ToByteArray();

    private static async Task RollbackAsync(Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction)
    {
        try
        {
            await transaction.RollbackAsync(CancellationToken.None);
        }
        catch
        {
            // Preserve the mutation error.
        }
    }
}
