# Assurance Inspection Contract

rlsenti consumes the portable `causal-assurance-repair-propagation/v1` contract as a read-only inspection boundary.

The inspector validates schema identity, canonical SHA-256 digest syntax, required provenance fields, and `nativeReplayVerified`.

It deliberately does not reinterpret the underlying verification result. The upstream claim boundary survives presentation unchanged.

This keeps UI state distinct from evidence authority: a green inspection state means the transport contract is structurally acceptable, not that the target protocol is globally safe.
