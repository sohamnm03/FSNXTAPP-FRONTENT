import { useState } from 'react';

import { useAuth } from '../../features/auth/context/AuthContext';
import { canAccessModule } from '../../features/auth/utils/moduleAccess';
import HomeScreen from '../../features/home/screens/HomeScreen';
import ModulePlaceholderScreen from '../../features/packages/screens/ModulePlaceholderScreen';
import SapDevelopmentScreen from '../../features/packages/screens/SapDevelopmentScreen';
import SapTestingScreen from '../../features/packages/screens/SapTestingScreen';

export default function AppNavigator() {
  const { user } = useAuth();
  const [activeModule, setActiveModule] = useState(null);

  if (activeModule && canAccessModule(user, activeModule.id)) {
    const ModuleScreen = ({
      'sap-development': SapDevelopmentScreen,
      'sap-testing': SapTestingScreen,
    })[activeModule.id] || ModulePlaceholderScreen;
    return (
      <ModuleScreen
        module={activeModule}
        onBack={() => setActiveModule(null)}
        onUninstalled={() => setActiveModule(null)}
      />
    );
  }

  return (
    <HomeScreen
      onOpenModule={(module) => {
        if (canAccessModule(user, module.id)) setActiveModule(module);
      }}
    />
  );
}
