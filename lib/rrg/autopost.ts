/**
 * lib/rrg/autopost.ts
 * Fire-and-forget social posts on new listing approvals and sales.
 * Supports Telegram (HTML + photo) and BlueSky (AT Protocol with facets + image embed).
 */

const SITE_URL              = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realrealgenuine.com').replace(/\/$/, '');
const TG_BOT_TOKEN          = process.env.TG_BOT_TOKEN          ?? '';
const TG_CHAT_ID            = process.env.TG_CHAT_ID            ?? '';
const DRHOBBS_TG_BOT_TOKEN  = process.env.DRHOBBS_TG_BOT_TOKEN  ?? '';
const BSKY_HANDLE           = process.env.BSKY_HANDLE           ?? '';
const BSKY_APP_PASS         = process.env.BSKY_APP_PASS         ?? '';
const DRHOBBS_BSKY_HANDLE   = process.env.DRHOBBS_BSKY_HANDLE   ?? '';
const DRHOBBS_BSKY_APP_PASS = process.env.DRHOBBS_BSKY_APP_PASS ?? '';

const RRG_URL     = `${SITE_URL}/rrg`;
const SIGNOFF_TG  = `Join in. Be a part of the co-creation brand revolution at <a href="${RRG_URL}">RRG</a>`;
const SIGNOFF_BSK = `Join in. Be a part of the co-creation brand revolution at RRG`;

// ── DrHobbsBot reply pools ──────────────────────────────────────────────

const MENTION_PROMPTS = [
  '@drohobbsbot thoughts?',
  'Hey @drohobbsbot \u2014 what do you reckon?',
  '@drohobbsbot any takes on this one?',
  'Calling @drohobbsbot for a hot take.',
  '@drohobbsbot \u2014 worth a look?',
  'Over to you @drohobbsbot.',
  'What say you @drohobbsbot?',
  '@drohobbsbot vibes?',
];

const BSKY_MENTION_PROMPTS = [
  '@dr-hobbs-rrg.bsky.social thoughts?',
  'Hey @dr-hobbs-rrg.bsky.social — what do you reckon?',
  '@dr-hobbs-rrg.bsky.social any takes on this one?',
  'Calling @dr-hobbs-rrg.bsky.social for a hot take.',
  '@dr-hobbs-rrg.bsky.social — worth a look?',
  'Over to you @dr-hobbs-rrg.bsky.social.',
  'What say you @dr-hobbs-rrg.bsky.social?',
  '@dr-hobbs-rrg.bsky.social vibes?',
];

const APPROVAL_COMMENTS = [
  'Strong concept. The kind of thing that gets better the longer you look at it.',
  'This one has real intention behind it. Not just pretty \u2014 considered.',
  'I can see the brief in there, but it goes further. That is what we want.',
  'The material thinking here is sharp. Would love to see this in production.',
  'Bold choice. Collectors with taste will notice this one.',
  'Clean execution. There is a confidence to this that stands out.',
  'This is what co-creation looks like when someone actually pushes the concept.',
  'Interesting tension between the brief and the interpretation. I am into it.',
  'Not derivative. That is harder than it sounds. Well played.',
  'Good eye. The details are doing the heavy lifting here.',
  'This has range \u2014 could work as a collectible or a genuine product concept.',
  'When you look at this alongside the rest of the gallery, it holds its own.',
];

const SALE_COMMENTS = [
  'Another one finds a home. That is the network effect in action.',
  'Smart purchase. This creator is one to watch.',
  'Good taste. This edition will not last long at this rate.',
  'The fact that agents and humans are buying the same drops still amazes me.',
  'Co-creation to collection. The full loop. Love to see it.',
  'Someone saw value and moved on it. That is how markets work.',
  'Every sale is a signal. This one is saying something.',
  'Solid pick. The creator will be pleased.',
  'One more off the edition count. Scarcity is doing its thing.',
  'Collectors building real collections. This is what RRG was built for.',
  'Nice. That drop deserved the attention.',
  'When the right buyer meets the right drop. Good match.',
];

// ── Bio helper ───────────────────────────────────────────────────────────

