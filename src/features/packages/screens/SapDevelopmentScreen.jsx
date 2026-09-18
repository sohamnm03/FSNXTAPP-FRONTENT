import { useEffect, useState } from 'react';

import Icon from '../../../components/common/Icon';
import ScreenContainer from '../../../components/common/ScreenContainer';
import { useAuth } from '../../auth/context/AuthContext';
import SapChatPanel from '../components/SapChatPanel';
import SapConnectionDialog from '../components/SapConnectionDialog';
import SapConnectionPanel from '../components/SapConnectionPanel';
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
  const [error, setError] = useState('');

  const isTestingConnection = connectionStatus === 'checking';

  useEffect(() => {
    sapTerminalService.getProject(emailPrefix(user))
      .then((project) => {
        setIsConfigured(Boolean(project.configured));
        setSapSystems(project.systems || []);
        setSelectedSystemId(project.defaultSystemId || project.systems?.[0]?.id || '');
        if (!project.configured) setError('The SAP automation package is missing. Reinstall the application.');
      })
      .catch((projectError) => setError(projectError.message));
  }, [user]);

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
              disabled={isTestingConnection}
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

        <SapChatPanel connectionServerName={connectionServerName} error={error} />
      </main>

      <SapConnectionDialog
        connectionStatus={connectionStatus}
        onClose={closeConnectionDialog}
        onRetry={testConnection}
        progress={connectionProgress}
      />
    </ScreenContainer>
  );
}
