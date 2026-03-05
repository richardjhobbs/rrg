import { getPurchaseByDownloadToken, getSubmissionById } from '@/lib/rrg/db';
import { getSignedUrl } from '@/lib/rrg/storage';
import { db } from '@/lib/rrg/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function DownloadPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return <ErrorPage message="No download token provided." />;
  }

  // ── Look up purchase ────────────────────────────────────────────────
  const purchase = await getPurchaseByDownloadToken(token);
  if (!purchase) {
    return <ErrorPage message="This download link is invalid or has already been used." />;
  }

  // ── Check expiry ────────────────────────────────────────────────────
  if (purchase.download_expires_at) {
    const expiry = new Date(purchase.download_expires_at);
    if (expiry < new Date()) {
      return <ErrorPage message="This download link has expired. Please contact support." />;
    }
  }

  // ── Get submission ──────────────────────────────────────────────────
  const submission = await getSubmissionById(purchase.submission_id);
  if (!submission) {
    return <ErrorPage message="Files not found. Please contact support." />;
  }

  // ── Generate signed URLs ────────────────────────────────────────────
  let jpegUrl: string | null = null;
  try {
    jpegUrl = await getSignedUrl(submission.jpeg_storage_path, 86400);
  } catch { /* handled below */ }

  const additionalFiles: { name: string; url: string }[] = [];
  if (submission.additional_files_path) {
    try {
      const { data: fileList } = await db.storage
        .from('rrg-submissions')
        .list(`submissions/${submission.id}/additional`);

      if (fileList) {
        for (const file of fileList) {
          const url = await getSignedUrl(
            `submissions/${submission.id}/additional/${file.name}`,
            86400
          );
          additionalFiles.push({ name: file.name, url });
        }
      }
    } catch { /* non-fatal */ }
  }

  if (!jpegUrl) {
    return <ErrorPage message="Could not generate download link. Please try again." />;
  }

  // ── Refresh expiry on visit ─────────────────────────────────────────
  const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await db
    .from('rrg_purchases')
    .update({ download_expires_at: newExpiry })
    .eq('download_token', token);

  const isTestnet = process.env.NEXT_PUBLIC_CHAIN_ID === '84532';
  const scanBase  = isTestnet ? 'https://sepolia.basescan.org' : 'https://basescan.org';
  const txShort   = `${purchase.tx_hash.slice(0, 10)}…${purchase.tx_hash.slice(-6)}`;
  const filename  = submission.jpeg_filename || `rrg-token-${purchase.token_id}.jpg`;

  return (
    <div className="min-h-screen bg-black text-white flex items-start justify-center px-4 py-20">
      <div className="w-full max-w-lg">

        <div className="border border-white/10 p-8">

          {/* Header */}
          <div className="text-3xl mb-5">✓</div>
          <h1 className="text-xl font-medium mb-1">{submission.title}</h1>
          <p className="text-sm text-white/40 mb-1">Token #{purchase.token_id}</p>
          <a
            href={`${scanBase}/tx/${purchase.tx_hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-white/20 hover:text-white/40 transition-colors"
          >
            {txShort} ↗
          </a>

          {/* Files */}
          <div className="border-t border-white/10 mt-7 pt-7 space-y-3">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-white/30 mb-5">
              Your files
            </p>

            {/* Main JPEG */}
            <a
              href={jpegUrl}
              download={filename}
              className="flex items-center justify-between w-full border border-white/20
                         px-4 py-3.5 hover:border-white transition-all group"
            >
              <div>
                <p className="text-sm">{filename}</p>
                <p className="text-xs text-white/30 mt-0.5">High-resolution JPEG</p>
              </div>
              <span className="text-sm font-mono text-white/30 group-hover:text-white/70 transition-colors ml-4">
                ↓
              </span>
            </a>

            {/* Additional files */}
            {additionalFiles.map((f) => (
              <a
                key={f.name}
                href={f.url}
                download={f.name}
                className="flex items-center justify-between w-full border border-white/20
                           px-4 py-3.5 hover:border-white transition-all group"
              >
                <div>
                  <p className="text-sm">{f.name}</p>
                  <p className="text-xs text-white/30 mt-0.5">Additional file</p>
                </div>
                <span className="text-sm font-mono text-white/30 group-hover:text-white/70 transition-colors ml-4">
                  ↓
                </span>
              </a>
            ))}
          </div>

          <p className="text-xs text-white/20 mt-7">
            Link refreshed — valid for 24 hours from this visit.
          </p>
        </div>

        <div className="mt-5 text-center">
          <Link
            href="/rrg"
            className="text-xs text-white/20 hover:text-white/40 transition-colors"
          >
            ← Browse RRG
          </Link>
        </div>

      </div>
    </div>
  );
}

// ── Error state ─────────────────────────────────────────────────────────
function ErrorPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm border border-red-400/20 bg-red-400/5 p-8 text-center">
        <p className="text-red-400 text-sm font-mono mb-6">{message}</p>
        <Link
          href="/rrg"
          className="text-xs text-white/40 hover:text-white/60 transition-colors"
        >
          ← Browse RRG
        </Link>
      </div>
    </div>
  );
}
