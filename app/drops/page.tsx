import Link from 'next/link';
import RRGHeader from '@/components/rrg/RRGHeader';
import RRGFooter from '@/components/rrg/RRGFooter';

export default function DropsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <RRGHeader active="drops" />
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
      <RRGFooter />
    </div>
  );
}
