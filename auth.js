// BYOP auth: OAuth 2.1 authorization-code flow with PKCE (S256).
// Public client, no secret — PKCE replaces the client secret.
// Verified against https://enter.pollinations.ai/.well-known/oauth-authorization-server

import { CONFIG } from "./config.js";

const TOKEN_KEY = "sift_token";
const VERIFIER_KEY = "sift_pkce_verifier";
const STATE_KEY = "sift_oauth_state";

// --- PKCE helpers (Web Crypto, no libraries) -----------------------------

function base64UrlEncode(bytes) {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(byteLength = 64) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Challenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

// The redirect URI must match a Redirect URI registered on the App Key.
// We strip query/hash so the registered value is stable.
function redirectUri() {
  return location.origin + location.pathname;
}

// --- Token storage (sessionStorage only, never localStorage) --------------

export function getToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (t.expiresAt && Date.now() > t.expiresAt) {
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return t.accessToken || null;
  } catch {
    return null;
  }
}

export function isConnected() {
  return !!getToken();
}

export function disconnect() {
  sessionStorage.removeItem(TOKEN_KEY);
}

// Who authorized this key? Returns { username, name, picture } or null.
// Uses the OIDC userinfo endpoint; name/email only present with `profile` scope.
export async function fetchUserInfo() {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch("https://enter.pollinations.ai/api/oauth/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const u = await res.json();
    return {
      username: u.preferred_username || null,
      name: u.name || null,
      picture: u.picture || null,
    };
  } catch {
    return null;
  }
}

// --- Flow: step 1, send the user to authorize -----------------------------

export async function login() {
  if (!CONFIG.CLIENT_ID || CONFIG.CLIENT_ID === "pk_REPLACE_ME") {
    throw new Error(
      "No App Key set. Create one at " +
        CONFIG.KEYS_DASHBOARD +
        " and put it in config.js as CLIENT_ID.",
    );
  }
  const verifier = randomString(64);
  const challenge = await sha256Challenge(verifier);
  const state = randomString(16);

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CONFIG.CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: "profile usage",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    budget: String(CONFIG.BUDGET),
    expiry: String(CONFIG.EXPIRY_DAYS),
  });

  location.href = `${CONFIG.AUTHORIZE_URL}?${params.toString()}`;
}

// --- Flow: step 2, handle the redirect back with ?code= -------------------
// Returns "connected" | "error:<msg>" | null (no callback in URL).

export async function handleRedirectCallback() {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (!code && !oauthError) return null; // nothing to handle

  // Clean the query string out of the address bar regardless of outcome.
  const cleanUrl = location.origin + location.pathname;

  if (oauthError) {
    history.replaceState({}, "", cleanUrl);
    return "error:" + oauthError;
  }

  const savedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);

  if (!savedState || savedState !== returnedState) {
    history.replaceState({}, "", cleanUrl);
    return "error:state_mismatch";
  }
  if (!verifier) {
    history.replaceState({}, "", cleanUrl);
    return "error:missing_verifier";
  }

  try {
    const res = await fetch(CONFIG.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: CONFIG.CLIENT_ID,
        redirect_uri: redirectUri(),
        code_verifier: verifier,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      history.replaceState({}, "", cleanUrl);
      return "error:" + (data.error || "token_exchange_failed");
    }
    const expiresAt = data.expires_in
      ? Date.now() + data.expires_in * 1000
      : null;
    sessionStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({ accessToken: data.access_token, expiresAt }),
    );
    history.replaceState({}, "", cleanUrl);
    return "connected";
  } catch (e) {
    history.replaceState({}, "", cleanUrl);
    return "error:network";
  }
}
