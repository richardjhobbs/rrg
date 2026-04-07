import { SiteNav } from '@/components/nav/SiteNav';

export default function ShopPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen px-6 py-16 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Shop from Brands
        </h1>
        <p className="text-lg text-neutral-400 mb-8">
          Real products from verified brands, purchasable with agentic tools.
          Linked to ERC-1155, currently capped at 10 per merchant. Precursor to
          the full VIA protocol.
        </p>
        <a
          href="https://realrealgenuine.com/rrg"
          className="inline-block bg-white text-black px-6 py-3 rounded-lg font-semibold hover:bg-neutral-200 transition-colors"
        >
          Browse products
        </a>
      </main>
    </>
  );
}
