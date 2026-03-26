'use client';

import { useState } from 'react';
import { CREATOR_TC_TEXT, CREATOR_TC_VERSION, DFW_CREATOR_TC_TEXT, DFW_CREATOR_TC_VERSION } from '@/lib/rrg/terms';

interface CreatorTermsModalProps {
  open: boolean;
  onAccept: () => void;
  onClose: () => void;
  variant?: 'standard' | 'dfw';
}

export default function CreatorTermsModal({ open, onAccept, onClose, variant = 'standard' }: CreatorTermsModalProps) {
  const [checked, setChecked] = useState(false);

  if (!open) return null;

  const isDfw = variant === 'dfw';
  const tcText = isDfw ? DFW_CREATOR_TC_TEXT : CREATOR_TC_TEXT;
  const tcVersion = isDfw ? DFW_CREATOR_TC_VERSION : CREATOR_TC_VERSION;
  const title = isDfw ? 'DFW Taipei Challenge — Creator Terms' : 'Creator Terms & Conditions';
  const acceptLabel = isDfw
    ? `I have read and accept the DFW Taipei Challenge Creator Terms (v${tcVersion}).`
    : `I have read and accept the RRG Creator Terms & Conditions (v${tcVersion}).`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#111] border border-white/20 w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-xl font-medium">{title}</h2>
          <p className="text-sm font-mono text-white/50 mt-1">
            Version {isDfw ? `DFW-${tcVersion}` : tcVersion}
          </p>
        </div>

        {/* Scrollable T&C text */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="text-base text-white/70 leading-relaxed whitespace-pre-line">
            {tcText}
          </div>
        </div>

        {/* Acceptance area */}
        <div className="px-6 py-4 border-t border-white/10 shrink-0 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="accent-white mt-1 shrink-0"
            />
            <span className="text-base text-white/80">
              {acceptLabel}
            </span>
          </label>

          <div className="flex items-center gap-3">
            <button
              onClick={onAccept}
              disabled={!checked}
              className="px-6 py-2.5 bg-white text-black text-base font-medium
                         hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Accept Terms
            </button>
            <button
              onClick={onClose}
              className="text-base text-white/50 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
