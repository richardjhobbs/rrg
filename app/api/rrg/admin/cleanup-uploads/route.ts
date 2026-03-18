/**
 * POST /api/rrg/admin/cleanup-uploads
 *
 * Purges temporary images from the `uploads/` prefix in Supabase Storage.
 * These are created by the MCP `upload_image` tool as a staging area.
 * Files older than 24 hours are deleted.
 *
 * Protected by admin session cookie (same as other admin routes).
 * Can be called by VPS cron: curl -s -X POST http://localhost:3001/api/rrg/admin/cleanup-uploads \
 *   -H "Cookie: rrg_admin=<token>"
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

const BUCKET = 'rrg-submissions';
const UPLOADS_PREFIX = 'uploads/';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST() {
  const cutoff = new Date(Date.now() - MAX_AGE_MS);
  let deleted = 0;
  let errors = 0;

  // List all folders under uploads/
  const { data: folders, error: listErr } = await db.storage
    .from(BUCKET)
    .list(UPLOADS_PREFIX, { limit: 500 });

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  if (!folders || folders.length === 0) {
    return NextResponse.json({ deleted: 0, message: 'No staging uploads found' });
  }

  for (const folder of folders) {
    // Each upload is a folder like uploads/{uuid}/
    const folderPath = `${UPLOADS_PREFIX}${folder.name}`;

    // List files inside the folder
    const { data: files } = await db.storage
      .from(BUCKET)
      .list(folderPath, { limit: 10 });

    if (!files || files.length === 0) continue;

    // Check age of first file (all files in a folder were uploaded together)
    const file = files[0];
    const createdAt = file.created_at ? new Date(file.created_at) : null;

    if (createdAt && createdAt < cutoff) {
      // Delete all files in this folder
      const filePaths = files.map(f => `${folderPath}/${f.name}`);
      const { error: delErr } = await db.storage
        .from(BUCKET)
        .remove(filePaths);

      if (delErr) {
        errors++;
        console.error(`[cleanup-uploads] Failed to delete ${folderPath}:`, delErr.message);
      } else {
        deleted += filePaths.length;
      }
    }
  }

  return NextResponse.json({
    deleted,
    errors,
    checked: folders.length,
    cutoff: cutoff.toISOString(),
  });
}
