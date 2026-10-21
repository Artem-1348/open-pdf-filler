// Small stroke icons; they inherit the button's text color.
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const OpenIcon = () => (
  <svg {...base}>
    <path d="M4 20V6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v2" />
    <path d="M4 20l2.5-8h15L19 20z" />
  </svg>
);
export const SidebarIcon = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
);
export const MinusIcon = () => (
  <svg {...base}>
    <path d="M5 12h14" />
  </svg>
);
export const PlusIcon = () => (
  <svg {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const SearchIcon = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const UpIcon = () => (
  <svg {...base}>
    <path d="m6 15 6-6 6 6" />
  </svg>
);
export const DownIcon = () => (
  <svg {...base}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const CloseIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const FileIcon = () => (
  <svg {...base} width={40} height={40} strokeWidth={1.5}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
);
export const TextIcon = () => (
  <svg {...base}>
    <path d="M5 6V4h14v2M12 4v16M9 20h6" />
  </svg>
);
export const DateIcon = () => (
  <svg {...base}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
export const CheckIcon = () => (
  <svg {...base}>
    <path d="M4 12.5 9.5 18 20 6" />
  </svg>
);
export const CrossIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const SignIcon = () => (
  <svg {...base}>
    <path d="M3 17c3-1 4-6 6-6s0 6 2 6 3-4 5-4 1 4 3 4" />
    <path d="M3 21h18" />
  </svg>
);
export const SaveIcon = () => (
  <svg {...base}>
    <path d="M12 4v11M7 10l5 5 5-5" />
    <path d="M5 20h14" />
  </svg>
);
