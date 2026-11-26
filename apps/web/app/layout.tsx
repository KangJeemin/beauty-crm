import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '../lib/auth';
import { PwaProvider } from '../lib/pwa';
import './globals.css';

export const metadata: Metadata = {
  title: '미용 고객 관리',
  description: '음성으로 기록하는 시술 이력 관리',
  manifest: '/manifest.webmanifest',
  applicationName: '고객관리',
  appleWebApp: { capable: true, title: '고객관리', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <PwaProvider>
          <AuthProvider>{children}</AuthProvider>
        </PwaProvider>
      </body>
    </html>
  );
}
