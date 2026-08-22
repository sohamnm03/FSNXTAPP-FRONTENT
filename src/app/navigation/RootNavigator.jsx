import LoadingIndicator from '../../components/common/LoadingIndicator';
import { useAuth } from '../../features/auth/context/AuthContext';
import AppNavigator from './AppNavigator';
import AuthNavigator from './AuthNavigator';

export default function RootNavigator() {
  const { isInitializing, user } = useAuth();

  if (isInitializing) {
    return <LoadingIndicator fullScreen label="Preparing your workspace" />;
  }

  return user ? <AppNavigator /> : <AuthNavigator />;
}
