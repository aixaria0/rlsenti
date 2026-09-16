/**
 * Upstream identity providers offered by this application.
 * Kept dependency-free so both server and client can import the same source.
 */
export type AuthProvider = {
  /** Local provider id and OAuth callback path segment. */
  providerId: string;
  /** Upstream social-provider hint understood by the OAuth broker. */
  idp: string;
  /** Human-readable sign-in label. */
  label: string;
};

export const AUTH_PROVIDERS: readonly AuthProvider[] = [
  { providerId: "auth-google", idp: "google", label: "Google" },
  { providerId: "auth-x", idp: "twitter", label: "X" },
];
