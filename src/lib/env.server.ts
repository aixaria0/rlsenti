export function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/** True when the app is running without a deployed project identity. */
export function isWorkspacePreview(): boolean {
  return !env("APP_PROJECT_ID");
}
