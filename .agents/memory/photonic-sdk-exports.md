---
name: PHOTONIC SDK export rules
description: Which SDK files export which names; collision fixes already applied
---

# PHOTONIC SDK — naming rules (post-collision-fix)

**Why:** Multiple files exported the same names, causing TS2308 at the index barrel.

## Authoritative homes

| Name | File |
|------|------|
| `buildMerkleRoot` | `genome.ts` only |
| `mergeGenomes` | `genome.ts` only |
| `ZKIntentPreimage` | `intent.ts` only (removed from types.ts) |
| `ExecutionStep` | `types.ts` only (import from there, not bpd.ts) |
| `buildCapabilityMerkleRoot` | `genome-builder.ts` (renamed to avoid genome.ts conflict) |
| `mergeBuiltGenomes` | `genome-builder.ts` (renamed to avoid genome.ts conflict) |

**How to apply:** If you add a new export to genome-builder.ts or intent-client.ts, grep for that name in genome.ts and intent.ts first — if it exists there, pick a different name.

## Uint8Array concatenation
`toUtf8Bytes() + toUtf8Bytes()` is a TS2365 error under TS 5.9. Use `concat([...])` from ethers instead.

## VitalityState.vitality
Is `bigint` in 1e18 scale. The death threshold is hardcoded as `BigInt("200000000000000000")` (0.20 × 1e18) in provider-client.ts.

## provider-client.ts — BPD generation
Calls `generateBPD({intent, output, executionTrace, provider})` — the named-params form. The export in bpd.ts is `generateBPD`, not `buildBPD`.
