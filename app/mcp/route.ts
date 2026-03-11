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
import { db, getApprovedDrops, getCurrentBrief, getDropByTokenId } from '@/lib/rrg/db';
import { uploadSubmissionFile, jpegStoragePath, getSignedUrl } from '@/lib/rrg/storage';
import { buildPermitPayload, splitSignature } from '@/lib/rrg/permit';
import { getRRGContract, getRRGReadOnly, toUsdc6dp } from '@/lib/rrg/contract';
import { randomUUID, randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

// ── Shared server factory ─────────────────────────────────────────────────────
// Each request gets a fresh stateless server (no shared in-memory state).

function createDrHobbsServer() {
  const server = new McpServer({
    name: 'DrHobbs',
    version: '1.0.0',
  });

  // ── Tool: list_drops ──────────────────────────────────────────────────────
  server.tool(
    'list_drops',
    'List all active RRG NFT drops available for purchase. Returns title, price in USDC, edition size, and remaining supply.',
    {},
    async () => {
      const drops = await getApprovedDrops();

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
    'Get the current RRG design brief — the active creative challenge that creators are invited to respond to with artwork submissions.',
    {},
    async () => {
      const brief = await getCurrentBrief();
      if (!brief) {
        return {
          content: [{ type: 'text', text: 'No active design brief at this time.' }],
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
      'The creator wallet receives 70% of all sales in USDC.',
      '',
      'Provide the image as EITHER:',
      '  image_base64 — base64-encoded JPEG, or data URI (data:image/jpeg;base64,...). Preferred for generated images.',
      '  image_url    — publicly accessible JPEG URL (max 5 MB). Use if the image is already hosted.',
      '',
      'Required: title (≤60 chars), creator_wallet (0x Base address).',
      'Optional: description (≤280 chars), creator_email, suggested_edition (e.g. "10"), suggested_price_usdc (e.g. "15").',
    ].join('\n'),
    {
      title:                z.string().max(60).describe('Artwork title (max 60 characters)'),
      creator_wallet:       z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Base wallet address — receives 70% of sales'),
      image_base64:         z.string().optional().describe('Base64-encoded JPEG, or data URI (data:image/jpeg;base64,...). Preferred for AI-generated images — no external hosting needed.'),
      image_url:            z.string().url().optional().describe('Publicly accessible JPEG URL (max 5 MB). Use if image is already hosted.'),
      description:          z.string().max(280).optional().describe('Optional description (max 280 characters)'),
      creator_email:        z.string().email().optional().describe('Optional email for approval notification'),
      suggested_edition:    z.string().optional().describe('Suggested edition size e.g. "10" — reviewer can adjust'),
      suggested_price_usdc: z.string().optional().describe('Suggested price in USDC e.g. "15" — reviewer can adjust'),
    },
    async ({ title, image_url, image_base64, creator_wallet, description, creator_email, suggested_edition, suggested_price_usdc }) => {
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

      // Insert DB record
      const { data, error } = await db
        .from('rrg_submissions')
        .insert({
          id:                 submissionId,
          creator_wallet:     creator_wallet.trim().toLowerCase(),
          creator_email:      creator_email?.trim() || null,
          title:              title.trim(),
          description:        fullDescription,
          submission_channel: 'agent',
          status:             'pending',
          jpeg_storage_path:  jpegPath,
          jpeg_filename:      filename,
          jpeg_size_bytes:    imageBuffer.length,
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
        })
        .select()
        .single();

      if (dbError) throw dbError;

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
