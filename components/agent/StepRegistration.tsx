'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { WizardState } from './CreateAgentWizard';

interface Props {
  state: WizardState;
  update: (partial: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepRegistration({ state, update, onNext, onBack }: Props) {
  const [walletMode, setWalletMode] = useState<'new' | 'import'>('new');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!state.email || !state.email.includes('@'))
      errs.email = 'Valid email required';
    if (!state.name.trim()) errs.name = 'Agent name required';

    if (walletMode === 'import' && !state.wallet_address.trim()) {
      errs.wallet = 'Wallet address required for import';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    update({
      wallet_type: walletMode === 'new' ? 'embedded' : 'imported',
    });
    onNext();
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Register your agent</h2>
      <p className="text-neutral-400 mb-6">
        Give your agent a name and choose how to set up its wallet.
      </p>

      <div className="space-y-4 mb-8">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={state.email}
          onChange={(e) => update({ email: e.target.value })}
          error={errors.email}
        />

        <Input
          label="Agent name"
          placeholder="e.g. StyleHunter, DropScout"
          value={state.name}
          onChange={(e) => update({ name: e.target.value })}
          error={errors.name}
        />

        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Wallet setup
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setWalletMode('new')}
              className={`flex-1 px-4 py-3 rounded-lg border text-sm text-left transition-colors cursor-pointer ${
                walletMode === 'new'
                  ? 'border-white bg-neutral-900'
                  : 'border-neutral-700 hover:border-neutral-500'
              }`}
            >
              <div className="font-medium mb-1">Create new wallet</div>
              <div className="text-xs text-neutral-500">
                Thirdweb embedded wallet. No seed phrase needed.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setWalletMode('import')}
              className={`flex-1 px-4 py-3 rounded-lg border text-sm text-left transition-colors cursor-pointer ${
                walletMode === 'import'
                  ? 'border-white bg-neutral-900'
                  : 'border-neutral-700 hover:border-neutral-500'
              }`}
            >
              <div className="font-medium mb-1">Import existing</div>
              <div className="text-xs text-neutral-500">
                Connect your wallet and prove ownership.
              </div>
            </button>
          </div>
        </div>

        {walletMode === 'import' && (
          <Input
            label="Wallet address"
            placeholder="0x..."
            value={state.wallet_address}
            onChange={(e) => update({ wallet_address: e.target.value })}
            error={errors.wallet}
          />
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleNext}>Continue</Button>
      </div>
    </div>
  );
}
