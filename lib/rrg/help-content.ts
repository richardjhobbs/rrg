/**
 * Centralized help content for HelpTip components across the app.
 * Edit text here — all help tips update automatically.
 */

// ── Brand Login / Signup ─────────────────────────────────────────────
export const brandLogin = {
  googleAuth: {
    title: 'Google Sign-In',
    content: 'Sign in with your Google account to get started. This creates a secure session linked to your email. If you\'re new, you\'ll be guided through brand registration after signing in.',
  },
  brandName: {
    title: 'Brand Name',
    content: 'Enter the name your brand will be known by on the platform. This appears on your storefront, in drop listings, and on social posts. You can update it later in your brand settings.',
  },
  walletChoice: {
    title: 'Wallet Setup',
    content: 'Your wallet receives USDC payments when your drops sell.\n\nUse your own wallet: If you already have an Ethereum-compatible wallet (MetaMask, Coinbase Wallet, etc.), paste the address here. You keep full control.\n\nCreate a new wallet: We\'ll generate an embedded wallet linked to your Google account. Simple, but you can switch to your own wallet later.',
  },
  applicationText: {
    title: 'Application',
    content: 'Tell us about your brand — what you create, your style, and why you want to join the platform. This helps our team review your application. There are no wrong answers — we\'re looking for original brands with a clear point of view.',
  },
  pendingApproval: {
    title: 'Pending Approval',
    content: 'Your application is being reviewed by the team. This usually takes 24-48 hours. You\'ll receive an email when your brand is approved. If you need to make changes, contact us.',
  },
};

// ── Brand Admin Dashboard ────────────────────────────────────────────
export const brandAdmin = {
  submissions: {
    title: 'Submissions',
    content: 'View and manage all submissions from creators responding to your briefs. You can approve, reject, or request changes. Approved submissions become live drops on your storefront.',
  },
  drops: {
    title: 'Live Drops',
    content: 'Your approved drops that are live on the storefront. Each drop shows sales, remaining editions, and revenue. Drops are purchasable by both humans and AI agents.',
  },
  briefs: {
    title: 'Briefs',
    content: 'Briefs are open calls for submissions from creators. Set a theme, deadline, and any specific requirements. Active briefs appear on your brand page and attract creator submissions.\n\nYou can have multiple briefs running simultaneously.',
  },
  settings: {
    title: 'Brand Settings',
    content: 'Update your brand profile — name, description, logo, banner, social links, and contact information. These appear on your public brand page.',
  },
  logo: {
    title: 'Brand Logo',
    content: 'Square image, JPEG or PNG, max 2 MB. This appears next to your brand name on the storefront, in drop listings, and in social posts. A simple, recognisable mark works best.',
  },
  banner: {
    title: 'Brand Banner',
    content: 'Wide landscape image, JPEG or PNG, max 5 MB. This appears at the top of your brand page. Use it to set the tone — a hero image, campaign shot, or brand texture.',
  },
  socialLinks: {
    title: 'Social Links',
    content: 'Add links to your social profiles. These appear on your brand page with clickable icons. Only fill in the ones you actively use — empty fields are hidden automatically.',
  },
  terms: {
    title: 'Terms & Conditions',
    content: 'Review and accept the platform terms. These cover the revenue split, IP ownership, and platform rules. You must accept before your brand can go live.',
  },
  cardPayments: {
    title: 'Card Payments',
    content: 'Enable credit/debit card payments on your drops. When enabled, buyers can pay by card in addition to USDC. Card processing fees (~3%) are deducted from the seller\'s share.\n\nThis opens your drops to buyers who don\'t have crypto wallets.',
  },
  offRamp: {
    title: 'Fiat Off-Ramp',
    content: 'Link a Bridge or Coinbase Commerce account to automatically convert USDC earnings to fiat (USD, EUR, etc.) and deposit to your bank account.\n\nIf not set up, you\'ll receive earnings as USDC to your wallet.',
  },
};

