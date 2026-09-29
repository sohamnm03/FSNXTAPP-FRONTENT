import { useEffect, useState } from 'react';

import AppButton from '../../../components/common/AppButton';
import Icon from '../../../components/common/Icon';
import ScreenContainer from '../../../components/common/ScreenContainer';
import { useAuth } from '../../auth/context/AuthContext';
import SapChatPanel from '../components/SapChatPanel';
import SapConnectionDialog from '../components/SapConnectionDialog';
import SapConnectionPanel from '../components/SapConnectionPanel';
import SapOAuthTokenDialog from '../components/SapOAuthTokenDialog';
import { packageService } from '../services/packageService';
import { sapDevelopmentService } from '../services/sapDevelopmentService';
import { sapTerminalService } from '../services/sapTerminalService';

function emailPrefix(user) {
  const source = user?.email || user?.username || '';
  return String(source).split('@')[0].trim();
}

function friendlyDevelopmentError(error, fallback = 'SAP Development could not complete the request. Please try again.') {
  const rawMessage = typeof error === 'string' ? error : error?.message;
  if (!rawMessage) return fallback;
  if (/MODULE_NOT_FOUND|Cannot find module|node:internal|Require stack|Error invoking remote method/i.test(rawMessage)) {
    return 'SAP Development tools could not start. Please reinstall FS Sprint or contact support.';
  }
  const message = rawMessage
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
    .split(/\r?\n/)[0]
    .trim();
  return message.length > 240 ? fallback : message || fallback;
}

