/**
 * RRG email helpers
 *
 * Two types of email:
 * 1. Approval notification — creator notified when their design goes live
 * 2. File delivery — buyer receives download link after mint
 */

const RESEND_URL = 'https://api.resend.com/emails';
const FROM       = process.env.FROM_EMAIL ?? 'deliver@realrealgenuine.com';
const SITE_URL   = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realrealgenuine.com';

async function sendEmail(payload: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, ...payload }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
}

// ── 1. Approval notification ───────────────────────────────────────────

export async function sendApprovalNotification({
  to,
  title,
  tokenId,
  priceUsdc,
  editionSize,
  creatorWallet,
}: {
  to: string;
  title: string;
  tokenId: number;
  priceUsdc: number;
  editionSize: number;
  creatorWallet: string;
}): Promise<void> {
  const dropUrl = `${SITE_URL}/rrg/drop/${tokenId}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; margin: 0; padding: 40px 20px; }
  .card { max-width: 520px; margin: 0 auto; background: #111; border: 1px solid #222; border-radius: 12px; overflow: hidden; }
  .header { background: #d4ff22; padding: 24px 28px; }
  .header h1 { margin: 0; font-size: 20px; color: #0a0a0a; font-weight: 700; }
  .body { padding: 28px; }
  .body p { margin: 0 0 16px; line-height: 1.6; color: #ccc; font-size: 14px; }
  .meta { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 16px; margin: 20px 0; }
  .meta-row { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #222; }
  .meta-row:last-child { border-bottom: none; }
  .meta-label { color: #888; min-width: 110px; }
  .meta-value { color: #e5e5e5; font-weight: 500; }
  .btn { display: inline-block; background: #d4ff22; color: #0a0a0a; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; margin-top: 8px; }
  .footer { padding: 20px 28px; border-top: 1px solid #1a1a1a; font-size: 12px; color: #555; }
  .wallet { font-family: monospace; font-size: 12px; color: #7c3aed; word-break: break-all; }
</style></head>
<body>
<div class="card">
  <div class="header"><h1>Your creation is live on RRG</h1></div>
  <div class="body">
    <p>Your submission <strong style="color:#e5e5e5">"${escHtml(title)}"</strong> has been approved and is now live.</p>
    <div class="meta">
      <div class="meta-row"><span class="meta-label">Price:</span><span class="meta-value">${priceUsdc.toFixed(2)} USDC</span></div>
      <div class="meta-row"><span class="meta-label">Edition:</span><span class="meta-value">${editionSize} pieces</span></div>
      <div class="meta-row"><span class="meta-label">Your share:</span><span class="meta-value">70% per sale</span></div>
      <div class="meta-row"><span class="meta-label">Revenue wallet:</span><span class="wallet">${creatorWallet}</span></div>
    </div>
    <p>Sales revenue (70%) is sent automatically to your wallet with no further steps from you.</p>
    <p>Share the link below — every sale goes straight to your wallet.</p>
    <a class="btn" href="${dropUrl}">View your drop →</a>
  </div>
  <div class="footer"><a href="${SITE_URL}/rrg" style="color:#e5e5e5; text-decoration:none">Browse all drops</a></div>
</div>
</body>
</html>`;

  await sendEmail({
    to,
    subject: `Your creation is live on RRG — "${title}"`,
    html,
  });
}

// ── 2. File delivery ───────────────────────────────────────────────────

