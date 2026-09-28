import { AETHERFORGE_REPAIR_CAPTURE } from "@/lib/repair-artifact";
import { Mono, Panel } from "./primitives";

function OutcomeBadge({
  value,
  tone,
}: {
  value: string;
  tone: "fail" | "pass" | "info";
}) {
  const classes =
    tone === "fail"
      ? "border-fail/40 bg-fail/10 text-fail"
      : tone === "pass"
        ? "border-pass/40 bg-pass/10 text-pass"
        : "border-primary/30 bg-primary/8 text-primary";

  return (
    <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-micro tracking-label ${classes}`}>
      {value}
    </span>
  );
}

export function RepairArtifactInspector() {
  const { source, artifact } = AETHERFORGE_REPAIR_CAPTURE;
  const action = artifact.selectedActions[0];
  const before = action?.metadata?.before;
  const after = action?.metadata?.after;

  return (
    <Panel
      title="Minimal repair certificate"
      subtitle="CI-captured repair-artifact/v1 · same claim, same verifier"
      right={<OutcomeBadge value={artifact.outcome} tone="info" />}
    >
      <div className="mb-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted">
        This is not a hand-written UI example. The fixture was captured from
        <span className="font-mono text-xxs text-fg"> {source.workflow}</span>
        {" "}run <span className="font-mono text-xxs text-fg">#{source.workflowRunId}</span>
        {" "}at commit <Mono>{source.commit.slice(0, 12)}</Mono>.
        It is still a captured fixture, not a live cross-repository import.
      </div>

      <div className="grid gap-2 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
        <article className="rounded-lg border border-fail/25 bg-fail/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-micro tracking-label text-muted">BEFORE</span>
            <OutcomeBadge value={artifact.originalOutcome} tone="fail" />
          </div>
          <div className="mt-3 font-mono text-xxs text-fg">{artifact.originalProblemId}</div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            The original verification artifact contained an explicit violation witness.
          </p>
          {typeof before === "number" ? (
            <div className="mt-3 rounded-md border border-border bg-bg/70 p-2">
              <div className="font-mono text-micro tracking-label text-muted">OBSERVED</div>
              <Mono>{String(before)}</Mono>
            </div>
          ) : null}
        </article>

        <div className="flex items-center justify-center px-2 py-1 font-mono text-lg text-primary">
          →
        </div>

        <article className="rounded-lg border border-pass/25 bg-pass/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-micro tracking-label text-muted">AFTER</span>
            <OutcomeBadge
              value={artifact.postRepairVerification?.outcome ?? "UNAVAILABLE"}
              tone="pass"
            />
          </div>
          <div className="mt-3 font-mono text-xxs text-fg">
            {artifact.postRepairVerification?.adapterId ?? "UNAVAILABLE"}@
            {artifact.postRepairVerification?.adapterVersion ?? "?"}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            The exact verification claim is replayed after the selected intervention.
          </p>
          {typeof after === "number" ? (
            <div className="mt-3 rounded-md border border-border bg-bg/70 p-2">
              <div className="font-mono text-micro tracking-label text-muted">REPAIRED</div>
              <Mono>{String(after)}</Mono>
            </div>
          ) : null}
        </article>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <article className="rounded-lg border border-border bg-bg p-3">
          <div className="font-mono text-micro tracking-label text-primary">SELECTED INTERVENTION</div>
          <div className="mt-2 font-mono text-xs text-fg">{action?.label ?? "UNAVAILABLE"}</div>
          <div className="mt-2 text-xs text-muted">
            Cost vector: <Mono>{JSON.stringify(artifact.totalCost)}</Mono>
          </div>
          <div className="mt-1 text-xs text-muted">
            Objectives: <Mono>{artifact.objectives.join(" → ")}</Mono>
          </div>
        </article>

        <article className="rounded-lg border border-border bg-bg p-3">
          <div className="font-mono text-micro tracking-label text-primary">CLAIM IDENTITY LOCK</div>
          <div className="mt-2 grid gap-1 text-xs text-muted">
            <div>problem · <Mono>{artifact.originalProblemId}</Mono></div>
            <div>verifier · <Mono>{artifact.verificationAdapterId}@{artifact.verificationAdapterVersion}</Mono></div>
            <div>rejected identity candidates · <Mono>{String(artifact.metrics.rejectedIdentityCandidates)}</Mono></div>
            <div>minimality · <Mono>{artifact.minimality?.kind ?? "UNAVAILABLE"}</Mono></div>
          </div>
        </article>
      </div>

      <div className="mt-3 rounded-md border border-warn/25 bg-warn/5 p-3">
        <div className="font-mono text-micro tracking-label text-warn">BOUNDARY</div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {artifact.limitations[artifact.limitations.length - 1]}
        </p>
      </div>
    </Panel>
  );
}
