'use client';

import { useEffect } from 'react';

interface PhysicalProductModalProps {
  open: boolean;
  onClose: () => void;
  details: {
    physicalDescription: string | null;
    physicalImageUrls: string[];
    priceIncludesTax: boolean;
    priceIncludesPacking: boolean;
    ecommerceUrl: string | null;
    shippingType: string | null;
    shippingIncludedRegions: string[] | null;
    refundCommitment: boolean;
    collectionInPerson: string | null;
  };
}

export default function PhysicalProductModal({ open, onClose, details }: PhysicalProductModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#111] border border-white/20 max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#111] border-b border-white/10 px-6 py-4 flex justify-between items-center z-10">
          <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-lime-400">
            Physical Product Details
          </h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Description */}
          {details.physicalDescription && (
            <div>
              <p className="text-sm font-mono text-white/50 mb-1.5">Description</p>
              <p className="text-base text-white/80 leading-relaxed">{details.physicalDescription}</p>
            </div>
          )}

          {/* Product Photos */}
          {details.physicalImageUrls.length > 0 && (
            <div>
              <p className="text-sm font-mono text-white/50 mb-2">Product Photos</p>
              <div className="grid grid-cols-2 gap-2">
                {details.physicalImageUrls.map((url, i) => (
                  <div key={i} className="aspect-square bg-white/5 border border-white/10 overflow-hidden">
                    <img
                      src={url}
                      alt={`Product photo ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirmations */}
          <div className="space-y-2">
            <p className="text-sm font-mono text-white/50 mb-1.5">Price Includes</p>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${details.priceIncludesTax ? 'text-lime-400' : 'text-white/40'}`}>
                {details.priceIncludesTax ? '✓' : '✕'}
              </span>
              <span className="text-sm text-white/70">All applicable taxes</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${details.priceIncludesPacking ? 'text-lime-400' : 'text-white/40'}`}>
                {details.priceIncludesPacking ? '✓' : '✕'}
              </span>
              <span className="text-sm text-white/70">Packing for shipment</span>
            </div>
          </div>

          {/* Shipping */}
          <div>
            <p className="text-sm font-mono text-white/50 mb-1.5">Shipping</p>
            {details.shippingType === 'included' ? (
              <div>
                <p className="text-sm text-white/70 mb-1">Included in price for:</p>
                <div className="flex flex-wrap gap-1.5">
                  {(details.shippingIncludedRegions ?? []).map((region) => (
                    <span
                      key={region}
                      className="px-2 py-0.5 text-xs font-mono border border-lime-400/20 text-lime-400/70"
                    >
                      {region}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-white/70">
                Brand will quote shipping cost after payment
              </p>
            )}
          </div>

          {/* Collection */}
          {details.collectionInPerson && (
            <div>
              <p className="text-sm font-mono text-white/50 mb-1.5">Collection in Person</p>
              <p className="text-sm text-white/70">{details.collectionInPerson}</p>
            </div>
          )}

          {/* E-commerce link */}
          {details.ecommerceUrl && (
            <div>
              <p className="text-sm font-mono text-white/50 mb-1.5">Also Available At</p>
              <a
                href={details.ecommerceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/60 hover:text-white/80 transition-colors font-mono underline"
              >
                {details.ecommerceUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
              </a>
            </div>
          )}

          {/* Refund commitment */}
          {details.refundCommitment && (
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-start gap-2">
                <span className="text-lime-400 text-sm mt-0.5">✓</span>
                <p className="text-sm text-white/60 leading-relaxed">
                  The brand commits to refunding the buyer if the physical product cannot be
                  shipped or delivered as described.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
