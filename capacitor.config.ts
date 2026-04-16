import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fittrack.app',
  appName: 'FitTrack',
  // WebView loads the live Vercel deployment — no static export needed.
  // All API routes, Clerk auth, AI coach, and push logic stay server-side.
  webDir: 'public', // fallback dir for offline page; live traffic goes to server.url
  server: {
    url: 'https://fittrack-app-neon.vercel.app',
    cleartext: false,
    allowNavigation: [
      'fittrack-app-neon.vercel.app',
      'clerk.accounts.dev', // Clerk OAuth redirect
      '*.clerk.accounts.dev',
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0a0a0a', // matches --bg CSS variable
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    backgroundColor: '#0a0a0a',
  },
  ios: {
    backgroundColor: '#0a0a0a',
    contentInset: 'always',
    scrollEnabled: false,
  },
};

export default config;
