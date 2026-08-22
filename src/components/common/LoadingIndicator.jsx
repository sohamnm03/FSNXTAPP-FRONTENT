export default function LoadingIndicator({ fullScreen = false, label = 'Loading' }) {
  return (
    <div className={`loading ${fullScreen ? 'loading--screen' : ''}`} role="status">
      <span aria-hidden="true" className="spinner" />
      <span>{label}</span>
    </div>
  );
}
