import type { Metadata } from 'next';
import RRGHeader from '@/components/rrg/RRGHeader';
import RRGFooter from '@/components/rrg/RRGFooter';

export const metadata: Metadata = {
  title: 'RRG — Real Real Genuine',
  description: 'Submit designs. Earn USDC. Own on-chain.',
};

export default function RRGLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white">
      <RRGHeader active="store" />
      <main>{children}</main>
      <RRGFooter />
    </div>
  );
}