export default function SapDevelopmentScreen({ module, onBack, onUninstalled }) {
  const { user } = useAuth();
  const [isConfigured, setIsConfigured] = useState(false);
  const [sapSystems, setSapSystems] = useState([]);
  const [selectedSystemId, setSelectedSystemId] = useState('');
  const [sapUsername, setSapUsername] = useState('');
  const [sapPassword, setSapPassword] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [connectionServerName, setConnectionServerName] = useState('');
  const [connectionProgress, setConnectionProgress] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [oauthToken, setOauthToken] = useState('');
  const [tokenEnding, setTokenEnding] = useState('');
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [runId, setRunId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState('idle');
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isChoosingReportDirectory, setIsChoosingReportDirectory] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [reportDirectory, setReportDirectory] = useState('');
  const [error, setError] = useState('');

  const isTestingConnection = connectionStatus === 'checking';
  const isActive = status === 'running' || status === 'stopping' || status === 'finalizing';
  const isBusy = isActive || isTestingConnection || isStarting;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      sapTerminalService.getProject(emailPrefix(user)),
      sapDevelopmentService.getStatus(emailPrefix(user)),
      sapDevelopmentService.getAuthStatus(),
    ])
      .then(([project, development, auth]) => {
        if (cancelled) return;
        const developmentSystems = development.systems?.length ? development.systems : project.systems || [];
        setIsConfigured(Boolean(project.configured && development.configured));
        setSapSystems(developmentSystems);
        setSelectedSystemId(development.defaultSystemId || project.defaultSystemId || developmentSystems[0]?.id || '');
        setReportDirectory(development.reportDirectory || '');
        setIsAuthenticated(Boolean(auth.loggedIn));
        setTokenEnding(auth.tokenEnding || '');
        if (!project.configured) setError('The SAP connection package is missing. Reinstall the application.');
        else if (!development.configured) setError('The SAP Development companion workspace is incomplete.');
      })
      .catch((projectError) => { if (!cancelled) setError(friendlyDevelopmentError(projectError)); })
      .finally(() => { if (!cancelled) setIsCheckingAuth(false); });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!runId || !isActive) return undefined;
    let cancelled = false;
    const poll = window.setInterval(async () => {
      try {
        const run = await sapDevelopmentService.getRun(runId);
        if (cancelled) return;
        setStatus(run.status);
        if (run.status === 'completed') {
          setSessionId(run.sessionId || '');
          setMessages((current) => [...current, {
            id: `${run.id}-assistant`,
            role: 'assistant',
            text: run.response || 'Completed.',
          }, ...(run.reportPath ? [{
            id: `${run.id}-report`,
            role: 'runner',
            text: 'Development activity report saved into the selected report folder.',
          }] : [])]);
          if (run.reportError) setError(friendlyDevelopmentError(run.reportError));
        } else if (run.status === 'failed') {
          setSessionId(run.sessionId || '');
          if (run.response) {
            setMessages((current) => [...current, {
              id: `${run.id}-assistant`,
              role: 'assistant',
              text: run.response,
            }]);
          }
          if (run.reportPath) {
            setMessages((current) => [...current, {
              id: `${run.id}-report`,
              role: 'runner',
              text: 'Development activity report saved into the selected report folder.',
            }]);
          }
          setError(friendlyDevelopmentError(
            [run.error || 'SAP Development Assistant could not complete the request.', run.reportError].filter(Boolean).join(' '),
          ));
        }
      } catch (pollError) {
        if (!cancelled) setError(friendlyDevelopmentError(pollError));
      }
    }, 500);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [isActive, runId]);

  useEffect(() => {
    if (!isTestingConnection) return undefined;
    const progressTimer = window.setInterval(() => {
      setConnectionProgress((current) => {
        if (current >= 92) return current;
        if (current < 60) return Math.min(current + 4, 92);
        if (current < 84) return Math.min(current + 2, 92);
        return current + 1;
      });
    }, 150);
    return () => window.clearInterval(progressTimer);
  }, [isTestingConnection]);

  function selectSystem(systemId) {
    setSelectedSystemId(systemId);
    setConnectionStatus('idle');
    setConnectionServerName('');
    setError('');
  }

  async function testConnection() {
    if (!selectedSystemId) return;
    setConnectionProgress(0);
    setConnectionStatus('checking');
    setConnectionServerName('');
    setError('');
    try {
      // One authenticated GUI launch validates the credentials and leaves SAP
      // Easy Access open for transaction-code work.
      const result = await sapTerminalService.openGuiSession(selectedSystemId, {
        username: sapUsername.trim(),
        password: sapPassword,
      });
      setConnectionProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      const serverName = sapSystems.find((system) => system.id === selectedSystemId)?.name || selectedSystemId;
      setConnectionStatus(result.opened ? 'connected' : 'disconnected');
      setConnectionServerName(result.opened ? serverName : '');
      if (!result.opened) {
        setError(friendlyDevelopmentError(
          result.reason,
          'Connection failed. Check the SAP username and password.',
        ));
      } else {
        setMessages((current) => [...current, {
          id: crypto.randomUUID(),
          role: 'runner',
          text: `Connected to ${serverName} as ${result.user || sapUsername.trim()}. You can start chatting now.`,
        }]);
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        await sapDevelopmentService.focusApp().catch(() => {});
      }
    } catch {
      setConnectionProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      setConnectionStatus('disconnected');
      setConnectionServerName('');
      setError('Connection failed. Check the SAP username and password.');
    }
  }

  function closeConnectionDialog() {
    if (!isTestingConnection) setConnectionStatus('idle');
  }

  async function chooseReportDirectory() {
    setIsChoosingReportDirectory(true);
    setError('');
    try {
      const result = await sapDevelopmentService.chooseReportDirectory();
      setReportDirectory(result.reportDirectory || '');
    } catch (chooseError) {
      setError(friendlyDevelopmentError(chooseError));
    } finally {
      setIsChoosingReportDirectory(false);
    }
  }

  function newChat() {
    setSessionId('');
    setRunId('');
    setStatus('idle');
    setMessages([]);
    setError('');
    setPrompt('');
  }

  async function uninstall() {
    setIsUninstalling(true);
    try {
      await packageService.uninstall(module.id);
      onUninstalled();
    } catch (uninstallError) {
      setError(friendlyDevelopmentError(uninstallError));
      setIsUninstalling(false);
    }
  }

  async function sendPrompt(event) {
    event.preventDefault();
    const nextPrompt = prompt.trim();
    if (!nextPrompt || !connectionServerName || isBusy) return;
    setIsStarting(true);
    setError('');
    setPrompt('');
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: nextPrompt }]);
    try {
      const run = await sapDevelopmentService.start(nextPrompt, sessionId, selectedSystemId, {
        username: sapUsername.trim(),
        password: sapPassword,
      });
      setRunId(run.id);
      setStatus(run.status);
    } catch (runError) {
      setError(friendlyDevelopmentError(runError));
      setStatus('failed');
    } finally {
      setIsStarting(false);
    }
  }

  async function stopRun() {
    if (!runId) return;
    setIsStopping(true);
    try {
      const run = await sapDevelopmentService.stop(runId);
      setStatus(run.status);
    } catch (stopError) {
      setError(friendlyDevelopmentError(stopError));
    } finally {
      setIsStopping(false);
    }
  }

  async function configureToken(event) {
    event.preventDefault();
    setIsSavingToken(true);
    setError('');
    try {
      const auth = await sapDevelopmentService.configureToken(oauthToken);
      setIsAuthenticated(Boolean(auth.loggedIn));
      setTokenEnding(auth.tokenEnding || '');
      setOauthToken('');
      if (auth.loggedIn) setIsTokenDialogOpen(false);
    } catch (tokenError) {
      setError(friendlyDevelopmentError(tokenError));
    } finally {
      setIsSavingToken(false);
    }
  }

  async function disconnectToken() {
    setIsSavingToken(true);
    setError('');
    try {
      await sapDevelopmentService.clearToken();
      setIsAuthenticated(false);
      setTokenEnding('');
      setOauthToken('');
      setIsTokenDialogOpen(false);
      setSessionId('');
      setMessages([]);
      setStatus('idle');
    } catch (tokenError) {
      setError(friendlyDevelopmentError(tokenError));
    } finally {
      setIsSavingToken(false);
    }
  }

  return (
    <ScreenContainer className="module-screen sap-testing-screen sap-development-screen">
      <header className="module-screen__header">
        <button className="back-button" onClick={onBack} type="button"><Icon name="arrowLeft" /><span>Back to workspace</span></button>
        <strong>SAP Development with AI Assistant</strong>
      </header>

      <main className="sap-chat-layout">
        <aside aria-label="SAP development controls" className="sap-chat-sidebar">
          <div className="sap-sidebar-content">
            <div className="sap-testing-heading">
              <div className="module-placeholder__icon"><Icon name="code" size={38} /></div>
              <div>
                <p className="eyebrow">SAP DEVELOPMENT</p>
                <p>{connectionServerName
                  ? 'Your SAP system is connected and ready for development.'
                  : 'Enter your SAP credentials to connect and begin development.'}</p>
              </div>
            </div>

            <SapConnectionPanel
              disabled={isBusy}
              isConfigured={isConfigured}
              isTestingConnection={isTestingConnection}
              onPasswordChange={setSapPassword}
              onSystemChange={selectSystem}
              onTestConnection={testConnection}
              onUsernameChange={setSapUsername}
              password={sapPassword}
              selectedSystemId={selectedSystemId}
              systems={sapSystems}
              username={sapUsername}
            />

            {connectionServerName ? (
              <div className="sap-archive-section">
                <span className="sap-sidebar-label">Development reports folder</span>
                <p title={reportDirectory}>{reportDirectory || 'Downloads\\FS Sprint Development Reports'}</p>
                <AppButton
                  disabled={isBusy}
                  loading={isChoosingReportDirectory}
                  onClick={chooseReportDirectory}
                  title="Change folder"
                  variant="secondary"
                />
              </div>
            ) : null}
          </div>

          <div className="sap-sidebar-actions">
            <AppButton disabled={isBusy || messages.length === 0} onClick={newChat} title="New chat" variant="secondary" />
            <AppButton className="package-uninstall-button" disabled={isBusy} icon="trash" loading={isUninstalling} onClick={uninstall} title="Uninstall" variant="secondary" />
          </div>
        </aside>

        <SapChatPanel
          connectionServerName={connectionServerName}
          error={error}
          isAuthenticated={isAuthenticated && !isCheckingAuth}
          isBusy={isBusy}
          isStarting={isStarting}
          isStopping={isStopping}
          messages={messages}
          onOpenToken={() => setIsTokenDialogOpen(true)}
          onPromptChange={setPrompt}
          onStop={stopRun}
          onSubmit={sendPrompt}
          prompt={prompt}
          status={status}
        />
      </main>

      <SapConnectionDialog
        connectionStatus={connectionStatus}
        onClose={closeConnectionDialog}
        onRetry={testConnection}
        progress={connectionProgress}
      />
      {isTokenDialogOpen ? (
        <SapOAuthTokenDialog
          isAuthenticated={isAuthenticated}
          isSaving={isSavingToken}
          onClose={() => { setOauthToken(''); setIsTokenDialogOpen(false); }}
          onDisconnect={disconnectToken}
          onSubmit={configureToken}
          onTokenChange={setOauthToken}
          token={oauthToken}
          tokenEnding={tokenEnding}
        />
      ) : null}
    </ScreenContainer>
  );
}
