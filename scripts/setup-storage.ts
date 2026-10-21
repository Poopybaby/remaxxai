/**
 * Creates (or updates) the Supabase Storage buckets defined in config/limits.ts.
 * Safe to run repeatedly. Usage: pnpm storage:setup
 */
import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { STORAGE_BUCKETS } from "../config/limits";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: existing, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;
  const existingIds = new Set(existing.map((b) => b.id));

  for (const bucket of Object.values(STORAGE_BUCKETS)) {
    const options = {
      public: bucket.public,
      fileSizeLimit: bucket.fileSizeLimit,
      allowedMimeTypes: bucket.allowedMimeTypes ? [...bucket.allowedMimeTypes] : undefined,
    };
    const { error } = existingIds.has(bucket.id)
      ? await supabase.storage.updateBucket(bucket.id, options)
      : await supabase.storage.createBucket(bucket.id, options);
    if (error) throw error;
    console.log(`${existingIds.has(bucket.id) ? "Updated" : "Created"} bucket "${bucket.id}"`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
