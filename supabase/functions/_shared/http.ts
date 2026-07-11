export const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

export function requireWorkerSecret(request: Request): Response | null {
  const expected = Deno.env.get("PREDICTION_ENGINE_SHARED_SECRET");
  const actual = request.headers.get("x-shared-secret");
  if (!expected || !actual || actual !== expected) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}
