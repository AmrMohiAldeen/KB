import { describe, expect, it } from "vitest";
import { normalizeLinkUrl } from "./linkUrl";

describe("normalizeLinkUrl", () => {
  it("normalizes ordinary hostnames to HTTPS", () => {
    expect(normalizeLinkUrl("example.com")).toEqual({
      ok: true,
      url: "https://example.com/",
    });
  });

  it("allows safe absolute and relative URLs", () => {
    expect(normalizeLinkUrl("mailto:team@example.com").ok).toBe(true);
    expect(normalizeLinkUrl("/knowledge/article")).toEqual({
      ok: true,
      url: "/knowledge/article",
    });
  });

  it("rejects unsafe protocols", () => {
    expect(normalizeLinkUrl("javascript:alert(1)")).toEqual({
      ok: false,
      error: "Use HTTP, HTTPS, email, telephone, or a relative URL.",
    });
  });

  it("rejects protocol-relative URLs and embedded credentials", () => {
    expect(normalizeLinkUrl("//example.com").ok).toBe(false);
    expect(normalizeLinkUrl("https://user:password@example.com").ok).toBe(false);
  });
});
