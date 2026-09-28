import { createFileRoute } from "@tanstack/react-router";
import { shortHex } from "@/lib/compiler";
import { useWorkbench } from "@/lib/workbench-state";
import { MobileNav } from "@/components/wb/shell";
import { EvidenceList, Expandable, FieldRow, Panel, SeverityTag, StatusTag } from "@/components/wb/primitives";
import { AssuranceInspector } from "@/components/wb/assurance-inspector";
import { RepairArtifactInspector } from "@/components/wb/repair-artifact-inspector";

export const Route = createFileRoute("/evidence")({
  component: Evidence,
});

function Evidence() {
  const { reality } = useWorkbench();
  const c = reality.cross;
  return (
    <div className="grid gap-3">
      <MobileNav />
      <AssuranceInspector />
      <RepairArtifactInspector />
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Cross-node report" subtitle="Sentinel observation — not stake-weighted finality" right={c ? <StatusTag status={c.status} /> : null}>
          {c ? (
            <>
              <FieldRow label="reachable" value={`${c.reachableCount} / ${c.targetCount}`} source="CrossNodeReport" field="reachable_count" />
              <FieldRow label="agreeing" value={String(c.agreeingNodes)} source="CrossNodeReport" field="agreeing_nodes" />
              <FieldRow label="ratio" value={c.agreementRatio.toFixed(2)} source="CrossNodeReport" field="agreement_ratio" />
              <FieldRow label="quorum observed" value={String(c.quorumObserved)} source="CrossNodeReport" field="quorum_observed" />
              <FieldRow
                label="common hash"
                value={c.commonHash ? shortHex(c.commonHash) : "UNAVAILABLE"}
                unavailable={!c.commonHash}
              />
              <p className="mt-3 text-xs text-muted">{c.verificationBasis}</p>
            </>
          ) : (
            <p className="text-sm text-muted">UNAVAILABLE — no block, no observations.</p>
          )}
        </Panel>
        <Panel title="Sovereign Lattice" subtitle="Independent PBFT-shaped certificate analysis" right={reality.lattice ? <StatusTag status={reality.lattice.status} /> : null}>
          {reality.lattice ? (
            <>
              <FieldRow label="N / f / Q" value={`${reality.lattice.n} / ${reality.lattice.f} / ${reality.lattice.quorum}`} />
              <FieldRow label="primary" value={reality.lattice.primary} />
              <FieldRow label="prepared" value={`${reality.lattice.preparedCount} · cert ${reality.lattice.preparedCertificate}`} />
              <FieldRow label="committed" value={`${reality.lattice.committedCount} · cert ${reality.lattice.committedCertificate}`} />
              <FieldRow label="conflicting prepare" value={String(reality.lattice.conflictingPrepare)} />
              <p className="mt-3 text-xs text-muted">{reality.lattice.verificationBasis}</p>
              <p className="mt-1 text-xs text-subtle">{reality.lattice.notClaimed}</p>
            </>
          ) : (
            <p className="text-sm text-muted">UNAVAILABLE — no digest to vote on.</p>
          )}
        </Panel>
      </div>

      {reality.lattice ? (
        <Panel title="PBFT votes" subtitle="PrePrepare → Prepare → Commit · conflicting digests dropped">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-xs">
              <thead className="font-mono text-micro tracking-label text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">REPLICA</th>
                  <th className="py-2 pr-3">PHASE</th>
                  <th className="py-2 pr-3">DIGEST</th>
                  <th className="py-2 pr-3">ACCEPTED</th>
                  <th className="py-2">REASON</th>
                </tr>
              </thead>
              <tbody>
                {reality.lattice.votes.map((v, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 pr-3 font-mono text-xxs">{v.replica}</td>
                    <td className="py-2 pr-3 font-mono text-xxs text-primary">{v.phase}</td>
                    <td className="py-2 pr-3 font-mono text-xxs">{shortHex(v.digest)}</td>
                    <td className="py-2 pr-3">{v.accepted ? "yes" : "no"}</td>
                    <td className="py-2 text-muted">{v.rejectReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <Panel title="Observations">
        {reality.observations.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-xs">
              <thead className="font-mono text-micro tracking-label text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">NODE</th>
                  <th className="py-2 pr-3">REACHABLE</th>
                  <th className="py-2 pr-3">HEIGHT</th>
                  <th className="py-2 pr-3">HASH</th>
                  <th className="py-2 pr-3">PROPOSER</th>
                  <th className="py-2">JUSTIFICATION</th>
                </tr>
              </thead>
              <tbody>
                {reality.observations.map((o) => (
                  <tr key={o.nodeId} className="border-b border-border/50">
                    <td className="py-2 pr-3 font-mono text-xxs">{o.nodeId}</td>
                    <td className="py-2 pr-3">{o.reachable ? "true" : "false"}</td>
                    <td className="py-2 pr-3 tabular-nums">{o.lastFinalizedBlockNumber}</td>
                    <td className="py-2 pr-3 font-mono text-xxs">{shortHex(o.blockHash)}</td>
                    <td className="py-2 pr-3 font-mono text-xxs">{o.proposer}</td>
                    <td className="py-2">{o.justificationPresent ? o.justificationCount : "absent"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">UNAVAILABLE</p>
        )}
      </Panel>

      <Panel title="Invariants" subtitle="PASS / WARN / FAIL with an evidence trail. Not Lean proofs.">
        {reality.invariants.map((inv) => (
          <Expandable
            key={inv.id}
            header={
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xxs text-primary">{inv.id}</span>
                <span className="text-sm">{inv.name}</span>
                <StatusTag status={inv.status} />
                <SeverityTag severity={inv.severity} />
              </div>
            }
          >
            <p className="mb-2 text-xs text-muted">{inv.detail}</p>
            <EvidenceList evidence={inv.evidence} />
          </Expandable>
        ))}
      </Panel>

      <Panel title="Verification matrix">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="font-mono text-micro tracking-label text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3">CHECK</th>
                <th className="py-2 pr-3">STATUS</th>
                <th className="py-2 pr-3">SEV</th>
                <th className="py-2 pr-3">SOURCE</th>
                <th className="py-2">MESSAGE</th>
              </tr>
            </thead>
            <tbody>
              {reality.checks.map((ch) => (
                <tr key={ch.id} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-3">{ch.name}</td>
                  <td className="py-2 pr-3">
                    <StatusTag status={ch.status} />
                  </td>
                  <td className="py-2 pr-3">
                    <SeverityTag severity={ch.severity} />
                  </td>
                  <td className="py-2 pr-3 font-mono text-xxs text-evidence">{ch.source}</td>
                  <td className="py-2 text-muted">{ch.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {reality.casper ? (
        <Panel title="Casper evidence inventory" subtitle="Recognized protocol fields — not authenticated proof">
          <FieldRow label="status" value={reality.casper.status} />
          <FieldRow label="bonds" value={String(reality.casper.bondCount)} />
          <FieldRow label="observed stake" value={String(reality.casper.totalObservedStake)} />
          <FieldRow label="duplicates" value={String(reality.casper.duplicateValidatorCount)} />
          <FieldRow label="fields" value={reality.casper.recognizedFields.join(", ")} />
          <p className="mt-3 text-xs text-muted">{reality.casper.verificationBasis}</p>
        </Panel>
      ) : null}
    </div>
  );
}
