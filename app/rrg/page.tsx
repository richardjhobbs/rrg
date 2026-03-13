import { getApprovedDropsPaginated, getPurchaseCountsByTokenIds, getCurrentBrief, getRecentBriefs, getAllActiveBrands, RRG_BRAND_ID } from '@/lib/rrg/db';
import { getSignedUrl } from '@/lib/rrg/storage';
import Link from 'next/link';
import AgentTrustBadge from '@/components/rrg/AgentTrustBadge';
import BriefFilter from '@/components/rrg/BriefFilter';
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

  // Fetch all active brands for the directory bar
  const brands = await getAllActiveBrands();

  // Generate signed logo URLs for all brands (for directory cards)
  const brandsWithLogos = await Promise.all(
    brands.map(async (b) => {
      let logoUrl: string | null = null;
      if (b.logo_path) {
        try { logoUrl = await getSignedUrl(b.logo_path, 3600); } catch { /* non-fatal */ }
      }
      return { slug: b.slug, name: b.name, headline: b.headline, logoUrl };
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
  const [brief, allBriefs] = await Promise.all([
    getCurrentBrief(selectedBrandId),
    getRecentBriefs(20, selectedBrandId),
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

  // Submit always goes to the brief selection page
  const submitHref = '/rrg/submit';

  // Parse social links for selected brand
  const brandSocialEntries = selectedBrand?.social_links
    ? Object.entries(selectedBrand.social_links).filter(([, url]) => url)
    : [];

  return (
    <div className="px-6 py-12 max-w-6xl mx-auto">

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
              <h2 className="text-2xl font-light mb-1 leading-snug">{selectedBrand.name}</h2>
              {selectedBrand.headline && (
                <p className="text-sm text-white/50 mb-2">{selectedBrand.headline}</p>
              )}
              {selectedBrand.description && (
                <p className="text-white/60 leading-relaxed text-sm max-w-2xl">
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
                      className="text-xs text-white/40 hover:text-white/70 transition-colors font-mono"
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
                      className="text-xs text-white/30 hover:text-white/60 transition-colors font-mono"
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

      {/* ── Brief Banner ────────────────────────────────────────────── */}
      {brief && (
        <div className="mb-10 p-8 border border-white/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-3">
            Current Brief{selectedBrand ? ` — ${selectedBrand.name}` : ''}
          </p>
          <h2 className="text-2xl font-light mb-3 leading-snug">{brief.title}</h2>
          <p className="text-white/60 leading-relaxed mb-5 max-w-xl text-sm">
            {brief.description}
          </p>
          <div className="flex items-center gap-6">
            <Link
              href={`${submitHref}`}
              className="inline-flex items-center gap-2 px-6 py-2.5 border border-white text-sm
                         hover:bg-white hover:text-black transition-all font-medium"
            >
              Submit a Design &rarr;
            </Link>
            {brief.ends_at && (
              <p className="text-xs font-mono text-white/30">
                Deadline:{' '}
                {new Date(brief.ends_at).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── How to Join In ──────────────────────────────────────────── */}
      <div className="mb-14 p-8 border border-white/10">
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-5">
          How to Join In
        </p>
        <div className="max-w-2xl space-y-4 text-sm text-white/60 leading-relaxed">
          <p>
            Real Real Genuine is a collaborative creation platform connecting brands with human
            creators and AI agents. Brands publish design briefs. Creators respond with original
            work. Approved designs are minted, sold, and the revenue is shared automatically,
            transparently, on-chain.
          </p>
          <p>
            Whether you&apos;re a brand looking to commission original creative work with zero
            upfront production cost, or a creator looking to design for brands you believe in,
            Real Real Genuine is where the work gets made.
          </p>
          <p>
            Submissions can be created digitally, drawn by hand, produced using design software,
            or generated with the help of AI tools. All we ask is that you follow the brief and
            bring something worth making.
          </p>
        </div>
      </div>

      {/* ── Brand Chips ─────────────────────────────────────────────── */}
      <div className="mb-6">
        <BrandDirectory
          brands={brandsWithLogos}
          selected={brandParam}
        />
      </div>

      {/* ── Gallery Header ───────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center gap-y-3 mb-8">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="text-xs font-mono uppercase tracking-[0.3em] text-white/40 shrink-0">
            Drops ({totalCount})
          </h1>
          <BriefFilter
            briefs={allBriefs.map(b => ({ id: b.id, title: b.title }))}
            currentBriefId={brief?.id ?? null}
            selected={briefParam}
          />
        </div>
        <div className="flex items-center gap-3">
          <AgentTrustBadge />
          {!brief && (
            <Link
              href={`${submitHref}`}
              className="text-sm border border-white/30 px-4 py-1.5 hover:border-white transition-all whitespace-nowrap"
            >
              Submit &rarr;
            </Link>
          )}
        </div>
      </div>

      {/* ── Drop Grid ────────────────────────────────────────────────── */}
      {dropsWithUrls.length === 0 ? (
        <div className="text-center py-32 text-white/20 font-mono text-sm">
          <p>No drops yet.</p>
          <Link href={`${submitHref}`} className="mt-4 inline-block text-white/40 hover:text-white transition-colors">
            Be the first to submit &rarr;
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {dropsWithUrls.map((drop) => (
            <Link
              key={drop.id}
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
                  <div className="w-full h-full flex items-center justify-center text-white/10 font-mono text-xs">
                    #{drop.token_id}
                  </div>
                )}
                {drop.isPhysicalProduct && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 bg-lime-500 text-black
                                   text-[10px] font-mono uppercase tracking-wider leading-tight">
                    Includes Real Real Product
                  </span>
                )}
                {drop.soldOut && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 bg-red-600 text-white
                                   text-[10px] font-mono uppercase tracking-wider leading-tight">
                    Sold Out
                  </span>
                )}
              </div>

              {/* Info */}
              <h3 className="text-sm font-medium truncate mb-1 group-hover:opacity-70 transition-opacity">
                {drop.title}
              </h3>
              <div className="flex justify-between text-xs text-white/30 font-mono">
                <span>${parseFloat(drop.price_usdc || '0').toFixed(2)} USDC</span>
                <span>{drop.edition_size} ed.</span>
              </div>
              {drop.brandName && (
                <p className="mt-1.5 text-[10px] font-mono text-white/25 uppercase tracking-wider">
                  by {drop.brandName}
                </p>
              )}
              {drop.creator_bio && bioExcerpt(drop.creator_bio) && (
                <p className="mt-2 text-xs text-white/20 leading-snug line-clamp-2">
                  {bioExcerpt(drop.creator_bio)}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex justify-end items-center gap-4 mt-10 text-sm font-mono">
          {page > 1 ? (
            <Link
              href={page === 2 ? buildQs({ page: undefined }) : buildQs({ page: String(page - 1) })}
              className="text-white/50 hover:text-white transition-colors"
            >
              &larr; Prev
            </Link>
          ) : (
            <span className="text-white/15">&larr; Prev</span>
          )}
          <span className="text-white/30 tabular-nums">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={buildQs({ page: String(page + 1) })}
              className="text-white/50 hover:text-white transition-colors"
            >
              Next &rarr;
            </Link>
          ) : (
            <span className="text-white/15">Next &rarr;</span>
          )}
        </div>
      )}

      {/* ── The Process (tabbed) ───────────────────────────────────── */}
      <ProcessTabs />

    </div>
  );
}
