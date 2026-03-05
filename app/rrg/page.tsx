import { getApprovedDrops, getCurrentBrief } from '@/lib/rrg/db';
import { getSignedUrl } from '@/lib/rrg/storage';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function RRGGallery() {
  const [drops, brief] = await Promise.all([
    getApprovedDrops(),
    getCurrentBrief(),
  ]);

  // Generate signed preview URLs (1-hour expiry for display)
  const dropsWithUrls = await Promise.all(
    drops.map(async (drop) => {
      let imageUrl: string | null = null;
      try {
        if (drop.jpeg_storage_path) {
          imageUrl = await getSignedUrl(drop.jpeg_storage_path, 3600);
        }
      } catch { /* non-fatal */ }
      return { ...drop, imageUrl };
    })
  );

  return (
    <div className="px-6 py-12 max-w-6xl mx-auto">

      {/* ── Brief Banner ────────────────────────────────────────────── */}
      {brief && (
        <div className="mb-14 p-8 border border-white/20 relative overflow-hidden">
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
              href="/rrg/submit"
              className="inline-flex items-center gap-2 px-6 py-2.5 border border-white text-sm
                         hover:bg-white hover:text-black transition-all font-medium"
            >
              Submit a Design →
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

      {/* ── Gallery Header ───────────────────────────────────────────── */}
      <div className="flex justify-between items-baseline mb-8">
        <h1 className="text-xs font-mono uppercase tracking-[0.3em] text-white/40">
          Drops ({drops.length})
        </h1>
        {!brief && (
          <Link
            href="/rrg/submit"
            className="text-sm border border-white/30 px-4 py-1.5 hover:border-white transition-all"
          >
            Submit →
          </Link>
        )}
      </div>

      {/* ── Drop Grid ────────────────────────────────────────────────── */}
      {dropsWithUrls.length === 0 ? (
        <div className="text-center py-32 text-white/20 font-mono text-sm">
          <p>No drops yet.</p>
          <Link href="/rrg/submit" className="mt-4 inline-block text-white/40 hover:text-white transition-colors">
            Be the first to submit →
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
              <div className="aspect-square bg-white/5 border border-white/10
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
    </div>
  );
}
