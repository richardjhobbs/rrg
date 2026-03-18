import { getBrandBySlug } from '@/lib/rrg/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

type Props = {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) return { title: 'Brand Not Found' };
  return {
    title: `${brand.name} — Powered by RRG`,
    description: brand.headline || brand.description || `${brand.name} on Real Real Genuine`,
  };
}

export default async function BrandPublicLayout({ children, params }: Props) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand || brand.status !== 'active') return notFound();

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4 flex justify-between items-center">
        <Link
          href="/rrg"
          className="text-base font-mono tracking-[0.3em] hover:opacity-70 transition-opacity"
        >
          REAL REAL GENUINE
        </Link>
        <nav className="flex gap-6 text-base text-white/80">
          <Link href={`/brand/${slug}`} className="hover:text-white transition-colors">
            Store
          </Link>
          <Link href={`/brand/${slug}/submit`} className="hover:text-white transition-colors">
            Create
          </Link>
          <Link href="/rrg" className="hover:text-white transition-colors">
            Home
          </Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="border-t border-white/10 px-6 py-8 mt-24 text-sm text-white/50 font-mono flex justify-between">
        <span>{brand.name}</span>
        <span>Powered by RRG · realrealgenuine.com</span>
      </footer>
    </div>
  );
}
