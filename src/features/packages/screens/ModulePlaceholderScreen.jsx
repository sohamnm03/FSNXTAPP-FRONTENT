import { useState } from 'react';

import AppButton from '../../../components/common/AppButton';
import Icon from '../../../components/common/Icon';
import ScreenContainer from '../../../components/common/ScreenContainer';
import { packageService } from '../services/packageService';

export default function ModulePlaceholderScreen({ module, onBack, onUninstalled }) {
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [error, setError] = useState('');

  async function handleUninstall() {
    if (isUninstalling) return;

    setError('');
    setIsUninstalling(true);
    try {
      await packageService.uninstall(module.id);
      onUninstalled();
    } catch (uninstallationError) {
      setError(uninstallationError.message || 'Uninstallation failed. Please try again.');
      setIsUninstalling(false);
    }
  }

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
        {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
        <div className="module-placeholder__actions">
          <AppButton
            disabled={isUninstalling}
            icon="arrowLeft"
            onClick={onBack}
            title="Back to Workspace"
          />
          <AppButton
            className="package-uninstall-button"
            icon="trash"
            loading={isUninstalling}
            onClick={handleUninstall}
            title={isUninstalling ? 'Uninstalling…' : 'Uninstall package'}
            variant="secondary"
          />
        </div>
      </section>
    </ScreenContainer>
  );
}
