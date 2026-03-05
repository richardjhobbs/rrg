import { NextRequest, NextResponse } from 'next/server';
import { db, getPurchaseByTxHash, getSubmissionById } from '@/lib/rrg/db';
import { sendFileDeliveryEmail } from '@/lib/rrg/email';

export const dynamic = 'force-dynamic';

// POST /api/rrg/deliver — for agent buyers requesting file delivery by email
// Body: { txHash, email }
export async function POST(req: NextRequest) {
  try {
    const { txHash, email } = await req.json();

    if (!txHash || !email) {
      return NextResponse.json({ error: 'txHash and email required' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const purchase = await getPurchaseByTxHash(txHash);
    if (!purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    const submission = await getSubmissionById(purchase.submission_id);
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Generate / refresh download link
    const { randomBytes } = await import('crypto');
    const downloadToken  = randomBytes(32).toString('hex');
    const downloadExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const siteUrl        = process.env.NEXT_PUBLIC_SITE_URL!;
    const downloadUrl    = `${siteUrl}/api/rrg/download?token=${downloadToken}`;

    await db
      .from('rrg_purchases')
      .update({
        download_token:     downloadToken,
        download_expires_at: downloadExpiry,
        delivery_email:     email,
      })
      .eq('tx_hash', txHash);

    await sendFileDeliveryEmail({
      to:       email,
      title:    submission.title,
      tokenId:  purchase.token_id,
      txHash,
      downloadUrl,
    });

    await db
      .from('rrg_purchases')
      .update({ files_delivered: true })
      .eq('tx_hash', txHash);

    return NextResponse.json({
      success: true,
      message: `Files sent to ${email}. Download link expires in 24 hours.`,
    });

  } catch (err) {
    console.error('[/api/rrg/deliver]', err);
    return NextResponse.json({ error: 'Delivery failed' }, { status: 500 });
  }
}
