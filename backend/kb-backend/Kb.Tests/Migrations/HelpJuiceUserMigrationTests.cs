using System.Text;
using Kb.Application.Abstractions;
using Kb.Application.Migrations.HelpJuice;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Kb.Infrastructure.Migrations.HelpJuice;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace Kb.Tests.Migrations;

public sealed class HelpJuiceUserMigrationTests
{
    [Fact]
    public void Parser_accepts_helpjuice_utc_timestamps_for_all_user_timestamp_fields()
    {
        const string timestamp = "2026-08-18 10:06:24 UTC";
        var values = HelpJuiceUserCsvParser.ExpectedHeaders.ToDictionary(
            header => header,
            _ => string.Empty,
            StringComparer.OrdinalIgnoreCase);
        values["id"] = "u1";
        values["current_sign_in_at"] = timestamp;
        values["last_sign_in_at"] = timestamp;
        values["created_at"] = timestamp;
        values["updated_at"] = timestamp;
        values["password_changed_at"] = timestamp;
        var csv = new ParsedCsv("users.csv", HelpJuiceUserCsvParser.ExpectedHeaders,
            [new CsvRow(2, values)]);

        var result = HelpJuiceUserCsvParser.Parse(csv,
            new DateTime(2026, 8, 19, 11, 0, 0, DateTimeKind.Utc));

        var user = Assert.Single(result.Rows).User!;
        var expected = new DateTime(2026, 8, 18, 10, 6, 24, DateTimeKind.Utc);
        Assert.Equal(expected, user.HelpJuiceCurrentSignInAt);
        Assert.Equal(expected, user.HelpJuiceLastSignInAt);
        Assert.Equal(expected, user.HelpJuiceCreatedAt);
        Assert.Equal(expected, user.HelpJuiceUpdatedAt);
        Assert.Equal(expected, user.HelpJuicePasswordChangedAt);
        Assert.All(
            new[]
            {
                user.HelpJuiceCurrentSignInAt,
                user.HelpJuiceLastSignInAt,
                user.HelpJuiceCreatedAt,
                user.HelpJuiceUpdatedAt,
                user.HelpJuicePasswordChangedAt
            },
            value => Assert.Equal(DateTimeKind.Utc, value!.Value.Kind));
        Assert.DoesNotContain(result.Rows[0].Diagnostics,
            diagnostic => diagnostic.ErrorCode == "HELPJUICE_USER_TIMESTAMP_INVALID");
    }

    [Fact]
    public void Parser_preserves_supported_metadata_and_diagnoses_malformed_values_and_duplicates()
    {
        var headers = new[]
        {
            "id", "first_name", "last_name", "job_title", "email", "notify_about_drafts",
            "notify_about_articles", "weekly_analytics_subscribed", "weekly_articles_subscribed",
            "sign_in_count", "current_sign_in_at", "last_sign_in_at", "current_sign_in_ip",
            "last_sign_in_ip", "created_at", "updated_at", "password_changed_at", "deactivated_at", "role_id"
        };
        CsvRow Row(int number, params string[] values) => new(number,
            headers.Zip(values).ToDictionary(pair => pair.First, pair => pair.Second,
                StringComparer.OrdinalIgnoreCase));
        var csv = new ParsedCsv("users.csv", headers,
        [
            Row(2, "u1", "Ada", "Lovelace", "Engineer", "Ada@example.test", "yes", "0", "TRUE", "no",
                "12", "2026-08-01T12:30:00Z", "", "192.0.2.4", "bad-ip", "2020-01-01T00:00:00Z",
                "2026-08-01T00:00:00+00:00", "2025-01-01", "", "role-7"),
            Row(3, "u2", "Grace", "Hopper", "", "ada@example.test", "perhaps", "", "", "",
                "many", "yesterday", "", "", "", "", "", "", "", "")
        ]);

        var parsed = HelpJuiceUserCsvParser.Parse(csv, new DateTime(2026, 8, 19, 11, 0, 0, DateTimeKind.Utc));
        var first = parsed.Rows[0].User!;
        Assert.Equal(true, first.HelpJuiceNotifyAboutDrafts);
        Assert.Equal(false, first.HelpJuiceNotifyAboutArticles);
        Assert.Equal(12, first.HelpJuiceSignInCount);
        Assert.Equal(new DateTime(2026, 8, 1, 12, 30, 0, DateTimeKind.Utc),
            first.HelpJuiceCurrentSignInAt);
        Assert.Null(first.HelpJuiceLastSignInAt);
        Assert.Equal("192.0.2.4", first.HelpJuiceCurrentSignInIp);
        Assert.Null(first.HelpJuiceLastSignInIp);
        Assert.Equal("role-7", first.HelpJuiceRoleId);
        Assert.Contains(parsed.Rows[0].Diagnostics, item => item.ErrorCode == "HELPJUICE_USER_IP_INVALID");
        Assert.DoesNotContain(parsed.Rows[0].Diagnostics,
            item => item.ErrorCode == "HELPJUICE_USER_TIMESTAMP_INVALID");
        Assert.True(parsed.Rows[0].CanWrite);
        Assert.False(parsed.Rows[1].CanWrite);
        Assert.Contains(parsed.Rows[1].Diagnostics, item => item.ErrorCode == "HELPJUICE_USER_EMAIL_DUPLICATE");
        Assert.Contains(parsed.Rows[1].Diagnostics, item => item.ErrorCode == "HELPJUICE_USER_BOOLEAN_INVALID");
        Assert.Contains(parsed.Rows[1].Diagnostics, item => item.ErrorCode == "HELPJUICE_USER_INTEGER_INVALID");
        Assert.Contains(parsed.Rows[1].Diagnostics, item => item.ErrorCode == "HELPJUICE_USER_TIMESTAMP_INVALID");
    }

