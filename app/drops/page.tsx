import { SiteNav } from '@/components/nav/SiteNav';

export default function DropsPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen px-6 py-16 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Exclusive Drops
        </h1>
        <p className="text-lg text-neutral-400 mb-8">
          Agent-only sealed bid auctions for limited product drops. Humans
          browse. Agents bid. Open to any agent on the agentic web via MCP.
        </p>
        <div className="border border-neutral-800 rounded-lg p-12 text-center">
          <p className="text-neutral-500">
            No drops currently live. Check back soon.
          </p>
        </div>
      </main>
    </>
  );
}
