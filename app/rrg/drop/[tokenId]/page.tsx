import React from 'react';
import { getDropByTokenId } from '@/lib/rrg/db';
import { getSignedUrl } from '@/lib/rrg/storage';
import { getRRGReadOnly } from '@/lib/rrg/contract';
import { notFound } from 'next/navigation';
import PurchaseFlow from './PurchaseFlow';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// Render bio with clickable links.
// Supports bare URLs (https://example.com) and markdown links ([My Site](https://example.com)).
function renderBio(bio: string): React.ReactNode {
  // Match [text](url) first, then fall back to bare URLs
  const combinedRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|https?:\/\/[^\s<>"']+[^\s<>"'.,!?;)]/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = combinedRegex.exec(bio)) !== null) {
    if (match.index > lastIdx) {
      parts.push(bio.slice(lastIdx, match.index));
    }
    if (match[1] && match[2]) {
      // Markdown link: [display text](url)
      parts.push(
        <a
          key={key++}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 underline underline-offset-2 hover:text-white transition-colors"
        >
          {match[1]}
        </a>
      );
    } else {
      // Bare URL — show domain without protocol
      parts.push(
        <a
          key={key++}
          href={match[0]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 underline underline-offset-2 hover:text-white transition-colors"
        >
          {match[0].replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </a>
      );
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < bio.length) parts.push(bio.slice(lastIdx));
  return <>{parts}</>;
}

interface Props {
  params: Promise<{ tokenId: string }>;
}

export default async function DropPage({ params }: Props) {
  const { tokenId: tokenIdStr } = await params;
  const tokenId = parseInt(tokenIdStr, 10);
  if (isNaN(tokenId)) notFound();

  const drop = await getDropByTokenId(tokenId);
  if (!drop) notFound();

  // Signed image URL
  let imageUrl: string | null = null;
  try {
    if (drop.jpeg_storage_path) {
      imageUrl = await getSignedUrl(drop.jpeg_storage_path, 3600);
    }
  } catch { /* non-fatal */ }

  // On-chain live data
  let onChain = {
    minted:    0,
    maxSupply: drop.edition_size ?? 1,
    active:    true,
    soldOut:   false,
  };
  try {
    const contract  = getRRGReadOnly();
    const data      = await contract.getDrop(tokenId);
    onChain = {
      minted:    Number(data.minted),
      maxSupply: Number(data.maxSupply),
      active:    Boolean(data.active),
      soldOut:   Number(data.minted) >= Number(data.maxSupply),
    };
  } catch { /* non-fatal — show DB data */ }

  const remaining  = onChain.maxSupply - onChain.minted;
  const priceUsdc  = parseFloat(drop.price_usdc || '0');
  const scanBase   = 'https://basescan.org';

  return (
    <div className="px-6 py-12 max-w-5xl mx-auto">

      {/* Back */}
      <Link
        href="/rrg"
        className="text-xs font-mono text-white/30 hover:text-white transition-colors mb-10 inline-block"
      >
        ← Gallery
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">

        {/* Image */}
        <div className="aspect-square bg-white/5 border border-white/10 overflow-hidden md:sticky md:top-8">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={drop.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/10 font-mono text-xs">
              #{tokenId}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-white/30 mb-3">
            Token #{tokenId}
          </p>
          <h1 className="text-3xl font-light leading-tight mb-4">{drop.title}</h1>

          {drop.description && (
            <p className="text-white/50 text-sm leading-relaxed mb-8">
              {drop.description.replace(/\n?\[Suggested:[^\]]*\]/g, '').trim()}
            </p>
          )}

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-4 border-t border-b border-white/10 py-6 mb-8">
            <div>
              <p className="text-xs text-white/30 font-mono mb-1">Price</p>
              <p className="text-xl font-mono">${priceUsdc.toFixed(2)}</p>
              <p className="text-xs text-white/20 mt-0.5">USDC</p>
            </div>
            <div>
              <p className="text-xs text-white/30 font-mono mb-1">Edition</p>
              <p className="text-xl font-mono">{onChain.maxSupply}</p>
              <p className="text-xs text-white/20 mt-0.5">total copies</p>
            </div>
            <div>
              <p className="text-xs text-white/30 font-mono mb-1">Remaining</p>
              <p className={`text-xl font-mono ${remaining === 0 ? 'text-red-400' : ''}`}>
                {remaining}
              </p>
              <p className="text-xs text-white/20 mt-0.5">available</p>
            </div>
          </div>

          {/* Creator */}
          <div className="mb-8">
            {drop.creator_wallet && (
              <p className="text-xs font-mono text-white/20 mb-3">
                Creator:{' '}
                <a
                  href={`${scanBase}/address/${drop.creator_wallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white/50 transition-colors"
                >
                  {drop.creator_wallet.slice(0, 6)}…{drop.creator_wallet.slice(-4)}
                </a>
              </p>
            )}
            {drop.creator_bio && (
              <p className="text-sm text-white/40 leading-relaxed">
                {renderBio(drop.creator_bio)}
              </p>
            )}
          </div>

          {/* Purchase flow (client component) */}
          <PurchaseFlow
            tokenId={tokenId}
            priceUsdc={priceUsdc}
            soldOut={onChain.soldOut}
            active={onChain.active}
          />

          {/* What you get */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-white/30 mb-3">
              What you get
            </p>
            <ul className="space-y-2 text-xs text-white/40">
              <li>· ERC-1155 token on Base (proof of ownership)</li>
              <li>· High-resolution JPEG download</li>
              {drop.additional_files_path && <li>· Source files / additional assets</li>}
              <li>· 70% of purchase price goes to the creator</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
