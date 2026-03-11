'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { useRouter, useParams } from 'next/navigation';

interface BrandContext {
  brandId: string;
  brandName: string;
  brandSlug: string;
  userEmail: string;
}

const BrandCtx = createContext<BrandContext | null>(null);
export const useBrandContext = () => useContext(BrandCtx);

export default function BrandAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const slug   = params.slug as string;

  const [ctx,     setCtx]     = useState<BrandContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/brand/auth/check')
      .then((r) => r.json())
      .then((d) => {
        if (!d.authenticated) {
          router.push('/brand/login');
          return;
        }
        const match = d.brands?.find(
          (b: { brandSlug: string }) => b.brandSlug === slug
        );
        if (!match) {
          router.push('/brand/login');
          return;
        }
        setCtx({
          brandId:   match.brandId,
          brandName: match.brandName,
          brandSlug: match.brandSlug,
          userEmail: d.user.email,
        });
        setLoading(false);
      })
      .catch(() => router.push('/brand/login'));
  }, [slug, router]);

  const handleLogout = async () => {
    await fetch('/api/brand/auth/logout', { method: 'POST' });
    router.push('/brand/login');
  };

  if (loading || !ctx) {
    return (
      <p className="px-6 py-8 font-mono text-white/30 text-sm">Loading…</p>
    );
  }

  return (
    <BrandCtx.Provider value={ctx}>
      {/* Admin bar */}
      <div className="border-b border-white/10 px-6 py-2 flex justify-between items-center bg-white/[0.03]">
        <span className="text-xs text-white/20 font-mono">Brand Admin</span>
        <div className="flex items-center gap-4">
          <span className="text-xs text-white/30 font-mono">{ctx.userEmail}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-white/30 hover:text-white transition-colors font-mono"
          >
            Logout
          </button>
        </div>
      </div>
      {children}
    </BrandCtx.Provider>
  );
}
