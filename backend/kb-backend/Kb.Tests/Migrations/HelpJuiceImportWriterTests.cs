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
    public async Task Published_and_unpublished_imports_follow_lifecycle_and_queue_only_published_search()
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
        var search=Assert.Single(await f.Context.SearchIndexJobs.ToListAsync());Assert.Equal(published.InternalId,search.ArticleIdFk);Assert.Equal(JobStatuses.Pending,search.Status);
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
    public async Task Archived_published_source_keeps_version_but_is_not_searchable()
    {
        await using var f=await Fixture.CreateAsync();
        var archived=Article("archived",true,f.UserId) with { Status=ArticleStatuses.Archived };
        var result=await f.Writer.WriteArticleAsync(f.OperationId,archived,MigrationConflictBehaviors.Skip,default);
        Assert.Equal(ArticleStatuses.Archived,(await f.Context.Articles.SingleAsync(x=>x.ArticleId==result.InternalId)).Status);
        Assert.Single(await f.Context.ArticleVersions.ToListAsync());
        Assert.Empty(await f.Context.SearchIndexJobs.ToListAsync());
    }

    [Fact]
    public async Task External_mapping_makes_retry_idempotent_even_when_requested_slug_changes()
    {
        await using var f=await Fixture.CreateAsync();
        var first=await f.Writer.WriteArticleAsync(f.OperationId,Article("external-1",true,f.UserId) with { Slug="original" },MigrationConflictBehaviors.Skip,default);
        var retry=await f.Writer.WriteArticleAsync(Guid.NewGuid(),Article("external-1",true,f.UserId) with { Slug="different-after-preview" },MigrationConflictBehaviors.CreateCopy,default);
        Assert.Equal(first.InternalId,retry.InternalId);Assert.Equal(MigrationWriteDisposition.Skipped,retry.Disposition);
        Assert.Single(await f.Context.Articles.ToListAsync());Assert.Single(await f.Context.MigrationExternalMappings.Where(x=>x.ExternalEntityType=="Article").ToListAsync());
    }

    private static ImportedArticleData Article(string id,bool published,Guid user)=>new(id,id,id,null,null,user,published?ArticleStatuses.Published:ArticleStatuses.Draft,published,DateTime.UtcNow.AddDays(-1),DateTime.UtcNow,null,new($"draft/{id}.json",$"draft/{id}.html",$"draft/{id}.txt","a".PadLeft(64,'0'),20,[],published?$"version/{id}.json":null,published?$"version/{id}.html":null,published?$"version/{id}.txt":null));

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;public KbDbContext Context{get;}public HelpJuiceImportWriter Writer{get;}public Guid UserId{get;}public Guid OperationId{get;}
        private Fixture(SqliteConnection c,KbDbContext db,HelpJuiceImportWriter writer,Guid user,Guid operationId){connection=c;Context=db;Writer=writer;UserId=user;OperationId=operationId;}
        public static async Task<Fixture>CreateAsync(){var c=new SqliteConnection("Data Source=:memory:");await c.OpenAsync();var db=new KbDbContext(new DbContextOptionsBuilder<KbDbContext>().UseSqlite(c).Options);await db.Database.EnsureCreatedAsync();var user=Guid.NewGuid();db.Users.Add(new(){UserId=user,Email=$"{user:N}@test.local",FullName="Admin",IsActive=true,CreatedAt=DateTime.UtcNow});await db.SaveChangesAsync();return new(c,db,new(db,TimeProvider.System),user,Guid.NewGuid());}
        public async ValueTask DisposeAsync(){await Context.DisposeAsync();await connection.DisposeAsync();}
    }
}
