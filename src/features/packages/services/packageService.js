import { storageKeys, storageService } from '../../../services/storage/storageService';

const INSTALLATION_DELAY_MS = 1400;
const delay = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

export const availableModules = Object.freeze([
  {
    id: 'sap-testing',
    name: 'SAP Testing',
    description: 'Validate SAP business workflows, integrations, and core enterprise processes.',
    icon: 'building',
  },
  {
    id: 'web-testing',
    name: 'Web Testing',
    description: 'Build and run reliable functional test scenarios for modern web applications.',
    icon: 'globe',
  },
]);

export const packageService = {
  async getInstalledModuleIds() {
    return storageService.getJson(storageKeys.installedModules, []);
  },
  async install(moduleId) {
    if (!availableModules.some((module) => module.id === moduleId)) {
      throw new Error('The selected module is not available.');
    }
    await delay(INSTALLATION_DELAY_MS);
    const installedIds = await this.getInstalledModuleIds();
    const nextInstalledIds = [...new Set([...installedIds, moduleId])];
    await storageService.setJson(storageKeys.installedModules, nextInstalledIds);
    return nextInstalledIds;
  },
};
