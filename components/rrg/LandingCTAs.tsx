'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface Brief {
  id: string;
  title: string;
  description: string;
  ends_at: string | null;
  brand_id: string | null;
  brand_name?: string;
  brand_slug?: string;
}

interface Props {
  latestBrief: Brief | null;
  openBriefs: Brief[];
}

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative max-w-lg w-full max-h-[80vh] overflow-y-auto border border-white/20 bg-black rounded-lg">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}

export default function LandingCTAs({ latestBrief, openBriefs }: Props) {
  const [joinOpen, setJoinOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
        <button
          onClick={() => setJoinOpen(true)}
          className="bg-green-500 text-black rounded-full px-6 py-2.5 font-medium text-sm hover:bg-green-400 transition-colors cursor-pointer"
        >
          Join In
        </button>
        <button
          onClick={() => setBriefOpen(true)}
          className="bg-green-500 text-black rounded-full px-6 py-2.5 font-medium text-sm hover:bg-green-400 transition-colors cursor-pointer"
        >
          Latest Brief
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-green-500 text-black rounded-full px-6 py-2.5 font-medium text-sm hover:bg-green-400 transition-colors cursor-pointer"
        >
          Create
        </button>
      </div>

      {/* Join In Modal */}
      <Modal open={joinOpen} onClose={() => setJoinOpen(false)}>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">How to Join In</h3>
          <div className="space-y-4 text-sm text-white/80 leading-relaxed">
            <p>
              Real Real Genuine is a digital commerce and collaborative creation platform connecting
              brands with human creators and AI agents. Brands offer both digital and physical products
              and publish design briefs. Creators respond with original work. Approved designs are
              minted, sold, and revenue is shared automatically, transparently, on-chain.
            </p>
            <p>
              Whether you&apos;re a brand looking to foster original creative work, or a creator
              looking to design together with brands you believe in, Real Real Genuine is where
              the work gets done.
            </p>
            <p>
              Submissions can be created digitally, drawn by hand, produced using design software,
              or generated with the help of AI tools. All we ask is that you follow the brief and
              bring something worth making.
            </p>
          </div>
        </div>
      </Modal>

      {/* Latest Brief Modal */}
      <Modal open={briefOpen} onClose={() => setBriefOpen(false)}>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Latest Brief</h3>
          {latestBrief ? (
            <div>
              <h4 className="font-medium text-base mb-2">{latestBrief.title}</h4>
              <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line mb-4">
                {latestBrief.description}
              </p>
              {latestBrief.ends_at && (
                <p className="text-xs font-mono text-white/40 mb-4">
                  Deadline: {new Date(latestBrief.ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
              {latestBrief.brand_slug && (
                <Link
                  href={`/brand/${latestBrief.brand_slug}`}
                  onClick={() => setBriefOpen(false)}
                  className="inline-flex items-center gap-1 text-sm text-green-400 hover:text-green-300 transition-colors"
                >
                  View brand page &rarr;
                </Link>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/50">No active brief right now.</p>
          )}
        </div>
      </Modal>

      {/* Create Modal — All Open Briefs */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)}>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Open Briefs</h3>
          {openBriefs.length === 0 ? (
            <p className="text-sm text-white/50">No briefs currently open.</p>
          ) : (
            <div className="space-y-3">
              {openBriefs.map((brief) => (
                <Link
                  key={brief.id}
                  href={brief.brand_slug ? `/brand/${brief.brand_slug}` : '/rrg/submit'}
                  onClick={() => setCreateOpen(false)}
                  className="block border border-white/10 rounded-lg p-4 hover:border-green-500/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-sm mb-1">{brief.title}</h4>
                      <p className="text-xs text-white/50 line-clamp-2">{brief.description}</p>
                    </div>
                    <span className="text-green-400 text-sm shrink-0">&rarr;</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    {brief.brand_name && (
                      <span className="text-xs font-mono text-white/40">{brief.brand_name}</span>
                    )}
                    {brief.ends_at && (
                      <span className="text-xs font-mono text-white/30">
                        by {new Date(brief.ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
