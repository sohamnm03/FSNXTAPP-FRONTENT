import { environment } from '../../config/environment';

let accessToken = '';

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), environment.apiTimeoutMs);
  const requestUrl = `${environment.apiBaseUrl}${path}`;

  try {
    const response = await fetch(requestUrl, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
      signal: controller.signal,
    });
    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(responseBody?.error || responseBody?.message || 'The server could not complete the request.');
    }
    return responseBody;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`The backend did not respond at ${environment.apiBaseUrl}.`);
    }
    if (error instanceof TypeError) {
      throw new Error(`Cannot connect to the backend at ${environment.apiBaseUrl}.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const apiClient = {
  setAccessToken(token) {
    accessToken = token || '';
  },
  get(path, options) {
    return request(path, { ...options, method: 'GET' });
  },
  post(path, body, options) {
    return request(path, { ...options, method: 'POST', body: JSON.stringify(body) });
  },
  async download(path, filename) {
    if (!path.startsWith('/api/ai-agents/runs/')) {
      throw new Error('The report download path is invalid.');
    }

    const response = await fetch(`${environment.apiBaseUrl}${path}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || body?.message || 'The report could not be downloaded.');
    }

    const blobUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  },
};
