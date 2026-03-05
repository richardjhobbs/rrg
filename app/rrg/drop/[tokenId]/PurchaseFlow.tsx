'use client';

import { useState, useEffect } from 'react';
import {
  useAccount,
  useConnect,
  useConnectors,
  useDisconnect,
  useSignTypedData,
  useSwitchChain,
  useChainId,
} from 'wagmi';
import { targetChainId } from '@/lib/rrg/wagmiConfig';

interface Props {
  tokenId:   number;
  priceUsdc: number;
  soldOut:   boolean;
  active:    boolean;
  isTestnet: boolean;
}

type Step = 'idle' | 'connect' | 'email' | 'signing' | 'confirming' | 'success' | 'error';

interface PurchaseResult {
  txHash:      string;
  downloadUrl: string;
}

export default function PurchaseFlow({ tokenId, priceUsdc, soldOut, active, isTestnet }: Props) {
  const { address, isConnected } = useAccount();
  const { connect }              = useConnect();
  const connectors               = useConnectors();
  const { disconnect }           = useDisconnect();
  const { signTypedDataAsync }   = useSignTypedData();
  const { switchChainAsync }     = useSwitchChain();
  const chainId                  = useChainId();

  const [step,    setStep]    = useState<Step>('idle');
  const [email,   setEmail]   = useState('');
  const [error,   setError]   = useState('');
  const [result,  setResult]  = useState<PurchaseResult | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const scanBase = isTestnet
    ? 'https://sepolia.basescan.org'
    : 'https://basescan.org';

  // ── Guards ──────────────────────────────────────────────────────────
  if (!active) {
    return (
      <p className="text-white/40 text-sm font-mono py-4">
        This drop is currently paused.
      </p>
    );
  }
  if (soldOut) {
    return (
      <p className="text-red-400 text-sm font-mono py-4">
        Sold out — no remaining editions.
      </p>
    );
  }

  // ── Success ─────────────────────────────────────────────────────────
  if (step === 'success' && result) {
    return (
      <div className="border border-white/20 bg-white/5 p-6">
        <div className="text-3xl mb-4">✓</div>
        <h3 className="font-medium mb-1">Purchase complete</h3>
        <p className="text-sm text-white/50 mb-6">
          Token #{tokenId} minted on Base. Your files are ready.
        </p>
        <a
          href={result.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center py-3 bg-white text-black text-sm font-medium
                     hover:bg-white/90 transition-all mb-4"
        >
          Download Files →
        </a>
        <a
          href={`${scanBase}/tx/${result.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono text-white/20 hover:text-white/50 transition-colors block text-center"
        >
          {result.txHash.slice(0, 10)}…{result.txHash.slice(-6)} ↗
        </a>
      </div>
    );
  }

  // ── Connect wallet ───────────────────────────────────────────────────
  if (step === 'connect') {
    const handleConnect = (connector: (typeof connectors)[number]) => {
      connect(
        { connector },
        {
          onSuccess: () => setStep('email'),
          onError:   (err) => setError(err.message),
        }
      );
    };
    return (
      <div className="border border-white/20 p-6 space-y-3">
        <p className="text-sm text-white/60 mb-2">Connect a wallet to purchase</p>
        {connectors.map((connector) => (
          <button
            key={connector.id}
            onClick={() => handleConnect(connector)}
            className="w-full py-3 border border-white/30 text-sm hover:border-white
                       transition-all text-left px-4"
          >
            {connector.name}
          </button>
        ))}
        {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
        <button
          onClick={() => { setStep('idle'); setError(''); }}
          className="w-full text-xs text-white/20 hover:text-white/50 transition-colors pt-2"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Email & confirm ─────────────────────────────────────────────────
  if (step === 'email') {
    return (
      <div className="border border-white/20 p-6 space-y-5">
        {/* Wallet indicator */}
        <div className="flex justify-between items-center text-xs font-mono">
          <span className="text-white/40">
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </span>
          <button
            onClick={() => { disconnect(); setStep('idle'); }}
            className="text-white/20 hover:text-white/50 transition-colors"
          >
            Disconnect
          </button>
        </div>

        <div className="border-t border-white/10 pt-4">
          <p className="text-sm text-white/70">
            Purchasing for{' '}
            <span className="text-white font-medium">${priceUsdc.toFixed(2)} USDC</span>
          </p>
          <p className="text-xs text-white/50 mt-1">
            You&apos;ll sign a gasless USDC permit — no ETH needed for gas.
          </p>
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-[0.15em] text-white/30 mb-2">
            Email for file delivery{' '}
            <span className="normal-case tracking-normal text-white/20">(optional)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-transparent border border-white/20 px-4 py-2.5 text-sm
                       focus:border-white outline-none transition-colors placeholder:text-white/20"
          />
          <p className="mt-1.5 text-xs text-white/40">
            Files also accessible via wallet lookup after purchase
          </p>
        </div>

        {error && (
          <p className="text-red-400 text-xs font-mono border border-red-400/20 bg-red-400/5 px-3 py-2">
            {error}
          </p>
        )}

        <button
          onClick={handlePurchase}
          className="w-full py-3.5 bg-white text-black text-sm font-medium
                     hover:bg-white/90 transition-all"
        >
          Sign &amp; Purchase →
        </button>
        <button
          onClick={() => { setStep('idle'); setError(''); }}
          className="w-full text-xs text-white/20 hover:text-white/50 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── In-progress ─────────────────────────────────────────────────────
  if (step === 'signing' || step === 'confirming') {
    return (
      <div className="border border-white/10 p-8 text-center">
        <p className="text-white/60 text-sm font-mono animate-pulse">
          {step === 'signing' ? 'Waiting for signature…' : 'Minting on Base…'}
        </p>
        <p className="text-xs text-white/40 mt-3">
          {step === 'signing'
            ? 'Check your wallet — approve the USDC permit'
            : 'Transaction submitted, awaiting confirmation (10–30s)'}
        </p>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div className="space-y-4">
        <div className="border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-red-400 font-mono">
          {error}
        </div>
        <button
          onClick={() => { setStep('idle'); setError(''); }}
          className="w-full py-3 border border-white/20 text-sm hover:border-white transition-all"
        >
          Try Again
        </button>
        {isConnected && (
          <button
            onClick={() => { disconnect(); setStep('idle'); setError(''); }}
            className="w-full text-xs text-white/20 hover:text-white/50 transition-colors pt-1"
          >
            Disconnect wallet
          </button>
        )}
      </div>
    );
  }

  // ── Idle — main CTA ──────────────────────────────────────────────────
  const walletReady = mounted && isConnected && !!address;
  return (
    <div className="space-y-3">
      <button
        onClick={handleBuy}
        className="w-full py-4 bg-white text-black text-sm font-medium
                   hover:bg-white/90 transition-all tracking-wide"
      >
        {walletReady
          ? `Purchase for $${priceUsdc.toFixed(2)} USDC`
          : 'Connect Wallet to Purchase'}
      </button>
      {walletReady && (
        <p className="text-xs font-mono text-white/40 text-center">
          {address.slice(0, 6)}…{address.slice(-4)}
          <button
            onClick={() => disconnect()}
            className="ml-2 hover:text-white/60 transition-colors"
          >
            (disconnect)
          </button>
        </p>
      )}
      <p className="text-xs text-white/40 text-center">
        Gasless · USDC on Base · files delivered on mint
      </p>
    </div>
  );

  // ── Handlers ─────────────────────────────────────────────────────────
  async function handleBuy() {
    setError('');
    if (!isConnected || !address) {
      setStep('connect');
      return;
    }
    // Ensure correct chain
    if (chainId !== targetChainId) {
      try {
        await switchChainAsync({ chainId: targetChainId });
      } catch {
        setError(`Please switch to ${isTestnet ? 'Base Sepolia' : 'Base'} in your wallet.`);
        return;
      }
    }
    setStep('email');
  }

  async function handlePurchase() {
    if (!address) return;
    setStep('signing');
    setError('');

    try {
      // Always switch — switchChainAsync is a no-op if already on the right chain,
      // and guarantees wagmi's internal state is correct before signTypedDataAsync
      // (avoids stale-closure chainId mismatch in viem v2 strict validation).
      try {
        await switchChainAsync({ chainId: targetChainId });
      } catch {
        throw new Error(
          `Please switch to ${isTestnet ? 'Base Sepolia' : 'Base'} in your wallet.`
        );
      }

      // 1 — Get permit payload from server
      const purchaseRes = await fetch('/api/rrg/purchase', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tokenId, buyerWallet: address }),
      });
      const purchaseData = await purchaseRes.json();
      if (!purchaseRes.ok) throw new Error(purchaseData.error || 'Purchase prep failed');

      const { domain, types, value } = purchaseData.permitPayload;

      // 2 — Sign EIP-2612 permit
      const signature = await signTypedDataAsync({
        domain,
        types,
        primaryType: 'Permit',
        message:     value,
      });

      // 3 — Confirm + mint
      setStep('confirming');
      const confirmRes = await fetch('/api/rrg/confirm', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tokenId,
          buyerWallet: address,
          buyerEmail:  email || null,
          deadline:    value.deadline,
          signature,
        }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.error || 'Mint failed');

      setResult({ txHash: confirmData.txHash, downloadUrl: confirmData.downloadUrl });
      setStep('success');

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      setStep('error');
    }
  }
}
