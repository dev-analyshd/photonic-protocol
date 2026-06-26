/**
 * @photonic/sdk — IntentClient
 *
 * High-level client for the SAIP (Silent Auction Intent Pool).
 * Wraps ZK commitment creation, intent submission, bid building/scoring,
 * and auction reveal workflow.
 */

import { keccak256, toUtf8Bytes, randomBytes } from "ethers";
import type { ZKIntentPreimage } from "./intent.js";
import type { SAIPIntent as Intent, SAIPBid as Bid, ScoredSAIPBid as ScoredBid, Hex } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
//  ZK Intent commitment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a ZK commitment for an intent.
 * Returns the preimage (keep private!) and the hash to publish on-chain.
 *
 * hash = keccak256(taskDescription || nonce)
 */
export function buildZKCommitment(taskDescription: string): ZKIntentPreimage {
  const nonce = randomBytes(32);
  const nonceHex = Array.from(nonce).map(b => b.toString(16).padStart(2, "0")).join("") as Hex;

  const preimage = toUtf8Bytes(taskDescription + nonceHex);
  const intentHash = keccak256(preimage) as Hex;

  const idPreimage = intentHash.slice(2) + nonceHex;
  const intentId = keccak256("0x" + idPreimage) as Hex;

  return {
    intentId,
    intentHash,
    nonce: ("0x" + nonceHex) as Hex,
    taskDescription,
  };
}

/**
 * Verify a ZK reveal: confirm that hash(taskDescription || nonce) === intentHash.
 */
export function verifyZKReveal(
  taskDescription: string,
  nonce: Hex,
  expectedHash: Hex,
): boolean {
  const nonceStripped = nonce.startsWith("0x") ? nonce.slice(2) : nonce;
  const preimage = toUtf8Bytes(taskDescription + nonceStripped);
  const computed = keccak256(preimage);
  return computed.toLowerCase() === expectedHash.toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Bid scoring (client-side preview)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score a bid against an intent.
 * Score = (bpd_quality × 0.4) + (price_efficiency × 0.3)
 *       + (compositional_fitness × 0.2) + (diversity_bonus × 0.1)
 */
export function scoreBid(
  bid: Pick<Bid, "priceQuoteWei" | "diversityScore" | "compositionalFitness">,
  intent: Pick<Intent, "maxCostWei">,
  bpdQuality: number,
): number {
  const priceEfficiency =
    intent.maxCostWei > 0n
      ? Math.max(0, 1 - Number(bid.priceQuoteWei) / Number(intent.maxCostWei))
      : 0;

  return (
    bpdQuality * 0.4 +
    priceEfficiency * 0.3 +
    bid.compositionalFitness * 0.2 +
    bid.diversityScore * 0.1
  );
}

/**
 * Score and sort multiple bids for an intent.
 */
export function runAuction(
  bids: Bid[],
  intent: Intent,
  bpdQualities: number[],
): ScoredBid[] {
  if (bids.length === 0) throw new Error("Auction has no bids");
  if (bids.length !== bpdQualities.length) {
    throw new Error("bids and bpdQualities must have the same length");
  }

  const scored: ScoredBid[] = bids.map((bid, i) => ({
    bid,
    score: scoreBid(bid, intent, bpdQualities[i]),
  }));

  return scored.sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────────────────────
//  IntentClient
// ─────────────────────────────────────────────────────────────────────────────

export interface IntentClientConfig {
  /** Base URL of the PHOTONIC API server */
  apiBaseUrl: string;
  /** Chain ID (421614 = Arbitrum Sepolia) */
  chainId?: number;
}

export class IntentClient {
  private readonly config: IntentClientConfig;

  constructor(config: IntentClientConfig) {
    this.config = config;
  }

  // ── Intent creation ────────────────────────────────────────────────────────

  /**
   * Create a public intent (task visible to all bidders).
   */
  async createPublicIntent(params: {
    taskDescription: string;
    maxCostWei: bigint;
    deadlineUnix: number;
    qualityFloor?: number;
    compositionMode?: "none" | "auto" | "required";
  }): Promise<{ intentId: Hex; intentHash: Hex }> {
    const intentHash = keccak256(toUtf8Bytes(params.taskDescription)) as Hex;
    const intentId = keccak256(
      toUtf8Bytes(`${intentHash}${Date.now()}`)
    ) as Hex;
    return { intentId, intentHash };
  }

  /**
   * Create a ZK intent (task hidden until reveal).
   * Caller must store the returned preimage securely.
   */
  createZKIntent(taskDescription: string): ZKIntentPreimage {
    return buildZKCommitment(taskDescription);
  }

  /**
   * Verify a ZK reveal received from an agent.
   */
  verifyReveal(
    taskDescription: string,
    nonce: Hex,
    intentHash: Hex,
  ): boolean {
    return verifyZKReveal(taskDescription, nonce, intentHash);
  }

  // ── Auction ────────────────────────────────────────────────────────────────

  /**
   * Score bids locally (useful for simulation before on-chain auction).
   */
  rankBids(
    bids: Bid[],
    intent: Intent,
    bpdQualities: number[],
  ): ScoredBid[] {
    return runAuction(bids, intent, bpdQualities);
  }

  /**
   * Fetch current intent pool from the API.
   */
  async fetchIntents(limit = 50): Promise<Intent[]> {
    const url = `${this.config.apiBaseUrl}/intents?limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch intents: ${res.statusText}`);
    return res.json();
  }

  /**
   * Fetch bids for a specific intent.
   */
  async fetchBids(intentId: Hex): Promise<Bid[]> {
    const url = `${this.config.apiBaseUrl}/intents/${intentId}/bids`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch bids: ${res.statusText}`);
    return res.json();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Utility: compute intent score for display
// ─────────────────────────────────────────────────────────────────────────────

export function formatIntentValue(maxCostWei: bigint): string {
  const eth = Number(maxCostWei) / 1e18;
  if (eth >= 1) return `${eth.toFixed(3)} ETH`;
  const gwei = Number(maxCostWei) / 1e9;
  return `${gwei.toFixed(1)} Gwei`;
}
