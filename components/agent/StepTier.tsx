'use client';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { WizardState } from './CreateAgentWizard';

interface Props {
  state: WizardState;
  update: (partial: Partial<WizardState>) => void;
  onNext: () => void;
}

export function StepTier({ state, update, onNext }: Props) {
  const isPro = state.tier === 'pro';

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Choose your agent tier</h2>
      <p className="text-white/50 mb-6">
        Basic is free and follows your rules exactly. Pro uses AI to evaluate
        drops with judgment and recommends opportunities. Credit is needed to chat with your agent.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {/* Basic */}
        <div>
          <Card
            className={`cursor-pointer transition-colors ${
              !isPro ? 'border-green-500' : 'hover:border-neutral-600'
            }`}
            onClick={() => update({ tier: 'basic' })}
          >
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-base font-semibold">Basic</h3>
              <Badge>Free</Badge>
            </div>
            <ul className="text-sm text-white/50 space-y-1.5">
              <li>Rules-based evaluation</li>
              <li>Automatic bidding when rules match</li>
              <li>Dashboard + email notifications</li>
              <li>ERC-8004 on-chain identity</li>
            </ul>
          </Card>
          {!isPro && (
            <div className="flex justify-center mt-4">
              <button
                onClick={onNext}
                className="bg-green-500 text-black rounded-lg px-6 py-2.5 font-medium text-sm hover:bg-green-400 transition-colors cursor-pointer"
              >
                Continue with Basic
              </button>
            </div>
          )}
        </div>

        {/* Pro */}
        <div>
          <Card
            className={`cursor-pointer transition-colors ${
              isPro ? 'border-purple-500' : 'hover:border-neutral-600'
            }`}
            onClick={() => update({ tier: 'pro' })}
          >
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-base font-semibold">Pro</h3>
              <Badge variant="pro">Credit-based</Badge>
            </div>
            <ul className="text-sm text-white/50 space-y-1.5">
              <li>LLM-powered evaluation with reasoning</li>
              <li>Recommendations with explanations</li>
              <li>Cross-drop budget optimisation</li>
              <li>Claude, OpenAI, Gemini, DeepSeek or Qwen</li>
              <li>Falls back to Basic when credits run out</li>
              <li>Credit is needed to chat with your agent</li>
            </ul>
          </Card>
          {isPro && (
            <div className="flex justify-center mt-4">
              <button
                onClick={onNext}
                className="bg-purple-500 text-white rounded-lg px-6 py-2.5 font-medium text-sm hover:bg-purple-400 transition-colors cursor-pointer"
              >
                Continue with Pro
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
