'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import RRGHeader from '@/components/rrg/RRGHeader';
import RRGFooter from '@/components/rrg/RRGFooter';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Stepper } from '@/components/ui/Stepper';
import { StepRegistration } from '@/components/agent/StepRegistration';
import { StepProfile } from '@/components/agent/StepProfile';
import { StepReview } from '@/components/agent/StepReview';
import { TIER_DISPLAY } from '@/lib/agent/types';
import type { AgentTier, WizardState } from '@/lib/agent/types';

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

const WIZARD_STEPS = ['Service', 'Registration', 'Profile', 'Review'];

export default function AgentsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasAgent, setHasAgent] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentTier, setAgentTier] = useState<AgentTier>('basic');

  // Wizard state
  const [wizardActive, setWizardActive] = useState(false);
  const [step, setStep] = useState(1); // Start at step 1 (Registration), tier chosen on landing
  const [state, setState] = useState<WizardState>(initialState);
  const [agentId, setAgentId] = useState<string | null>(null);

  const update = (partial: Partial<WizardState>) =>
    setState((prev) => ({ ...prev, ...partial }));
  const next = () => setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  const back = () => {
    if (step === 1) {
      setWizardActive(false);
    } else {
      setStep((s) => Math.max(s - 1, 1));
    }
  };

  // Check for existing session on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agent/session');
        if (res.ok) {
          const { agent } = await res.json();
          setHasAgent(true);
          setAgentName(agent.name);
          setAgentTier(agent.tier);
          // Auto-redirect to dashboard
          router.push('/agents/dashboard');
          return;
        }
      } catch {}
      setChecking(false);
    })();
  }, [router]);

  function selectTier(tier: AgentTier) {
    setState(prev => ({ ...prev, tier }));
    setStep(1);
    setWizardActive(true);
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-black text-white">
        <RRGHeader active="agent" />
        <main className="px-6 py-16 max-w-4xl mx-auto">
          <p className="text-white/50 animate-pulse">Loading...</p>
        </main>
        <RRGFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <RRGHeader active="agent" />
      <main className="px-6 py-12 max-w-4xl mx-auto">

        {!wizardActive ? (
          <>
            {/* ── Landing: tier selection ──────────────────────────── */}
            <h1 className="text-3xl font-light mb-4">
              Your Personal Shopper. Your Concierge.
            </h1>
            <p className="text-base text-white/60 mb-10">
              Start with a Personal Shopper that handles the basics — finding,
              filtering, and surfacing what matches your taste on Real Real Genuine.
              Upgrade to a Concierge that learns your style, negotiates on your
              behalf, and acts with judgement. You set the rules. They do the work.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Personal Shopper */}
              <Card
                className="cursor-pointer hover:border-green-500/50 transition-colors"
                onClick={() => selectTier('basic')}
              >
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-base font-semibold">Personal Shopper</h3>
                  <Badge>Free</Badge>
                </div>
                <p className="text-sm text-white/60 mb-4">
                  Works on the preferences you set. Finds, filters, and surfaces
                  what matches. Like having someone on retainer at your favourite store.
                </p>
                <ul className="text-sm text-white/50 space-y-1 mb-4">
                  <li>&bull; Works on your set preferences and criteria</li>
                  <li>&bull; Automatic bidding when rules match</li>
                  <li>&bull; Wallet and trusted ERC-8004 identity</li>
                  <li>&bull; Dashboard and email notifications</li>
                </ul>
                <div className="flex justify-center">
                  <span className="bg-green-500 text-black rounded-lg px-5 py-2 font-medium text-sm">
                    Get started free
                  </span>
                </div>
              </Card>

              {/* Concierge */}
              <Card
                className="cursor-pointer hover:border-purple-500/50 transition-colors"
                onClick={() => selectTier('pro')}
              >
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-base font-semibold">Concierge</h3>
                  <Badge variant="pro">Credit-based</Badge>
                </div>
                <p className="text-sm text-white/60 mb-4">
                  Learns your taste, understands nuance, and negotiates on your
                  behalf. Powered by Claude or DeepSeek. The relationship deepens over time.
                </p>
                <ul className="text-sm text-white/50 space-y-1 mb-4">
                  <li>&bull; Chat with your Concierge directly</li>
                  <li>&bull; Learns your style over time</li>
                  <li>&bull; Reasoned recommendations with explanations</li>
                  <li>&bull; Falls back to Personal Shopper when credits run out</li>
                </ul>
                <div className="flex justify-center">
                  <span className="bg-purple-500 text-white rounded-lg px-5 py-2 font-medium text-sm">
                    Get started with Concierge
                  </span>
                </div>
              </Card>
            </div>

            {/* Already signed up CTA */}
            <div className="flex justify-center">
              <button
                onClick={() => router.push('/agents/dashboard')}
                className="text-sm text-white/40 hover:text-green-400 transition-colors cursor-pointer border border-white/10 hover:border-green-500/30 rounded-lg px-6 py-2.5"
              >
                ALREADY SIGNED UP? Go to your dashboard &rarr;
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ── Wizard: Registration → Profile → Review ─────────── */}
            <div className="max-w-2xl mx-auto">
              <Stepper steps={WIZARD_STEPS} currentStep={step} />

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
          </>
        )}
      </main>
      <RRGFooter />
    </div>
  );
}
