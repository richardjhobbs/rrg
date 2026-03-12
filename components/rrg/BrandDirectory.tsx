'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';

interface BrandCard {
  slug: string;
  name: string;
  headline: string | null;
  logoUrl: string | null;
}

export default function BrandDirectory({
  brands,
  selected,
}: {
  brands: BrandCard[];
  selected: string; // 'all' or brand slug
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleClick = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (slug === 'all') {
      params.delete('brand');
    } else {
      params.set('brand', slug);
    }
    params.delete('page');
    params.delete('brief');
    const qs = params.toString();
    router.push(qs ? `/rrg?${qs}` : '/rrg');
  };

  const isActive = (slug: string) => slug === selected;

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
      {/* All button */}
      <button
        onClick={() => handleClick('all')}
        className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 border transition-all cursor-pointer ${
          isActive('all')
            ? 'border-white text-white bg-white/5'
            : 'border-white/15 text-white/40 hover:border-white/40 hover:text-white/60'
        }`}
      >
        <span className="text-[11px] font-mono uppercase tracking-wider">All Brands</span>
      </button>

      {/* Brand cards */}
      {brands.map((b) => (
        <button
          key={b.slug}
          onClick={() => handleClick(b.slug)}
          className={`flex-shrink-0 flex items-center gap-3 px-4 py-2 border transition-all cursor-pointer max-w-[280px] ${
            isActive(b.slug)
              ? 'border-white text-white bg-white/5'
              : 'border-white/15 text-white/40 hover:border-white/40 hover:text-white/60'
          }`}
        >
          {/* Logo or initials */}
          {b.logoUrl ? (
            <Image
              src={b.logoUrl}
              alt={b.name}
              width={32}
              height={32}
              className="w-8 h-8 object-cover rounded-sm flex-shrink-0"
              unoptimized
            />
          ) : (
            <div className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-sm flex-shrink-0">
              <span className="text-[11px] font-mono uppercase">
                {b.name.slice(0, 2)}
              </span>
            </div>
          )}

          {/* Name + headline */}
          <div className="text-left min-w-0">
            <div className="text-[11px] font-mono uppercase tracking-wider truncate">
              {b.name}
            </div>
            {b.headline && (
              <div className="text-[10px] text-white/30 truncate leading-tight">
                {b.headline}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
