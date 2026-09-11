import { useState } from 'react';

import HomeScreen from '../../features/home/screens/HomeScreen';
import ModulePlaceholderScreen from '../../features/packages/screens/ModulePlaceholderScreen';
import SapTestingScreen from '../../features/packages/screens/SapTestingScreen';

export default function AppNavigator() {
  const [activeModule, setActiveModule] = useState(null);

  if (activeModule) {
    const ModuleScreen = ({
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

  return <HomeScreen onOpenModule={setActiveModule} />;
}
