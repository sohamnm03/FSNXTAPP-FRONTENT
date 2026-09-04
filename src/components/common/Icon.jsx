const paths = {
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  eyeOff: <><path d="m3 3 18 18"/><path d="M10.6 6.2A11.8 11.8 0 0 1 12 6c6.5 0 10 6 10 6a17.7 17.7 0 0 1-2.3 3.1M6.6 6.6C3.6 8.5 2 12 2 12s3.5 6 10 6c1 0 2-.2 2.8-.4"/></>,
  warning: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></>,
  building: <><path d="M4 21V4h11v17M15 9h5v12M8 8h3M8 12h3M8 16h3M3 21h18"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></>,
  check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 8"/></>,
  logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/></>,
  toolbox: <><path d="M4 8h16v12H4zM9 8V5h6v3M4 13h16M10 13v2h4v-2"/></>,
  arrowLeft: <><path d="m15 18-6-6 6-6M9 12h11"/></>,
  user: <><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"/></>,
  lock: <><rect height="10" rx="2" width="14" x="5" y="10"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
  play: <path d="m9 7 8 5-8 5Z"/>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 3.1 2.3c-.8.3-.8.9-.8 1.7M12 17h.01"/></>,
  chevronRight: <path d="m9 18 6-6-6-6"/>,
  testCase: <><path d="M6 3h9l3 3v15H6Z"/><path d="M15 3v4h4M9 11h6M9 15h6"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
  window: <><rect height="14" rx="2" width="18" x="3" y="5"/><path d="M3 9h18M7 13h3M7 16h3"/></>,
  sliders: <><path d="M4 7h5M13 7h7M4 12h9M17 12h3M4 17h3M11 17h9"/><circle cx="11" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="17" r="2"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  calendar: <><rect height="16" rx="2" width="18" x="3" y="5"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
  flag: <><path d="M5 21V4M5 5h11l-2 4 2 4H5"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>,
};

export default function Icon({ name, size = 22, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={`icon ${className}`}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {paths[name]}
      </g>
    </svg>
  );
}
