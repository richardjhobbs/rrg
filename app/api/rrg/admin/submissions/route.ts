import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';
import { jpegStoragePath } from '@/lib/rrg/storage';

export const dynamic = 'force-dynamic';

// PATCH /api/rrg/admin/submissions — super-admin: edit a pending submission's fields + image
export async function PATCH(req: NextRequest) {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  try {
    const contentType = req.headers.get('content-type') || '';
    let submissionId: string | undefined;
    const updates: Record<string, unknown> = {};
    let imageFile: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      submissionId = formData.get('submissionId') as string;

      const title = formData.get('title');
      const description = formData.get('description');
      const image = formData.get('image');

      if (title !== null && (title as string).trim()) updates.title = (title as string).trim();
      if (description !== null) updates.description = (description as string).trim() || null;

      if (image instanceof File && image.size > 0) {
        imageFile = image;
      }
    } else {
      const body = await req.json();
      submissionId = body.submissionId;
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
    }

    if (!submissionId) {
      return NextResponse.json({ error: 'submissionId required' }, { status: 400 });
    }

    // Handle image replacement
    if (imageFile) {
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
      if (!isJpeg && !isPng) {
        return NextResponse.json({ error: 'Image must be JPEG or PNG' }, { status: 400 });
      }
      const ext = isPng ? 'png' : 'jpeg';
      const mimeType = isPng ? 'image/png' : 'image/jpeg';
      const filename = `admin-replaced.${ext}`;
      const storagePath = jpegStoragePath(submissionId, filename);

      const { error: uploadErr } = await db.storage
        .from('rrg-submissions')
        .upload(storagePath, buffer, { contentType: mimeType, upsert: true });

      if (uploadErr) throw new Error(`Image upload failed: ${uploadErr.message}`);

      updates.jpeg_storage_path = storagePath;
      updates.jpeg_filename = filename;
      updates.jpeg_size_bytes = buffer.length;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await db
      .from('rrg_submissions')
      .update(updates)
      .eq('id', submissionId);

    if (error) throw error;

    return NextResponse.json({ ok: true, updated: Object.keys(updates) });
  } catch (err) {
    console.error('[/api/rrg/admin/submissions PATCH]', err);
    return NextResponse.json({ error: 'Failed to update submission' }, { status: 500 });
  }
}