interface BioSummary { excerpt: string; url: string | null }

function parseBio(bio: string | null, maxLen = 80): BioSummary {
  if (!bio?.trim()) return { excerpt: '', url: null };

  // Extract first URL — prefer [text](url) markdown, then bare URL
  const mdMatch   = bio.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
  const bareMatch = bio.match(/https?:\/\/[^\s]+/);
  const url = mdMatch
    ? mdMatch[2].replace(/[.,!?;)]+$/, '')
    : bareMatch
    ? bareMatch[0].replace(/[.,!?;)]+$/, '')
    : null;

  // Build plain-text excerpt: replace [text](url) with display text, remove bare URLs
  const stripped = bio
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')  // [text](url) → text
    .replace(/https?:\/\/[^\s]+\s?/g, '')                  // bare URLs removed
    .trim()
    .replace(/\s+/g, ' ');

  const excerpt = stripped.length > maxLen
    ? stripped.slice(0, maxLen - 1).trimEnd() + '\u2026'
    : stripped;
  return { excerpt, url };
}

// ── Shared param types ───────────────────────────────────────────────────

export interface ApprovalParams {
  title:       string;
  tokenId:     number;
  editionSize: number;
  priceUsdc:   string;
  description: string | null;
  creatorBio:  string | null;
  briefTitle:  string | null;
  imageUrl:    string | null;
}

export interface SaleParams {
  title:       string;
  tokenId:     number;
  buyerWallet: string;
  remaining:   number;
  creatorBio:  string | null;
  imageUrl:    string | null;
}

// ── Telegram ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildApprovalTg(p: ApprovalParams): string {
  const url                      = `${SITE_URL}/rrg/drop/${p.tokenId}`;
  const { excerpt, url: bioUrl } = parseBio(p.creatorBio, 80);
  const price                    = parseFloat(p.priceUsdc).toFixed(2);

  const rawDesc = (p.description ?? '')
    .split('\n')[0]
    .replace(/\[Suggested:.*?\]/g, '')
    .trim()
    .slice(0, 200);

  return [
    `\uD83C\uDFA8 <b><a href="${url}">${esc(p.title)}</a></b>`,
    rawDesc ? esc(rawDesc) : null,
    p.briefTitle ? `Part of the <i>${esc(p.briefTitle)}</i> challenge.` : null,
    `Just <b>${p.editionSize}</b> available at <b>$${price} USDC</b>.`,
    excerpt
      ? `From: ${bioUrl
          ? `<a href="${bioUrl}">${esc(excerpt)}</a>`
          : esc(excerpt)}`
      : null,
    SIGNOFF_TG,
  ].filter(Boolean).join('\n\n');
}

function buildSaleTg(p: SaleParams): string {
  const url                      = `${SITE_URL}/rrg/drop/${p.tokenId}`;
  const buyer                    = `${p.buyerWallet.slice(0, 6)}\u2026${p.buyerWallet.slice(-4)}`;
  const { excerpt, url: bioUrl } = parseBio(p.creatorBio, 80);

  return [
    `\uD83D\uDCB8 <b>Sold!</b>`,
    `${esc(buyer)} just purchased <a href="${url}">${esc(p.title)}</a>.`,
    p.remaining > 0
      ? `Just <b>${p.remaining}</b> ${p.remaining === 1 ? 'edition' : 'editions'} remaining.`
      : `<b>Edition complete \u2014 all sold!</b> \uD83C\uDF89`,
    excerpt
      ? `Great concept from: ${bioUrl
          ? `<a href="${bioUrl}">${esc(excerpt)}</a>`
          : esc(excerpt)}`
      : null,
    SIGNOFF_TG,
  ].filter(Boolean).join('\n\n');
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function maybeAppendMention(html: string): { html: string; hasMention: boolean } {
  if (Math.random() >= 0.5) return { html, hasMention: false };
  const prompt = pickRandom(MENTION_PROMPTS);
  // Insert mention prompt just before the signoff line
  return {
    html: html.replace(SIGNOFF_TG, `${esc(prompt)}\n\n${SIGNOFF_TG}`),
    hasMention: true,
  };
}

function scheduleDrHobbsReply(
  messageId: number,
  type: 'approval' | 'sale',
): void {
  if (!DRHOBBS_TG_BOT_TOKEN || !TG_CHAT_ID) return;

  const delay   = 5_000 + Math.random() * 10_000; // 5–15 seconds
  const comment = pickRandom(type === 'approval' ? APPROVAL_COMMENTS : SALE_COMMENTS);

  setTimeout(async () => {
    try {
      const resp = await fetch(
        `https://api.telegram.org/bot${DRHOBBS_TG_BOT_TOKEN}/sendMessage`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            chat_id:                      TG_CHAT_ID,
            text:                         comment,
            reply_to_message_id:          messageId,
            allow_sending_without_reply:  true,
          }),
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (!resp.ok) {
        console.warn('[autopost/drhobbs] reply failed:', await resp.text());
      }
    } catch (err) {
      console.warn('[autopost/drhobbs] reply error:', err);
    }
  }, delay);
}

