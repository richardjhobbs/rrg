'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/** Nav Submit link that routes to the brand submit page when a brand filter is active. */
export default function RRGNavSubmit() {
  const searchParams = useSearchParams();
  const brand = searchParams.get('brand');
  const href = brand ? `/brand/${brand}/submit` : '/rrg/submit';

  return (
    <Link href={href} className="hover:text-white transition-colors">
      Submit
    </Link>
  );
}
