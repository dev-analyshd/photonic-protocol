// ─────────────────────────────────────────────────────────────────────────────
//  PHOTONIC SDK — CASC (Cross-Agent State Capsule)
// ─────────────────────────────────────────────────────────────────────────────

import { keccak256, toUtf8Bytes, hexlify, randomBytes, concat } from "ethers";
import type { Bytes32, Address, CASCInput, CASC } from "./types.js";

/// Simulate AES-GCM encryption of a state fragment using a session key.
/// In production this would use WebCrypto AES-GCM. Here we model it as
/// keccak256(sessionKey || serializedFragment) for demonstration.
function encryptFragment(fragment: unknown, sessionKey: string): Bytes32 {
  const serialized = JSON.stringify(fragment);
  return keccak256(
    concat([toUtf8Bytes(sessionKey), toUtf8Bytes(serialized)])
  ) as Bytes32;
}

/// Build a session key commitment: keccak256(sessionKey || agentAddress)
function buildSessionKeyCommitment(sessionKey: string, provider: Address): Bytes32 {
  return keccak256(toUtf8Bytes(sessionKey + provider)) as Bytes32;
}

/// Build a continuity proof linking to the previous CASC
function buildContinuityProof(
  previousCASCHash: Bytes32 | undefined,
  currentTimestamp: number
): Bytes32 {
  if (!previousCASCHash || previousCASCHash === ("0x" + "0".repeat(64))) {
    return ("0x" + "0".repeat(64)) as Bytes32;
  }
  return keccak256(
    previousCASCHash + currentTimestamp.toString(16).padStart(16, "0")
  ) as Bytes32;
}

/// Encrypt state fragments and build a CASC
export function buildCASC(input: CASCInput, provider: Address): CASC {
  const sessionKey = input.sessionKey || hexlify(randomBytes(32));
  const timestamp = Math.floor(Date.now() / 1000);

  const encryptedFragments = input.stateFragments.map((f) =>
    encryptFragment(f, sessionKey)
  );

  const sessionKeyCommitment = buildSessionKeyCommitment(sessionKey, provider);
  const continuityProof = buildContinuityProof(input.previousCASCHash, timestamp);

  return {
    encryptedFragments,
    sessionKeyCommitment,
    maxAge: input.maxAgeSeconds,
    timestamp,
    continuityProof,
    accessPolicy: input.accessPolicy,
  };
}

/// Check whether a CASC is still fresh
export function isCASCFresh(casc: CASC): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now - casc.timestamp <= casc.maxAge;
}

/// Verify that an agent is in the access policy
export function canAccess(casc: CASC, agent: Address): boolean {
  return casc.accessPolicy
    .map((a) => a.toLowerCase())
    .includes(agent.toLowerCase());
}
