import { getStorageClient } from "./client.js";

/**
 * Download a file from Supabase Storage and return its contents as a Buffer.
 *
 * @param bucket  Source bucket name
 * @param path    Storage path within the bucket
 * @returns       File contents as a Node Buffer
 */
export async function downloadFile(bucket: string, path: string): Promise<Buffer> {
  const client = getStorageClient();

  const { data, error } = await client.storage.from(bucket).download(path);

  if (error) {
    throw new Error(
      `Storage download failed [bucket=${bucket} path=${path}]: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      `Storage download returned no data [bucket=${bucket} path=${path}]`
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
