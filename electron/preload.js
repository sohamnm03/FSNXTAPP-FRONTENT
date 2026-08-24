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
}));
