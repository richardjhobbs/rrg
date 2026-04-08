/**
 * LLM provider abstraction — unified interface for Claude, OpenAI, and Gemini.
 *
 * Used by Pro agents to evaluate drops with reasoning.
 * Platform provides the API keys — owner pays per use via credits.
 */

import type { LlmProvider, EvalDecision } from './types';

export interface LlmEvalResult {
  decision: EvalDecision;
  reasoning: string;
  suggestedBidUsdc: number | null;
  tokensUsed: number;
}

// ── Provider dispatch ────────────────────────────────────────────────

export async function evaluateWithLlm(
  provider: LlmProvider,
  systemPrompt: string,
  dropDescription: string
): Promise<LlmEvalResult> {
  switch (provider) {
    case 'claude':
      return evaluateWithClaude(systemPrompt, dropDescription);
    case 'openai':
      return evaluateWithOpenAI(systemPrompt, dropDescription);
    case 'gemini':
      return evaluateWithGemini(systemPrompt, dropDescription);
    case 'deepseek':
      return evaluateWithDeepSeek(systemPrompt, dropDescription);
    case 'qwen':
      return evaluateWithQwen(systemPrompt, dropDescription);
  }
}

// ── Claude ────────────────────────────────────────────────────────────

async function evaluateWithClaude(
  systemPrompt: string,
  dropDescription: string
): Promise<LlmEvalResult> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: dropDescription }],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';
  const tokensUsed =
    (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

  return parseEvalResponse(text, tokensUsed);
}

// ── OpenAI ────────────────────────────────────────────────────────────

async function evaluateWithOpenAI(
  systemPrompt: string,
  dropDescription: string
): Promise<LlmEvalResult> {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: dropDescription },
    ],
  });

  const text = response.choices[0]?.message?.content ?? '';
  const tokensUsed =
    (response.usage?.prompt_tokens ?? 0) +
    (response.usage?.completion_tokens ?? 0);

  return parseEvalResponse(text, tokensUsed);
}

// ── Gemini ────────────────────────────────────────────────────────────

async function evaluateWithGemini(
  systemPrompt: string,
  dropDescription: string
): Promise<LlmEvalResult> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY ?? '');
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(dropDescription);
  const text = result.response.text();
  const usage = result.response.usageMetadata;
  const tokensUsed =
    (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0);

  return parseEvalResponse(text, tokensUsed);
}

// ── DeepSeek (OpenAI-compatible) ─────────────────────────────────────

async function evaluateWithDeepSeek(
  systemPrompt: string,
  dropDescription: string
): Promise<LlmEvalResult> {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com',
  });

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: dropDescription },
    ],
  });

  const text = response.choices[0]?.message?.content ?? '';
  const tokensUsed =
    (response.usage?.prompt_tokens ?? 0) +
    (response.usage?.completion_tokens ?? 0);

  return parseEvalResponse(text, tokensUsed);
}

// ── Qwen (OpenAI-compatible via DashScope) ──────────────────────────

async function evaluateWithQwen(
  systemPrompt: string,
  dropDescription: string
): Promise<LlmEvalResult> {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  });

  const response = await client.chat.completions.create({
    model: 'qwen-plus',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: dropDescription },
    ],
  });

  const text = response.choices[0]?.message?.content ?? '';
  const tokensUsed =
    (response.usage?.prompt_tokens ?? 0) +
    (response.usage?.completion_tokens ?? 0);

  return parseEvalResponse(text, tokensUsed);
}

// ── Response parser ──────────────────────────────────────────────────

function parseEvalResponse(text: string, tokensUsed: number): LlmEvalResult {
  const upper = text.toUpperCase();

  let decision: EvalDecision = 'skip';
  if (upper.includes('BID')) decision = 'bid';
  else if (upper.includes('RECOMMEND')) decision = 'recommend';

  // Try to extract a bid amount
  let suggestedBidUsdc: number | null = null;
  const bidMatch = text.match(
    /(?:bid|amount|suggest).*?\$?\s*(\d+(?:\.\d+)?)\s*(?:usdc|usd|\$)?/i
  );
  if (bidMatch) {
    suggestedBidUsdc = parseFloat(bidMatch[1]);
  }

  return {
    decision,
    reasoning: text.trim(),
    suggestedBidUsdc,
    tokensUsed,
  };
}

// ── Prompt builder ───────────────────────────────────────────────────

export function buildEvalPrompt(agent: {
  name: string;
  style_tags: string[];
  free_instructions: string | null;
  budget_ceiling_usdc: number | null;
  bid_aggression: string;
  credit_balance_usdc: number;
  persona_bio?: string | null;
  persona_voice?: string | null;
  persona_comm_style?: string | null;
  interest_categories?: { category: string; tags: string[] }[];
}, walletBalance: number, activeBidTotal: number): string {
  const available = (agent.budget_ceiling_usdc ?? walletBalance) - activeBidTotal;

  // Build persona block if any persona fields are set
  const personaParts: string[] = [];
  if (agent.persona_bio) personaParts.push(`Bio: ${agent.persona_bio}`);
  if (agent.persona_voice) personaParts.push(`Voice/tone: ${agent.persona_voice}`);
  if (agent.persona_comm_style) personaParts.push(`Communication style: ${agent.persona_comm_style}`);
  if (agent.interest_categories?.length) {
    const interests = agent.interest_categories
      .map(ic => `${ic.category}: ${ic.tags.join(', ')}`)
      .join('; ');
    personaParts.push(`Interests: ${interests}`);
  }
  const personaBlock = personaParts.length > 0
    ? `\nYour persona:\n${personaParts.map(p => `- ${p}`).join('\n')}\n`
    : '';

  return `You are ${agent.name}, a concierge on the RealReal Genuine marketplace.
${personaBlock}
Your owner's preferences:
- Style tags: ${agent.style_tags.length > 0 ? agent.style_tags.join(', ') : 'none set'}
- Instructions: ${agent.free_instructions ?? 'none'}
- Budget ceiling: ${agent.budget_ceiling_usdc ? `$${agent.budget_ceiling_usdc} USDC per transaction` : 'no limit set'}
- Bid aggression: ${agent.bid_aggression}

Your current state:
- Wallet balance: $${walletBalance.toFixed(2)} USDC
- Active bids consuming budget: $${activeBidTotal.toFixed(2)}
- Available budget: $${available.toFixed(2)}

Evaluate the following drop listing and respond with exactly one of:

SKIP — not relevant to owner's preferences. Explain briefly why.

RECOMMEND — interesting but uncertain. Explain why the owner might want this and suggest a bid amount.

BID $[amount] — matches preferences, bid autonomously. Explain your reasoning and state the exact bid amount.

Your reasoning should be concise (2-3 sentences max). Always state the decision word first on its own line.`;
}
