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
  aiAgents: Object.freeze({
    start: (inputs) => ipcRenderer.invoke('ai-agents:start', inputs),
    getRun: (runId) => ipcRenderer.invoke('ai-agents:get-run', runId),
    getLogs: (runId) => ipcRenderer.invoke('ai-agents:get-logs', runId),
    getArtifacts: (runId) => ipcRenderer.invoke('ai-agents:get-artifacts', runId),
    stop: (runId) => ipcRenderer.invoke('ai-agents:stop', runId),
    download: (runId, artifactPath) => ipcRenderer.invoke('ai-agents:download', runId, artifactPath),
  }),
  sapTerminal: Object.freeze({
    getProject: () => ipcRenderer.invoke('sap-terminal:get-project'),
    getAuthStatus: () => ipcRenderer.invoke('sap-terminal:get-auth-status'),
    testConnection: (systemId) => ipcRenderer.invoke('sap-terminal:test-connection', systemId),
    configureToken: (token) => ipcRenderer.invoke('sap-terminal:configure-token', token),
    clearToken: () => ipcRenderer.invoke('sap-terminal:clear-token'),
    listCases: (lane) => ipcRenderer.invoke('sap-terminal:list-cases', lane),
    getCaseFile: (lane, caseId) => ipcRenderer.invoke('sap-terminal:get-case-file', lane, caseId),
    prepareCase: (lane, caseId, stage, credentials) => ipcRenderer.invoke('sap-terminal:prepare-case', lane, caseId, stage, credentials),
    startConfirmedCase: (confirmationId) => ipcRenderer.invoke('sap-terminal:start-confirmed-case', confirmationId),
    start: (prompt, sessionId, lane) => ipcRenderer.invoke('sap-terminal:start', prompt, sessionId, lane),
    getRun: (runId) => ipcRenderer.invoke('sap-terminal:get-run', runId),
    stop: (runId) => ipcRenderer.invoke('sap-terminal:stop', runId),
  }),
}));
