import { getSubmittableBriefs, getAllActiveBrands } from '@/lib/rrg/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function BriefSelectionPage() {
  const [briefs, brands] = await Promise.all([
    getSubmittableBriefs(),  // all active + not expired, current ones first
    getAllActiveBrands(),
  ]);

  // Build a brand lookup map
  const brandMap = new Map(brands.map(b => [b.id, b]));

  return (
    <div className="px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-2xl font-mono tracking-wider mb-3">Submit a Design</h1>
      <p className="text-base text-white/60 mb-10">
        Choose a brief to respond to. Each brief is published by a brand — your
        submission will be reviewed by that brand&apos;s team.
      </p>

      {briefs.length === 0 ? (
        <div className="text-center py-24 text-white/50 font-mono text-base">
          <p>No open briefs right now.</p>
          <p className="mt-2">Check back soon — new briefs are published regularly.</p>
          <Link
            href="/rrg"
            className="mt-6 inline-block text-white/60 hover:text-white transition-colors"
          >
            &larr; Back to Store
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {briefs.map((brief) => {
            const brand = brief.brand_id ? brandMap.get(brief.brand_id) : null;
            const brandSlug = brand?.slug ?? 'rrg';
            const brandName = brand?.name ?? 'RRG';

            return (
              <Link
                key={brief.id}
                href={`/brand/${brandSlug}/submit`}
                className="block p-6 border border-white/15 hover:border-white/40
                           transition-all group relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent
                                pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="text-sm font-mono uppercase tracking-[0.15em] text-white/50">
                        {brandName}
                      </p>
                      {brief.is_current && (
                        <span className="px-2 py-0.5 text-xs font-mono uppercase tracking-wider
                                         border border-green-400/30 text-green-400/70 leading-tight">
                          Current
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-light mb-2 leading-snug group-hover:opacity-80 transition-opacity">
                      {brief.title}
                    </h2>
                    <p className="text-base text-white/70 leading-relaxed line-clamp-2">
                      {brief.description}
                    </p>
                    {brief.ends_at && (
                      <p className="mt-3 text-sm font-mono text-white/50">
                        Deadline:{' '}
                        {new Date(brief.ends_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                  <span className="text-white/40 group-hover:text-white/80 transition-colors text-xl shrink-0 mt-1">
                    &rarr;
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
