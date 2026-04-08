'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select, TagSelect } from '@/components/ui/Select';
import { InterestSelector } from './InterestSelector';
import { STYLE_TAGS, VOICE_PRESETS, COMM_STYLE_PRESETS, TIER_DISPLAY, LLM_PROVIDER_OPTIONS } from '@/lib/agent/types';
import type { WizardState } from './CreateAgentWizard';

interface Props {
  state: WizardState;
  update: (partial: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepProfile({ state, update, onNext, onBack }: Props) {
  const [showPersona, setShowPersona] = useState(false);
  const tierLabel = TIER_DISPLAY[state.tier].label;

  const voicePreset = VOICE_PRESETS.some(p => p.value === state.persona_voice) ? state.persona_voice : 'custom';
  const commPreset = COMM_STYLE_PRESETS.some(p => p.value === state.persona_comm_style) ? state.persona_comm_style : 'custom';

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Configure your {tierLabel}</h2>
      <p className="text-neutral-400 mb-6">
        Tell your {tierLabel} what to look for. {state.tier === 'basic'
          ? 'Instructions are parsed into rules — be specific.'
          : `Your ${tierLabel} will interpret these with judgement and adapt over time.`}
      </p>

      <div className="space-y-5 mb-6">
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
              : 'e.g. "I collect deadstock Nike from the 90s-2000s. Willing to pay premium for unworn condition. Skip anything mass-produced unless it\'s genuinely rare."'
          }
          value={state.free_instructions}
          onChange={(e) => update({ free_instructions: e.target.value })}
          hint={
            state.tier === 'basic'
              ? 'These are parsed into rules: price limits, brand/tag whitelists, keyword filters.'
              : `Your ${tierLabel} will use these to reason about each drop.`
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
          label="Bid style"
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
              update({ llm_provider: v as 'claude' | 'deepseek' })
            }
            options={[...LLM_PROVIDER_OPTIONS]}
          />
        )}
      </div>

      {/* Persona section (optional, collapsible) */}
      <div className="border-t border-white/10 pt-5 mb-8">
        <button
          type="button"
          onClick={() => setShowPersona(!showPersona)}
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white/80 transition-colors cursor-pointer mb-4"
        >
          <span className="text-xs">{showPersona ? '▼' : '▶'}</span>
          <span>Persona (optional)</span>
          <span className="text-xs text-white/30">— give your {tierLabel} a personality</span>
        </button>

        {showPersona && (
          <div className="space-y-4">
            <Textarea
              label="Bio"
              placeholder={`Describe who your ${tierLabel} is. What drives them? What's their perspective?`}
              value={state.persona_bio}
              onChange={(e) => update({ persona_bio: e.target.value })}
              hint={`This shapes how your ${tierLabel} approaches decisions and communicates.`}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Select
                  label="Voice / tone"
                  value={voicePreset}
                  onChange={(v) => {
                    update({ persona_voice: v === 'custom' ? '' : v });
                  }}
                  options={VOICE_PRESETS.map(p => ({
                    value: p.value,
                    label: `${p.label} — ${p.description}`,
                  }))}
                />
                {voicePreset === 'custom' && (
                  <Textarea
                    placeholder="Describe the tone you want..."
                    value={state.persona_voice}
                    onChange={(e) => update({ persona_voice: e.target.value })}
                    className="mt-2"
                  />
                )}
              </div>

              <div>
                <Select
                  label="Communication style"
                  value={commPreset}
                  onChange={(v) => {
                    update({ persona_comm_style: v === 'custom' ? '' : v });
                  }}
                  options={COMM_STYLE_PRESETS.map(p => ({
                    value: p.value,
                    label: `${p.label} — ${p.description}`,
                  }))}
                />
                {commPreset === 'custom' && (
                  <Textarea
                    placeholder="Describe how you want it to communicate..."
                    value={state.persona_comm_style}
                    onChange={(e) => update({ persona_comm_style: e.target.value })}
                    className="mt-2"
                  />
                )}
              </div>
            </div>

            <InterestSelector
              selected={state.interest_categories}
              onChange={(ic) => update({ interest_categories: ic })}
            />
          </div>
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
