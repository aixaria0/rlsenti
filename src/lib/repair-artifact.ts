export interface RepairArtifactView {
  schema: "repair-artifact/v1";
  repairProblemId: string;
  modelFamily: string;
  repairAdapterId: string;
  repairAdapterVersion: string;
  verificationAdapterId: string;
  verificationAdapterVersion: string;
  originalProblemId: string;
  originalOutcome: "WITNESS_FOUND";
  outcome: "REPAIR_FOUND" | "NO_REPAIR_IN_MODEL" | "LIMIT_REACHED";
  objectives: string[];
  selectedActions: Array<{
    label: string;
    cost: number[];
    cumulativeCost: number[];
    metadata?: Record<string, string | number>;
  }>;
  totalCost: number[] | null;
  postRepairVerification: {
    schema: "verification-artifact/v1";
    problemId: string;
    modelFamily: string;
    adapterId: string;
    adapterVersion: string;
    outcome: string;
    scope: Record<string, unknown>;
    assumptions: string[];
    limitations: string[];
  } | null;
  scope: Record<string, unknown>;
  assumptions: string[];
  limitations: string[];
  minimality?: {
    kind: string;
    objectives: string[];
  };
  metrics: {
    exploredStates: number;
    frontierPeak: number;
    rejectedIdentityCandidates: number;
  };
}

export const AETHERFORGE_REPAIR_CAPTURE = {
  source: {
    repository: "aixaria0/RCHAIN-COMPLIER",
    commit: "17edff269dcb3cf0505975aad7ebe6d4af2834d9",
    workflow: "Verification Core CI",
    workflowRunId: 36361740738,
    capturedStep: "Run AETHER FORGE minimal-repair demo",
  },
  artifact: {
    schema: "repair-artifact/v1",
    repairProblemId: "aetherforge-minimal-numeric-repair",
    modelFamily: "numeric-scientific-model/v1",
    repairAdapterId: "aetherforge-frozen-snapshot-repair",
    repairAdapterVersion: "1",
    verificationAdapterId: "aetherforge-numeric-conformance",
    verificationAdapterVersion: "1",
    originalProblemId: "aetherforge-physics-numeric-conformance",
    originalOutcome: "WITNESS_FOUND",
    outcome: "REPAIR_FOUND",
    objectives: [
      "numeric_fields_changed",
      "absolute_numeric_delta",
    ],
    selectedActions: [
      {
        label: "restore:bounce[0].rho",
        cost: [1, 0.004037216315996671],
        cumulativeCost: [1, 0.004037216315996671],
        metadata: {
          path: "bounce[0].rho",
          before: 0.008074432631993343,
          after: 0.004037216315996671,
          source: "pinned-aetherforge-snapshot",
        },
      },
    ],
    totalCost: [1, 0.004037216315996671],
    postRepairVerification: {
      schema: "verification-artifact/v1",
      problemId: "aetherforge-physics-numeric-conformance",
      modelFamily: "numeric-scientific-model/v1",
      adapterId: "aetherforge-numeric-conformance",
      adapterVersion: "1",
      outcome: "UNREACHABLE_IN_MODEL",
      scope: {
        subject: "AETHER FORGE numerical model snapshot",
        repository: "aixaria0/aetherforge",
        commit: "f264c530a39acf029070eee077eec96518a84055",
        sourceFile: "src/lib/physics.ts",
        sourceBlob: "4bde80996a058a3c454c2c24654aea00e9873da8",
      },
      assumptions: [
        "the supplied snapshot was produced from the pinned AETHER FORGE source revision",
        "floating-point comparison tolerance is 1e-12 relative to unit scale",
        "the declared fixture samples are the complete scope of this conformance run",
      ],
      limitations: [
        "checks only deterministic numerical self-consistency of the supplied frozen snapshot",
        "does not establish physical correctness of EPRL, LQC, black-hole entropy, or gravitational-wave models",
        "source pin is recorded as provenance metadata; this adapter does not fetch or authenticate GitHub",
      ],
    },
    scope: {
      subject: "AETHER FORGE numerical model snapshot",
      repository: "aixaria0/aetherforge",
      commit: "f264c530a39acf029070eee077eec96518a84055",
      sourceFile: "src/lib/physics.ts",
      sourceBlob: "4bde80996a058a3c454c2c24654aea00e9873da8",
    },
    assumptions: [
      "the supplied snapshot was produced from the pinned AETHER FORGE source revision",
      "floating-point comparison tolerance is 1e-12 relative to unit scale",
      "the declared fixture samples are the complete scope of this conformance run",
    ],
    limitations: [
      "repair minimality is established only inside the declared repair state space",
      "a successful repair preserves problem id, model family, scope, assumptions, and verification adapter",
      "REPAIR_FOUND means the same verifier returned UNREACHABLE_IN_MODEL after the selected intervention",
      "allowed interventions only restore numeric fields to the pinned AETHER FORGE snapshot",
      "array shape and source identity are fixed; structural edits are outside this repair model",
      "repair success establishes internal conformance only, not physical correctness",
    ],
    minimality: {
      kind: "LEXICOGRAPHIC_MINIMUM_WITHIN_DECLARED_REPAIR_SPACE",
      objectives: [
        "numeric_fields_changed",
        "absolute_numeric_delta",
      ],
    },
    metrics: {
      exploredStates: 2,
      frontierPeak: 1,
      rejectedIdentityCandidates: 0,
    },
  } satisfies RepairArtifactView,
} as const;
