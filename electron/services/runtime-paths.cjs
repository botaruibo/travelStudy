const fs = require('node:fs');
const path = require('node:path');

function projectRoot() {
  return path.join(__dirname, '..', '..');
}

function existingDirectory(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) || '';
}

function existingFile(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || '';
}

function resourcesRoot() {
  return existingDirectory([
    process.resourcesPath ? path.join(process.resourcesPath, 'bootstrap') : '',
    path.join(projectRoot(), 'resources'),
  ]);
}

function bundledInitialDataDir() {
  const root = resourcesRoot();
  return existingDirectory([
    root ? path.join(root, 'initial-data', 'travel-study') : '',
  ]);
}

function bundledConfigDir() {
  const initialData = bundledInitialDataDir();
  return existingDirectory([
    initialData ? path.join(initialData, 'config') : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'bootstrap', 'config') : '',
    path.join(projectRoot(), 'electron', 'config'),
  ]);
}

function resolveConfigFile(name) {
  const configuredDir = process.env.TRAVEL_STUDY_CONFIG_DIR || '';
  return existingFile([
    configuredDir ? path.join(configuredDir, name) : '',
    bundledConfigDir() ? path.join(bundledConfigDir(), name) : '',
  ]);
}

function shouldStripModelSecrets() {
  return process.env.TRAVEL_STUDY_NO_MODEL_SECRETS === '1';
}

module.exports = {
  bundledConfigDir,
  bundledInitialDataDir,
  projectRoot,
  resolveConfigFile,
  resourcesRoot,
  shouldStripModelSecrets,
};
