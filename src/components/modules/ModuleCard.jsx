import AppButton from '../common/AppButton';
import Icon from '../common/Icon';

export default function ModuleCard({
  description,
  disabled,
  icon,
  installed,
  installing,
  name,
  onAction,
}) {
  return (
    <article className="module-card">
      <div className="module-card__icon"><Icon name={icon} size={30} /></div>
      <h3>{name}</h3>
      <p className="module-card__description">{description}</p>
      <div className={`module-card__status ${installed ? 'module-card__status--installed' : ''}`}>
        <Icon name={installed ? 'check' : 'download'} size={18} />
        <span>{installed ? 'Installed' : 'Ready to download'}</span>
      </div>
      <AppButton
        disabled={disabled}
        loading={installing}
        onClick={onAction}
        title={installed ? 'Open' : 'Download'}
        variant={installed ? 'secondary' : 'primary'}
      />
    </article>
  );
}
