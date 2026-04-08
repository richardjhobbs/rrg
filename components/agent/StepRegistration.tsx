'use client';

import { useState, useEffect } from 'react';
import { ConnectEmbed, useActiveAccount, useProfiles } from 'thirdweb/react';
import { base } from 'thirdweb/chains';
import { inAppWallet, createWallet } from 'thirdweb/wallets';
import { thirdwebClient } from '@/lib/rrg/thirdwebClient';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { WizardState } from './CreateAgentWizard';

interface Props {
  state: WizardState;
  update: (partial: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

const wallets = [
  inAppWallet({ auth: { options: ['google', 'email'] } }),
  createWallet('io.metamask'),
  createWallet('com.coinbase.wallet'),
  createWallet('walletConnect'),
];

function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

export function StepRegistration({ state, update, onNext, onBack }: Props) {
  const [walletMode, setWalletMode] = useState<'new' | 'import'>('new');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [existingCreator, setExistingCreator] = useState<boolean>(false);
  const account = useActiveAccount();
  const { data: profiles } = useProfiles({ client: thirdwebClient });

  // Auto-detect existing Thirdweb session on mount (creator may already be logged in)
  useEffect(() => {
    if (account?.address) {
      update({ wallet_address: account.address, wallet_type: 'embedded' });

      // Try to get email from OAuth profiles
      if (profiles) {
        for (const p of profiles) {
          const details = (p as Record<string, unknown>).details as Record<string, string> | undefined;
          if (details?.email && !state.email) {
            update({ email: details.email });
            break;
          }
        }
      }

      // Check if this wallet is already a creator
      fetch(`/api/rrg/creator-check?wallet=${account.address}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.exists) setExistingCreator(true); })
        .catch(() => {});
    }
  }, [account?.address, profiles, state.email, update]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!state.email || !state.email.includes('@'))
      errs.email = 'Valid email required';
    if (!state.name.trim()) errs.name = 'Agent name required';

    if (walletMode === 'new' && !state.wallet_address) {
      errs.wallet = 'Connect a wallet to continue';
    }
    if (walletMode === 'import' && !isValidAddress(state.wallet_address)) {
      errs.wallet = 'Valid wallet address required (0x...)';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    update({ wallet_type: walletMode === 'new' ? 'embedded' : 'imported' });
    onNext();
  };

  // If wallet already connected (from creator session), show simplified view
  const walletAlreadyConnected = !!account?.address && state.wallet_address;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Register your agent</h2>
      <p className="text-white/60 mb-6">
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

        {/* Wallet section */}
        {walletAlreadyConnected ? (
          // Already connected (from creator login or previous session)
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Wallet</label>
            <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm text-green-400">
                  {existingCreator ? 'Connected (same as your creator wallet)' : 'Wallet connected'}
                </span>
              </div>
              <p className="text-xs font-mono text-white/50 mt-1">
                {state.wallet_address}
              </p>
            </div>
            {existingCreator && (
              <p className="mt-1.5 text-xs text-white/40">
                Your agent will use the same wallet and on-chain identity as your creator account.
              </p>
            )}
          </div>
        ) : (
          // Not connected yet - show wallet setup options
          <>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">Wallet setup</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setWalletMode('new'); update({ wallet_address: '' }); }}
                  className={`flex-1 px-4 py-3 rounded-lg border text-sm text-left transition-colors cursor-pointer ${
                    walletMode === 'new'
                      ? 'border-green-500/60 bg-neutral-900'
                      : 'border-neutral-700 hover:border-neutral-500'
                  }`}
                >
                  <div className="font-medium mb-1">Create new wallet</div>
                  <div className="text-xs text-neutral-500">Sign in with Google or email. No seed phrase.</div>
                </button>
                <button
                  type="button"
                  onClick={() => { setWalletMode('import'); update({ wallet_address: '' }); }}
                  className={`flex-1 px-4 py-3 rounded-lg border text-sm text-left transition-colors cursor-pointer ${
                    walletMode === 'import'
                      ? 'border-green-500/60 bg-neutral-900'
                      : 'border-neutral-700 hover:border-neutral-500'
                  }`}
                >
                  <div className="font-medium mb-1">Import existing</div>
                  <div className="text-xs text-neutral-500">Paste your wallet address.</div>
                </button>
              </div>
            </div>

            {walletMode === 'new' && (
              <div>
                {state.wallet_address ? (
                  <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm text-green-400">Wallet connected</span>
                    </div>
                    <p className="text-xs font-mono text-white/50 mt-1">{state.wallet_address}</p>
                  </div>
                ) : (
                  <div className="rounded-lg overflow-hidden border border-neutral-700">
                    <ConnectEmbed
                      client={thirdwebClient}
                      wallets={wallets}
                      chain={base}
                      theme="dark"
                      showThirdwebBranding={false}
                    />
                  </div>
                )}
                {errors.wallet && <p className="mt-1 text-xs text-red-400">{errors.wallet}</p>}
              </div>
            )}

            {walletMode === 'import' && (
              <Input
                label="Wallet address"
                placeholder="0x..."
                value={state.wallet_address}
                onChange={(e) => update({ wallet_address: e.target.value })}
                error={errors.wallet}
              />
            )}
          </>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button onClick={handleNext}>Continue</Button>
      </div>
    </div>
  );
}
