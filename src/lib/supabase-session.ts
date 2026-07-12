import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a session only after Supabase has verified its access token.
 * A locally persisted session can outlive its server-side refresh session, so
 * reading getSession() alone is not sufficient before a protected request.
 */
export async function getVerifiedSupabaseSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;

  const current = data.session;
  const { data: userData, error: userError } = await supabase.auth.getUser(current.access_token);
  if (!userError && userData.user) return current;

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshed.session) return null;

  const { data: refreshedUser, error: refreshedUserError } = await supabase.auth.getUser(
    refreshed.session.access_token,
  );
  return !refreshedUserError && refreshedUser.user ? refreshed.session : null;
}

export async function requireVerifiedAccessToken(): Promise<string> {
  const session = await getVerifiedSupabaseSession();
  if (!session) {
    throw new Error("Ta session n'est plus valide. Reconnecte-toi puis réessaie.");
  }
  return session.access_token;
}
