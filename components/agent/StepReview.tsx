'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { WizardState } from './CreateAgentWizard';

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

  const handleCreate = async () => {
    setLoading(true);
    setError(null);

    try {
      const endpoint =
        state.wallet_type === 'imported'
          ? '/api/agent/import'
          : '/api/agent/create';

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
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create agent');
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
        <h2 className="text-2xl font-bold mb-2">Agent created</h2>
        <p className="text-neutral-400 mb-6">
          Your agent <strong>{state.name}</strong> is live and ready to evaluate
          drops.
        </p>
        <Button onClick={() => router.push('/agents/dashboard')}>
          Go to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Review and create</h2>
      <p className="text-neutral-400 mb-6">
        Confirm your agent configuration.
      </p>

      <Card className="mb-6">
        <div className="space-y-3 text-sm">
          <Row label="Tier">
            <Badge variant={state.tier === 'pro' ? 'pro' : 'default'}>
              {state.tier}
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
          <Row label="Aggression">{state.bid_aggression}</Row>
          {state.tier === 'pro' && (
            <Row label="LLM provider">{state.llm_provider}</Row>
          )}
        </div>
      </Card>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <Button onClick={handleCreate} loading={loading}>
          Create agent
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
