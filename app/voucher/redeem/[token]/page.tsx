'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface VoucherData {
  code: string;
  status: string;
  offer: string | null;
  terms: string | null;
  brand_url: string | null;
  expires_at: string;
  redeemed_at: string | null;
  brand: { name: string; slug: string } | null;
  template: {
    title: string;
    description: string | null;
    voucher_type: string;
    voucher_value: Record<string, unknown> | null;
  } | null;
}

export default function VoucherRedeemPage() {
  const params = useParams();
  const token = params.token as string;

  const [voucher, setVoucher] = useState<VoucherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemed, setRedeemed] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/voucher/lookup?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setVoucher(data.voucher);
      })
      .catch(() => setError('Failed to load voucher'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleRedeem() {
    if (!voucher) return;
    setRedeeming(true);
    try {
      const res = await fetch('/api/voucher/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: voucher.code, redeemed_by: 'web-holder' }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setRedeemed(true);
        setVoucher(prev => prev ? { ...prev, status: 'redeemed' } : null);
      }
    } catch {
      setError('Redemption failed. Please try again.');
    } finally {
      setRedeeming(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-gray-400">Loading voucher...</p>
      </div>
    );
  }

  if (error && !voucher) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Voucher Not Found</h1>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!voucher) return null;

  const isExpired = voucher.status === 'expired';
  const isRedeemed = voucher.status === 'redeemed' || redeemed;
  const isActive = voucher.status === 'active' && !redeemed;
  const expiryDate = new Date(voucher.expires_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Brand header */}
        {voucher.brand && (
          <p className="text-sm text-gray-500 mb-1 uppercase tracking-wider">
            {voucher.brand.name}
          </p>
        )}

        {/* Card */}
        <div className={`border rounded-lg p-6 ${
          isActive ? 'border-emerald-600 bg-emerald-950/20' :
          isRedeemed ? 'border-gray-600 bg-gray-900/50' :
          'border-red-800 bg-red-950/20'
        }`}>
          {/* Status badge */}
          <div className="flex items-center justify-between mb-4">
            <span className={`text-xs px-2 py-1 rounded uppercase font-bold ${
              isActive ? 'bg-emerald-800 text-emerald-200' :
              isRedeemed ? 'bg-gray-700 text-gray-300' :
              'bg-red-900 text-red-300'
            }`}>
              {isActive ? 'Active' : isRedeemed ? 'Redeemed' : 'Expired'}
            </span>
            <span className="text-xs text-gray-500 font-mono">{voucher.code}</span>
          </div>

          {/* Offer */}
          <h1 className="text-2xl font-bold mb-2">
            {voucher.offer || voucher.template?.title || 'Voucher'}
          </h1>

          {voucher.template?.description && (
            <p className="text-gray-400 text-sm mb-4">{voucher.template.description}</p>
          )}

          {/* Terms */}
          {voucher.terms && (
            <div className="text-xs text-gray-500 border-t border-gray-800 pt-3 mb-4">
              <p className="font-semibold text-gray-400 mb-1">Terms</p>
              <p>{voucher.terms}</p>
            </div>
          )}

          {/* Expiry */}
          <p className="text-xs text-gray-500 mb-4">
            {isExpired ? 'Expired' : `Expires ${expiryDate}`}
          </p>

          {/* Actions */}
          {isActive && (
            <div className="space-y-3">
              {voucher.brand_url && (
                <a
                  href={voucher.brand_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-emerald-700 hover:bg-emerald-600 text-white text-center py-3 rounded font-bold transition"
                >
                  Redeem at {voucher.brand?.name || 'Brand'}
                </a>
              )}
              <button
                onClick={handleRedeem}
                disabled={redeeming}
                className="block w-full bg-white text-black text-center py-3 rounded font-bold hover:bg-gray-200 transition disabled:opacity-50"
              >
                {redeeming ? 'Redeeming...' : 'Mark as Redeemed'}
              </button>
            </div>
          )}

          {isRedeemed && (
            <div className="text-center py-3">
              <p className="text-gray-400 text-sm">
                This voucher has been redeemed.
              </p>
              {voucher.brand_url && (
                <a
                  href={voucher.brand_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-500 hover:text-emerald-400 text-sm underline mt-2 inline-block"
                >
                  Visit {voucher.brand?.name || 'brand'}
                </a>
              )}
            </div>
          )}

          {isExpired && (
            <p className="text-center text-red-400 text-sm py-3">
              This voucher has expired and can no longer be redeemed.
            </p>
          )}

          {error && (
            <p className="text-red-400 text-xs mt-3">{error}</p>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-600 mt-4">
          Powered by <a href="https://realrealgenuine.com/rrg" className="text-gray-500 hover:text-white">Real Real Genuine</a>
        </p>
      </div>
    </div>
  );
}
