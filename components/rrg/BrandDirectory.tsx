'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';

interface BrandCard {
  slug: string;
  name: string;
  headline: string | null;
  logoUrl: string | null;
  productCount?: number;
}

const BRANDS_PER_PAGE = 15; // 16 grid slots minus "All Brands" button

export default function BrandDirectory({
  brands,
  selected,
}: {
  brands: BrandCard[];
  selected: string; // 'all' or brand slug
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dirPage, setDirPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(brands.length / BRANDS_PER_PAGE));
  const pageStart = dirPage * BRANDS_PER_PAGE;
  const pageBrands = brands.slice(pageStart, pageStart + BRANDS_PER_PAGE);

  const handleClick = (slug: string) => {
    if (slug === 'all') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('brand');
      params.delete('page');
      params.delete('brief');
      const qs = params.toString();
      router.push(qs ? `/rrg?${qs}` : '/rrg');
    } else {
      router.push(`/brand/${slug}`);
    }
  };

  const isActive = (slug: string) => slug === selected;

  return (
    <div>
      {/* ── Desktop Grid (hidden on mobile) ─────────────────────────── */}
      <div className="hidden sm:grid grid-cols-4 gap-3">
        {/* All Brands button */}
        <button
          onClick={() => handleClick('all')}
          className={`flex items-center justify-center gap-2 px-4 py-3 border transition-all cursor-pointer ${
            isActive('all')
              ? 'border-white text-white bg-white/5'
              : 'border-white/15 text-white/60 hover:border-white/40 hover:text-white/80'
          }`}
        >
          <span className="text-sm font-mono uppercase tracking-wider">All Brands</span>
        </button>

        {/* Brand cards */}
        {pageBrands.map((b) => (
          <button
            key={b.slug}
            onClick={() => handleClick(b.slug)}
            className={`flex items-center gap-3 px-4 py-3 border transition-all cursor-pointer min-w-0 ${
              isActive(b.slug)
                ? 'border-white text-white bg-white/5'
                : 'border-white/15 text-white/60 hover:border-white/40 hover:text-white/80'
            }`}
          >
            {/* Logo or initials */}
            {b.logoUrl ? (
              <Image
                src={b.logoUrl}
                alt={b.name}
                width={36}
                height={36}
                className="w-9 h-9 object-cover rounded-sm flex-shrink-0"
                unoptimized
              />
            ) : (
              <div className="w-9 h-9 flex items-center justify-center bg-white/10 rounded-sm flex-shrink-0">
                <span className="text-sm font-mono uppercase">
                  {b.name.slice(0, 2)}
                </span>
              </div>
            )}

            {/* Name + headline */}
            <div className="text-left min-w-0 flex-1">
              <div className="text-sm font-mono uppercase tracking-wider truncate">
                {b.name}
              </div>
              {b.headline && (
                <div className="text-xs text-white/40 truncate leading-tight">
                  {b.headline}
                </div>
              )}
            </div>

            {/* Product count badge */}
            {(b.productCount ?? 0) > 0 && (
              <span className="text-xs font-mono text-white/30 flex-shrink-0">
                {b.productCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Desktop Pagination ─────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="hidden sm:flex items-center justify-center gap-4 mt-3">
          <button
            onClick={() => setDirPage((p) => Math.max(0, p - 1))}
            disabled={dirPage === 0}
            className="text-sm font-mono text-white/50 hover:text-white disabled:text-white/20 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm font-mono text-white/40">
            {dirPage + 1} / {totalPages}
          </span>
          <button
            onClick={() => setDirPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={dirPage >= totalPages - 1}
            className="text-sm font-mono text-white/50 hover:text-white disabled:text-white/20 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Mobile Scroll (visible on mobile only) ─────────────────── */}
      <div className="sm:hidden flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {/* All button */}
        <button
          onClick={() => handleClick('all')}
          className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 border transition-all cursor-pointer ${
            isActive('all')
              ? 'border-white text-white bg-white/5'
              : 'border-white/15 text-white/60 hover:border-white/40 hover:text-white/80'
          }`}
        >
          <span className="text-xs font-mono uppercase tracking-wider">All</span>
        </button>

        {/* All brands in scroll (use same ordering) */}
        {brands.map((b) => (
          <button
            key={b.slug}
            onClick={() => handleClick(b.slug)}
            className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 border transition-all cursor-pointer max-w-[200px] ${
              isActive(b.slug)
                ? 'border-white text-white bg-white/5'
                : 'border-white/15 text-white/60 hover:border-white/40 hover:text-white/80'
            }`}
          >
            {b.logoUrl ? (
              <Image
                src={b.logoUrl}
                alt={b.name}
                width={28}
                height={28}
                className="w-7 h-7 object-cover rounded-sm flex-shrink-0"
                unoptimized
              />
            ) : (
              <div className="w-7 h-7 flex items-center justify-center bg-white/10 rounded-sm flex-shrink-0">
                <span className="text-xs font-mono uppercase">
                  {b.name.slice(0, 2)}
                </span>
              </div>
            )}
            <span className="text-xs font-mono uppercase tracking-wider truncate">
              {b.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
