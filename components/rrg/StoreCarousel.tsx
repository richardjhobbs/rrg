'use client';

import { useRef } from 'react';
import Link from 'next/link';

interface DropItem {
  id: string;
  token_id: number | null;
  title: string;
  price_usdc: string;
  edition_size: number;
  imageUrl: string | null;
  isPhysicalProduct: boolean;
  soldOut: boolean;
}

export default function StoreCarousel({ drops }: { drops: DropItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.offsetWidth * 0.6;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className="mb-10">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-white/60">Store</h2>
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono uppercase tracking-wider text-green-400">New</span>
          <Link
            href="/rrg/all"
            className="text-sm font-mono text-white/60 hover:text-green-400 transition-colors"
          >
            All &rarr;
          </Link>
        </div>
      </div>

      {/* Carousel */}
      <div className="relative group">
        {/* Left arrow */}
        <button
          onClick={() => scroll('left')}
          className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center bg-black/80 border border-white/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:border-green-500/50"
          aria-label="Scroll left"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        {/* Scrollable container */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {drops.map((drop) => (
            <Link
              key={drop.id}
              href={`/rrg/drop/${drop.token_id}`}
              className="group/card flex-shrink-0 w-[220px] snap-start"
            >
              {/* Image */}
              <div className="relative aspect-square bg-white/5 border border-white/10 rounded-lg overflow-hidden mb-2 group-hover/card:border-green-500/30 transition-colors">
                {drop.imageUrl ? (
                  <img
                    src={drop.imageUrl}
                    alt={drop.title}
                    className="w-full h-full object-cover group-hover/card:scale-[1.03] transition-transform duration-700"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30 font-mono text-sm">
                    #{drop.token_id}
                  </div>
                )}
                {drop.isPhysicalProduct && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 bg-lime-500 text-black text-xs font-mono uppercase tracking-wider leading-tight rounded">
                    Physical
                  </span>
                )}
                {drop.soldOut && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 bg-red-600 text-white text-xs font-mono uppercase tracking-wider leading-tight rounded">
                    Sold Out
                  </span>
                )}
              </div>

              {/* Info */}
              <h3 className="text-sm font-medium truncate group-hover/card:opacity-70 transition-opacity">
                {drop.title}
              </h3>
              <div className="flex justify-between text-xs text-white/50 font-mono mt-0.5">
                <span>${parseFloat(drop.price_usdc || '0').toFixed(2)}</span>
                <span>{drop.edition_size} ed.</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => scroll('right')}
          className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center bg-black/80 border border-white/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:border-green-500/50"
          aria-label="Scroll right"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
    </div>
  );
}
