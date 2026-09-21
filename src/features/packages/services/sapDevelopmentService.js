function localDevelopmentTerminal() {
  const terminal = window.desktopAPI?.sapDevelopment;
  if (!terminal) throw new Error('SAP Development is available in the desktop application only.');
  return terminal;
}

export const sapDevelopmentService = {
  getStatus() {
    return localDevelopmentTerminal().getStatus();
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
  getRun(runId) {
    return localDevelopmentTerminal().getRun(runId);
  },
  stop(runId) {
    return localDevelopmentTerminal().stop(runId);
  },
};
