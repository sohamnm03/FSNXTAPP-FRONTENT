import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';

import AppButton from '../../../components/common/AppButton';
import BrandLogo from '../../../components/common/BrandLogo';
import GoogleIcon from '../../../components/common/GoogleIcon';
import Icon from '../../../components/common/Icon';
import ScreenContainer from '../../../components/common/ScreenContainer';
import LoginIllustration from '../components/LoginIllustration';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const {
    isAuthenticating,
    loginWithGoogle,
    loginWithGoogleDesktop,
  } = useAuth();
  const [loginError, setLoginError] = useState('');
  const desktopGoogleAuth = window.desktopAPI?.googleAuth;

  async function handleGoogleSuccess(credentialResponse) {
    setLoginError('');
    const credential = credentialResponse?.credential;
    if (!credential) {
      setLoginError('Google did not return a sign-in credential.');
      return;
    }

    try {
      await loginWithGoogle(credential);
    } catch (error) {
      setLoginError(error.message || 'Google sign-in failed. Please try again.');
    }
  }

  function handleGoogleError() {
    setLoginError('Google sign-in could not be completed.');
  }

  async function handleDesktopGoogleLogin() {
    if (isAuthenticating) return;
    setLoginError('');

    try {
      const authorization = await desktopGoogleAuth.login();
      await loginWithGoogleDesktop(authorization);
    } catch (error) {
      setLoginError(error.message || 'Google sign-in failed. Please try again.');
    }
  }

  return (
    <ScreenContainer className="login-screen">
      <section className="login-brand" aria-label="Application introduction">
        <header className="login-brand__header">
          <BrandLogo large />
          <div>
            <h1>FSNXT Testing Application</h1>
            <p>One platform for intelligent enterprise testing</p>
          </div>
        </header>
        <div className="login-brand__visual">
          <LoginIllustration />
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card login-card--google-only">
          <header className="login-card__header">
            <BrandLogo large />
            <h2>Access your workspace</h2>
            <p>Continue with your organization account</p>
          </header>

          {loginError ? (
            <div className="alert alert--error" role="alert">
              <Icon name="warning" />
              <span>{loginError}</span>
            </div>
          ) : null}

          <div className="login-google">
            {desktopGoogleAuth ? (
              <AppButton
                className="login-google__desktop"
                disabled={isAuthenticating}
                iconElement={<GoogleIcon size={19} />}
                onClick={handleDesktopGoogleLogin}
                title="Continue with Google"
                type="button"
                variant="secondary"
              />
            ) : (
              <GoogleLogin
                onError={handleGoogleError}
                onSuccess={handleGoogleSuccess}
                shape="rectangular"
                size="large"
                text="continue_with"
                theme="outline"
              />
            )}
          </div>

          <div className="login-divider login-divider--line" aria-hidden="true" />

          <div className="connection-status" role="status">
            <span aria-hidden="true" />
            <p>Authentication service connected</p>
          </div>
        </div>
      </section>
    </ScreenContainer>
  );
}
