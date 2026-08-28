const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', Object.freeze({
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
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
    login: () => ipcRenderer.invoke('sap-terminal:login'),
    prepareCase: (lane, caseId, stage) => ipcRenderer.invoke('sap-terminal:prepare-case', lane, caseId, stage),
    startConfirmedCase: (confirmationId) => ipcRenderer.invoke('sap-terminal:start-confirmed-case', confirmationId),
    start: (prompt, sessionId, lane) => ipcRenderer.invoke('sap-terminal:start', prompt, sessionId, lane),
    getRun: (runId) => ipcRenderer.invoke('sap-terminal:get-run', runId),
    stop: (runId) => ipcRenderer.invoke('sap-terminal:stop', runId),
  }),
}));
