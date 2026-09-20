import type { ConfigContext, ExpoConfig } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name || "Ponto Certo",
  slug: config.slug || "ponto-certo",
  extra: {
    ...config.extra,
    ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
      ? {
          eas: {
            ...config.extra?.eas,
            projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
          },
        }
      : {}),
  },
  android: {
    ...config.android,
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
  },
});
