import fs from 'node:fs';
import path from 'node:path';
import { compile, SCENARIOS, MUTATIONS } from '../src/lib/compiler/compile.ts';

const runs = {};
for (const scenario of SCENARIOS) {
  runs[scenario.id] = {};
  for (const mutation of MUTATIONS.filter((m) => m.applies.includes(scenario.id))) {
    const r = compile(scenario.id, mutation.id);
    const baseline = mutation.id === 'none' ? r : compile(scenario.id, 'none');
    const baseByLayer = new Map(baseline.envelopes.map((e) => [e.layer, e]));
    let firstEnvelopeDivergence = null;
    for (const e of r.envelopes) {
      const b = baseByLayer.get(e.layer);
      if (b && b.hash !== e.hash) {
        firstEnvelopeDivergence = {
          layer: e.layer,
          baselineHash: b.hash,
          activeHash: e.hash,
          baselineLabel: b.label,
          activeLabel: e.label,
        };
        break;
      }
    }
    runs[scenario.id][mutation.id] = {
      status: r.status,
      why: r.why,
      witness: r.witness,
      replay: r.replay,
      firstEnvelopeDivergence,
      qos: r.qos,
      qlf: r.qlf,
      execution: r.execution ? {
        source: r.execution.source,
        normalized: r.execution.normalized,
        comms: r.execution.comms,
        stuck: r.execution.stuck,
        stateHash: r.execution.stateHash,
        traceHash: r.execution.traceHash,
        steps: r.execution.steps,
      } : null,
      blocks: r.blocks,
      cross: r.cross,
      lattice: r.lattice,
      envelopes: r.envelopes.map((e) => ({
        eventId: e.eventId,
        layer: e.layer,
        label: e.label,
        summary: e.summary,
        hash: e.hash,
        payloadHash: e.payloadHash,
        prevHash: e.prevHash,
        verificationResults: e.verificationResults,
        fields: e.fields,
      })),
      invariants: r.invariants,
      claims: r.claims,
    };
  }
}

const payload = {
  schema: 'rlsenti-showcase-v1',
  generatedFrom: 'src/lib/compiler/compile.ts',
  generatedAt: new Date().toISOString(),
  scenarios: SCENARIOS,
  mutations: MUTATIONS,
  runs,
};
fs.mkdirSync(path.resolve('site/data'), { recursive: true });
fs.writeFileSync(path.resolve('site/data/reality.json'), JSON.stringify(payload, null, 2));
console.log(`showcase data: ${Object.values(runs).reduce((n, x) => n + Object.keys(x).length, 0)} compiler runs`);
