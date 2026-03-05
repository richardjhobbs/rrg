import { NextRequest, NextResponse } from 'next/server';
import { db, getPurchaseByDownloadToken, getSubmissionById } from '@/lib/rrg/db';
import { getSignedUrl } from '@/lib/rrg/storage';

export const dynamic = 'force-dynamic';

// GET /api/rrg/download?token=<downloadToken>
// Redirects to the proper download page — kept for backwards compatibility
// with any links generated before the /rrg/download page existed.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token    = searchParams.get('token');
    const wallet   = searchParams.get('wallet')?.toLowerCase();
    const tokenIdP = searchParams.get('tokenId');

    // ── Token-based: redirect to the download page ─────────────────────
    if (token) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
      return NextResponse.redirect(`${siteUrl}/rrg/download?token=${token}`, 302);
    }

    if (!wallet || !tokenIdP) {
      return NextResponse.json(
        { error: 'Provide either token or wallet+tokenId' },
        { status: 400 }
      );
    }

    let purchase: Awaited<ReturnType<typeof getPurchaseByDownloadToken>>;

    if (token) {
      // Token-based auth (from delivery email)
      purchase = await getPurchaseByDownloadToken(token);
      if (!purchase) {
        return NextResponse.json({ error: 'Invalid or expired download link' }, { status: 404 });
      }

      // Check expiry
      if (purchase.download_expires_at) {
        const expiry = new Date(purchase.download_expires_at);
        if (expiry < new Date()) {
          return NextResponse.json({ error: 'Download link has expired' }, { status: 410 });
        }
      }
    } else {
      // Wallet-based auth (for agent buyers / MCP)
      const tokenId = parseInt(tokenIdP!, 10);
      const { data } = await db
        .from('rrg_purchases')
        .select('*')
        .eq('buyer_wallet', wallet!)
        .eq('token_id', tokenId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!data) {
        return NextResponse.json({ error: 'Purchase not found for this wallet' }, { status: 404 });
      }
      purchase = data;
    }

    // ── Get the submission to find all files ──────────────────────────
    const submission = await getSubmissionById(purchase!.submission_id);
    if (!submission) {
      return NextResponse.json({ error: 'Submission files not found' }, { status: 404 });
    }

    // ── Generate fresh signed URL for main JPEG (24h) ──────────────────
    const jpegUrl = await getSignedUrl(submission.jpeg_storage_path, 86400);

    // If there are additional files, also generate signed URL for the folder
    let additionalUrl: string | null = null;
    if (submission.additional_files_path) {
      try {
        // List files in the additional path and generate signed URLs
        const { data: fileList } = await db.storage
          .from('rrg-submissions')
          .list(`submissions/${submission.id}/additional`);

        if (fileList && fileList.length > 0) {
          // For simplicity, return the signed URL of the first additional file
          // In production this would be a zip — for now list them
          additionalUrl = await getSignedUrl(
            `submissions/${submission.id}/additional/${fileList[0].name}`,
            86400
          );
        }
      } catch {
        // Non-fatal
      }
    }

    // ── Refresh download token expiry ──────────────────────────────────
    if (token) {
      const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await db
        .from('rrg_purchases')
        .update({ download_expires_at: newExpiry })
        .eq('download_token', token);
    }

    return NextResponse.json({
      title:         submission.title,
      jpegUrl,
      additionalUrl,
      expiresIn:     '24 hours',
      txHash:        purchase!.tx_hash,
    });

  } catch (err) {
    console.error('[/api/rrg/download]', err);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
