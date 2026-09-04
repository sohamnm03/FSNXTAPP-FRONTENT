import { useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';

import AppButton from '../../../components/common/AppButton';
import AppInput from '../../../components/common/AppInput';
import BrandLogo from '../../../components/common/BrandLogo';
import GoogleIcon from '../../../components/common/GoogleIcon';
import Icon from '../../../components/common/Icon';
import ScreenContainer from '../../../components/common/ScreenContainer';
import LoginIllustration from '../components/LoginIllustration';
import { useAuth } from '../context/AuthContext';
import { validateLogin } from '../validation/loginValidation';

export default function LoginScreen() {
  const {
    isAuthenticating,
    login,
    loginWithGoogle,
    loginWithGoogleDesktop,
    rememberedUsername,
  } = useAuth();
  const [username, setUsername] = useState(rememberedUsername);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(Boolean(rememberedUsername));
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loginError, setLoginError] = useState('');
  const [information, setInformation] = useState('');
  const passwordInput = useRef(null);
  const desktopGoogleAuth = window.desktopAPI?.googleAuth;

  function updateField(field, value) {
    if (field === 'username') setUsername(value);
    if (field === 'password') setPassword(value);
    setErrors((current) => ({ ...current, [field]: undefined }));
    setLoginError('');
    setInformation('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isAuthenticating) return;

    const validationErrors = validateLogin({ username, password });
    setErrors(validationErrors);
    setLoginError('');
    if (Object.keys(validationErrors).length > 0) return;

    try {
      await login({ username, password, rememberMe });
    } catch (error) {
      setLoginError(error.message || 'Login failed. Please try again.');
    }
  }

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
        <form className="login-card" noValidate onSubmit={handleSubmit}>
          <header className="login-card__header">
            <div className="login-card__mobile-logo"><BrandLogo large /></div>
            <h2>Welcome Back</h2>
            <p>Sign in to continue</p>
          </header>

          {loginError ? (
            <div className="alert alert--error" role="alert">
              <Icon name="warning" />
              <span>{loginError}</span>
            </div>
          ) : null}
          {information ? <div className="alert alert--info" role="status">{information}</div> : null}

          <AppInput
            autoComplete="username"
            autoFocus
            error={errors.username}
            icon="user"
            label="Username or Email"
            name="username"
            onChange={(event) => updateField('username', event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                passwordInput.current?.focus();
              }
            }}
            placeholder="Enter your username"
            type="text"
            value={username}
          />

          <AppInput
            autoComplete="current-password"
            error={errors.password}
            icon="lock"
            label="Password"
            name="password"
            onChange={(event) => updateField('password', event.target.value)}
            onToggleVisibility={() => setShowPassword((visible) => !visible)}
            placeholder="Enter your password"
            ref={passwordInput}
            type={showPassword ? 'text' : 'password'}
            value={password}
          />

          <div className="login-options">
            <label className="checkbox">
              <input
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                type="checkbox"
              />
              <span>Remember Me</span>
            </label>
            <button
              className="text-button"
              onClick={() => setInformation(
                'Please contact your administrator to reset your password.',
              )}
              type="button"
            >
              Forgot Password?
            </button>
          </div>

          <AppButton
            className="login-card__submit"
            loading={isAuthenticating}
            title={isAuthenticating ? 'Signing in...' : 'Login'}
            type="submit"
          />

          <div className="login-divider" aria-hidden="true">
            <span>or</span>
          </div>

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

          <div className="connection-status" role="status">
            <span aria-hidden="true" />
            <p>Authentication service connected</p>
          </div>
        </form>
      </section>
    </ScreenContainer>
  );
}
