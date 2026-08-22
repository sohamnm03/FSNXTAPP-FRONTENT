import AppButton from '../common/AppButton';
import Icon from '../common/Icon';

export default function ModuleCard({
  disabled,
  icon,
  installed,
  installing,
  name,
  onAction,
  onSelect,
  onUninstall,
  progress,
  selected,
  uninstalling,
}) {
  return (
    <article className={`package-menu-item ${selected ? 'package-menu-item--selected' : ''}`}>
      <button className="package-menu-item__main" onClick={onSelect} type="button">
        <span className="package-menu-item__icon"><Icon name={icon} size={22} /></span>
        <span className="package-menu-item__copy">
          <strong>{name}</strong>
          <small className={installed ? 'package-status--installed' : ''}>
            {installed ? 'Installed' : installing ? 'Downloading package' : 'Package locked'}
          </small>
        </span>
        <Icon name={installed ? 'check' : 'lock'} size={18} />
      </button>

      {installing ? (
        <div className="package-progress" aria-label={`Downloading ${name}`}>
          <div className="package-progress__label">
            <span>Downloading</span>
            <strong>{progress}%</strong>
          </div>
          <div
            aria-valuemax="100"
            aria-valuemin="0"
            aria-valuenow={progress}
            className="package-progress__track"
            role="progressbar"
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : installed ? (
        <div className="package-menu-item__actions">
          <AppButton
            className="package-menu-item__action"
            disabled={disabled || uninstalling}
            onClick={onAction}
            title="Open"
            variant="secondary"
          />
          <AppButton
            className="package-menu-item__action package-uninstall-button"
            disabled={disabled}
            icon="trash"
            loading={uninstalling}
            onClick={onUninstall}
            title="Uninstall"
            variant="secondary"
          />
        </div>
      ) : (
        <AppButton
          className="package-menu-item__action"
          disabled={disabled}
          icon="download"
          onClick={onAction}
          title="Download"
          variant="primary"
        />
      )}
    </article>
  );
}
