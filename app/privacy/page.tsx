import type { Metadata } from 'next';
import RRGHeader from '@/components/rrg/RRGHeader';
import RRGFooter from '@/components/rrg/RRGFooter';

export const metadata: Metadata = {
  title: 'Privacy Policy — Real Real Genuine',
};

const sections = [
  { num: '01', title: 'What We Collect', content: 'When you use RRG, we may collect:', list: ['Your wallet address (public, on-chain)', 'Transaction details (payment amount, token ID, timestamp)', 'Email address, if you choose to provide one', 'Style preferences and instructions you set for your Personal Shopper or Concierge'], after: 'We do not require an account or personal profile to browse or purchase.' },
  { num: '02', title: 'How We Use Your Data', content: 'We use collected information to:', list: ['Process and deliver your purchases', 'Provide access to downloadable files attached to your product', 'Power your Personal Shopper or Concierge preferences and memory', 'Communicate about your order if needed', 'Improve the platform'] },
  { num: '03', title: 'On-Chain Data', content: 'Your wallet address and purchase transactions are recorded on the Base blockchain. This data is public and permanent by design — it is not controlled by RRG and cannot be deleted.' },
  { num: '04', title: 'Concierge Data', content: 'If you use the Concierge service, your chat conversations and extracted preferences are stored to improve your experience over time. This data is linked to your agent account and can be deleted on request.' },
  { num: '05', title: 'Cookies', content: 'We use minimal cookies for essential site functionality (authentication sessions, preferences). We do not use third-party advertising or tracking cookies.' },
  { num: '06', title: 'Third-Party Services', content: 'We use third-party services for payment processing, file storage, LLM providers (for Concierge chat), and hosting. These providers are bound by their own privacy policies and process your data only as needed to deliver our service.' },
  { num: '07', title: 'Data Security', content: 'We take reasonable steps to protect your information. However, no system is completely secure and we cannot guarantee absolute protection.' },
  { num: '08', title: 'Your Rights', content: 'You may request access to, correction of, or deletion of your personal data (excluding on-chain records) by contacting us. We will respond in accordance with applicable law.' },
  { num: '09', title: 'Children', content: 'RRG is not directed at anyone under 16. We do not knowingly collect information from children.' },
  { num: '10', title: 'Changes', content: 'We may update this policy. The latest version is always available at this page.' },
  { num: '11', title: 'Contact', content: 'Questions about your privacy? Reach us at contact@realrealgenuine.com' },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <RRGHeader />
      <main className="px-6 py-12 max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-2">Legal</p>
        <h1 className="text-3xl font-light mb-2">Privacy Policy</h1>
        <p className="text-xs text-white/30 mb-12">Last updated: 12 March 2026</p>

        <div className="space-y-8">
          {sections.map((s) => (
            <div key={s.num} className="border-b border-white/5 pb-8 last:border-0">
              <p className="text-xs text-white/20 mb-1">{s.num}</p>
              <h2 className="text-sm font-semibold text-white/80 mb-2">{s.title}</h2>
              <p className="text-sm text-white/45 leading-relaxed">{s.content}</p>
              {s.list && (
                <ul className="mt-2 space-y-1 pl-5 list-disc text-sm text-white/45">
                  {s.list.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              )}
              {s.after && (
                <p className="text-sm text-white/45 mt-2">{s.after}</p>
              )}
            </div>
          ))}
        </div>
      </main>
      <RRGFooter />
    </div>
  );
}
