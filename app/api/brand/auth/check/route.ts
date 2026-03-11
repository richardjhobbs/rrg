import { NextResponse } from 'next/server';
import { getBrandUser, getUserBrands } from '@/lib/rrg/brand-auth';

export const dynamic = 'force-dynamic';

// GET /api/brand/auth/check — validate brand admin session
export async function GET() {
  try {
    const user = await getBrandUser();
    if (!user) {
      return NextResponse.json({ authenticated: false });
    }

    const brands = await getUserBrands(user.id);

    return NextResponse.json({
      authenticated: true,
      user: { id: user.id, email: user.email },
      brands,
    });
  } catch (err) {
    console.error('[/api/brand/auth/check]', err);
    return NextResponse.json({ authenticated: false });
  }
}
