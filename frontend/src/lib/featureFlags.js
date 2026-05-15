// Feature flags controlled at build time via REACT_APP_* env vars.
// Set in Vercel project settings or .env.local. Default to off when unset.
// To reactivate gamification: set REACT_APP_GAMIFICATION_ENABLED=true + redeploy frontend.
export const GAMIFICATION_ENABLED =
  process.env.REACT_APP_GAMIFICATION_ENABLED === 'true';
