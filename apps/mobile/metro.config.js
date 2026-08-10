const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Resolve the plain-TS @evergreen/shared-types workspace package (AD-2): the
// workspace hoists it under the repo root, so Metro must watch both trees.
const workspaceRoot = path.resolve(__dirname, "../..");
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(workspaceRoot, "node_modules"),
  path.resolve(__dirname, "node_modules"),
];

module.exports = withNativeWind(config, { input: "./src/global.css" });
