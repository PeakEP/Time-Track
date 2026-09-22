// Microsoft 365 sign-in (Entra ID) via MSAL. The ID token is sent to our API,
// which verifies it server-side; nothing here decides what a user may do.
import { PublicClientApplication, InteractionRequiredAuthError } from "@azure/msal-browser";

const SCOPES = ["openid", "profile", "email"];
let pca = null;

export async function initAuth({ clientId, tenantId }) {
  const redirectUri = window.location.origin + import.meta.env.BASE_URL;
  pca = new PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri,
      postLogoutRedirectUri: redirectUri,
    },
    cache: { cacheLocation: "localStorage" },
  });
  await pca.initialize();
  const result = await pca.handleRedirectPromise();
  if (result && result.account) pca.setActiveAccount(result.account);
  const account = pca.getActiveAccount() || pca.getAllAccounts()[0] || null;
  if (account) pca.setActiveAccount(account);
  return account;
}

export function signIn() {
  return pca.loginRedirect({ scopes: SCOPES, prompt: "select_account" });
}

export function signOut() {
  return pca.logoutRedirect({ account: pca.getActiveAccount() });
}

export async function getIdToken(force = false) {
  const account = pca.getActiveAccount();
  if (!account) throw new Error("signed out");
  const exp = account.idTokenClaims && account.idTokenClaims.exp;
  const stale = !exp || exp * 1000 - Date.now() < 5 * 60 * 1000;
  try {
    const r = await pca.acquireTokenSilent({ scopes: SCOPES, account, forceRefresh: force || stale });
    return r.idToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      await signIn();
      return new Promise(() => {}); // page is navigating away
    }
    throw e;
  }
}
