// ─────────────────────────────────────────────────────────────────────────────
//  @photonic/sdk — Public API
// ─────────────────────────────────────────────────────────────────────────────

export * from "./types.js";
export * from "./genome.js";
export * from "./bpd.js";
export * from "./intent.js";
export * from "./casc.js";
export * from "./genome-builder.js";
export * from "./intent-client.js";
export * from "./provider-client.js";

export const PHOTONIC_VERSION = "0.1.0";
export const SCALE = BigInt("1000000000000000000"); // 1e18

// Deployed contract addresses on Arbitrum Sepolia (chainId 421614)
export const PHOTONIC_ADDRESSES = {
  421614: {
    PhotonicRegistry: "0xb1075B5b608A2F22C35cFAF84AD6cC7bda7480FC",
    PhotonicVitality: "0x6c9e388C8C35ef4190e4BaAf94124402cc8578B7",
    PhotonicVerifier: "0x81A24B7eACcb5d2d67F3945e05459DD28448D421",
    PhotonicAuction:  "0x2Eb41741012C9add2556f74660Ad1f97f6f7865D",
    PhotonicEscrow:   "0x97aA63BEd46C23b5bA720c938BB985A79D6A0fFB",
  },
} as const;

// Re-export useful ethers utilities for consumers
export { keccak256, toUtf8Bytes, hexlify, randomBytes } from "ethers";
