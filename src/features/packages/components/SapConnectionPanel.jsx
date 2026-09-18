import AppButton from '../../../components/common/AppButton';

export default function SapConnectionPanel({
  disabled = false,
  isConfigured,
  isTestingConnection,
  onPasswordChange,
  onSystemChange,
  onTestConnection,
  onUsernameChange,
  password,
  selectedSystemId,
  systems,
  username,
}) {
  return (
    <div className="sap-connection-section">
      <span className="sap-sidebar-label">SAP system</span>
      <select
        aria-label="SAP system to connect"
        disabled={disabled || systems.length === 0}
        onChange={(event) => onSystemChange(event.target.value)}
        value={selectedSystemId}
      >
        {systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
      </select>
      <span className="sap-sidebar-label">SAP credentials</span>
      <div className="sap-credential-fields">
        <label className="sap-credential-field">
          <span>Username</span>
          <input
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => onUsernameChange(event.target.value)}
            placeholder="SAP username"
            spellCheck="false"
            type="text"
            value={username}
          />
        </label>
        <label className="sap-credential-field">
          <span>Password</span>
          <input
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="SAP password"
            type="password"
            value={password}
          />
        </label>
      </div>
      <AppButton
        disabled={!isConfigured || disabled || !selectedSystemId || !username.trim() || !password.trim()}
        loading={isTestingConnection}
        onClick={onTestConnection}
        title={isTestingConnection ? 'Testing connection...' : 'Test Connection'}
        variant="secondary"
      />
    </div>
  );
}
