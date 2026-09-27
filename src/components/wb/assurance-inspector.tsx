import { useMemo } from "react";
import { useWorkbench } from "@/lib/workbench-state";
import { Mono, Panel, StatusTag } from "./primitives";

function stageTone(state: "BOUND" | "ABSENT" | "LEGACY") {
  return state === "BOUND"
    ? "border-pass/35 bg-pass/8 text-pass"
    : state === "LEGACY"
      ? "border-warn/35 bg-warn/8 text-warn"
      : "border-border bg-elevated/40 text-muted";
}

export function AssuranceInspector() {
  const { reality } = useWorkbench();

  const stages = useMemo(() => {
    const witnessEnvelope = reality.witness
      ? reality.envelopes.find((item) => item.layer === reality.witness?.layer) ?? null
      : null;
    const evidenceEnvelope =
      reality.envelopes.find((item) => item.layer === "sentinel") ??
      reality.envelopes.find((item) => item.layer === "block") ??
      null;
    const workbenchEnvelope =
      reality.envelopes.find((item) => item.layer === "verification") ??
      reality.envelopes.at(-1) ??
      null;
    const reviewerEnvelope = reality.envelopes.find((item) => item.layer === "lattice") ?? null;

    return [
      {
        role: "WITNESS",
        state: witnessEnvelope ? "BOUND" as const : "ABSENT" as const,
        digest: witnessEnvelope?.hash ?? null,
        source: reality.witness
          ? `${reality.witness.source} · ${reality.witness.field}`
          : "No failure witness in this run",
        note: reality.witness
          ? `${reality.witness.invariant}: ${reality.witness.observed}`
          : "Absence here means no failure witness was emitted by this local fixture; it is not a global proof of safety.",
      },
      {
        role: "EVIDENCE",
        state: evidenceEnvelope ? "BOUND" as const : "ABSENT" as const,
        digest: evidenceEnvelope?.hash ?? null,
        source: evidenceEnvelope?.label ?? "No observation envelope",
        note: evidenceEnvelope
          ? "Existing evidence envelope projected into the generic inspection role."
          : "No evidence object is available for this run.",
      },
      {
        role: "WORKBENCH",
        state: workbenchEnvelope ? "BOUND" as const : "ABSENT" as const,
        digest: workbenchEnvelope?.hash ?? null,
        source: `Inspection verdict · ${reality.status}`,
        note: "The workbench may display the upstream result but must not silently strengthen it.",
      },
      {
        role: "ATTESTATION",
        state: reviewerEnvelope ? "LEGACY" as const : "ABSENT" as const,
        digest: reviewerEnvelope?.hash ?? null,
        source: reviewerEnvelope?.label ?? "No reviewer artifact",
        note: reviewerEnvelope
          ? "This is the legacy local Sovereign-Lattice analysis. It is shown for comparison and is NOT causal-assurance-attestation/v2."
          : "The base assurance profile permits no reviewer artifact; stricter policy may require one.",
      },
    ];
  }, [reality]);

  return (
    <div className="grid gap-3">
      <Panel
        title="Generic assurance projection"
        subtitle="WITNESS → EVIDENCE → WORKBENCH → optional ATTESTATION"
        right={<StatusTag status={reality.status} />}
      >
        <div className="mb-3 rounded-md border border-warn/25 bg-warn/5 px-3 py-2 text-xs leading-relaxed text-muted">
          This view projects the existing local compiler objects into the new four-repository roles.
          It does not claim that this legacy fixture is already a
          <span className="font-mono text-xxs text-fg"> causal-assurance-portable-package/v2</span>.
        </div>

        <div className="grid gap-2">
          {stages.map((stage, index) => (
            <div key={stage.role}>
              <article className="rounded-lg border border-border bg-bg p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-mono text-micro tracking-label text-primary">{stage.role}</div>
                    <div className="mt-1 text-sm">{stage.source}</div>
                  </div>
                  <span
                    className={`rounded-sm border px-1.5 py-0.5 font-mono text-micro tracking-label ${stageTone(stage.state)}`}
                  >
                    {stage.state}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">{stage.note}</p>
                <div className="mt-2 border-t border-border/60 pt-2">
                  <span className="mr-2 font-mono text-micro tracking-label text-muted">SOURCE DIGEST</span>
                  <Mono className={stage.digest ? "" : "text-muted"}>
                    {stage.digest ?? "UNAVAILABLE"}
                  </Mono>
                </div>
              </article>
              {index < stages.length - 1 ? (
                <div className="flex h-5 items-center pl-5 font-mono text-xs text-muted" aria-hidden>
                  ↓
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Claim boundary inspector"
        subtitle="Every layer states its basis and the stronger conclusion it is not allowed to imply"
      >
        <div className="grid gap-2 lg:grid-cols-2">
          {reality.claims.map((claim) => (
            <article key={claim.layer} className="rounded-lg border border-border bg-bg p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-micro tracking-label text-primary">
                  {claim.layer.toUpperCase()}
                </span>
                <StatusTag status={claim.status} />
              </div>
              <p className="mt-2 text-sm leading-relaxed">{claim.statement}</p>
              <div className="mt-3 rounded-md border border-border/60 bg-elevated/30 p-2">
                <div className="font-mono text-micro tracking-label text-muted">BASIS</div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{claim.basis}</p>
              </div>
              <div className="mt-2 rounded-md border border-warn/25 bg-warn/5 p-2">
                <div className="font-mono text-micro tracking-label text-warn">NOT CLAIMED</div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{claim.notClaimed}</p>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
