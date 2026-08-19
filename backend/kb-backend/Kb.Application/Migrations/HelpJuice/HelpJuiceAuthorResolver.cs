namespace Kb.Application.Migrations.HelpJuice;

public sealed record HelpJuiceLegacyAuthor(string ExternalId, string? Name, string? Email);

/// <summary>
/// Optional source for Helpjuice authors that are not present in users.csv.
/// A future API implementation can call GET /api/v3/users/{id}; the importer
/// consumes its result through the same cached resolver as CSV mappings.
/// </summary>
public interface IHelpJuiceAuthorLookup
{
    Task<HelpJuiceLegacyAuthor?> FindByIdAsync(string externalId, CancellationToken cancellationToken);
}

public sealed class HelpJuiceAuthorResolver(
    IReadOnlyDictionary<string, HelpJuiceLegacyAuthor> mappings,
    IHelpJuiceAuthorLookup? fallback = null)
{
    private readonly Dictionary<string, HelpJuiceLegacyAuthor?> cache =
        new(StringComparer.OrdinalIgnoreCase);

    public async Task<HelpJuiceLegacyAuthor?> ResolveAsync(string externalId,
        CancellationToken cancellationToken)
    {
        if (cache.TryGetValue(externalId, out var cached)) return cached;

        if (mappings.TryGetValue(externalId, out var mapped))
        {
            cache[externalId] = mapped;
            return mapped;
        }

        var resolved = fallback is null
            ? null
            : await fallback.FindByIdAsync(externalId, cancellationToken);
        cache[externalId] = resolved;
        return resolved;
    }
}
