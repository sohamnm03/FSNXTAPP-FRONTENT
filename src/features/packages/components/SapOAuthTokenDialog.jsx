import AppButton from '../../../components/common/AppButton';

export default function SapOAuthTokenDialog({
  isAuthenticated,
  isSaving,
  onClose,
  onDisconnect,
  onSubmit,
  onTokenChange,
  token,
  tokenEnding,
}) {
  return (
    <div className="sap-token-backdrop" role="presentation">
      <section aria-labelledby="sap-development-token-dialog-title" aria-modal="true" className="sap-token-dialog" role="dialog">
        <p className="eyebrow">CLAUDE AUTHENTICATION</p>
        <h2 id="sap-development-token-dialog-title">{isAuthenticated ? 'Manage OAuth token' : 'Connect OAuth token'}</h2>
        <p className="sap-token-dialog__description">
          The token is encrypted using Windows secure storage and shared with this app&apos;s Claude processes only.
        </p>
        <form onSubmit={onSubmit}>
          <label htmlFor="sap-development-oauth-token">OAuth token</label>
          <input
            autoComplete="off"
            autoFocus
            id="sap-development-oauth-token"
            onChange={(event) => onTokenChange(event.target.value)}
            placeholder={isAuthenticated ? `Current token ends in ${tokenEnding}` : 'Paste your Claude OAuth token'}
            spellCheck="false"
            type="password"
            value={token}
          />
          <span>Generate a long-lived token with the Claude Code setup-token command.</span>
          <div className="sap-token-dialog__actions">
            {isAuthenticated ? <AppButton disabled={isSaving} onClick={onDisconnect} title="Disconnect" variant="secondary" /> : null}
            <AppButton disabled={isSaving} onClick={onClose} title="Cancel" variant="secondary" />
            <AppButton disabled={!token.trim()} loading={isSaving} title={isAuthenticated ? 'Replace token' : 'Connect'} type="submit" />
          </div>
        </form>
      </section>
    </div>
  );
}
