'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Agent } from '@/lib/agent/types';

const PLATFORM_WALLET = process.env.NEXT_PUBLIC_PLATFORM_WALLET ?? '';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

interface Props {
  agent: Agent;
  onClose: () => void;
  onCredited: (newBalance: number) => void;
}

type Step = 'choose' | 'wallet' | 'verifying' | 'success';

export function TopUpModal({ agent, onClose, onCredited }: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [amount, setAmount] = useState('5');
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [credited, setCredited] = useState<number | null>(null);

  async function verifyTransaction() {
    if (!txHash.trim()) {
      setError('Please enter the transaction hash');
      return;
    }
    setStep('verifying');
    setError(null);

    try {
      const res = await fetch(`/api/agent/${agent.id}/credits/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tx_hash: txHash.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Verification failed');
        setStep('wallet');
        return;
      }

      setCredited(data.credited);
      setStep('success');

      // Update parent after a moment
      setTimeout(() => onCredited(data.new_balance), 1500);
    } catch {
      setError('Connection error. Please try again.');
      setStep('wallet');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-neutral-900 border border-white/10 rounded-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">Top up Concierge Credits</h3>
          <button onClick={onClose} className="text-white/50 hover:text-white cursor-pointer">✕</button>
        </div>

        {/* Current balance */}
        <div className="mb-4">
          <div className="text-white/40 text-xs mb-1">Current balance</div>
          <div className="text-2xl font-light text-green-400">${agent.credit_balance_usdc.toFixed(2)}</div>
        </div>

        {error && (
          <div className="mb-4 p-2 rounded bg-red-900/30 border border-red-800 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Step: Choose method */}
        {step === 'choose' && (
          <div className="space-y-4">
            <div className="text-sm text-white/60 mb-3">
              Concierge Credits power your chat conversations and drop evaluations.
              Charged based on actual token usage.
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-1 mb-4">
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Claude (Anthropic)</span>
                <span className="text-white/70">~$0.006 per message</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/50">DeepSeek</span>
                <span className="text-white/70">~$0.001 per message</span>
              </div>
            </div>

            <button
              onClick={() => setStep('wallet')}
              className="w-full p-4 border border-white/10 rounded-lg hover:border-green-500/30 transition-colors cursor-pointer text-left"
            >
              <div className="text-sm font-medium text-white/90 mb-1">Top up with USDC</div>
              <div className="text-xs text-white/40">
                Send USDC from your wallet on Base to add credits (1 USDC = $1.00 credit)
              </div>
            </button>

            <div className="text-center">
              <div className="text-xs text-white/30 mt-2">Card payments coming soon</div>
            </div>
          </div>
        )}

        {/* Step: Wallet transfer */}
        {step === 'wallet' && (
          <div className="space-y-4">
            <div className="text-sm text-white/60">
              Send USDC on Base to the platform wallet. 1 USDC = $1.00 in Concierge Credits.
            </div>

            <div>
              <div className="text-xs text-white/40 mb-1">Platform wallet (send USDC here)</div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-3 font-mono text-xs text-white/70 break-all select-all">
                {PLATFORM_WALLET}
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs text-white/40 space-y-1">
              <div>Network: <span className="text-white/60">Base</span></div>
              <div>Token: <span className="text-white/60">USDC ({USDC_ADDRESS.slice(0, 8)}...)</span></div>
              <div>Rate: <span className="text-white/60">1 USDC = $1.00 credit</span></div>
            </div>

            <div className="border-t border-white/10 pt-4">
              <div className="text-xs text-white/50 mb-2">
                After sending, paste the transaction hash below to verify and credit your account:
              </div>
              <Input
                label="Transaction hash"
                placeholder="0x..."
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setStep('choose'); setError(null); }}>
                Back
              </Button>
              <Button size="sm" onClick={verifyTransaction} disabled={!txHash.trim()}>
                Verify and credit
              </Button>
            </div>
          </div>
        )}

        {/* Step: Verifying */}
        {step === 'verifying' && (
          <div className="text-center py-8">
            <div className="text-white/50 animate-pulse mb-2">Verifying transaction on Base...</div>
            <div className="text-xs text-white/30">Checking USDC transfer to platform wallet</div>
          </div>
        )}

        {/* Step: Success */}
        {step === 'success' && (
          <div className="text-center py-8">
            <div className="text-3xl mb-3">&#10003;</div>
            <div className="text-green-400 font-medium mb-1">Credits added</div>
            <div className="text-white/60 text-sm">${credited?.toFixed(2)} credited to your Concierge</div>
          </div>
        )}
      </div>
    </div>
  );
}
