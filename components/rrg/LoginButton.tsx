'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

export default function LoginButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-white/60 hover:text-white transition-colors"
      >
        Login
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 border border-white/20 bg-black z-50 shadow-xl">
          <Link
            href="/brand/login"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-sm text-white/60 hover:text-white hover:bg-white/5
                       transition-colors border-b border-white/10"
          >
            Brand Partner
            <span className="block text-xs text-white/30 mt-0.5">Manage briefs & products</span>
          </Link>
          <Link
            href="/creator"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-sm text-white/60 hover:text-white hover:bg-white/5
                       transition-colors"
          >
            Creator Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
