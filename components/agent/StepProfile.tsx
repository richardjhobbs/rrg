'use client';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select, TagSelect } from '@/components/ui/Select';
import { STYLE_TAGS } from '@/lib/agent/types';
import type { WizardState } from './CreateAgentWizard';

interface Props {
  state: WizardState;
  update: (partial: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepProfile({ state, update, onNext, onBack }: Props) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Configure preferences</h2>
      <p className="text-neutral-400 mb-6">
        Tell your agent what to look for. {state.tier === 'basic'
          ? 'Instructions are parsed into rules — be specific.'
          : 'The LLM will interpret these with judgment.'}
      </p>

      <div className="space-y-5 mb-8">
        <TagSelect
          label="Style tags"
          selected={state.style_tags}
          onChange={(tags) => update({ style_tags: tags })}
          options={[...STYLE_TAGS]}
        />

        <Textarea
          label="Instructions"
          placeholder={
            state.tier === 'basic'
              ? 'e.g. "Only streetwear. Never bid over $200. Skip luxury brands. Prefer deadstock."'
              : 'e.g. "I collect deadstock Nike from the 90s-2000s. Willing to pay premium for unworn condition. Skip anything mass-produced or collaborative unless it\'s a genuinely rare piece."'
          }
          value={state.free_instructions}
          onChange={(e) => update({ free_instructions: e.target.value })}
          hint={
            state.tier === 'basic'
              ? 'These are parsed into rules: price limits, brand/tag whitelists, keyword filters.'
              : 'Your LLM agent will use these to reason about each drop.'
          }
        />

        <Input
          label="Budget ceiling (USDC per transaction)"
          type="number"
          placeholder="e.g. 500"
          value={state.budget_ceiling_usdc}
          onChange={(e) => update({ budget_ceiling_usdc: e.target.value })}
        />

        <Select
          label="Bid aggression"
          value={state.bid_aggression}
          onChange={(v) =>
            update({
              bid_aggression: v as 'conservative' | 'balanced' | 'aggressive',
            })
          }
          options={[
            {
              value: 'conservative',
              label: 'Conservative — bid at or near reserve price',
            },
            {
              value: 'balanced',
              label: 'Balanced — bid at midpoint between reserve and ceiling',
            },
            {
              value: 'aggressive',
              label: 'Aggressive — bid at ceiling immediately',
            },
          ]}
        />

        {state.tier === 'pro' && (
          <Select
            label="LLM provider"
            value={state.llm_provider}
            onChange={(v) =>
              update({ llm_provider: v as 'claude' | 'openai' | 'gemini' | 'deepseek' | 'qwen' })
            }
            options={[
              { value: 'claude', label: 'Claude (Anthropic)' },
              { value: 'openai', label: 'GPT-4o (OpenAI)' },
              { value: 'gemini', label: 'Gemini (Google)' },
              { value: 'deepseek', label: 'DeepSeek' },
              { value: 'qwen', label: 'Qwen (Alibaba)' },
            ]}
          />
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>Review</Button>
      </div>
    </div>
  );
}
