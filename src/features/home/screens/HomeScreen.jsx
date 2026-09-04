import { useEffect, useMemo, useState } from 'react';

import AppButton from '../../../components/common/AppButton';
import BrandLogo from '../../../components/common/BrandLogo';
import Icon from '../../../components/common/Icon';
import ScreenContainer from '../../../components/common/ScreenContainer';
import { useAuth } from '../../auth/context/AuthContext';
import { availableModules, packageService } from '../../packages/services/packageService';

const moduleDetails = {
  'sap-testing': {
    features: [
      'End-to-end SAP workflow validation',
      'Support for SAP GUI, Fiori, and RFC',
      'Data-driven and keyword-driven testing',
      'Integration with enterprise CI/CD pipelines',
      'Rich reporting and analytics dashboard',
    ],
    lastUpdated: 'Sep 04, 2025',
    setup: [
      ['System requirements', 'Check system and software prerequisites', 'window'],
      ['Configure SAP connection', 'Set up SAP system and authentication', 'settings'],
      ['Environment variables', 'Configure required environment variables', 'toolbox'],
      ['Advanced settings', 'Customise logs, timeouts, and more', 'sliders'],
    ],
    version: 'v1.0.0',
  },
  'web-testing': {
    features: [
      'Reliable browser workflow validation',
      'Reusable functional test scenarios',
      'Secure credential handling',
      'Automatic HTML test reports',
      'Run history and downloadable artifacts',
    ],
    lastUpdated: 'Jun 02, 2025',
    setup: [
      ['Browser requirements', 'Check supported browsers and drivers', 'globe'],
      ['Configure target site', 'Add your application URL and routes', 'settings'],
      ['Test credentials', 'Configure secure test-user credentials', 'user'],
      ['Advanced settings', 'Customise timeouts and reporting', 'sliders'],
    ],
    version: 'v1.3.0',
  },
};

const gettingStartedSteps = [
  ['Open package', 'Launch the package from your installed packages.', 'download'],
  ['Configure settings', 'Set up your connection and environment.', 'settings'],
  ['Run a test', 'Execute a sample test case to validate configuration.', 'play'],
  ['View results', 'Review results and analyse test execution insights.', 'chart'],
];

