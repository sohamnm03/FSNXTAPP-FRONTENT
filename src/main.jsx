import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';

import App from './App';
import { environment } from './config/environment';
import './styles/theme.css';
import './styles/app.css';

const application = window.desktopAPI?.googleAuth
  ? <App />
  : (
    <GoogleOAuthProvider clientId={environment.googleClientId}>
      <App />
    </GoogleOAuthProvider>
  );

createRoot(document.getElementById('root')).render(
  <StrictMode>{application}</StrictMode>,
);
