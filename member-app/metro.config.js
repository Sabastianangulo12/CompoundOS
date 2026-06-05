const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Windows on this machine is rejecting Metro child workers with EPERM.
// Force Metro onto a single in-process path and disable worker-thread variants.
config.maxWorkers = 1;
config.stickyWorkers = false;
config.watcher = {
  ...config.watcher,
  unstable_workerThreads: false,
};
config.transformer = {
  ...config.transformer,
  unstable_workerThreads: false,
};

module.exports = config;
