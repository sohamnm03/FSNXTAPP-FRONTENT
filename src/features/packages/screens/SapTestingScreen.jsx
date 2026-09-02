import { useEffect, useRef, useState } from 'react';

import AppButton from '../../../components/common/AppButton';
import Icon from '../../../components/common/Icon';
import ScreenContainer from '../../../components/common/ScreenContainer';
import { packageService } from '../services/packageService';
import { sapTerminalService } from '../services/sapTerminalService';

const FINAL_STATUSES = new Set(['completed', 'failed', 'stopped']);
const LANES = {
  gui: { label: 'SAP GUI', description: 'SAP GUI for Windows' },
  web: { label: 'Fiori / WebGUI', description: 'Browser-based SAP testing' },
};

function statusLabel(status, source) {
  return ({ idle: 'Ready', running: source === 'direct' ? 'Test is running' : 'Claude is working', completed: 'Ready', failed: 'Needs attention', stopped: 'Stopped', stopping: 'Stopping' })[status] || 'Ready';
}

function explicitRunRequest(text) {
  if (/\b(?:do not|don't|dont|never)\s+(?:run|execute|start)|\b(?:preview|dry[- ]?run|explain|list)\b/i.test(text)) return null;
  if (!/\b(?:run|execute|start|perform)\b/i.test(text)) return null;
  const caseMatch = text.match(/\bTC[- ]?0*(\d{1,3})\b/i);
  if (!caseMatch) return null;
  const stageMatch = text.match(/\bstage\s+([a-z][a-z0-9-]*)\b/i)
    || text.match(/\bat\s+(?:the\s+)?([a-z][a-z0-9-]*)\s+stage\b/i);
  return {
    caseId: `TC-${caseMatch[1].padStart(3, '0')}`,
    stage: stageMatch?.[1]?.toLowerCase() || '',
  };
}

export default function SapTestingScreen({ module, onBack, onUninstalled }) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [lane, setLane] = useState('gui');
  const [prompt, setPrompt] = useState('');
  const [runId, setRunId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState('idle');
  const [activeSource, setActiveSource] = useState('claude');
  const [messages, setMessages] = useState([]);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [error, setError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [configuredServerName, setConfiguredServerName] = useState('');
  const [connectionServerName, setConnectionServerName] = useState('');
  const conversationRef = useRef(null);

  useEffect(() => {
    Promise.all([sapTerminalService.getProject(), sapTerminalService.getAuthStatus()])
      .then(([project, auth]) => {
        setIsConfigured(Boolean(project.configured));
        setConfiguredServerName(project.serverName || '');
        setIsAuthenticated(Boolean(auth.loggedIn));
        if (!project.configured) setError('The SAP automation package is missing. Reinstall the application.');
        else if (!auth.available) setError('The bundled Claude Code runtime is missing. Reinstall the application.');
      })
      .catch((projectError) => setError(projectError.message))
      .finally(() => setIsCheckingAuth(false));
  }, []);

  useEffect(() => {
    if (!runId || FINAL_STATUSES.has(status)) return undefined;
    let cancelled = false;
    const poll = window.setInterval(async () => {
      try {
        const run = await sapTerminalService.getRun(runId);
        if (cancelled) return;
        setStatus(run.status);
        setActiveSource(run.source || 'claude');
        if (run.status === 'completed') {
          setSessionId(run.sessionId || '');
          setMessages((current) => [...current, { id: `${run.id}-assistant`, role: run.source === 'direct' ? 'runner' : 'assistant', text: run.response || 'Completed.' }]);
        } else if (run.status === 'failed') {
          setError(run.error || 'Claude Code could not complete the request.');
        }
      } catch (pollError) {
        if (!cancelled) setError(pollError.message);
      }
    }, 500);
    return () => { cancelled = true; window.clearInterval(poll); };
  }, [runId, status]);

  useEffect(() => {
    if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages, status]);

  async function sendPrompt(event) {
    event.preventDefault();
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;
    const directRequest = explicitRunRequest(nextPrompt);
    setIsStarting(true);
    setError('');
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: nextPrompt }]);
    setPrompt('');
    try {
      if (directRequest) {
        const proposal = await sapTerminalService.prepareCase(lane, directRequest.caseId, directRequest.stage);
        setPendingConfirmation(proposal);
        return;
      }
      const run = await sapTerminalService.start(nextPrompt, sessionId, lane);
      setActiveSource('claude');
      setRunId(run.id);
      setStatus(run.status);
    } catch (runError) {
      setError(runError.message);
      setStatus('failed');
    } finally {
      setIsStarting(false);
    }
  }

  async function stopRun() {
    setIsStopping(true);
    try { await sapTerminalService.stop(runId); } catch (stopError) { setError(stopError.message); } finally { setIsStopping(false); }
  }

  async function signIn() {
    setIsSigningIn(true);
    setError('');
    try {
      const auth = await sapTerminalService.login();
      setIsAuthenticated(Boolean(auth.loggedIn));
    } catch (signInError) {
      setError(signInError.message);
    } finally {
      setIsSigningIn(false);
    }
  }

  async function testConnection() {
    setConnectionStatus('checking');
    setConnectionServerName('');
    setError('');
    try {
      const result = await sapTerminalService.testConnection();
      setConnectionStatus(result.connected ? 'connected' : 'disconnected');
      setConnectionServerName(result.connected ? result.serverName || configuredServerName : '');
    } catch {
      setConnectionStatus('disconnected');
      setConnectionServerName('');
    }
  }

  function closeConnectionDialog() {
    if (connectionStatus !== 'checking') setConnectionStatus('idle');
  }

  async function confirmRun() {
    if (!pendingConfirmation) return;
    setIsStarting(true);
    setError('');
    try {
      const run = await sapTerminalService.startConfirmedCase(pendingConfirmation.confirmationId);
      setMessages((current) => [...current, {
        id: `${run.id}-approved`,
        role: 'runner',
        text: `${pendingConfirmation.caseId} was approved by the user and started against ${pendingConfirmation.systemLabel}.`,
      }]);
      setPendingConfirmation(null);
      setActiveSource('direct');
      setRunId(run.id);
      setStatus(run.status);
    } catch (runError) {
      setError(runError.message);
      setStatus('failed');
    } finally {
      setIsStarting(false);
    }
  }

  function cancelRun() {
    if (!pendingConfirmation) return;
    setMessages((current) => [...current, {
      id: crypto.randomUUID(),
      role: 'runner',
      text: `${pendingConfirmation.caseId} was cancelled. No SAP write was authorized.`,
    }]);
    setPendingConfirmation(null);
  }

  function newChat() {
    setSessionId('');
    setRunId('');
    setStatus('idle');
    setActiveSource('claude');
    setMessages([]);
    setPendingConfirmation(null);
    setError('');
    setPrompt('');
  }

  function selectLane(nextLane) {
    setLane(nextLane);
    newChat();
  }

  async function uninstall() {
    setIsUninstalling(true);
    try {
      await packageService.uninstall(module.id);
      onUninstalled();
    } catch (uninstallError) {
      setError(uninstallError.message);
      setIsUninstalling(false);
    }
  }

  const isActive = status === 'running' || status === 'stopping';
  const isTestingConnection = connectionStatus === 'checking';
  const isBusy = isActive || isTestingConnection;

  return (
    <ScreenContainer className="module-screen sap-testing-screen">
      <header className="module-screen__header">
        <button className="back-button" onClick={onBack} type="button"><Icon name="arrowLeft" /><span>Back to workspace</span></button>
        <strong>SAP Testing with Claude Code</strong>
      </header>

      <main className="sap-chat-layout">
        <aside className="sap-chat-sidebar">
          <div className="sap-sidebar-content">
            <div className="web-testing-heading">
              <div className="module-placeholder__icon"><Icon name="building" size={38} /></div>
              <div>
                <p className="eyebrow">SAP TESTING</p>
                <p>Choose a testing mode, then type what you want to test.</p>
              </div>
            </div>

            <div className="sap-connection-section">
              <span className="sap-sidebar-label">SAP system</span>
              <AppButton
                disabled={!isConfigured || isActive}
                loading={isTestingConnection}
                onClick={testConnection}
                title={isTestingConnection ? 'Testing connection...' : 'Test Connection'}
                variant="secondary"
              />
              {connectionStatus === 'connected' ? (
                <p className="sap-connection-result sap-connection-result--connected" role="status">Connection established</p>
              ) : null}
              {connectionStatus === 'disconnected' ? (
                <p className="sap-connection-result sap-connection-result--disconnected" role="status">Not connected</p>
              ) : null}
            </div>

            <div className="sap-lane-section">
              <span className="sap-sidebar-label">Testing mode</span>
              <div className="sap-lane-switch" role="group" aria-label="Testing mode">
                {Object.entries(LANES).map(([laneId, details]) => (
                  <button aria-pressed={lane === laneId} className={lane === laneId ? 'is-active' : ''} disabled={isBusy} key={laneId} onClick={() => selectLane(laneId)} type="button">
                    <strong>{details.label}</strong><span>{details.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="sap-sidebar-actions">
            <AppButton disabled={isBusy || messages.length === 0} onClick={newChat} title="New chat" variant="secondary" />
            <AppButton className="package-uninstall-button" disabled={isBusy} icon="trash" loading={isUninstalling} onClick={uninstall} title="Uninstall" variant="secondary" />
          </div>
        </aside>

        <section className="sap-chat-panel">
          <div className="run-status-row sap-chat-header">
            <div><p className="eyebrow">CLAUDE CODE TERMINAL</p><h2>SAP automation assistant</h2></div>
            <div className="sap-chat-header-actions">
              {!isCheckingAuth && !isAuthenticated ? <AppButton loading={isSigningIn} onClick={signIn} title="Sign in to Claude" variant="secondary" /> : null}
              <span className={`run-status ${connectionServerName ? 'run-status--connected' : `run-status--${status}`}`}>
                {isAuthenticated ? connectionServerName
                  ? `Connected to ${connectionServerName}`
                  : connectionStatus === 'connected' ? 'Connected' : statusLabel(status, activeSource) : 'Sign in required'}
              </span>
            </div>
          </div>
          {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
          <div className="sap-conversation" ref={conversationRef}>
            {messages.length === 0 ? (
              <div className="sap-chat-welcome"><Icon name="toolbox" size={36} /><h3>{isAuthenticated ? 'What would you like to test?' : 'Sign in to Claude to begin'}</h3><p>{LANES[lane].description} is selected.</p></div>
            ) : messages.map((message) => (
              <article className={`sap-message sap-message--${message.role}`} key={message.id}>
                <span>{message.role === 'user' ? 'You' : message.role === 'runner' ? 'Test runner' : 'Claude'}</span><div>{message.text}</div>
              </article>
            ))}
            {isActive ? <div className="sap-thinking"><span /><span /><span /> Claude Code is working in the SAP project…</div> : null}
          </div>
          <form className="sap-prompt-form" onSubmit={sendPrompt}>
            <textarea disabled={!isConfigured || !isAuthenticated || isBusy} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
            }} placeholder="Ask Claude Code to run or inspect an SAP test…" value={prompt} />
            <div>
              <span>Enter to send · Shift+Enter for a new line</span>
              {isActive ? <AppButton loading={isStopping} onClick={stopRun} title="Stop" variant="secondary" /> : <AppButton disabled={!isConfigured || !isAuthenticated || isTestingConnection || !prompt.trim()} loading={isStarting} title="Send" type="submit" />}
            </div>
          </form>
        </section>
      </main>
      {connectionStatus !== 'idle' ? (
        <div className="sap-connection-backdrop" role="presentation">
          <section
            aria-describedby="sap-connection-dialog-description"
            aria-labelledby="sap-connection-dialog-title"
            aria-live="polite"
            aria-modal="true"
            className={`sap-connection-dialog sap-connection-dialog--${connectionStatus}`}
            role="dialog"
          >
            <div className="sap-connection-dialog__visual" aria-hidden="true">
              {isTestingConnection ? <span className="sap-connection-spinner" /> : null}
              {connectionStatus === 'connected' ? <Icon name="check" size={46} /> : null}
              {connectionStatus === 'disconnected' ? <Icon name="warning" size={46} /> : null}
            </div>
            <p className="eyebrow">SAP CONNECTION</p>
            <h2 id="sap-connection-dialog-title">
              {isTestingConnection ? 'Testing Connection to SAP' : null}
              {connectionStatus === 'connected' ? 'Connection Successful' : null}
              {connectionStatus === 'disconnected' ? 'Connection Failed to SAP' : null}
            </h2>
            <p id="sap-connection-dialog-description">
              {isTestingConnection ? 'Please wait while we verify your SAP system connection.' : null}
              {connectionStatus === 'connected' ? 'SAP is connected and ready to perform tests.' : null}
              {connectionStatus === 'disconnected' ? 'Connect to SAP to perform tests, then try the connection again.' : null}
            </p>
            {!isTestingConnection ? (
              <div className="sap-connection-dialog__actions">
                <AppButton onClick={closeConnectionDialog} title="Close" variant="secondary" />
                {connectionStatus === 'disconnected' ? <AppButton onClick={testConnection} title="Test Again" /> : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
      {pendingConfirmation ? (
        <div className="sap-confirmation-backdrop" role="presentation">
          <section aria-labelledby="sap-confirmation-title" aria-modal="true" className="sap-confirmation-dialog" role="dialog">
            <p className="eyebrow">HUMAN APPROVAL REQUIRED</p>
            <h2 id="sap-confirmation-title">Confirm SAP database writes</h2>
            <dl>
              <div>
                <dt>Test case</dt>
                <dd><strong>{pendingConfirmation.caseId}</strong> — {pendingConfirmation.summary}</dd>
              </div>
              <div>
                <dt>SAP system</dt>
                <dd>{pendingConfirmation.systemLabel}</dd>
              </div>
              <div>
                <dt>Stage</dt>
                <dd>{pendingConfirmation.stage}</dd>
              </div>
              <div>
                <dt>Database writes</dt>
                <dd>{pendingConfirmation.writes}</dd>
              </div>
            </dl>
            <p className="sap-confirmation-warning">Confirm only if you intend to make these changes in the displayed SAP system. Cancel performs no write.</p>
            <div className="sap-confirmation-actions">
              <AppButton disabled={isStarting} onClick={cancelRun} title="Cancel" variant="secondary" />
              <AppButton loading={isStarting} onClick={confirmRun} title="Confirm & Run" />
            </div>
          </section>
        </div>
      ) : null}
    </ScreenContainer>
  );
}
