const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', Object.freeze({
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  }),
  googleAuth: Object.freeze({
    login: () => ipcRenderer.invoke('google-auth:login'),
  }),
  sapTerminal: Object.freeze({
    getProject: (username) => ipcRenderer.invoke('sap-terminal:get-project', username),
    chooseArchiveDirectory: () => ipcRenderer.invoke('sap-terminal:choose-archive-directory'),
    getAuthStatus: () => ipcRenderer.invoke('sap-terminal:get-auth-status'),
    testConnection: (systemId, credentials) => ipcRenderer.invoke('sap-terminal:test-connection', systemId, credentials),
    openGuiSession: (systemId, credentials) => ipcRenderer.invoke('sap-terminal:open-gui-session', systemId, credentials),
    configureToken: (token) => ipcRenderer.invoke('sap-terminal:configure-token', token),
    clearToken: () => ipcRenderer.invoke('sap-terminal:clear-token'),
    listCases: (lane) => ipcRenderer.invoke('sap-terminal:list-cases', lane),
    getCaseFile: (lane, caseId) => ipcRenderer.invoke('sap-terminal:get-case-file', lane, caseId),
    prepareCaseCreation: (lane, systemId) => ipcRenderer.invoke('sap-terminal:prepare-case-creation', lane, systemId),
    finalizeCaseCreation: (lane, systemId, existingFiles, author) => ipcRenderer.invoke('sap-terminal:finalize-case-creation', lane, systemId, existingFiles, author),
    browseCase: () => ipcRenderer.invoke('sap-terminal:browse-case'),
    prepareCase: (lane, caseId, stage, credentials, externalCase) => ipcRenderer.invoke('sap-terminal:prepare-case', lane, caseId, stage, credentials, externalCase),
    startConfirmedCase: (confirmationId) => ipcRenderer.invoke('sap-terminal:start-confirmed-case', confirmationId),
    answerElicitation: (runId, accept) => ipcRenderer.invoke('sap-terminal:answer-elicitation', runId, accept),
    start: (prompt, sessionId, lane, options) => ipcRenderer.invoke('sap-terminal:start', prompt, sessionId, lane, options),
    getRun: (runId) => ipcRenderer.invoke('sap-terminal:get-run', runId),
    stop: (runId) => ipcRenderer.invoke('sap-terminal:stop', runId),
  }),
}));
