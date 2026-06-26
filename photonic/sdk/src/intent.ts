// ─────────────────────────────────────────────────────────────────────────────
//  PHOTONIC SDK — Intent Client (SAIP)
// ─────────────────────────────────────────────────────────────────────────────

import { keccak256, toUtf8Bytes, hexlify, randomBytes } from "ethers";
import type { Bytes32, IntentInput } from "./types.js";
import { PrivacyMode } from "./types.js";

export interface ZKIntentPreimage {
  intentId: Bytes32;
  intentHash: Bytes32;
  nonce: Bytes32;
  taskDescription: string;
}

/// Build a ZK commitment for an intent.
/// Returns intentHash (what goes on-chain) + nonce (kept secret until reveal).
export function buildZKIntentCommitment(taskDescription: string): ZKIntentPreimage {
  const nonce = hexlify(randomBytes(32)) as Bytes32;
  const intentId = keccak256(
    toUtf8Bytes(taskDescription + nonce + Date.now().toString())
  ) as Bytes32;
  const intentHash = keccak256(
    toUtf8Bytes(taskDescription) + nonce.slice(2)
  ) as Bytes32;

  return { intentId, intentHash, nonce, taskDescription };
}

/// Build a public intent ID
export function buildPublicIntentId(taskDescription: string, caller: string): Bytes32 {
  return keccak256(
    toUtf8Bytes(taskDescription + caller + Date.now().toString())
  ) as Bytes32;
}

/// Compute the PHOTONIC bid score off-chain for display
/// Score = (bpdQuality * 0.4) + (priceEfficiency * 0.3)
///       + (compositionalFitness * 0.2) + (diversityBonus * 0.1)
export function computeBidScore(params: {
  bpdQualityScore: number;  // 0–1
  priceQuote: bigint;
  maxCost: bigint;
  compositionalFitness: number; // 0–1
  diversityScore: number;       // 0–1
}): number {
  const priceEfficiency =
    params.maxCost > 0n
      ? 1 - Number(params.priceQuote) / Number(params.maxCost)
      : 0;

  return (
    params.bpdQualityScore * 0.4 +
    priceEfficiency * 0.3 +
    params.compositionalFitness * 0.2 +
    params.diversityScore * 0.1
  );
}

/// Validate that a ZK reveal matches the on-chain commitment
export function validateZKReveal(
  taskDescription: string,
  nonce: Bytes32,
  expectedHash: Bytes32
): boolean {
  const computed = keccak256(
    toUtf8Bytes(taskDescription) + nonce.slice(2)
  ) as Bytes32;
  return computed === expectedHash;
}
