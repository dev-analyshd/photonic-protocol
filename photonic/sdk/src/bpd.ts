// ─────────────────────────────────────────────────────────────────────────────
//  PHOTONIC SDK — BPD Generator
//  Computes Behavioral Proof of Delivery from an execution trace.
// ─────────────────────────────────────────────────────────────────────────────

import { keccak256, toUtf8Bytes, hexlify, randomBytes } from "ethers";
import type { BehavioralProofOfDelivery, Bytes32, ExecutionStep } from "./types.js";
import { buildMerkleRoot } from "./genome.js";

/// Hash a single execution step for inclusion in the Merkle tree
function hashStep(step: ExecutionStep): string {
  const encoded = JSON.stringify({
    stepId: step.stepId,
    type: step.type,
    input: step.input,
    output: step.output,
    timestamp: step.timestamp,
  });
  return keccak256(toUtf8Bytes(encoded));
}

/// Build the execution trace Merkle root
export function buildExecutionTraceMerkleRoot(steps: ExecutionStep[]): Bytes32 {
  const leaves = steps.map(hashStep);
  return buildMerkleRoot(leaves);
}

/// Generate a full BPD from intent, output, and execution trace
export function generateBPD(params: {
  intent: string;
  output: string;
  executionTrace: ExecutionStep[];
  provider: `0x${string}`;
}): BehavioralProofOfDelivery {
  const nonce = hexlify(randomBytes(32)) as Bytes32;
  const timestamp = Date.now();
  const merkleRoot = buildExecutionTraceMerkleRoot(params.executionTrace);

  // BPD = Hash(intent || output || execution_trace_root || timestamp || nonce)
  const bpdHash = keccak256(
    toUtf8Bytes(params.intent) +
    toUtf8Bytes(params.output).slice(2) +
    merkleRoot.slice(2) +
    timestamp.toString(16).padStart(16, "0") +
    nonce.slice(2)
  ) as Bytes32;

  // BPD ID is the hash of the provider + intent + timestamp
  const bpdId = keccak256(
    toUtf8Bytes(params.provider + params.intent + timestamp.toString())
  ) as Bytes32;

  return {
    bpdId,
    bpdHash,
    intent: params.intent,
    output: params.output,
    executionTrace: params.executionTrace,
    merkleRoot,
    timestamp,
    nonce,
    provider: params.provider,
  };
}

/// Verify a BPD by re-hashing (used by peer verifiers)
export function verifyBPD(bpd: BehavioralProofOfDelivery): boolean {
  const recomputedRoot = buildExecutionTraceMerkleRoot(bpd.executionTrace);
  if (recomputedRoot !== bpd.merkleRoot) return false;

  const recomputedHash = keccak256(
    toUtf8Bytes(bpd.intent) +
    toUtf8Bytes(bpd.output).slice(2) +
    bpd.merkleRoot.slice(2) +
    bpd.timestamp.toString(16).padStart(16, "0") +
    bpd.nonce.slice(2)
  ) as Bytes32;

  return recomputedHash === bpd.bpdHash;
}

/// Compute quality score for a BPD (0–1e18 scale)
/// Based on: trace depth, output length, step diversity
export function scoreBPD(bpd: BehavioralProofOfDelivery): bigint {
  const SCALE = BigInt(1e18);
  const traceDepth = BigInt(Math.min(bpd.executionTrace.length, 20));
  const outputLen = BigInt(Math.min(bpd.output.length, 2000));
  const stepTypes = new Set(bpd.executionTrace.map((s) => s.type));
  const diversity = BigInt(stepTypes.size);

  const depthScore = (traceDepth * SCALE) / BigInt(20);
  const outputScore = (outputLen * SCALE) / BigInt(2000);
  const diversityScore = (diversity * SCALE) / BigInt(4);

  return (depthScore + outputScore + diversityScore) / BigInt(3);
}
