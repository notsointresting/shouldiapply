// ShouldIApply — configuration.
//
// Reuses your existing Pollinations App Key (pk_...). Add THIS app's URLs to
// that key's Redirect URIs at https://enter.pollinations.ai/keys :
//   https://notsointresting.github.io/shouldiapply/
//   http://localhost:8000/
//
// The pk_ App Key is a PUBLIC client id — safe in the browser. Never an sk_.

export const CONFIG = {
  CLIENT_ID: "pk_XHSDoqlTRAGClRhx",

  API_BASE: "https://gen.pollinations.ai",
  AUTHORIZE_URL: "https://enter.pollinations.ai/authorize",
  TOKEN_URL: "https://enter.pollinations.ai/api/oauth/token",
  KEYS_DASHBOARD: "https://enter.pollinations.ai/keys",

  MODEL: "jev",
  WRITER_MODEL: "openai/gpt-5.4-mini", // text model for "Improve my chances" (~0.005 Pollen per rewrite)

  BUDGET: 5, // Pollen; a scorecard is one cheap call
  EXPIRY_DAYS: 7,
};
