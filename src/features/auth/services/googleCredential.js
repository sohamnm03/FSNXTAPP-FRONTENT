function decodeSegment(segment) {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function validateGoogleCredential(credential, expectedAudience) {
  let claims;
  try {
    if (typeof credential !== 'string') throw new Error('Malformed token');
    const segments = credential.split('.');
    if (segments.length !== 3) throw new Error('Malformed token');
    claims = decodeSegment(segments[1]);
  } catch {
    throw new Error('Google returned an invalid sign-in credential. Please try again.');
  }

  if (claims.aud !== expectedAudience) {
    throw new Error(
      'Google sign-in used a different OAuth client. Check VITE_GOOGLE_CLIENT_ID and the backend Google client ID.',
    );
  }

  if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) {
    throw new Error('Google returned an expired sign-in credential. Please sign in again.');
  }

  return credential;
}
