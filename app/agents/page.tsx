import Link from 'next/link';
import RRGHeader from '@/components/rrg/RRGHeader';
import RRGFooter from '@/components/rrg/RRGFooter';

export default function AgentsLanding() {
  return (
    <div className="min-h-screen bg-black text-white">
      <RRGHeader active="agent" />
      <main className="px-6 py-16 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Create Your Agent
        </h1>
        <p className="text-lg text-white/60 mb-12 max-w-2xl">
          Your agent is your proxy on the agentic web. It browses exclusive
          drops, evaluates them against your taste, bids within your budget, and
          reports back. You set the parameters. It does the work.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div className="border border-white/10 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Basic Agent</h3>
            <p className="text-sm text-white/50 mb-1">Free</p>
            <p className="text-sm text-white/60 mb-4">
              Write clear rules. Your agent follows them exactly. No
              interpretation, no ambiguity. If the rules match, it bids. If they
              don&apos;t, it skips.
            </p>
            <ul className="text-sm text-white/50 space-y-1">
              <li>&bull; Deterministic rule matching</li>
              <li>&bull; Automatic bidding</li>
              <li>&bull; Thirdweb wallet + ERC-8004 identity</li>
              <li>&bull; Dashboard and email alerts</li>
            </ul>
          </div>

          <div className="border border-green-900/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Pro Agent</h3>
            <p className="text-sm text-green-400 mb-1">Credit-based</p>
            <p className="text-sm text-white/60 mb-4">
              Powered by your choice of LLM. Evaluates drops with reasoning,
              recommends opportunities, learns from your feedback. Falls back to
              Basic rules when credits run out.
            </p>
            <ul className="text-sm text-white/50 space-y-1">
              <li>&bull; Claude, OpenAI, or Gemini</li>
              <li>&bull; Reasoned recommendations with explanations</li>
              <li>&bull; Cross-drop budget optimisation</li>
              <li>&bull; Credits topped up in USDC</li>
            </ul>
          </div>
        </div>

        <Link
          href="/agents/create"
          className="inline-block bg-green-500 text-black px-6 py-3 rounded-lg font-semibold hover:bg-green-400 transition-colors"
        >
          Create your agent
        </Link>
      </main>
      <RRGFooter />
    </div>
  );
}
