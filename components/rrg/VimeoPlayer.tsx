'use client';

import { useState } from 'react';

interface VimeoPlayerProps {
  videoId: string;
  title?: string;
  aspectRatio?: string; // e.g. "56.25" for 16:9, "100" for 1:1
}

export default function VimeoPlayer({
  videoId,
  title = 'Watch video',
  aspectRatio = '56.25',
}: VimeoPlayerProps) {
  const [playing, setPlaying] = useState(false);

  return (
    <div
      className="relative w-full overflow-hidden bg-black"
      style={{ paddingBottom: `${aspectRatio}%` }}
    >
      {!playing ? (
        /* ── Poster / CTA overlay ─────────────────────────────── */
        <button
          onClick={() => setPlaying(true)}
          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center group cursor-pointer border-0 bg-transparent p-0"
          aria-label={`Play: ${title}`}
        >
          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-black/60 group-hover:bg-black/50 transition-colors duration-300" />

          {/* Play button */}
          <div className="relative z-10 flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-white/10 border border-white/30 flex items-center justify-center group-hover:bg-white/20 group-hover:border-white/60 group-hover:scale-110 transition-all duration-300">
              {/* Triangle play icon */}
              <svg
                className="w-8 h-8 text-white ml-1"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>

            <div className="text-center">
              <p className="text-white font-light text-lg tracking-wide">
                What is Real Real Genuine?
              </p>
              <p className="text-white/50 text-sm mt-1 font-mono uppercase tracking-widest">
                Click to find out
              </p>
            </div>
          </div>
        </button>
      ) : (
        /* ── Vimeo iframe (only loaded on click — no autoplay penalty) ── */
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://player.vimeo.com/video/${videoId}?badge=0&autopause=0&autoplay=1&player_id=0&app_id=58479`}
          frameBorder="0"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          title={title}
        />
      )}
    </div>
  );
}
