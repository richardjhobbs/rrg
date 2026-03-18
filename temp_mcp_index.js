// ============================================
// drhobbs Agent — MCP Commerce Server v2.0
// Spec-compliant: MCP + x402 + ERC-8004
// ============================================

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const _dotenv  = _require('dotenv');
_dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import archiver from 'archiver';

import { verifyUSDCPayment, getUSDCBalance, sweepToLedger } from './treasury.js';
import { logToERC8004 } from './erc8004.js';
import { registerRRGResource } from './rrg-info.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// IMAGE / MIME HELPERS
// ============================================
const IMAGE_TYPES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

function getMimeType(type) {
  const mimes = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png',  gif: 'image/gif',
    webp: 'image/webp', pdf: 'application/pdf',
    mp3: 'audio/mpeg', mp4: 'video/mp4',
    md: 'text/markdown', txt: 'text/plain',
    zip: 'application/zip',
  };
  return mimes[type.toLowerCase()] || 'application/octet-stream';
}

// ============================================
// CONFIG — all values from .env
// ============================================
const CONFIG = {
  agentId: process.env.AGENT_ID || '17666',
  agentWallet: process.env.AGENT_WALLET,
  ledgerWallet: process.env.LEDGER_WALLET,
  network: process.env.PAYMENT_NETWORK || 'base-mainnet',
  usdcContract: process.env.USDC_CONTRACT,
  baseRpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  maxAutoApproveUSD: parseFloat(process.env.MAX_AUTO_APPROVE_USD || '1.00'),
  rrgApiUrl:        process.env.RRG_API_URL || 'https://rrg-ruddy.vercel.app',
  rrgPlatformWallet: process.env.RRG_PLATFORM_WALLET || '0xe653804032A2d51Cc031795afC601B9b1fd2c375',
  rrgUsdcContract:  process.env.RRG_USDC_CONTRACT || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  rrgChainId:       parseInt(process.env.RRG_CHAIN_ID || '84532'),
  port: parseInt(process.env.PORT || '3000'),
  publicUrl: process.env.PUBLIC_URL || 'http://89.167.89.219:3000',
  assetsPath: path.resolve(__dirname, process.env.ASSETS_PATH || '../assets'),
  cataloguePath: path.resolve(__dirname, process.env.CATALOGUE_PATH || '../catalogue/catalogue.json'),
  logsPath: path.resolve(__dirname, process.env.LOGS_PATH || '../logs'),
  txLedgerPath: path.resolve(__dirname, process.env.LOGS_PATH || '../logs', 'used_tx_hashes.json'),
};

// Validate required env vars on startup
const required = ['AGENT_WALLET', 'AGENT_PRIVATE_KEY', 'USDC_CONTRACT', 'LEDGER_WALLET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env var: ${key}`);
    process.exit(1);
  }
}


// ============================================
// REPLAY PROTECTION — tx_hash ledger
// ============================================
let usedTxHashes = new Set();

async function loadUsedTxHashes() {
  try {
    const data = await fs.readFile(CONFIG.txLedgerPath, 'utf8');
    usedTxHashes = new Set(JSON.parse(data));
    console.log(`🔒 Replay ledger: ${usedTxHashes.size} used tx hashes loaded`);
  } catch {
    usedTxHashes = new Set(); // first run — file doesn't exist yet
  }
}

async function recordTxHash(txHash) {
  usedTxHashes.add(txHash);
  try {
    await fs.writeFile(CONFIG.txLedgerPath, JSON.stringify([...usedTxHashes], null, 2));
  } catch (err) {
    console.error('Warning: could not persist tx ledger:', err.message);
  }
}

