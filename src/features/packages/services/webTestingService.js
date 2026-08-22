import { apiClient } from '../../../services/api/apiClient';

const runPath = (runId, suffix = '') => `/api/ai-agents/runs/${encodeURIComponent(runId)}${suffix}`;

export const webTestingService = {
  start(inputs) {
    return apiClient.post('/api/ai-agents/runs', { inputs });
  },
  getRun(runId) {
    return apiClient.get(runPath(runId));
  },
  getLogs(runId) {
    return apiClient.get(runPath(runId, '/logs'));
  },
  getArtifacts(runId) {
    return apiClient.get(runPath(runId, '/artifacts'));
  },
  stop(runId) {
    return apiClient.post(runPath(runId, '/stop'), {});
  },
  downloadArtifact(artifact) {
    const filename = artifact.path.split('/').pop() || 'site_test_report.html';
    return apiClient.download(artifact.download_url, filename);
  },
};
