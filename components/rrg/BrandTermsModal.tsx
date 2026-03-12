'use client';

import { useState } from 'react';
import { BRAND_TC_TEXT, BRAND_TC_VERSION } from '@/lib/rrg/terms';

interface BrandTermsModalProps {
  open: boolean;
  onAccept: () => void;
  onClose: () => void;
  saving: boolean;
}

export default function BrandTermsModal({ open, onAccept, onClose, saving }: BrandTermsModalProps) {
  const [checked, setChecked] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#111] border border-white/20 w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-medium">Brand Partner Terms & Conditions</h2>
          <p className="text-xs font-mono text-white/40 mt-1">Version {BRAND_TC_VERSION}</p>
        </div>

        {/* Scrollable T&C text */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="text-sm text-white/60 leading-relaxed whitespace-pre-line">
            {BRAND_TC_TEXT}
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
            <span className="text-sm text-white/80">
              I have read and accept the RRG Brand Partner Terms & Conditions (v{BRAND_TC_VERSION}).
            </span>
          </label>

          <div className="flex items-center gap-3">
            <button
              onClick={onAccept}
              disabled={!checked || saving}
              className="px-6 py-2.5 bg-white text-black text-sm font-medium
                         hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {saving ? 'Recording acceptance...' : 'Accept Terms'}
            </button>
            <button
              onClick={onClose}
              className="text-sm text-white/30 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
