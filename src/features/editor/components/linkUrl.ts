const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export type LinkUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

function isValidMailtoUrl(parsed: URL): boolean {
  const address = decodeURIComponent(parsed.pathname);

  if (!address) return false;

  // Allows one email or multiple comma-separated emails.
  return address.split(",").every((email) => isValidEmailAddress(email));
}

function isValidTelUrl(parsed: URL): boolean {
  const phone = decodeURIComponent(parsed.pathname);

  if (!phone) return false;

  // Allows common phone URL formats like:
  // tel:+971501234567
  // tel:0501234567
  // tel:+1-555-123-4567
  return /^\+?[0-9().-]{3,20}$/.test(phone);
}

export function normalizeLinkUrl(value: string): LinkUrlResult {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: false, error: "Enter a URL or remove the existing link." };
  }

  if (/[\u0000-\u001F\u007F\s]/.test(trimmed)) {
    return {
      ok: false,
      error: "URLs cannot contain spaces or control characters.",
    };
  }

  if (trimmed.startsWith("//")) {
    return { ok: false, error: "Protocol-relative URLs are not allowed." };
  }

  if (/^(?:\/(?!\/)|\.{1,2}\/|#|\?)/.test(trimmed)) {
    return { ok: true, url: trimmed };
  }

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return {
        ok: false,
        error: "Use HTTP, HTTPS, email, telephone, or a relative URL.",
      };
    }

    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.hostname
    ) {
      return { ok: false, error: "Enter a valid website URL." };
    }

    if (parsed.username || parsed.password) {
      return {
        ok: false,
        error: "URLs containing credentials are not allowed.",
      };
    }

    if (parsed.protocol === "mailto:" && !isValidMailtoUrl(parsed)) {
      return { ok: false, error: "Enter a valid email address." };
    }

    if (parsed.protocol === "tel:" && !isValidTelUrl(parsed)) {
      return { ok: false, error: "Enter a valid telephone number." };
    }

    return { ok: true, url: parsed.href };
  } catch {
    return { ok: false, error: "Enter a valid URL." };
  }
}