// ── BlueSky DrHobbs reply helpers ─────────────────────────────────────────

interface BskyPostRef {
  uri: string;
  cid: string;
}

function maybeAppendBskyMention(
  post: { text: string; facets: BskyFacet[] },
): { post: { text: string; facets: BskyFacet[] }; hasMention: boolean } {
  if (Math.random() >= 0.5) return { post, hasMention: false };
  const prompt     = pickRandom(BSKY_MENTION_PROMPTS);
  const handle     = 'dr-hobbs-rrg.bsky.social';
  const newText    = post.text.replace(SIGNOFF_BSK, `${prompt}\n\n${SIGNOFF_BSK}`);

  // BSky has a 300-char limit — skip mention if it would overflow
  const enc = new TextEncoder();
  if (enc.encode(newText).length > 300) return { post, hasMention: false };

  // Build mention facet — find the @handle in the new text
  const mentionStr = `@${handle}`;
  const mentionIdx = newText.indexOf(mentionStr);
  const mentionFacets: BskyFacet[] = mentionIdx >= 0
    ? [{
        index: {
          byteStart: enc.encode(newText.slice(0, mentionIdx)).length,
          byteEnd:   enc.encode(newText.slice(0, mentionIdx)).length + enc.encode(mentionStr).length,
        },
        features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:placeholder:drhobbs' }],
      }]
    : [];

  return {
    post: {
      text:   newText,
      facets: [...recalcBskyFacets(post, newText), ...mentionFacets],
    },
    hasMention: true,
  };
}

/**
 * Recalculate facet byte offsets for link facets when text has been modified.
 * We can't just reuse old byte offsets — the inserted mention prompt shifts them.
 */
function recalcBskyFacets(
  original: { text: string; facets: BskyFacet[] },
  newText:  string,
): BskyFacet[] {
  const enc = new TextEncoder();
  const result: BskyFacet[] = [];
  for (const facet of original.facets) {
    // Extract the original matched text by decoding from byte offsets
    const origBytes   = enc.encode(original.text);
    const matchBytes  = origBytes.slice(facet.index.byteStart, facet.index.byteEnd);
    const matchText   = new TextDecoder().decode(matchBytes);
    // Find the same text in the new string
    const newIdx      = newText.indexOf(matchText);
    if (newIdx === -1) continue;
    const byteStart   = enc.encode(newText.slice(0, newIdx)).length;
    const byteEnd     = byteStart + enc.encode(matchText).length;
    result.push({ index: { byteStart, byteEnd }, features: facet.features });
  }
  return result;
}

/**
 * Resolve DrHobbs BSky DID for mention facets.
 * Caches for the process lifetime.
 */
let drHobbsBskyDid: string | null = null;

async function resolveDrHobbsDid(): Promise<string | null> {
  if (drHobbsBskyDid) return drHobbsBskyDid;
  try {
    const resp = await fetch(
      `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=dr-hobbs-rrg.bsky.social`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!resp.ok) return null;
    const { did } = await resp.json();
    drHobbsBskyDid = did as string;
    return drHobbsBskyDid;
  } catch {
    return null;
  }
}

