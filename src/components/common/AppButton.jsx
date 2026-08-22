import Icon from './Icon';

export default function AppButton({
  disabled = false,
  icon,
  loading = false,
  onClick,
  title,
  type = 'button',
  variant = 'primary',
  className = '',
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      aria-busy={loading}
      className={`app-button app-button--${variant} ${className}`}
      disabled={isDisabled}
      onClick={onClick}
      type={type}
    >
      {loading ? <span aria-hidden="true" className="spinner spinner--button" /> : null}
      {!loading && icon ? <Icon name={icon} size={19} /> : null}
      <span>{title}</span>
    </button>
  );
}
