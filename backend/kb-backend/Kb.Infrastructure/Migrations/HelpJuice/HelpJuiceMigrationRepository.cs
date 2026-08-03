using System.Text.Json;
using Kb.Application.Exceptions;
using Kb.Application.Migrations.HelpJuice;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Migrations.HelpJuice;

public sealed class HelpJuiceMigrationRepository(KbDbContext db, TimeProvider timeProvider)
    : IHelpJuiceMigrationRepository
{
    public async Task CreateAsync(MigrationJobCreateData job, CancellationToken ct)
    {
        var entity = new MigrationJob
        {
            Id = job.Id, Type = "HelpJuice", Status = MigrationJobStatuses.Pending,
            OriginalFileName = job.OriginalFileName, PackageStoragePath = job.PackageStoragePath,
            RequestedByUserId = job.RequestedByUserId, RequestedAt = job.RequestedAt,
            CurrentPhase = "Queued for validation", OptionsJson = job.Options.ToJson()
        };
        if (!db.Database.IsSqlServer()) entity.RowVersion = Guid.NewGuid().ToByteArray();
        db.MigrationJobs.Add(entity); await db.SaveChangesAsync(ct); db.ChangeTracker.Clear();
    }

    public async Task<MigrationJobData?> GetAsync(Guid jobId, int issueLimit, CancellationToken ct)
    {
        var job = await db.MigrationJobs.AsNoTracking().Include(x => x.RequestedByUser)
            .SingleOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null) return null;
        var issues = await db.MigrationJobErrors.AsNoTracking().Where(x => x.MigrationJobId == jobId)
            .OrderByDescending(x => x.Severity == "Error").ThenBy(x => x.CreatedAt).Take(issueLimit)
            .Select(x => new MigrationIssueData(x.Id, x.Severity, x.FileName, x.RowNumber,
                x.ExternalEntityType, x.ExternalId, x.ErrorCode, x.Message, x.SourceDataSummary, x.CreatedAt)).ToListAsync(ct);
        return ToData(job, issues);
    }

    public Task<Guid?> TryClaimValidationAsync(CancellationToken ct) => ClaimAsync(
        MigrationJobStatuses.Pending, MigrationJobStatuses.Validating, "Inspecting package", setStarted: false, ct);

    public async Task<Guid?> TryClaimImportAsync(CancellationToken ct)
    {
        var candidate = await db.MigrationJobs.AsNoTracking().Where(x => x.Status == MigrationJobStatuses.Running && x.StartedAt == null)
            .OrderBy(x => x.RequestedAt).Select(x => (Guid?)x.Id).FirstOrDefaultAsync(ct);
        if (candidate is null) return null;
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var changed = await db.MigrationJobs.Where(x => x.Id == candidate && x.Status == MigrationJobStatuses.Running && x.StartedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.StartedAt, now).SetProperty(x => x.CurrentPhase, "Preparing import"), ct);
        return changed == 1 ? candidate : null;
    }

    private async Task<Guid?> ClaimAsync(string from, string to, string phase, bool setStarted, CancellationToken ct)
    {
        var candidate = await db.MigrationJobs.AsNoTracking().Where(x => x.Status == from).OrderBy(x => x.RequestedAt)
            .Select(x => (Guid?)x.Id).FirstOrDefaultAsync(ct); if (candidate is null) return null;
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var changed = await db.MigrationJobs.Where(x => x.Id == candidate && x.Status == from)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, to).SetProperty(x => x.CurrentPhase, phase)
                .SetProperty(x => x.StartedAt, x => setStarted ? now : x.StartedAt), ct);
        return changed == 1 ? candidate : null;
    }

    public async Task SetValidationAsync(Guid jobId, HelpJuiceValidationSummary summary,
        IReadOnlyCollection<MigrationIssueData> issues, CancellationToken ct)
    {
        var job = await LoadAsync(jobId, ct);
        if (job.Status != MigrationJobStatuses.Validating) throw new ConflictException("Migration job is not validating.");
        job.ValidationSummaryJson = JsonSerializer.Serialize(summary); job.TotalItems = summary.TotalArticles;
        job.Status = MigrationJobStatuses.Ready; job.CurrentPhase = summary.BlockingErrorCount == 0 ? "Validation complete" : "Validation requires attention";
        AddEntities(jobId, issues); Touch(job); await db.SaveChangesAsync(ct); db.ChangeTracker.Clear();
    }

    public async Task MarkReadyToRunAsync(Guid jobId, HelpJuiceMigrationOptions options, CancellationToken ct)
    {
        var job = await LoadAsync(jobId, ct);
        if (job.Status != MigrationJobStatuses.Ready) throw new ConflictException("Only a validated migration can be started.");
        var summary = Deserialize<HelpJuiceValidationSummary>(job.ValidationSummaryJson);
        if (summary is null || summary.BlockingErrorCount > 0) throw new ConflictException("Blocking validation errors must be resolved before import.");
        job.OptionsJson = options.ToJson(); job.Status = MigrationJobStatuses.Running; job.CurrentPhase = "Queued for import";
        job.ProcessedItems = job.ImportedItems = job.UpdatedItems = job.SkippedItems = job.FailedItems = 0;
        AddJobAudit(job, "MigrationStarted");
        Touch(job); await db.SaveChangesAsync(ct); db.ChangeTracker.Clear();
    }

    public async Task UpdateProgressAsync(Guid jobId, MigrationProgressUpdate update, CancellationToken ct)
    {
        var changed = await db.MigrationJobs.Where(x => x.Id == jobId && x.Status == MigrationJobStatuses.Running)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.CurrentPhase, update.Phase)
                .SetProperty(x => x.TotalItems, x => update.TotalItems ?? x.TotalItems)
                .SetProperty(x => x.ProcessedItems, x => x.ProcessedItems + update.ProcessedDelta)
                .SetProperty(x => x.ImportedItems, x => x.ImportedItems + update.ImportedDelta)
                .SetProperty(x => x.UpdatedItems, x => x.UpdatedItems + update.UpdatedDelta)
                .SetProperty(x => x.SkippedItems, x => x.SkippedItems + update.SkippedDelta)
                .SetProperty(x => x.FailedItems, x => x.FailedItems + update.FailedDelta), ct);
        if (changed != 1) throw new ConflictException("The migration job is no longer running.");
    }
    public async Task AddIssuesAsync(Guid jobId, IReadOnlyCollection<MigrationIssueData> issues, CancellationToken ct)
    { AddEntities(jobId, issues); await db.SaveChangesAsync(ct); db.ChangeTracker.Clear(); }
    public Task<bool> IsCancellationRequestedAsync(Guid jobId, CancellationToken ct) =>
        db.MigrationJobs.AsNoTracking().Where(x => x.Id == jobId).Select(x => x.CancellationRequested).SingleAsync(ct);
    public async Task RequestCancellationAsync(Guid jobId, CancellationToken ct)
    {
        var exists = await db.MigrationJobs.AsNoTracking().AnyAsync(x => x.Id == jobId, ct);
        if (!exists) throw new NotFoundException("The migration job was not found.");
        await db.MigrationJobs.Where(x => x.Id == jobId &&
                x.Status != MigrationJobStatuses.Completed && x.Status != MigrationJobStatuses.CompletedWithErrors &&
                x.Status != MigrationJobStatuses.Failed && x.Status != MigrationJobStatuses.Cancelled)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.CancellationRequested, true)
                .SetProperty(x => x.CurrentPhase, "Cancellation requested"), ct);
    }
    public Task CompleteAsync(Guid jobId, HelpJuiceMigrationResult result, bool withErrors, CancellationToken ct) =>
        FinishAsync(jobId, withErrors ? MigrationJobStatuses.CompletedWithErrors : MigrationJobStatuses.Completed,
            "Completed", JsonSerializer.Serialize(result), null, null, ct);
    public Task FailAsync(Guid jobId, string code, string message, CancellationToken ct) =>
        FinishAsync(jobId, MigrationJobStatuses.Failed, "Failed", null, code, message.Length <= 4000 ? message : message[..4000], ct);
    public Task CancelAsync(Guid jobId, CancellationToken ct) => FinishAsync(jobId, MigrationJobStatuses.Cancelled, "Cancelled", null, null, null, ct);

    private async Task FinishAsync(Guid id, string status, string phase, string? summary, string? code, string? message, CancellationToken ct)
    { var job = await LoadAsync(id, ct); job.Status=status; job.CurrentPhase=phase; job.SummaryJson=summary; job.FailureCode=code; job.FailureMessage=message; job.CompletedAt=timeProvider.GetUtcNow().UtcDateTime; AddJobAudit(job,status switch{MigrationJobStatuses.Completed or MigrationJobStatuses.CompletedWithErrors=>"MigrationCompleted",MigrationJobStatuses.Cancelled=>"MigrationCancelled",_=>"MigrationFailed"});Touch(job); await db.SaveChangesAsync(ct); db.ChangeTracker.Clear(); }
    public Task<IReadOnlyList<MigrationIssueData>> GetIssuesAsync(Guid jobId, CancellationToken ct) =>
        db.MigrationJobErrors.AsNoTracking().Where(x => x.MigrationJobId == jobId).OrderBy(x => x.CreatedAt)
            .Select(x => new MigrationIssueData(x.Id,x.Severity,x.FileName,x.RowNumber,x.ExternalEntityType,x.ExternalId,x.ErrorCode,x.Message,x.SourceDataSummary,x.CreatedAt))
            .ToListAsync(ct).ContinueWith<IReadOnlyList<MigrationIssueData>>(t => t.Result, ct);
    public Task<Guid?> GetMappedInternalIdAsync(Guid jobId,string type,string externalId,CancellationToken ct)=>
        db.MigrationExternalMappings.AsNoTracking().Where(x=>x.MigrationJobId==jobId&&x.ExternalEntityType==type&&x.ExternalId==externalId).Select(x=>(Guid?)x.InternalEntityId).SingleOrDefaultAsync(ct);
    public async Task AddMappingAsync(Guid jobId,string type,string externalId,Guid internalId,string? metadata,CancellationToken ct)
    { if(await GetMappedInternalIdAsync(jobId,type,externalId,ct) is not null)return; db.MigrationExternalMappings.Add(new(){Id=NewId(),MigrationJobId=jobId,SourceSystem="HelpJuice",ExternalEntityType=type,ExternalId=externalId,InternalEntityId=internalId,MetadataJson=metadata,CreatedAt=timeProvider.GetUtcNow().UtcDateTime}); await db.SaveChangesAsync(ct); db.ChangeTracker.Clear(); }

    private async Task<MigrationJob> LoadAsync(Guid id,CancellationToken ct)=>await db.MigrationJobs.SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new NotFoundException("The migration job was not found.");
    private void AddEntities(Guid jobId,IEnumerable<MigrationIssueData> issues)=>db.MigrationJobErrors.AddRange(issues.Select(x=>new MigrationJobError{Id=db.Database.IsSqlServer()?Guid.Empty:x.Id,MigrationJobId=jobId,Severity=x.Severity,FileName=x.FileName,RowNumber=x.RowNumber,ExternalEntityType=x.ExternalEntityType,ExternalId=x.ExternalId,ErrorCode=x.ErrorCode,Message=x.Message,SourceDataSummary=x.SourceDataSummary,CreatedAt=x.CreatedAt}));
    private void AddJobAudit(MigrationJob job,string action)=>db.ArticleAuditLogs.Add(new(){AuditLogId=NewId(),ActorIdFk=job.RequestedByUserId,ActionType=action,EntityType="MigrationJob",EntityId=job.Id,MetaDataJson=JsonSerializer.Serialize(new{migrationJobId=job.Id,sourceSystem="HelpJuice",status=job.Status}),CreatedAt=timeProvider.GetUtcNow().UtcDateTime});
    private void Touch(MigrationJob job){if(!db.Database.IsSqlServer())job.RowVersion=Guid.NewGuid().ToByteArray();}
    private Guid NewId()=>db.Database.IsSqlServer()?Guid.Empty:Guid.NewGuid();
    private static T? Deserialize<T>(string? json)=>string.IsNullOrWhiteSpace(json)?default:JsonSerializer.Deserialize<T>(json);
    private static MigrationJobData ToData(MigrationJob j,IReadOnlyList<MigrationIssueData> issues)=>new(j.Id,j.Type,j.Status,j.OriginalFileName,j.PackageStoragePath,j.RequestedByUserId,j.RequestedByUser?.FullName,j.RequestedAt,j.StartedAt,j.CompletedAt,j.CurrentPhase,j.TotalItems,j.ProcessedItems,j.ImportedItems,j.UpdatedItems,j.SkippedItems,j.FailedItems,HelpJuiceMigrationOptions.FromJson(j.OptionsJson),j.CancellationRequested,Deserialize<HelpJuiceValidationSummary>(j.ValidationSummaryJson),Deserialize<HelpJuiceMigrationResult>(j.SummaryJson),j.FailureCode,j.FailureMessage,issues);
}
