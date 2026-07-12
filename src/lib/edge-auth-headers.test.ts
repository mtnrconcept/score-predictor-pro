import { describe, expect, it } from "vitest";

import {
  extractBearerToken,
  userAuthorizationHeaders,
} from "../../supabase/functions/_shared/auth-token";

describe("prediction Edge authentication headers", () => {
  it("extracts exactly one bearer token", () => {
    expect(extractBearerToken("Bearer header.payload.signature")).toBe("header.payload.signature");
    expect(extractBearerToken("Bearer ")).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
  });

  it("uses canonical casing so Headers cannot merge a duplicate value", () => {
    const authorization = "Bearer header.payload.signature";
    const headers = new Headers(userAuthorizationHeaders(authorization));

    expect(Object.keys(userAuthorizationHeaders(authorization))).toEqual(["Authorization"]);
    expect(headers.get("Authorization")).toBe(authorization);
    expect(headers.get("Authorization")?.split(",")).toHaveLength(1);
  });
});
