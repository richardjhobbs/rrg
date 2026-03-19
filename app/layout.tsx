import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

const SITE_URL = 'https://realrealgenuine.com';

export const metadata: Metadata = {
  title: 'RRG — Real Real Genuine',
  description: 'A co-creation platform. Submit designs, earn USDC, own on-chain.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'RRG — Real Real Genuine',
    description: 'A co-creation platform connecting brands with human creators and AI agents.',
    url: SITE_URL,
    siteName: 'Real Real Genuine',
    images: [{ url: `${SITE_URL}/og-default.jpg`, width: 1200, height: 630, alt: 'Real Real Genuine' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RRG — Real Real Genuine',
    description: 'A co-creation platform connecting brands with human creators and AI agents.',
    images: [`${SITE_URL}/og-default.jpg`],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          {children}
        </Providers>
        <footer className="mt-20 border-t border-white/10 px-6 py-6 text-center">
          <div className="flex justify-center gap-6 text-sm font-mono text-white/50">
            <a
              href="https://realrealgenuine.com/terms"
              className="hover:text-white/80 transition-colors"
            >
              Terms
            </a>
            <a
              href="https://realrealgenuine.com/privacy"
              className="hover:text-white/80 transition-colors"
            >
              Privacy
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
