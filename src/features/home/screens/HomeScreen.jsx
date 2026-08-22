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
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    packageService.getInstalledModuleIds()
      .then(setInstalledModuleIds)
      .catch(() => setError('Installed module status could not be loaded.'));
  }, []);

  async function handleModuleAction(module) {
    if (installedModuleIds.includes(module.id)) {
      onOpenModule(module);
      return;
    }
    if (installingModuleId) return;

    setError('');
    setInstallingModuleId(module.id);
    try {
      setInstalledModuleIds(await packageService.install(module.id));
    } catch (installationError) {
      setError(installationError.message || 'Installation failed. Please try again.');
    } finally {
      setInstallingModuleId(null);
    }
  }

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

      <div className="workspace-content">
        <section className="welcome-card">
          <div>
            <p className="eyebrow">TESTING WORKSPACE</p>
            <h1>Welcome, {user.username}</h1>
            <p>Install the testing modules you need and launch them from one secure desktop workspace.</p>
          </div>
          <div className="welcome-card__icon"><Icon name="toolbox" size={42} /></div>
        </section>

        <section aria-labelledby="modules-heading">
          <div className="section-heading">
            <div>
              <h2 id="modules-heading">Available modules</h2>
              <p>Your testing tools, ready when you are.</p>
            </div>
            <span className="module-count">{availableModules.length} modules</span>
          </div>

          {error ? <div className="alert alert--error workspace-alert" role="alert">{error}</div> : null}

          <div className="module-grid">
            {availableModules.map((module) => (
              <ModuleCard
                {...module}
                disabled={Boolean(installingModuleId) && installingModuleId !== module.id}
                installed={installedModuleIds.includes(module.id)}
                installing={installingModuleId === module.id}
                key={module.id}
                onAction={() => handleModuleAction(module)}
              />
            ))}
          </div>
        </section>
      </div>
    </ScreenContainer>
  );
}
