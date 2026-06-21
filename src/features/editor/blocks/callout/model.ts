import type { JSONContent } from '@tiptap/core';

export const CALLOUT_NODE_NAME = 'callout';
export const CALLOUT_VARIANTS = [
  'info',
  'warning',
  'success',
  'danger',
  'tip',
] as const;

export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];
export type CalloutVariantInput = CalloutVariant | 'error';

const CALLOUT_VARIANT_LABELS: Record<CalloutVariant, string> = {
  info: 'Info',
  warning: 'Warning',
  success: 'Success',
  danger: 'Danger',
  tip: 'Tip',
};

export function normalizeCalloutVariant(value: unknown): CalloutVariant {
  if (value === 'error') return 'danger';

  return CALLOUT_VARIANTS.some((variant) => variant === value)
    ? (value as CalloutVariant)
    : 'info';
}

export function getCalloutVariantLabel(value: unknown): string {
  return CALLOUT_VARIANT_LABELS[normalizeCalloutVariant(value)];
}

export function createCalloutContent(
  variant: CalloutVariantInput = 'info',
): JSONContent {
  return {
    type: CALLOUT_NODE_NAME,
    attrs: {
      variant: normalizeCalloutVariant(variant),
    },
    content: [{ type: 'paragraph' }],
  };
}
