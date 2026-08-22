import { register } from "node:module";

if (!process.env.VITE_SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
}

register("./ts-alias-loader.mjs", import.meta.url);
