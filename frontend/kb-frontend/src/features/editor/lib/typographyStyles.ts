const CSS_WIDE_KEYWORDS = /^(?:inherit|initial|revert|revert-layer|unset)$/i;
const FONT_SIZE_KEYWORDS = /^(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|larger|smaller|math)$/i;
const CSS_NUMBER = String.raw`(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`;
const CSS_LENGTH_UNITS =
  '(?:px|pt|pc|in|cm|mm|q|em|rem|ex|ch|cap|ic|lh|rlh|vw|vh|vi|vb|vmin|vmax|svw|svh|svi|svb|svmin|svmax|lvw|lvh|lvi|lvb|lvmin|lvmax|dvw|dvh|dvi|dvb|dvmin|dvmax|cqw|cqh|cqi|cqb|cqmin|cqmax)';
const NON_NEGATIVE_LENGTH_PERCENTAGE = new RegExp(
  `^\\+?(${CSS_NUMBER})(${CSS_LENGTH_UNITS}|%)$`,
  'i',
);
const NON_NEGATIVE_NUMBER = new RegExp(`^\\+?(${CSS_NUMBER})$`, 'i');
const SIGNED_ANGLE = new RegExp(
  `^([+-]?${CSS_NUMBER})(deg|grad|rad|turn)$`,
  'i',
);

function cleanTypographyValue(value: string): string | null {
  const cleaned = value.trim().replace(/\s*!important\s*$/i, '').trim();

  // Typography values supported here never need comments, escapes, strings,
  // declaration separators, URLs, or functions. Rejecting those constructs
  // keeps the values safe to serialize back into an inline style attribute.
  if (
    !cleaned ||
    cleaned.length > 120 ||
    /[\u0000-\u001f\u007f;{}\\'"/]/.test(cleaned) ||
    /(?:expression\s*\(|javascript\s*:|vbscript\s*:|@import|url\s*\()/i.test(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

function nonNegativeLengthPercentage(value: string): boolean {
  const match = value.match(NON_NEGATIVE_LENGTH_PERCENTAGE);
  if (match) {
    const amount = Number(match[1]);
    return Number.isFinite(amount) && amount >= 0;
  }

  // CSS permits a unitless zero wherever a length is accepted.
  const unitless = value.match(NON_NEGATIVE_NUMBER);
  return Boolean(unitless && Number(unitless[1]) === 0);
}

export function sanitizeCssFontSize(value: string): string | null {
  const cleaned = cleanTypographyValue(value);
  if (!cleaned) return null;

  return CSS_WIDE_KEYWORDS.test(cleaned) ||
    FONT_SIZE_KEYWORDS.test(cleaned) ||
    nonNegativeLengthPercentage(cleaned)
    ? cleaned
    : null;
}

export function sanitizeCssLineHeight(value: string): string | null {
  const cleaned = cleanTypographyValue(value);
  if (!cleaned) return null;
  if (/^normal$/i.test(cleaned) || CSS_WIDE_KEYWORDS.test(cleaned)) return cleaned;

  const unitless = cleaned.match(NON_NEGATIVE_NUMBER);
  if (unitless) {
    const amount = Number(unitless[1]);
    return Number.isFinite(amount) && amount >= 0 ? cleaned : null;
  }

  return nonNegativeLengthPercentage(cleaned) ? cleaned : null;
}

export function sanitizeCssFontWeight(value: string): string | null {
  const cleaned = cleanTypographyValue(value);
  if (!cleaned) return null;
  if (/^(?:normal|bold|lighter|bolder)$/i.test(cleaned) || CSS_WIDE_KEYWORDS.test(cleaned)) {
    return cleaned;
  }

  const numeric = cleaned.match(NON_NEGATIVE_NUMBER);
  if (!numeric) return null;
  const amount = Number(numeric[1]);

  // CSS Fonts Level 4 allows any <number> from 1 through 1000, including
  // non-multiples of 100 used by variable fonts.
  return Number.isFinite(amount) && amount >= 1 && amount <= 1000 ? cleaned : null;
}

function angleInDegrees(value: string): number | null {
  const match = value.match(SIGNED_ANGLE);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  switch (match[2].toLowerCase()) {
    case 'deg': return amount;
    case 'grad': return amount * 0.9;
    case 'rad': return amount * 180 / Math.PI;
    case 'turn': return amount * 360;
    default: return null;
  }
}

export function sanitizeCssFontStyle(value: string): string | null {
  const cleaned = cleanTypographyValue(value);
  if (!cleaned) return null;
  if (/^(?:normal|italic|oblique)$/i.test(cleaned) || CSS_WIDE_KEYWORDS.test(cleaned)) {
    return cleaned;
  }

  const match = cleaned.match(/^oblique\s+(.+)$/i);
  if (!match) return null;
  const degrees = angleInDegrees(match[1]);

  return degrees != null && degrees >= -90 && degrees <= 90 ? cleaned : null;
}
