import { NextRequest, NextResponse } from 'next/server';
import { requireBrandAuth } from '@/lib/rrg/brand-auth';
import { db, claimNextTokenId, getBrandById, getCurrentNetwork, RRG_BRAND_ID } from '@/lib/rrg/db';
import { getRRGContract, toUsdc6dp } from '@/lib/rrg/contract';
import { uploadSubmissionFile, jpegStoragePath } from '@/lib/rrg/storage';
import { calculateSplit } from '@/lib/rrg/splits';
import { autopostApproval } from '@/lib/rrg/autopost';
import { getSignedUrl } from '@/lib/rrg/storage';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

// ── Image format detection from magic bytes ─────────────────────────
function isJpegBuffer(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
}
function isPngBuffer(buf: Buffer): boolean {
  return buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
}
function detectImageFormat(buf: Buffer): { ext: 'jpg' | 'png'; mimeType: string } | null {
  if (isJpegBuffer(buf)) return { ext: 'jpg', mimeType: 'image/jpeg' };
  if (isPngBuffer(buf))  return { ext: 'png', mimeType: 'image/png' };
  return null;
}

// POST /api/brand/[brandId]/products/create — brand self-lists a product
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    // Get the brand
    const brand = await getBrandById(brandId);
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }
    if (brand.status !== 'active') {
      return NextResponse.json({ error: 'Brand is not active' }, { status: 403 });
    }

    // Check self-listing cap
    if (brand.self_listings_used >= brand.max_self_listings) {
      return NextResponse.json({
        error: `Self-listing cap reached (${brand.max_self_listings}). Contact RRG to increase.`
      }, { status: 403 });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const title         = formData.get('title') as string;
    const description   = formData.get('description') as string | null;
    const priceStr      = formData.get('price_usdc') as string;
    const editionStr    = formData.get('edition_size') as string;
    const contactEmail  = formData.get('contact_email') as string | null;
    const jpeg          = formData.get('jpeg') as File | null;

    // Validate required fields
    if (!title || title.trim().length > 60) {
      return NextResponse.json({ error: 'title is required (max 60 chars)' }, { status: 400 });
    }

    const priceUsdc   = parseFloat(priceStr);
    const editionSize = parseInt(editionStr, 10);

    if (!priceUsdc || priceUsdc < 0.5 || priceUsdc > 50) {
      return NextResponse.json({ error: 'price_usdc must be 0.50–50.00' }, { status: 400 });
    }
    if (!editionSize || editionSize < 1 || editionSize > 50) {
      return NextResponse.json({ error: 'edition_size must be 1–50' }, { status: 400 });
    }

    if (!jpeg) {
      return NextResponse.json({ error: 'JPEG or PNG image required' }, { status: 400 });
    }

    // Read and validate image
    const imageBuffer = Buffer.from(await jpeg.arrayBuffer());
    const format = detectImageFormat(imageBuffer);
    if (!format) {
      return NextResponse.json({ error: 'Image must be a JPEG or PNG' }, { status: 400 });
    }
    if (imageBuffer.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be under 5 MB' }, { status: 400 });
    }

    // ── Upload to storage ─────────────────────────────────────────────
    const submissionId = randomUUID();
    const filename     = `brand-${Date.now()}.${format.ext}`;
    const jpegPath     = jpegStoragePath(submissionId, filename);
    await uploadSubmissionFile(jpegPath, imageBuffer, format.mimeType);

    // ── Calculate split ───────────────────────────────────────────────
    const split = calculateSplit({
      totalUsdc:      priceUsdc,
      brandId,
      creatorWallet:  brand.wallet_address,
      brandWallet:    brand.wallet_address,
      isBrandProduct: true,
      isLegacy:       false,
    });

    // ── Claim token ID ────────────────────────────────────────────────
    const tokenId = await claimNextTokenId();

    // ── Register drop on-chain ────────────────────────────────────────
    const contract = getRRGContract();
    const price6dp = toUsdc6dp(priceUsdc);

    const tx = await contract.registerDrop(
      tokenId,
      split.onChainCreator,
      price6dp,
      editionSize,
    );
    const receipt = await tx.wait(1);

    // ── Insert submission record ──────────────────────────────────────
    const { error: insertError } = await db
      .from('rrg_submissions')
      .insert({
        id:                submissionId,
        creator_wallet:    brand.wallet_address.toLowerCase(),
        creator_email:     contactEmail?.trim() || brand.contact_email,
        title:             title.trim(),
        description:       description?.trim().slice(0, 280) || null,
        submission_channel:'brand',
        status:            'approved',
        jpeg_storage_path: jpegPath,
        jpeg_filename:     filename,
        jpeg_size_bytes:   imageBuffer.length,
        brand_id:          brandId,
        creator_type:      'human',
        is_brand_product:  true,
        token_id:          tokenId,
        edition_size:      editionSize,
        price_usdc:        priceUsdc.toFixed(2),
        approved_at:       new Date().toISOString(),
        network:           getCurrentNetwork(),
      });

    if (insertError) throw insertError;

    // ── Increment self_listings_used ──────────────────────────────────
    await db
      .from('rrg_brands')
      .update({ self_listings_used: brand.self_listings_used + 1 })
      .eq('id', brandId);

    // ── Autopost (non-blocking) ──────────────────────────────────────
    getSignedUrl(jpegPath, 300)
      .then((imageUrl) =>
        autopostApproval({
          title:       title.trim(),
          tokenId,
          editionSize,
          priceUsdc:   priceUsdc.toFixed(2),
          description: description?.trim() ?? null,
          creatorBio:  null,
          briefTitle:  null,
          imageUrl,
        })
      )
      .catch((err) => console.error('[brand/products/create] autopost failed:', err));

    return NextResponse.json({
      success: true,
      tokenId,
      txHash:  receipt.hash,
      dropUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/rrg/drop/${tokenId}`,
    }, { status: 201 });

  } catch (err) {
    console.error('[/api/brand/[brandId]/products/create]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
