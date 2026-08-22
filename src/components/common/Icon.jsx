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
