'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface BrandCard {
  slug: string;
  name: string;
  headline: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  productCount?: number;
}

export default function BrandDirectory({
  brands,
}: {
  brands: BrandCard[];
  selected?: string;
}) {
  const router = useRouter();

  const handleClick = (slug: string) => {
    router.push(`/brand/${slug}`);
  };

  return (
    <div>
      {/* Desktop: 2-column grid, scrollable when many brands */}
      <div className="hidden sm:grid grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1">
        {brands.map((b) => (
          <button
            key={b.slug}
            onClick={() => handleClick(b.slug)}
            className="block border border-white/10 rounded-lg overflow-hidden hover:border-green-500/40 transition-all cursor-pointer text-left"
          >
            {/* Banner image */}
            <div className="relative w-full h-32 bg-white/5">
              {b.bannerUrl ? (
                <Image
                  src={b.bannerUrl}
                  alt={b.name}
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : b.logoUrl ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Image
                    src={b.logoUrl}
                    alt={b.name}
                    width={64}
                    height={64}
                    className="object-contain opacity-60"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-2xl font-mono text-white/20 uppercase">
                    {b.name.slice(0, 2)}
                  </span>
                </div>
              )}
            </div>

            {/* Info row */}
            <div className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold truncate">{b.name}</h3>
                {b.headline && (
                  <p className="text-xs text-white/50 truncate mt-0.5">{b.headline}</p>
                )}
              </div>
              {(b.productCount ?? 0) > 0 && (
                <span className="text-xs font-mono text-white/40 shrink-0 mt-0.5">
                  {b.productCount} {b.productCount === 1 ? 'item' : 'items'}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Mobile: 1-column */}
      <div className="sm:hidden space-y-3">
        {brands.map((b) => (
          <button
            key={b.slug}
            onClick={() => handleClick(b.slug)}
            className="block w-full border border-white/10 rounded-lg overflow-hidden hover:border-green-500/40 transition-all cursor-pointer text-left"
          >
            <div className="relative w-full h-24 bg-white/5">
              {b.bannerUrl ? (
                <Image
                  src={b.bannerUrl}
                  alt={b.name}
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : b.logoUrl ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Image
                    src={b.logoUrl}
                    alt={b.name}
                    width={48}
                    height={48}
                    className="object-contain opacity-60"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-xl font-mono text-white/20 uppercase">
                    {b.name.slice(0, 2)}
                  </span>
                </div>
              )}
            </div>
            <div className="px-3 py-2 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold truncate">{b.name}</h3>
                {b.headline && (
                  <p className="text-xs text-white/50 truncate mt-0.5">{b.headline}</p>
                )}
              </div>
              {(b.productCount ?? 0) > 0 && (
                <span className="text-xs font-mono text-white/40 shrink-0">
                  {b.productCount}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
