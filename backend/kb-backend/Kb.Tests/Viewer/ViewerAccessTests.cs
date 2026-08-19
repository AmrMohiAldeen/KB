using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Kb.Api.Authentication;
using Kb.Application.Exceptions;
using Kb.Application.Viewer;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Kb.Infrastructure.Viewer;
using Kb.Infrastructure.Public;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace Kb.Tests.Viewer;

public sealed class ViewerAccessTests
{
    [Fact]
    public async Task External_viewer_can_access_an_authorized_root_and_never_becomes_an_internal_user()
    {
        await using var fixture = await Fixture.CreateAsync();
        var session = await fixture.CreateSessionAsync(["swiftassess"]);

        var portal = await fixture.Repository.GetPortalAsync(session.SessionId, "swiftassess", default);
        Assert.Equal(fixture.SwiftSolutionId, portal.SolutionId);
        Assert.Null(await fixture.Repository.GetArticleAsync(session.SessionId, "swiftassess", string.Empty,
            fixture.SynopsisArticleId, default));
        Assert.Equal(1, await fixture.Context.Users.CountAsync());
        Assert.Empty(await new PublicKnowledgeBaseRepository(fixture.Context).GetArticlesAsync(null, null, default));
        var audit = await fixture.Context.ArticleAuditLogs.SingleAsync(item => item.ActionType == "ViewerSessionCreated");
        Assert.Equal("external-42", audit.ExternalActorId);
        Assert.Equal("viewer@example.test", audit.ExternalActorEmail);
        Assert.Equal(session.SessionId, audit.ViewerSessionId);
    }

