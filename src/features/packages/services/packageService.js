import { storageKeys, storageService } from '../../../services/storage/storageService';

const DOWNLOAD_TICK_MS = 35;
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
  async install(moduleId, onProgress) {
    if (!availableModules.some((module) => module.id === moduleId)) {
      throw new Error('The selected module is not available.');
    }

    onProgress?.(0);
    for (let progress = 1; progress <= 100; progress += 1) {
      await delay(DOWNLOAD_TICK_MS);
      onProgress?.(progress);
    }

    const installedIds = await this.getInstalledModuleIds();
    const nextInstalledIds = [...new Set([...installedIds, moduleId])];
    await storageService.setJson(storageKeys.installedModules, nextInstalledIds);
    return nextInstalledIds;
  },
  async uninstall(moduleId) {
    if (!availableModules.some((module) => module.id === moduleId)) {
      throw new Error('The selected module is not available.');
    }

    const installedIds = await this.getInstalledModuleIds();
    const nextInstalledIds = installedIds.filter((installedId) => installedId !== moduleId);
    await storageService.setJson(storageKeys.installedModules, nextInstalledIds);
    return nextInstalledIds;
  },
};
