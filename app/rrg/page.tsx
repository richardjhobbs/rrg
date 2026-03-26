import { getApprovedDropsPaginated, getPurchaseCountsByTokenIds, getCurrentBrief, getAllActiveBrands, getBrandsForDirectory, RRG_BRAND_ID } from '@/lib/rrg/db';
import type { BrandDirectoryItem } from '@/lib/rrg/db';
import { getSignedUrl } from '@/lib/rrg/storage';
import { getVerifiedWallets } from '@/lib/rrg/worldid';
import { getBadgesForDrops, type PlatformBadgeInfo } from '@/lib/rrg/platforms';
import { getAgentIdsForWallets } from '@/lib/rrg/erc8004';
import Link from 'next/link';
import AgentTrustBadge from '@/components/rrg/AgentTrustBadge';
import BrandDirectory from '@/components/rrg/BrandDirectory';
import ProcessTabs from '@/components/rrg/ProcessTabs';

export const dynamic = 'force-dynamic';

const DROPS_PER_PAGE = 18;

// Social platform display names
const SOCIAL_LABELS: Record<string, string> = {
  twitter: 'X / Twitter', x: 'X', instagram: 'Instagram', bluesky: 'BlueSky',
  telegram: 'Telegram', discord: 'Discord', youtube: 'YouTube', tiktok: 'TikTok',
  linkedin: 'LinkedIn', github: 'GitHub', facebook: 'Facebook',
};

// Strip markdown links and bare URLs, return clean plain-text excerpt for gallery cards.
function bioExcerpt(bio: string, maxLen = 90): string {
  const clean = bio
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')  // [text](url) → text
    .replace(/https?:\/\/\S+/g, '')                        // bare URLs removed
    .trim()
    .replace(/\s+/g, ' ');
  return clean.length > maxLen ? clean.slice(0, maxLen - 2).trimEnd() + '…' : clean;
}

