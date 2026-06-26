// ─────────────────────────────────────────────────────────────────────────────
//  @photonic/sdk — Public API
// ─────────────────────────────────────────────────────────────────────────────

export * from "./types.js";
export * from "./genome.js";
export * from "./bpd.js";
export * from "./intent.js";
export * from "./casc.js";

export const PHOTONIC_VERSION = "0.1.0";
export const SCALE = BigInt("1000000000000000000"); // 1e18

// Re-export useful ethers utilities for consumers
export { keccak256, toUtf8Bytes, hexlify, randomBytes } from "ethers";
