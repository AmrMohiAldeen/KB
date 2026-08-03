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
        var published=await f.Writer.WriteArticleAsync(f.JobId,Article("published",true,f.UserId),MigrationConflictBehaviors.Skip,default);
        var draft=await f.Writer.WriteArticleAsync(f.JobId,Article("draft",false,f.UserId),MigrationConflictBehaviors.Skip,default);
        f.Context.ChangeTracker.Clear();
        Assert.Equal(ArticleStatuses.Published,(await f.Context.Articles.SingleAsync(x=>x.ArticleId==published.InternalId)).Status);
        Assert.Equal(ArticleStatuses.Draft,(await f.Context.Articles.SingleAsync(x=>x.ArticleId==draft.InternalId)).Status);
        var version=Assert.Single(await f.Context.ArticleVersions.ToListAsync());Assert.Equal(published.VersionId,version.VersionId);Assert.Equal(ArticleSnapshotReasons.Published,version.SnapshotReason);
        var search=Assert.Single(await f.Context.SearchIndexJobs.ToListAsync());Assert.Equal(published.InternalId,search.ArticleIdFk);Assert.Equal(JobStatuses.Pending,search.Status);
    }

    [Fact]
    public async Task Retry_uses_external_mapping_and_does_not_duplicate_article_version_or_search_job()
    {
        await using var f=await Fixture.CreateAsync();var first=await f.Writer.WriteArticleAsync(f.JobId,Article("same",true,f.UserId),MigrationConflictBehaviors.CreateCopy,default);
        var retry=await f.Writer.WriteArticleAsync(f.JobId,Article("same",true,f.UserId),MigrationConflictBehaviors.CreateCopy,default);
        Assert.Equal(MigrationWriteDisposition.Skipped,retry.Disposition);Assert.Equal(first.InternalId,retry.InternalId);Assert.Equal(1,await f.Context.Articles.CountAsync());Assert.Equal(1,await f.Context.ArticleVersions.CountAsync());Assert.Equal(1,await f.Context.SearchIndexJobs.CountAsync());
    }

    [Fact]
    public async Task Create_copy_allocates_a_unique_destination_slug_on_conflict()
    {
        await using var f=await Fixture.CreateAsync();
        _=await f.Writer.WriteArticleAsync(f.JobId,Article("first",false,f.UserId) with { Slug="same" },MigrationConflictBehaviors.CreateCopy,default);
        _=await f.Writer.WriteArticleAsync(f.JobId,Article("second",false,f.UserId) with { Slug="same" },MigrationConflictBehaviors.CreateCopy,default);
        Assert.Equal(["same","same-2"],await f.Context.Articles.OrderBy(x=>x.Slug).Select(x=>x.Slug).ToArrayAsync());
    }

    [Fact]
    public async Task One_failed_article_does_not_prevent_a_later_valid_article()
    {
        await using var f=await Fixture.CreateAsync();var invalid=Article("bad",false,f.UserId) with { CategoryId=Guid.NewGuid() };
        await Assert.ThrowsAnyAsync<Exception>(()=>f.Writer.WriteArticleAsync(f.JobId,invalid,MigrationConflictBehaviors.Skip,default));
        f.Context.ChangeTracker.Clear();var valid=await f.Writer.WriteArticleAsync(f.JobId,Article("good",false,f.UserId),MigrationConflictBehaviors.Skip,default);
        Assert.NotEqual(Guid.Empty,valid.InternalId);Assert.Single(await f.Context.Articles.ToListAsync());
    }

    [Fact]
    public async Task Cancellation_request_is_persisted_and_observable()
    {
        await using var f=await Fixture.CreateAsync();await f.Jobs.RequestCancellationAsync(f.JobId,default);Assert.True(await f.Jobs.IsCancellationRequestedAsync(f.JobId,default));
    }

    private static ImportedArticleData Article(string id,bool published,Guid user)=>new(id,$"answer-{id}",id,id,null,null,user,published,DateTime.UtcNow.AddDays(-1),DateTime.UtcNow,new($"draft/{id}.json",$"draft/{id}.html",$"draft/{id}.txt","a".PadLeft(64,'0'),20,[],published?$"version/{id}.json":null,published?$"version/{id}.html":null,published?$"version/{id}.txt":null),new Dictionary<string,string>());

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;public KbDbContext Context{get;}public HelpJuiceImportWriter Writer{get;}public HelpJuiceMigrationRepository Jobs{get;}public Guid UserId{get;}public Guid JobId{get;}
        private Fixture(SqliteConnection c,KbDbContext db,HelpJuiceImportWriter writer,HelpJuiceMigrationRepository jobs,Guid user,Guid job){connection=c;Context=db;Writer=writer;Jobs=jobs;UserId=user;JobId=job;}
        public static async Task<Fixture>CreateAsync(){var c=new SqliteConnection("Data Source=:memory:");await c.OpenAsync();var db=new KbDbContext(new DbContextOptionsBuilder<KbDbContext>().UseSqlite(c).Options);await db.Database.EnsureCreatedAsync();var user=Guid.NewGuid();var job=Guid.NewGuid();db.Users.Add(new(){UserId=user,Email=$"{user:N}@test.local",FullName="Admin",IsActive=true,CreatedAt=DateTime.UtcNow});db.MigrationJobs.Add(new(){Id=job,Type="HelpJuice",Status=MigrationJobStatuses.Running,OriginalFileName="test.zip",PackageStoragePath="test/package.zip",RequestedByUserId=user,RequestedAt=DateTime.UtcNow,CurrentPhase="test",OptionsJson=new HelpJuiceMigrationOptions().ToJson(),RowVersion=Guid.NewGuid().ToByteArray()});await db.SaveChangesAsync();return new(c,db,new(db,TimeProvider.System),new(db,TimeProvider.System),user,job);}
        public async ValueTask DisposeAsync(){await Context.DisposeAsync();await connection.DisposeAsync();}
    }
}
