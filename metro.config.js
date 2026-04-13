const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const BLOCK_LIST = [
  /[/\\]\.local[/\\].*/,
];

const existingBlockList = config.resolver.blockList;
if (existingBlockList) {
  config.resolver.blockList = Array.isArray(existingBlockList)
    ? [...existingBlockList, ...BLOCK_LIST]
    : [existingBlockList, ...BLOCK_LIST];
} else {
  config.resolver.blockList = BLOCK_LIST;
}

module.exports = config;
