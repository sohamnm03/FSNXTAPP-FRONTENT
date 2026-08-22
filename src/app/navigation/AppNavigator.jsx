import { useState } from 'react';

import HomeScreen from '../../features/home/screens/HomeScreen';
import ModulePlaceholderScreen from '../../features/packages/screens/ModulePlaceholderScreen';

export default function AppNavigator() {
  const [activeModule, setActiveModule] = useState(null);

  if (activeModule) {
    return <ModulePlaceholderScreen module={activeModule} onBack={() => setActiveModule(null)} />;
  }

  return <HomeScreen onOpenModule={setActiveModule} />;
}
