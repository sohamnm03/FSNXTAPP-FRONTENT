import { useEffect, useRef, useState } from 'react';

import AppButton from '../../../components/common/AppButton';
import AppInput from '../../../components/common/AppInput';
import Icon from '../../../components/common/Icon';
import ScreenContainer from '../../../components/common/ScreenContainer';
import { packageService } from '../services/packageService';
import { webTestingService } from '../services/webTestingService';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'stopped', 'timed_out']);

function parseRoutes(value) {
  return value.split(/[\n,]+/).map((route) => route.trim()).filter(Boolean);
}

function statusLabel(status) {
  return ({
    queued: 'Queued',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    stopped: 'Stopped',
    timed_out: 'Timed out',
  })[status] || 'Ready';
}

export default function WebTestingScreen({ module, onBack, onUninstalled }) {
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [websiteUsername, setWebsiteUsername] = useState('');
  const [websitePassword, setWebsitePassword] = useState('');
  const [routesText, setRoutesText] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [downloadingPath, setDownloadingPath] = useState('');
  const [runId, setRunId] = useState('');
  const [status, setStatus] = useState('idle');
  const [logs, setLogs] = useState('');
  const [result, setResult] = useState(null);
  const [artifacts, setArtifacts] = useState([]);
  const [error, setError] = useState('');
  const [reportNotice, setReportNotice] = useState('');
  const automaticDownloadRun = useRef('');

  useEffect(() => {
    if (!runId) return undefined;
    let cancelled = false;
    let nextPoll;

    async function poll() {
      try {
        const [run, logResponse] = await Promise.all([
          webTestingService.getRun(runId),
          webTestingService.getLogs(runId),
        ]);
        if (cancelled) return;
        setStatus(run.status);
        setLogs(logResponse.logs || '');
        setResult(run.result || null);
        if (run.error) setError(run.error);

        if (TERMINAL_STATUSES.has(run.status)) {
          const artifactResponse = await webTestingService.getArtifacts(runId);
          if (cancelled) return;
          const nextArtifacts = artifactResponse.artifacts || [];
          setArtifacts(nextArtifacts);
          const htmlReport = nextArtifacts.find((artifact) => artifact.path.endsWith('site_test_report.html'))
            || nextArtifacts.find((artifact) => artifact.path.endsWith('.html'));
          if (run.status === 'completed' && htmlReport && automaticDownloadRun.current !== runId) {
            automaticDownloadRun.current = runId;
            try {
              await webTestingService.downloadArtifact(htmlReport);
              if (!cancelled) setReportNotice(`${htmlReport.path} was downloaded.`);
            } catch (downloadError) {
              if (!cancelled) setReportNotice(`Automatic report download failed: ${downloadError.message}`);
            }
          } else if (run.status === 'completed' && !htmlReport) {
            setReportNotice('The run completed, but no HTML report was produced. Check the logs and artifacts.');
          }
          return;
        }
        nextPoll = window.setTimeout(poll, 1500);
      } catch (pollError) {
        if (!cancelled) setError(pollError.message || 'Run status could not be loaded.');
      }
    }

    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(nextPoll);
    };
  }, [runId]);

  async function handleRun(event) {
    event.preventDefault();
    const routes = parseRoutes(routesText);
    setError('');
    setReportNotice('');
    setArtifacts([]);
    setLogs('');
    setResult(null);
    setIsStarting(true);
    try {
      const response = await webTestingService.start({
        website_url: websiteUrl.trim(),
        username: websiteUsername.trim(),
        password: websitePassword,
        routes,
      });
      automaticDownloadRun.current = '';
      setRunId(response.run_id);
      setStatus(response.status);
      setWebsitePassword('');
    } catch (runError) {
      setError(runError.message || 'The Web Testing script could not be started.');
    } finally {
      setIsStarting(false);
    }
  }

  async function handleStop() {
    if (!runId || isStopping) return;
    setIsStopping(true);
    setError('');
    try {
      await webTestingService.stop(runId);
    } catch (stopError) {
      setError(stopError.message || 'The run could not be stopped.');
    } finally {
      setIsStopping(false);
    }
  }

  async function handleDownload(artifact) {
    setDownloadingPath(artifact.path);
    setError('');
    try {
      await webTestingService.downloadArtifact(artifact);
      setReportNotice(`${artifact.path} was downloaded.`);
    } catch (downloadError) {
      setError(downloadError.message || 'The artifact could not be downloaded.');
    } finally {
      setDownloadingPath('');
    }
  }

  async function handleUninstall() {
    if (isUninstalling) return;
    setIsUninstalling(true);
    setError('');
    try {
      await packageService.uninstall(module.id);
      onUninstalled();
    } catch (uninstallError) {
      setError(uninstallError.message || 'Uninstallation failed.');
      setIsUninstalling(false);
    }
  }

  const isActive = status === 'queued' || status === 'running';
  const canRun = websiteUrl.trim() && websiteUsername.trim() && websitePassword;

  return (
    <ScreenContainer className="module-screen web-testing-screen">
      <header className="module-screen__header">
        <button className="back-button" onClick={onBack} type="button">
          <Icon name="arrowLeft" />
          <span>Back to workspace</span>
        </button>
        <strong>Web Testing Agent</strong>
      </header>

      <main className="web-testing-layout">
        <section className="web-testing-panel web-testing-config">
          <div className="web-testing-heading">
            <div className="module-placeholder__icon"><Icon name="globe" size={38} /></div>
            <div>
              <p className="eyebrow">PACKAGE INSTALLED</p>
              <h1>Run Web Testing</h1>
              <p>Enter any website login URL and run-scoped test credentials.</p>
            </div>
          </div>

          {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
          {reportNotice ? <div className="alert alert--info" role="status">{reportNotice}</div> : null}

          <form className="web-testing-form" onSubmit={handleRun}>
            <AppInput
              autoComplete="url"
              disabled={isActive}
              icon="globe"
              label="Website login URL"
              name="websiteUrl"
              onChange={(event) => setWebsiteUrl(event.target.value)}
              placeholder="https://test.example/login"
              required
              type="url"
              value={websiteUrl}
            />
            <AppInput
              autoComplete="username"
              disabled={isActive}
              icon="user"
              label="Website test username"
              name="websiteUsername"
              onChange={(event) => setWebsiteUsername(event.target.value)}
              placeholder="Test account username"
              required
              type="text"
              value={websiteUsername}
            />
            <AppInput
              autoComplete="off"
              disabled={isActive}
              icon="lock"
              id="websitePassword"
              label="Website test password"
              name="password"
              onChange={(event) => setWebsitePassword(event.target.value)}
              onToggleVisibility={() => setIsPasswordVisible((visible) => !visible)}
              placeholder="Used only for this run"
              required
              type={isPasswordVisible ? 'text' : 'password'}
              value={websitePassword}
            />
            <div className="field">
              <label className="field__label" htmlFor="testRoutes">Routes to test (optional)</label>
              <textarea
                className="web-testing-routes"
                disabled={isActive}
                id="testRoutes"
                onChange={(event) => setRoutesText(event.target.value)}
                placeholder="/dashboard, /facility-creation"
                value={routesText}
              />
              <p className="web-testing-help">
                Leave blank to check login only. For broader testing, add absolute paths beginning with /, separated by commas or new lines.
              </p>
            </div>

            <div className="web-testing-form__actions">
              <AppButton
                disabled={!canRun || isActive}
                icon="globe"
                loading={isStarting}
                title={isActive ? 'Script is running' : 'Run Script'}
                type="submit"
              />
              {isActive ? (
                <AppButton loading={isStopping} onClick={handleStop} title="Stop Run" variant="secondary" />
              ) : null}
              <AppButton
                className="package-uninstall-button"
                disabled={isActive}
                icon="trash"
                loading={isUninstalling}
                onClick={handleUninstall}
                title="Uninstall package"
                variant="secondary"
              />
            </div>
          </form>
        </section>

        <section className="web-testing-panel web-testing-output" aria-live="polite">
          <div className="run-status-row">
            <div>
              <p className="eyebrow">LATEST RUN</p>
              <h2>Execution output</h2>
            </div>
            <span className={`run-status run-status--${status}`}>{statusLabel(status)}</span>
          </div>

          {runId ? <p className="run-id">Run ID: {runId}</p> : <p className="run-empty">Configure the target and click Run Script.</p>}

          {result?.summary ? (
            <div className="run-summary">
              {Object.entries(result.summary).map(([key, value]) => (
                <div key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{String(value)}</strong></div>
              ))}
            </div>
          ) : null}

          <div className="run-logs">
            <div className="run-logs__header"><strong>Logs</strong><span>{logs ? 'Live output' : 'Waiting for output'}</span></div>
            <pre>{logs || 'No logs available yet.'}</pre>
          </div>

          {artifacts.length ? (
            <div className="run-artifacts">
              <h3>Output files</h3>
              {artifacts.map((artifact) => (
                <div className="run-artifact" key={artifact.path}>
                  <div><strong>{artifact.path}</strong><span>{artifact.size_bytes.toLocaleString()} bytes</span></div>
                  <AppButton
                    icon="download"
                    loading={downloadingPath === artifact.path}
                    onClick={() => handleDownload(artifact)}
                    title={artifact.path.endsWith('.html') ? 'Download HTML' : 'Download'}
                    variant="secondary"
                  />
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </main>
    </ScreenContainer>
  );
}
