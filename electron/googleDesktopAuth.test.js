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
