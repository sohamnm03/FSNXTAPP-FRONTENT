const crypto = require('crypto');
const http = require('http');

const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CALLBACK_PATH = '/';
const DEFAULT_TIMEOUT_MS = 120000;

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function createPkce() {
  const verifier = toBase64Url(crypto.randomBytes(48));
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { challenge, verifier };
}

function callbackPage(message, success) {
  const color = success ? '#1769e0' : '#b42318';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>FSNXT Google Sign-In</title></head><body style="font-family:system-ui,sans-serif;padding:48px;text-align:center"><h1 style="color:${color}">${message}</h1><p>You can close this window and return to FSNXT.</p></body></html>`;
}

function createLoopbackListener(expectedState, timeoutMs) {
  let server;
  let timeoutId;
  let settled = false;
  let resolveCode;
  let rejectCode;

  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  codePromise.catch(() => {});

  function shutdown() {
    clearTimeout(timeoutId);
    server?.close();
  }

  function finish(error, code) {
    if (settled) return;
    settled = true;
    shutdown();
    if (error) rejectCode(error);
    else resolveCode(code);
  }

  server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    if (requestUrl.pathname !== CALLBACK_PATH) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const error = requestUrl.searchParams.get('error');
    const state = requestUrl.searchParams.get('state');
    const code = requestUrl.searchParams.get('code');

    if (error) {
      response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(callbackPage('Google sign-in was cancelled', false));
      finish(new Error('Google sign-in was cancelled or denied.'));
      return;
    }
    if (!state || state !== expectedState) {
      response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(callbackPage('Google sign-in could not be verified', false));
      finish(new Error('Google sign-in state validation failed.'));
      return;
    }
    if (!code) {
      response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(callbackPage('Google did not return an authorization code', false));
      finish(new Error('Google did not return an authorization code.'));
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(callbackPage('Google sign-in complete', true));
    finish(null, code);
  });

  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}${CALLBACK_PATH}`);
    });
  });

  timeoutId = setTimeout(() => {
    finish(new Error('Google sign-in timed out. Please try again.'));
  }, timeoutMs);

  return {
    cancel: (error) => finish(error),
    codePromise,
    ready,
    shutdown,
  };
}

function createGoogleDesktopAuth({
  clientId,
  openExternal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!clientId?.endsWith('.apps.googleusercontent.com')) {
    throw new Error('A valid Google Desktop OAuth client ID is required.');
  }
  if (typeof openExternal !== 'function') {
    throw new Error('Google Desktop OAuth dependencies are unavailable.');
  }

  let activeLogin = null;

  async function runLogin() {
    const { challenge, verifier } = createPkce();
    const state = toBase64Url(crypto.randomBytes(32));
    const nonce = toBase64Url(crypto.randomBytes(32));
    const listener = createLoopbackListener(state, timeoutMs);

    try {
      const redirectUri = await listener.ready;
      const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_URL);
      authorizationUrl.search = new URLSearchParams({
        client_id: clientId,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        nonce,
        prompt: 'select_account',
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
      }).toString();

      await openExternal(authorizationUrl.toString());
      const code = await listener.codePromise;
      return {
        code,
        codeVerifier: verifier,
        nonce,
        redirectUri,
      };
    } catch (error) {
      listener.cancel(error);
      throw error;
    } finally {
      listener.shutdown();
    }
  }

  return {
    login() {
      if (!activeLogin) {
        activeLogin = runLogin().finally(() => {
          activeLogin = null;
        });
      }
      return activeLogin;
    },
  };
}

module.exports = {
  createGoogleDesktopAuth,
};
