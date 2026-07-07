import type { CapacitorConfig } from '@capacitor/cli';

// The Android shell loads whichever URL is configured via CAP_SERVER_URL,
// falling back to localhost for local development.
const config: CapacitorConfig = {
  appId: 'com.evchargehub.app',
  appName: 'EV ChargeHub',
  webDir: 'dist/client',
  server: {
    url: process.env.CAP_SERVER_URL ?? 'http://10.0.2.2:3000',
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;
