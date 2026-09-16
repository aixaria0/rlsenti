import { betterAuth } from "better-auth";
import { bearer, genericOAuth } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { AUTH_PROVIDERS } from "./providers";
import { pgliteDialect } from "./pglite-dialect";

void ensureDbReady();

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value || undefined;
};

const authDisabled = env("VITE_AUTH_ENABLED") === "false";
const authIssuer = env("AUTH_ISSUER");
const authClientId = env("AUTH_CLIENT_ID");
const authClientSecret = env("AUTH_CLIENT_SECRET");

/** Federated authentication is active only when explicitly configured. */
export const authConfigured =
  !authDisabled && Boolean(authIssuer && authClientId && authClientSecret);

const explicitBaseURL = env("BETTER_AUTH_URL");
const localOrigins = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];
const baseURL = explicitBaseURL ?? "http://localhost:8080";
const trustedOrigins = explicitBaseURL
  ? [explicitBaseURL, ...localOrigins]
  : localOrigins;

const issuerBase = authIssuer?.replace(/\/+$/, "");
const authorizationUrl = issuerBase
  ? `${issuerBase}/api/auth/oauth2/authorize`
  : undefined;
const tokenUrl = issuerBase ? `${issuerBase}/api/auth/oauth2/token` : undefined;
const userInfoUrl = issuerBase
  ? `${issuerBase}/api/auth/oauth2/userinfo`
  : undefined;

const databaseUrl = env("DATABASE_URL");
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

export const SESSION_TOKEN_COOKIE = "__Host-rlsenti-auth.session_token";

const oauthPlugin =
  authConfigured && authorizationUrl && tokenUrl && userInfoUrl
    ? genericOAuth({
        config: AUTH_PROVIDERS.map(({ providerId, idp }) => ({
          providerId,
          clientId: authClientId as string,
          clientSecret: authClientSecret as string,
          authorizationUrl,
          tokenUrl,
          userInfoUrl,
          scopes: ["openid", "profile", "email"],
          authorizationUrlParams: { idp, prompt: "login" },
        })),
      })
    : null;

const configuredSecret = env("BETTER_AUTH_SECRET");
const globalAuthRef = globalThis as typeof globalThis & {
  __rlsentiAuthSecret__?: string;
};
const authSecret = () => {
  if (configuredSecret) return configuredSecret;
  if (authConfigured && process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET must be configured when authentication is enabled in production");
  }
  globalAuthRef.__rlsentiAuthSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__rlsentiAuthSecret__;
};

export const auth = betterAuth({
  baseURL,
  secret: authSecret(),
  database,
  trustedOrigins,
  ...(emailAndPasswordEnabled ? { emailAndPassword: { enabled: true } } : {}),
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: AUTH_PROVIDERS.map((p) => p.providerId),
      requireLocalEmailVerified: false,
    },
  },
  session: { cookieCache: { enabled: true, maxAge: 300 } },
  advanced: {
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "__Host-rlsenti-auth.session_data" },
      account_data: { name: "__Host-rlsenti-auth.account_data" },
      dont_remember: { name: "__Host-rlsenti-auth.dont_remember" },
    },
  },
  plugins: [
    ...(oauthPlugin ? [oauthPlugin] : []),
    bearer(),
    tanstackStartCookies(),
  ],
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}

export { AUTH_PROVIDERS } from "./providers";
