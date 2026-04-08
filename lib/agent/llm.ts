/**
 * LLM provider abstraction — Claude (Anthropic) and DeepSeek.
 *
 * Used by Concierge agents for chat and drop evaluation.
 * Platform provides the API keys — owner pays per use via Concierge Credits.
 */

import type { LlmProvider, EvalDecision, Agent } from './types';
import { CORE_SYSTEM_PROMPT } from './core-prompt';

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
    case 'deepseek':
      return evaluateWithDeepSeek(systemPrompt, dropDescription);
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

// ── Response parser ──────────────────────────────────────────────────

function parseEvalResponse(text: string, tokensUsed: number): LlmEvalResult {
  const upper = text.toUpperCase();

  let decision: EvalDecision = 'skip';
  if (upper.includes('BID')) decision = 'bid';
  else if (upper.includes('RECOMMEND')) decision = 'recommend';

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

// ── Prompt builder (evaluation) ─────────────────────────────────────

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

// ── Chat prompt builder ─────────────────────────────────────────────

export function buildChatPrompt(agent: Agent, isEvalPreview: boolean, memoriesBlock = ''): string {
  const personaParts: string[] = [];
  if (agent.persona_bio) personaParts.push(`Bio: ${agent.persona_bio}`);
  if (agent.persona_voice) personaParts.push(`Voice/tone: ${agent.persona_voice}`);
  if (agent.persona_comm_style) personaParts.push(`Communication style: ${agent.persona_comm_style}`);
  if (agent.interest_categories?.length) {
    const interests = agent.interest_categories
      .map((ic: { category: string; tags: string[] }) => `${ic.category}: ${ic.tags.join(', ')}`)
      .join('; ');
    personaParts.push(`Interests: ${interests}`);
  }
  const personaBlock = personaParts.length > 0
    ? `\nYour persona:\n${personaParts.map(p => `- ${p}`).join('\n')}\n`
    : '';

  const styleBlock = agent.style_tags.length > 0
    ? `\nStyle preferences: ${agent.style_tags.join(', ')}`
    : '';

  const instructionBlock = agent.free_instructions
    ? `\nOwner instructions: ${agent.free_instructions}`
    : '';

  const evalAugment = isEvalPreview
    ? `\n\nWhen the user describes or pastes a drop listing, evaluate it and respond with your recommendation: SKIP, RECOMMEND, or BID with a suggested amount. Explain your reasoning.`
    : '';

  return `${CORE_SYSTEM_PROMPT}

## Your identity

You are ${agent.name}.
${personaBlock}${styleBlock}${instructionBlock}
${memoriesBlock}
${evalAugment}`.trim();
}

// ── Chat message type ───────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Streaming chat response ─────────────────────────────────────────

export async function streamChatResponse(
  provider: LlmProvider,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<{ stream: ReadableStream<string>; getTokensUsed: () => number }> {
  switch (provider) {
    case 'claude':
      return streamClaude(systemPrompt, messages);
    case 'deepseek':
      return streamDeepSeek(systemPrompt, messages);
  }
}

async function streamClaude(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<{ stream: ReadableStream<string>; getTokensUsed: () => number }> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let tokensUsed = 0;

  const anthropicStream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });

  const stream = new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const event of anthropicStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(event.delta.text);
          }
          if (event.type === 'message_delta' && event.usage) {
            tokensUsed += event.usage.output_tokens ?? 0;
          }
          if (event.type === 'message_start' && event.message.usage) {
            tokensUsed += event.message.usage.input_tokens ?? 0;
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return { stream, getTokensUsed: () => tokensUsed };
}

async function streamDeepSeek(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<{ stream: ReadableStream<string>; getTokensUsed: () => number }> {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com',
  });

  let tokensUsed = 0;

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: 1024,
    stream: true,
    stream_options: { include_usage: true },
    messages: [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ],
  });

  const stream = new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const chunk of response) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) controller.enqueue(delta);
          if (chunk.usage) {
            tokensUsed = (chunk.usage.prompt_tokens ?? 0) + (chunk.usage.completion_tokens ?? 0);
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return { stream, getTokensUsed: () => tokensUsed };
}
