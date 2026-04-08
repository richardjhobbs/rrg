import type { Metadata } from 'next';
import RRGHeader from '@/components/rrg/RRGHeader';
import RRGFooter from '@/components/rrg/RRGFooter';

export const metadata: Metadata = {
  title: 'Terms of Service — Real Real Genuine',
};

const sections = [
  { num: '01', title: 'What is RRG?', content: 'RRG (Real Real Genuine) is a platform where you can purchase limited-edition digital and physical products. Each digital product is minted on-chain as an ERC-1155 token on Base and paid for in USDC.' },
  { num: '02', title: 'What You\'re Buying', content: 'When you purchase a product on RRG, you receive:', list: ['An on-chain token representing your edition', 'Access to download any digital files attached to that product', 'Proof of ownership recorded on the Base blockchain'], after: 'Some products include physical items that will be shipped to you. Details are listed on each product page.' },
  { num: '03', title: 'Payments', content: 'All prices are listed in USDC. Payment is made via your connected wallet. Once a transaction is confirmed on-chain, the purchase is final.' },
  { num: '04', title: 'Refunds', content: 'Because products are delivered instantly as on-chain tokens, refunds are not available. If you experience a technical issue with delivery, contact us and we\'ll work to resolve it.' },
  { num: '05', title: 'Your Rights as a Buyer', content: 'You own your edition. You may hold, display, or transfer your token. You may not:', list: ['Reproduce or redistribute the attached digital files', 'Claim authorship of the underlying design or artwork', 'Use the product for commercial purposes unless the product listing explicitly permits it'] },
  { num: '06', title: 'Editions and Availability', content: 'Each product has a fixed edition size set by the creator and brand partner. Once all editions are sold, no more will be minted. Edition sizes cannot be changed after the first sale.' },
  { num: '07', title: 'Wallet Responsibility', content: 'You are responsible for your own wallet, private keys, and any transactions you authorise. RRG cannot recover lost tokens or reverse on-chain transactions.' },
  { num: '08', title: 'Limitation of Liability', content: 'RRG is provided as-is. To the fullest extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of the platform or any purchased product.' },
  { num: '09', title: 'Changes to Terms', content: 'We may update these terms. The latest version is always available at this page. Continued use of RRG after changes constitutes acceptance.' },
  { num: '10', title: 'Brand Partners and Creators', content: 'Separate terms apply to Brand Partners and Creators who publish products on RRG. These are available on request — contact contact@realrealgenuine.com', highlight: true },
  { num: '11', title: 'Contact', content: 'Questions about these terms or your purchase? Reach us at contact@realrealgenuine.com' },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <RRGHeader />
      <main className="px-6 py-12 max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-2">Legal</p>
        <h1 className="text-3xl font-light mb-2">Terms of Service</h1>
        <p className="text-xs text-white/30 mb-12">Last updated: 12 March 2026</p>

        <div className="space-y-8">
          {sections.map((s) => (
            <div key={s.num} className="border-b border-white/5 pb-8 last:border-0">
              <p className="text-xs text-white/20 mb-1">{s.num}</p>
              <h2 className="text-sm font-semibold text-white/80 mb-2">{s.title}</h2>
              <p className={`text-sm leading-relaxed ${s.highlight ? 'border-l-2 border-white/15 pl-4 text-white/50' : 'text-white/45'}`}>
                {s.content}
              </p>
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
