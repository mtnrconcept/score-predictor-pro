import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));

import { getVerifiedSupabaseSession, requireVerifiedAccessToken } from "./supabase-session";

const currentSession = { access_token: "current-token" };
const refreshedSession = { access_token: "refreshed-token" };

describe("Supabase session verification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the current session after server verification", async () => {
    auth.getSession.mockResolvedValue({ data: { session: currentSession }, error: null });
    auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    await expect(getVerifiedSupabaseSession()).resolves.toBe(currentSession);
    expect(auth.getUser).toHaveBeenCalledWith("current-token");
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it("refreshes and revalidates a stale access token", async () => {
    auth.getSession.mockResolvedValue({ data: { session: currentSession }, error: null });
    auth.getUser
      .mockResolvedValueOnce({ data: { user: null }, error: new Error("expired") })
      .mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null });
    auth.refreshSession.mockResolvedValue({
      data: { session: refreshedSession },
      error: null,
    });

    await expect(requireVerifiedAccessToken()).resolves.toBe("refreshed-token");
    expect(auth.getUser).toHaveBeenNthCalledWith(2, "refreshed-token");
  });

  it("rejects a session that cannot be refreshed", async () => {
    auth.getSession.mockResolvedValue({ data: { session: currentSession }, error: null });
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new Error("refresh revoked"),
    });

    await expect(requireVerifiedAccessToken()).rejects.toThrow("session n'est plus valide");
  });
});
