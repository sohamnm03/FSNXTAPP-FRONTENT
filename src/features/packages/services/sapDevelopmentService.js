function localDevelopmentTerminal() {
  const terminal = window.desktopAPI?.sapDevelopment;
  if (!terminal) throw new Error('SAP Development is available in the desktop application only.');
  return terminal;
}

export const sapDevelopmentService = {
  getStatus(username) {
    return localDevelopmentTerminal().getStatus(username);
  },
  chooseReportDirectory() {
    return localDevelopmentTerminal().chooseReportDirectory();
  },
  getAuthStatus() {
    return localDevelopmentTerminal().getAuthStatus();
  },
  configureToken(token) {
    return localDevelopmentTerminal().configureToken(token);
  },
  clearToken() {
    return localDevelopmentTerminal().clearToken();
  },
  start(prompt, sessionId, systemId, credentials) {
    return localDevelopmentTerminal().start(prompt, sessionId, systemId, credentials);
  },
  async focusApp() {
    await window.desktopAPI?.app?.focusWindow?.();
  },
  getRun(runId) {
    return localDevelopmentTerminal().getRun(runId);
  },
  stop(runId) {
    return localDevelopmentTerminal().stop(runId);
  },
};