export default async function RRGGallery({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; brief?: string; brand?: string }>;
}) {
  const params     = await searchParams;
  const page       = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const briefParam = params.brief ?? 'all';
  const brandParam = params.brand ?? 'all';

  // Fetch all active brands for the directory bar (enriched with product stats)
  const brands = await getAllActiveBrands();
  const directoryBrands = await getBrandsForDirectory();

  // Smart ordering: newest brands → newest products → most products → random
  function orderBrandsForDirectory(items: BrandDirectoryItem[]): BrandDirectoryItem[] {
    const used = new Set<string>();
    const ordered: BrandDirectoryItem[] = [];

    // Line 1: Most recently added brands (by created_at DESC)
    const byNewest = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
    for (const b of byNewest) {
      if (ordered.length >= 4) break;
      ordered.push(b);
      used.add(b.id);
    }

    // Line 2: Most recent product additions (by latest_product_at DESC), excluding line 1
    const byRecentProduct = [...items]
      .filter((b) => !used.has(b.id) && b.latest_product_at)
      .sort((a, b) => (b.latest_product_at ?? '').localeCompare(a.latest_product_at ?? ''));
    for (const b of byRecentProduct) {
      if (ordered.length >= 8) break;
      ordered.push(b);
      used.add(b.id);
    }

    // Line 3: Most products on offer (by product_count DESC), excluding lines 1-2
    const byMostProducts = [...items]
      .filter((b) => !used.has(b.id))
      .sort((a, b) => b.product_count - a.product_count);
    for (const b of byMostProducts) {
      if (ordered.length >= 12) break;
      ordered.push(b);
      used.add(b.id);
    }

    // Line 4+: Random from remainder
    const remainder = items.filter((b) => !used.has(b.id));
    for (let i = remainder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainder[i], remainder[j]] = [remainder[j], remainder[i]];
    }
    ordered.push(...remainder);

    return ordered;
  }

  const sortedBrands = orderBrandsForDirectory(directoryBrands);

  // Generate signed logo URLs for all brands (for directory cards)
  const brandsWithLogos = await Promise.all(
    sortedBrands.map(async (b) => {
      let logoUrl: string | null = null;
      if (b.logo_path) {
        try { logoUrl = await getSignedUrl(b.logo_path, 3600); } catch { /* non-fatal */ }
      }
      return {
        slug: b.slug,
        name: b.name,
        headline: b.headline,
        logoUrl,
        productCount: b.product_count,
      };
    }),
  );

  // Resolve selected brand
  const selectedBrand = brandParam !== 'all'
    ? brands.find(b => b.slug === brandParam) ?? null
    : null;
  const selectedBrandId = selectedBrand?.id ?? undefined;

  // Signed URLs for selected brand images
  let brandLogoUrl: string | null = null;
  let brandBannerUrl: string | null = null;
  if (selectedBrand) {
    try {
      if (selectedBrand.logo_path) brandLogoUrl = await getSignedUrl(selectedBrand.logo_path, 3600);
    } catch { /* non-fatal */ }
    try {
      if (selectedBrand.banner_path) brandBannerUrl = await getSignedUrl(selectedBrand.banner_path, 3600);
    } catch { /* non-fatal */ }
  }

  // Fetch brief + past briefs scoped to selected brand (or all if 'all')
  const [brief] = await Promise.all([
    getCurrentBrief(selectedBrandId),
  ]);

  // Brand lookup map for labelling drops (only needed when showing all brands)
  const brandMap = new Map(brands.map(b => [b.id, b]));

  // Resolve briefId filter: 'all' → undefined, 'current' → current brief id, else UUID
  const resolvedBriefId = briefParam === 'all'
    ? undefined
    : briefParam === 'current'
    ? brief?.id ?? undefined
    : briefParam;

  const { drops, totalCount } = await getApprovedDropsPaginated(
    page, DROPS_PER_PAGE, resolvedBriefId, selectedBrandId
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / DROPS_PER_PAGE));

  // Get purchase counts for sold-out detection
  const tokenIds       = drops.map(d => d.token_id).filter((id): id is number => id != null);
  const purchaseCounts = await getPurchaseCountsByTokenIds(tokenIds);

  // Generate signed preview URLs (1-hour expiry for display)
  const dropsWithUrls = await Promise.all(
    drops.map(async (drop) => {
      let imageUrl: string | null = null;
      try {
        if (drop.jpeg_storage_path) {
          imageUrl = await getSignedUrl(drop.jpeg_storage_path, 3600);
        }
      } catch { /* non-fatal */ }
      const soldOut = drop.token_id != null
        ? (purchaseCounts.get(drop.token_id) ?? 0) >= drop.edition_size
        : false;
      const brand = drop.brand_id ? brandMap.get(drop.brand_id) : null;
      const brandName = brand && brand.id !== RRG_BRAND_ID ? brand.name : null;
      const brandSlug = brand && brand.id !== RRG_BRAND_ID ? brand.slug : null;
      return { ...drop, imageUrl, soldOut, brandName, brandSlug, isPhysicalProduct: drop.is_physical_product };
    })
  );

  // Batch-check World ID, ERC-8004, and platform badges for all creator wallets
  const creatorWallets = [...new Set(dropsWithUrls.map(d => d.creator_wallet).filter(Boolean))];
  const [worldVerifiedWallets, erc8004AgentIds] = await Promise.all([
    getVerifiedWallets(creatorWallets),
    getAgentIdsForWallets(creatorWallets),
  ]);

  // Batch-check platform badges for all drops
  const submissionIds = dropsWithUrls.map(d => d.id).filter(Boolean);
  const platformBadgesMap = await getBadgesForDrops(creatorWallets, submissionIds);

  // Build query string helper for pagination links
  const buildQs = (overrides: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    if (brandParam !== 'all') qs.set('brand', brandParam);
    if (briefParam !== 'all') qs.set('brief', briefParam);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) qs.set(k, v);
      else qs.delete(k);
    }
    const str = qs.toString();
    return str ? `/rrg?${str}` : '/rrg';
  };

  // When a brand is selected, submit goes to that brand's page; otherwise brief selection
  const submitHref = selectedBrand ? `/brand/${selectedBrand.slug}/submit` : '/rrg/submit';

  // Parse social links for selected brand
  const brandSocialEntries = selectedBrand?.social_links
    ? Object.entries(selectedBrand.social_links).filter(([, url]) => url)
    : [];

  return (
    <div className="px-6 py-12 max-w-6xl mx-auto overflow-hidden">

      {/* ── Brand Profile (when a specific brand is selected) ──────── */}
      {selectedBrand && (
        <div className="mb-12">
          {/* Banner */}
          {brandBannerUrl && (
            <div className="w-full h-48 sm:h-64 mb-6 border border-white/10 overflow-hidden">
              <img
                src={brandBannerUrl}
                alt={`${selectedBrand.name} banner`}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex items-start gap-6">
            {/* Logo */}
            {brandLogoUrl && (
              <div className="shrink-0 w-20 h-20 border border-white/15 overflow-hidden bg-white/5">
                <img
                  src={brandLogoUrl}
                  alt={`${selectedBrand.name} logo`}
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            {/* Text */}
            <div className="flex-1 min-w-0">
              <h2 className="text-3xl font-light mb-1 leading-snug">{selectedBrand.name}</h2>
              {selectedBrand.headline && (
                <p className="text-base text-white/70 mb-2">{selectedBrand.headline}</p>
              )}
              {selectedBrand.description && (
                <p className="text-white/80 leading-relaxed text-base max-w-2xl">
                  {selectedBrand.description}
                </p>
              )}

              {/* Links row */}
              {(selectedBrand.website_url || brandSocialEntries.length > 0) && (
                <div className="flex flex-wrap items-center gap-4 mt-4">
                  {selectedBrand.website_url && (
                    <a
                      href={selectedBrand.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-white/60 hover:text-white/90 transition-colors font-mono"
                    >
                      {selectedBrand.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')} {'\u2197'}
                    </a>
                  )}
                  {brandSocialEntries.map(([platform, url]) => (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-white/50 hover:text-white/80 transition-colors font-mono"
                    >
                      {SOCIAL_LABELS[platform.toLowerCase()] ?? platform} {'\u2197'}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Brand Chips ─────────────────────────────────────────────── */}
      <div className="mb-6">
        <BrandDirectory
          brands={brandsWithLogos}
          selected={brandParam}
        />
      </div>

      {/* ── Platform Flow Diagram ───────────────────────────────────── */}
      <div className="mb-10 flex justify-center">
        <img
          src="/platform-flow-v2.png"
          alt="Real Real Genuine — Collective Creativity platform flow"
          className="w-full max-w-4xl"
        />
      </div>

      {/* ── How to Join In ──────────────────────────────────────────── */}
      <div className="mb-14 p-8 border border-white/10">
        <p className="text-sm font-mono uppercase tracking-[0.2em] text-white/60 mb-5">
          How to Join In
        </p>
        <div className="max-w-2xl space-y-4 text-base text-white/80 leading-relaxed">
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

      {/* ── Brief Banner ────────────────────────────────────────────── */}
      {brief && (
        <div className="mb-10 p-8 border border-white/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
          <p className="text-sm font-mono uppercase tracking-[0.2em] text-white/60 mb-3">
            Latest Brief{selectedBrand ? ` — ${selectedBrand.name}` : ''}
          </p>
          <h2 className="text-3xl font-light mb-3 leading-snug">{brief.title}</h2>
          <div className="text-white/80 leading-relaxed mb-5 max-w-xl text-base whitespace-pre-line">
            {brief.description}
          </div>
          <div className="flex items-center gap-6">
            <Link
              href={`${submitHref}`}
              className="inline-flex items-center gap-2 px-6 py-2.5 border border-white text-base
                         hover:bg-white hover:text-black transition-all font-medium"
            >
              Submit a Design &rarr;
            </Link>
            {brief.ends_at && (
              <p className="text-sm font-mono text-white/50">
                Deadline:{' '}
                {new Date(brief.ends_at).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Gallery Header ───────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center gap-y-3 mb-8">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="text-sm font-mono uppercase tracking-[0.3em] text-white/60 shrink-0">
            Drops ({totalCount})
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <AgentTrustBadge />
          {!brief && (
            <Link
              href={`${submitHref}`}
              className="text-base border border-white/30 px-4 py-1.5 hover:border-white transition-all whitespace-nowrap"
            >
              Submit &rarr;
            </Link>
          )}
        </div>
      </div>

      {/* ── Drop Grid ────────────────────────────────────────────────── */}
      {dropsWithUrls.length === 0 ? (
        <div className="text-center py-32 text-white/50 font-mono text-base">
          <p>No drops yet.</p>
          <Link href={`${submitHref}`} className="mt-4 inline-block text-white/60 hover:text-white transition-colors">
            Be the first to submit &rarr;
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {dropsWithUrls.map((drop) => (
            <div key={drop.id}>
              <Link
                href={`/rrg/drop/${drop.token_id}`}
                className="group block"
              >
                {/* Image */}
                <div className="relative aspect-square bg-white/5 border border-white/10
                                group-hover:border-white/30 transition-colors overflow-hidden mb-4">
                  {drop.imageUrl ? (
                    <img
                      src={drop.imageUrl}
                      alt={drop.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/30 font-mono text-sm">
                      #{drop.token_id}
                    </div>
                  )}
                  {drop.isPhysicalProduct && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-lime-500 text-black
                                     text-xs font-mono uppercase tracking-wider leading-tight">
                      Includes Real Real Product
                    </span>
                  )}
                  {drop.soldOut && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 bg-red-600 text-white
                                     text-xs font-mono uppercase tracking-wider leading-tight">
                      Sold Out
                    </span>
                  )}
                  {/* Verification badges (World ID + ERC-8004 + platform) */}
                  {drop.creator_wallet && (
                    <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
                      {worldVerifiedWallets.has(drop.creator_wallet.toLowerCase()) && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-cyan-600/80 text-white
                                         text-xs font-mono uppercase tracking-wider leading-tight">
                          <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                          World ID
                        </span>
                      )}
                      {erc8004AgentIds.has(drop.creator_wallet.toLowerCase()) && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-600/80 text-white
                                         text-xs font-mono uppercase tracking-wider leading-tight">
                          <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                          8004 #{erc8004AgentIds.get(drop.creator_wallet.toLowerCase())}
                        </span>
                      )}
                      {(platformBadgesMap.get(drop.creator_wallet.toLowerCase()) ?? []).slice(0, 2).map((pb) => (
                        <span
                          key={pb.platformSlug}
                          className="flex items-center gap-1 px-2 py-0.5 text-white
                                     text-xs font-mono uppercase tracking-wider leading-tight"
                          style={{ backgroundColor: `${pb.accentColor}cc` }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                          {pb.platformName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Info */}
                <h3 className="text-base font-medium truncate mb-1 group-hover:opacity-70 transition-opacity">
                  {drop.title}
                </h3>
                <div className="flex justify-between text-sm text-white/50 font-mono">
                  <span>${parseFloat(drop.price_usdc || '0').toFixed(2)} USDC</span>
                  <span>{drop.edition_size} ed.</span>
                </div>
              </Link>
              {drop.brandName && drop.brandSlug && (
                <Link
                  href={`/rrg?brand=${drop.brandSlug}`}
                  className="mt-1.5 block text-sm font-mono text-white/50 uppercase tracking-wider hover:text-white/80 transition-colors"
                >
                  by {drop.brandName}
                </Link>
              )}
              {drop.brandName && !drop.brandSlug && (
                <p className="mt-1.5 text-sm font-mono text-white/50 uppercase tracking-wider">
                  by {drop.brandName}
                </p>
              )}
              {drop.creator_bio && bioExcerpt(drop.creator_bio) && (
                <p className="mt-2 text-sm text-white/50 leading-snug line-clamp-2">
                  {bioExcerpt(drop.creator_bio)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex justify-end items-center gap-4 mt-10 text-base font-mono">
          {page > 1 ? (
            <Link
              href={page === 2 ? buildQs({ page: undefined }) : buildQs({ page: String(page - 1) })}
              className="text-white/60 hover:text-white transition-colors"
            >
              &larr; Prev
            </Link>
          ) : (
            <span className="text-white/30">&larr; Prev</span>
          )}
          <span className="text-white/50 tabular-nums">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={buildQs({ page: String(page + 1) })}
              className="text-white/60 hover:text-white transition-colors"
            >
              Next &rarr;
            </Link>
          ) : (
            <span className="text-white/30">Next &rarr;</span>
          )}
        </div>
      )}

      {/* ── The Process (tabbed) ───────────────────────────────────── */}
      <ProcessTabs />

    </div>
  );
}
