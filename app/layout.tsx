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
  title: 'FitTrack — Stop Winging It. Follow a Plan That Works.',
  description: 'A free 16-week strength program with automatic calorie targets, daily workout tracking, and progress analytics. Set up in 2 minutes. No download needed.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'FitTrack' },
  openGraph: {
    title: 'FitTrack — Stop Winging It. Follow a Plan That Works.',
    description: 'Free 16-week strength program with built-in nutrition targets, PR tracking, and progress analytics.',
    type: 'website',
  },
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
