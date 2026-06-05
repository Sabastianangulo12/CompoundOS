const localAuthPlugin = require.resolve(
  "expo-local-authentication/app.plugin.js"
);
const devClientPlugin = require.resolve("expo-dev-client/app.plugin.js");
const buildPropertiesPlugin = require.resolve(
  "expo-build-properties/app.plugin.js"
);

module.exports = {
  name: "The Compound Member",
  slug: "the-compound-member",
  owner: "the-compound-lifting-club",
  version: "0.1.0",
  scheme: "thecompoundmember",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  jsEngine: "hermes",
  assetBundlePatterns: ["**/*"],
  plugins: [
    [
      localAuthPlugin,
      {
        faceIDPermission:
          "Allow The Compound Member to use Face ID for wallet access."
      }
    ],
    devClientPlugin,
    [
      buildPropertiesPlugin,
      {
        android: {
          usesCleartextTraffic: true
        }
      }
    ]
  ],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.thecompoundliftingclub.member",
    infoPlist: {
      NSFaceIDUsageDescription:
        "Allow The Compound Member to use Face ID for wallet access.",
      ITSAppUsesNonExemptEncryption: false,
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
        NSAllowsLocalNetworking: true
      }
    }
  },
  android: {
    package: "com.thecompoundliftingclub.member"
  },
  web: {
    bundler: "metro"
  },
  extra: {
    eas: {
      projectId:
        process.env.EXPO_PUBLIC_EXPO_PROJECT_ID ||
        "599155a8-63ad-490f-b68a-4978f95ea811"
    }
  }
};
