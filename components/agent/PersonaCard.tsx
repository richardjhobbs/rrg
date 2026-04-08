'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { InterestSelector } from './InterestSelector';
import { VOICE_PRESETS, COMM_STYLE_PRESETS, TIER_DISPLAY } from '@/lib/agent/types';
import type { Agent, InterestSelection } from '@/lib/agent/types';

interface Props {
  agent: Agent;
  onSave: (updates: Partial<Agent>) => Promise<void>;
}

interface PersonaForm {
  persona_bio: string;
  persona_voice: string;
  persona_comm_style: string;
  interest_categories: InterestSelection[];
}

export function PersonaCard({ agent, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PersonaForm>({
    persona_bio: '',
    persona_voice: '',
    persona_comm_style: '',
    interest_categories: [],
  });

  const tierLabel = TIER_DISPLAY[agent.tier].label;

  function startEdit() {
    setForm({
      persona_bio: agent.persona_bio || '',
      persona_voice: agent.persona_voice || '',
      persona_comm_style: agent.persona_comm_style || '',
      interest_categories: agent.interest_categories || [],
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({
        persona_bio: form.persona_bio || null,
        persona_voice: form.persona_voice || null,
        persona_comm_style: form.persona_comm_style || null,
        interest_categories: form.interest_categories,
      } as Partial<Agent>);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const hasPersona = agent.persona_bio || agent.persona_voice || agent.persona_comm_style || (agent.interest_categories?.length > 0);

  // Check if the current voice/comm_style matches a preset
  const voiceIsPreset = VOICE_PRESETS.some(p => p.value === agent.persona_voice);
  const commIsPreset = COMM_STYLE_PRESETS.some(p => p.value === agent.persona_comm_style);

  // Determine select value for form
  const formVoicePreset = VOICE_PRESETS.some(p => p.value === form.persona_voice) ? form.persona_voice : 'custom';
  const formCommPreset = COMM_STYLE_PRESETS.some(p => p.value === form.persona_comm_style) ? form.persona_comm_style : 'custom';

  return (
    <Card className="md:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold">Persona</h2>
          <p className="text-xs text-white/40 mt-0.5">
            Shape how your {tierLabel} thinks, communicates, and understands you
          </p>
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="text-xs text-green-400 hover:text-green-300 transition-colors cursor-pointer"
          >
            {hasPersona ? 'Edit' : 'Set up'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <Textarea
            label="Bio"
            placeholder={`Describe your ${tierLabel}'s personality. Who are they? What drives them?`}
            value={form.persona_bio}
            onChange={(e) => setForm(prev => ({ ...prev, persona_bio: e.target.value }))}
            hint={`This shapes how your ${tierLabel} presents itself and approaches decisions.`}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Select
                label="Voice / tone"
                value={formVoicePreset}
                onChange={(v) => {
                  if (v === 'custom') {
                    setForm(prev => ({ ...prev, persona_voice: '' }));
                  } else {
                    setForm(prev => ({ ...prev, persona_voice: v }));
                  }
                }}
                options={VOICE_PRESETS.map(p => ({
                  value: p.value,
                  label: `${p.label} — ${p.description}`,
                }))}
              />
              {formVoicePreset === 'custom' && (
                <Textarea
                  placeholder="Describe the tone you want..."
                  value={form.persona_voice}
                  onChange={(e) => setForm(prev => ({ ...prev, persona_voice: e.target.value }))}
                  className="mt-2"
                />
              )}
            </div>

            <div>
              <Select
                label="Communication style"
                value={formCommPreset}
                onChange={(v) => {
                  if (v === 'custom') {
                    setForm(prev => ({ ...prev, persona_comm_style: '' }));
                  } else {
                    setForm(prev => ({ ...prev, persona_comm_style: v }));
                  }
                }}
                options={COMM_STYLE_PRESETS.map(p => ({
                  value: p.value,
                  label: `${p.label} — ${p.description}`,
                }))}
              />
              {formCommPreset === 'custom' && (
                <Textarea
                  placeholder="Describe how you want it to communicate..."
                  value={form.persona_comm_style}
                  onChange={(e) => setForm(prev => ({ ...prev, persona_comm_style: e.target.value }))}
                  className="mt-2"
                />
              )}
            </div>
          </div>

          <InterestSelector
            selected={form.interest_categories}
            onChange={(ic) => setForm(prev => ({ ...prev, interest_categories: ic }))}
          />

          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={save} loading={saving}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : hasPersona ? (
        <div className="space-y-3 text-sm">
          {agent.persona_bio && (
            <div>
              <div className="text-white/40 mb-1">Bio</div>
              <div className="text-white/80">{agent.persona_bio}</div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {agent.persona_voice && (
              <div>
                <div className="text-white/40 mb-1">Voice</div>
                <div className="text-white/80 capitalize">{agent.persona_voice.replace(/-/g, ' ')}</div>
              </div>
            )}
            {agent.persona_comm_style && (
              <div>
                <div className="text-white/40 mb-1">Communication</div>
                <div className="text-white/80 capitalize">{agent.persona_comm_style.replace(/-/g, ' ')}</div>
              </div>
            )}
          </div>
          {agent.interest_categories?.length > 0 && (
            <div>
              <div className="text-white/40 mb-1">Interests</div>
              <div className="space-y-1">
                {agent.interest_categories.map(ic => (
                  <div key={ic.category} className="flex flex-wrap gap-1">
                    <span className="text-white/50 text-xs mr-1">{ic.category}:</span>
                    {ic.tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 text-xs border border-green-500/30 text-green-400/80 rounded-full">
                        {tag.replace(/-/g, ' ')}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-white/40">
          No persona configured yet. Set one up to give your {tierLabel} a distinct personality and voice.
        </p>
      )}
    </Card>
  );
}
