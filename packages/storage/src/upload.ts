import { getStorageClient } from "./client.js";
import { getPublicUrl } from "./url.js";

/**
 * Upload a file buffer to Supabase Storage.
 *
 * Uses upsert so that re-processing the same path overwrites the previous
 * version without throwing a conflict error.
 *
 * @param bucket      Target bucket name
 * @param path        Storage path within the bucket (e.g. "orders/abc/input.jpg")
 * @param buffer      File contents as a Node Buffer
 * @param contentType MIME type (e.g. "image/jpeg", "audio/ogg; codecs=opus")
 * @returns           The full public URL for the uploaded file
 */
export async function uploadFile(
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const client = getStorageClient();

  // Video files can be 5-20 MB — give them a longer timeout than images.
  const isVideo = contentType.startsWith('video/');
  const timeoutMs = isVideo ? 120_000 : 30_000;

  // Retry up to 3 times — undici on Node 25 occasionally drops the socket
  // to Supabase mid-upload with a bare "fetch failed". One retry is almost
  // always sufficient. Exponential backoff: 500ms, 1.5s.
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const uploadPromise = client.storage.from(bucket).upload(path, buffer, {
        contentType,
        upsert: true,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Storage upload timed out after ${timeoutMs / 1000}s`)),
          timeoutMs,
        ),
      );
      const { error } = await Promise.race([uploadPromise, timeoutPromise]);

      if (error) {
        lastErr = error;
        if (attempt < MAX_ATTEMPTS) {
          const delayMs = 500 * Math.pow(3, attempt - 1);
          console.warn(
            JSON.stringify({
              event: 'storage_upload_retry',
              bucket,
              path,
              attempt,
              delayMs,
              error: String(error.message).slice(0, 200),
            }),
          );
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }
        throw new Error(
          `Storage upload failed [bucket=${bucket} path=${path}]: ${error.message}`,
        );
      }

      return getPublicUrl(bucket, path);
    } catch (err) {
      lastErr = err;
      // Timeout or thrown network error — same retry logic
      if (attempt < MAX_ATTEMPTS) {
        const delayMs = 500 * Math.pow(3, attempt - 1);
        console.warn(
          JSON.stringify({
            event: 'storage_upload_retry',
            bucket,
            path,
            attempt,
            delayMs,
            error: err instanceof Error ? err.message.slice(0, 200) : String(err),
          }),
        );
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }

  // Unreachable — loop above always returns or throws. Kept to satisfy TS.
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Storage upload failed [bucket=${bucket} path=${path}]`);
}
