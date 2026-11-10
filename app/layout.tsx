import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import './globals.css';

// Self-hosted via next/font — zero CLS, no external request at runtime
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow-sans',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-barlow-cond',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FitTrack',
  description: 'A numbered strength program that works offline: log every set, and the next session unlocks when this one is done.',
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'FitTrack' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#080b10',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#22c55e',
          colorBackground: '#0e1117',
          colorInputBackground: '#1e2532',
          colorInputText: '#f1f5f9',
          colorText: '#f1f5f9',
          colorTextSecondary: '#94a3b8',
          colorNeutral: '#94a3b8',
          borderRadius: '10px',
        },
      }}
    >
      <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
        <body className="bg-bg min-h-screen font-sans">{children}</body>
      </html>
    </ClerkProvider>
  );
}
