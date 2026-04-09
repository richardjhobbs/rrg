'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TIER_DISPLAY } from '@/lib/agent/types';
import type { WizardState } from '@/lib/agent/types';

interface Props {
  state: WizardState;
  onBack: () => void;
  onComplete: (agentId: string) => void;
  agentId: string | null;
}

export function StepReview({ state, onBack, onComplete, agentId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tierDisplay = TIER_DISPLAY[state.tier];

  const handleCreate = async () => {
    setLoading(true);
    setError(null);

    try {
      const endpoint = '/api/agent/create';

      const body: Record<string, unknown> = {
        email: state.email,
        name: state.name,
        tier: state.tier,
        style_tags: state.style_tags,
        free_instructions: state.free_instructions || null,
        budget_ceiling_usdc: state.budget_ceiling_usdc
          ? parseFloat(state.budget_ceiling_usdc)
          : null,
        bid_aggression: state.bid_aggression,
        llm_provider: state.llm_provider,
        wallet_address: state.wallet_address,
        wallet_type: state.wallet_type,
        persona_bio: state.persona_bio || null,
        persona_voice: state.persona_voice || null,
        persona_comm_style: state.persona_comm_style || null,
        interest_categories: state.interest_categories,
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to create ${tierDisplay.label}`);
      }

      const { agent } = await res.json();
      onComplete(agent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (agentId) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">&#10003;</div>
        <h2 className="text-xl font-semibold mb-2">{tierDisplay.label} created</h2>
        <p className="text-neutral-400 mb-6">
          Your {tierDisplay.label} <strong>{state.name}</strong> is ready.
        </p>
        <Button onClick={() => router.push('/agents/dashboard')}>
          Go to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Review and create</h2>
      <p className="text-neutral-400 mb-6">
        Confirm your {tierDisplay.label} configuration.
      </p>

      <Card className="mb-6">
        <div className="space-y-3 text-sm">
          <Row label="Service">
            <Badge variant={state.tier === 'pro' ? 'pro' : 'default'}>
              {tierDisplay.label}
            </Badge>
          </Row>
          <Row label="Name">{state.name}</Row>
          <Row label="Email">{state.email}</Row>
          <Row label="Wallet">
            {state.wallet_type === 'embedded'
              ? 'New embedded wallet (Thirdweb)'
              : `Imported: ${state.wallet_address.slice(0, 8)}...${state.wallet_address.slice(-6)}`}
          </Row>
          {state.style_tags.length > 0 && (
            <Row label="Style tags">{state.style_tags.join(', ')}</Row>
          )}
          {state.free_instructions && (
            <Row label="Instructions">{state.free_instructions}</Row>
          )}
          {state.budget_ceiling_usdc && (
            <Row label="Budget ceiling">${state.budget_ceiling_usdc} USDC</Row>
          )}
          <Row label="Bid style">{state.bid_aggression}</Row>
          {state.tier === 'pro' && (
            <Row label="LLM provider">{state.llm_provider}</Row>
          )}
          {state.persona_bio && (
            <Row label="Persona bio">{state.persona_bio}</Row>
          )}
          {state.persona_voice && (
            <Row label="Voice">{state.persona_voice}</Row>
          )}
          {state.persona_comm_style && (
            <Row label="Communication">{state.persona_comm_style}</Row>
          )}
          {state.interest_categories.length > 0 && (
            <Row label="Interests">
              {state.interest_categories.map(ic => `${ic.category} (${ic.tags.length})`).join(', ')}
            </Row>
          )}
        </div>
      </Card>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-sm text-red-400">
          {error}
          {(error.includes('already registered') || error.includes('already')) && (
            <div className="mt-2">
              <a
                href="/agents/dashboard"
                className="text-green-400 hover:text-green-300 underline transition-colors"
              >
                Go to your dashboard
              </a>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <Button onClick={handleCreate} loading={loading}>
          Create {tierDisplay.label}
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right max-w-[60%]">{children}</span>
    </div>
  );
}
