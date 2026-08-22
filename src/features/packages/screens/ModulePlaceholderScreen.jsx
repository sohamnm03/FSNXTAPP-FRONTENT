import AppButton from '../../../components/common/AppButton';
import Icon from '../../../components/common/Icon';
import ScreenContainer from '../../../components/common/ScreenContainer';

export default function ModulePlaceholderScreen({ module, onBack }) {
  return (
    <ScreenContainer className="module-screen">
      <header className="module-screen__header">
        <button className="back-button" onClick={onBack} type="button">
          <Icon name="arrowLeft" />
          <span>Back to workspace</span>
        </button>
        <strong>FSNXT Testing Application</strong>
      </header>
      <section className="module-placeholder">
        <div className="module-placeholder__icon"><Icon name={module.icon} size={46} /></div>
        <p className="eyebrow">MODULE INSTALLED</p>
        <h1>{module.name}</h1>
        <p>
          This module is installed and ready for its testing workflows. Module features will be added in a future release.
        </p>
        <AppButton icon="arrowLeft" onClick={onBack} title="Back to Workspace" />
      </section>
    </ScreenContainer>
  );
}
