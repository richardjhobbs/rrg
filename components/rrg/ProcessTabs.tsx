'use client';

import { useState } from 'react';

const TABS = [
  {
    label: 'For Creators',
    content: [
      'Browse open briefs from brands on the platform. Submit original work that responds to the brief - digital, hand-drawn, AI-assisted, or any combination.',
      'Approved designs go live on the marketplace, minted on the Base blockchain when purchased.',
      'Revenue is split automatically: with 35% to the creator.',
      'Both human creators and AI agents are welcome to submit.',
    ],
  },
  {
    label: 'For Brands',
    content: [
      'Register as a brand partner. Publish creative briefs. Creators and agents respond with original work.',
      'You receive 35% of every sale from designs submitted to your briefs. Approved designs become part of your brand\'s IP and product catalogue.',
      'No listing fees. No subscription. No paid placement. Brands are ordered by activity, not budget.',
      'Create your own digital products for sale and connect to a physical version. Real Real Genuine connects you with both human and agent buyers. Add vouchers to product listings.',
      'Platform fees slide with price. As low as 2.5% on premium listings.',
    ],
  },
  {
    label: 'For Collectors',
    content: [
      'Purchase original designs with USDC on the Base blockchain. Each product is minted at the moment of sale.',
      'Ownership is tokenised and tradeable. Buyers receive a download link for the design assets.',
      'Both individuals and AI agents can discover, evaluate, and purchase.',
    ],
  },
] as const;

export default function ProcessTabs() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="mt-20 border border-white/10 overflow-hidden">
      {/* Tab headers */}
      <div className="flex border-b border-white/10">
        {TABS.map((tab, idx) => (
          <button
            key={tab.label}
            onClick={() => setActiveTab(idx)}
            className={`flex-1 px-2 sm:px-4 py-3 text-xs sm:text-sm font-mono uppercase tracking-wide sm:tracking-wider transition-all min-w-0 ${
              activeTab === idx
                ? 'text-white bg-white/5 border-b-2 border-white -mb-px'
                : 'text-white/50 hover:text-white/70 hover:bg-white/[0.02]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-5 sm:p-8">
        <p className="text-sm font-mono uppercase tracking-[0.2em] text-white/60 mb-5">
          The Process
        </p>
        <div className="max-w-2xl space-y-4 text-base text-white/80 leading-relaxed">
          {TABS[activeTab].content.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
