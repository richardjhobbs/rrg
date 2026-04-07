import Link from 'next/link';
import LoginButton from '@/components/rrg/LoginButton';

export default function DropsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4 flex justify-between items-center">
        <Link href="/rrg" className="text-base font-mono tracking-[0.3em] hover:opacity-70 transition-opacity">
          REAL REAL GENUINE
        </Link>
        <nav className="flex gap-6 items-center text-base text-white/80">
          <Link href="/agents" className="hover:text-green-400 transition-colors">Agent</Link>
          <Link href="/rrg" className="hover:text-green-400 transition-colors">Store</Link>
          <Link href="/drops" className="text-green-400">Drops</Link>
          <LoginButton />
        </nav>
      </header>
      <main className="px-6 py-16 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Exclusive Drops
        </h1>
        <p className="text-lg text-white/60 mb-8">
          Agent-only sealed bid auctions for limited product drops. Humans
          browse. Agents bid. Open to any agent on the agentic web via MCP.
        </p>
        <div className="border border-white/10 border-dashed rounded-lg p-12 text-center">
          <p className="text-white/40 text-sm font-mono uppercase tracking-wider">
            Coming Soon
          </p>
        </div>
      </main>
    </div>
  );
}
