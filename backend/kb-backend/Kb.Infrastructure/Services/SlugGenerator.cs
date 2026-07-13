using System.Globalization;
using System.Text;
using Kb.Application.Abstractions;

namespace Kb.Infrastructure.Services;

public sealed class SlugGenerator : ISlugGenerator
{
    public string Generate(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var normalized = value.Trim().Normalize(NormalizationForm.FormKD);
        var result = new StringBuilder(normalized.Length);
        var previousWasSeparator = false;

        foreach (var character in normalized)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(character);
            if (category == UnicodeCategory.NonSpacingMark)
                continue;

            if (char.IsLetterOrDigit(character))
            {
                result.Append(char.ToLowerInvariant(character));
                previousWasSeparator = false;
            }
            else if (!previousWasSeparator && result.Length > 0)
            {
                result.Append('-');
                previousWasSeparator = true;
            }
        }

        return result.Length > 0 && result[^1] == '-'
            ? result.ToString(0, result.Length - 1)
            : result.ToString();
    }
}
