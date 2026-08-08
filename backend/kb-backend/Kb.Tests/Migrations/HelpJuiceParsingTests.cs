using System.IO.Compression;
using System.Text;
using System.Text.Json;
using Kb.Application.Migrations.HelpJuice;

namespace Kb.Tests.Migrations;

public sealed class HelpJuiceParsingTests
{
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
        Assert.Equal(1,source.Summary.MissingMedia);Assert.Contains(source.Issues,x=>x.ErrorCode=="MEDIA_UNRESOLVED");
    }

    [Fact]
    public async Task Preview_contains_content_category_metadata_and_only_issues_for_previewed_articles()
    {
        using var package=Package("id,codename,name,is_published,category_id,user_id\nq1,one,One,TRUE,c1,u1\nq2,two,Two,FALSE,c2,u2",
            "id,question_id,body\na1,q1,\"<p>First body</p><img src='missing.png'>\"\na2,q2,\"<p>Second body</p><img src='also-missing.png'>\"",
            "id,parent_id,name\nc0,,Guides\nc1,c0,Setup\nc2,,Other");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);
        var preview=HelpJuicePreviewBuilder.Build(source,1);

        var article=Assert.Single(preview.Articles);
        Assert.True(preview.IsLimited);Assert.Equal(2,preview.SourceArticleCount);
        Assert.Equal("One",article.Title);Assert.Equal("Guides / Setup",article.CategoryLocation);
        Assert.Contains("First body",article.ContentHtml);Assert.Equal("u1",article.SourceMetadata["question.user_id"]);
        Assert.Contains(article.Issues,issue=>issue.ErrorCode=="MEDIA_UNRESOLVED"&&issue.ExternalId=="a1");
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
    public async Task Zip_slip_and_decompression_limits_are_rejected()
    {
        await using var slip=new MemoryStream();using(var zip=new ZipArchive(slip,ZipArchiveMode.Create,true)){var e=zip.CreateEntry("../questions.csv");await using var w=new StreamWriter(e.Open(),leaveOpen:false);await w.WriteAsync("id,name\n1,A");}slip.Position=0;
        await Assert.ThrowsAsync<InvalidDataException>(()=>HelpJuicePackageReader.ExtractAsync(slip,new()));
        await using var bomb=new MemoryStream();using(var zip=new ZipArchive(bomb,ZipArchiveMode.Create,true)){var e=zip.CreateEntry("questions.csv",CompressionLevel.SmallestSize);await using var s=e.Open();await s.WriteAsync(new byte[200_000]);}bomb.Position=0;
        await Assert.ThrowsAsync<InvalidDataException>(()=>HelpJuicePackageReader.ExtractAsync(bomb,new(){MaxCompressionRatio=2,MaxPackageSizeBytes=1_000_000,MaxExtractedSizeBytes=1_000_000}));
    }

    private static string TempFile(string content){var path=Path.Combine(Path.GetTempPath(),$"hj-{Guid.NewGuid():N}.csv");File.WriteAllText(path,content,new UTF8Encoding(false));return path;}
    private static PackageContents Package(string questions,string answers,string? categories=null){var root=Path.Combine(Path.GetTempPath(),$"hj-{Guid.NewGuid():N}");Directory.CreateDirectory(root);var q=Path.Combine(root,"questions.csv");var a=Path.Combine(root,"answers.csv");File.WriteAllText(q,questions);File.WriteAllText(a,answers);var files=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase){{"questions.csv",q},{"answers.csv",a}};if(categories is not null){var c=Path.Combine(root,"categories.csv");File.WriteAllText(c,categories);files["categories.csv"]=c;}return new(root,files,[],files.Keys.ToArray(),[]);}
}
