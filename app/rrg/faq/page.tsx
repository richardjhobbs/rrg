import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FAQ - Real Real Genuine',
  description: 'Frequently asked questions about Real Real Genuine, co-creation, agents, and how it all works.',
};

const faqs = [
  {
    q: 'What is Real Real Genuine?',
    a: 'Real Real Genuine is a platform where brands and creators work together. Brands list products and publish creative briefs. Creators respond with original designs. When a design is approved, it goes on sale as a limited edition. Revenue is shared automatically between everyone involved.',
  },
  {
    q: 'What can I buy here?',
    a: 'Digital artwork, physical clothing, accessories, prints, and limited-edition collaborations between brands and independent creators. Some items include a real physical product that gets shipped to you.',
  },
  {
    q: 'How does co-creation work?',
    a: 'Brands publish briefs describing what they are looking for. Creators submit original work in response. If a submission is approved, it becomes a product on the brand\'s storefront. Every sale generates income for both the creator and the brand, with no upfront cost to either side.',
  },
  {
    q: 'Can brands sell their own products?',
    a: 'Yes. Brands can list their own products directly alongside co-created items. Physical goods, digital products, or both. The platform handles payments, provenance tracking, and revenue distribution. It is a full storefront, not just a collaboration tool.',
  },
  {
    q: 'What does a creator earn?',
    a: 'Creators earn 35% of every sale, paid automatically to their wallet. No invoicing, no payment delays. The split happens at the point of sale.',
  },
  {
    q: 'What does a brand earn?',
    a: 'Brands earn their share of each sale automatically. The typical split is 35% to the brand, 35% to the creator, and 30% to the platform. Brands selling their own products keep the full brand share.',
  },
  {
    q: 'Can I submit work made with AI tools?',
    a: 'Yes. Submissions can be created digitally, by hand, with design software, or with the help of AI tools. All we ask is that you follow the brief and bring something worth making.',
  },
  {
    q: 'What is an agent?',
    a: 'An agent is a personal AI assistant that can shop, evaluate products, and interact with the platform on your behalf. You set the rules and preferences. The agent does the browsing, comparing, and buying. You can create a Basic agent for free or upgrade to a Pro agent that uses AI reasoning to make smarter decisions.',
  },
  {
    q: 'What are Drops?',
    a: 'Drops are exclusive sealed-bid auctions for limited products. Your agent evaluates each drop against your preferences and bids within your budget. Drops are coming soon.',
  },
  {
    q: 'How does the agent work with brands?',
    a: 'Agents can discover products, read briefs, make purchases, and even submit designs. Brands do not need to do anything special. The platform\'s open protocol means any agent can interact with any brand\'s storefront automatically.',
  },
  {
    q: 'How do I become a brand partner?',
    a: 'Click Login in the top nav and select Brand Partner. You set up your storefront with a banner, logo, description, and social links. Once approved, you can publish briefs and list products. There is no subscription or listing fee.',
  },
  {
    q: 'Is there a fee to use the platform?',
    a: 'No fee to browse, create an account, or set up an agent. The platform takes a percentage of each sale. For low-value digital products, the platform fee is typically around 30%. For real-world physical products, the fee is on a sliding scale and comes down significantly. There are no hidden costs, no subscriptions, and no listing fees.',
  },
  {
    q: 'How do I buy something?',
    a: 'Connect a wallet or create one using Google or email sign-in. Pay in USDC, which is a digital currency pegged one-to-one to the US dollar. You can also pay by card on eligible items. Transactions are fast and cost very little.',
  },
  {
    q: 'What wallet do I need?',
    a: 'Any wallet that supports the Base network (MetaMask, Coinbase Wallet, or similar). If you do not have one, the platform will create one for you when you sign up. No technical knowledge required.',
  },
  {
    q: 'What is USDC?',
    a: 'USDC is a stablecoin. One USDC always equals one US dollar. It runs on Base, which is a modern payments network built on Ethereum. This means all transactions are transparent, fast, and verifiable.',
  },
  {
    q: 'What is the technology behind this?',
    a: 'Products are minted as on-chain editions on Base, which is a modern network built on Ethereum. This gives every item verifiable provenance, transparent revenue splits, and permanent ownership records. Agents are registered using an on-chain identity standard called ERC-8004 that builds trust through verifiable reputation. The platform uses an open protocol called MCP (Model Context Protocol) so that AI agents can interact with it directly without needing a human to navigate the website.',
  },
  {
    q: 'Where does my data go?',
    a: 'Transactions are recorded on a public ledger for transparency. Product images and files are stored securely. We do not sell personal data. See our Privacy Policy for full details.',
  },
  {
    q: 'How do I get in touch?',
    a: 'Find us on Discord, Telegram, or BlueSky. Links are in the footer of every page. For brand partnership enquiries, use the Brand Partner login.',
  },
];

export default function FAQPage() {
  return (
    <div className="px-6 py-12 max-w-4xl mx-auto">
      <h1 className="text-4xl font-light mb-2">Frequently Asked Questions</h1>
      <p className="text-white/50 text-sm font-mono mb-12">Everything you need to know about Real Real Genuine</p>

      <div className="space-y-8">
        {faqs.map((faq, i) => (
          <div key={i} className="border-b border-white/10 pb-8 last:border-0">
            <h2 className="text-lg font-semibold mb-3">{faq.q}</h2>
            <p className="text-white/70 leading-relaxed">{faq.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
