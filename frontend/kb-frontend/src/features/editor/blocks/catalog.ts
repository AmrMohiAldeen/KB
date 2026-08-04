export const CONTENT_BLOCK_KINDS = [
  'tabs',
  'accordion',
  'callout-info',
  'callout-warning',
  'callout-success',
  'callout-danger',
  'callout-tip',
] as const;

export type ContentBlockKind = (typeof CONTENT_BLOCK_KINDS)[number];

export type ContentBlockOption = {
  description: string;
  kind: ContentBlockKind;
  label: string;
};

export const CONTENT_BLOCK_OPTIONS = [
  {
    kind: 'tabs',
    label: 'Tabs',
    description: 'Switchable labeled panels',
  },
  {
    kind: 'accordion',
    label: 'Accordion',
    description: 'Expandable content sections',
  },
  {
    kind: 'callout-info',
    label: 'Info callout',
    description: 'Helpful context or background',
  },
  {
    kind: 'callout-warning',
    label: 'Warning callout',
    description: 'Important caution or risk',
  },
  {
    kind: 'callout-success',
    label: 'Success callout',
    description: 'Positive result or confirmation',
  },
  {
    kind: 'callout-danger',
    label: 'Danger / error callout',
    description: 'Critical issue or failure',
  },
  {
    kind: 'callout-tip',
    label: 'Tip callout',
    description: 'Practical advice or shortcut',
  },
] as const satisfies readonly ContentBlockOption[];