export async function sendFileDeliveryEmail({
  to,
  title,
  tokenId,
  txHash,
  downloadUrl,
  ipfsMetadataUrl,
}: {
  to: string;
  title: string;
  tokenId: number;
  txHash: string;
  downloadUrl: string;
  ipfsMetadataUrl?: string | null;
}): Promise<void> {
  const scanBase    = 'https://basescan.org';
  const dropUrl     = `${SITE_URL}/rrg/drop/${tokenId}`;
  const basescanUrl = `${scanBase}/tx/${txHash}`;
  const shortTx     = txHash; // full hash so the link is unambiguous

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; margin: 0; padding: 40px 20px; }
  .card { max-width: 520px; margin: 0 auto; background: #111; border: 1px solid #222; border-radius: 12px; overflow: hidden; }
  .header { background: #7c3aed; padding: 24px 28px; }
  .header h1 { margin: 0; font-size: 20px; color: #fff; font-weight: 700; }
  .body { padding: 28px; }
  .body p { margin: 0 0 16px; line-height: 1.6; color: #ccc; font-size: 14px; }
  .btn { display: inline-block; background: #d4ff22; color: #0a0a0a; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; margin: 8px 0; }
  .tx { font-family: monospace; font-size: 12px; color: #7c3aed; }
  .note { font-size: 12px; color: #555; margin-top: 12px; }
  .footer { padding: 20px 28px; border-top: 1px solid #1a1a1a; font-size: 12px; color: #555; }
</style></head>
<body>
<div class="card">
  <div class="header"><h1>Your RRG drop is ready</h1></div>
  <div class="body">
    <p>Thanks for purchasing <strong style="color:#e5e5e5">"${escHtml(title)}"</strong>. Your files are ready to download.</p>
    <p><a class="btn" href="${downloadUrl}">Download your files →</a></p>
    <p class="note">⚠️ This link expires in 24 hours. Download and save your files now.</p>
    <p>On-chain receipt: <a href="${basescanUrl}" class="tx">${shortTx}</a></p>
    <p><a href="${dropUrl}" style="color:#7c3aed; text-decoration:none; font-size:13px">View drop page →</a></p>
    ${ipfsMetadataUrl ? `<p><a href="${ipfsMetadataUrl}" style="color:#7c3aed; text-decoration:none; font-size:13px">View metadata on IPFS →</a></p>` : ''}
  </div>
  <div class="footer"><a href="${SITE_URL}/rrg" style="color:#e5e5e5; text-decoration:none">Browse all drops</a></div>
</div>
</body>
</html>`;

  await sendEmail({
    to,
    subject: `Your RRG drop is ready — "${title}"`,
    html,
  });
}

// ── 3. Rejection notification ─────────────────────────────────────────

export async function sendRejectionNotification({
  to,
  title,
  reason,
}: {
  to: string;
  title: string;
  reason?: string | null;
}): Promise<void> {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; margin: 0; padding: 40px 20px; }
  .card { max-width: 520px; margin: 0 auto; background: #111; border: 1px solid #222; border-radius: 12px; overflow: hidden; }
  .header { background: #555; padding: 24px 28px; }
  .header h1 { margin: 0; font-size: 20px; color: #fff; font-weight: 700; }
  .body { padding: 28px; }
  .body p { margin: 0 0 16px; line-height: 1.6; color: #ccc; font-size: 14px; }
  .reason { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 16px; margin: 20px 0; }
  .reason-label { color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .reason-text { color: #e5e5e5; font-size: 14px; line-height: 1.6; }
  .btn { display: inline-block; background: #d4ff22; color: #0a0a0a; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; margin-top: 8px; }
  .footer { padding: 20px 28px; border-top: 1px solid #1a1a1a; font-size: 12px; color: #555; }
</style></head>
<body>
<div class="card">
  <div class="header"><h1>Update on your submission</h1></div>
  <div class="body">
    <p>Thanks for submitting <strong style="color:#e5e5e5">"${escHtml(title)}"</strong> to RRG.</p>
    <p>After review, we weren't able to accept this submission for our current collection.</p>
    ${reason ? `
    <div class="reason">
      <div class="reason-label">Feedback</div>
      <div class="reason-text">${escHtml(reason)}</div>
    </div>` : ''}
    <p>We encourage you to refine and resubmit — we'd love to see more of your work.</p>
    <a class="btn" href="${SITE_URL}/rrg/submit">Submit again →</a>
  </div>
  <div class="footer"><a href="${SITE_URL}/rrg" style="color:#e5e5e5; text-decoration:none">Browse all drops</a></div>
</div>
</body>
</html>`;

  await sendEmail({
    to,
    subject: `Update on your RRG submission — "${title}"`,
    html,
  });
}

// ── HTML escape helper ─────────────────────────────────────────────────
function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