// ── Creator Dashboard ────────────────────────────────────────────────
export const creatorDashboard = {
  submissions: {
    title: 'My Submissions',
    content: 'All your submitted designs and their current status. Pending submissions are awaiting brand review. Approved submissions become live drops. Rejected submissions include feedback if provided.',
  },
  drops: {
    title: 'My Drops',
    content: 'Your approved drops that are live on the storefront. Track sales, editions remaining, and your earnings from each drop.',
  },
  earnings: {
    title: 'Earnings',
    content: 'Your total USDC earnings from all sales. The creator split is set per brief — typically 35-80% of the sale price. Earnings are sent directly to your wallet at point of sale.',
  },
  referrals: {
    title: 'Referral Programme',
    content: 'Share your unique referral link. When someone purchases through your link, you earn a referral commission on top of any creator earnings. Track clicks and conversions here.',
  },
  profile: {
    title: 'Creator Profile',
    content: 'Update your display name, bio, avatar, and social links. Your profile appears on drop pages next to your work. A complete profile builds trust with buyers.',
  },
  googleAuth: {
    title: 'Google Sign-In',
    content: 'Sign in with Google to access your creator dashboard. Your submissions, earnings, and profile are linked to your Google account.',
  },
  walletConnect: {
    title: 'Wallet Connection',
    content: 'Connect a wallet to receive USDC earnings. You can use an embedded wallet (created automatically) or connect your own external wallet (MetaMask, Coinbase Wallet, etc.).',
  },
};

// ── Superadmin ───────────────────────────────────────────────────────
export const superAdmin = {
  briefs: {
    title: 'Manage Briefs',
    content: 'Create, edit, and manage briefs across all brands. Set themes, deadlines, submission requirements, and revenue splits. Active briefs appear on brand pages.',
  },
  submissions: {
    title: 'All Submissions',
    content: 'Review submissions across all brands. Approve, reject, set pricing, edition counts, and token IDs. Approved submissions are minted as ERC-1155 tokens on Base.',
  },
  drops: {
    title: 'All Drops',
    content: 'View and manage all live drops across the platform. Track sales, editions, and revenue. Edit pricing or edition counts if needed.',
  },
  brands: {
    title: 'Manage Brands',
    content: 'Approve pending brand applications, edit brand details, manage brand members, and view brand analytics. Each brand has its own storefront and admin dashboard.',
  },
  distributions: {
    title: 'Distributions',
    content: 'Track all USDC distributions — creator payments, brand payments, and platform revenue. Each sale generates an on-chain transaction with transparent splits.',
  },
  marketing: {
    title: 'Marketing & Outreach',
    content: 'Manage agent discovery, outreach campaigns, and commission tracking. Monitor ERC-8004 agent interactions and conversion metrics.',
  },
};

// ── Submission Form ──────────────────────────────────────────────────
export const submitForm = {
  heroImage: {
    title: 'Hero Image',
    content: 'Your main image — this is what buyers see first. JPEG or PNG, high resolution recommended. This becomes the NFT image and appears in the storefront gallery.',
  },
  title: {
    title: 'Design Title',
    content: 'A clear, descriptive title for your work. This appears in the storefront, social posts, and marketplace listings. Keep it concise but distinctive.',
  },
  description: {
    title: 'Description',
    content: 'Describe your design — the concept, materials, inspiration, or story behind it. This appears on the drop page. Buyers and AI agents use this to understand your work.',
  },
  price: {
    title: 'Price (USDC)',
    content: 'Set your selling price in USDC (1 USDC ≈ 1 USD). Consider your audience — we encourage accessible pricing to maximise reach. The revenue split is shown on the brief page.',
  },
  editions: {
    title: 'Edition Size',
    content: 'How many copies can be sold. Lower editions create scarcity. Higher editions maximise revenue. Each edition is a unique ERC-1155 token on Base.',
  },
  additionalFiles: {
    title: 'Additional Files',
    content: 'Optional supporting files — process work, technical sheets, behind-the-scenes material, or high-res alternates. Buyers receive these along with the hero image after purchase.',
  },
};
