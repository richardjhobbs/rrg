/**
 * lib/rrg/vision.ts
 * Local vision-model analysis using Qwen3-VL 8B via Ollama on Box.
 *
 * Two tools:
 *  1. analyzeSubmissionRelevance  — creator image vs brief relevance check
 *  2. analyzeBrandImageQuality    — brand product image quality/content gate
 *
 * Both fail-open: if the Box is unreachable or times out, pass = true so
 * operations are not blocked by infra issues.
 */

const VISION_API_URL   = process.env.VISION_API_URL   ?? 'http://100.102.161.108:11434';
const VISION_MODEL     = process.env.VISION_MODEL      ?? 'qwen3-vl:8b-instruct';
const VISION_TIMEOUT_MS = parseInt(process.env.VISION_TIMEOUT_MS ?? '45000', 10);

// ── Types ─────────────────────────────────────────────────────────────────

export interface RelevanceResult {
  pass: boolean;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface QualityResult {
  pass: boolean;
  flags: string[];
  reason: string;
}

// ── Core Ollama call ──────────────────────────────────────────────────────

async function callVisionModel(prompt: string, imageBuffer: Buffer): Promise<string> {
  const base64Image = imageBuffer.toString('base64');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const response = await fetch(`${VISION_API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model:  VISION_MODEL,
        stream: false,
        messages: [{
          role:    'user',
          content: prompt,
          images:  [base64Image],
        }],
        options: {
          temperature: 0.1,   // deterministic for classification
          num_predict: 200,   // short JSON response only
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API returned ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as { message?: { content?: string } };
    return data?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

// ── JSON extraction helper ────────────────────────────────────────────────

function extractJson(text: string): Record<string, unknown> {
  // Strip any markdown code fences the model might add
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  // Find the first {...} block
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON object found in model response: ${text}`);
  return JSON.parse(match[0]);
}

// ── Tool 1: Creator submission relevance ─────────────────────────────────

const RELEVANCE_PROMPT = (briefTitle: string, briefDescription: string) => `You are a content moderator for a fashion design marketplace.

A creator has submitted an image in response to this brief:
  Title: ${briefTitle}
  Description: ${briefDescription}

Your ONLY job is to identify completely off-topic spam — images that are clearly not related to the brief's subject matter at all. Examples of what to reject: a photo of food submitted to a fashion brief, a screenshot of a website, a random landscape photo, computer-generated random noise, or a completely unrelated object.

Do NOT reject based on quality, aesthetics, style, or whether you think it is good art. Only reject if the image has nothing to do with fashion, clothing, design, or the brief topic.

If in doubt, pass the image. False negatives (letting bad submissions through) are better than false positives (blocking legitimate creators).

Respond ONLY with valid JSON, no markdown fences, no explanation outside the JSON:
{"pass": true, "reason": "brief one-sentence explanation", "confidence": "high"}`;

export async function analyzeSubmissionRelevance(
  imageBuffer: Buffer,
  briefTitle: string,
  briefDescription: string,
): Promise<RelevanceResult> {
  try {
    const raw = await callVisionModel(RELEVANCE_PROMPT(briefTitle, briefDescription), imageBuffer);
    const parsed = extractJson(raw);

    const pass       = parsed.pass !== false;
    const reason     = typeof parsed.reason === 'string' ? parsed.reason : 'No reason provided';
    const confidence = ['high', 'medium', 'low'].includes(parsed.confidence as string)
      ? (parsed.confidence as 'high' | 'medium' | 'low')
      : 'medium';

    console.log(`[vision/relevance] pass=${pass} confidence=${confidence} reason="${reason}"`);
    return { pass, reason, confidence };

  } catch (err) {
    // Fail-open: if vision model is unavailable, let the submission through
    console.error('[vision/relevance] error — failing open:', err);
    return { pass: true, reason: 'Vision check unavailable', confidence: 'low' };
  }
}

// ── Tool 2: Brand image quality gate ─────────────────────────────────────

const QUALITY_PROMPT = `You are a quality controller for a fashion marketplace.

Examine this product image and check ONLY for these specific problems:
1. Offensive or explicit content (nudity, hate symbols, gore, violence)
2. Stock site watermarks visible in the image (Getty, Shutterstock, iStock, Alamy, etc.)
3. Severe blurriness that makes the subject completely unrecognisable
4. Screenshots of websites, phones, or computer screens as the primary content

If the image passes all checks, set pass to true with an empty flags array.
If you find a problem, set pass to false and name the flag(s).

Valid flag values: "offensive", "watermark", "blurry", "screenshot"

Respond ONLY with valid JSON, no markdown fences:
{"pass": true, "flags": [], "reason": "brief one-sentence explanation"}`;

export async function analyzeBrandImageQuality(
  imageBuffer: Buffer,
): Promise<QualityResult> {
  try {
    const raw = await callVisionModel(QUALITY_PROMPT, imageBuffer);
    const parsed = extractJson(raw);

    const pass  = parsed.pass !== false;
    const flags = Array.isArray(parsed.flags)
      ? (parsed.flags as unknown[]).filter(f => typeof f === 'string') as string[]
      : [];
    const reason = typeof parsed.reason === 'string' ? parsed.reason : 'No reason provided';

    console.log(`[vision/quality] pass=${pass} flags=${JSON.stringify(flags)} reason="${reason}"`);
    return { pass, flags, reason };

  } catch (err) {
    // Fail-open: if vision model is unavailable, allow the upload
    console.error('[vision/quality] error — failing open:', err);
    return { pass: true, flags: [], reason: 'Vision check unavailable' };
  }
}

// ── Async background screener (for creator submissions) ───────────────────

import { db } from '@/lib/rrg/db';

export async function screenSubmissionAsync(
  submissionId: string,
  imageBuffer: Buffer,
  briefTitle: string,
  briefDescription: string,
): Promise<void> {
  try {
    const result = await analyzeSubmissionRelevance(imageBuffer, briefTitle, briefDescription);

    await db
      .from('rrg_submissions')
      .update({
        status:               result.pass ? 'pending' : 'ai_rejected',
        ai_screened_at:       new Date().toISOString(),
        ai_screen_result:     result.pass ? 'pass' : 'fail',
        ai_screen_reason:     result.reason,
        ai_screen_confidence: result.confidence,
        rejected_reason:      result.pass ? null : `[AUTO] ${result.reason}`,
      })
      .eq('id', submissionId);

  } catch (err) {
    // On any failure, promote to pending so submission isn't stuck in ai_screening
    console.error('[vision/screenSubmissionAsync] error — promoting to pending:', err);
    await db
      .from('rrg_submissions')
      .update({ status: 'pending', ai_screened_at: new Date().toISOString() })
      .eq('id', submissionId);
  }
}
