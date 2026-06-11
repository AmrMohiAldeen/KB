const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export type LinkUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export function normalizeLinkUrl(value: string): LinkUrlResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a URL or remove the existing link." };
  }

  if (/^(?:\/(?!\/)|\.{1,2}\/|#|\?)/.test(trimmed)) {
    return { ok: true, url: trimmed };
  }

  if (trimmed.startsWith("//")) {
    return { ok: false, error: "Protocol-relative URLs are not allowed." };
  }

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return { ok: false, error: "Use HTTP, HTTPS, email, telephone, or a relative URL." };
    }

    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.hostname) {
      return { ok: false, error: "Enter a valid website URL." };
    }

    if (parsed.username || parsed.password) {
      return { ok: false, error: "URLs containing credentials are not allowed." };
    }

    if ((parsed.protocol === "mailto:" || parsed.protocol === "tel:") && !parsed.pathname) {
      return { ok: false, error: "Enter a valid email address or telephone number." };
    }

    return { ok: true, url: parsed.href };
  } catch {
    return { ok: false, error: "Enter a valid URL." };
  }
}
