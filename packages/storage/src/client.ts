import { createClient, SupabaseClient } from "@supabase/supabase-js";

function createStorageClient(): SupabaseClient {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL environment variable is not set");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      // Service role clients must not persist sessions or auto-refresh tokens
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _client: SupabaseClient | null = null;

export function getStorageClient(): SupabaseClient {
  if (!_client) {
    _client = createStorageClient();
  }
  return _client;
}
