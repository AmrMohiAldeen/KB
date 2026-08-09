using Kb.Application.Dashboard;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Dashboard;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Kb.Tests.Dashboard;

public sealed class DashboardSliceTests
{
    [Fact]
    public async Task Position_sort_keeps_direct_child_categories_before_articles_stably()
    {
        await using var fixture = await Fixture.CreateAsync();
        var result = await fixture.Service.GetAsync(
            null, fixture.RootCategoryId, "Everything", "position", 1, 100, default);

        Assert.Equal(3, result.TotalCount);
        Assert.Equal(2, result.ArticleCount);
        Assert.Equal(
            new[] { "category:Child", "article:First", "article:Second" },
            result.Items.Select(item => $"{item.Kind}:{item.Title}"));
        Assert.DoesNotContain(result.Items, item => item.Title == "Grandchild");
    }

    [Fact]
    public async Task Grouped_filters_counts_archives_and_pagination_are_returned_by_one_query()
    {
        await using var fixture = await Fixture.CreateAsync();

        var review = await fixture.Service.GetAsync(
            null, null, "ToReview", "title", 1, 2, default);
        Assert.Equal(3, review.EverythingArticleCount);
        Assert.Equal(1, review.ArticleCount);
        Assert.Equal(1, review.FilterCounts.Published);
        Assert.Equal(2, review.FilterCounts.DraftUnpublished);
        Assert.Equal(1, review.FilterCounts.ToReview);
        Assert.Equal(1, review.FilterCounts.Archived);
        Assert.Equal(5, review.TotalCount);
        Assert.True(review.Truncated);
        Assert.Equal(2, review.Items.Count);

        var archived = await fixture.Service.GetAsync(
            "Archived", null, "Archived", "position", 1, 100, default);
        var archivedArticle = Assert.Single(archived.Items, item => item.Kind == "article");
        Assert.Equal(ArticleStatuses.Archived, archivedArticle.Article!.Status);
        Assert.Equal(1, archived.ArticleCount);
        Assert.Equal(0, archived.EverythingArticleCount);
    }

    [Fact]
    public async Task Missing_category_and_invalid_query_values_are_rejected()
    {
        await using var fixture = await Fixture.CreateAsync();

        await Assert.ThrowsAsync<NotFoundException>(() => fixture.Service.GetAsync(
            null, Guid.NewGuid(), "Everything", "position", 1, 100, default));
        await Assert.ThrowsAsync<BusinessRuleException>(() => fixture.Service.GetAsync(
            null, null, "Unknown", "position", 1, 100, default));
        await Assert.ThrowsAsync<BusinessRuleException>(() => fixture.Service.GetAsync(
            null, null, "Everything", "unknown", 1, 100, default));
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public KbDbContext Context { get; }
        public DashboardService Service { get; }
        public Guid RootCategoryId { get; }

        private Fixture(SqliteConnection connection, KbDbContext context, Guid rootCategoryId)
        {
            this.connection = connection;
            Context = context;
            RootCategoryId = rootCategoryId;
            Service = new DashboardService(new DashboardRepository(context));
        }

        public static async Task<Fixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(new DbContextOptionsBuilder<KbDbContext>()
                .UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();

            var now = DateTime.UtcNow;
            var userId = Guid.NewGuid();
            var rootId = Guid.NewGuid();
            var childId = Guid.NewGuid();
            var grandchildId = Guid.NewGuid();
            var otherRootId = Guid.NewGuid();
            context.Users.Add(new User
            {
                UserId = userId,
                Email = "dashboard@example.test",
                FullName = "Dashboard User",
                IsActive = true,
                CreatedAt = now
            });
            context.Categories.AddRange(
                Category(rootId, null, "Root", 0, 0),
                Category(childId, rootId, "Child", 2, 1),
                Category(grandchildId, childId, "Grandchild", 0, 2),
                Category(otherRootId, null, "Other", 3, 0));
            context.Articles.AddRange(
                Article(userId, rootId, "First", ArticleStatuses.Draft, 1, now.AddMinutes(-4)),
                Article(userId, rootId, "Second", ArticleStatuses.Published, 4, now.AddMinutes(-3)),
                Article(userId, otherRootId, "Review", ArticleStatuses.InReview, 0, now.AddMinutes(-2)),
                Article(userId, otherRootId, "Archived", ArticleStatuses.Archived, 1, now.AddMinutes(-1)));
            await context.SaveChangesAsync();
            return new(connection, context, rootId);
        }

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await connection.DisposeAsync();
        }

        private static Category Category(Guid id, Guid? parentId, string name, int sortOrder, int depth) => new()
        {
            CategoryId = id,
            ParentCategoryIdFk = parentId,
            Name = name,
            Slug = name.ToLowerInvariant(),
            SortOrder = sortOrder,
            Depth = depth,
            Path = $"/{id:D}/"
        };

        private static Article Article(
            Guid userId,
            Guid categoryId,
            string title,
            string status,
            int position,
            DateTime updatedAt) => new()
        {
            ArticleId = Guid.NewGuid(),
            Title = title,
            Slug = title.ToLowerInvariant(),
            CategoryIdFk = categoryId,
            AuthorIdFk = userId,
            Status = status,
            Position = position,
            CreatedAt = updatedAt,
            UpdatedAt = updatedAt
        };
    }
}
