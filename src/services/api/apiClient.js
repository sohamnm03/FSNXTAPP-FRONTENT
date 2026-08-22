import { environment } from '../../config/environment';

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
        ...options.headers,
      },
      signal: controller.signal,
    });
    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(responseBody?.message || 'The server could not complete the request.');
    }
    return responseBody;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`The authentication server did not respond at ${environment.apiBaseUrl}.`);
    }
    if (error instanceof TypeError) {
      throw new Error(`Cannot connect to the authentication server at ${environment.apiBaseUrl}.`);
    }
    throw error;
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