export default function HomeScreen({ onOpenModule }) {
  const { logout, user } = useAuth();
  const [installedModuleIds, setInstalledModuleIds] = useState([]);
  const [installingModuleId, setInstallingModuleId] = useState(null);
  const [uninstallingModuleId, setUninstallingModuleId] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [selectedModuleId, setSelectedModuleId] = useState(availableModules[0].id);
  const [packageFilter, setPackageFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    packageService.getInstalledModuleIds()
      .then(setInstalledModuleIds)
      .catch(() => setError('Installed module status could not be loaded.'));
  }, []);

  const filteredModules = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return availableModules.filter((module) => {
      const installed = installedModuleIds.includes(module.id);
      const matchesFilter = packageFilter === 'all'
        || (packageFilter === 'installed' && installed)
        || (packageFilter === 'available' && !installed);
      const matchesSearch = !query
        || module.name.toLowerCase().includes(query)
        || module.description.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [installedModuleIds, packageFilter, searchQuery]);

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

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  }

  const selectedModule = availableModules.find((module) => module.id === selectedModuleId)
    || availableModules[0];
  const selectedDetails = moduleDetails[selectedModule.id];
  const isSelectedInstalled = installedModuleIds.includes(selectedModule.id);
  const installedCount = installedModuleIds.length;
  const availableCount = availableModules.length - installedCount;

  return (
    <ScreenContainer className="workspace-screen home-dashboard-screen">
      <header className="app-header workspace-header">
        <div className="app-header__brand">
          <BrandLogo />
          <div><strong>FSNXT Testing Application</strong><span>Package workspace</span></div>
        </div>
        <AppButton disabled={isLoggingOut} icon="logout" onClick={handleLogout} title={isLoggingOut ? 'Logging out…' : 'Logout'} variant="ghost" />
      </header>

      <div className="home-package-workspace">
        <aside className="home-catalog-sidebar" aria-labelledby="packages-heading">
          <div className="home-catalog-sidebar__heading">
            <p className="eyebrow">TESTING WORKSPACE</p>
            <h1 id="packages-heading">Packages</h1>
            <p>Download and manage your testing tools.</p>
          </div>

          <label className="home-package-search">
            <Icon name="search" size={18} />
            <input aria-label="Search packages" onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search packages…" type="search" value={searchQuery} />
          </label>

          <div className="home-package-filters" role="group" aria-label="Filter packages">
            {[
              ['all', `All (${availableModules.length})`],
              ['installed', `Installed (${installedCount})`],
              ['available', `Available (${availableCount})`],
            ].map(([filter, label]) => (
              <button aria-pressed={packageFilter === filter} className={packageFilter === filter ? 'is-active' : ''} key={filter} onClick={() => setPackageFilter(filter)} type="button">{label}</button>
            ))}
          </div>

          {error ? <div className="alert alert--error" role="alert">{error}</div> : null}

          <div className="home-package-list">
            {filteredModules.length === 0 ? <p className="home-package-list__empty">No packages match this view.</p> : filteredModules.map((module) => {
              const installed = installedModuleIds.includes(module.id);
              const installing = installingModuleId === module.id;
              return (
                <article className={`home-package-card ${selectedModule.id === module.id ? 'is-selected' : ''}`} key={module.id}>
                  <button className="home-package-card__main" onClick={() => setSelectedModuleId(module.id)} type="button">
                    <span className="home-package-card__icon"><Icon name={module.icon} size={23} /></span>
                    <span className="home-package-card__copy">
                      <strong>{module.name}</strong>
                      <small className={installed ? 'is-installed' : ''}>{installed ? '● Installed' : 'Package locked'}</small>
                      <span>{moduleDetails[module.id].version}</span>
                    </span>
                    <Icon name={selectedModule.id === module.id ? 'chevronRight' : installed ? 'check' : 'lock'} size={18} />
                  </button>

                  {installing ? (
                    <div className="package-progress">
                      <div className="package-progress__label"><span>Downloading</span><strong>{downloadProgress}%</strong></div>
                      <div className="package-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={downloadProgress}><span style={{ width: `${downloadProgress}%` }} /></div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="home-catalog-sidebar__footer"><span>{availableModules.length} packages available</span><span>{installedCount} installed</span></div>
        </aside>

        <section className="home-dashboard" aria-label="Selected package dashboard">
          <div className="home-dashboard__breadcrumb"><span>Packages</span><Icon name="chevronRight" size={14} /><strong>{selectedModule.name}</strong></div>

          <section className="home-package-summary">
            <div className={`home-package-summary__icon ${isSelectedInstalled ? 'is-ready' : ''}`}><Icon name={isSelectedInstalled ? selectedModule.icon : 'lock'} size={48} /></div>
            <div className="home-package-summary__copy">
              <span className={`home-package-summary__badge ${isSelectedInstalled ? 'is-ready' : ''}`}><Icon name={isSelectedInstalled ? 'check' : 'lock'} size={14} />{isSelectedInstalled ? 'PACKAGE READY' : 'PACKAGE LOCKED'}</span>
              <h2>{selectedModule.name}</h2>
              <p>{selectedModule.description}</p>
              <div className="home-package-summary__meta">
                <span><Icon name="clock" size={20} /><span>Installed<strong>{isSelectedInstalled ? selectedDetails.version : 'Not installed'}</strong></span></span>
                <span><Icon name="calendar" size={20} /><span>Last updated<strong>{selectedDetails.lastUpdated}</strong></span></span>
                <span><Icon name="user" size={20} /><span>Installed by<strong>{isSelectedInstalled ? user.username : '—'}</strong></span></span>
              </div>
            </div>
            <div className="home-package-summary__actions">
              {isSelectedInstalled ? (
                <>
                  <AppButton disabled={Boolean(uninstallingModuleId)} icon="play" onClick={() => onOpenModule(selectedModule)} title={selectedModule.id === 'web-testing' ? 'Run Script' : `Open ${selectedModule.name}`} />
                  <AppButton className="package-uninstall-button" icon="trash" loading={uninstallingModuleId === selectedModule.id} onClick={() => handleUninstall(selectedModule)} title="Uninstall package" variant="secondary" />
                </>
              ) : (
                <AppButton disabled={Boolean(installingModuleId || uninstallingModuleId)} icon="download" loading={installingModuleId === selectedModule.id} onClick={() => handleModuleAction(selectedModule)} title={installingModuleId === selectedModule.id ? `Downloading ${downloadProgress}%` : 'Download package'} />
              )}
            </div>
          </section>

          <section className="home-dashboard-section home-getting-started">
            <header><Icon name="flag" size={21} /><div><h3>Getting started</h3><p>Follow these steps to get up and running quickly.</p></div></header>
            <div className="home-step-grid">
              {gettingStartedSteps.map(([title, description, icon], index) => (
                <article key={title}>
                  <span className="home-step-number">{index + 1}</span>
                  <span className="home-step-icon"><Icon name={icon} size={21} /></span>
                  <div><strong>{title}</strong><p>{description}</p></div>
                  {index < gettingStartedSteps.length - 1 ? <Icon className="home-step-arrow" name="chevronRight" size={17} /> : null}
                </article>
              ))}
            </div>
          </section>

          <div className="home-dashboard-grid">
            <section className="home-dashboard-section home-info-panel">
              <header><Icon name="star" size={21} /><h3>Key features</h3></header>
              <ul>{selectedDetails.features.map((feature) => <li key={feature}><Icon name="check" size={17} /><span>{feature}</span></li>)}</ul>
            </section>
            <section className="home-dashboard-section home-info-panel">
              <header><Icon name="settings" size={21} /><div><h3>Setup &amp; configuration</h3><p>Fine-tune to your environment.</p></div></header>
              <div className="home-setup-list">
                {selectedDetails.setup.map(([title, description, icon]) => (
                  <div key={title}><Icon name={icon} size={20} /><span><strong>{title}</strong><small>{description}</small></span><Icon name="chevronRight" size={17} /></div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </ScreenContainer>
  );
}
