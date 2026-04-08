'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import RRGHeader from '@/components/rrg/RRGHeader';
import RRGFooter from '@/components/rrg/RRGFooter';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, TagSelect } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { PersonaCard } from '@/components/agent/PersonaCard';
import { STYLE_TAGS, TIER_DISPLAY } from '@/lib/agent/types';
import type { Agent, ActivityLogEntry, AgentEvaluation } from '@/lib/agent/types';

export default function DashboardPage() {
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [recommendations, setRecommendations] = useState<AgentEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    style_tags: [] as string[],
    free_instructions: '',
    budget_ceiling_usdc: '',
    bid_aggression: 'balanced',
    llm_provider: 'claude',
  });

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    try {
      const res = await fetch('/api/agent/session');
      if (!res.ok) { setLoading(false); return; }
      const { agent: a } = await res.json();
      setAgent(a);

      const balRes = await fetch(`/api/agent/wallet/balance?address=${a.wallet_address}`);
      if (balRes.ok) { const { balance_usdc } = await balRes.json(); setBalance(balance_usdc); }

      const actRes = await fetch(`/api/agent/${a.id}/activity`);
      if (actRes.ok) { const { activity: acts } = await actRes.json(); setActivity(acts); }

      if (a.tier === 'pro') {
        const recRes = await fetch(`/api/agent/${a.id}/recommendations`);
        if (recRes.ok) { const { recommendations: recs } = await recRes.json(); setRecommendations(recs); }
      }
    } catch {} finally { setLoading(false); }
  }

  function startEdit() {
    if (!agent) return;
    setEditForm({
      style_tags: agent.style_tags,
      free_instructions: agent.free_instructions || '',
      budget_ceiling_usdc: agent.budget_ceiling_usdc?.toString() || '',
      bid_aggression: agent.bid_aggression,
      llm_provider: agent.llm_provider,
    });
    setEditing(true);
  }

  async function savePreferences() {
    if (!agent) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/agent/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style_tags: editForm.style_tags,
          free_instructions: editForm.free_instructions || null,
          budget_ceiling_usdc: editForm.budget_ceiling_usdc ? parseFloat(editForm.budget_ceiling_usdc) : null,
          bid_aggression: editForm.bid_aggression,
          llm_provider: editForm.llm_provider,
        }),
      });
      if (res.ok) {
        const { agent: updated } = await res.json();
        setAgent(updated);
        setEditing(false);
      }
    } catch {} finally { setSaving(false); }
  }

  async function savePersona(updates: Partial<Agent>) {
    if (!agent) return;
    const res = await fetch(`/api/agent/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const { agent: updated } = await res.json();
      setAgent(updated);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <RRGHeader active="agent" />
        <main className="px-6 py-12 max-w-4xl mx-auto">
          <p className="text-white/50 animate-pulse">Loading...</p>
        </main>
        <RRGFooter />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-black text-white">
        <RRGHeader active="agent" />
        <main className="px-6 py-12 max-w-4xl mx-auto">
          <h1 className="text-xl font-semibold mb-4">No agent found</h1>
          <p className="text-white/60 mb-6">Get your own Personal Shopper or Concierge.</p>
          <Button onClick={() => router.push('/agents/create')}>Get started</Button>
        </main>
        <RRGFooter />
      </div>
    );
  }

  const tierDisplay = TIER_DISPLAY[agent.tier];

  return (
    <div className="min-h-screen bg-black text-white">
      <RRGHeader active="agent" />
      <main className="px-6 py-12 max-w-4xl mx-auto">
        {/* Agent header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-light flex-shrink-0 bg-white/10 text-white/60">
              {agent.avatar_source !== 'none' && agent.avatar_path ? (
                agent.avatar_source === 'preset' ? (
                  <img
                    src={`/avatars/presets/${agent.avatar_path}.webp`}
                    alt={agent.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <img
                    src={agent.avatar_path}
                    alt={agent.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                )
              ) : (
                agent.name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-light">{agent.name}</h1>
                <Badge variant={agent.tier === 'pro' ? 'pro' : 'default'}>
                  {tierDisplay.label}
                </Badge>
                {agent.erc8004_linked && (
                  <Badge variant="success">ERC-8004</Badge>
                )}
              </div>
              <p className="text-sm text-white/40 font-mono">{agent.wallet_address}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-light text-green-400">
              {balance !== null ? `$${balance.toFixed(2)}` : '...'}
            </div>
            <div className="text-xs text-white/40">USDC balance</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Persona */}
          <PersonaCard agent={agent} onSave={savePersona} />

          {/* Preferences */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Preferences</h2>
              {!editing && (
                <button
                  onClick={startEdit}
                  className="text-xs text-green-400 hover:text-green-300 transition-colors cursor-pointer"
                >
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-3">
                <TagSelect
                  label="Style tags"
                  selected={editForm.style_tags}
                  onChange={(tags) => setEditForm(prev => ({ ...prev, style_tags: tags }))}
                  options={[...STYLE_TAGS]}
                />
                <Textarea
                  label="Instructions"
                  value={editForm.free_instructions}
                  onChange={(e) => setEditForm(prev => ({ ...prev, free_instructions: e.target.value }))}
                />
                <Input
                  label="Budget ceiling (USDC)"
                  type="number"
                  value={editForm.budget_ceiling_usdc}
                  onChange={(e) => setEditForm(prev => ({ ...prev, budget_ceiling_usdc: e.target.value }))}
                />
                <Select
                  label="Aggression"
                  value={editForm.bid_aggression}
                  onChange={(v) => setEditForm(prev => ({ ...prev, bid_aggression: v }))}
                  options={[
                    { value: 'conservative', label: 'Conservative' },
                    { value: 'balanced', label: 'Balanced' },
                    { value: 'aggressive', label: 'Aggressive' },
                  ]}
                />
                {agent.tier === 'pro' && (
                  <Select
                    label="LLM provider"
                    value={editForm.llm_provider}
                    onChange={(v) => setEditForm(prev => ({ ...prev, llm_provider: v }))}
                    options={[
                      { value: 'claude', label: 'Claude (Anthropic)' },
                      { value: 'openai', label: 'GPT-4o (OpenAI)' },
                      { value: 'gemini', label: 'Gemini (Google)' },
                      { value: 'deepseek', label: 'DeepSeek' },
                      { value: 'qwen', label: 'Qwen (Alibaba)' },
                    ]}
                  />
                )}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={savePreferences} loading={saving}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {agent.style_tags.length > 0 && (
                  <div>
                    <div className="text-white/40 mb-1">Style tags</div>
                    <div className="flex flex-wrap gap-1">
                      {agent.style_tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 text-xs border border-green-500/30 text-green-400/80 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {agent.free_instructions && (
                  <div>
                    <div className="text-white/40 mb-1">Instructions</div>
                    <div className="text-white/80">{agent.free_instructions}</div>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-white/40">Budget ceiling</span>
                  <span className="text-green-400">{agent.budget_ceiling_usdc ? `$${agent.budget_ceiling_usdc}` : 'No limit'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Aggression</span>
                  <span>{agent.bid_aggression}</span>
                </div>
                {agent.tier === 'pro' && (
                  <div className="flex justify-between">
                    <span className="text-white/40">LLM</span>
                    <span>{agent.llm_provider}</span>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Credits (Concierge only) */}
          {agent.tier === 'pro' && (
            <Card>
              <h2 className="text-base font-semibold mb-4">Credits</h2>
              <div className="text-3xl font-light text-green-400 mb-1">
                ${agent.credit_balance_usdc.toFixed(4)}
              </div>
              <div className="text-xs text-white/40 mb-4">USDC credit balance</div>
              <p className="text-xs text-white/30 mb-2">Card payments coming soon. Crypto top-up available.</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => alert('Stripe card payments coming soon. For now, send USDC on Base to your agent wallet: ' + agent.wallet_address)}
              >
                Top up credits
              </Button>
            </Card>
          )}

          {/* Recommendations (Concierge only) */}
          {agent.tier === 'pro' && recommendations.length > 0 && (
            <Card className="md:col-span-2">
              <h2 className="text-base font-semibold mb-4">Recommendations</h2>
              <div className="space-y-3">
                {recommendations.map((rec) => (
                  <div key={rec.id} className="flex items-start justify-between p-3 bg-white/5 rounded-lg">
                    <div>
                      <div className="text-sm font-medium mb-1">Drop: {rec.drop_id.slice(0, 8)}...</div>
                      <div className="text-xs text-white/50">{rec.reasoning}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost">Skip</Button>
                      <Button size="sm">Approve</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Activity log */}
          <Card className="md:col-span-2">
            <h2 className="text-base font-semibold mb-4">Activity</h2>
            {activity.length === 0 ? (
              <p className="text-sm text-white/40">
                No activity yet. Your {tierDisplay.label} will start evaluating drops when they go live.
              </p>
            ) : (
              <div className="space-y-2">
                {activity.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between text-sm py-2 border-b border-white/5 last:border-0">
                    <div>
                      <span className="text-white/80">{entry.action.replace(/_/g, ' ')}</span>
                      {entry.tx_hash && (
                        <a href={`https://basescan.org/tx/${entry.tx_hash}`} target="_blank" rel="noopener noreferrer"
                           className="ml-2 text-xs text-green-400 hover:underline">tx</a>
                      )}
                    </div>
                    <span className="text-xs text-white/30">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>
      <RRGFooter />
    </div>
  );
}