    [Fact]
    public async Task Service_imports_updates_skips_persists_diagnostics_and_is_idempotent()
    {
        await using var fixture = await Fixture.CreateAsync();
        var originalCreatedAt = new DateTime(2020, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        fixture.Context.Users.Add(new User
        {
            UserId = fixture.ActorId,
            Email = "existing@example.test",
            FullName = "Native Identity",
            IsActive = true,
            CreatedAt = originalCreatedAt
        });
        await fixture.Context.SaveChangesAsync();
        var csv = """
            id,first_name,last_name,job_title,email,notify_about_drafts,notify_about_articles,weekly_analytics_subscribed,weekly_articles_subscribed,sign_in_count,current_sign_in_at,last_sign_in_at,current_sign_in_ip,last_sign_in_ip,created_at,updated_at,password_changed_at,role_id,deactivated_at
            u-existing,Changed,Name,,existing@example.test,true,,,,3,,,192.0.2.1,,2019-01-01T00:00:00Z,,,7,2024-01-01T00:00:00Z
            u-new,New,Person,,new@example.test,1,,,,4,,,2001:db8::1,,2020-01-01T00:00:00Z,,,,
            u-missing,No,Email,,,false,,,,0,,,,,,,,,
            """;

        var first = await fixture.ExecuteAsync(csv, "gamalearn-users-2026-08-19.csv");
        Assert.Equal(3, first.TotalRows);
        Assert.Equal(1, first.ImportedUsers);
        Assert.Equal(1, first.UpdatedUsers);
        Assert.Equal(1, first.SkippedUsers);
        Assert.Equal(0, first.FailedUsers);
        Assert.Equal(HelpJuiceMigrationStatuses.CompletedWithErrors, first.Status);

        fixture.Context.ChangeTracker.Clear();
        var existing = await fixture.Context.Users.SingleAsync(user => user.UserId == fixture.ActorId);
        Assert.Equal("Native Identity", existing.FullName);
        Assert.Equal("existing@example.test", existing.Email);
        Assert.True(existing.IsActive);
        Assert.Equal(originalCreatedAt, existing.CreatedAt);
        Assert.Equal("u-existing", existing.HelpJuiceUserId);
        Assert.Equal("Changed", existing.HelpJuiceFirstName);
        Assert.NotNull(existing.HelpJuiceDeactivatedAt);
        var created = await fixture.Context.Users.SingleAsync(user => user.HelpJuiceUserId == "u-new");
        Assert.Equal("New Person", created.FullName);
        Assert.Equal(fixture.Now, created.CreatedAt);
        Assert.True(created.IsActive);
        Assert.Equal("new@example.test", created.HelpJuiceEmail);
        Assert.Equal(2, await fixture.Context.Users.CountAsync());
        Assert.Single(await fixture.Context.MigrationJobs.Where(job => job.MigrationJobId == first.JobId).ToListAsync());
        Assert.NotEmpty(await fixture.Context.MigrationJobIssues
            .Where(issue => issue.MigrationJobIdFk == first.JobId).ToListAsync());
        Assert.All(first.Issues, issue => Assert.Equal("gamalearn-users-2026-08-19.csv", issue.FileName));
        Assert.True((await fixture.Store.GetLatestStatusAsync(default)).IsCompleted);

        var retry = await fixture.ExecuteAsync(csv);
        Assert.Equal(0, retry.ImportedUsers);
        Assert.Equal(2, retry.UpdatedUsers);
        Assert.Equal(1, retry.SkippedUsers);
        Assert.Equal(2, await fixture.Context.Users.CountAsync());
    }

    [Fact]
    public async Task Store_reports_mapping_conflicts_without_overwriting_native_identity()
    {
        await using var fixture = await Fixture.CreateAsync();
        var firstId = Guid.NewGuid();
        var secondId = Guid.NewGuid();
        fixture.Context.Users.AddRange(
            new User
            {
                UserId = firstId, Email = "first@example.test", FullName = "First Native",
                IsActive = false, CreatedAt = fixture.Now.AddYears(-1), HelpJuiceUserId = "hj-first"
            },
            new User
            {
                UserId = secondId, Email = "second@example.test", FullName = "Second Native",
                IsActive = true, CreatedAt = fixture.Now.AddYears(-2)
            });
        await fixture.Context.SaveChangesAsync();

        var idMatch = await fixture.Store.WriteUserAsync(
            Source("hj-first", "second@example.test", fixture.Now) with { HelpJuiceFirstName = "Metadata" }, default);
        Assert.Equal(MigrationWriteDisposition.Updated, idMatch.Disposition);
        Assert.Contains(idMatch.Diagnostics, item => item.ErrorCode == "HELPJUICE_USER_NATIVE_EMAIL_CONFLICT");
        fixture.Context.ChangeTracker.Clear();
        var first = await fixture.Context.Users.SingleAsync(user => user.UserId == firstId);
        Assert.Equal("first@example.test", first.Email);
        Assert.Equal("First Native", first.FullName);
        Assert.False(first.IsActive);
        Assert.Equal("second@example.test", first.HelpJuiceEmail);
        Assert.Equal("Metadata", first.HelpJuiceFirstName);

        fixture.Context.ChangeTracker.Clear();
        var occupied = await fixture.Store.WriteUserAsync(
            Source("hj-other", "first@example.test", fixture.Now), default);
        Assert.Equal(MigrationWriteDisposition.Skipped, occupied.Disposition);
        Assert.Contains(occupied.Diagnostics, item => item.ErrorCode == "HELPJUICE_USER_ID_CONFLICT");
        Assert.Equal(2, await fixture.Context.Users.CountAsync());
    }

    private static ImportedHelpJuiceUser Source(string id, string email, DateTime now) =>
        new(id, null, null, null, email, email, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, now);

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public KbDbContext Context { get; }
        public HelpJuiceUserMigrationStore Store { get; }
        public Guid ActorId { get; } = Guid.NewGuid();
        public DateTime Now { get; } = new(2026, 8, 19, 11, 30, 0, DateTimeKind.Utc);

        private Fixture(SqliteConnection connection, KbDbContext context)
        {
            this.connection = connection;
            Context = context;
            Store = new(context);
        }

        public static async Task<Fixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(new DbContextOptionsBuilder<KbDbContext>()
                .UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();
            return new(connection, context);
        }

        public async Task<HelpJuiceUserMigrationResult> ExecuteAsync(string csv, string fileName = "users.csv")
        {
            var bytes = Encoding.UTF8.GetBytes(csv);
            await using var stream = new MemoryStream(bytes, writable: false);
            var clock = new FakeTimeProvider(new DateTimeOffset(Now));
            var service = new HelpJuiceUserMigrationService(Store, new CurrentUser(ActorId), clock,
                Options.Create(new HelpJuiceMigrationLimits()));
            return await service.ExecuteAsync(
                [new MigrationUploadFile(fileName, "text/csv", bytes.LongLength, stream)], default);
        }

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await connection.DisposeAsync();
        }
    }

    private sealed class CurrentUser(Guid userId) : ICurrentUser
    {
        public bool IsAuthenticated => true;
        public Guid UserId => userId;
        public string? Email => null;
    }
}
