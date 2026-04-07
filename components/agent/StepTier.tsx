'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { WizardState } from './CreateAgentWizard';

interface Props {
  state: WizardState;
  update: (partial: Partial<WizardState>) => void;
  onNext: () => void;
}

export function StepTier({ state, update, onNext }: Props) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Choose your agent tier</h2>
      <p className="text-neutral-400 mb-6">
        Basic is free and follows your rules exactly. Pro uses AI to evaluate
        drops with judgment and recommends opportunities.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Card
          className={`cursor-pointer transition-colors ${
            state.tier === 'basic'
              ? 'border-white'
              : 'hover:border-neutral-600'
          }`}
          onClick={() => update({ tier: 'basic' })}
        >
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-lg font-semibold">Basic</h3>
            <Badge>Free</Badge>
          </div>
          <ul className="text-sm text-neutral-400 space-y-1.5">
            <li>Rules-based evaluation</li>
            <li>Automatic bidding when rules match</li>
            <li>Dashboard + email notifications</li>
            <li>ERC-8004 on-chain identity</li>
          </ul>
        </Card>

        <Card
          className={`cursor-pointer transition-colors ${
            state.tier === 'pro'
              ? 'border-purple-500'
              : 'hover:border-neutral-600'
          }`}
          onClick={() => update({ tier: 'pro' })}
        >
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-lg font-semibold">Pro</h3>
            <Badge variant="pro">Credit-based</Badge>
          </div>
          <ul className="text-sm text-neutral-400 space-y-1.5">
            <li>LLM-powered evaluation with reasoning</li>
            <li>Recommendations with explanations</li>
            <li>Cross-drop budget optimisation</li>
            <li>Choose Claude, OpenAI, or Gemini</li>
            <li>Falls back to Basic when credits run out</li>
          </ul>
        </Card>
      </div>

      <Button onClick={onNext}>
        Continue with {state.tier === 'pro' ? 'Pro' : 'Basic'}
      </Button>
    </div>
  );
}
