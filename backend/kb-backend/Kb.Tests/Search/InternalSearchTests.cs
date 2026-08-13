using System.Net;
using System.Text;
using Kb.Application.Abstractions;
using Kb.Application.Exceptions;
using Kb.Application.Search;
using Kb.Infrastructure.Search;
using Microsoft.Extensions.Options;

namespace Kb.Tests.Search;

public sealed class InternalSearchTests
{
    [Fact]
    public async Task Service_requires_authentication_and_validates_pagination()
    {
        var client = new CapturingClient();
        var current = new CurrentUser(false);
        var service = new InternalSearchService(client, current);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            service.SearchAsync("draft", null, null, null, 1, 25, default));
        current.Authenticated = true;
        await Assert.ThrowsAsync<BusinessRuleException>(() =>
            service.SearchAsync("draft", null, null, null, 0, 25, default));
        await service.SearchAsync("  draft body  ", "Archived", null, null, 2, 20, default);
        Assert.Equal(new InternalSearchQuery("draft body", "Archived", null, null, 2, 20), client.Query);
    }

    [Fact]
    public async Task Typesense_query_prioritizes_titles_enables_typos_and_sends_filters_backend_side()
    {
        var handler = new TypesenseHandler();
        var options = Options.Create(new InternalSearchOptions
        {
            Endpoint = "https://typesense.example.test/",
            AdminApiKey = "server-only-key",
            CollectionAlias = "internal_kb_documents"
        });
        var client = new TypesenseInternalSearchClient(new HttpClient(handler), options);
        await client.SearchAsync(new InternalSearchQuery("onbaording", "Archived",
            Guid.Parse("11111111-1111-1111-1111-111111111111"),
            Guid.Parse("22222222-2222-2222-2222-222222222222"), 1, 25), default);

        var query = handler.SearchUri!.Query;
        Assert.Contains("query_by=title%2Ccategory_path%2Cbody", query);
        Assert.Contains("query_by_weights=16%2C5%2C1", query);
        Assert.Contains("num_typos=2%2C1%2C2", query);
        Assert.Contains("prioritize_exact_match=true", query);
        Assert.Contains("status%3A%3D%60Archived%60", query);
        Assert.Equal("server-only-key", handler.ApiKey);
    }

    private sealed class CapturingClient : IInternalSearchClient
    {
        public InternalSearchQuery? Query { get; private set; }
        public Task<InternalSearchResult> SearchAsync(InternalSearchQuery query, CancellationToken cancellationToken)
        {
            Query = query;
            return Task.FromResult(new InternalSearchResult([], 0, query.Page, query.PageSize, [], [], []));
        }
    }

    private sealed class CurrentUser(bool authenticated) : ICurrentUser
    {
        public bool Authenticated { get; set; } = authenticated;
        public bool IsAuthenticated => Authenticated;
        public Guid UserId => Guid.NewGuid();
        public string? Email => null;
    }

    private sealed class TypesenseHandler : HttpMessageHandler
    {
        public Uri? SearchUri { get; private set; }
        public string? ApiKey { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            ApiKey = request.Headers.GetValues("X-TYPESENSE-API-KEY").Single();
            if (request.RequestUri!.AbsolutePath.StartsWith("/aliases/"))
                return Json("{\"collection_name\":\"internal_kb_documents_initial\"}");
            SearchUri = request.RequestUri;
            return Json("{\"found\":0,\"hits\":[],\"facet_counts\":[]}");
        }
        private static Task<HttpResponseMessage> Json(string value) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        { Content = new StringContent(value, Encoding.UTF8, "application/json") });
    }
}
