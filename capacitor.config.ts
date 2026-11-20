import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "vn.pikepike.app",
  appName: "PikePike",
  webDir: "dist",
  // Native HTTP shares Android's cookie jar. The client bundles its own UI;
  // server.url is intentionally absent so the API does not host the app screens.
  plugins: { CapacitorHttp: { enabled: true } },
};
export default config;
