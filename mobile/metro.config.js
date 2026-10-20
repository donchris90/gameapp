// Lets the app bundle the 3D car files (.glb) as assets.
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
for (const ext of ['glb', 'gltf']) if (!config.resolver.assetExts.includes(ext)) config.resolver.assetExts.push(ext);
module.exports = config;
