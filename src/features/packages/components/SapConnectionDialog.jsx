import AppButton from '../../../components/common/AppButton';
import Icon from '../../../components/common/Icon';

export default function SapConnectionDialog({ connectionStatus, onClose, onRetry, progress }) {
  if (connectionStatus === 'idle') return null;

  const isTestingConnection = connectionStatus === 'checking';

  return (
    <div className="sap-connection-backdrop" role="presentation">
      <section
        aria-describedby="sap-development-connection-dialog-description"
        aria-labelledby="sap-development-connection-dialog-title"
        aria-live="polite"
        aria-modal="true"
        className={`sap-connection-dialog sap-connection-dialog--${connectionStatus}`}
        role="dialog"
      >
        {isTestingConnection ? (
          <div aria-label="SAP connection test progress" aria-valuemax="100" aria-valuemin="0" aria-valuenow={progress} className="sap-connection-progress" role="progressbar">
            <div aria-hidden="true" className="sap-connection-progress__track">
              <span style={{ width: `${progress}%` }} />
            </div>
            <strong aria-hidden="true">{progress}%</strong>
          </div>
        ) : (
          <div className="sap-connection-dialog__visual" aria-hidden="true">
            {connectionStatus === 'connected' ? <Icon name="check" size={46} /> : null}
            {connectionStatus === 'disconnected' ? <Icon name="warning" size={46} /> : null}
          </div>
        )}
        <p className="eyebrow">SAP CONNECTION</p>
        <h2 id="sap-development-connection-dialog-title">
          {isTestingConnection ? 'Testing Connection to SAP' : null}
          {connectionStatus === 'connected' ? 'Connection Successful' : null}
          {connectionStatus === 'disconnected' ? 'Connection Failed to SAP' : null}
        </h2>
        <p id="sap-development-connection-dialog-description">
          {isTestingConnection ? 'Please wait while we verify your SAP system connection.' : null}
          {connectionStatus === 'connected' ? 'SAP is connected and ready for development.' : null}
          {connectionStatus === 'disconnected' ? 'Connect to SAP to begin development, then try the connection again.' : null}
        </p>
        {!isTestingConnection ? (
          <div className="sap-connection-dialog__actions">
            <AppButton onClick={onClose} title="Close" variant="secondary" />
            {connectionStatus === 'disconnected' ? <AppButton onClick={onRetry} title="Test Again" /> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
