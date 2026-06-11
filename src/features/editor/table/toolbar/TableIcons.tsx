import { ICON_SIZE } from '../../components/toolbar/ToolbarPrimitives';

const iconProps = {
  className: ICON_SIZE,
  fill: 'none',
  stroke: 'currentColor',
  viewBox: '0 0 24 24',
  'aria-hidden': true,
} as const;

export const BorderIcon = () => (
  <svg {...iconProps}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4h16v16H4V4zM4 12h16M12 4v16" />
  </svg>
);

export const InsertRowAboveIcon = () => (
  <svg {...iconProps}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v6m0-6-3 3m3-3 3 3M4 14h16M4 18h16" />
  </svg>
);

export const InsertRowBelowIcon = () => (
  <svg {...iconProps}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16m8 4v6m0 0-3-3m3 3 3-3" />
  </svg>
);

export const InsertColumnBeforeIcon = () => (
  <svg {...iconProps}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 12h6m-6 0 3-3m-3 3 3 3M14 4v16M18 4v16" />
  </svg>
);

export const InsertColumnAfterIcon = () => (
  <svg {...iconProps}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 4v16M10 4v16m4-8h6m0 0-3-3m3 3-3 3" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...iconProps}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7H5M10 11v6m4-6v6M9 7V4h6v3" />
  </svg>
);

export const HeaderRowIcon = () => (
  <svg {...iconProps}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 18h16" />
  </svg>
);

export const HeaderColumnIcon = () => (
  <svg {...iconProps}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 4v16M10 4v16M18 4v16" />
  </svg>
);

export const MergeIcon = () => (
  <svg {...iconProps}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3m8-11h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-3M12 7v10" />
  </svg>
);

export const SplitIcon = () => (
  <svg {...iconProps}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16M4 12h16" />
  </svg>
);
