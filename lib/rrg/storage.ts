import { db } from './db';

const BUCKET = 'rrg-submissions';

// ── Upload a file to Supabase private storage ─────────────────────────

export async function uploadSubmissionFile(
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: false,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

// ── Generate a signed URL (24-hour default) ────────────────────────────

export async function getSignedUrl(
  path: string,
  expiresInSeconds = 86400
): Promise<string> {
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to generate signed URL: ${error?.message}`);
  }
  return data.signedUrl;
}

// ── Download a file as a Buffer ────────────────────────────────────────

export async function downloadFile(path: string): Promise<Buffer> {
  const { data, error } = await db.storage
    .from(BUCKET)
    .download(path);

  if (error || !data) throw new Error(`Download failed: ${error?.message}`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Delete a file from storage ────────────────────────────────────────

export async function deleteFile(path: string): Promise<void> {
  const { error } = await db.storage
    .from(BUCKET)
    .remove([path]);

  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}

// ── Build storage paths ────────────────────────────────────────────────

export function jpegStoragePath(submissionId: string, filename: string): string {
  return `submissions/${submissionId}/jpeg/${filename}`;
}

export function additionalFilesPath(submissionId: string): string {
  return `submissions/${submissionId}/additional/`;
}

export function additionalFileStoragePath(submissionId: string, filename: string): string {
  return `submissions/${submissionId}/additional/${filename}`;
}

export function physicalImageStoragePath(submissionId: string, index: number, filename: string): string {
  return `submissions/${submissionId}/physical/${index}-${filename}`;
}
