function localTerminal() {
  const terminal = window.desktopAPI?.sapTerminal;
  if (!terminal) throw new Error('SAP Testing commands are available in the desktop application only.');
  return terminal;
}

export const sapTerminalService = {
  getProject() {
    return localTerminal().getProject();
  },
  getAuthStatus() {
    return localTerminal().getAuthStatus();
  },
  testConnection(systemId) {
    return localTerminal().testConnection(systemId);
  },
  configureToken(token) {
    return localTerminal().configureToken(token);
  },
  clearToken() {
    return localTerminal().clearToken();
  },
  prepareCase(lane, caseId, stage) {
    return localTerminal().prepareCase(lane, caseId, stage);
  },
  startConfirmedCase(confirmationId) {
    return localTerminal().startConfirmedCase(confirmationId);
  },
  start(prompt, sessionId, lane) {
    return localTerminal().start(prompt, sessionId, lane);
  },
  getRun(runId) {
    return localTerminal().getRun(runId);
  },
  stop(runId) {
    return localTerminal().stop(runId);
  },
};
