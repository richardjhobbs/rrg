import Link from 'next/link';
import LoginButton from './LoginButton';

export default function RRGHeader({ active }: { active?: 'agent' | 'store' | 'drops' }) {
  return (
    <header className="border-b border-white/10 px-6 py-4 flex justify-between items-center">
      <Link href="/rrg" className="text-base font-mono tracking-[0.3em] hover:opacity-70 transition-opacity">
        REAL REAL GENUINE
      </Link>
      <nav className="flex gap-6 items-center text-base text-white/80">
        <Link href="/agents" className={active === 'agent' ? 'text-green-400' : 'hover:text-green-400 transition-colors'}>
          Agent
        </Link>
        <Link href="/rrg" className={active === 'store' ? 'text-green-400' : 'hover:text-green-400 transition-colors'}>
          Store
        </Link>
        <Link href="/drops" className={active === 'drops' ? 'text-green-400' : 'hover:text-green-400 transition-colors'}>
          Drops
        </Link>
        <LoginButton />
      </nav>
    </header>
  );
}
