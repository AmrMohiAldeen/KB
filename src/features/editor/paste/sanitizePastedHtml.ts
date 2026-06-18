import { logDevError } from '../utils/logDevError';
import {
  hasAcceptableDepth,
  hasAcceptableNodeCount,
  removeComments,
} from './domLimits';
import { normalizeWordPaste } from './normalizeWordPaste';
import { MAX_PASTED_HTML_LENGTH } from './pasteSanitizerConfig';
import type {
  PasteSanitizeFailureReason,
  PasteSanitizeResult,
  SanitizePastedHTMLResult,
} from './pasteSanitizerTypes';
import { normalizePastedStructure, sanitizeDom } from './sanitizeDom';

export type {
  PasteSanitizeFailureReason,
  PasteSanitizeResult,
  SanitizePastedHTMLFailureReason,
  SanitizePastedHTMLResult,
} from './pasteSanitizerTypes';

function sanitizeFailure(
  reason: PasteSanitizeFailureReason,
): PasteSanitizeResult {
  return { ok: false, html: '', reason };
}

export function sanitizePastedHTMLWithResult(
  html: string,
): SanitizePastedHTMLResult {
  if (html === '') return { ok: true, html: '' };
  if (typeof DOMParser === 'undefined') {
    return sanitizeFailure('unsupported-environment');
  }
  if (html.length > MAX_PASTED_HTML_LENGTH) return sanitizeFailure('too-large');

  try {
    const document = new DOMParser().parseFromString(html, 'text/html');
    if (!hasAcceptableNodeCount(document.body)) {
      return sanitizeFailure('too-many-nodes');
    }
    if (!hasAcceptableDepth(document.body)) return sanitizeFailure('too-deep');

    removeComments(document.body);
    normalizeWordPaste(document.body);
    sanitizeDom(document.body);
    normalizePastedStructure(document.body);
    sanitizeDom(document.body);

    return { ok: true, html: document.body.innerHTML };
  } catch (error) {
    logDevError('Paste sanitization failed:', error);
    return sanitizeFailure('parse-error');
  }
}

export function sanitizePastedHTML(html: string): string {
  return sanitizePastedHTMLWithResult(html).html;
}
