export type PasteSanitizeFailureReason =
  | 'too-large'
  | 'too-many-nodes'
  | 'too-deep'
  | 'unsupported-environment'
  | 'parse-error';

export type PasteSanitizeResult =
  | { ok: true; html: string }
  | { ok: false; html: ''; reason: PasteSanitizeFailureReason };

export type SanitizePastedHTMLFailureReason = PasteSanitizeFailureReason;
export type SanitizePastedHTMLResult = PasteSanitizeResult;

export type SanitizedUrl =
  | { ok: true; url: string }
  | { ok: false };

export type PercentReadOptions = {
  allowUnitless?: boolean;
  max: number;
  min: number;
};

export type ListTagName = 'ol' | 'ul';