// ============================================
// CATALOGUE HELPERS
// ============================================
async function getCatalogue() {
  try {
    const data = await fs.readFile(CONFIG.cataloguePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function getAsset(id) {
  const catalogue = await getCatalogue();
  return catalogue.find(a => a.id === parseInt(id)) || null;
}

// ============================================
// MCP SERVER SETUP
// ============================================
const server = new McpServer({
  name: 'drhobbs-mcp-server',
  version: '2.0.0',
});

// --- Tool: list_catalogue ---
server.registerTool(
  'list_catalogue',
  {
    title: 'List Available Assets',
    description: `List all digital assets available for purchase from drhobbs Agent (ERC-8004 ID: ${CONFIG.agentId}).

Returns the full catalogue of fashion tech reports, essays, and media available for sale.
Each item includes its ID, title, description, price in USDC, and asset type.

Use this tool first to discover what's available before calling get_payment_info or purchase_asset.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  async () => {
    const catalogue = await getCatalogue();
    await logToERC8004('catalogue_viewed', { viewer: 'mcp-client' }, CONFIG);
    const output = {
      agentId: CONFIG.agentId,
      count: catalogue.length,
      items: catalogue.map(({ id, title, description, price, type, seller }) => ({
        id, title, description, price, type, seller
      }))
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      structuredContent: output
    };
  }
);

// --- Tool: get_payment_info ---
server.registerTool(
  'get_payment_info',
  {
    title: 'Get Payment Information',
    description: `Get x402-compliant payment instructions for a specific asset.

Call this after list_catalogue to get the exact payment details needed to purchase an asset.
Returns the USDC amount, destination wallet, network, and the resource path to call after payment.

Args:
  - asset_id (number): The ID of the asset from list_catalogue`,
    inputSchema: z.object({
      asset_id: z.number().int().positive().describe('Asset ID from list_catalogue')
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  async ({ asset_id }) => {
    const asset = await getAsset(asset_id);
    if (!asset) {
      return {
        content: [{ type: 'text', text: `Error: Asset ${asset_id} not found. Call list_catalogue to see available assets.` }],
        isError: true
      };
    }
    const output = {
      assetId: asset.id,
      title: asset.title,
      amount: asset.price.toFixed(2),
      currency: 'USDC',
      network: CONFIG.network,
      payTo: CONFIG.agentWallet,
      resource: `/api/asset/${asset.type}/${asset.filename}`,
      paymentScheme: 'exact',
      assetAddress: CONFIG.usdcContract,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      structuredContent: output
    };
  }
);

// --- Tool: purchase_asset ---
server.registerTool(
  'purchase_asset',
  {
    title: 'Purchase and Deliver Asset',
    description: `Verify a USDC payment and deliver a purchased asset.

Call this AFTER sending USDC payment on Base mainnet.
Provide the transaction hash — the server will verify it on-chain before delivering content.

Verification checks:
  1. Transaction exists and is confirmed on Base mainnet
  2. Payment sent to correct agent wallet
  3. Amount matches or exceeds asset price
  4. USDC contract address is correct

Delivery format:
  - Text assets (md): returned as text content
  - Image assets (jpg/png): returned as native MCP image content blocks (base64)
    Single image → one image block. Multiple images (e.g. front+back) → multiple image blocks.

Args:
  - asset_id (number): Asset ID from list_catalogue
  - tx_hash (string): Your USDC payment transaction hash (0x + 64 hex chars)`,
    inputSchema: z.object({
      asset_id: z.number().int().positive().describe('Asset ID from list_catalogue'),
      tx_hash: z.string()
        .length(66)
        .regex(/^0x[0-9a-fA-F]{64}$/, 'Must be a valid transaction hash: 0x followed by 64 hex characters')
        .describe('USDC payment transaction hash on Base mainnet')
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  async ({ asset_id, tx_hash }) => {
    const asset = await getAsset(asset_id);
    if (!asset) {
      return {
        content: [{ type: 'text', text: `Error: Asset ${asset_id} not found.` }],
        isError: true
      };
    }

    // Replay protection — reject already-used tx hashes
    if (usedTxHashes.has(tx_hash)) {
      return {
        content: [{ type: 'text', text: 'Payment error: This transaction hash has already been used. Each purchase requires a unique transaction.' }],
        isError: true
      };
    }

    // Verify payment on-chain
    const verified = await verifyUSDCPayment(tx_hash, asset.price, CONFIG.agentWallet, CONFIG);
    if (!verified.success) {
      await logToERC8004('payment_failed', { assetId: asset_id, txHash: tx_hash, reason: verified.error }, CONFIG);
      return {
        content: [{ type: 'text', text: `Payment verification failed: ${verified.error}` }],
        isError: true
      };
    }

    // Mark tx as used — prevents replay regardless of delivery outcome
    await recordTxHash(tx_hash);

    // Deliver asset
    try {
      const isImage = IMAGE_TYPES.has(asset.type.toLowerCase());

      if (isImage) {
        // Resolve file list — use files[] array if present, else derive single filename
        const fileNames = (asset.files && asset.files.length > 0)
          ? asset.files
          : [asset.filename.includes('.') ? asset.filename : `${asset.filename}.${asset.type}`];

        // Read each file as Buffer → base64 MCP image content block
        const imageBlocks = await Promise.all(
          fileNames.map(async (fname) => {
            const buf = await fs.readFile(path.join(CONFIG.assetsPath, asset.type, fname));
            return {
              type: 'image',
              data: buf.toString('base64'),
              mimeType: getMimeType(asset.type),
            };
          })
        );

        await logToERC8004('asset_delivered', {
          assetId: asset_id, txHash: tx_hash, amount: asset.price,
          fileCount: imageBlocks.length,
          autoApproved: asset.price <= CONFIG.maxAutoApproveUSD
        }, CONFIG);

        return {
          content: [
            { type: 'text', text: JSON.stringify({ success: true, type: asset.type, title: asset.title, fileCount: imageBlocks.length }) },
            ...imageBlocks,
          ],
          structuredContent: { success: true, type: asset.type, title: asset.title, fileCount: imageBlocks.length },
        };

      } else {
        // Text-based delivery (md, txt, etc.)
        const assetPath = path.join(CONFIG.assetsPath, asset.type, asset.filename);
        const content = await fs.readFile(assetPath, 'utf8');

        await logToERC8004('asset_delivered', {
          assetId: asset_id, txHash: tx_hash, amount: asset.price,
          autoApproved: asset.price <= CONFIG.maxAutoApproveUSD
        }, CONFIG);

        const output = { success: true, content, type: asset.type, title: asset.title };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        };
      }
    } catch (err) {
      console.error('Asset delivery error:', err.message);
      return {
        content: [{ type: 'text', text: `Error: Asset file not found. Contact agent owner.` }],
        isError: true,
      };
    }
  }
);

// --- Tool: get_agent_info ---
server.registerTool(
  'get_agent_info',
  {
    title: 'Get Agent Information',
    description: `Get identity and capability information for drhobbs Agent.

Returns ERC-8004 agent details, supported protocols, payment methods, and wallet address.
Use this for agent discovery and verification.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  async () => {
    const output = {
      agentId: CONFIG.agentId,
      name: 'drhobbs Agent — Fashion Tech & Agentic Commerce',
      description: "Richard Hobbs' agent: 30 years fashion tech expertise. Sells premium reports and media.",
      wallet: CONFIG.agentWallet,
      network: CONFIG.network,
      protocols: ['mcp', 'x402', 'erc8004'],
      paymentMethods: ['USDC'],
      erc8004Registry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      mcpEndpoint: `${CONFIG.publicUrl}/mcp`,
      x402PaymentManifest: `${CONFIG.publicUrl}/.well-known/pay`,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      structuredContent: output
    };
  }
);

// --- Tool: treasury_status ---
server.registerTool(
  'treasury_status',
  {
    title: 'Get Treasury Status',
    description: `Check the current USDC balance of the agent wallet.
Only accessible to authorised callers. Returns current balance and treasury configuration.`,
    inputSchema: z.object({
      admin_token: z.string().describe('Admin token for authorised access')
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  async ({ admin_token }) => {
    if (admin_token !== process.env.ADMIN_TOKEN) {
      return { content: [{ type: 'text', text: 'Error: Unauthorised' }], isError: true };
    }
    const balance = await getUSDCBalance(CONFIG.agentWallet, CONFIG);
    const output = {
      hotWalletBalance: balance,
      hotWallet: CONFIG.agentWallet,
      ledgerWallet: CONFIG.ledgerWallet,
      minBalance: parseFloat(process.env.TREASURY_MIN_BALANCE_USDC || '5'),
      sweepThreshold: parseFloat(process.env.TREASURY_SWEEP_THRESHOLD_USDC || '10'),
      autoSweepEnabled: process.env.TREASURY_AUTO_SWEEP_ENABLED === 'true',
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      structuredContent: output
    };
  }
);


// ============================================
// RRG NFT DROP TOOLS
// ============================================

// --- Tool: list_rrg_drops ---
server.registerTool(
  'list_rrg_drops',
  {
    title: 'List RRG NFT Drops',
    description: `List all active RRG NFT drops available for purchase.

RRG (Real Real Genuine) is a co-creation platform where creators submit original digital artwork
that becomes an ERC-1155 NFT on Base. Each drop includes a high-resolution JPEG and any
optional source files the creator submitted.

Returns: tokenId, title, description, priceUsdc, editionSize, minted count, remaining, soldOut.
Also returns the current open design brief (what creators can submit right now).

Network: Base Sepolia (testnet). Payment: USDC on Base Sepolia.
Use buy_rrg_drop to get exact payment instructions for a specific drop.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  async () => {
    try {
      const resp = await fetch(`${CONFIG.rrgApiUrl}/api/rrg/drops`);
      if (!resp.ok) throw new Error(`RRG API error: ${resp.status}`);
      const data = await resp.json();

      const rawDrops = data.drops || data;
      const drops = Array.isArray(rawDrops) ? rawDrops : [];

      const formatted = drops.map(d => ({
        tokenId:     d.token_id,
        title:       d.title,
        description: d.description,
        priceUsdc:   d.price_usdc,
        editionSize: d.edition_size,
        minted:      d.onChain?.minted ?? 0,
        remaining:   d.edition_size - (d.onChain?.minted ?? 0),
        soldOut:     d.onChain?.soldOut ?? false,
        active:      d.onChain?.active ?? true,
        ipfsUrl:     d.ipfs_url || null,
      })).filter(d => d.active);

      const output = {
        count:           formatted.length,
        network:         'base-sepolia',
        chainId:         CONFIG.rrgChainId,
        usdcContract:    CONFIG.rrgUsdcContract,
        platformWallet:  CONFIG.rrgPlatformWallet,
        drops:           formatted,
        currentBrief:    data.currentBrief ? {
          title:       data.currentBrief.title,
          description: data.currentBrief.description,
          endsAt:      data.currentBrief.ends_at,
        } : null,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error fetching RRG drops: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: buy_rrg_drop ---
server.registerTool(
  'buy_rrg_drop',
  {
    title: 'Get RRG Drop Payment Instructions',
    description: `Get exact payment instructions to purchase an RRG NFT drop (wallet-to-wallet flow).

Call list_rrg_drops first to find available drops and their tokenIds.
Returns the exact USDC amount and destination wallet on Base Sepolia.

Purchase flow:
  1. Call this tool with tokenId and your buyer wallet address
  2. Send EXACTLY the specified USDC amount to the payTo address on Base Sepolia
  3. Call confirm_rrg_purchase with your transaction hash to receive your files

On successful confirm: you receive a 24-hour download link for the artwork (high-res JPEG + source files).
The ERC-1155 NFT is minted to your wallet asynchronously.

Args:
  - token_id (number): The RRG drop token ID from list_rrg_drops
  - buyer_wallet (string): Your EVM wallet address (0x...)`,
    inputSchema: z.object({
      token_id:     z.number().int().positive().describe('RRG drop token ID from list_rrg_drops'),
      buyer_wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid 0x EVM address').describe('Your buyer wallet address (0x...)'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  async ({ token_id, buyer_wallet }) => {
    try {
      const resp = await fetch(`${CONFIG.rrgApiUrl}/api/rrg/drops?tokenId=${token_id}`);
      if (!resp.ok) throw new Error(`RRG API error: ${resp.status}`);
      const data = await resp.json();

      // Handle { drop: {...} } (single), { drops: [...] } (list), or array
      const drop = data.drop
        || (Array.isArray(data.drops) ? data.drops.find(d => d.token_id === token_id) : null)
        || (Array.isArray(data) ? data.find(d => d.token_id === token_id) : null);

      if (!drop || !drop.token_id) {
        return {
          content: [{ type: 'text', text: `Drop with tokenId ${token_id} not found. Call list_rrg_drops to see available drops.` }],
          isError: true,
        };
      }

      if (drop.onChain?.soldOut) {
        return {
          content: [{ type: 'text', text: `Drop #${token_id} "${drop.title}" is sold out.` }],
          isError: true,
        };
      }

      const priceUsdc  = Number(drop.price_usdc);
      const priceRaw   = Math.round(priceUsdc * 1_000_000).toString(); // 6 decimals
      const remaining  = drop.edition_size - (drop.onChain?.minted ?? 0);

      const output = {
        tokenId:     drop.token_id,
        title:       drop.title,
        description: drop.description,
        priceUsdc:   priceUsdc.toFixed(2),
        priceRaw,
        remaining,
        payment: {
          payTo:        CONFIG.rrgPlatformWallet,
          amount:       priceRaw,
          token:        'USDC',
          usdcContract: CONFIG.rrgUsdcContract,
          network:      'base-sepolia',
          chainId:      CONFIG.rrgChainId,
          decimals:     6,
        },
        buyerWallet: buyer_wallet,
        nextStep:    'Send EXACTLY the specified USDC amount on Base Sepolia, then call confirm_rrg_purchase with your transaction hash.',
        warning:     'Amount must be exact. payTo address must be exact. Wrong network or amount = unrecoverable.',
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error fetching drop info: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: confirm_rrg_purchase ---
server.registerTool(
  'confirm_rrg_purchase',
  {
    title: 'Confirm RRG Purchase and Receive Files',
    description: `Confirm a completed USDC payment for an RRG NFT drop and receive your download link.

Call this AFTER sending USDC on Base Sepolia (step 3 of buy_rrg_drop flow).
Provide your transaction hash — the server verifies it on-chain before delivering files.

Verification checks:
  1. Transaction confirmed on Base Sepolia
  2. USDC transferred to correct platform wallet
  3. Amount matches drop price exactly
  4. Transaction not previously used

On success: returns a 24-hour download URL for the artwork.
The ERC-1155 NFT is minted to your wallet asynchronously.

Args:
  - token_id (number): The RRG drop token ID
  - buyer_wallet (string): Your EVM wallet address (must match the USDC sender)
  - tx_hash (string): Your USDC payment transaction hash (0x + 64 hex chars)
  - buyer_email (string, optional): Email address to also receive a download link`,
    inputSchema: z.object({
      token_id:     z.number().int().positive().describe('RRG drop token ID'),
      buyer_wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Your wallet address (must be the USDC sender)'),
      tx_hash:      z.string().length(66).regex(/^0x[0-9a-fA-F]{64}$/).describe('USDC payment transaction hash on Base Sepolia'),
      buyer_email:  z.string().email().optional().describe('Optional: email for an additional download link delivery'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  async ({ token_id, buyer_wallet, tx_hash, buyer_email }) => {
    try {
      const body = {
        txHash:      tx_hash,
        buyerWallet: buyer_wallet,
        tokenId:     token_id,
        ...(buyer_email ? { email: buyer_email } : {}),
      };

      const resp = await fetch(`${CONFIG.rrgApiUrl}/api/rrg/claim`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      const result = await resp.json();

      if (!resp.ok || result.error) {
        return {
          content: [{ type: 'text', text: `Purchase confirmation failed: ${result.error || 'Unknown error'}` }],
          isError: true,
        };
      }

      const output = {
        success:     true,
        tokenId:     token_id,
        txHash:      tx_hash,
        downloadUrl: result.downloadUrl,
        mintStatus:  result.status || 'pending_mint',
        message:     `Payment verified. Download your artwork at: ${result.downloadUrl} (valid 24 hours). Your NFT is being minted.`,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error confirming purchase: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: submit_rrg_design ---
server.registerTool(
  'submit_rrg_design',
  {
    title: 'Submit Design to RRG',
    description: 'Submit a design to Real Real Genuine (RRG) for review. ' +
      'If approved, the design becomes an NFT drop available for purchase on Base. ' +
      'Creators receive 70% of each sale automatically in USDC. ' +
      'IMPORTANT: Prefer image_path (absolute path to a JPEG or PNG saved locally, e.g. /tmp/design.png) ' +
      'over image_base64 — base64 strings can be truncated by the model. ' +
      'Also accepts a publicly accessible image_url (JPEG or PNG). ' +
      'Submissions are reviewed manually; approval typically takes 2-5 days.',
    inputSchema: z.object({
      title: z.string().max(60).describe('Design title (max 60 characters)'),
      image_path: z.string().optional().describe('PREFERRED: Absolute path to a JPEG or PNG on the local filesystem (e.g. /tmp/design.png). Use this to avoid base64 truncation.'),
      image_url: z.string().url().optional().describe('Public URL to a JPEG or PNG image. Use if no local file is available.'),
      image_base64: z.string().optional().describe('Base64-encoded JPEG or PNG (raw or data URI). Last resort only — model may truncate long strings. Prefer image_path.'),
      creator_wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Your Base wallet address (0x...) — 70% of sales sent here as USDC'),
      description: z.string().max(280).optional().describe('Description of the design (max 280 chars)'),
      creator_email: z.string().email().optional().describe('Email for approval/rejection notification'),
      suggested_edition: z.string().optional().describe('Suggested edition size, e.g. "10". Reviewer sets final value.'),
      suggested_price_usdc: z.string().optional().describe('Suggested price in USDC, e.g. "15". Reviewer sets final value.'),
      creator_bio: z.string().max(500).optional().describe('Creator biography shown on the gallery and drop page (max 500 chars). Plain text; URLs (https://...) become clickable links.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  async ({ title, image_path, image_url, image_base64, creator_wallet, description, creator_email, suggested_edition, suggested_price_usdc, creator_bio }) => {
    try {
      if (!image_path && !image_url && !image_base64) {
        return { content: [{ type: 'text', text: 'Submission failed: provide image_path, image_url, or image_base64.' }], isError: true };
      }
      // If image_path provided, read file from disk (avoids LLM base64 truncation)
      if (image_path) {
        let fileBuffer;
        try {
          fileBuffer = await fs.readFile(image_path);
        } catch (readErr) {
          return { content: [{ type: 'text', text: `Submission failed: could not read file at '${image_path}': ${readErr.message}` }], isError: true };
        }
        if (fileBuffer.length < 1024) {
          return { content: [{ type: 'text', text: `Submission failed: file at '${image_path}' is too small (${fileBuffer.length} bytes) — may be empty or invalid.` }], isError: true };
        }
        image_base64 = fileBuffer.toString('base64');
      }
      // Validate base64 size
      if (image_base64) {
        const raw = image_base64.replace(/^data:image\/[a-z]+;base64,/i, '');
        const sizeBytes = Math.floor(raw.length * 0.75);
        if (sizeBytes > 5 * 1024 * 1024) {
          return { content: [{ type: 'text', text: 'Submission failed: image exceeds 5MB limit. Please reduce size or resolution.' }], isError: true };
        }
        if (sizeBytes < 1024) {
          return { content: [{ type: 'text', text: `Submission failed: image_base64 decoded to only ${sizeBytes} bytes — likely truncated by the model. Save the image to disk and use image_path instead.` }], isError: true };
        }
      }
      const resp = await fetch(`${CONFIG.rrgApiUrl}/api/rrg/submit-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          ...(image_url    ? { image_url }    : {}),
          ...(image_base64 ? { image_base64 } : {}),
          creator_wallet, description, creator_email, suggested_edition, suggested_price_usdc, creator_bio,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        return { content: [{ type: 'text', text: `Submission failed: ${data.error || 'Unknown error'}` }], isError: true };
      }
      const lines = [
        'Design submitted successfully to RRG!', '',
        `Submission ID: ${data.submissionId}`, '',
        'What happens next:',
        '- Your design will be reviewed manually (typically 2-5 days)',
        `- If approved, listed as an NFT drop at ${CONFIG.rrgApiUrl}/rrg`,
        `- When purchased, 70% goes to your wallet (${creator_wallet}) in USDC on Base`,
        '- The reviewer may adjust edition size and price from your suggestions',
        creator_email ? `- Notification will be sent to ${creator_email}` : '',
      ].filter(Boolean);
      return { content: [{ type: 'text', text: lines.join(String.fromCharCode(10)) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error submitting design: ${err.message}` }], isError: true };
    }
  }
);


// ============================================
// RRG PLATFORM RESOURCE
// ============================================
registerRRGResource(server);

// ============================================
// EXPRESS APP — x402 + MCP + REST endpoints
// ============================================
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    agentId: CONFIG.agentId,
    network: CONFIG.network,
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// --- x402 Payment Manifest ---
app.get('/.well-known/pay', (req, res) => {
  res.json({
    version: '1.0',
    schemes: [{
      scheme: 'exact',
      networkId: 8453,
      asset: CONFIG.usdcContract,
      payTo: CONFIG.agentWallet,
      description: 'drhobbs Agent — Fashion Tech Knowledge Marketplace',
    }]
  });
});

// --- Agent discovery ---
app.get('/.well-known/agent.json', (req, res) => {
  res.json({
    name: 'drhobbs Agent',
    agentId: CONFIG.agentId,
    mcpEndpoint: `${CONFIG.publicUrl}/mcp`,
    x402: `${CONFIG.publicUrl}/.well-known/pay`,
    erc8004: `https://8004scan.io/agents/base/${CONFIG.agentId}`,
  });
});

// --- x402-style REST asset delivery (for non-MCP clients) ---
app.get('/api/asset/:type/:filename', async (req, res) => {
  const txHash = req.headers['x-payment'];
  const { type, filename } = req.params;
  const catalogue = await getCatalogue();
  const asset = catalogue.find(a => a.filename === filename && a.type === type);

  // No payment header — return HTTP 402
  if (!txHash) {
    return res.status(402).json({
      error: 'Payment Required',
      x402Version: '1',
      accepts: [{
        scheme: 'exact',
        networkId: 8453,
        asset: CONFIG.usdcContract,
        payTo: CONFIG.agentWallet,
        maxAmountRequired: asset ? (asset.price * 1e6).toString() : '500000',
        resource: req.path,
        description: asset ? asset.title : 'Digital asset',
        mimeType: getMimeType(type),
        paymentRequiredHeader: '/.well-known/pay',
      }]
    });
  }

  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  if (usedTxHashes.has(txHash)) {
    return res.status(402).json({ error: 'Transaction hash already used. Each purchase requires a new transaction.' });
  }

  const verified = await verifyUSDCPayment(txHash, asset.price, CONFIG.agentWallet, CONFIG);
  if (!verified.success) {
    return res.status(402).json({ error: 'Payment verification failed', reason: verified.error });
  }
  await recordTxHash(txHash);

  try {
    await logToERC8004('asset_delivered', { filename, txHash, amount: asset.price }, CONFIG);

    const isImage = IMAGE_TYPES.has(type.toLowerCase());
    const fileNames = (isImage && asset.files && asset.files.length > 0) ? asset.files : null;

    if (fileNames && fileNames.length > 1) {
      // Multiple files — stream as zip bundle
      const zipName = `${filename}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', (err) => {
        console.error('Zip error:', err.message);
        if (!res.headersSent) res.status(500).end('Archive error');
      });
      archive.pipe(res);
      for (const fname of fileNames) {
        archive.file(path.join(CONFIG.assetsPath, type, fname), { name: fname });
      }
      await archive.finalize();

    } else {
      // Single file — resolve correct path with extension
      const singlePath = fileNames
        ? path.join(CONFIG.assetsPath, type, fileNames[0])
        : (isImage
            ? path.join(CONFIG.assetsPath, type, filename.includes('.') ? filename : `${filename}.${type}`)
            : path.join(CONFIG.assetsPath, type, filename));
      res.sendFile(singlePath);
    }
  } catch (err) {
    console.error('REST delivery error:', err.message);
    if (!res.headersSent) res.status(404).json({ error: 'Asset file not found' });
  }
});

// --- Catalogue REST endpoint (for non-MCP clients) ---
app.get('/api/catalogue', async (req, res) => {
  const catalogue = await getCatalogue();
  await logToERC8004('catalogue_viewed', { viewer: req.ip }, CONFIG);
  res.json({ success: true, agentId: CONFIG.agentId, count: catalogue.length, items: catalogue });
});


// ============================================
// HELPERS — email delivery
// ============================================
function escHtmlServer(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownToHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  for (const raw of lines) {
    let line = raw;
    if (/^# /.test(line)) {
      out.push('<h1 style="font-size:22px;color:#0f0f0f;margin:24px 0 8px;font-family:Georgia,serif">' + escHtmlServer(line.slice(2)) + '</h1>');
    } else if (/^## /.test(line)) {
      out.push('<h2 style="font-size:17px;color:#1a1a1a;margin:20px 0 6px;font-family:Georgia,serif">' + escHtmlServer(line.slice(3)) + '</h2>');
    } else if (/^[•\-] /.test(line)) {
      const inner = line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      out.push('<li style="margin:4px 0;color:#333;line-height:1.6">' + inner + '</li>');
    } else if (line.trim() === '') {
      out.push('<br>');
    } else {
      const inner = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      out.push('<p style="margin:8px 0;color:#333;line-height:1.7">' + inner + '</p>');
    }
  }
  return out.join('\n');
}

// --- Deliver purchased asset by email ---
app.post('/api/deliver', async (req, res) => {
  const { email, asset_id, tx_hash } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Valid email address required' });
  if (!asset_id || !tx_hash)
    return res.status(400).json({ error: 'asset_id and tx_hash required' });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM    = process.env.RESEND_FROM || 'Digital Fashion + Insight <deliver@richard-hobbs.com>';
  if (!RESEND_API_KEY || RESEND_API_KEY.startsWith('re_YOUR'))
    return res.status(503).json({ error: 'Email delivery not configured on server' });

  try {
    const catalogue = await getCatalogue();
    const asset = catalogue.find(a => a.id === asset_id || a.id === Number(asset_id));
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    if (usedTxHashes.has(tx_hash))
      return res.status(409).json({ error: 'Transaction already used for a previous delivery' });

    const verified = await verifyUSDCPayment(tx_hash, asset.price, CONFIG.agentWallet, CONFIG);
    if (!verified.success)
      return res.status(402).json({ error: 'Payment verification failed', reason: verified.error });

    await recordTxHash(tx_hash);

    const isImage = IMAGE_TYPES.has(asset.type.toLowerCase());
    let emailHtml = '';
    let attachments = [];

    if (isImage) {
      const fileNames = (asset.files && asset.files.length > 0)
        ? asset.files
        : [asset.filename + '.' + asset.type];

      emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h1 style="color:#0f0f0f;font-size:22px">Your purchase: ${escHtmlServer(asset.title)}</h1>
          <p style="color:#555">Thank you for your purchase. Your ${fileNames.length} image file${fileNames.length > 1 ? 's are' : ' is'} attached.</p>
          <p style="color:#555">Transaction: <a href="https://basescan.org/tx/${escHtmlServer(tx_hash)}" style="color:#6c47ff">${tx_hash.slice(0,20)}…</a></p>
          <p style="color:#888;font-size:12px;margin-top:32px">Digital Fashion + Insight · richard-hobbs.com</p>
        </div>`;

      for (const fname of fileNames) {
        const filePath = path.join(CONFIG.assetsPath, asset.type, fname);
        try {
          const data = await fs.readFile(filePath);
          attachments.push({ filename: fname, content: data.toString('base64') });
        } catch (e) {
          console.error('Could not attach file:', fname, e.message);
        }
      }
    } else {
      const filePath = path.join(CONFIG.assetsPath, asset.type, asset.filename);
      let rawContent = '';
      try { rawContent = await fs.readFile(filePath, 'utf8'); }
      catch (e) { rawContent = '(Content unavailable)'; }

      const bodyHtml = markdownToHtml(rawContent);
      emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:660px;margin:0 auto;padding:24px">
          <div style="background:#f8f8f8;border:1px solid #e0e0e0;border-radius:8px;padding:20px 28px;margin-bottom:28px">
            <p style="margin:0;font-size:12px;color:#888;font-family:monospace">PURCHASED ASSET</p>
            <h1 style="margin:6px 0 4px;font-size:22px;color:#0f0f0f">${escHtmlServer(asset.title)}</h1>
            <p style="margin:0;font-size:12px;color:#aaa">
              Transaction: <a href="https://basescan.org/tx/${escHtmlServer(tx_hash)}" style="color:#6c47ff">${tx_hash.slice(0,20)}…</a>
            </p>
          </div>
          <div style="line-height:1.7;color:#222">${bodyHtml}</div>
          <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e0e0e0">
            <p style="color:#aaa;font-size:11px;font-family:monospace">Digital Fashion + Insight · richard-hobbs.com</p>
          </div>
        </div>`;
    }

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    RESEND_FROM,
        to:      [email],
        subject: `Your purchase: ${asset.title}`,
        html:    emailHtml,
        ...(attachments.length > 0 ? { attachments } : {}),
      }),
    });

    const resendData = await resendResp.json();
    if (!resendResp.ok) {
      console.error('Resend error:', resendData);
      return res.status(502).json({ error: 'Email send failed', detail: resendData.message || resendData.name });
    }

    await logToERC8004('asset_delivered_email', {
      email, assetId: asset.id, filename: asset.filename, txHash: tx_hash
    }, CONFIG);

    console.log(`📧 Delivered "${asset.title}" to ${email} (tx: ${tx_hash.slice(0,10)}…)`);
    res.json({ success: true, message: `Asset sent to ${email}` });

  } catch (err) {
    console.error('/api/deliver error:', err);
    res.status(500).json({ error: 'Internal error during delivery', detail: err.message });
  }
});

// --- Manual treasury sweep trigger ---
app.post('/api/treasury/sweep', async (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorised' });
  const result = await sweepToLedger(CONFIG);
  res.json(result);
});


// ============================================
// ERC-8004 TRUST & REPUTATION TOOLS
// ============================================

// --- Tool: check_agent_trust ---
server.registerTool(
  'check_agent_trust',
  {
    title: 'Check Agent Trust (ERC-8004)',
    description: `Verify drhobbs Agent's on-chain identity and trust status via the ERC-8004 registry on Base mainnet.

Returns live blockchain data:
- Registration status in the ERC-8004 Identity Registry
- Agent ID (#17666) and 8004scan profile URL
- Identity URI (agent.json) and whether it matches the on-chain record
- Owner wallet (the wallet that receives payments)

Use this to verify you are dealing with a registered, on-chain trusted agent before transacting.
Registered agents have a cryptographically verifiable identity and an on-chain reputation history.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  async () => {
    try {
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider(CONFIG.baseRpcUrl);
      const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
      const AGENT_ID = BigInt(CONFIG.agentId);
      const iface = new ethers.Interface([
        'function tokenURI(uint256 tokenId) view returns (string)',
        'function ownerOf(uint256 tokenId) view returns (address)',
      ]);

      const [tokenUri, owner] = await Promise.all([
        provider.call({ to: IDENTITY_REGISTRY, data: iface.encodeFunctionData('tokenURI', [AGENT_ID]) })
          .then(r => ethers.AbiCoder.defaultAbiCoder().decode(['string'], r)[0])
          .catch(() => null),
        provider.call({ to: IDENTITY_REGISTRY, data: iface.encodeFunctionData('ownerOf', [AGENT_ID]) })
          .then(r => ethers.AbiCoder.defaultAbiCoder().decode(['address'], r)[0])
          .catch(() => null),
      ]);

      const EXPECTED_URI = 'https://richard-hobbs.com/agent.json';
      const output = {
        registered: !!tokenUri,
        agentId: CONFIG.agentId,
        network: 'base-mainnet',
        identityRegistry: IDENTITY_REGISTRY,
        reputationRegistry: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
        tokenUri,
        uriCurrent: tokenUri === EXPECTED_URI,
        ownerWallet: owner,
        paymentWallet: CONFIG.agentWallet,
        profileUrl: `https://8004scan.io/agents/base/${CONFIG.agentId}`,
        agentJson: EXPECTED_URI,
        protocol: 'ERC-8004 (EIP-8004)',
        note: 'ERC-8004 is an on-chain agent identity and reputation standard on Base. The owner wallet is the payment address. Registered agents build verifiable on-chain reputation through completed transactions.',
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error reading agent trust data: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: signal_transaction_trust ---
server.registerTool(
  'signal_transaction_trust',
  {
    title: 'Signal Transaction Trust (ERC-8004)',
    description: `After a completed RRG purchase, drhobbs Agent issues an on-chain ERC-8004 reputation signal to the buying agent, acknowledging the transaction was legitimate and completed successfully.

Only fires if the buyer wallet is itself a registered ERC-8004 agent (balanceOf > 0 on Base mainnet). Non-agent buyer wallets are skipped gracefully.

The signal is sent FROM drhobbs Agent (#17666) TO the buying agent — a cryptographic acknowledgement that drhobbs recognises this agent as a legitimate counterparty.

Call this after confirm_rrg_purchase to complete the trust loop.

Args:
  - buyer_wallet: The wallet address of the purchasing agent
  - tx_hash: The on-chain USDC payment transaction hash (used as unique signal identifier)
  - token_id: The RRG drop token ID purchased`,
    inputSchema: z.object({
      buyer_wallet:   z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Buyer wallet address'),
      tx_hash:        z.string().regex(/^0x[0-9a-fA-F]{64}$/).describe('USDC payment transaction hash'),
      token_id:       z.number().int().positive().describe('RRG drop token ID'),
      buyer_agent_id: z.number().int().positive().optional().describe('Buyer ERC-8004 agent ID — if known, skips on-chain tokenOfOwnerByIndex lookup (use when registry does not implement ERC-721 Enumerable)'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  async ({ buyer_wallet, tx_hash, token_id, buyer_agent_id }) => {
    try {
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider(CONFIG.baseRpcUrl);
      const IDENTITY_REGISTRY   = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
      const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';

      // 1. Check if buyer is a registered ERC-8004 agent
      const balanceData = ethers.id('balanceOf(address)').slice(0, 10) +
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [buyer_wallet]).slice(2);
      const balanceResult = await provider.call({ to: IDENTITY_REGISTRY, data: balanceData }).catch(() => null);

      if (!balanceResult) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ signaled: false, reason: 'registry_read_failed', buyerWallet: buyer_wallet }) }],
          structuredContent: { signaled: false, reason: 'registry_read_failed' },
        };
      }

      const buyerAgentCount = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], balanceResult)[0];
      if (buyerAgentCount === 0n) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            signaled: false,
            reason: 'buyer_not_registered_agent',
            note: 'Buyer wallet has no ERC-8004 identity. No on-chain signal sent. Transaction acknowledged off-chain only.',
            buyerWallet: buyer_wallet,
          }) }],
          structuredContent: { signaled: false, reason: 'buyer_not_registered_agent' },
        };
      }

      // 2. Resolve buyer's ERC-8004 agent ID
      // If buyer_agent_id is provided, use it directly (not all registries implement ERC-721 Enumerable).
      // Otherwise attempt tokenOfOwnerByIndex fallback.
      let buyerAgentId;
      if (buyer_agent_id) {
        buyerAgentId = BigInt(buyer_agent_id);
      } else {
        const tokenOfOwnerData = ethers.id('tokenOfOwnerByIndex(address,uint256)').slice(0, 10) +
          ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [buyer_wallet, 0n]).slice(2);
        const tokenResult = await provider.call({ to: IDENTITY_REGISTRY, data: tokenOfOwnerData }).catch(() => null);
        if (!tokenResult) {
          return {
            content: [{ type: 'text', text: JSON.stringify({
              signaled: false,
              reason: 'agent_id_not_resolvable',
              hint: 'Registry does not support tokenOfOwnerByIndex. Pass buyer_agent_id explicitly.',
              buyerWallet: buyer_wallet,
            }) }],
            structuredContent: { signaled: false, reason: 'agent_id_not_resolvable' },
          };
        }
        buyerAgentId = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], tokenResult)[0];
      }

      // 3. Fire reputation signal: DrHobbs -> buyer agent
      const signer = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);
      // ABI confirmed from deployed contract bytecode: selector 0x3c036a7e
      // int128 (not int256), string tags (not bytes32) — matches EIP-8004 spec exactly
      const reputationContract = new ethers.Contract(REPUTATION_REGISTRY, [
        'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external',
      ], signer);

      const tag1     = 'purchase';
      const tag2     = 'rrg';
      const endpoint = 'https://richard-hobbs.com/mcp';

      // Build ERC-8004 compliant off-chain feedback JSON.
      // Spec (https://eips.ethereum.org/EIPS/eip-8004): feedbackURI must point to a JSON document;
      // feedbackHash must be keccak256 of that JSON content for integrity verification.
      const feedbackObj = {
        agentRegistry: 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
        agentId:       Number(buyerAgentId),
        clientAddress: `eip155:8453:${buyer_wallet.toLowerCase()}`,
        value:         5,
        valueDecimals: 0,
        tag1:          'purchase',
        tag2:          'rrg',
        endpoint,
        sourceTxHash:  tx_hash,
        tokenId:       token_id,
        dropUrl:       `https://richard-hobbs.com/rrg/drop/${token_id}`,
      };
      const feedbackJson = JSON.stringify(feedbackObj);
      const feedbackHash = ethers.keccak256(ethers.toUtf8Bytes(feedbackJson));
      const feedbackURI  = `https://richard-hobbs.com/api/rrg/signal?to=${buyerAgentId}&tx=${encodeURIComponent(tx_hash)}&token=${token_id}&from=${CONFIG.agentWallet.toLowerCase()}`;

      const tx = await reputationContract.giveFeedback(
        buyerAgentId, 5n, 0, tag1, tag2, endpoint, feedbackURI, feedbackHash
      );
      const receipt = await tx.wait();

      const output = {
        signaled:    true,
        from:        `drhobbs Agent #${CONFIG.agentId}`,
        to:          `Buyer Agent #${buyerAgentId.toString()}`,
        buyerWallet: buyer_wallet,
        txHash:      receipt.hash,
        block:       receipt.blockNumber,
        feedbackHash,
        feedbackURI,
        value:       5,
        tag1:        'purchase',
        tag2:        'rrg',
        note:        'On-chain ERC-8004 reputation signal sent. feedbackURI hosts the compliant JSON; feedbackHash is keccak256 of that JSON content.',
      };

      console.log(`ERC-8004 signal sent to Agent #${buyerAgentId} (tx: ${receipt.hash.slice(0,10)}...)`);
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error sending reputation signal: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- MCP endpoint (JSON-RPC 2.0 over HTTP) ---
// GET: not supported in stateless JSON mode — return 405 so clients know endpoint exists
app.get("/mcp", (req, res) => {
  res.set("Allow", "POST").status(405).json({ error: "Method Not Allowed", hint: "POST JSON-RPC 2.0 messages to this endpoint" });
});
app.delete("/mcp", (req, res) => {
  res.set("Allow", "POST").status(405).json({ error: "Method Not Allowed" });
});
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// ============================================
// TREASURY SCHEDULER
// ============================================
function startTreasuryScheduler() {
  const intervalHours = parseInt(process.env.TREASURY_SWEEP_INTERVAL_HOURS || '24');
  const enabled = process.env.TREASURY_AUTO_SWEEP_ENABLED === 'true';

  if (!enabled) {
    console.log('💰 Auto-sweep disabled. Manual sweep available via POST /api/treasury/sweep');
    return;
  }

  const cronExpression = `0 */${intervalHours} * * *`;
  cron.schedule(cronExpression, async () => {
    console.log('⏰ Treasury sweep check...');
    const result = await sweepToLedger(CONFIG);
    console.log('💰 Treasury result:', result.message);
  });

  console.log(`💰 Treasury scheduler active — checking every ${intervalHours}h`);
}

// ============================================
// START SERVER
// ============================================
await fs.mkdir(CONFIG.logsPath, { recursive: true });
await fs.mkdir(CONFIG.assetsPath, { recursive: true });
await loadUsedTxHashes();

app.listen(CONFIG.port, '0.0.0.0', () => {
  console.log('');
  console.log('🦞 drhobbs Agent MCP Server v2.0');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📦 Agent ID:    ${CONFIG.agentId}`);
  console.log(`💰 Wallet:      ${CONFIG.agentWallet}`);
  console.log(`🔗 Network:     ${CONFIG.network}`);
  console.log(`🌐 MCP:         ${CONFIG.publicUrl}/mcp`);
  console.log(`💳 x402:        ${CONFIG.publicUrl}/.well-known/pay`);
  console.log(`🔍 Discovery:   ${CONFIG.publicUrl}/.well-known/agent.json`);
  console.log('');
});


// --- Tool: get_feedback_tx ---
server.registerTool(
  'get_feedback_tx',
  {
    title: 'Get Feedback Transaction Data (ERC-8004)',
    description: `Returns the encoded transaction data for a buying agent to submit their own ERC-8004 reputation signal about drhobbs Agent to the on-chain Reputation Registry.

This completes the trust loop: after drhobbs signals you (via signal_transaction_trust), you signal drhobbs back.

The buying agent signs and broadcasts this transaction from their own registered ERC-8004 wallet.
drhobbs cannot do this on your behalf — your signature is what makes the signal authentic.

Prerequisite: your wallet must be a registered ERC-8004 agent (balanceOf > 0 on Base mainnet).

The returned feedbackURI points to an ERC-8004 compliant JSON document at richard-hobbs.com/api/rrg/signal.
The feedbackHash is the keccak256 of that JSON content — verifiable by anyone (EIP-8004 spec compliance).

Steps:
  1. Call this tool with your tx_hash, token_id, and optionally your buyer_wallet
  2. Use your agent wallet to send the returned transaction to Base mainnet
  3. Confirm with any Base explorer — the signal is now on-chain

Args:
  - tx_hash: The USDC payment transaction hash from your purchase
  - token_id: The RRG drop token ID you purchased
  - buyer_wallet: (optional) Your ERC-8004 agent wallet — included as clientAddress in the off-chain feedback JSON`,
    inputSchema: z.object({
      tx_hash:      z.string().regex(/^0x[0-9a-fA-F]{64}$/).describe('Your USDC payment transaction hash'),
      token_id:     z.number().int().positive().describe('RRG drop token ID you purchased'),
      buyer_wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe('Your ERC-8004 agent wallet address — used as clientAddress in the ERC-8004 feedback JSON for reputation aggregation'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  async ({ tx_hash, token_id, buyer_wallet }) => {
    try {
      const { ethers } = await import('ethers');
      const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';
      const DRHOBBS_AGENT_ID    = 17666n;

      // ABI confirmed from deployed contract bytecode: selector 0x3c036a7e
      // int128 (not int256), string tags (not bytes32) — matches EIP-8004 spec exactly
      const iface = new ethers.Interface([
        'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external',
      ]);

      const endpoint = 'https://richard-hobbs.com/mcp';

      // Build ERC-8004 compliant off-chain feedback JSON.
      // Spec (https://eips.ethereum.org/EIPS/eip-8004): feedbackURI must point to a JSON document;
      // feedbackHash must be keccak256 of that JSON content for verifiable integrity.
      const feedbackObj = {
        agentRegistry: 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
        agentId:       17666,
        ...(buyer_wallet ? { clientAddress: `eip155:8453:${buyer_wallet.toLowerCase()}` } : {}),
        value:         5,
        valueDecimals: 0,
        tag1:          'purchase',
        tag2:          'rrg',
        endpoint,
        sourceTxHash:  tx_hash,
        tokenId:       token_id,
        dropUrl:       `https://richard-hobbs.com/rrg/drop/${token_id}`,
      };
      const feedbackJson = JSON.stringify(feedbackObj);
      const feedbackHash = ethers.keccak256(ethers.toUtf8Bytes(feedbackJson));
      const qsParams = { to: '17666', tx: tx_hash, token: String(token_id) };
      if (buyer_wallet) qsParams.from = buyer_wallet.toLowerCase();
      const feedbackURI = `https://richard-hobbs.com/api/rrg/signal?${new URLSearchParams(qsParams)}`;

      const calldata = iface.encodeFunctionData('giveFeedback', [
        DRHOBBS_AGENT_ID,
        5n,
        0,
        'purchase',
        'rrg',
        endpoint,
        feedbackURI,
        feedbackHash,
      ]);

      const output = {
        instruction: 'Sign and send this transaction from your registered ERC-8004 agent wallet on Base mainnet to signal trust in drhobbs Agent for your completed purchase.',
        transaction: {
          to:       REPUTATION_REGISTRY,
          data:     calldata,
          value:    '0x0',
          chainId:  8453,
          network:  'base-mainnet',
        },
        context: {
          targetAgent:  `drhobbs Agent #${DRHOBBS_AGENT_ID}`,
          value:        5,
          tag1:         'purchase',
          tag2:         'rrg',
          feedbackHash,
          feedbackURI,
          endpoint,
          sourceTxHash: tx_hash,
        },
        specCompliance: 'feedbackURI points to an ERC-8004 compliant JSON document (https://eips.ethereum.org/EIPS/eip-8004). feedbackHash is keccak256 of that JSON content — verifiable by any indexer.',
        note: 'Your wallet must be a registered ERC-8004 agent to submit this signal. Send the transaction using your agent wallet on Base mainnet (chainId 8453). No ETH value required — only gas.',
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error preparing feedback transaction: ${err.message}` }],
        isError: true,
      };
    }
  }
);

