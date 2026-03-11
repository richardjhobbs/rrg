import { getBrandBySlug } from '@/lib/rrg/db';
import { notFound } from 'next/navigation';
import SubmitForm from '@/components/rrg/SubmitForm';

export const dynamic = 'force-dynamic';

export default async function BrandSubmitPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand || brand.status !== 'active') return notFound();

  return (
    <SubmitForm
      brandId={brand.id}
      brandSlug={brand.slug}
      brandName={brand.name}
    />
  );
}
