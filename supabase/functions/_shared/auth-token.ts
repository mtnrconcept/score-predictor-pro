export function extractBearerToken(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || null;
}

export function userAuthorizationHeaders(authorization: string): Record<string, string> {
  return { Authorization: authorization };
}
