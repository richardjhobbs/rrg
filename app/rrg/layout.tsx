import Link from 'next/link';
import type { Metadata } from 'next';
import LoginButton from '@/components/rrg/LoginButton';

export const metadata: Metadata = {
  title: 'RRG — Real Real Genuine',
  description: 'Submit designs. Earn USDC. Own on-chain.',
};

export default function RRGLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4 flex justify-between items-center">
        <Link
          href="/rrg"
          className="text-sm font-mono tracking-[0.3em] hover:opacity-70 transition-opacity"
        >
          REAL REAL GENUINE
        </Link>
        <nav className="flex gap-6 items-center text-sm text-white/60">
          <Link href="/rrg" className="hover:text-white transition-colors">
            Gallery
          </Link>
          <Link href="/rrg/submit" className="hover:text-white transition-colors">
            Submit
          </Link>
          <LoginButton />
        </nav>
      </header>
      <main>{children}</main>
      <footer className="border-t border-white/10 px-6 py-8 mt-24 text-xs text-white/20 font-mono flex justify-between">
        <span>RRG — Real Real Genuine</span>
        <span>Powered by Base · realrealgenuine.com</span>
      </footer>
    </div>
  );
}
