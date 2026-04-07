'use client';

import { useEffect, useState } from 'react';
import { SiteNav } from '@/components/nav/SiteNav';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Agent, ActivityLogEntry, AgentEvaluation } from '@/lib/agent/types';

export default function DashboardPage() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [recommendations, setRecommendations] = useState<AgentEvaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // For now, load agent from session (the cookie set at creation)
    // In production this would check auth properly
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      // We need to get the agent ID from somewhere — for now, check URL or session
      // This is a simplified version; production would use proper auth
      const res = await fetch('/api/agent/session');
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const { agent: a } = await res.json();
      setAgent(a);

      // Load balance
      const balRes = await fetch(
        `/api/agent/wallet/balance?address=${a.wallet_address}`
      );
      if (balRes.ok) {
        const { balance_usdc } = await balRes.json();
        setBalance(balance_usdc);
      }

      // Load activity
      const actRes = await fetch(`/api/agent/${a.id}/activity`);
      if (actRes.ok) {
        const { activity: acts } = await actRes.json();
        setActivity(acts);
      }

      // Load recommendations (Pro only)
      if (a.tier === 'pro') {
        const recRes = await fetch(`/api/agent/${a.id}/recommendations`);
        if (recRes.ok) {
          const { recommendations: recs } = await recRes.json();
          setRecommendations(recs);
        }
      }
    } catch {
      // Silent fail for now
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <>
        <SiteNav />
        <main className="min-h-screen px-6 py-12 max-w-4xl mx-auto">
          <p className="text-neutral-500">Loading...</p>
        </main>
      </>
    );
  }

  if (!agent) {
    return (
      <>
        <SiteNav />
        <main className="min-h-screen px-6 py-12 max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">No agent found</h1>
          <p className="text-neutral-400 mb-6">
            Create an agent to access the dashboard.
          </p>
          <Button onClick={() => (window.location.href = '/agents/create')}>
            Create agent
          </Button>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteNav />
      <main className="min-h-screen px-6 py-12 max-w-4xl mx-auto">
        {/* Agent header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{agent.name}</h1>
              <Badge variant={agent.tier === 'pro' ? 'pro' : 'default'}>
                {agent.tier}
              </Badge>
              {agent.erc8004_linked && (
                <Badge variant="success">ERC-8004</Badge>
              )}
            </div>
            <p className="text-sm text-neutral-500 font-mono">
              {agent.wallet_address}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">
              {balance !== null ? `$${balance.toFixed(2)}` : '...'}
            </div>
            <div className="text-xs text-neutral-500">USDC balance</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Preferences */}
          <Card>
            <h2 className="text-lg font-semibold mb-4">Preferences</h2>
            <div className="space-y-3 text-sm">
              {agent.style_tags.length > 0 && (
                <div>
                  <div className="text-neutral-500 mb-1">Style tags</div>
                  <div className="flex flex-wrap gap-1">
                    {agent.style_tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {agent.free_instructions && (
                <div>
                  <div className="text-neutral-500 mb-1">Instructions</div>
                  <div className="text-neutral-300">
                    {agent.free_instructions}
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-neutral-500">Budget ceiling</span>
                <span>
                  {agent.budget_ceiling_usdc
                    ? `$${agent.budget_ceiling_usdc}`
                    : 'No limit'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Aggression</span>
                <span>{agent.bid_aggression}</span>
              </div>
              {agent.tier === 'pro' && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">LLM</span>
                  <span>{agent.llm_provider}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Credits (Pro only) */}
          {agent.tier === 'pro' && (
            <Card>
              <h2 className="text-lg font-semibold mb-4">Credits</h2>
              <div className="text-3xl font-bold mb-1">
                ${agent.credit_balance_usdc.toFixed(4)}
              </div>
              <div className="text-xs text-neutral-500 mb-4">USDC balance</div>
              <Button variant="secondary" size="sm">
                Top up credits
              </Button>
            </Card>
          )}

          {/* Recommendations (Pro only) */}
          {agent.tier === 'pro' && recommendations.length > 0 && (
            <Card className="md:col-span-2">
              <h2 className="text-lg font-semibold mb-4">Recommendations</h2>
              <div className="space-y-3">
                {recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-start justify-between p-3 bg-neutral-900 rounded-lg"
                  >
                    <div>
                      <div className="text-sm font-medium mb-1">
                        Drop: {rec.drop_id.slice(0, 8)}...
                      </div>
                      <div className="text-xs text-neutral-400">
                        {rec.reasoning}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost">
                        Skip
                      </Button>
                      <Button size="sm">Approve</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Activity log */}
          <Card className="md:col-span-2">
            <h2 className="text-lg font-semibold mb-4">Activity</h2>
            {activity.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No activity yet. Your agent will start evaluating drops when they
                go live.
              </p>
            ) : (
              <div className="space-y-2">
                {activity.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between text-sm py-2 border-b border-neutral-900 last:border-0"
                  >
                    <div>
                      <span className="text-neutral-300">{entry.action}</span>
                      {entry.tx_hash && (
                        <a
                          href={`https://basescan.org/tx/${entry.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-xs text-blue-400 hover:underline"
                        >
                          tx
                        </a>
                      )}
                    </div>
                    <span className="text-xs text-neutral-600">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>
    </>
  );
}
