'use client';

import { useState } from 'react';
import { Stepper } from '@/components/ui/Stepper';
import { StepTier } from './StepTier';
import { StepRegistration } from './StepRegistration';
import { StepProfile } from './StepProfile';
import { StepReview } from './StepReview';
import type { AgentTier, BidAggression, LlmProvider, InterestSelection } from '@/lib/agent/types';

const STEPS = ['Tier', 'Registration', 'Profile', 'Review'];

export interface WizardState {
  tier: AgentTier;
  email: string;
  name: string;
  wallet_address: string;
  wallet_type: 'embedded' | 'imported';
  style_tags: string[];
  free_instructions: string;
  budget_ceiling_usdc: string;
  bid_aggression: BidAggression;
  llm_provider: LlmProvider;
  persona_bio: string;
  persona_voice: string;
  persona_comm_style: string;
  interest_categories: InterestSelection[];
}

const initialState: WizardState = {
  tier: 'basic',
  email: '',
  name: '',
  wallet_address: '',
  wallet_type: 'embedded',
  style_tags: [],
  free_instructions: '',
  budget_ceiling_usdc: '',
  bid_aggression: 'balanced',
  llm_provider: 'claude',
  persona_bio: '',
  persona_voice: '',
  persona_comm_style: '',
  interest_categories: [],
};

export function CreateAgentWizard() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(initialState);
  const [agentId, setAgentId] = useState<string | null>(null);

  const update = (partial: Partial<WizardState>) =>
    setState((prev) => ({ ...prev, ...partial }));

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="max-w-2xl mx-auto">
      <Stepper steps={STEPS} currentStep={step} />

      {step === 0 && (
        <StepTier state={state} update={update} onNext={next} />
      )}
      {step === 1 && (
        <StepRegistration
          state={state}
          update={update}
          onNext={next}
          onBack={back}
        />
      )}
      {step === 2 && (
        <StepProfile
          state={state}
          update={update}
          onNext={next}
          onBack={back}
        />
      )}
      {step === 3 && (
        <StepReview
          state={state}
          onBack={back}
          onComplete={(id) => setAgentId(id)}
          agentId={agentId}
        />
      )}
    </div>
  );
}
