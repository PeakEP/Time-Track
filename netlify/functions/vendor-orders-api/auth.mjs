// Microsoft 365 (Entra ID) sign-in verification.
// The browser signs in with MSAL and sends its ID token as a Bearer token; we
// verify signature, audience (our app's client id), issuer (our tenant) and expiry.
import { createRemoteJWKSet, jwtVerify } from "jose";

export function authConfig() {
  return {
    clientId: process.env.MS_CLIENT_ID || "",
    tenantId: process.env.MS_TENANT_ID || "",
  };
}

let jwks = null;
export async function verifyMicrosoftToken(token) {
  const { clientId, tenantId } = authConfig();
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
    );
  }
  const { payload } = await jwtVerify(token, jwks, {
    audience: clientId,
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  });
  if (payload.tid !== tenantId || !payload.oid) throw new Error("wrong tenant");
  return {
    oid: String(payload.oid),
    email: String(payload.preferred_username || payload.email || "").toLowerCase(),
    name: String(payload.name || payload.preferred_username || "Unknown"),
  };
}
