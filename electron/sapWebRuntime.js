const fs = require('fs');
const path = require('path');

function webRuntimeEnvironment(resourcesPath, env = process.env) {
  const runtimeRoot = path.join(resourcesPath, 'sap-web-runtime');
  const nodePath = path.join(runtimeRoot, 'node.exe');
  const browsersPath = path.join(runtimeRoot, 'browsers');
  if (!fs.existsSync(nodePath) || !fs.existsSync(browsersPath)) {
    throw new Error('The Fiori browser runtime is missing. Reinstall the latest FSNXT application.');
  }
  // Windows environment names are case insensitive; avoid competing PATH keys.
  const result = { ...env };
  const pathKey = Object.keys(result).find((key) => key.toLowerCase() === 'path');
  const existingPath = pathKey ? result[pathKey] : '';
  if (pathKey) delete result[pathKey];
  result.PATH = `${runtimeRoot}${path.delimiter}${existingPath}`;
  result.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
  return result;
}

module.exports = { webRuntimeEnvironment };
