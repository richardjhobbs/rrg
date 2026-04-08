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
      <h2 className="text-xl font-semibold mb-2">Choose your service</h2>
      <p className="text-white/50 mb-6">
        Start with a Personal Shopper that handles the basics for free.
        Upgrade to a Concierge that learns your taste, negotiates, and acts with judgement.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {/* Personal Shopper */}
        <div>
          <Card
            className={`cursor-pointer transition-colors ${
              !isPro ? 'border-green-500' : 'hover:border-neutral-600'
            }`}
            onClick={() => update({ tier: 'basic' })}
          >
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-base font-semibold">Personal Shopper</h3>
              <Badge>Free</Badge>
            </div>
            <ul className="text-sm text-white/50 space-y-1.5">
              <li>Works on the preferences you set</li>
              <li>Finds, filters, and surfaces what matches</li>
              <li>Handles the browsing so you don&apos;t have to</li>
              <li>Dashboard and email notifications</li>
              <li>ERC-8004 on-chain identity</li>
            </ul>
          </Card>
          {!isPro && (
            <div className="flex justify-center mt-4">
              <button
                onClick={onNext}
                className="bg-green-500 text-black rounded-lg px-6 py-2.5 font-medium text-sm hover:bg-green-400 transition-colors cursor-pointer"
              >
                Continue with Personal Shopper
              </button>
            </div>
          )}
        </div>

        {/* Concierge */}
        <div>
          <Card
            className={`cursor-pointer transition-colors ${
              isPro ? 'border-purple-500' : 'hover:border-neutral-600'
            }`}
            onClick={() => update({ tier: 'pro' })}
          >
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-base font-semibold">Concierge</h3>
              <Badge variant="pro">Credit-based</Badge>
            </div>
            <ul className="text-sm text-white/50 space-y-1.5">
              <li>Learns and adapts to your evolving taste</li>
              <li>Understands nuance and context</li>
              <li>Negotiates on your behalf</li>
              <li>Chat with your Concierge directly</li>
              <li>Powered by Claude or DeepSeek</li>
              <li>Falls back to Personal Shopper when credits run out</li>
            </ul>
          </Card>
          {isPro && (
            <div className="flex justify-center mt-4">
              <button
                onClick={onNext}
                className="bg-purple-500 text-white rounded-lg px-6 py-2.5 font-medium text-sm hover:bg-purple-400 transition-colors cursor-pointer"
              >
                Continue with Concierge
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
