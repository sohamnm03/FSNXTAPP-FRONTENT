import { useEffect, useState } from 'react';

import AppButton from '../../../components/common/AppButton';
import Icon from '../../../components/common/Icon';
import ModuleCard from '../../../components/modules/ModuleCard';
import ScreenContainer from '../../../components/common/ScreenContainer';
import { useAuth } from '../../auth/context/AuthContext';
import { availableModules, packageService } from '../../packages/services/packageService';

export default function HomeScreen({ onOpenModule }) {
  const { logout, user } = useAuth();
  const [installedModuleIds, setInstalledModuleIds] = useState([]);
  const [installingModuleId, setInstallingModuleId] = useState(null);
  const [uninstallingModuleId, setUninstallingModuleId] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [selectedModuleId, setSelectedModuleId] = useState(availableModules[0].id);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    packageService.getInstalledModuleIds()
      .then(setInstalledModuleIds)
      .catch(() => setError('Installed module status could not be loaded.'));
  }, []);

  async function handleModuleAction(module) {
    setSelectedModuleId(module.id);
    if (installedModuleIds.includes(module.id)) {
      onOpenModule(module);
      return;
    }
    if (installingModuleId || uninstallingModuleId) return;

    setError('');
    setInstallingModuleId(module.id);
    setDownloadProgress(0);
    try {
      setInstalledModuleIds(await packageService.install(module.id, setDownloadProgress));
    } catch (installationError) {
      setError(installationError.message || 'Installation failed. Please try again.');
    } finally {
      setInstallingModuleId(null);
      setDownloadProgress(0);
    }
  }

  async function handleUninstall(module) {
    if (installingModuleId || uninstallingModuleId) return;

    setSelectedModuleId(module.id);
    setError('');
    setUninstallingModuleId(module.id);
    try {
      setInstalledModuleIds(await packageService.uninstall(module.id));
    } catch (uninstallationError) {
      setError(uninstallationError.message || 'Uninstallation failed. Please try again.');
    } finally {
      setUninstallingModuleId(null);
    }
  }

  const selectedModule = availableModules.find((module) => module.id === selectedModuleId)
    || availableModules[0];
  const isSelectedModuleInstalled = installedModuleIds.includes(selectedModule.id);
  const isSelectedModuleInstalling = installingModuleId === selectedModule.id;

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <ScreenContainer className="workspace-screen">
      <header className="app-header">
        <div className="app-header__brand">
          <div className="brand-mark">FS</div>
          <div>
            <strong>FSNXT Testing Application</strong>
            <span>Desktop Workspace</span>
          </div>
        </div>
        <AppButton
          disabled={isLoggingOut}
          icon="logout"
          onClick={handleLogout}
          title={isLoggingOut ? 'Logging out…' : 'Logout'}
          variant="ghost"
        />
      </header>

      <div className="package-workspace">
        <aside className="package-sidebar" aria-labelledby="packages-heading">
          <div>
            <p className="eyebrow">TESTING WORKSPACE</p>
            <h1 id="packages-heading">Packages</h1>
            <p className="package-sidebar__intro">Download and manage your testing tools.</p>
          </div>

          {error ? <div className="alert alert--error workspace-alert" role="alert">{error}</div> : null}

          <div className="package-menu">
            {availableModules.map((module) => (
              <ModuleCard
                {...module}
                disabled={Boolean(installingModuleId || uninstallingModuleId)
                  && installingModuleId !== module.id
                  && uninstallingModuleId !== module.id}
                installed={installedModuleIds.includes(module.id)}
                installing={installingModuleId === module.id}
                key={module.id}
                onAction={() => handleModuleAction(module)}
                onSelect={() => setSelectedModuleId(module.id)}
                onUninstall={() => handleUninstall(module)}
                progress={installingModuleId === module.id ? downloadProgress : 0}
                selected={selectedModule.id === module.id}
                uninstalling={uninstallingModuleId === module.id}
              />
            ))}
          </div>

          <div className="package-sidebar__footer">
            <span>{availableModules.length} packages available</span>
            <span>{installedModuleIds.length} installed</span>
          </div>
        </aside>

        <section className="package-detail" aria-live="polite">
          <div className="package-detail__topline">
            <span>Package details</span>
            <span>Signed in as <strong>{user.username}</strong></span>
          </div>

          <div className={`package-access-card ${isSelectedModuleInstalled ? 'package-access-card--ready' : ''}`}>
            <div className="package-access-card__icon">
              <Icon name={isSelectedModuleInstalled ? selectedModule.icon : 'lock'} size={42} />
            </div>

            <div className={`package-access-card__badge ${isSelectedModuleInstalled ? 'package-access-card__badge--ready' : ''}`}>
              <Icon name={isSelectedModuleInstalled ? 'check' : 'lock'} size={16} />
              <span>
                {isSelectedModuleInstalled
                  ? 'Package ready'
                  : isSelectedModuleInstalling ? 'Download in progress' : 'Package locked'}
              </span>
            </div>

            <h2>{selectedModule.name}</h2>
            <p>{selectedModule.description}</p>

            {isSelectedModuleInstalling ? (
              <div className="package-detail__progress">
                <div className="package-detail__percentage">{downloadProgress}%</div>
                <div
                  aria-valuemax="100"
                  aria-valuemin="0"
                  aria-valuenow={downloadProgress}
                  className="package-progress__track package-progress__track--large"
                  role="progressbar"
                >
                  <span style={{ width: `${downloadProgress}%` }} />
                </div>
                <p>Downloading and installing your package…</p>
              </div>
            ) : isSelectedModuleInstalled ? (
              <div className="package-detail__actions">
                <AppButton
                  className="package-detail__open"
                  disabled={Boolean(uninstallingModuleId)}
                  onClick={() => onOpenModule(selectedModule)}
                  title={`Open ${selectedModule.name}`}
                />
                <AppButton
                  className="package-detail__uninstall package-uninstall-button"
                  icon="trash"
                  loading={uninstallingModuleId === selectedModule.id}
                  onClick={() => handleUninstall(selectedModule)}
                  title="Uninstall package"
                  variant="secondary"
                />
              </div>
            ) : (
              <div className="package-detail__locked-message">
                <Icon name="download" size={20} />
                <span>Use the Download button in the left menu to unlock this package.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </ScreenContainer>
  );
}
