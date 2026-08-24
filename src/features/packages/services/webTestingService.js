function localRunner() {
  const runner = window.desktopAPI?.aiAgents;
  if (!runner) throw new Error('Web Testing runs are available in the desktop application only.');
  return runner;
}

export const webTestingService = {
  start(inputs) {
    return localRunner().start(inputs);
  },
  getRun(runId) {
    return localRunner().getRun(runId);
  },
  getLogs(runId) {
    return localRunner().getLogs(runId);
  },
  getArtifacts(runId) {
    return localRunner().getArtifacts(runId);
  },
  stop(runId) {
    return localRunner().stop(runId);
  },
  downloadArtifact(artifact) {
    return localRunner().download(artifact.run_id, artifact.path);
  },
};
