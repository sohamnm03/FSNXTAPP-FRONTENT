const assert = require('node:assert/strict');
const test = require('node:test');

const { createGoogleDesktopAuth } = require('./googleDesktopAuth');

const CLIENT_ID = 'desktop-client.apps.googleusercontent.com';

test('completes PKCE loopback flow and returns the one-time exchange inputs', async () => {
  let authorizationRequest;

  const auth = createGoogleDesktopAuth({
    clientId: CLIENT_ID,
    openExternal: async (url) => {
      authorizationRequest = new URL(url);
      const callback = new URL(authorizationRequest.searchParams.get('redirect_uri'));
      callback.searchParams.set('code', 'authorization-code');
      callback.searchParams.set('state', authorizationRequest.searchParams.get('state'));
      const response = await fetch(callback);
      assert.equal(response.status, 200);
    },
    timeoutMs: 5000,
  });

  const exchange = await auth.login();

  assert.equal(authorizationRequest.hostname, 'accounts.google.com');
  assert.equal(authorizationRequest.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorizationRequest.searchParams.get('scope'), 'openid email profile');
  assert.equal(exchange.code, 'authorization-code');
  assert.equal(exchange.redirectUri, authorizationRequest.searchParams.get('redirect_uri'));
  assert.equal(exchange.nonce, authorizationRequest.searchParams.get('nonce'));
  assert.ok(exchange.codeVerifier.length >= 43);
});

test('retry opens a fresh browser flow and cancels the abandoned attempt', async () => {
  const urls = [];
  const auth = createGoogleDesktopAuth({
    clientId: CLIENT_ID,
    openExternal: async (url) => { urls.push(new URL(url)); },
    timeoutMs: 1000,
  });
  const first = auth.login();
  const cancelled = assert.rejects(first, /Google sign in was cancelled, please try again/);
  while (!urls.length) await new Promise((resolve) => setTimeout(resolve, 5));
  const second = auth.login();
  while (urls.length < 2) await new Promise((resolve) => setTimeout(resolve, 5));
  await cancelled;
  assert.notEqual(urls[0].searchParams.get('state'), urls[1].searchParams.get('state'));
  const callback = new URL(urls[1].searchParams.get('redirect_uri'));
  callback.searchParams.set('state', urls[1].searchParams.get('state'));
  callback.searchParams.set('code', 'fresh-code');
  await fetch(callback);
  assert.equal((await second).code, 'fresh-code');
});

test('Google cancellation uses friendly text and FS Sprint branding, then permits retry', async () => {
  let requests = 0;
  const auth = createGoogleDesktopAuth({
    clientId: CLIENT_ID,
    timeoutMs: 1000,
    openExternal: async (url) => {
      requests++;
      const authorization = new URL(url);
      const callback = new URL(authorization.searchParams.get('redirect_uri'));
      callback.searchParams.set('state', authorization.searchParams.get('state'));
      callback.searchParams.set('error', 'access_denied');
      const response = await fetch(callback);
      const html = await response.text();
      assert.match(html, /return to FS Sprint/);
      assert.doesNotMatch(html, /FSNXT/);
    },
  });
  await assert.rejects(auth.login(), /Google sign in was cancelled, please try again/);
  await assert.rejects(auth.login(), /Google sign in was cancelled, please try again/);
  assert.equal(requests, 2);
});
