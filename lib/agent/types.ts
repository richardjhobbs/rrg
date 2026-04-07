// ── Agent ─────────────────────────────────────────────────────────────

export type AgentTier = 'basic' | 'pro';
export type BidAggression = 'conservative' | 'balanced' | 'aggressive';
export type WalletType = 'embedded' | 'imported';
export type LlmProvider = 'claude' | 'openai' | 'gemini' | 'deepseek' | 'qwen';
export type AgentStatus = 'active' | 'suspended' | 'archived';

export interface Agent {
  id: string;
  created_at: string;
  updated_at: string;
  email: string;
  name: string;
  tier: AgentTier;
  style_tags: string[];
  free_instructions: string | null;
  parsed_rules: AgentRules;
  budget_ceiling_usdc: number | null;
  bid_aggression: BidAggression;
  wallet_address: string;
  wallet_type: WalletType;
  llm_provider: LlmProvider;
  credit_balance_usdc: number;
  erc8004_agent_id: number | null;
  erc8004_linked: boolean;
  status: AgentStatus;
  last_active_at: string | null;
  last_poll_at: string | null;
}

// ── Rules (Basic agent) ──────────────────────────────────────────────

export interface AgentRules {
  tagWhitelist: string[];
  tagBlacklist: string[];
  brandWhitelist: string[];
  brandBlacklist: string[];
  maxPriceUsdc: number | null;
  minPriceUsdc: number | null;
  keywords: string[];
  keywordBlacklist: string[];
}

export const EMPTY_RULES: AgentRules = {
  tagWhitelist: [],
  tagBlacklist: [],
  brandWhitelist: [],
  brandBlacklist: [],
  maxPriceUsdc: null,
  minPriceUsdc: null,
  keywords: [],
  keywordBlacklist: [],
};

// ── Evaluation ───────────────────────────────────────────────────────

export type EvalDecision = 'skip' | 'recommend' | 'bid';

export interface AgentEvaluation {
  id: string;
  created_at: string;
  agent_id: string;
  drop_id: string;
  decision: EvalDecision;
  reasoning: string | null;
  rule_match_detail: Record<string, unknown> | null;
  suggested_bid_usdc: number | null;
  llm_tokens_used: number | null;
  llm_cost_usdc: number | null;
  owner_notified: boolean;
  owner_approved: boolean | null;
}

// ── Activity Log ─────────────────────────────────────────────────────

export interface ActivityLogEntry {
  id: string;
  created_at: string;
  agent_id: string;
  action: string;
  details: Record<string, unknown>;
  tx_hash: string | null;
}

// ── Credits ──────────────────────────────────────────────────────────

export type CreditTxType = 'topup' | 'deduction' | 'refund';

export interface CreditTransaction {
  id: string;
  created_at: string;
  agent_id: string;
  type: CreditTxType;
  amount_usdc: number;
  balance_after: number;
  description: string | null;
  tx_hash: string | null;
}

// ── Drops (Phase 2) ──────────────────────────────────────────────────

export type BrandStatus = 'pending' | 'approved' | 'suspended';
export type FulfilmentModel = 'shipping_included' | 'shipping_separate';
export type DropStatus =
  | 'draft'
  | 'scheduled'
  | 'live'
  | 'closed'
  | 'settling'
  | 'settled'
  | 'cancelled';
export type BidStatus =
  | 'submitted'
  | 'won'
  | 'lost'
  | 'settled'
  | 'failed';
export type SettlementStatus = 'pending' | 'completed' | 'failed';

export interface DropBrand {
  id: string;
  created_at: string;
  name: string;
  slug: string;
  description: string | null;
  website_url: string | null;
  contact_email: string;
  wallet_address: string;
  status: BrandStatus;
  verified_by: string | null;
  verified_at: string | null;
}

export interface DropListing {
  id: string;
  created_at: string;
  brand_id: string;
  title: string;
  description: string | null;
  content: string | null;
  image_urls: string[];
  quantity: number;
  reserve_price_usdc: number;
  ceiling_price_usdc: number | null;
  platform_fee_pct: number;
  fulfilment_model: FulfilmentModel;
  shipping_cost_usdc: number | null;
  shipping_details: Record<string, unknown>;
  bid_window_minutes: number;
  launch_at: string;
  closes_at: string | null;
  status: DropStatus;
}

export interface DropBid {
  id: string;
  created_at: string;
  drop_id: string;
  agent_id: string | null;
  agent_wallet: string;
  agent_erc8004_id: number;
  bid_amount_usdc: number;
  permit_data: Record<string, unknown> | null;
  is_external: boolean;
  status: BidStatus;
  settlement_tx_hash: string | null;
  settled_at: string | null;
}

export interface DropSettlement {
  id: string;
  created_at: string;
  bid_id: string;
  drop_id: string;
  buyer_wallet: string;
  seller_wallet: string;
  total_usdc: number;
  platform_fee_usdc: number;
  seller_receives_usdc: number;
  tx_hash: string | null;
  status: SettlementStatus;
}

// ── Style tag taxonomy ───────────────────────────────────────────────

export const STYLE_TAGS = [
  'streetwear',
  'luxury',
  'sportswear',
  'minimalist',
  'avant-garde',
  'vintage',
  'deadstock',
  'sneakers',
  'accessories',
  'outerwear',
  'denim',
  'tailoring',
  'workwear',
  'techwear',
  'sustainable',
  'unisex',
  'limited-edition',
  'collaboration',
  'artisan',
  'contemporary',
  'heritage',
  'emerging-designer',
  'basics',
  'statement-pieces',
] as const;

export type StyleTag = (typeof STYLE_TAGS)[number];
