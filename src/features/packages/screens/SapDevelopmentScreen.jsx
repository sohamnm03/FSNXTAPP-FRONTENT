import { useEffect, useState } from 'react';

import Icon from '../../../components/common/Icon';
import ScreenContainer from '../../../components/common/ScreenContainer';
import { useAuth } from '../../auth/context/AuthContext';
import SapChatPanel from '../components/SapChatPanel';
import SapConnectionDialog from '../components/SapConnectionDialog';
import SapConnectionPanel from '../components/SapConnectionPanel';
import SapOAuthTokenDialog from '../components/SapOAuthTokenDialog';
import { sapDevelopmentService } from '../services/sapDevelopmentService';
import { sapTerminalService } from '../services/sapTerminalService';

function emailPrefix(user) {
  const source = user?.email || user?.username || '';
  return String(source).split('@')[0].trim();
}

export default function SapDevelopmentScreen({ onBack }) {
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
  const [error, setError] = useState('');

  const isTestingConnection = connectionStatus === 'checking';
  const isActive = status === 'running' || status === 'stopping';
  const isBusy = isActive || isTestingConnection || isStarting;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      sapTerminalService.getProject(emailPrefix(user)),
      sapDevelopmentService.getStatus(),
      sapDevelopmentService.getAuthStatus(),
    ])
      .then(([project, development, auth]) => {
        if (cancelled) return;
        setIsConfigured(Boolean(project.configured && development.configured));
        setSapSystems(project.systems || []);
        setSelectedSystemId(project.defaultSystemId || project.systems?.[0]?.id || '');
        setIsAuthenticated(Boolean(auth.loggedIn));
        setTokenEnding(auth.tokenEnding || '');
        if (!project.configured) setError('The SAP connection package is missing. Reinstall the application.');
        else if (!development.configured) setError('The SAP Development companion workspace is incomplete.');
        else if (!development.companionTokenConfigured) setError('VS Code companion mode needs ADT_MCP_TOKEN in the SAP Development local settings.');
      })
      .catch((projectError) => { if (!cancelled) setError(projectError.message); })
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
          }]);
        } else if (run.status === 'failed') {
          setSessionId(run.sessionId || '');
          if (run.response) {
            setMessages((current) => [...current, {
              id: `${run.id}-assistant`,
              role: 'assistant',
              text: run.response,
            }]);
          }
          setError(run.error || 'SAP Development Assistant could not complete the request.');
        }
      } catch (pollError) {
        if (!cancelled) setError(pollError.message);
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
      const result = await sapTerminalService.testConnection(selectedSystemId, {
        username: sapUsername.trim(),
        password: sapPassword,
      });
      setConnectionProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      setConnectionStatus(result.connected ? 'connected' : 'disconnected');
      setConnectionServerName(result.connected
        ? result.serverName || sapSystems.find((system) => system.id === selectedSystemId)?.name || ''
        : '');
      if (!result.connected) setError(result.reason || 'Connection failed. Check the SAP username and password.');
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
      setError(runError.message);
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
      setError(stopError.message);
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
      setError(tokenError.message);
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
      setError(tokenError.message);
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
