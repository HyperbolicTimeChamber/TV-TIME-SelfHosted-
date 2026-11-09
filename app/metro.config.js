const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// App code's Firebase imports go through Mixpanel wrappers: Firestore op counting
// (firestore_ops) and callable tagging (caller_platform). The wrappers themselves and
// node_modules still get the real packages
const WRAPPED = {
	"@react-native-firebase/firestore": path.resolve(__dirname, "src/platform/firestore.ts"),
	"@react-native-firebase/functions": path.resolve(__dirname, "src/platform/functions.ts"),
};
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
	const wrapper = WRAPPED[moduleName];
	const origin = context.originModulePath;
	if (wrapper && origin !== wrapper && !origin.includes(`${path.sep}node_modules${path.sep}`)) {
		return { type: "sourceFile", filePath: wrapper };
	}
	return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
