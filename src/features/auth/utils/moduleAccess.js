function enabled(value) {
  return value === true || value === 1 || value === '1';
}

function moduleFallback(user, moduleName) {
  return Array.isArray(user?.modules)
    && user.modules.some((entry) => String(entry).trim().toLowerCase() === moduleName);
}

export function canAccessModule(user, moduleId) {
  if (!user) return false;

  if (moduleId === 'sap-testing') {
    const flag = user.isTesting ?? user.is_testing;
    return flag == null ? moduleFallback(user, 'testing') : enabled(flag);
  }

  if (moduleId === 'sap-development') {
    const flag = user.isDev ?? user.is_dev;
    return flag == null ? moduleFallback(user, 'development') : enabled(flag);
  }

  return false;
}
