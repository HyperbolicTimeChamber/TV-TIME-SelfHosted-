const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function withNotificationColorFix(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const app = manifest.application?.[0];
    if (!app) return config;

    const metaData = app["meta-data"] || [];
    const target = metaData.find(
      (item) =>
        item.$?.["android:name"] ===
        "com.google.firebase.messaging.default_notification_color"
    );

    if (target) {
      target.$["tools:replace"] = "android:resource";
      // Ensure tools namespace is declared
      manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    return config;
  });
};
