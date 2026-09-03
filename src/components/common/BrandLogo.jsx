export default function BrandLogo({ large = false }) {
  return (
    <span aria-hidden="true" className={`brand-logo${large ? ' brand-logo--large' : ''}`}>
      <svg viewBox="0 0 32 32">
        <rect fill="#dc3c37" height="5" rx="2.5" width="18" x="7" y="5" />
        <rect fill="#ef9f26" height="5" rx="2.5" width="14" x="7" y="12" />
        <rect fill="#35a35b" height="5" rx="2.5" width="10" x="7" y="19" />
        <circle cx="9.5" cy="27" fill="#35a35b" r="2.5" />
      </svg>
    </span>
  );
}
