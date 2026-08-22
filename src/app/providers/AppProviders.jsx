import { AuthProvider } from '../../features/auth/context/AuthContext';

export default function AppProviders({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
