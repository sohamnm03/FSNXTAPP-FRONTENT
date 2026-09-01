const DEFAULT_API_BASE_URL = 'https://fsnxt-app-function-cze2dxazacf0b5b4.centralindia-01.azurewebsites.net';
const DEFAULT_GOOGLE_CLIENT_ID = '418759424186-1unbscgfsrscmpopcfip8vrd62isu5rd.apps.googleusercontent.com';
const DEFAULT_GOOGLE_DESKTOP_CLIENT_ID = '418759424186-vhvn6f4g6ckvef5gvjdtqi4g6gvfmvpe.apps.googleusercontent.com';

export const environment = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  apiTimeoutMs: 15000,
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID,
  googleDesktopClientId: import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID
    || DEFAULT_GOOGLE_DESKTOP_CLIENT_ID,
};