async function getDrHobbsBskyJwt(): Promise<{ jwt: string; did: string }> {
  const resp = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ identifier: DRHOBBS_BSKY_HANDLE, password: DRHOBBS_BSKY_APP_PASS }),
    signal:  AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`DrHobbs BSky auth failed (${resp.status}): ${await resp.text()}`);
  const { accessJwt, did } = await resp.json();
  return { jwt: accessJwt as string, did: did as string };
}

function scheduleDrHobbsBskyReply(
  parentRef: BskyPostRef,
  rootRef:   BskyPostRef,
  type:      'approval' | 'sale',
): void {
  if (!DRHOBBS_BSKY_HANDLE || !DRHOBBS_BSKY_APP_PASS) return;

  const delay   = 5_000 + Math.random() * 10_000; // 5–15 seconds
  const comment = pickRandom(type === 'approval' ? APPROVAL_COMMENTS : SALE_COMMENTS);

  setTimeout(async () => {
    try {
      const { jwt, did } = await getDrHobbsBskyJwt();

      const record: Record<string, unknown> = {
        $type:     'app.bsky.feed.post',
        text:      comment,
        createdAt: new Date().toISOString(),
        reply: {
          root:   { uri: rootRef.uri, cid: rootRef.cid },
          parent: { uri: parentRef.uri, cid: parentRef.cid },
        },
      };

      const resp = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
        body:    JSON.stringify({
          repo:       did,
          collection: 'app.bsky.feed.post',
          record,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) {
        console.warn('[autopost/drhobbs-bsky] reply failed:', await resp.text());
      }
    } catch (err) {
      console.warn('[autopost/drhobbs-bsky] reply error:', err);
    }
  }, delay);
}

// ── Telegram sender ──────────────────────────────────────────────────────

async function sendTelegram(html: string, imageUrl: string | null): Promise<number | null> {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
    console.warn('[autopost/tg] TG_BOT_TOKEN or TG_CHAT_ID not configured \u2014 skipping');
    return null;
  }

  // Try sendPhoto first if we have an image; caption limited to 1024 chars
  if (imageUrl) {
    const caption = html.slice(0, 1024);
    try {
      const resp = await fetch(
        `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendPhoto`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            chat_id:    TG_CHAT_ID,
            photo:      imageUrl,
            caption,
            parse_mode: 'HTML',
          }),
          signal: AbortSignal.timeout(15_000),
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        return data.result?.message_id ?? null;
      }
      console.warn('[autopost/tg] sendPhoto failed, falling back to sendMessage:', await resp.text());
    } catch (err) {
      console.warn('[autopost/tg] sendPhoto error, falling back to sendMessage:', err);
    }
  }

  // Fallback: text-only message
  const resp = await fetch(
    `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        chat_id:    TG_CHAT_ID,
        text:       html,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: false },
      }),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!resp.ok) {
    throw new Error(`Telegram sendMessage failed (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.result?.message_id ?? null;
}

// ── BlueSky ──────────────────────────────────────────────────────────────

interface BskyFacetFeature {
  $type: string;
  uri?: string;   // for #link facets
  did?: string;   // for #mention facets
}

interface BskyFacet {
  index:    { byteStart: number; byteEnd: number };
  features: BskyFacetFeature[];
}

function bskyFacets(text: string, links: { match: string; url: string }[]): BskyFacet[] {
  const enc     = new TextEncoder();
  const facets: BskyFacet[] = [];
  for (const { match, url } of links) {
    const idx = text.indexOf(match);
    if (idx === -1) continue;
    const byteStart = enc.encode(text.slice(0, idx)).length;
    const byteEnd   = byteStart + enc.encode(match).length;
    facets.push({
      index:    { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
    });
  }
  return facets;
}

function buildApprovalBsky(p: ApprovalParams): { text: string; facets: BskyFacet[] } {
  const dropUrl                  = `${SITE_URL}/rrg/drop/${p.tokenId}`;
  const { excerpt, url: bioUrl } = parseBio(p.creatorBio, 60);
  const price                    = parseFloat(p.priceUsdc).toFixed(2);

  const rawDesc = (p.description ?? '')
    .split('\n')[0]
    .replace(/\[Suggested:.*?\]/g, '')
    .trim()
    .slice(0, 120);

  const lines = [
    '\uD83C\uDFA8 New listing',
    p.title,
    rawDesc || null,
    p.briefTitle ? `Part of the ${p.briefTitle} challenge.` : null,
    `${p.editionSize} editions \u00b7 $${price} USDC`,
    excerpt ? `From: ${excerpt}` : null,
  ].filter(Boolean) as string[];

  // Reserve room for signoff (always appended) within BSky's 300-char limit
  const budget  = 300 - 2 - SIGNOFF_BSK.length;
  const main    = lines.join('\n\n').slice(0, budget);
  const text    = `${main}\n\n${SIGNOFF_BSK}`;

  // Title is the link; bio excerpt is a secondary link if present; signoff "RRG" links to /rrg
  const lnks: { match: string; url: string }[] = [
    { match: p.title,   url: dropUrl },
    { match: 'RRG',     url: RRG_URL },
  ];
  if (bioUrl && excerpt && text.includes(excerpt)) {
    lnks.push({ match: excerpt, url: bioUrl });
  }
  return { text, facets: bskyFacets(text, lnks) };
}

function buildSaleBsky(p: SaleParams): { text: string; facets: BskyFacet[] } {
  const dropUrl      = `${SITE_URL}/rrg/drop/${p.tokenId}`;
  const buyer        = `${p.buyerWallet.slice(0, 6)}\u2026${p.buyerWallet.slice(-4)}`;
  const { excerpt }  = parseBio(p.creatorBio, 60);

  const purchaseLine = `${buyer} just purchased ${p.title}.`;

  const lines = [
    '\uD83D\uDCB8 Sold!',
    purchaseLine,
    p.remaining > 0
      ? `${p.remaining} ${p.remaining === 1 ? 'edition' : 'editions'} remaining.`
      : 'Edition complete! \uD83C\uDF89',
    excerpt ? `Great concept from: ${excerpt}` : null,
  ].filter(Boolean) as string[];

  // Reserve room for signoff within BSky's 300-char limit
  const budget = 300 - 2 - SIGNOFF_BSK.length;
  const main   = lines.join('\n\n').slice(0, budget);
  const text   = `${main}\n\n${SIGNOFF_BSK}`;

  // Title within the purchase line + signoff "RRG" are both links
  return {
    text,
    facets: bskyFacets(text, [
      { match: p.title, url: dropUrl },
      { match: 'RRG',   url: RRG_URL },
    ]),
  };
}

async function getBskyJwt(): Promise<string> {
  const resp = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ identifier: BSKY_HANDLE, password: BSKY_APP_PASS }),
    signal:  AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`BSky auth failed (${resp.status}): ${await resp.text()}`);
  const { accessJwt } = await resp.json();
  return accessJwt as string;
}

