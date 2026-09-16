/** Client-readable marker for sessions materialized from a trusted gate identity. */
export const GATE_SESSION_MARKER_COOKIE = "__Host-rlsenti_gate_session";

export function hasGateSessionMarker(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((pair) => pair.trim().startsWith(`${GATE_SESSION_MARKER_COOKIE}=`));
}