    [Fact]
    public async Task External_viewer_changing_the_url_to_an_unauthorized_root_receives_forbidden()
    {
        await using var fixture = await Fixture.CreateAsync();
        var session = await fixture.CreateSessionAsync(["swiftassess"]);

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            fixture.Repository.GetPortalAsync(session.SessionId, "synopsis", default));
    }

    [Fact]
    public async Task Viewer_lists_only_published_public_active_content_in_the_solution_subtree()
    {
        await using var fixture = await Fixture.CreateAsync();
        var session = await fixture.CreateSessionAsync(["swiftassess"]);

        var articles = await fixture.Repository.GetArticlesAsync(session.SessionId, "swiftassess", null, null, default);

        Assert.Equal(["swift-visible"], articles.Select(item => item.Slug));
        Assert.Null(await fixture.Repository.GetArticleAsync(session.SessionId, "swiftassess", "swift-draft", null, default));
        Assert.Null(await fixture.Repository.GetArticleAsync(session.SessionId, "swiftassess", "swift-archived", null, default));
        Assert.Null(await fixture.Repository.GetArticleAsync(session.SessionId, "swiftassess", "swift-internal", null, default));
    }

    [Fact]
    public async Task Multiple_entitlements_work_and_seat_limit_and_handoff_replay_are_enforced()
    {
        await using var fixture = await Fixture.CreateAsync(maxSessions: 1, includeSynopsisEntitlement: true);
        var session = await fixture.CreateSessionAsync(["swiftassess", "synopsis"]);
        Assert.Equal(2, session.Solutions.Count);
        Assert.Equal(fixture.SynopsisSolutionId,
            (await fixture.Repository.GetPortalAsync(session.SessionId, "synopsis", default)).SolutionId);

        await Assert.ThrowsAsync<ConflictException>(() => fixture.CreateSessionAsync(["swiftassess"], "handoff-2"));
        await fixture.Repository.RevokeSessionAsync(session.SessionId, DateTime.UtcNow, "test", default);
        _ = await fixture.CreateSessionAsync(["swiftassess"], "handoff-2");
        await Assert.ThrowsAsync<ConflictException>(() => fixture.CreateSessionAsync(["swiftassess"], "handoff-2"));
    }

    [Fact]
    public void Handoff_validation_rejects_forged_and_expired_tokens()
    {
        var options = new ViewerTokenOptions
        {
            HandoffSigningKey = "correct-secret", HandoffIssuer = "swiftassess",
            HandoffAudience = "knowledgebase-handoff", SessionSigningKey = "session-secret"
        };
        var service = new ViewerTokenService(options);
        Assert.ThrowsAny<SecurityTokenException>(() =>
            service.ValidateHandoff(Handoff("wrong-secret", DateTime.UtcNow.AddMinutes(2)), null, null));
        Assert.Throws<SecurityTokenExpiredException>(() =>
            service.ValidateHandoff(Handoff("correct-secret", DateTime.UtcNow.AddMinutes(-2)), null, null));
    }

    private static string Handoff(string secret, DateTime expires)
    {
        var now = expires <= DateTime.UtcNow ? expires.AddMinutes(-1) : DateTime.UtcNow.AddMinutes(-1);
        var token = new JwtSecurityToken("swiftassess", "knowledgebase-handoff",
            [new(JwtRegisteredClaimNames.Sub, "external-42"), new(JwtRegisteredClaimNames.Email, "viewer@example.test"),
             new(ViewerAuthenticationDefaults.CustomerIdClaim, "customer-a"),
             new(ViewerAuthenticationDefaults.SolutionSlugClaim, "swiftassess"),
             new(JwtRegisteredClaimNames.Iat, new DateTimeOffset(now).ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64),
             new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))], now, expires,
            new SigningCredentials(new SymmetricSecurityKey(System.Security.Cryptography.SHA256.HashData(
                Encoding.UTF8.GetBytes(secret))), SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public KbDbContext Context { get; }
        public ViewerRepository Repository { get; }
        public Guid SwiftSolutionId { get; private init; }
        public Guid SynopsisSolutionId { get; private init; }
        public Guid SynopsisArticleId { get; private init; }

        private Fixture(SqliteConnection connection, KbDbContext context, ViewerRepository repository) =>
            (this.connection, Context, Repository) = (connection, context, repository);

        public static async Task<Fixture> CreateAsync(int maxSessions = 10, bool includeSynopsisEntitlement = false)
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(new DbContextOptionsBuilder<KbDbContext>().UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();
            var now = DateTime.UtcNow;
            var userId = Guid.NewGuid();
            var swiftRoot = Guid.NewGuid();
            var synopsisRoot = Guid.NewGuid();
            var swiftSolution = Guid.NewGuid();
            var synopsisSolution = Guid.NewGuid();
            var customerId = Guid.NewGuid();
            context.Users.Add(new User { UserId = userId, Email = "author@example.test", FullName = "Author", IsActive = true, CreatedAt = now });
            context.Categories.AddRange(
                new Category { CategoryId = swiftRoot, Name = "SwiftAssess", Slug = "swift-root", Path = $"/{swiftRoot:N}/", Status = CategoryStatuses.Active, Visibility = ContentVisibilities.Public },
                new Category { CategoryId = synopsisRoot, Name = "Synopsis", Slug = "synopsis-root", Path = $"/{synopsisRoot:N}/", Status = CategoryStatuses.Active, Visibility = ContentVisibilities.Public });
            context.ViewerSolutions.AddRange(
                new ViewerSolution { SolutionId = swiftSolution, RootCategoryIdFk = swiftRoot, Slug = "swiftassess", IsEnabled = true, CreatedAt = now, UpdatedAt = now },
                new ViewerSolution { SolutionId = synopsisSolution, RootCategoryIdFk = synopsisRoot, Slug = "synopsis", IsEnabled = true, CreatedAt = now, UpdatedAt = now });
            context.ViewerCustomers.Add(new ViewerCustomer { CustomerId = customerId, ExternalCustomerId = "customer-a", MaxConcurrentSessions = maxSessions, IsEnabled = true, CreatedAt = now, UpdatedAt = now });
            context.ViewerEntitlements.Add(new ViewerEntitlement { CustomerIdFk = customerId, SolutionIdFk = swiftSolution, CreatedAt = now });
            if (includeSynopsisEntitlement)
                context.ViewerEntitlements.Add(new ViewerEntitlement { CustomerIdFk = customerId, SolutionIdFk = synopsisSolution, CreatedAt = now });
            await context.SaveChangesAsync();

            await AddArticleAsync(context, userId, swiftRoot, "swift-visible", ArticleStatuses.Published, ContentVisibilities.Public, now);
            await AddArticleAsync(context, userId, swiftRoot, "swift-draft", ArticleStatuses.Draft, ContentVisibilities.Public, now);
            await AddArticleAsync(context, userId, swiftRoot, "swift-archived", ArticleStatuses.Archived, ContentVisibilities.Public, now);
            await AddArticleAsync(context, userId, swiftRoot, "swift-internal", ArticleStatuses.Published, ContentVisibilities.Internal, now);
            var synopsisArticle = await AddArticleAsync(context, userId, synopsisRoot, "synopsis-visible", ArticleStatuses.Published, ContentVisibilities.Public, now);
            context.ChangeTracker.Clear();
            return new Fixture(connection, context, new ViewerRepository(context, TimeProvider.System))
            { SwiftSolutionId = swiftSolution, SynopsisSolutionId = synopsisSolution, SynopsisArticleId = synopsisArticle };
        }

        public Task<ViewerSessionData> CreateSessionAsync(string[] solutions, string handoffId = "handoff-1") =>
            Repository.CreateSessionAsync(new(handoffId, "external-42", "viewer@example.test", "customer-a",
                solutions, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(4), null, null),
                DateTime.UtcNow.AddHours(1), default);

        private static async Task<Guid> AddArticleAsync(KbDbContext context, Guid userId, Guid categoryId,
            string slug, string status, string visibility, DateTime now)
        {
            var id = Guid.NewGuid();
            var versionId = Guid.NewGuid();
            var article = new Article { ArticleId = id, Title = slug, Slug = slug, CategoryIdFk = categoryId,
                AuthorIdFk = userId, Status = status, Visibility = visibility, CreatedAt = now, UpdatedAt = now };
            context.Articles.Add(article);
            await context.SaveChangesAsync();
            context.ArticleVersions.Add(new ArticleVersion { VersionId = versionId, ArticleIdFk = id, VersionNumber = 1,
                SnapshotReason = "Published", ContentJsonStoragePath = $"articles/{id:N}.json", ContentSizeBytes = 2,
                CreatedByFk = userId, CreatedAt = now, PublishedByFk = userId, PublishedAt = now });
            await context.SaveChangesAsync();
            article.LastPublishedVersionIdFk = versionId;
            await context.SaveChangesAsync();
            return id;
        }

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await connection.DisposeAsync();
        }
    }
}
