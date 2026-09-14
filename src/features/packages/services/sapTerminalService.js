function localTerminal() {
  const terminal = window.desktopAPI?.sapTerminal;
  if (!terminal) throw new Error('SAP Testing commands are available in the desktop application only.');
  return terminal;
}

export const sapTerminalService = {
  getProject(username) {
    return localTerminal().getProject(username);
  },
  chooseArchiveDirectory() {
    return localTerminal().chooseArchiveDirectory();
  },
  getAuthStatus() {
    return localTerminal().getAuthStatus();
  },
  testConnection(systemId, credentials) {
    return localTerminal().testConnection(systemId, credentials);
  },
  openGuiSession(systemId, credentials) {
    return localTerminal().openGuiSession(systemId, credentials);
  },
  configureToken(token) {
    return localTerminal().configureToken(token);
  },
  clearToken() {
    return localTerminal().clearToken();
  },
  listCases(lane) {
    return localTerminal().listCases(lane);
  },
  getCaseFile(lane, caseId) {
    return localTerminal().getCaseFile(lane, caseId);
  },
  prepareCaseCreation(lane, systemId) {
    return localTerminal().prepareCaseCreation(lane, systemId);
  },
  finalizeCaseCreation(lane, systemId, existingFiles, author) {
    return localTerminal().finalizeCaseCreation(lane, systemId, existingFiles, author);
  },
  browseCase() {
    return localTerminal().browseCase();
  },
  prepareCase(lane, caseId, stage, credentials, externalCase) {
    return localTerminal().prepareCase(lane, caseId, stage, credentials, externalCase);
  },
  startConfirmedCase(confirmationId) {
    return localTerminal().startConfirmedCase(confirmationId);
  },
  answerElicitation(runId, accept) {
    return localTerminal().answerElicitation(runId, accept);
  },
  start(prompt, sessionId, lane, options) {
    return localTerminal().start(prompt, sessionId, lane, options);
  },
  getRun(runId) {
    return localTerminal().getRun(runId);
  },
  stop(runId) {
    return localTerminal().stop(runId);
  },
};
