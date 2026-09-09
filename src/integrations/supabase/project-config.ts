// Remote Supabase binding is intentionally opt-in after the previous production
// project was released for another application. Legacy VITE_SUPABASE_* values
// are ignored so stale Vercel/Lovable configuration cannot reconnect this app.
const env = import.meta.env as Record<string, string | undefined>;

export const DEFAULT_SUPABASE_URL = env.VITE_SCORE_PREDICTOR_SUPABASE_URL?.trim() ?? "";
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  env.VITE_SCORE_PREDICTOR_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