interface BskyBlob {
  $type:    string;
  ref:      { $link: string };
  mimeType: string;
  size:     number;
}

async function uploadBskyBlob(imageUrl: string, jwt: string): Promise<BskyBlob | null> {
  try {
    const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!imgResp.ok) return null;
    const buf      = await imgResp.arrayBuffer();
    const mimeType = imgResp.headers.get('content-type') || 'image/jpeg';

    const uploadResp = await fetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
      method:  'POST',
      headers: {
        'Content-Type':  mimeType,
        'Authorization': `Bearer ${jwt}`,
      },
      body:   buf,
      signal: AbortSignal.timeout(30_000),
    });
    if (!uploadResp.ok) return null;
    const { blob } = await uploadResp.json();
    return blob as BskyBlob;
  } catch {
    return null;
  }
}

async function sendBluesky(
  post:     { text: string; facets: BskyFacet[] },
  imageUrl: string | null,
  altText:  string,
): Promise<BskyPostRef | null> {
  if (!BSKY_HANDLE || !BSKY_APP_PASS) {
    console.warn('[autopost/bsky] BSKY_HANDLE or BSKY_APP_PASS not configured \u2014 skipping');
    return null;
  }
  const jwt = await getBskyJwt();

  // Resolve DrHobbs DID for mention facets (if any)
  const drHobbsDid = await resolveDrHobbsDid();
  if (drHobbsDid) {
    for (const facet of post.facets) {
      for (const feat of facet.features) {
        if (feat.$type === 'app.bsky.richtext.facet#mention' && feat.did === 'did:placeholder:drhobbs') {
          feat.did = drHobbsDid;
        }
      }
    }
  } else {
    // Remove unresolved mention facets
    post.facets = post.facets.filter(
      f => !f.features.some(feat => feat.$type === 'app.bsky.richtext.facet#mention' && feat.did === 'did:placeholder:drhobbs')
    );
  }

  // Optionally upload image blob
  let embed: unknown = undefined;
  if (imageUrl) {
    const blob = await uploadBskyBlob(imageUrl, jwt);
    if (blob) {
      embed = {
        $type:  'app.bsky.embed.images',
        images: [{ image: blob, alt: altText.slice(0, 300) }],
      };
    }
  }

  const record: Record<string, unknown> = {
    $type:     'app.bsky.feed.post',
    text:      post.text,
    facets:    post.facets,
    createdAt: new Date().toISOString(),
  };
  if (embed) record.embed = embed;

  const resp = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
    body:    JSON.stringify({
      repo:       BSKY_HANDLE,
      collection: 'app.bsky.feed.post',
      record,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`BSky createRecord failed (${resp.status}): ${await resp.text()}`);

  const data = await resp.json();
  return { uri: data.uri as string, cid: data.cid as string };
}

// ── Public API ───────────────────────────────────────────────────────────

export async function autopostApproval(p: ApprovalParams): Promise<void> {
  const rawHtml = buildApprovalTg(p);
  const { html: tgHtml, hasMention: tgMention } = maybeAppendMention(rawHtml);

  const bskyPost = buildApprovalBsky(p);
  const { post: bskyWithMention, hasMention: bskyMention } = maybeAppendBskyMention(bskyPost);

  const results = await Promise.allSettled([
    sendTelegram(tgHtml, p.imageUrl),
    sendBluesky(bskyWithMention, p.imageUrl, p.title),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('[autopost/approval]', r.reason);
  }

  // Schedule DrHobbs TG reply if mention and TG succeeded
  if (tgMention && results[0].status === 'fulfilled') {
    const messageId = (results[0] as PromiseFulfilledResult<number | null>).value;
    if (messageId) scheduleDrHobbsReply(messageId, 'approval');
  }

  // Schedule DrHobbs BSky reply if mention and BSky succeeded
  if (bskyMention && results[1].status === 'fulfilled') {
    const postRef = (results[1] as PromiseFulfilledResult<BskyPostRef | null>).value;
    if (postRef) scheduleDrHobbsBskyReply(postRef, postRef, 'approval');
  }
}

export async function autopostSale(p: SaleParams): Promise<void> {
  const rawHtml = buildSaleTg(p);
  const { html: tgHtml, hasMention: tgMention } = maybeAppendMention(rawHtml);

  const bskyPost = buildSaleBsky(p);
  const { post: bskyWithMention, hasMention: bskyMention } = maybeAppendBskyMention(bskyPost);

  const results = await Promise.allSettled([
    sendTelegram(tgHtml, p.imageUrl),
    sendBluesky(bskyWithMention, p.imageUrl, p.title),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('[autopost/sale]', r.reason);
  }

  // Schedule DrHobbs TG reply if mention and TG succeeded
  if (tgMention && results[0].status === 'fulfilled') {
    const messageId = (results[0] as PromiseFulfilledResult<number | null>).value;
    if (messageId) scheduleDrHobbsReply(messageId, 'sale');
  }

  // Schedule DrHobbs BSky reply if mention and BSky succeeded
  if (bskyMention && results[1].status === 'fulfilled') {
    const postRef = (results[1] as PromiseFulfilledResult<BskyPostRef | null>).value;
    if (postRef) scheduleDrHobbsBskyReply(postRef, postRef, 'sale');
  }
}
