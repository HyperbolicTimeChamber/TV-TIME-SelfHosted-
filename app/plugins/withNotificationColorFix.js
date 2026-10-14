const { withAndroidManifest } = require("expo/config-plugins");

const COLOR_NAME = "notification_icon_color";

module.exports = function withNotificationColorFix(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const app = manifest.application?.[0];
    if (!app) return config;
    if (!app["meta-data"]) app["meta-data"] = [];

    app["meta-data"].push({
      $: {
        "android:name":
          "com.google.firebase.messaging.default_notification_color",
        "android:resource": `@color/${COLOR_NAME}`,
        "tools:replace": "android:resource",
      },
    });

    app["meta-data"].push({
      $: {
        "android:name":
          "expo.modules.notifications.default_notification_color",
        "android:resource": `@color/${COLOR_NAME}`,
      },
    });

    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    return config;
  });
};
