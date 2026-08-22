export default function ScreenContainer({ children, className = '' }) {
  return <main className={`screen ${className}`}>{children}</main>;
}
