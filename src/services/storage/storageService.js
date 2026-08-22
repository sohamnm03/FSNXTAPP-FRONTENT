export const storageKeys = Object.freeze({
  rememberedUsername: '@fsnxt/remembered-username',
  installedModules: '@fsnxt/installed-modules',
});

export const storageService = {
  async getString(key) {
    return localStorage.getItem(key);
  },
  async setString(key, value) {
    localStorage.setItem(key, value);
  },
  async remove(key) {
    localStorage.removeItem(key);
  },
  async getJson(key, fallbackValue) {
    const storedValue = localStorage.getItem(key);
    if (!storedValue) return fallbackValue;

    try {
      return JSON.parse(storedValue);
    } catch {
      return fallbackValue;
    }
  },
  async setJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};
