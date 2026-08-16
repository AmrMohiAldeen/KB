using System.IO.Compression;
using System.Text;
using System.Text.Json;
using Kb.Application.Migrations.HelpJuice;

namespace Kb.Tests.Migrations;

public sealed class HelpJuiceParsingTests
{
    [Fact]
    public async Task Supplied_export_is_fully_representable_without_blocking_legacy_data_errors()
    {
        var root = Environment.GetEnvironmentVariable("HELPJUICE_FIXTURE_DIR");
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root)) return;
        var known = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var name in new[] { "questions.csv", "answers.csv", "categories.csv", "categorizations.csv", "uploads.csv", "passes.csv", "groups.csv" })
        {
            var path = Path.Combine(root, name);
            if (File.Exists(path)) known[name] = path;
        }
        var package = new PackageContents(root, known, [], known.Keys.ToArray(), []);
        var source = await HelpJuiceSourceParser.ParseAndValidateAsync(package, new(), TimeProvider.System);
        var categoryIds = source.Categories.Select(category => category.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var preview = HelpJuicePreviewBuilder.Build(source, 100);
        Console.WriteLine(JsonSerializer.Serialize(new
        {
            source.Summary,
            PreviewArticles = preview.Articles.Count,
            PreviewIssues = preview.Articles.SelectMany(x => x.Issues).DistinctBy(x => x.Id)
                .GroupBy(x => new { x.Severity, x.ErrorCode }).OrderBy(x => x.Key.Severity).ThenBy(x => x.Key.ErrorCode)
                .ToDictionary(x => $"{x.Key.Severity}:{x.Key.ErrorCode}", x => x.Count()),
            AllIssues = source.Issues.GroupBy(x => new { x.Severity, x.ErrorCode })
                .OrderBy(x => x.Key.Severity).ThenBy(x => x.Key.ErrorCode)
                .ToDictionary(x => $"{x.Key.Severity}:{x.Key.ErrorCode}", x => x.Count())
        }));

        Assert.Equal(1262, source.Questions.Count);
        Assert.Equal(1262, source.Answers.Count);
        Assert.Equal(191, source.Categories.Count);
        Assert.Equal(4728, source.Uploads?.Count);
        Assert.Equal(0, source.Summary.BlockingErrorCount);
        Assert.Equal(14, source.Issues.Count(x => x.ErrorCode == "EMPTY_SOURCE_BODY"));
        Assert.DoesNotContain(source.Issues, issue => issue.ErrorCode == "UNCATEGORIZED_ARTICLE" &&
            source.Questions.Any(question => question.Id == issue.ExternalId && question.Source.GetValueOrDefault("categories_count") == "0"));
        Assert.DoesNotContain(source.Issues, issue => issue.ErrorCode is "UNCATEGORIZED_ARTICLE" or "CATEGORY_COUNT_MISMATCH" &&
            source.Questions.Any(question => question.Id == issue.ExternalId && question.Source.GetValueOrDefault("categories_count") == "1" &&
                categoryIds.Contains(question.Source.GetValueOrDefault("category_id") ?? string.Empty)));
        Assert.DoesNotContain(source.ConvertedAnswersById.Values, value => value.TiptapJson.Contains(";base64,", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Csv_supports_bom_utf8_and_quoted_multiline_html()
    {
        var path=TempFile("\uFEFFid,question_id,body\r\na1,q1,\"<p>مرحبا, world</p>\n<ul><li>two</li></ul>\"");
        try { var csv=await HelpJuiceCsvReader.ReadAsync(path,100);var row=Assert.Single(csv.Rows);Assert.Equal("a1",row["id"]);Assert.Contains("مرحبا, world",row["body"]);Assert.Contains("\n<ul>",row["body"]); }
        finally{File.Delete(path);}
    }

    [Fact]
    public async Task Csv_rejects_malformed_quotes_and_duplicate_headers()
    {
        var malformed=TempFile("id,body\na1,\"unclosed");var duplicate=TempFile("id,id\na,b");
        try { await Assert.ThrowsAsync<InvalidDataException>(()=>HelpJuiceCsvReader.ReadAsync(malformed,10));await Assert.ThrowsAsync<InvalidDataException>(()=>HelpJuiceCsvReader.ReadAsync(duplicate,10)); }
        finally{File.Delete(malformed);File.Delete(duplicate);}
    }

    [Fact]
    public async Task Validation_matches_answers_reports_missing_answers_and_duplicate_ids()
    {
        using var package=Package("id,codename,name,is_published\nq1,one,One,TRUE\nq1,two,Two,FALSE\nq3,three,Three,FALSE",
            "id,question_id,body\na1,q1,\"<p>Body</p>\"\na2,q9,orphan");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);
        Assert.Equal(3,source.Summary.TotalArticles);Assert.Equal(1,source.Summary.ArticlesMissingAnswers);
        Assert.Contains(source.Issues,x=>x.ErrorCode=="QUESTION_ID_DUPLICATE");Assert.Contains(source.Issues,x=>x.ErrorCode=="ANSWER_QUESTION_MISSING");
    }

    [Fact]
    public async Task Validation_reports_media_missing_from_the_backup()
    {
        using var package=Package("id,codename,name,is_published\nq1,one,One,TRUE",
            "id,question_id,body\na1,q1,\"<p>Body</p><img src='images/missing.png'>\"");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);
        Assert.Equal(1,source.Summary.MissingMedia);Assert.Contains(source.Issues,x=>x.ErrorCode=="EXTERNAL_MEDIA_LEFT_EXTERNAL");
    }

    [Fact]
    public async Task Preview_contains_content_category_metadata_and_only_issues_for_previewed_articles()
    {
        using var package=Package("id,codename,name,is_published,category_id,user_id\nq1,one,One,TRUE,c1,u1\nq2,two,Two,FALSE,c2,u2",
            "id,question_id,body\na1,q1,\"<p>First body</p><img src='missing.png'>\"\na2,q2,\"<p>Second body</p><img src='also-missing.png'>\"",
            "id,parent_id,name\nc0,,Guides\nc1,c0,Setup\nc2,,Other",
            "id,question_id,category_id,position\nx1,q1,c1,1\nx2,q2,c2,1");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);
        var preview=HelpJuicePreviewBuilder.Build(source,1);

        var article=Assert.Single(preview.Articles);
        Assert.True(preview.IsLimited);Assert.Equal(2,preview.SourceArticleCount);
        Assert.Equal("One",article.Title);Assert.Equal("Guides / Setup",article.CategoryLocation);
        Assert.Contains("First body",article.ContentHtml);Assert.Equal("u1",article.SourceMetadata["question.user_id"]);
        Assert.Contains(article.Issues,issue=>issue.ErrorCode=="EXTERNAL_MEDIA_LEFT_EXTERNAL"&&issue.ExternalId=="a1");
        Assert.DoesNotContain(article.Issues,issue=>issue.ExternalId is "q2" or "a2");
    }

    [Fact]
    public void Category_order_is_parent_first_and_cycles_are_reported()
    {
        var ordered=HelpJuiceSourceParser.OrderCategories([new(2,"child","root","Child"),new(3,"root",null,"Root")],out var cycles);
        Assert.Empty(cycles);Assert.Equal(["root","child"],ordered.Select(x=>x.Id));Assert.Equal(1,ordered.Single(x=>x.Id=="child").Depth);
        _=HelpJuiceSourceParser.OrderCategories([new(2,"a","b","A"),new(3,"b","a","B")],out cycles);Assert.NotEmpty(cycles);
    }

    [Fact]
    public void Html_is_sanitized_and_converted_to_valid_tiptap_without_base64_media()
    {
        var result=HelpJuiceHtmlConverter.Convert("<script>alert(1)</script><h2>Title</h2><p onclick=\"bad()\"><strong>Bold</strong> <a href=\"javascript:bad()\">unsafe</a></p><img src=\"data:image/png;base64,AAAA\"><table><tr><th>A</th><td>B</td></tr></table><iframe src=\"https://www.youtube.com/embed/dQw4w9WgXcQ\"></iframe>");
        Assert.DoesNotContain("script",result.RenderedHtml,StringComparison.OrdinalIgnoreCase);Assert.DoesNotContain("onclick",result.RenderedHtml,StringComparison.OrdinalIgnoreCase);Assert.DoesNotContain("javascript:",result.RenderedHtml,StringComparison.OrdinalIgnoreCase);Assert.DoesNotContain("base64",result.TiptapJson,StringComparison.OrdinalIgnoreCase);
        using var json=JsonDocument.Parse(result.TiptapJson);Assert.Equal("doc",json.RootElement.GetProperty("type").GetString());Assert.Contains("table",result.TiptapJson);Assert.Contains("youtube",result.TiptapJson);Assert.Contains("https://www.youtube.com/watch?v=dQw4w9WgXcQ",result.TiptapJson);Assert.Contains(result.Warnings,x=>x.Code=="UNSAFE_ELEMENT_REMOVED");
    }

    [Fact]
    public async Task Legacy_states_categories_slugs_empty_bodies_languages_and_users_are_repaired_not_blocked()
    {
        using var package=Package(
            "id,name,codename,is_published,archived,language_id,categories_count,created_by_id,updated_by_id\nq1,Published,same,true,false,1,1,11,12\nq2,Archived,same,true,true,1,0,11,12\nq3,Draft,,false,false,3,1,11,12",
            "id,question_id,body\na1,q1,<p>Ready</p>\na2,q2,\na3,q3,<p dir='rtl'>مرحبا</p>",
            "id,parent_id,name,codename,position\nc1,,Guides,guides,1",
            "id,question_id,category_id,position\nx1,q1,c1,1");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);

        Assert.Equal(0,source.Summary.BlockingErrorCount);
        Assert.Equal("same",source.Questions.Single(x=>x.Id=="q1").Slug);
        Assert.Equal("same-q2",source.Questions.Single(x=>x.Id=="q2").Slug);
        Assert.Equal("draft",source.Questions.Single(x=>x.Id=="q3").Slug);
        Assert.True(source.Questions.Single(x=>x.Id=="q2").IsArchived);
        Assert.Null(source.Questions.Single(x=>x.Id=="q3").CategoryId);
        Assert.Contains(source.Issues,x=>x.ErrorCode=="EMPTY_SOURCE_BODY"&&x.ExternalId=="q2");
        Assert.Contains(source.Issues,x=>x.ErrorCode=="CATEGORY_COUNT_MISMATCH"&&x.ExternalId=="q3");
        Assert.Contains(source.Issues,x=>x.ErrorCode=="HISTORICAL_USER_MAPPED_TO_MIGRATION_USER"&&x.ExternalId=="q1");
        Assert.Contains("مرحبا",source.ConvertedAnswersById["a3"].PlainText);
        Assert.Contains("\"dir\":\"rtl\"",source.ConvertedAnswersById["a3"].TiptapJson);
    }

    [Fact]
    public async Task Direct_question_categories_are_used_and_explicitly_uncategorized_articles_are_not_warned()
    {
        using var package=Package(
            "id,name,codename,is_published,category_id,categories_count\nq1,Direct,one,true,c1,1\nq2,Intentional,two,true,,0",
            "id,question_id,body\na1,q1,Body\na2,q2,Body",
            "id,parent_id,name\nc1,,Guides");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);

        Assert.Equal("c1",source.Questions.Single(question=>question.Id=="q1").CategoryId);
        Assert.DoesNotContain(source.Issues,issue=>issue.ExternalId=="q1"&&issue.ErrorCode is "CATEGORY_COUNT_MISMATCH" or "UNCATEGORIZED_ARTICLE");
        Assert.DoesNotContain(source.Issues,issue=>issue.ExternalId=="q2"&&issue.ErrorCode=="UNCATEGORIZED_ARTICLE");
    }

    [Fact]
    public async Task All_source_categories_are_preserved_in_metadata_when_the_target_selects_one()
    {
        using var package=Package("id,name,categories_count\nq1,One,2", "id,question_id,body\na1,q1,Body",
            "id,parent_id,name\nc1,,First\nc2,,Second",
            "id,question_id,category_id,position\nx1,q1,c1,1\nx2,q1,c2,2");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);
        var question=Assert.Single(source.Questions);

        Assert.Equal("c1",question.CategoryId);
        Assert.Equal("c1,c2",question.Source["categorizations.category_ids"]);
        Assert.Contains(source.Issues,issue=>issue.ErrorCode=="MULTIPLE_CATEGORIES");
    }

    [Fact]
    public async Task Missing_preview_url_is_recovered_by_an_exact_packaged_filename()
    {
        using var package=Package("id,name\nq1,One", "id,question_id,body\na1,q1,Body",
            uploads:"id,image,preview_url\nu1,image.png,", mediaNames:["image.png"]);
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);

        Assert.DoesNotContain(source.Issues,issue=>issue.ErrorCode=="MISSING_MEDIA_URL");
    }

    [Fact]
    public void Internal_links_resolve_by_question_id_and_same_language()
    {
        var english=new HelpJuiceQuestion(2,"1881001","shared","English",null,true,null,null,null,
            new Dictionary<string,string>{{"codename","shared"}},LanguageId:1);
        var arabic=new HelpJuiceQuestion(3,"1881002","shared-1881002","Arabic",null,true,null,null,null,
            new Dictionary<string,string>{{"codename","shared"}},LanguageId:23);
        var resolver=HelpJuiceSourceParser.CreateLinkResolver([english,arabic],arabic);

        Assert.Equal("/kb/shared",resolver("https://docs.helpjuice.com/1881001-shared")?.Url);
        Assert.Equal("/kb/shared-1881002",resolver("https://docs.helpjuice.com/shared")?.Url);
    }

    [Fact]
    public void Legacy_semantic_word_and_vml_markup_is_preserved_without_false_unsupported_warnings()
    {
        var result=HelpJuiceHtmlConverter.Convert("<article><section><h5>Deep</h5><o:p>Word</o:p><font face='Arial' color='#ff0000' size='4'>Styled</font><a name='bookmark'>Anchor</a><v:shape><v:imagedata src='/images/legacy.png'></v:shape><meta charset='utf-8'></section></article>");

        Assert.Contains("\"level\":5",result.TiptapJson);
        Assert.Contains("\"type\":\"textStyle\"",result.TiptapJson);
        Assert.Contains("/images/legacy.png",result.TiptapJson);
        Assert.DoesNotContain(result.Warnings,warning=>warning.Code is "UNSUPPORTED_ELEMENT" or "HEADING_LEVEL_NORMALIZED" or "DANGEROUS_URL_REMOVED");
    }

    [Fact]
    public void Word_nested_lists_tables_inline_media_and_temporary_media_remain_readable()
    {
        const string data="data:image/png;base64,iVBORw0KGgo=";
        var mediaId=Guid.NewGuid();
        var result=HelpJuiceHtmlConverter.Convert($"<o:p>Word text</o:p><ul><li>Outer<ul><li>Inner</li></ul></li></ul><table><tr><td>Cell</td></tr></table><img src='{data}' alt='Embedded'><img src='blob:https://teams.microsoft.com/temporary' alt='Teams image'>",
            source=>source==data?(mediaId,$"/api/media/{mediaId}/content"):null);

        Assert.Contains("Word text",result.PlainText);
        Assert.Contains("Outer",result.PlainText);Assert.Contains("Inner",result.PlainText);Assert.Contains("Cell",result.PlainText);
        Assert.Contains("bulletList",result.TiptapJson);Assert.Contains("tableCell",result.TiptapJson);
        Assert.Contains(mediaId.ToString(),result.TiptapJson);Assert.DoesNotContain("base64",result.TiptapJson,StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Teams image",result.PlainText);Assert.Contains(result.Warnings,x=>x.Code=="UNRESOLVED_TEMPORARY_MEDIA");
    }

    [Fact]
    public async Task Zip_slip_and_decompression_limits_are_rejected()
    {
        await using var slip=new MemoryStream();using(var zip=new ZipArchive(slip,ZipArchiveMode.Create,true)){var e=zip.CreateEntry("../questions.csv");await using var w=new StreamWriter(e.Open(),leaveOpen:false);await w.WriteAsync("id,name\n1,A");}slip.Position=0;
        await Assert.ThrowsAsync<InvalidDataException>(()=>HelpJuicePackageReader.ExtractAsync(slip,new()));
        await using var bomb=new MemoryStream();using(var zip=new ZipArchive(bomb,ZipArchiveMode.Create,true)){var e=zip.CreateEntry("questions.csv",CompressionLevel.SmallestSize);await using var s=e.Open();await s.WriteAsync(new byte[200_000]);}bomb.Position=0;
        await Assert.ThrowsAsync<InvalidDataException>(()=>HelpJuicePackageReader.ExtractAsync(bomb,new(){MaxCompressionRatio=2,MaxPackageSizeBytes=1_000_000,MaxExtractedSizeBytes=1_000_000}));
    }

    [Fact]
    public async Task Diagnostic_csv_preserves_each_issue_and_includes_grouped_and_entity_summaries()
    {
        using var package=Package("id,codename,name,is_published\nq1,one,First,true\nq2,two,Second,false",
            "id,question_id,body\na1,q1,Body\na2,q2,Body");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);
        var now=DateTime.UtcNow;
        var issues=new[]
        {
            new MigrationIssueData(Guid.NewGuid(),"Warning","questions.csv",2,"Question","q1","EXAMPLE_WARNING","First occurrence","field=one",now),
            new MigrationIssueData(Guid.NewGuid(),"Warning","questions.csv",3,"Question","q2","EXAMPLE_WARNING","Second occurrence","field=two",now),
            new MigrationIssueData(Guid.NewGuid(),"Error","answers.csv",3,"Answer","a2","EXAMPLE_ERROR","Blocking occurrence",null,now)
        };
        var report=Path.Combine(Path.GetTempPath(),$"hj-diagnostic-{Guid.NewGuid():N}.csv");
        try
        {
            await HelpJuiceDiagnosticReportWriter.WriteAsync(report,"export.zip",now,now,
                new Dictionary<string,int>{{"questions.csv",2},{"answers.csv",2}},0,source,issues,false,default);
            var csv=await File.ReadAllTextAsync(report);
            Assert.Equal(3,Count(csv,"EXAMPLE_WARNING"));
            Assert.Contains("\"Issue\",\"Error\",\"answers.csv\",\"3\",\"a2\",\"Answer\",\"Second\"",csv);
            Assert.Contains("\"Summary by issue type\",\"Warning\"",csv);
            Assert.Contains("\"Affected entities\"",csv);
            Assert.Contains("\"Total records scanned\",\"4\"",csv);
            Assert.Contains("\"End: total errors\",\"1\"",csv);
        }
        finally { if(File.Exists(report)) File.Delete(report); }
    }

    private static string TempFile(string content){var path=Path.Combine(Path.GetTempPath(),$"hj-{Guid.NewGuid():N}.csv");File.WriteAllText(path,content,new UTF8Encoding(false));return path;}
    private static int Count(string value,string needle){var count=0;for(var index=0;(index=value.IndexOf(needle,index,StringComparison.Ordinal))>=0;index+=needle.Length)count++;return count;}
    private static PackageContents Package(string questions,string answers,string? categories=null,string? categorizations=null,string? uploads=null,IReadOnlyList<string>? mediaNames=null){var root=Path.Combine(Path.GetTempPath(),$"hj-{Guid.NewGuid():N}");Directory.CreateDirectory(root);var q=Path.Combine(root,"questions.csv");var a=Path.Combine(root,"answers.csv");File.WriteAllText(q,questions);File.WriteAllText(a,answers);var files=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase){{"questions.csv",q},{"answers.csv",a}};if(categories is not null){var c=Path.Combine(root,"categories.csv");File.WriteAllText(c,categories);files["categories.csv"]=c;}if(categorizations is not null){var c=Path.Combine(root,"categorizations.csv");File.WriteAllText(c,categorizations);files["categorizations.csv"]=c;}if(uploads is not null){var u=Path.Combine(root,"uploads.csv");File.WriteAllText(u,uploads);files["uploads.csv"]=u;}var media=(mediaNames??[]).Select(name=>{var path=Path.Combine(root,name);File.WriteAllBytes(path,[1,2,3]);return path;}).ToArray();return new(root,files,media,files.Keys.Concat(mediaNames??[]).ToArray(),[]);}
}
