import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';
import { supabaseAdmin } from '@/lib/rrg/brand-auth';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realrealgenuine.com';
const RESEND_URL = 'https://api.resend.com/emails';
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'deliver@realrealgenuine.com';

// POST /api/rrg/admin/brands/invite — invite a brand admin (super-admin only)
// Body: { brand_id, email, temp_password }
export async function POST(req: NextRequest) {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  try {
    const { brand_id, email, temp_password } = await req.json();

    if (!brand_id || !email || !temp_password) {
      return NextResponse.json(
        { error: 'brand_id, email, temp_password required' },
        { status: 400 }
      );
    }

    if (temp_password.length < 8) {
      return NextResponse.json(
        { error: 'temp_password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Verify brand exists
    const { data: brand } = await db
      .from('rrg_brands')
      .select('id, name, slug')
      .eq('id', brand_id)
      .single();

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    // Create Supabase Auth user (or get existing)
    let userId: string;
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: temp_password,
      email_confirm: true,
    });

    if (createError) {
      // If user already exists, find them
      if (createError.message.includes('already been registered') || createError.message.includes('already exists')) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const existing = users?.find(u => u.email === email);
        if (!existing) {
          return NextResponse.json({ error: 'User exists but could not be found' }, { status: 500 });
        }
        userId = existing.id;
      } else {
        throw createError;
      }
    } else {
      userId = newUser.user.id;
    }

    // Insert brand membership (upsert to handle re-invites)
    const { error: memberError } = await db
      .from('rrg_brand_members')
      .upsert({
        brand_id,
        user_id: userId,
        role: 'admin',
      }, { onConflict: 'brand_id,user_id' });

    if (memberError) throw memberError;

    // Send welcome email via Resend
    try {
      const loginUrl = `${SITE_URL}/brand/login`;
      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; margin: 0; padding: 40px 20px; }
  .card { max-width: 520px; margin: 0 auto; background: #111; border: 1px solid #222; border-radius: 12px; overflow: hidden; }
  .header { background: #d4ff22; padding: 24px 28px; }
  .header h1 { margin: 0; font-size: 20px; color: #0a0a0a; font-weight: 700; }
  .body { padding: 28px; }
  .body p { margin: 0 0 16px; line-height: 1.6; color: #ccc; font-size: 14px; }
  .meta { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 16px; margin: 20px 0; }
  .meta-row { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #222; }
  .meta-row:last-child { border-bottom: none; }
  .meta-label { color: #888; }
  .meta-value { color: #e5e5e5; font-weight: 500; }
  .btn { display: inline-block; background: #d4ff22; color: #0a0a0a; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; margin-top: 8px; }
  .footer { padding: 20px 28px; border-top: 1px solid #1a1a1a; font-size: 12px; color: #555; }
</style></head>
<body>
<div class="card">
  <div class="header"><h1>Welcome to RRG — ${brand.name}</h1></div>
  <div class="body">
    <p>You've been invited as an admin for <strong style="color:#e5e5e5">${brand.name}</strong> on the RRG platform.</p>
    <div class="meta">
      <div class="meta-row"><span class="meta-label">Email: </span><span class="meta-value">${email}</span></div>
      <div class="meta-row"><span class="meta-label">Temporary password: </span><span class="meta-value">${temp_password}</span></div>
    </div>
    <p>Please log in and change your password immediately.</p>
    <a class="btn" href="${loginUrl}">Log in to your dashboard →</a>
  </div>
  <div class="footer"><a href="${SITE_URL}/rrg" style="color:#e5e5e5; text-decoration:none">RRG — Real Real Genuine</a></div>
</div>
</body>
</html>`;

      await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: email,
          subject: `You've been invited to RRG — ${brand.name}`,
          html,
        }),
      });
    } catch (emailErr) {
      console.error('[invite] Welcome email failed:', emailErr);
      // Non-fatal
    }

    return NextResponse.json({
      success: true,
      userId,
      message: `Invited ${email} as admin for ${brand.name}`,
    });
  } catch (err) {
    console.error('[/api/rrg/admin/brands/invite]', err);
    return NextResponse.json({ error: 'Failed to invite brand admin' }, { status: 500 });
  }
}
