import { environment } from '../../config/environment';

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), environment.apiTimeoutMs);

  try {
    const response = await fetch(`${environment.apiBaseUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
    });
    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(responseBody?.message || 'The server could not complete the request.');
    }
    return responseBody;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const apiClient = {
  get(path, options) {
    return request(path, { ...options, method: 'GET' });
  },
  post(path, body, options) {
    return request(path, { ...options, method: 'POST', body: JSON.stringify(body) });
  },
};
