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
        foreach (var name in new[] { "questions.csv", "answers.csv", "categories.csv", "categorizations.csv", "uploads.csv", "passes.csv", "groups.csv", "users.csv" })
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
        Assert.DoesNotContain(source.Issues,x=>x.ErrorCode=="HISTORICAL_USER_MAPPED_TO_MIGRATION_USER");
        Assert.Equal("11",source.Questions.Single(x=>x.Id=="q1").LegacyAuthorExternalId);
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
    public async Task Missing_translated_category_relationship_is_reconstructed_only_through_matching_translation_ids()
    {
        using var package=Package(
            "id,name,language_id,translation_id,categories_count\nq-en,English,1,,1\nq-ar,Arabic,23,q-en,1",
            "id,question_id,body\na-en,q-en,English body\na-ar,q-ar,Arabic body",
            "id,parent_id,name,language_id,translation_id\nc-en,,Guides,1,\nc-ar,,Guides Arabic,23,c-en",
            "id,question_id,category_id,position\nx1,q-en,c-en,1");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);

        var translated=source.Questions.Single(question=>question.Id=="q-ar");
        Assert.Equal("c-ar",translated.CategoryId);
        Assert.Equal("translation_id",translated.Source["migration.category_reconstruction"]);
        Assert.Contains(source.Issues,issue=>issue.ExternalId=="q-ar"&&issue.ErrorCode=="CATEGORY_RELATIONSHIP_RECONSTRUCTED");
        Assert.DoesNotContain(source.Issues,issue=>issue.ExternalId=="q-ar"&&issue.ErrorCode is "CATEGORY_COUNT_MISMATCH" or "UNCATEGORIZED_ARTICLE");
    }

    [Fact]
    public async Task Ambiguous_translated_category_relationship_keeps_the_original_warnings()
    {
        using var package=Package(
            "id,name,language_id,translation_id,categories_count\nq-en,English,1,,1\nq-ar,Arabic,23,q-en,1",
            "id,question_id,body\na-en,q-en,English body\na-ar,q-ar,Arabic body",
            "id,parent_id,name,language_id,translation_id\nc-en,,Guides,1,\nc-ar-1,,First Arabic match,23,c-en\nc-ar-2,,Second Arabic match,23,c-en",
            "id,question_id,category_id,position\nx1,q-en,c-en,1");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);

        Assert.Null(source.Questions.Single(question=>question.Id=="q-ar").CategoryId);
        Assert.DoesNotContain(source.Issues,issue=>issue.ExternalId=="q-ar"&&issue.ErrorCode=="CATEGORY_RELATIONSHIP_RECONSTRUCTED");
        Assert.Contains(source.Issues,issue=>issue.ExternalId=="q-ar"&&issue.ErrorCode=="CATEGORY_COUNT_MISMATCH");
        Assert.Contains(source.Issues,issue=>issue.ExternalId=="q-ar"&&issue.ErrorCode=="UNCATEGORIZED_ARTICLE");
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
    public void Legacy_table_columns_and_noninteractive_form_controls_remain_readable()
    {
        var result=HelpJuiceHtmlConverter.Convert("<table><colgroup><col></colgroup><tr><td>Value</td></tr></table><button>Continue</button><input type='checkbox' checked='checked'><input value='Account name'>");

        Assert.Contains("Value",result.PlainText);
        Assert.Contains("Continue",result.PlainText);
        Assert.Contains("[x]",result.PlainText);
        Assert.Contains("[Account name]",result.PlainText);
        Assert.DoesNotContain(result.Warnings,warning=>warning.Code=="UNSUPPORTED_ELEMENT");
    }

    [Fact]
    public void HelpJuice_callouts_tabs_and_accordions_become_existing_editor_nodes()
    {
        var html="""
            <div class="helpjuice-callout warning"><div class="helpjuice-callout-body"><h3>Careful</h3><p><strong>Keep</strong> this.</p></div><div class="helpjuice-callout-delete">x</div></div>
            <div class="helpjuice-tab"><div class="helpjuice-tab-title">First</div><div class="helpjuice-tab-body"><p><em>One</em></p></div></div>
            <div class="helpjuice-tab"><div class="helpjuice-tab-title">Second</div><div class="helpjuice-tab-body"><p>Two</p></div></div>
            <div class="f-accordion-panel panel"><div class="panel-title">Section A</div><div class="panel-content"><p><u>Details</u></p></div></div>
            <div class="f-accordion-panel panel"><div class="panel-title">Section B</div><div class="panel-content"><p>More</p></div></div>
            """;
        var result=HelpJuiceHtmlConverter.Convert(html);

        Assert.Contains("\"type\":\"callout\"",result.TiptapJson);
        Assert.Contains("\"variant\":\"warning\"",result.TiptapJson);
        Assert.Contains("\"type\":\"tabs\"",result.TiptapJson);
        Assert.Equal(1,Count(result.TiptapJson,"\"type\":\"tabs\""));
        Assert.Contains("\"label\":\"First\"",result.TiptapJson);
        Assert.True(result.TiptapJson.IndexOf("First",StringComparison.Ordinal)<result.TiptapJson.IndexOf("Second",StringComparison.Ordinal));
        Assert.Contains("\"type\":\"accordion\"",result.TiptapJson);
        Assert.Equal(1,Count(result.TiptapJson,"\"type\":\"accordion\""));
        Assert.Contains("\"title\":\"Section A\"",result.TiptapJson);
        Assert.Contains("\"type\":\"bold\"",result.TiptapJson);
        Assert.Contains("\"type\":\"italic\"",result.TiptapJson);
        Assert.DoesNotContain("helpjuice-callout-delete",result.RenderedHtml);
        Assert.Contains("data-kb-callout",result.RenderedHtml);
        Assert.Contains("data-kb-tabs",result.RenderedHtml);
        Assert.Contains("data-kb-accordion",result.RenderedHtml);
    }

    [Fact]
    public async Task Historical_authors_and_visibility_are_resolved_without_importing_RBAC()
    {
        using var package=Package(
            "id,name,created_by_id,visibility_id,category_id\nq1,Internal article,u1,0,c1\nq2,Inherited article,u1,,c1",
            "id,question_id,body\na1,q1,Body\na2,q2,Body",
            "id,parent_id,name,accessibility\nc1,,Private guides,1",
            users:"id,first_name,last_name,email\nu1,Ada,Lovelace,ada@example.test",
            passes:"id,passable_type,passable_id\np1,Category,c1");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);

        Assert.All(source.Questions,question=>Assert.Equal("Internal",question.Visibility));
        Assert.Equal("Internal",Assert.Single(source.Categories).Visibility);
        Assert.All(source.Questions,question=>Assert.Equal("Ada Lovelace",question.LegacyAuthorName));
        Assert.All(source.Questions,question=>Assert.Equal("ada@example.test",question.LegacyAuthorEmail));
        Assert.DoesNotContain(source.Issues,issue=>issue.ErrorCode is "HISTORICAL_USER_MAPPED_TO_MIGRATION_USER" or "LEGACY_PERMISSIONS_NOT_IMPORTED");
        var preview=HelpJuicePreviewBuilder.Build(source,10);
        Assert.All(preview.Articles,article=>Assert.Equal("Internal",article.Visibility));
        Assert.All(preview.Articles,article=>Assert.Equal("Ada Lovelace",article.LegacyAuthorName));
    }

    [Fact]
    public async Task Historical_author_keeps_unresolved_id_and_distinguishes_missing_created_by_id()
    {
        using var package=Package(
            "id,name,created_by_id\nq1,Email author,u1\nq2,Missing account,u2\nq3,Missing attribution,",
            "id,question_id,body\na1,q1,Body\na2,q2,Body\na3,q3,Body",
            users:"id,email\nu1,ada@example.test");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);

        var emailAuthor=source.Questions.Single(question=>question.Id=="q1");
        Assert.Null(emailAuthor.LegacyAuthorName);Assert.Equal("ada@example.test",emailAuthor.LegacyAuthorEmail);
        var missingAccount=source.Questions.Single(question=>question.Id=="q2");
        Assert.Null(missingAccount.LegacyAuthorName);Assert.Null(missingAccount.LegacyAuthorEmail);
        Assert.Equal("u2",missingAccount.LegacyAuthorExternalId);
        Assert.Null(source.Questions.Single(question=>question.Id=="q3").LegacyAuthorExternalId);
        Assert.Contains(source.Issues,issue=>issue.ErrorCode=="HELPJUICE_AUTHOR_MAPPING_MISSING"&&issue.ExternalId=="q2");
        Assert.Contains(source.Issues,issue=>issue.ErrorCode=="HELPJUICE_AUTHOR_ID_MISSING"&&issue.ExternalId=="q3");
        Assert.Contains(source.Issues,issue=>issue.ErrorCode=="HELPJUICE_AUTHOR_RESOLVED"&&issue.ExternalId=="q1");
    }

    [Fact]
    public async Task Historical_author_matches_created_by_id_to_users_id_only()
    {
        using var package=Package(
            "id,name,created_by_id\nq1,Account keyed author,account-42",
            "id,question_id,body\na1,q1,Body",
            users:"id,account_id,first_name,last_name,email\naccount-42,legacy-account,Grace,Hopper,grace@example.test");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);

        var article=Assert.Single(source.Questions);
        Assert.Equal("account-42",article.LegacyAuthorExternalId);
        Assert.Equal("Grace Hopper",article.LegacyAuthorName);
        Assert.Equal("grace@example.test",article.LegacyAuthorEmail);
        Assert.DoesNotContain(source.Issues,issue=>issue.ErrorCode=="UNSUPPORTED_FILE");
    }

    [Fact]
    public async Task Author_resolver_caches_optional_lookup_results_during_an_import()
    {
        using var package=Package("id,name,created_by_id\nq1,One,u1\nq2,Two,u1",
            "id,question_id,body\na1,q1,Body\na2,q2,Body");
        var lookup=new CountingAuthorLookup(new("u1","Ada API","ada@example.test"));

        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System,
            authorLookup:lookup);

        Assert.All(source.Questions,question=>Assert.Equal("Ada API",question.LegacyAuthorName));
        Assert.Equal(1,lookup.CallCount);
    }

    [Fact]
    public void HelpJuice_text_colors_survive_nested_spans_and_legacy_font_markup()
    {
        var result=HelpJuiceHtmlConverter.Convert("""
            <p style="color: rgb(10, 20, 30)">Outer
              <span style="color:#ff0066">hex <span data-text-color="rgba(1, 2, 3, 0.5)">nested</span></span>
              <font color="blue">named</font>
            </p>
            """);

        Assert.Contains("\"color\":\"rgb(10, 20, 30)\"",result.TiptapJson);
        Assert.Contains("\"color\":\"#ff0066\"",result.TiptapJson);
        Assert.Contains("\"color\":\"rgba(1, 2, 3, 0.5)\"",result.TiptapJson);
        Assert.Contains("\"color\":\"blue\"",result.TiptapJson);
        Assert.Contains("color:#ff0066",result.RenderedHtml);
        Assert.DoesNotContain(result.Warnings,warning=>warning.Code=="UNSUPPORTED_TEXT_COLOR");
    }

    [Fact]
    public void Invalid_HelpJuice_text_color_is_reported_instead_of_silently_dropped()
    {
        var result=HelpJuiceHtmlConverter.Convert("<span style=\"color: var(--unsafe)\">Text</span>");

        Assert.Contains(result.Warnings,warning=>warning.Code=="UNSUPPORTED_TEXT_COLOR");
        Assert.DoesNotContain("var(--unsafe)",result.TiptapJson);
    }

    [Fact]
    public void HelpJuice_percentage_table_and_colgroup_widths_map_to_Tiptap_attributes()
    {
        var result=HelpJuiceHtmlConverter.Convert("""
            <table width="75%"><colgroup><col style="width:25%"><col width="75%"></colgroup>
              <tr><th>Narrow</th><th>Wide</th></tr><tr><td>A</td><td>B</td></tr>
            </table>
            """);

        Assert.Contains("\"tableWidthPct\":75",result.TiptapJson);
        Assert.Contains("\"colwidth\":[250]",result.TiptapJson);
        Assert.Contains("\"colwidth\":[750]",result.TiptapJson);
        Assert.Contains("data-table-width-pct=\"75\"",result.RenderedHtml);
        Assert.Contains("<colgroup><col width=\"250\"",result.RenderedHtml);
    }

    [Fact]
    public void HelpJuice_pixel_table_and_uneven_cell_widths_survive_conversion()
    {
        var result=HelpJuiceHtmlConverter.Convert("""
            <table style="width:640px"><tr><td width="180">Narrow</td><td style="width:460px">Wide</td></tr></table>
            """);

        Assert.Contains("\"tableWidthPx\":640",result.TiptapJson);
        Assert.Contains("\"colwidth\":[180]",result.TiptapJson);
        Assert.Contains("\"colwidth\":[460]",result.TiptapJson);
        Assert.Contains("data-table-width-px=\"640\"",result.RenderedHtml);
        Assert.DoesNotContain(result.Warnings,warning=>warning.Code.StartsWith("UNSUPPORTED_TABLE",StringComparison.Ordinal));
    }

    [Fact]
    public async Task Category_relationships_are_recovered_only_from_explicit_or_unambiguous_export_metadata()
    {
        using var package=Package(
            "id,name,language_id,categories_count,categories,first_category\nq1,Structured,3,1,\"[{\"\"id\"\":\"\"c1\"\"}]\",\nq2,Named,3,1,,Guides\nq3,Reverse,3,1,,",
            "id,question_id,body\na1,q1,Body\na2,q2,Body\na3,q3,Body",
            "id,parent_id,name,codename,language_id,question_ids\nc1,,Guides,guides,3,\nc2,,Reference,reference,3,q3");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);

        Assert.Equal("c1",source.Questions.Single(question=>question.Id=="q1").CategoryId);
        Assert.Equal("c1",source.Questions.Single(question=>question.Id=="q2").CategoryId);
        Assert.Equal("c2",source.Questions.Single(question=>question.Id=="q3").CategoryId);
        Assert.Equal(3,source.Issues.Count(issue=>issue.ErrorCode=="CATEGORY_RELATIONSHIP_RECONSTRUCTED"));
        Assert.DoesNotContain(source.Issues,issue=>issue.ErrorCode is "CATEGORY_COUNT_MISMATCH" or "UNCATEGORIZED_ARTICLE");
    }

    [Fact]
    public async Task Permission_rows_with_alternate_target_columns_only_affect_internal_visibility()
    {
        using var package=Package("id,name\nq1,Private", "id,question_id,body\na1,q1,Body",
            passes:"id,user_id,document_id\np1,u1,q1");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);

        Assert.Equal("Internal",Assert.Single(source.Questions).Visibility);
        Assert.DoesNotContain(source.Issues,issue=>issue.ErrorCode=="LEGACY_PERMISSIONS_NOT_IMPORTED");
    }

    [Fact]
    public void Internal_links_resolve_query_aliases_titles_and_migration_slugs()
    {
        var question=new HelpJuiceQuestion(2,"q1","allocated-target-q1","Manage Subjects",null,true,null,null,null,
            new Dictionary<string,string>{{"codename","old-subjects"}});
        var resolver=HelpJuiceSourceParser.CreateLinkResolver([question],question);

        Assert.Equal("/kb/allocated-target-q1",resolver("https://docs.helpjuice.com/link?contentId=q1")?.Url);
        Assert.Equal("/kb/allocated-target-q1",resolver("https://docs.helpjuice.com/manage-subjects")?.Url);
        Assert.Equal("/kb/allocated-target-q1",resolver("https://docs.helpjuice.com/allocated-target-q1")?.Url);
    }

    [Fact]
    public void Internal_links_prefer_the_persisted_old_to_new_article_mapping()
    {
        var question=new HelpJuiceQuestion(2,"1881001","source-slug","Mapped",null,true,null,null,null,
            new Dictionary<string,string>{{"codename","source-slug"}});
        var resolver=HelpJuiceSourceParser.CreateLinkResolver([question],question,
            new Dictionary<string,string>{{"1881001","current-kb-slug"}});

        Assert.Equal("/kb/current-kb-slug",resolver("https://docs.helpjuice.com/1881001-source-slug")?.Url);
    }

    [Fact]
    public void Lazy_and_protocol_relative_embed_urls_are_recovered_safely()
    {
        var result=HelpJuiceHtmlConverter.Convert("<iframe data-src='//www.youtube.com/embed/dQw4w9WgXcQ'></iframe>");

        Assert.Contains("https://www.youtube.com/watch?v=dQw4w9WgXcQ",result.TiptapJson);
        Assert.DoesNotContain(result.Warnings,warning=>warning.Code=="UNSAFE_EMBED_REMOVED");
    }

    [Fact]
    public async Task Packaged_media_matches_unambiguous_filename_punctuation_variants()
    {
        using var package=Package("id,name\nq1,One", "id,question_id,body\na1,q1,Body",
            uploads:"id,image,preview_url\nu1,Attachment 4.png,", mediaNames:["Attachment_4.png"]);
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);

        Assert.DoesNotContain(source.Issues,issue=>issue.ErrorCode=="MISSING_MEDIA_URL");
    }

    [Fact]
    public async Task Genuinely_unrecoverable_source_data_keeps_diagnostic_warnings()
    {
        using var package=Package(
            "id,name,has_draft_revision_after_current_revision\nq1,Incomplete,true",
            "id,question_id,body\na1,q1,\"<custom-widget>Readable</custom-widget><a href='https://docs.helpjuice.com/not-in-export'>Missing</a>\"",
            passes:"id,passable_type,passable_id\np1,Question,not-in-export");
        var source=await HelpJuiceSourceParser.ParseAndValidateAsync(package,new(),TimeProvider.System);

        Assert.Contains(source.Issues,issue=>issue.ErrorCode=="UNRECONSTRUCTABLE_NEWER_DRAFT");
        Assert.Contains(source.Issues,issue=>issue.ErrorCode=="UNSUPPORTED_ELEMENT");
        Assert.Contains(source.Issues,issue=>issue.ErrorCode=="UNRESOLVED_INTERNAL_LINK");
        Assert.Contains(source.Issues,issue=>issue.ErrorCode=="LEGACY_PERMISSIONS_NOT_IMPORTED");
    }

    [Fact]
    public void Internal_links_resolve_html_suffixed_legacy_codenames()
    {
        var question=new HelpJuiceQuestion(2,"q1","manage-subjects","Manage subjects",null,true,null,null,null,
            new Dictionary<string,string>{{"codename","manage-subjects"}});
        var resolver=HelpJuiceSourceParser.CreateLinkResolver([question],question);

        Assert.Equal("/kb/manage-subjects",resolver("https://docs.helpjuice.com/kb/manage-subjects.html")?.Url);
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
    private sealed class CountingAuthorLookup(HelpJuiceLegacyAuthor author):IHelpJuiceAuthorLookup
    {
        public int CallCount { get; private set; }
        public Task<HelpJuiceLegacyAuthor?> FindByIdAsync(string externalId,CancellationToken cancellationToken)
        { CallCount++;return Task.FromResult<HelpJuiceLegacyAuthor?>(externalId==author.ExternalId?author:null); }
    }
    private static PackageContents Package(string questions,string answers,string? categories=null,string? categorizations=null,string? uploads=null,IReadOnlyList<string>? mediaNames=null,string? users=null,string? passes=null){var root=Path.Combine(Path.GetTempPath(),$"hj-{Guid.NewGuid():N}");Directory.CreateDirectory(root);var q=Path.Combine(root,"questions.csv");var a=Path.Combine(root,"answers.csv");File.WriteAllText(q,questions);File.WriteAllText(a,answers);var files=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase){{"questions.csv",q},{"answers.csv",a}};if(categories is not null){var c=Path.Combine(root,"categories.csv");File.WriteAllText(c,categories);files["categories.csv"]=c;}if(categorizations is not null){var c=Path.Combine(root,"categorizations.csv");File.WriteAllText(c,categorizations);files["categorizations.csv"]=c;}if(uploads is not null){var u=Path.Combine(root,"uploads.csv");File.WriteAllText(u,uploads);files["uploads.csv"]=u;}if(users is not null){var u=Path.Combine(root,"users.csv");File.WriteAllText(u,users);files["users.csv"]=u;}if(passes is not null){var p=Path.Combine(root,"passes.csv");File.WriteAllText(p,passes);files["passes.csv"]=p;}var media=(mediaNames??[]).Select(name=>{var path=Path.Combine(root,name);File.WriteAllBytes(path,[1,2,3]);return path;}).ToArray();return new(root,files,media,files.Keys.Concat(mediaNames??[]).ToArray(),[]);}
}
