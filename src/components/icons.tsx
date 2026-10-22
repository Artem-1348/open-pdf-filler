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
export const TextFieldIcon = () => (
  <svg {...base}>
    <rect x="3" y="7" width="18" height="10" rx="1.5" />
    <path d="M7 10v4" />
  </svg>
);
export const CheckboxIcon = () => (
  <svg {...base}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="m8 12 3 3 5-6" />
  </svg>
);
export const RadioIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </svg>
);
export const DropdownIcon = () => (
  <svg {...base}>
    <rect x="3" y="7" width="18" height="10" rx="1.5" />
    <path d="m14 11 2 2 2-2" />
  </svg>
);
export const UndoIcon = () => (
  <svg {...base}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
);
export const RedoIcon = () => (
  <svg {...base}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </svg>
);
export const WandIcon = () => (
  <svg {...base}>
    <path d="m4 20 11-11" />
    <path d="M15 4v2M19 8h2M18 5l1.5-1.5M12 6l-1-1M18 11l1 1" />
  </svg>
);
