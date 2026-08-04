using System.ComponentModel.DataAnnotations;
using System.Text;
using System.Text.Json;

namespace Kb.Contracts.Common;

[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class NonEmptyGuidAttribute : ValidationAttribute
{
    public override bool IsValid(object? value) => value switch { null => true, Guid id => id != Guid.Empty, _ => false };
    public override string FormatErrorMessage(string name) => $"{name} must not be an empty GUID.";
}

[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class NonWhiteSpaceAttribute : ValidationAttribute
{
    public override bool IsValid(object? value) => value is null || value is string text && !string.IsNullOrWhiteSpace(text);
    public override string FormatErrorMessage(string name) => $"{name} must not be empty or whitespace.";
}

[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class Base64RowVersionAttribute : ValidationAttribute
{
    public override bool IsValid(object? value)
    {
        if (value is not string text || string.IsNullOrWhiteSpace(text)) return false;
        Span<byte> buffer = stackalloc byte[text.Length];
        return Convert.TryFromBase64String(text, buffer, out var bytesWritten) && bytesWritten > 0;
    }

    public override string FormatErrorMessage(string name) => $"{name} must be a valid non-empty Base64 value.";
}

[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class TiptapDocumentAttribute : ValidationAttribute
{
    public override bool IsValid(object? value)
    {
        if (value is not JsonElement content || content.ValueKind != JsonValueKind.Object) return false;
        if (!content.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String || type.GetString() != "doc") return false;
        return Encoding.UTF8.GetByteCount(content.GetRawText()) <= ContractLimits.MaxTiptapJsonBytes;
    }

    public override string FormatErrorMessage(string name) =>
        $"{name} must be a Tiptap JSON object with a 'doc' root no larger than {ContractLimits.MaxTiptapJsonBytes} bytes.";
}

[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class TiptapDocumentRootAttribute : ValidationAttribute
{
    public override bool IsValid(object? value) =>
        value is JsonElement { ValueKind: JsonValueKind.Object } content &&
        content.TryGetProperty("type", out var type) &&
        type.ValueKind == JsonValueKind.String &&
        type.GetString() == "doc";

    public override string FormatErrorMessage(string name) =>
        $"{name} must be a Tiptap JSON object with a 'doc' root.";
}
