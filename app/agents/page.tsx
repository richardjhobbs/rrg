import Link from 'next/link';
import { cookies } from 'next/headers';
import { db } from '@/lib/rrg/db';
import RRGHeader from '@/components/rrg/RRGHeader';
import RRGFooter from '@/components/rrg/RRGFooter';
import { TIER_DISPLAY } from '@/lib/agent/types';
import type { AgentTier } from '@/lib/agent/types';

export const dynamic = 'force-dynamic';

export default async function AgentsLanding() {
  // Check if user already has an agent (via session cookie)
  const cookieStore = await cookies();
  const agentId = cookieStore.get('via_agent_session')?.value;
  let existingAgent: { id: string; name: string; tier: AgentTier } | null = null;

  if (agentId) {
    const { data } = await db
      .from('agent_agents')
      .select('id, name, tier')
      .eq('id', agentId)
      .single();
    if (data) existingAgent = data as { id: string; name: string; tier: AgentTier };
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <RRGHeader active="agent" />
      <main className="px-6 py-16 max-w-4xl mx-auto">
        <h1 className="text-3xl font-light mb-4">
          Your Personal Shopper. Your Concierge.
        </h1>
        <p className="text-base text-white/60 mb-12">
          Start with a Personal Shopper that handles the basics — finding,
          filtering, and surfacing what matches your taste on Real Real Genuine.
          Upgrade to a Concierge that learns your style, negotiates on your
          behalf, and acts with judgement. You set the rules. They do the work.
        </p>

        {/* Existing agent banner */}
        {existingAgent && (
          <div className="mb-10 p-5 border border-green-500/30 bg-green-500/5 rounded-lg flex items-center justify-between">
            <div>
              <p className="text-sm text-green-400 mb-1">Your {TIER_DISPLAY[existingAgent.tier].label} is active</p>
              <p className="text-white font-medium">{existingAgent.name}</p>
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
            <h3 className="text-base font-semibold mb-2">Personal Shopper</h3>
            <p className="text-sm text-green-400 mb-1">Free</p>
            <p className="text-sm text-white/60 mb-4">
              Works on the preferences you set. Finds, filters, and surfaces
              what matches. Handles the browsing so you don&apos;t have to.
              Like having someone on retainer at your favourite store.
            </p>
            <ul className="text-sm text-white/50 space-y-1">
              <li>&bull; Works on your set preferences and criteria</li>
              <li>&bull; Automatic bidding when rules match</li>
              <li>&bull; Thirdweb wallet and trusted ERC-8004 identity</li>
              <li>&bull; Dashboard and email notifications</li>
            </ul>
          </div>

          <div className="border border-purple-900/50 rounded-lg p-6">
            <h3 className="text-base font-semibold mb-2">Concierge</h3>
            <p className="text-sm text-purple-400 mb-1">Credit-based</p>
            <p className="text-sm text-white/60 mb-4">
              Learns your taste, understands nuance, and negotiates on your
              behalf. Powered by your choice of AI provider. The relationship
              deepens over time. Falls back to Personal Shopper when credits run out.
            </p>
            <ul className="text-sm text-white/50 space-y-1">
              <li>&bull; Claude, OpenAI, Gemini, DeepSeek or Qwen</li>
              <li>&bull; Chat with your Concierge directly</li>
              <li>&bull; Reasoned recommendations with explanations</li>
              <li>&bull; Cross-drop budget optimisation</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-center gap-4">
          <Link
            href="/agents/create"
            className="inline-block bg-green-500 text-black px-6 py-3 rounded-lg font-semibold hover:bg-green-400 transition-colors"
          >
            Get started
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
