/**
 * DrHobbs MCP Server — /mcp
 *
 * Streamable HTTP transport (stateless) for use by AI agents.
 * Exposes RRG tools: list_drops, get_current_brief, submit_design,
 * initiate_purchase, get_download_links.
 *
 * Connect with: POST https://realrealgenuine.com/mcp
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import {
  db, getApprovedDrops, getCurrentBrief, getDropByTokenId,
  getAllActiveBrands, getBrandBySlug, getBrandById, getOpenBriefs,
  getBrandSalesStats, RRG_BRAND_ID,
} from '@/lib/rrg/db';
import { uploadSubmissionFile, jpegStoragePath, getSignedUrl } from '@/lib/rrg/storage';
import { buildPermitPayload, splitSignature } from '@/lib/rrg/permit';
import { getRRGContract, getRRGReadOnly, toUsdc6dp } from '@/lib/rrg/contract';
import { calculateSplit } from '@/lib/rrg/splits';
import { insertDistributionAndPay } from '@/lib/rrg/auto-payout';
import { randomUUID, randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

// ── Shared server factory ─────────────────────────────────────────────────────
// Each request gets a fresh stateless server (no shared in-memory state).

function createDrHobbsServer() {
  const server = new McpServer(
    {
      name: 'RRG — Real Real Genuine',
      version: '1.0.0',
    },
    {
      instructions: [
        'RRG (Real Real Genuine) is a multi-brand creative platform where AI agents and humans submit original digital artwork.',
        'Approved designs become ERC-1155 NFT drops on Base, purchasable with USDC (gasless for buyers).',
        '',
        '## Brands',
        'RRG hosts multiple brands, each with their own identity and creative briefs.',
        'Call list_brands to see all active brands. Call get_brand with a slug for full details.',
        '',
        '## Submission Workflow',
        '1. Call list_briefs to see current creative challenges across all brands.',
        '2. Choose a brief that matches your creative direction. Note the brief id and brand context.',
        '3. Generate or source a JPEG image that responds to the brief.',
        '4. Call submit_design with:',
        '   - title (≤60 chars), creator_wallet (your 0x address on Base)',
        '   - image_base64 (preferred for generated images) or image_url',
        '   - brief_id (IMPORTANT — always include this to associate your submission with the correct brand)',
        '   - description, suggested_edition, suggested_price_usdc (optional but recommended)',
        '5. Submissions are reviewed by brand admins. If approved, the design becomes a purchasable NFT drop.',
        '',
        '## Purchase Workflow',
        '1. Call list_drops to browse available NFT drops. Optionally filter by brand_slug.',
        '2. Call initiate_purchase with the tokenId and buyerWallet. This returns an EIP-712 permit payload.',
        '3. Sign the permit with your wallet using signTypedData (EIP-712).',
        '4. Call confirm_purchase with the tokenId, buyerWallet, deadline, and signature.',
        '   The platform mints the NFT on-chain (gasless) and returns a download link.',
        '   The buyer needs USDC on Base. No ETH required.',
        '',
        '## Key Rules',
        '- Always include brief_id when submitting — this links your work to the correct brand.',
        '- Images must be JPEG format, under 5 MB.',
        '- Permits expire in 10 minutes — complete the purchase flow promptly.',
        '- All transactions happen on Base mainnet using USDC.',
      ].join('\n'),
    },
  );

  // ── Tool: list_drops ──────────────────────────────────────────────────────
  server.tool(
    'list_drops',
    'List all active RRG NFT drops available for purchase. Optionally filter by brand. Returns title, price in USDC, edition size, and remaining supply.',
    {
      brand_slug: z.string().optional().describe('Optional brand slug to filter drops by a specific brand'),
    },
    async ({ brand_slug }) => {
      let brandId: string | undefined;
      if (brand_slug) {
        const brand = await getBrandBySlug(brand_slug);
        if (!brand) {
          return { isError: true, content: [{ type: 'text', text: `Brand "${brand_slug}" not found` }] };
        }
        brandId = brand.id;
      }
      const drops = await getApprovedDrops(brandId);

      // Enrich with on-chain minted count where possible
      const enriched = await Promise.all(
        drops.map(async (drop) => {
          let remaining: number | null = null;
          if (drop.token_id) {
            try {
              const contract = getRRGReadOnly();
              const data = await contract.getDrop(drop.token_id);
              remaining = Number(data.maxSupply) - Number(data.minted);
              if (!data.active) return null; // skip inactive
            } catch {
              remaining = drop.edition_size ?? null;
            }
          }
          return {
            tokenId:     drop.token_id,
            title:       drop.title,
            description: drop.description,
            priceUsdc:   drop.price_usdc,
            editionSize: drop.edition_size,
            remaining,
            ipfsUrl:     drop.ipfs_url,
            brandId:     drop.brand_id ?? RRG_BRAND_ID,
          };
        })
      );

      const active = enriched.filter(Boolean);

      if (active.length === 0) {
        return {
          content: [{ type: 'text', text: 'No active drops are currently available.' }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(active, null, 2),
        }],
      };
    }
  );

  // ── Tool: get_current_brief ───────────────────────────────────────────────
  server.tool(
    'get_current_brief',
    'Get the current design brief — the active creative challenge. Optionally filter by brand slug to get a specific brand\'s brief.',
    {
      brand_slug: z.string().optional().describe('Optional brand slug to get that brand\'s current brief instead of the default RRG brief'),
    },
    async ({ brand_slug }) => {
      let brandId: string | undefined;
      if (brand_slug) {
        const brand = await getBrandBySlug(brand_slug);
        if (!brand) {
          return { isError: true, content: [{ type: 'text', text: `Brand "${brand_slug}" not found` }] };
        }
        brandId = brand.id;
      }
      const brief = await getCurrentBrief(brandId);
      if (!brief) {
        return {
          content: [{ type: 'text', text: brand_slug ? `No active brief for brand "${brand_slug}".` : 'No active design brief at this time.' }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            id:          brief.id,
            title:       brief.title,
            description: brief.description,
            startsAt:    brief.starts_at,
            endsAt:      brief.ends_at,
            brandId:     brief.brand_id ?? RRG_BRAND_ID,
          }, null, 2),
        }],
      };
    }
  );

  // ── JPEG magic-byte check ─────────────────────────────────────────────────
  const isJpegBuffer = (buf: Buffer) =>
    buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;

  // ── Tool: submit_design ───────────────────────────────────────────────────
  server.tool(
    'submit_design',
    [
      'Submit an original digital artwork to RRG for review.',
      'If approved, the design becomes an ERC-1155 NFT drop on Base.',
      '',
      'Provide the image as EITHER:',
      '  image_base64 — base64-encoded JPEG, or data URI (data:image/jpeg;base64,...). Preferred for generated images.',
      '  image_url    — publicly accessible JPEG URL (max 5 MB). Use if the image is already hosted.',
      '',
      'Required: title (≤60 chars), creator_wallet (0x Base address).',
      'Optional: description (≤280 chars), creator_email, suggested_edition, suggested_price_usdc.',
      'Optional: brief_id — target a specific brand challenge (from list_briefs). Submission will be associated with that brand.',
    ].join('\n'),
    {
      title:                z.string().max(60).describe('Artwork title (max 60 characters)'),
      creator_wallet:       z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Base wallet address — receives sales revenue'),
      image_base64:         z.string().optional().describe('Base64-encoded JPEG, or data URI (data:image/jpeg;base64,...). Preferred for AI-generated images — no external hosting needed.'),
      image_url:            z.string().url().optional().describe('Publicly accessible JPEG URL (max 5 MB). Use if image is already hosted.'),
      description:          z.string().max(280).optional().describe('Optional description (max 280 characters)'),
      creator_email:        z.string().email().optional().describe('Optional email for approval notification'),
      suggested_edition:    z.string().optional().describe('Suggested edition size e.g. "10" — reviewer can adjust'),
      suggested_price_usdc: z.string().optional().describe('Suggested price in USDC e.g. "15" — reviewer can adjust'),
      brief_id:             z.string().optional().describe('Target a specific brand challenge by brief ID (from list_briefs)'),
    },
    async ({ title, image_url, image_base64, creator_wallet, description, creator_email, suggested_edition, suggested_price_usdc, brief_id }) => {
      if (!image_base64 && !image_url) {
        return { isError: true, content: [{ type: 'text', text: 'Provide either image_base64 or image_url' }] };
      }

      // Resolve image buffer
      let imageBuffer: Buffer;

      if (image_base64) {
        // Strip data URI prefix if present
        const raw = image_base64.replace(/^data:image\/[a-z]+;base64,/i, '');
        try {
          imageBuffer = Buffer.from(raw, 'base64');
        } catch {
          return { isError: true, content: [{ type: 'text', text: 'image_base64 is not valid base64' }] };
        }
        if (!isJpegBuffer(imageBuffer)) {
          return { isError: true, content: [{ type: 'text', text: 'image_base64 does not appear to be a JPEG (wrong magic bytes). Ensure the image is JPEG-encoded.' }] };
        }
      } else {
        // Fetch from URL
        try {
          const imageResp = await fetch(image_url!, {
            signal: AbortSignal.timeout(30_000),
            headers: { 'User-Agent': 'DrHobbs-RRG/1.0' },
          });
          if (!imageResp.ok) {
            return { isError: true, content: [{ type: 'text', text: `Could not fetch image (HTTP ${imageResp.status})` }] };
          }
          const detectedContentType = imageResp.headers.get('content-type') || '';
          imageBuffer = Buffer.from(await imageResp.arrayBuffer());
          const isJpeg =
            detectedContentType.includes('jpeg') ||
            detectedContentType.includes('jpg') ||
            /\.(jpg|jpeg)(\?|$)/i.test(image_url!) ||
            isJpegBuffer(imageBuffer);
          if (!isJpeg) {
            return { isError: true, content: [{ type: 'text', text: `Image must be a JPEG (detected: ${detectedContentType})` }] };
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { isError: true, content: [{ type: 'text', text: `Failed to fetch image: ${msg}` }] };
        }
      }

      if (imageBuffer.length > 5 * 1024 * 1024) {
        return { isError: true, content: [{ type: 'text', text: `Image is ${(imageBuffer.length / 1024 / 1024).toFixed(1)} MB — must be under 5 MB` }] };
      }

      // Build description with suggestion tag
      const rawDesc      = (description || '').trim().slice(0, 280);
      const suggestionTag =
        suggested_edition || suggested_price_usdc
          ? `[Suggested: ${suggested_edition || '?'} ed · $${suggested_price_usdc || '?'} USDC]`
          : '';
      const fullDescription = rawDesc
        ? suggestionTag ? `${rawDesc}\n${suggestionTag}` : rawDesc
        : suggestionTag || null;

      // Upload to Supabase Storage
      const submissionId = randomUUID();
      const filename     = `agent-${Date.now()}.jpg`;
      const jpegPath     = jpegStoragePath(submissionId, filename);
      await uploadSubmissionFile(jpegPath, imageBuffer, 'image/jpeg');

      // Resolve brand_id from brief_id or current brief
      let resolvedBriefId: string | null = brief_id?.trim() || null;
      let resolvedBrandId: string = RRG_BRAND_ID;

      if (resolvedBriefId) {
        const { data: briefRow } = await db
          .from('rrg_briefs')
          .select('brand_id')
          .eq('id', resolvedBriefId)
          .single();
        resolvedBrandId = briefRow?.brand_id ?? RRG_BRAND_ID;
      } else {
        const currentBrief = await getCurrentBrief();
        resolvedBriefId = currentBrief?.id ?? null;
        resolvedBrandId = currentBrief?.brand_id ?? RRG_BRAND_ID;
      }

      // Insert DB record
      const { data, error } = await db
        .from('rrg_submissions')
        .insert({
          id:                 submissionId,
          brief_id:           resolvedBriefId,
          creator_wallet:     creator_wallet.trim().toLowerCase(),
          creator_email:      creator_email?.trim() || null,
          title:              title.trim(),
          description:        fullDescription,
          submission_channel: 'agent',
          status:             'pending',
          jpeg_storage_path:  jpegPath,
          jpeg_filename:      filename,
          jpeg_size_bytes:    imageBuffer.length,
          brand_id:           resolvedBrandId,
          creator_type:       'agent' as const,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success:      true,
            submissionId: data.id,
            message:
              'Design submitted successfully. Submissions are reviewed manually. ' +
              'If approved, your design will be listed as an NFT drop at https://realrealgenuine.com/rrg. ' +
              (creator_email ? 'You will be notified by email on approval.' : ''),
          }, null, 2),
        }],
      };
    }
  );

  // ── Tool: initiate_purchase ───────────────────────────────────────────────
  server.tool(
    'initiate_purchase',
    [
      'Start a purchase flow for an RRG NFT drop. Returns a permit payload for the buyer to sign with EIP-712.',
      'After signing, call confirm_purchase with the signature.',
      'The permit expires in 10 minutes — complete steps without delay.',
      'The buyer needs USDC on Base. No ETH required — purchase is gasless.',
    ].join('\n'),
    {
      tokenId: z.number().int().positive().describe('Token ID of the drop to purchase'),
      buyerWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Buyer 0x wallet address on Base'),
    },
    async ({ tokenId, buyerWallet }) => {
      const drop = await getDropByTokenId(tokenId);
      if (!drop) {
        return { isError: true, content: [{ type: 'text', text: 'Drop not found' }] };
      }
      if (!drop.price_usdc) {
        return { isError: true, content: [{ type: 'text', text: 'Drop price not set' }] };
      }

      const priceUsdc    = parseFloat(drop.price_usdc);
      const priceUsdc6dp = toUsdc6dp(priceUsdc);

      const permitPayload = await buildPermitPayload(
        buyerWallet,
        tokenId,
        priceUsdc6dp,
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            permitPayload,
            drop: {
              tokenId:     drop.token_id,
              title:       drop.title,
              priceUsdc,
              editionSize: drop.edition_size,
            },
            instructions:
              'Sign permitPayload using wallet.signTypedData(domain, types, value), ' +
              'then call confirm_purchase with tokenId, buyerWallet, deadline, and the signature.',
          }, null, 2),
        }],
      };
    }
  );

  // ── Tool: confirm_purchase ────────────────────────────────────────────────
  server.tool(
    'confirm_purchase',
    [
      'Complete a purchase by submitting the signed EIP-712 permit.',
      'Mints the ERC-1155 NFT on-chain (gasless — platform covers gas), then returns a download link.',
      'The platform wallet signs and submits the mintWithPermit transaction.',
    ].join('\n'),
    {
      tokenId:     z.number().int().positive().describe('Token ID of the drop'),
      buyerWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Buyer 0x wallet address'),
      buyerEmail:  z.string().email().optional().describe('Optional email for file delivery'),
      deadline:    z.string().describe('Permit deadline (Unix timestamp string from initiate_purchase)'),
      signature:   z.string().regex(/^0x/).describe('EIP-712 signature from wallet.signTypedData'),
    },
    async ({ tokenId, buyerWallet, buyerEmail, deadline, signature }) => {
      const drop = await getDropByTokenId(tokenId);
      if (!drop) {
        return { isError: true, content: [{ type: 'text', text: 'Drop not found' }] };
      }

      const { v, r, s } = splitSignature(signature);
      const contract    = getRRGContract();

      let txHash: string;
      try {
        const tx      = await contract.mintWithPermit(tokenId, buyerWallet, BigInt(deadline), v, r, s);
        const receipt = await tx.wait(1);
        txHash        = receipt.hash;
      } catch (contractErr: unknown) {
        const msg = String(contractErr);
        if (msg.includes('sold out'))   return { isError: true, content: [{ type: 'text', text: 'This drop is sold out.' }] };
        if (msg.includes('not active')) return { isError: true, content: [{ type: 'text', text: 'This drop is not active.' }] };
        if (msg.includes('permit'))     return { isError: true, content: [{ type: 'text', text: 'Permit signature invalid or expired.' }] };
        throw contractErr;
      }

      const downloadToken  = randomBytes(32).toString('hex');
      const downloadExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data: purchase, error: dbError } = await db
        .from('rrg_purchases')
        .insert({
          submission_id:       drop.id,
          token_id:            tokenId,
          buyer_wallet:        buyerWallet.toLowerCase(),
          buyer_email:         buyerEmail || null,
          buyer_type:          'agent',
          tx_hash:             txHash,
          amount_usdc:         drop.price_usdc,
          download_token:      downloadToken,
          download_expires_at: downloadExpiry,
          brand_id:            drop.brand_id ?? RRG_BRAND_ID,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Record distribution + auto-payout (non-fatal)
      try {
        const brandId = drop.brand_id ?? RRG_BRAND_ID;
        const brand   = brandId !== RRG_BRAND_ID ? await getBrandById(brandId) : null;
        const split   = calculateSplit({
          totalUsdc:      parseFloat(drop.price_usdc ?? '0'),
          brandId,
          creatorWallet:  drop.creator_wallet,
          brandWallet:    brand?.wallet_address ?? null,
          isBrandProduct: drop.is_brand_product ?? false,
          isLegacy:       false,
        });
        await insertDistributionAndPay({
          purchaseId: purchase.id,
          brandId,
          split,
        });
      } catch (distErr) {
        console.error('[confirm_purchase] distribution/payout failed:', distErr);
      }

      const siteUrl     = process.env.NEXT_PUBLIC_SITE_URL!;
      const downloadUrl = `${siteUrl}/rrg/download?token=${downloadToken}`;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success:       true,
            txHash,
            tokenId,
            downloadUrl,
            downloadToken,
            message:       'NFT minted. Use downloadUrl to access your files (valid 24 hours).',
          }, null, 2),
        }],
      };
    }
  );

  // ── Tool: get_download_links ──────────────────────────────────────────────
  server.tool(
    'get_download_links',
    'Retrieve signed download URLs for a previously purchased RRG drop. Useful if you have lost the original download link.',
    {
      buyerWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Buyer wallet used at purchase'),
      tokenId:     z.number().int().positive().describe('Token ID of the purchased drop'),
    },
    async ({ buyerWallet, tokenId }) => {
      const { data: purchase } = await db
        .from('rrg_purchases')
        .select('*')
        .eq('buyer_wallet', buyerWallet.toLowerCase())
        .eq('token_id', tokenId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!purchase) {
        return { isError: true, content: [{ type: 'text', text: 'No purchase found for this wallet and tokenId.' }] };
      }

      const drop = await getDropByTokenId(tokenId);
      if (!drop) {
        return { isError: true, content: [{ type: 'text', text: 'Drop not found.' }] };
      }

      const paths = [drop.jpeg_storage_path, drop.additional_files_path].filter(Boolean) as string[];
      const urls  = await Promise.all(paths.map(p => getSignedUrl(p)));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ files: urls, txHash: purchase.tx_hash }, null, 2),
        }],
      };
    }
  );

  // ── Tool: list_brands ────────────────────────────────────────────────────
  server.tool(
    'list_brands',
    'List all active brands on the RRG platform. Returns name, slug, headline, description, website, and product/brief counts.',
    {},
    async () => {
      const brands = await getAllActiveBrands();

      const enriched = await Promise.all(
        brands.map(async (brand) => {
          // Count open briefs for this brand
          const { data: briefCount } = await db
            .from('rrg_briefs')
            .select('id', { count: 'exact', head: true })
            .eq('brand_id', brand.id)
            .eq('is_current', true);

          // Count approved drops for this brand
          const { data: dropCount } = await db
            .from('rrg_submissions')
            .select('id', { count: 'exact', head: true })
            .eq('brand_id', brand.id)
            .eq('status', 'approved');

          return {
            name:           brand.name,
            slug:           brand.slug,
            headline:       brand.headline,
            description:    brand.description,
            websiteUrl:     brand.website_url,
            openBriefs:     briefCount?.length ?? 0,
            productCount:   dropCount?.length ?? 0,
          };
        })
      );

      if (enriched.length === 0) {
        return { content: [{ type: 'text', text: 'No active brands on the platform.' }] };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(enriched, null, 2) }],
      };
    }
  );

  // ── Tool: list_briefs ───────────────────────────────────────────────────
  server.tool(
    'list_briefs',
    'List active, current design briefs (creative challenges) across brands. Optionally filter by brand slug. Returns brand name and description with each brief.',
    {
      brand_slug: z.string().optional().describe('Optional brand slug to filter briefs by a specific brand'),
    },
    async ({ brand_slug }) => {
      let brandId: string | undefined;
      if (brand_slug) {
        const brand = await getBrandBySlug(brand_slug);
        if (!brand) {
          return { isError: true, content: [{ type: 'text', text: `Brand "${brand_slug}" not found` }] };
        }
        brandId = brand.id;
      }

      const allBriefs = await getOpenBriefs(brandId);

      // Only return active + current briefs
      const briefs = allBriefs.filter((b) => b.is_current && b.status === 'active');

      if (briefs.length === 0) {
        return { content: [{ type: 'text', text: brand_slug ? `No current briefs for "${brand_slug}".` : 'No current briefs at this time.' }] };
      }

      // Enrich with brand name and description
      const enriched = await Promise.all(
        briefs.map(async (b) => {
          const brand = b.brand_id ? await getBrandById(b.brand_id) : null;
          return {
            id:               b.id,
            title:            b.title,
            description:      b.description,
            startsAt:         b.starts_at,
            endsAt:           b.ends_at,
            brandName:        brand?.name ?? 'RRG',
            brandDescription: brand?.description ?? null,
            brandId:          b.brand_id ?? RRG_BRAND_ID,
          };
        })
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(enriched, null, 2) }],
      };
    }
  );

  // ── Tool: get_brand ─────────────────────────────────────────────────────
  server.tool(
    'get_brand',
    'Get full details for a brand including its profile, open briefs, and purchasable drops.',
    {
      brand_slug: z.string().describe('Brand slug (e.g. "rrg", "my-brand")'),
    },
    async ({ brand_slug }) => {
      const brand = await getBrandBySlug(brand_slug);
      if (!brand) {
        return { isError: true, content: [{ type: 'text', text: `Brand "${brand_slug}" not found` }] };
      }

      const [briefs, drops, stats] = await Promise.all([
        getOpenBriefs(brand.id),
        getApprovedDrops(brand.id),
        getBrandSalesStats(brand.id),
      ]);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            brand: {
              name:        brand.name,
              slug:        brand.slug,
              headline:    brand.headline,
              description: brand.description,
              websiteUrl:  brand.website_url,
            },
            openBriefs: briefs.map(b => ({
              id:          b.id,
              title:       b.title,
              description: b.description,
              startsAt:    b.starts_at,
              endsAt:      b.ends_at,
            })),
            drops: drops.map(d => ({
              tokenId:     d.token_id,
              title:       d.title,
              priceUsdc:   d.price_usdc,
              editionSize: d.edition_size,
            })),
            stats,
          }, null, 2),
        }],
      };
    }
  );

  // ── Tool: register_brand ────────────────────────────────────────────────
  server.tool(
    'register_brand',
    [
      'Register a new brand on the RRG platform.',
      'Your brand will be created with "pending" status and will go live after admin approval.',
      'Once approved, your brand gets its own storefront, you can create briefs for creators,',
      'and list up to 10 products for sale. Revenue is paid to your wallet in USDC on Base.',
    ].join(' '),
    {
      name:          z.string().min(2).max(60).describe('Brand name (2-60 characters)'),
      headline:      z.string().min(5).max(120).describe('Short brand tagline (5-120 characters)'),
      description:   z.string().min(20).max(2000).describe('Full brand description — who you are, what you create, your creative vision (20-2000 characters)'),
      contact_email: z.string().email().describe('Contact email for the brand'),
      wallet_address: z.string().describe('Base wallet address (0x...) for receiving USDC revenue'),
      website_url:   z.string().url().optional().describe('Brand website URL'),
      social_links:  z.record(z.string()).optional().describe('Social links object, e.g. {"twitter":"https://x.com/mybrand","instagram":"https://instagram.com/mybrand"}'),
    },
    async ({ name, headline, description, contact_email, wallet_address, website_url, social_links }) => {
      // Validate wallet
      const { ethers } = await import('ethers');
      if (!ethers.isAddress(wallet_address)) {
        return { isError: true, content: [{ type: 'text' as const, text: 'Invalid wallet address. Must be a valid Ethereum/Base address (0x...).' }] };
      }
      const walletLower = wallet_address.toLowerCase();

      // Generate slug from name
      let slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);

      // Check slug uniqueness
      const { data: existingSlug } = await db
        .from('rrg_brands')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (existingSlug) {
        slug = `${slug}-${randomBytes(3).toString('hex')}`;
      }

      // Rate limit: one pending brand per wallet
      const { data: pendingBrand } = await db
        .from('rrg_brands')
        .select('id, name')
        .eq('wallet_address', walletLower)
        .eq('status', 'pending')
        .maybeSingle();
      if (pendingBrand) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `You already have a pending brand registration: "${pendingBrand.name}". Please wait for admin approval before registering another.` }],
        };
      }

      // Insert brand
      const { data: brand, error } = await db
        .from('rrg_brands')
        .insert({
          name,
          slug,
          headline,
          description,
          contact_email,
          wallet_address: walletLower,
          website_url:    website_url ?? null,
          social_links:   social_links ?? {},
          status:         'pending',
          max_self_listings: 10,
          self_listings_used: 0,
        })
        .select('id, slug')
        .single();

      if (error || !brand) {
        console.error('[MCP register_brand]', error);
        return { isError: true, content: [{ type: 'text' as const, text: 'Failed to register brand. Please try again.' }] };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status:  'pending',
            message: `Brand "${name}" registered successfully! Your brand is pending admin approval. Once approved, it will appear on the RRG platform and you can start creating briefs and listing products.`,
            brandId: brand.id,
            slug:    brand.slug,
            storefront: `https://realrealgenuine.com/brand/${brand.slug}`,
          }, null, 2),
        }],
      };
    }
  );

  return server;
}

// ── Request handler ───────────────────────────────────────────────────────────

async function handleMcpRequest(req: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — safe for serverless
  });

  const server = createDrHobbsServer();
  await server.connect(transport);
  return transport.handleRequest(req);
}

export async function POST(req: Request) { return handleMcpRequest(req); }
export async function GET(req: Request)  { return handleMcpRequest(req); }
export async function DELETE(req: Request) { return handleMcpRequest(req); }
