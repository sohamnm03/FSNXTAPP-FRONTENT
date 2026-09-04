import { useEffect, useRef, useState } from 'react';

import AppButton from '../../../components/common/AppButton';
import Icon from '../../../components/common/Icon';
import ScreenContainer from '../../../components/common/ScreenContainer';
import { packageService } from '../services/packageService';
import { sapTerminalService } from '../services/sapTerminalService';

const FINAL_STATUSES = new Set(['completed', 'failed', 'stopped']);
const LANES = {
  gui: { label: 'GUI Lane', description: 'SAP GUI for Windows' },
  web: { label: 'Web Lane', description: 'Browser-based SAP testing' },
};

function statusLabel(status, source) {
  return ({ idle: 'Ready', running: source === 'direct' ? 'Test is running' : 'AI Assistant is working', completed: 'Ready', failed: 'Needs attention', stopped: 'Stopped', stopping: 'Stopping' })[status] || 'Ready';
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
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [oauthToken, setOauthToken] = useState('');
  const [tokenEnding, setTokenEnding] = useState('');
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [sapSystems, setSapSystems] = useState([]);
  const [selectedSystemId, setSelectedSystemId] = useState('');
  const [sapUsername, setSapUsername] = useState('');
  const [sapPassword, setSapPassword] = useState('');
  const [connectionServerName, setConnectionServerName] = useState('');
  const [connectionProgress, setConnectionProgress] = useState(0);
  const [cases, setCases] = useState([]);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const [viewingCase, setViewingCase] = useState(null);
  const [isLoadingCaseFile, setIsLoadingCaseFile] = useState(false);
  const [caseFileError, setCaseFileError] = useState('');
  const conversationRef = useRef(null);

  useEffect(() => {
    Promise.all([sapTerminalService.getProject(), sapTerminalService.getAuthStatus()])
      .then(([project, auth]) => {
        setIsConfigured(Boolean(project.configured));
        setSapSystems(project.systems || []);
        setSelectedSystemId(project.defaultSystemId || project.systems?.[0]?.id || '');
        setIsAuthenticated(Boolean(auth.loggedIn));
        setTokenEnding(auth.tokenEnding || '');
        if (!project.configured) setError('The SAP automation package is missing. Reinstall the application.');
        else if (!auth.available) setError('The bundled AI Assistant runtime is missing. Reinstall the application.');
        if (project.configured) loadCases(lane);
      })
      .catch((projectError) => setError(projectError.message))
      .finally(() => setIsCheckingAuth(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount with the initial lane
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
          setError(run.error || 'AI Assistant could not complete the request.');
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

  async function loadCases(nextLane) {
    setIsLoadingCases(true);
    setCases([]);
    try {
      const result = await sapTerminalService.listCases(nextLane);
      const nextCases = result.cases || [];
      setCases(nextCases);
      setSelectedCase((current) => nextCases.find((testCase) => testCase.caseId === current?.caseId)
        || nextCases[0]
        || null);
    } catch (listError) {
      setError(listError.message);
    } finally {
      setIsLoadingCases(false);
    }
  }

  useEffect(() => {
    if (connectionStatus !== 'checking') return undefined;
    const progressTimer = window.setInterval(() => {
      setConnectionProgress((current) => {
        if (current >= 92) return current;
        if (current < 60) return Math.min(current + 4, 92);
        if (current < 84) return Math.min(current + 2, 92);
        return current + 1;
      });
    }, 150);
    return () => window.clearInterval(progressTimer);
  }, [connectionStatus]);

  function webCredentials() {
    const username = sapUsername.trim();
    return lane === 'web' && username && sapPassword ? { username, password: sapPassword } : null;
  }

  async function sendPrompt(event) {
    event.preventDefault();
    if (!connectionServerName) return;
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;
    const directRequest = explicitRunRequest(nextPrompt);
    setIsStarting(true);
    setError('');
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: nextPrompt }]);
    setPrompt('');
    try {
      if (directRequest) {
        const proposal = await sapTerminalService.prepareCase(lane, directRequest.caseId, directRequest.stage, webCredentials());
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

  async function configureToken(event) {
    event.preventDefault();
    setIsSigningIn(true);
    setError('');
    try {
      const auth = await sapTerminalService.configureToken(oauthToken);
      setIsAuthenticated(Boolean(auth.loggedIn));
      setTokenEnding(auth.tokenEnding || '');
      setOauthToken('');
      if (auth.loggedIn) setIsTokenDialogOpen(false);
    } catch (signInError) {
      setError(signInError.message);
    } finally {
      setIsSigningIn(false);
    }
  }

  async function disconnectToken() {
    setIsSigningIn(true);
    setError('');
    try {
      await sapTerminalService.clearToken();
      setIsAuthenticated(false);
      setTokenEnding('');
      setOauthToken('');
      setIsTokenDialogOpen(false);
      newChat();
    } catch (disconnectError) {
      setError(disconnectError.message);
    } finally {
      setIsSigningIn(false);
    }
  }

  async function testConnection() {
    if (!selectedSystemId) return;
    setConnectionProgress(0);
    setConnectionStatus('checking');
    setConnectionServerName('');
    setError('');
    try {
      const result = await sapTerminalService.testConnection(selectedSystemId);
      setConnectionProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      setConnectionStatus(result.connected ? 'connected' : 'disconnected');
      setConnectionServerName(result.connected ? result.serverName || sapSystems.find((system) => system.id === selectedSystemId)?.name || '' : '');
    } catch {
      setConnectionProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      setConnectionStatus('disconnected');
      setConnectionServerName('');
    }
  }

  function closeConnectionDialog() {
    if (connectionStatus !== 'checking') setConnectionStatus('idle');
  }

  async function openCase(testCase) {
    setSelectedCase(testCase);
    setViewingCase({ caseId: testCase.caseId, summary: testCase.summary, fileName: '', content: '' });
    setCaseFileError('');
    setIsLoadingCaseFile(true);
    try {
      const file = await sapTerminalService.getCaseFile(lane, testCase.caseId);
      setViewingCase((current) => (current && current.caseId === testCase.caseId ? { ...current, ...file } : current));
    } catch (fileError) {
      setCaseFileError(fileError.message);
    } finally {
      setIsLoadingCaseFile(false);
    }
  }

  function closeCaseDialog() {
    setViewingCase(null);
    setCaseFileError('');
  }

  async function runViewedCase() {
    if (!viewingCase) return;
    const caseId = viewingCase.caseId;
    closeCaseDialog();
    setIsStarting(true);
    setError('');
    try {
      const proposal = await sapTerminalService.prepareCase(lane, caseId, '', webCredentials());
      setPendingConfirmation(proposal);
    } catch (runError) {
      setError(runError.message);
    } finally {
      setIsStarting(false);
    }
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
    setSelectedCase(null);
    closeCaseDialog();
    loadCases(nextLane);
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
  const visibleSelectedCase = connectionServerName ? selectedCase : null;

  return (
    <ScreenContainer className="module-screen sap-testing-screen">
      <header className="module-screen__header">
        <button className="back-button" onClick={onBack} type="button"><Icon name="arrowLeft" /><span>Back to workspace</span></button>
        <strong>SAP Testing with AI Assistant</strong>
      </header>

      <main className="sap-chat-layout">
        <aside aria-label="SAP testing controls" className="sap-chat-sidebar">
          <div className="sap-sidebar-content">
            <div className="web-testing-heading">
              <div className="module-placeholder__icon"><Icon name="building" size={38} /></div>
              <div>
                <p className="eyebrow">SAP TESTING</p>
                <p>{connectionServerName
                  ? 'Choose a testing mode, then select a test case.'
                  : 'Enter your SAP credentials to connect and begin testing.'}</p>
              </div>
            </div>

            <div className="sap-connection-section">
              <span className="sap-sidebar-label">SAP system</span>
              <select
                aria-label="SAP system to test"
                disabled={isBusy || sapSystems.length === 0}
                onChange={(event) => {
                  setSelectedSystemId(event.target.value);
                  setConnectionStatus('idle');
                  setConnectionServerName('');
                }}
                value={selectedSystemId}
              >
                {sapSystems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
              </select>
              <span className="sap-sidebar-label">SAP credentials</span>
              <div className="sap-credential-fields">
                <label className="sap-credential-field">
                  <span>Username</span>
                  <input
                    autoComplete="off"
                    disabled={isBusy}
                    onChange={(event) => setSapUsername(event.target.value)}
                    placeholder="SAP username"
                    spellCheck="false"
                    type="text"
                    value={sapUsername}
                  />
                </label>
                <label className="sap-credential-field">
                  <span>Password</span>
                  <input
                    autoComplete="off"
                    disabled={isBusy}
                    onChange={(event) => setSapPassword(event.target.value)}
                    placeholder="SAP password"
                    type="password"
                    value={sapPassword}
                  />
                </label>
              </div>
              <AppButton
                disabled={!isConfigured || isActive || !selectedSystemId || !sapUsername.trim() || !sapPassword.trim()}
                loading={isTestingConnection}
                onClick={testConnection}
                title={isTestingConnection ? 'Testing connection...' : 'Test Connection'}
                variant="secondary"
              />
              {connectionStatus === 'disconnected' ? (
                <p className="sap-connection-result sap-connection-result--disconnected" role="status">Not connected</p>
              ) : null}
            </div>

            {connectionServerName ? (
              <>
                <div className="sap-lane-section">
                  <div className="sap-section-label">
                    <span className="sap-sidebar-label">Testing mode</span>
                    <Icon name="info" size={14} />
                  </div>
                  <div className="sap-lane-switch" role="group" aria-label="Testing mode">
                    {Object.entries(LANES).map(([laneId, details]) => (
                      <button aria-pressed={lane === laneId} className={lane === laneId ? 'is-active' : ''} disabled={isBusy} key={laneId} onClick={() => selectLane(laneId)} type="button">
                        <Icon className="sap-lane-switch__icon" name={laneId === 'gui' ? 'window' : 'globe'} size={20} />
                        <span className="sap-lane-switch__copy">
                          <strong>{details.label}</strong>
                          <span>{details.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sap-case-section">
                  <div className="sap-case-section__header">
                    <span className="sap-sidebar-label">{LANES[lane].label} test cases</span>
                    <div className="sap-case-section__tools">
                      <span className="sap-case-count">{cases.length} test {cases.length === 1 ? 'case' : 'cases'}</span>
                      <span aria-hidden="true" className="sap-case-options"><Icon name="sliders" size={16} /></span>
                    </div>
                  </div>
                  <div className="sap-case-list">
                    {isLoadingCases ? (
                      <p>Loading test cases…</p>
                    ) : cases.length === 0 ? (
                      <p>No test cases found for this lane.</p>
                    ) : cases.map((testCase) => (
                      <button
                        aria-pressed={selectedCase?.caseId === testCase.caseId}
                        className={selectedCase?.caseId === testCase.caseId ? 'is-active' : ''}
                        disabled={isBusy}
                        key={testCase.caseId}
                        onClick={() => openCase(testCase)}
                        type="button"
                      >
                        <span className="sap-case-list__number">{testCase.caseId.replace('TC-', '')}</span>
                        <span>
                          <strong>{testCase.caseId}</strong>
                          <span>{testCase.summary}</span>
                        </span>
                        <Icon className="sap-case-list__chevron" name="chevronRight" size={17} />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="sap-sidebar-actions">
            <AppButton disabled={isBusy || messages.length === 0} onClick={newChat} title="New chat" variant="secondary" />
            <AppButton className="package-uninstall-button" disabled={isBusy} icon="trash" loading={isUninstalling} onClick={uninstall} title="Uninstall" variant="secondary" />
          </div>
        </aside>

        <section className="sap-chat-panel">
          <div className="run-status-row sap-chat-header">
            <div><p className="eyebrow">AI ASSISTANT TERMINAL</p><h2>SAP automation assistant</h2></div>
            <div className="sap-chat-header-actions">
              {connectionServerName ? (
                <span className="sap-server-chip">
                  <span aria-hidden="true" className="sap-server-chip__dot" />
                  <span>Connected</span>
                  <strong>· {connectionServerName}</strong>
                </span>
              ) : null}
              {!isCheckingAuth ? (
                <AppButton
                  disabled={isBusy}
                  onClick={() => setIsTokenDialogOpen(true)}
                  title={isAuthenticated ? `OAuth token ••••${tokenEnding}` : 'Connect OAuth token'}
                  variant="secondary"
                />
              ) : null}
              {!connectionServerName ? (
                <span className={`run-status run-status--${status}`}>
                  {isAuthenticated ? statusLabel(status, activeSource) : 'OAuth token required'}
                </span>
              ) : null}
            </div>
          </div>
          {visibleSelectedCase ? (
            <section className="sap-selected-case" aria-label="Selected test case context">
              <div className="sap-selected-case__icon"><Icon name="testCase" size={24} /></div>
              <div className="sap-selected-case__copy">
                <div>
                  <strong>{visibleSelectedCase.caseId}</strong>
                  <span>{LANES[lane].label}</span>
                </div>
                <p>{visibleSelectedCase.summary}</p>
              </div>
            </section>
          ) : null}
          {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
          <div className="sap-conversation" ref={conversationRef}>
            {messages.length === 0 ? (
              <div className="sap-chat-welcome">
                <Icon name="toolbox" size={36} />
                <h3>
                  {isAuthenticated
                    ? visibleSelectedCase ? `How can I help with ${visibleSelectedCase.caseId}?` : 'What would you like to test?'
                    : 'Connect a Claude OAuth token to begin'}
                </h3>
                <p>
                  {visibleSelectedCase
                    ? 'Ask about this test case, its steps, prerequisites, or a previous result.'
                    : `${LANES[lane].description} is selected.`}
                </p>
              </div>
            ) : messages.map((message) => (
              <article className={`sap-message sap-message--${message.role}`} key={message.id}>
                <span>{message.role === 'user' ? 'You' : message.role === 'runner' ? 'Test runner' : 'AI Assistant'}</span><div>{message.text}</div>
              </article>
            ))}
            {isActive ? <div className="sap-thinking"><span /><span /><span /> AI Assistant is working in the SAP project…</div> : null}
          </div>
          <form className="sap-prompt-form" onSubmit={sendPrompt}>
            <textarea disabled={!isConfigured || !isAuthenticated || isBusy} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
            }} placeholder={visibleSelectedCase ? `Ask the AI Assistant anything about ${visibleSelectedCase.caseId}…` : 'Ask the AI Assistant about an SAP test…'} value={prompt} />
            <div>
              <span>Enter to send · Shift+Enter for a new line</span>
              {isActive ? <AppButton loading={isStopping} onClick={stopRun} title="Stop" variant="secondary" /> : (
                <div
                  aria-label={!connectionServerName ? 'Connect to SAP to begin testing' : undefined}
                  className={`sap-send-action${!connectionServerName ? ' sap-send-action--connection-required' : ''}`}
                  data-tooltip={!connectionServerName ? 'Connect to SAP to begin testing' : undefined}
                  tabIndex={!connectionServerName ? 0 : undefined}
                >
                  <AppButton disabled={!isConfigured || !isAuthenticated || !connectionServerName || !prompt.trim()} loading={isStarting} title="Send" type="submit" />
                </div>
              )}
            </div>
          </form>
        </section>
      </main>
      {isTokenDialogOpen ? (
        <div className="sap-token-backdrop" role="presentation">
          <section aria-labelledby="sap-token-dialog-title" aria-modal="true" className="sap-token-dialog" role="dialog">
            <p className="eyebrow">CLAUDE AUTHENTICATION</p>
            <h2 id="sap-token-dialog-title">{isAuthenticated ? 'Manage OAuth token' : 'Connect OAuth token'}</h2>
            <p className="sap-token-dialog__description">
              The token is encrypted using Windows secure storage and is supplied only to this app's Claude processes.
            </p>
            <form onSubmit={configureToken}>
              <label htmlFor="claude-oauth-token">OAuth token</label>
              <input
                autoComplete="off"
                autoFocus
                id="claude-oauth-token"
                onChange={(event) => setOauthToken(event.target.value)}
                placeholder={isAuthenticated ? `Current token ends in ${tokenEnding}` : 'Paste your Claude OAuth token'}
                spellCheck="false"
                type="password"
                value={oauthToken}
              />
              <span>Generate a long-lived token with the Claude Code setup-token command.</span>
              <div className="sap-token-dialog__actions">
                {isAuthenticated ? <AppButton disabled={isSigningIn} onClick={disconnectToken} title="Disconnect" variant="secondary" /> : null}
                <AppButton disabled={isSigningIn} onClick={() => { setOauthToken(''); setIsTokenDialogOpen(false); }} title="Cancel" variant="secondary" />
                <AppButton disabled={!oauthToken.trim()} loading={isSigningIn} title={isAuthenticated ? 'Replace token' : 'Connect'} type="submit" />
              </div>
            </form>
          </section>
        </div>
      ) : null}
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
            {isTestingConnection ? (
              <div aria-label="SAP connection test progress" aria-valuemax="100" aria-valuemin="0" aria-valuenow={connectionProgress} className="sap-connection-progress" role="progressbar">
                <div aria-hidden="true" className="sap-connection-progress__track">
                  <span style={{ width: `${connectionProgress}%` }} />
                </div>
                <strong aria-hidden="true">{connectionProgress}%</strong>
              </div>
            ) : (
              <div className="sap-connection-dialog__visual" aria-hidden="true">
                {connectionStatus === 'connected' ? <Icon name="check" size={46} /> : null}
                {connectionStatus === 'disconnected' ? <Icon name="warning" size={46} /> : null}
              </div>
            )}
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
      {viewingCase ? (
        <div className="sap-case-backdrop" onClick={closeCaseDialog} role="presentation">
          <section
            aria-labelledby="sap-case-dialog-title"
            aria-modal="true"
            className="sap-case-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="sap-case-dialog__header">
              <div>
                <p className="eyebrow">{LANES[lane].label.toUpperCase()} TEST CASE</p>
                <h2 id="sap-case-dialog-title">{viewingCase.caseId}{viewingCase.summary ? ` — ${viewingCase.summary}` : ''}</h2>
              </div>
              <button aria-label="Close" className="sap-case-dialog__close" onClick={closeCaseDialog} type="button">×</button>
            </header>
            <div className="sap-case-dialog__body">
              {isLoadingCaseFile ? (
                <p className="sap-case-dialog__status">Loading test case…</p>
              ) : caseFileError ? (
                <p className="sap-case-dialog__status sap-case-dialog__status--error">{caseFileError}</p>
              ) : (
                <pre>{viewingCase.content}</pre>
              )}
            </div>
            <div className="sap-case-dialog__actions">
              <AppButton onClick={closeCaseDialog} title="Close" variant="secondary" />
              <AppButton
                disabled={!connectionServerName || isBusy || isStarting || isLoadingCaseFile || Boolean(caseFileError)}
                loading={isStarting}
                onClick={runViewedCase}
                title="Run test case"
              />
            </div>
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
              {pendingConfirmation.lane === 'web' ? (
                <div>
                  <dt>Fiori logon</dt>
                  <dd>{pendingConfirmation.usesCustomCredentials ? 'Using the username entered in the sidebar' : 'Using the default configured account'}</dd>
                </div>
              ) : null}
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
