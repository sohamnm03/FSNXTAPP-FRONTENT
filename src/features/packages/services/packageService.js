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
]);

const availableModuleIds = new Set(availableModules.map((module) => module.id));

export const packageService = {
  async getInstalledModuleIds() {
    const installedIds = await storageService.getJson(storageKeys.installedModules, []);
    const supportedInstalledIds = installedIds.filter((moduleId) => availableModuleIds.has(moduleId));
    if (supportedInstalledIds.length !== installedIds.length) {
      await storageService.setJson(storageKeys.installedModules, supportedInstalledIds);
    }
    return supportedInstalledIds;
  },
  async install(moduleId, onProgress) {
    if (!availableModuleIds.has(moduleId)) {
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
    if (!availableModuleIds.has(moduleId)) {
      throw new Error('The selected module is not available.');
    }

    const installedIds = await this.getInstalledModuleIds();
    const nextInstalledIds = installedIds.filter((installedId) => installedId !== moduleId);
    await storageService.setJson(storageKeys.installedModules, nextInstalledIds);
    return nextInstalledIds;
  },
};
