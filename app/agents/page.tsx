import Link from 'next/link';
import { cookies } from 'next/headers';
import { db } from '@/lib/rrg/db';
import RRGHeader from '@/components/rrg/RRGHeader';
import RRGFooter from '@/components/rrg/RRGFooter';

export const dynamic = 'force-dynamic';

export default async function AgentsLanding() {
  // Check if user already has an agent (via session cookie)
  const cookieStore = await cookies();
  const agentId = cookieStore.get('via_agent_session')?.value;
  let existingAgent: { id: string; name: string; tier: string } | null = null;

  if (agentId) {
    const { data } = await db
      .from('agent_agents')
      .select('id, name, tier')
      .eq('id', agentId)
      .single();
    if (data) existingAgent = data;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <RRGHeader active="agent" />
      <main className="px-6 py-16 max-w-4xl mx-auto">
        <h1 className="text-3xl font-light mb-4">
          Create Your Agent
        </h1>
        <p className="text-base text-white/60 mb-12">
          Your agent is your proxy on the agentic web. Meaning it&apos;s your personal
          shopper on Real Real Genuine and other products from VIA Labs. It browses
          exclusive drops, evaluates them against your taste, bids within your budget,
          and reports back. You set the parameters. It does the work.
        </p>

        {/* Existing agent banner */}
        {existingAgent && (
          <div className="mb-10 p-5 border border-green-500/30 bg-green-500/5 rounded-lg flex items-center justify-between">
            <div>
              <p className="text-sm text-green-400 mb-1">Your agent is active</p>
              <p className="text-white font-medium">{existingAgent.name} <span className="text-xs text-white/40 ml-1">({existingAgent.tier})</span></p>
            </div>
            <Link
              href="/agents/dashboard"
              className="bg-green-500 text-black px-5 py-2 rounded-lg font-medium text-sm hover:bg-green-400 transition-colors"
            >
              Dashboard
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div className="border border-white/10 rounded-lg p-6">
            <h3 className="text-base font-semibold mb-2">Basic Agent</h3>
            <p className="text-sm text-green-400 mb-1">Free</p>
            <p className="text-sm text-white/60 mb-4">
              Write clear rules. Your agent follows them exactly. No
              interpretation, no ambiguity. If the rules match, it bids. If they
              don&apos;t, it skips.
            </p>
            <ul className="text-sm text-white/50 space-y-1">
              <li>&bull; Deterministic rule matching</li>
              <li>&bull; Automatic bidding</li>
              <li>&bull; You get a Thirdweb wallet and a trusted (ERC-8004) identity</li>
              <li>&bull; Access to your dashboard and email alerts</li>
            </ul>
          </div>

          <div className="border border-purple-900/50 rounded-lg p-6">
            <h3 className="text-base font-semibold mb-2">Pro Agent</h3>
            <p className="text-sm text-purple-400 mb-1">Credit-based</p>
            <p className="text-sm text-white/60 mb-4">
              Free to set up and powered by your choice of AI provider. Evaluates
              drops with reasoning, recommends opportunities, learns from your
              feedback. Falls back to Basic rules when credits run out.
            </p>
            <ul className="text-sm text-white/50 space-y-1">
              <li>&bull; Claude, OpenAI, Gemini, DeepSeek or Qwen</li>
              <li>&bull; Reasoned recommendations with explanations</li>
              <li>&bull; Cross-drop budget optimisation</li>
              <li>&bull; Credits topped up in USDC</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-center gap-4">
          <Link
            href="/agents/create"
            className="inline-block bg-green-500 text-black px-6 py-3 rounded-lg font-semibold hover:bg-green-400 transition-colors"
          >
            Create your agent
          </Link>
          {existingAgent && (
            <Link
              href="/agents/dashboard"
              className="inline-block border border-green-500/50 text-green-400 px-6 py-3 rounded-lg font-semibold hover:bg-green-500/10 transition-colors"
            >
              Go to Dashboard
            </Link>
          )}
        </div>
      </main>
      <RRGFooter />
    </div>
  );
}
