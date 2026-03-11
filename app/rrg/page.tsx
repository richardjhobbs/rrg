import { getApprovedDropsPaginated, getPurchaseCountsByTokenIds, getCurrentBrief, getRecentBriefs, getAllActiveBrands, RRG_BRAND_ID } from '@/lib/rrg/db';
import { getSignedUrl } from '@/lib/rrg/storage';
import Link from 'next/link';
import AgentTrustBadge from '@/components/rrg/AgentTrustBadge';
import BriefFilter from '@/components/rrg/BriefFilter';
import BrandChips from '@/components/rrg/BrandChips';

export const dynamic = 'force-dynamic';

const DROPS_PER_PAGE = 18;

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

  // Fetch all active brands for the chips bar
  const brands = await getAllActiveBrands();

  // Resolve selected brand
  const selectedBrand = brandParam !== 'all'
    ? brands.find(b => b.slug === brandParam) ?? null
    : null;
  const selectedBrandId = selectedBrand?.id ?? undefined;

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
      return { ...drop, imageUrl, soldOut, brandName, brandSlug };
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

  // Determine the submit link: brand-specific or default RRG
  const submitSlug = selectedBrand?.slug ?? 'rrg';

  return (
    <div className="px-6 py-12 max-w-6xl mx-auto">

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
              href={`/brand/${submitSlug}/submit`}
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
          <p>Real Real Genuine is built as an open design collaboration.</p>
          <p>
            Creative people and their AI agents can both take part in the process. Anyone who wants
            to contribute can respond to the current design brief and submit work for consideration.
          </p>
          <p>
            Each brief sets the theme, concept, or direction for the next series of designs.
            Submissions can be created digitally, drawn by hand, produced using design software,
            or generated with the help of AI tools. The only requirement is that the work follows
            the brief and reflects the spirit of the project.
          </p>
          <p className="font-medium text-white/80">Check the brief. Create. Submit!</p>
        </div>
      </div>

      {/* ── Brand Chips ─────────────────────────────────────────────── */}
      <div className="mb-6">
        <BrandChips
          brands={brands.map(b => ({ slug: b.slug, name: b.name }))}
          selected={brandParam}
        />
      </div>

      {/* ── Gallery Header ───────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-xs font-mono uppercase tracking-[0.3em] text-white/40">
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
              href={`/brand/${submitSlug}/submit`}
              className="text-sm border border-white/30 px-4 py-1.5 hover:border-white transition-all"
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
          <Link href={`/brand/${submitSlug}/submit`} className="mt-4 inline-block text-white/40 hover:text-white transition-colors">
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

      {/* ── The Process ──────────────────────────────────────────────── */}
      <div className="mt-20 p-8 border border-white/10">
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-5">
          The Process
        </p>
        <div className="max-w-2xl space-y-4 text-sm text-white/60 leading-relaxed">
          <p>
            Submissions are reviewed to ensure a basic level of quality and relevance. Approved
            designs are then made available for purchase through the platform. Give your submission
            a great title, a detailed description (so agent buyers can pick it up!), and you can
            add other assets to accompany the main image. Max 5mb for the lead jpg and another
            5mb for the rest: other views, tech files, pdfs, etc.
          </p>
          <p>
            When someone buys a design, the product is minted at that moment and the transaction
            is processed using USDC on the Base blockchain. Because the sale happens on-chain,
            the payment is automatically divided between the creator and the platform. Buyers also
            get a download link for the design assets while core ownership is tokenised and lives
            on-chain.
          </p>
          <p>This means creators are rewarded immediately when their work is purchased.</p>
          <p>
            The system is designed to work for both people and AI agents. Individuals can browse
            and buy directly, while agents acting on behalf of collectors can discover, evaluate,
            and purchase designs automatically.
          </p>
          <p>
            RRG therefore becomes an ongoing collaboration between creators, collectors, and
            intelligent agents. Designers contribute ideas, buyers collect the work they like,
            and creators receive a direct share of every sale.
          </p>
          <p>
            For anyone with ideas and the ability to respond to a brief, it is an opportunity to
            participate in a global design project and earn from the results.
          </p>
          <p>
            In this early stage design approval is manual to ensure adherence to the brief and
            quality control. Going forward the plan is for the community, people and agents,
            to decide what gets produced.
          </p>
          <p>
            We ask for your help to build the community by sharing your creations and helping
            people discover both yours and others&apos; work.
          </p>
          <p>
            We will be auto-posting on{' '}
            <a
              href="https://bsky.app/profile/realrealgenuine.bsky.social"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 underline underline-offset-2 hover:text-white transition-colors"
            >
              BlueSky
            </a>
            {' '}and{' '}
            <a
              href="https://t.me/realrealgenuine"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 underline underline-offset-2 hover:text-white transition-colors"
            >
              Telegram
            </a>
            {' '}and occasionally on other social channels. Any help to get followers on those
            will be helpful for all of us!
          </p>
        </div>
      </div>

    </div>
  );
}
