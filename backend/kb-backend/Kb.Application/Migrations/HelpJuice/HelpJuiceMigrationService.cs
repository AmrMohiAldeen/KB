using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Exceptions;
using Kb.Application.Media;
using Kb.Application.Drafts;
using Microsoft.Extensions.Options;

namespace Kb.Application.Migrations.HelpJuice;

public sealed partial class HelpJuiceMigrationService(
    IHelpJuiceMigrationRepository jobs,
    IHelpJuiceImportWriter writer,
    IObjectStorage storage,
    ICurrentUser currentUser,
    TimeProvider timeProvider,
    IOptions<HelpJuiceMigrationLimits> limitsAccessor,
    IOptions<MediaOptions> mediaOptionsAccessor,
    IOptions<DraftContentOptions> draftOptionsAccessor)
{
    private readonly HelpJuiceMigrationLimits limits = ValidateLimits(limitsAccessor.Value);
    private readonly MediaOptions mediaOptions = mediaOptionsAccessor.Value;
    private readonly DraftContentOptions draftOptions = draftOptionsAccessor.Value;

    public async Task<Guid> CreateValidationJobAsync(IReadOnlyList<MigrationUploadFile> files,
        HelpJuiceMigrationOptions options, CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        if (files.Count == 0) throw new BusinessRuleException("Select a HelpJuice ZIP or migration files.");
        ValidateOptions(options);
        var jobId = Guid.NewGuid(); var temp = Path.Combine(Path.GetTempPath(), $"helpjuice-upload-{jobId:N}.zip");
        try
        {
            if (files.Count == 1 && Path.GetExtension(files[0].FileName).Equals(".zip", StringComparison.OrdinalIgnoreCase))
                await CopyUploadedZipAsync(files[0], temp, ct);
            else
                await BuildManualPackageAsync(files, temp, ct);
            await using var package = new FileStream(temp, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024,
                FileOptions.Asynchronous | FileOptions.SequentialScan);
            var path = $"helpjuice/{jobId:N}/package.zip";
            var stored = await storage.UploadAsync(limits.PackageContainerName, path, package, "application/zip", ct);
            if (!string.Equals(stored, path, StringComparison.Ordinal)) throw new InvalidOperationException("Object storage returned an unexpected migration package path.");
            var original = files.Count == 1 ? SafeLeaf(files[0].FileName) : $"helpjuice-manual-{jobId:N}.zip";
            await jobs.CreateAsync(new(jobId, original, stored, currentUser.UserId, timeProvider.GetUtcNow().UtcDateTime, options), ct);
            return jobId;
        }
        catch
        {
            try { await storage.DeleteAsync(limits.PackageContainerName, $"helpjuice/{jobId:N}/package.zip", CancellationToken.None); } catch { }
            throw;
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }

    public async Task StartAsync(Guid jobId, HelpJuiceMigrationOptions options, CancellationToken ct)
    { ValidateOptions(options); await jobs.MarkReadyToRunAsync(jobId, options, ct); }
    public Task<MigrationJobData?> GetAsync(Guid jobId, CancellationToken ct) => jobs.GetAsync(jobId, 100, ct);
    public Task CancelAsync(Guid jobId, CancellationToken ct) => jobs.RequestCancellationAsync(jobId, ct);
    public Task<IReadOnlyList<MigrationIssueData>> GetIssuesAsync(Guid jobId, CancellationToken ct) => jobs.GetIssuesAsync(jobId, ct);

    public async Task<bool> ProcessOneValidationAsync(CancellationToken ct)
    {
        var jobId = await jobs.TryClaimValidationAsync(ct); if (jobId is null) return false;
        try
        {
            var job = await jobs.GetAsync(jobId.Value, 0, ct) ?? throw new InvalidOperationException("Claimed migration job disappeared.");
            if (job.CancellationRequested) { await jobs.CancelAsync(job.Id, ct); await DeletePackageAsync(job.Id); return true; }
            await using var packageStream = await storage.DownloadAsync(limits.PackageContainerName, job.PackageStoragePath, ct);
            using var package = await HelpJuicePackageReader.ExtractAsync(packageStream, limits, ct);
            var slugs = await writer.GetActiveArticleSlugsAsync(ct);
            var source = await HelpJuiceSourceParser.ParseAndValidateAsync(package, limits, timeProvider, slugs, ct);
            if (await jobs.IsCancellationRequestedAsync(job.Id, ct)) { await jobs.CancelAsync(job.Id, ct); await DeletePackageAsync(job.Id); return true; }
            var mediaIssues = await ValidateMediaFilesAsync(package.MediaFiles, ct);
            if (mediaIssues.Count > 0)
                source = source with { Issues = [..source.Issues, ..mediaIssues], Summary = source.Summary with { BlockingErrorCount = source.Summary.BlockingErrorCount + mediaIssues.Count } };
            await jobs.SetValidationAsync(job.Id, source.Summary, source.Issues, ct);
        }
        catch (OperationCanceledException)
        { if (await jobs.IsCancellationRequestedAsync(jobId.Value, CancellationToken.None)) { await jobs.CancelAsync(jobId.Value, CancellationToken.None); await DeletePackageAsync(jobId.Value); } else throw; }
        catch (Exception ex) { await jobs.FailAsync(jobId.Value, "VALIDATION_FAILED", SafeMessage(ex), CancellationToken.None); await DeletePackageAsync(jobId.Value); }
        return true;
    }

    public async Task<bool> ProcessOneImportAsync(CancellationToken ct)
    {
        var jobId = await jobs.TryClaimImportAsync(ct); if (jobId is null) return false;
        try { await ImportAsync(jobId.Value, ct); await DeletePackageAsync(jobId.Value); }
        catch (OperationCanceledException)
        { if (await jobs.IsCancellationRequestedAsync(jobId.Value, CancellationToken.None)) { await jobs.CancelAsync(jobId.Value, CancellationToken.None); await DeletePackageAsync(jobId.Value); } else throw; }
        catch (Exception ex) { await jobs.FailAsync(jobId.Value, "IMPORT_FAILED", SafeMessage(ex), CancellationToken.None); await DeletePackageAsync(jobId.Value); }
        return true;
    }

    private async Task ImportAsync(Guid jobId, CancellationToken ct)
    {
        var job = await jobs.GetAsync(jobId, 0, ct) ?? throw new InvalidOperationException("Migration job not found.");
        await ThrowIfCancelled(jobId, ct);
        await using var packageStream = await storage.DownloadAsync(limits.PackageContainerName, job.PackageStoragePath, ct);
        using var package = await HelpJuicePackageReader.ExtractAsync(packageStream, limits, ct);
        var source = await HelpJuiceSourceParser.ParseAndValidateAsync(package, limits, timeProvider, null, ct);
        if (source.Summary.BlockingErrorCount > 0) throw new InvalidDataException("The package no longer passes authoritative validation.");
        var options = job.Options; var answers = source.Answers.GroupBy(x => x.QuestionId, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var total = (options.ImportCategories ? source.Categories.Count : 0) + source.Questions.Count + (options.ImportMedia ? source.MediaFiles.Count : 0);
        await jobs.UpdateProgressAsync(jobId, new("Importing categories", total), ct);
        var categoryMap = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase); var catImported=0;var catUpdated=0;var catSkipped=0;
        if (options.ImportCategories)
        {
            var ordered = HelpJuiceSourceParser.OrderCategories(source.Categories, out _);
            foreach (var category in ordered)
            {
                await ThrowIfCancelled(jobId, ct);
                try
                {
                    Guid? parent = category.ParentId is null ? null : categoryMap.GetValueOrDefault(category.ParentId);
                    var result = await writer.WriteCategoryAsync(jobId, new(category.Id, category.Name,
                        HelpJuiceSourceParser.NormalizeSlug(category.Name), parent, category.Depth, category.RowNumber), options.ConflictBehavior, job.RequestedByUserId, ct);
                    categoryMap[category.Id]=result.InternalId;
                    if(result.Disposition==MigrationWriteDisposition.Imported)catImported++;else if(result.Disposition==MigrationWriteDisposition.Updated)catUpdated++;else catSkipped++;
                    await ProgressFor(result.Disposition,"Importing categories");
                }
                catch(Exception ex){writer.ResetState();await RecordFailure("categories.csv",category.RowNumber,"Category",category.Id,"CATEGORY_IMPORT_FAILED",ex);}
            }
        }

        await jobs.UpdateProgressAsync(jobId,new("Importing media"),ct);
        var mediaMap = new Dictionary<string,(Guid Id,string Url)>(StringComparer.OrdinalIgnoreCase);var mediaImported=0;var mediaReused=0;
        if(options.ImportMedia)
        {
            var byHash=new Dictionary<string,(Guid,string)>(StringComparer.OrdinalIgnoreCase);
            foreach(var file in source.MediaFiles)
            {
                await ThrowIfCancelled(jobId,ct);
                try
                {
                    var hash=await HashFileAsync(file,ct); if(byHash.TryGetValue(hash,out var duplicate)){MapMediaKeys(file,duplicate,mediaMap,source.MediaBySource);mediaReused++;await jobs.UpdateProgressAsync(jobId,new("Importing media",ProcessedDelta:1,SkippedDelta:1),ct);continue;}
                    await using var input=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.Read,64*1024,FileOptions.Asynchronous|FileOptions.SequentialScan);
                    var inspected=await MediaFileInspector.InspectAsync(new(Path.GetFileName(file),MimeFromExtension(file),input.Length,input),mediaOptions.MaxFileSizeBytes,ct);
                    var id=Guid.NewGuid();var storedName=$"{id:N}{inspected.Extension}";var objectName=$"{timeProvider.GetUtcNow():yyyy/MM}/{storedName}";
                    var stored=await storage.UploadAsync(mediaOptions.ContainerName,objectName,inspected.UploadStream,inspected.ContentType,ct);
                    try
                    {
                        var result=await writer.WriteMediaAsync(jobId,new(id,Path.GetFileName(file),storedName,inspected.ContentType,inspected.Extension,input.Length,stored,hash,job.RequestedByUserId,timeProvider.GetUtcNow().UtcDateTime),ct);
                        if(result.Disposition==MigrationWriteDisposition.Skipped)await storage.DeleteAsync(mediaOptions.ContainerName,stored,ct);
                        var pair=(result.InternalId,$"/api/media/{result.InternalId}/content");byHash[hash]=pair;MapMediaKeys(file,pair,mediaMap,source.MediaBySource);
                        if(result.Disposition==MigrationWriteDisposition.Imported)mediaImported++;else mediaReused++;await ProgressFor(result.Disposition,"Importing media");
                    }
                    catch{try{await storage.DeleteAsync(mediaOptions.ContainerName,stored,CancellationToken.None);}catch{}throw;}
                }
                catch(Exception ex){writer.ResetState();await RecordFailure(Path.GetFileName(file),null,"Media",Path.GetFileName(file),"MEDIA_IMPORT_FAILED",ex);}
            }
        }

        await jobs.UpdateProgressAsync(jobId,new("Importing articles"),ct);var published=0;var drafts=0;
        foreach(var question in source.Questions)
        {
            await ThrowIfCancelled(jobId,ct);
            if(question.IsPublished&&!options.ImportPublished||!question.IsPublished&&!options.ImportUnpublishedAsDrafts){await jobs.UpdateProgressAsync(jobId,new("Importing articles",ProcessedDelta:1,SkippedDelta:1),ct);continue;}
            var paths=new List<string>();
            try
            {
                answers.TryGetValue(question.Id,out var answer);
                (Guid MediaId,string Url)? Resolve(string src){foreach(var key in MediaKeys(src))if(mediaMap.TryGetValue(key,out var value))return(value.Id,value.Url);return null;}
                var converted=HelpJuiceHtmlConverter.Convert(answer?.Body,Resolve);
                var content=await StageContentAsync(jobId,question.Id,converted,question.IsPublished,paths,ct);
                var externalCategory=question.CategoryId??source.CategorizationByQuestionId.GetValueOrDefault(question.Id);
                Guid? category=externalCategory is null?null:categoryMap.GetValueOrDefault(externalCategory);
                var created=options.PreserveTimestamps?question.CreatedAt??job.RequestedAt:job.RequestedAt;var updated=options.PreserveTimestamps?question.UpdatedAt??created:job.RequestedAt;
                var result=await writer.WriteArticleAsync(jobId,new(question.Id,answer?.Id,question.Name,question.Slug,question.Description,category,job.RequestedByUserId,question.IsPublished,created,updated,content,question.Source),options.ConflictBehavior,ct);
                if(result.Disposition!=MigrationWriteDisposition.Skipped){if(question.IsPublished)published++;else drafts++;}
                await ProgressFor(result.Disposition,"Importing articles");
                var warnings=converted.Warnings.Select(w=>NewIssue("Warning","answers.csv",answer?.RowNumber,"Answer",answer?.Id,w.Code,w.Message)).ToArray();if(warnings.Length>0)await jobs.AddIssuesAsync(jobId,warnings,ct);
            }
            catch(Exception ex){writer.ResetState();await DeletePaths(paths);await RecordFailure("questions.csv",question.RowNumber,"Question",question.Id,"ARTICLE_IMPORT_FAILED",ex);}
        }
        var errors=await jobs.GetIssuesAsync(jobId,ct);var resultSummary=new HelpJuiceMigrationResult(catImported,catUpdated,catSkipped,published,drafts,mediaImported,mediaReused,errors.Count(x=>x.ErrorCode.Contains("MEDIA",StringComparison.OrdinalIgnoreCase)),source.Issues.Count(x=>x.ErrorCode.StartsWith("UNSUPPORTED",StringComparison.Ordinal)),errors.Count(x=>x.Severity=="Warning"));
        await jobs.CompleteAsync(jobId,resultSummary,errors.Any(x=>x.Severity=="Error"),ct);

        async Task ProgressFor(MigrationWriteDisposition disposition,string phase)=>await jobs.UpdateProgressAsync(jobId,new(phase,ProcessedDelta:1,ImportedDelta:disposition==MigrationWriteDisposition.Imported?1:0,UpdatedDelta:disposition==MigrationWriteDisposition.Updated?1:0,SkippedDelta:disposition==MigrationWriteDisposition.Skipped?1:0),ct);
        async Task RecordFailure(string? file,int? row,string type,string? id,string code,Exception ex){await jobs.AddIssuesAsync(jobId,[NewIssue("Error",file,row,type,id,code,SafeMessage(ex))],CancellationToken.None);await jobs.UpdateProgressAsync(jobId,new("Continuing after record error",ProcessedDelta:1,FailedDelta:1),CancellationToken.None);}
    }

    private async Task<StagedArticleContent> StageContentAsync(Guid jobId,string externalId,HelpJuiceHtmlConversion converted,bool published,List<string> paths,CancellationToken ct)
    {
        var json=Encoding.UTF8.GetBytes(converted.TiptapJson);var html=Encoding.UTF8.GetBytes(converted.RenderedHtml);var text=Encoding.UTF8.GetBytes(converted.PlainText);
        if(json.Length>limits.MaxEntrySizeBytes)throw new InvalidDataException("Converted article content exceeds the configured limit.");
        var articleKey=HelpJuiceSourceParser.NormalizeSlug(externalId);var prefix=$"migrations/{jobId:N}/articles/{articleKey}/{Guid.NewGuid():N}";
        var j=await Upload($"{prefix}/draft/content.json",json,"application/json");var h=await Upload($"{prefix}/draft/content.html",html,"text/html; charset=utf-8");var t=await Upload($"{prefix}/draft/content.txt",text,"text/plain; charset=utf-8");
        string? vj=null,vh=null,vt=null;if(published){vj=await Upload($"{prefix}/version/content.json",json,"application/json");vh=await Upload($"{prefix}/version/content.html",html,"text/html; charset=utf-8");vt=await Upload($"{prefix}/version/content.txt",text,"text/plain; charset=utf-8");}
        var ids=MediaIdRegex().Matches(converted.TiptapJson).Select(m=>Guid.Parse(m.Groups[1].Value)).ToHashSet();return new(j,h,t,Convert.ToHexString(SHA256.HashData(json)).ToLowerInvariant(),json.LongLength,ids,vj,vh,vt);
        async Task<string> Upload(string name,byte[] bytes,string type){paths.Add(name);await using var stream=new MemoryStream(bytes,false);return await storage.UploadAsync(draftOptions.ContainerName,name,stream,type,ct);}
    }

    private async Task CopyUploadedZipAsync(MigrationUploadFile file,string target,CancellationToken ct){if(file.Length<=0||file.Length>limits.MaxPackageSizeBytes)throw new BusinessRuleException("The migration package size is invalid.");if(file.ContentType is not null&&file.ContentType.Split(';')[0] is not ("application/zip" or "application/x-zip-compressed" or "application/octet-stream"))throw new BusinessRuleException("The ZIP MIME type is not supported.");await using var output=new FileStream(target,FileMode.CreateNew,FileAccess.Write,FileShare.None,64*1024,FileOptions.Asynchronous);await CopyLimited(file.Content,output,limits.MaxPackageSizeBytes,ct);output.Position=0;}
    private async Task BuildManualPackageAsync(IReadOnlyList<MigrationUploadFile> files,string target,CancellationToken ct){if(files.Count>limits.MaxEntries)throw new BusinessRuleException("Too many migration files were selected.");await using var output=new FileStream(target,FileMode.CreateNew,FileAccess.ReadWrite,FileShare.None);using var archive=new ZipArchive(output,ZipArchiveMode.Create,true);long total=0;var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(var file in files){var name=HelpJuicePackageReader.ValidateEntryName(file.FileName);if(!HelpJuicePackageReader.IsSupportedManualFile(name))throw new BusinessRuleException($"File '{SafeLeaf(name)}' is not supported.");if(!names.Add(name))throw new BusinessRuleException($"File '{name}' was selected more than once.");total=checked(total+file.Length);if(total>limits.MaxPackageSizeBytes)throw new BusinessRuleException("The selected files exceed the package limit.");var entry=archive.CreateEntry(name,CompressionLevel.Fastest);await using var destination=entry.Open();await CopyLimited(file.Content,destination,limits.MaxEntrySizeBytes,ct);}}
    private async Task ThrowIfCancelled(Guid id,CancellationToken ct){ct.ThrowIfCancellationRequested();if(await jobs.IsCancellationRequestedAsync(id,ct))throw new OperationCanceledException("Migration cancellation requested.");}
    private async Task<IReadOnlyList<MigrationIssueData>> ValidateMediaFilesAsync(IEnumerable<string> files,CancellationToken ct){var issues=new List<MigrationIssueData>();foreach(var file in files){try{await using var input=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.Read,64*1024,FileOptions.Asynchronous|FileOptions.SequentialScan);_ = await MediaFileInspector.InspectAsync(new(Path.GetFileName(file),MimeFromExtension(file),input.Length,input),mediaOptions.MaxFileSizeBytes,ct);}catch(Exception ex)when(ex is not OperationCanceledException){issues.Add(NewIssue("Error",Path.GetFileName(file),null,"Media",Path.GetFileName(file),"MEDIA_VALIDATION_FAILED",SafeMessage(ex)));}}return issues;}
    private async Task DeletePackageAsync(Guid id){try{var job=await jobs.GetAsync(id,0,CancellationToken.None);if(job is not null)await storage.DeleteAsync(limits.PackageContainerName,job.PackageStoragePath,CancellationToken.None);}catch{}}
    private async Task DeletePaths(IEnumerable<string> paths){foreach(var p in paths)try{await storage.DeleteAsync(draftOptions.ContainerName,p,CancellationToken.None);}catch{}}
    private static async Task<string> HashFileAsync(string path,CancellationToken ct){await using var s=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read,64*1024,FileOptions.Asynchronous);return Convert.ToHexString(await SHA256.HashDataAsync(s,ct)).ToLowerInvariant();}
    private static IEnumerable<string> MediaKeys(string src){yield return src;var value=Uri.TryCreate(src,UriKind.Absolute,out var u)?u.LocalPath:src;yield return value.Replace('\\','/').TrimStart('/');yield return Path.GetFileName(value);}
    private static void MapMediaKeys(string file,(Guid Id,string Url) pair,Dictionary<string,(Guid,string)> map,IReadOnlyDictionary<string,string> uploads){foreach(var key in MediaKeys(file))map.TryAdd(key,pair);foreach(var item in uploads.Where(x=>Path.GetFileName(x.Value).Equals(Path.GetFileName(file),StringComparison.OrdinalIgnoreCase)))foreach(var key in MediaKeys(item.Key))map.TryAdd(key,pair);}
    private MigrationIssueData NewIssue(string severity,string? file,int? row,string? type,string? id,string code,string message)=>new(Guid.NewGuid(),severity,file,row,type,id,code,message,null,timeProvider.GetUtcNow().UtcDateTime);
    private static string MimeFromExtension(string path)=>Path.GetExtension(path).ToLowerInvariant() switch{".png"=>"image/png",".jpg" or ".jpeg"=>"image/jpeg",".gif"=>"image/gif",".webp"=>"image/webp",".pdf"=>"application/pdf",".mp4"=>"video/mp4",".webm"=>"video/webm",_=>"application/octet-stream"};
    private static async Task CopyLimited(Stream input,Stream output,long max,CancellationToken ct){var buffer=new byte[64*1024];long count=0;while(true){var read=await input.ReadAsync(buffer,ct);if(read==0)break;count+=read;if(count>max)throw new BusinessRuleException("Uploaded content exceeds the configured limit.");await output.WriteAsync(buffer.AsMemory(0,read),ct);}}
    private static void ValidateOptions(HelpJuiceMigrationOptions o){if(!MigrationConflictBehaviors.All.Contains(o.ConflictBehavior))throw new BusinessRuleException("Conflict behavior must be Skip, UpdateExisting, or CreateCopy.");if(!o.ImportPublished&&!o.ImportUnpublishedAsDrafts)throw new BusinessRuleException("Select at least one article publication state to import.");}
    private static HelpJuiceMigrationLimits ValidateLimits(HelpJuiceMigrationLimits value){if(value.MaxPackageSizeBytes<=0||value.MaxExtractedSizeBytes<value.MaxPackageSizeBytes||value.MaxEntries<=0||value.BatchSize<=0)throw new InvalidOperationException("HelpJuice migration limits are invalid.");return value;}
    private static string SafeLeaf(string value)=>Path.GetFileName(value.Replace('\\','/'));private static string SafeMessage(Exception ex){var m=ex.Message;return m.Length<=4000?m:m[..4000];}
    [System.Text.RegularExpressions.GeneratedRegex("\\\"mediaId\\\":\\\"([0-9a-fA-F-]{36})\\\"")]private static partial System.Text.RegularExpressions.Regex MediaIdRegex();
}
