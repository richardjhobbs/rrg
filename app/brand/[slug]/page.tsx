import {
  getBrandBySlug,
  getApprovedDropsPaginated,
  getPurchaseCountsByTokenIds,
  getCurrentBrief,
} from '@/lib/rrg/db';
import { getSignedUrl } from '@/lib/rrg/storage';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const DROPS_PER_PAGE = 18;

// Social platform display names & icons (simple text-based)
const SOCIAL_LABELS: Record<string, string> = {
  twitter: 'X / Twitter',
  x: 'X',
  instagram: 'Instagram',
  bluesky: 'BlueSky',
  telegram: 'Telegram',
  discord: 'Discord',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  facebook: 'Facebook',
};

export default async function BrandStorefront({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const sp       = await searchParams;
  const page     = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const brand = await getBrandBySlug(slug);
  if (!brand || brand.status !== 'active') return notFound();

  // Signed URLs for brand images (if stored in Supabase)
  let logoUrl: string | null = null;
  let bannerUrl: string | null = null;
  try {
    if (brand.logo_path) logoUrl = await getSignedUrl(brand.logo_path, 3600);
  } catch { /* non-fatal */ }
  try {
    if (brand.banner_path) bannerUrl = await getSignedUrl(brand.banner_path, 3600);
  } catch { /* non-fatal */ }

  const [brief, { drops, totalCount }] = await Promise.all([
    getCurrentBrief(brand.id),
    getApprovedDropsPaginated(page, DROPS_PER_PAGE, undefined, brand.id),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / DROPS_PER_PAGE));

  // Purchase counts for sold-out detection
  const tokenIds       = drops.map(d => d.token_id).filter((id): id is number => id != null);
  const purchaseCounts = await getPurchaseCountsByTokenIds(tokenIds);

  // Signed preview URLs
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
      return { ...drop, imageUrl, soldOut };
    })
  );

  // Parse social links
  const socialEntries = brand.social_links
    ? Object.entries(brand.social_links).filter(([, url]) => url)
    : [];

  return (
    <div className="px-6 py-12 max-w-6xl mx-auto">

      {/* ── Brand Profile ───────────────────────────────────────── */}
      <div className="mb-12">
        {/* Banner */}
        {bannerUrl && (
          <div className="w-full h-48 sm:h-64 mb-6 border border-white/10 overflow-hidden">
            <img
              src={bannerUrl}
              alt={`${brand.name} banner`}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex items-start gap-6">
          {/* Logo */}
          {logoUrl && (
            <div className="shrink-0 w-20 h-20 border border-white/15 overflow-hidden bg-white/5">
              <img
                src={logoUrl}
                alt={`${brand.name} logo`}
                className="w-full h-full object-contain"
              />
            </div>
          )}

          {/* Text */}
          <div className="flex-1 min-w-0">
            {brand.headline && (
              <h2 className="text-2xl font-light mb-2 leading-snug">{brand.headline}</h2>
            )}
            {brand.description && (
              <p className="text-white/60 leading-relaxed text-sm max-w-2xl">
                {brand.description}
              </p>
            )}

            {/* Links row */}
            {(brand.website_url || socialEntries.length > 0) && (
              <div className="flex flex-wrap items-center gap-4 mt-4">
                {brand.website_url && (
                  <a
                    href={brand.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-white/40 hover:text-white/70 transition-colors font-mono"
                  >
                    {brand.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')} &nearr;
                  </a>
                )}
                {socialEntries.map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-white/30 hover:text-white/60 transition-colors font-mono"
                  >
                    {SOCIAL_LABELS[platform.toLowerCase()] ?? platform} &nearr;
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Brief Banner ─────────────────────────────────────────── */}
      {brief && (
        <div className="mb-10 p-8 border border-white/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-3">
            Current Brief
          </p>
          <h2 className="text-2xl font-light mb-3 leading-snug">{brief.title}</h2>
          <p className="text-white/60 leading-relaxed mb-5 max-w-xl text-sm">
            {brief.description}
          </p>
          <div className="flex items-center gap-6">
            <Link
              href={`/brand/${slug}/submit`}
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

      {/* ── Gallery Header ───────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-xs font-mono uppercase tracking-[0.3em] text-white/40">
          Products ({totalCount})
        </h1>
        {!brief && (
          <Link
            href={`/brand/${slug}/submit`}
            className="text-sm border border-white/30 px-4 py-1.5 hover:border-white transition-all"
          >
            Submit &rarr;
          </Link>
        )}
      </div>

      {/* ── Drop Grid ────────────────────────────────────────────── */}
      {dropsWithUrls.length === 0 ? (
        <div className="text-center py-32 text-white/20 font-mono text-sm">
          <p>No products yet.</p>
          <Link
            href={`/brand/${slug}/submit`}
            className="mt-4 inline-block text-white/40 hover:text-white transition-colors"
          >
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
            </Link>
          ))}
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex justify-end items-center gap-4 mt-10 text-sm font-mono">
          {page > 1 ? (
            <Link
              href={page === 2 ? `/brand/${slug}` : `/brand/${slug}?page=${page - 1}`}
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
              href={`/brand/${slug}?page=${page + 1}`}
              className="text-white/50 hover:text-white transition-colors"
            >
              Next &rarr;
            </Link>
          ) : (
            <span className="text-white/15">Next &rarr;</span>
          )}
        </div>
      )}

    </div>
  );
}
