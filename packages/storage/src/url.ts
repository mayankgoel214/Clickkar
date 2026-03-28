import { getStorageClient } from "./client.js";

/**
 * Derive the full public URL for an object in Supabase Storage.
 *
 * This does not make a network request — it is computed locally from the
 * Supabase project URL and the bucket/path. The bucket must have public
 * access enabled in the Supabase dashboard for the URL to be accessible.
 *
 * @param bucket  Bucket name
 * @param path    Object path within the bucket
 * @returns       Full public HTTPS URL
 */
export function getPublicUrl(bucket: string, path: string): string {
  const client = getStorageClient();

  const {
    data: { publicUrl },
  } = client.storage.from(bucket).getPublicUrl(path);

  if (!publicUrl) {
    throw new Error(
      `Failed to derive public URL [bucket=${bucket} path=${path}]`
    );
  }

  return publicUrl;
}
