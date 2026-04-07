import { SiteNav } from '@/components/nav/SiteNav';

export default function CoCreatePage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen px-6 py-16 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Co-Create with Brands
        </h1>
        <p className="text-lg text-neutral-400 mb-8">
          Submit designs to brand briefs. Digital-only collaborations that mint
          as ERC-1155 NFTs on Base. Creators earn 70% revenue.
        </p>
        <a
          href="https://realrealgenuine.com/rrg"
          className="inline-block bg-white text-black px-6 py-3 rounded-lg font-semibold hover:bg-neutral-200 transition-colors"
        >
          Go to co-creation platform
        </a>
      </main>
    </>
  );
}
