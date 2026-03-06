import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'RRG — Real Real Genuine',
  description: 'A co-creation platform. Submit designs, earn USDC, own on-chain.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          {children}
        </Providers>
        <footer className="mt-20 border-t border-white/10 px-6 py-6 text-center">
          <div className="flex justify-center gap-6 text-xs font-mono text-white/30">
            <a
              href="https://richard-hobbs.com/terms"
              className="hover:text-white/60 transition-colors"
            >
              Terms
            </a>
            <a
              href="https://richard-hobbs.com/privacy"
              className="hover:text-white/60 transition-colors"
            >
              Privacy
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
