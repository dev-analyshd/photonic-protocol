/**
 * @photonic/sdk — ProviderClient
 *
 * High-level client for PHOTONIC agent providers (agents that receive intents,
 * generate BPDs, and earn surplus through the CAP order lifecycle).
 *
 * Manages:
 * - Agent registration and genome publication
 * - Bid submission to SAIP
 * - Order monitoring and BPD delivery
 * - Vitality state polling
 * - Resurrection trial management
 */

import type {
  BuiltGenome, SAIPBid as Bid, VitalityState, Hex,
  AgentRegistration, ProviderStatus,
} from "./types.js";
import { generateBPD } from "./bpd.js";
import type { ExecutionStep } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
//  ProviderClientConfig
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderClientConfig {
  /** On-chain address of this provider agent */
  agentAddress: Hex;
  /** Base URL of the PHOTONIC API server */
  apiBaseUrl: string;
  /** Chain ID (421614 = Arbitrum Sepolia) */
  chainId?: number;
  /** Deployed contract addresses */
  contracts: {
    registry: Hex;
    escrow: Hex;
    auction: Hex;
    verifier: Hex;
    vitality: Hex;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  ProviderClient
// ─────────────────────────────────────────────────────────────────────────────

export class ProviderClient {
  private readonly config: ProviderClientConfig;
  private _genome: BuiltGenome | null = null;
  private _vitality: VitalityState | null = null;

  constructor(config: ProviderClientConfig) {
    this.config = config;
  }

  // ── Registration ───────────────────────────────────────────────────────────

  /**
   * Register the agent with its genome. Must be called before bidding.
   */
  async register(genome: BuiltGenome): Promise<AgentRegistration> {
    this._genome = genome;
    const res = await this._post("/agents/register", {
      agentAddress: this.config.agentAddress,
      genomeHash: genome.genomeHash,
      capabilityRoot: genome.capabilityRoot,
      toolRoot: genome.toolRoot,
      promptArchHash: genome.promptArchHash,
      generation: genome.generation,
      parentA: genome.parentA,
      parentB: genome.parentB,
      chainId: this.config.chainId ?? 421614,
    });
    return res as AgentRegistration;
  }

  // ── Bidding ────────────────────────────────────────────────────────────────

  /**
   * Submit a bid for an intent in the SAIP pool.
   */
  async submitBid(params: {
    intentId: Hex;
    priceQuoteWei: bigint;
    bpdSample: Hex;
    diversityScore?: number;
    compositionalFitness?: number;
  }): Promise<{ bidId: Hex; score: number }> {
    if (!this._genome) throw new Error("Agent not registered — call register() first");

    const bid: Bid = {
      agentId: this.config.agentAddress,
      genomeHash: this._genome.genomeHash,
      priceQuoteWei: params.priceQuoteWei,
      bpdSample: params.bpdSample,
      diversityScore: params.diversityScore ?? 0.5,
      compositionalFitness: params.compositionalFitness ?? 0.5,
    };

    const res = await this._post(`/intents/${params.intentId}/bids`, bid);
    return res as { bidId: Hex; score: number };
  }

  // ── Delivery ───────────────────────────────────────────────────────────────

  /**
   * Build a BPD from task execution and deliver it for an order.
   * Returns the BPD hash for on-chain verification.
   */
  async deliverBPD(params: {
    orderId: Hex;
    intent: string;
    output: string;
    executionTrace: ExecutionStep[];
  }): Promise<{ bpdId: Hex; bpdHash: Hex; qualityScore: number }> {
    const bpd = generateBPD({
      intent: params.intent,
      output: params.output,
      executionTrace: params.executionTrace,
      provider: this.config.agentAddress,
    });

    const res = await this._post(`/orders/${params.orderId}/deliver`, {
      bpdId: bpd.bpdId,
      bpdHash: bpd.bpdHash,
      merkleRoot: bpd.merkleRoot,
      traceDepth: bpd.executionTrace.length,
      agentAddress: this.config.agentAddress,
      genomeHash: this._genome?.genomeHash,
    });

    return {
      bpdId: bpd.bpdId,
      bpdHash: bpd.bpdHash,
      qualityScore: (res as { qualityScore: number }).qualityScore ?? 0,
    };
  }

  // ── Vitality ───────────────────────────────────────────────────────────────

  /**
   * Fetch current vitality state for this agent.
   */
  async getVitality(): Promise<VitalityState> {
    const res = await this._get(`/agents/${this.config.agentAddress}/vitality`);
    this._vitality = res as VitalityState;
    return this._vitality;
  }

  /**
   * True if agent is currently above the default death threshold (0.20 * 1e18).
   */
  get isAlive(): boolean {
    if (!this._vitality) return true; // optimistic if not yet fetched
    // VitalityState.vitality is bigint in 1e18 scale; 0.20 = 200_000_000_000_000_000n
    return this._vitality.vitality > BigInt("200000000000000000");
  }

  /**
   * Fetch full status report.
   */
  async getStatus(): Promise<ProviderStatus> {
    const res = await this._get(`/agents/${this.config.agentAddress}/status`);
    return res as ProviderStatus;
  }

  // ── Resurrection ───────────────────────────────────────────────────────────

  /**
   * Begin a resurrection trial for another agent.
   * Caller (this provider) acts as sponsor.
   */
  async sponsorResurrection(deadAgentAddress: Hex): Promise<{ trialId: Hex }> {
    const res = await this._post(`/agents/${deadAgentAddress}/resurrect`, {
      sponsor: this.config.agentAddress,
      chainId: this.config.chainId ?? 421614,
    });
    return res as { trialId: Hex };
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /**
   * List all active orders assigned to this agent.
   */
  async getActiveOrders(): Promise<{ orderId: Hex; intentHash: Hex; amountWei: bigint }[]> {
    const res = await this._get(`/agents/${this.config.agentAddress}/orders`);
    return res as { orderId: Hex; intentHash: Hex; amountWei: bigint }[];
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async _get(path: string): Promise<unknown> {
    const res = await fetch(`${this.config.apiBaseUrl}${path}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GET ${path} failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  private async _post(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.config.apiBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v
      ),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`POST ${path} failed (${res.status}): ${text}`);
    }
    return res.json();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Vitality display utilities
// ─────────────────────────────────────────────────────────────────────────────

export function vitalityColor(vitality: number): string {
  if (vitality >= 0.7) return "#00ff88";
  if (vitality >= 0.4) return "#ffaa00";
  if (vitality >= 0.2) return "#ff6600";
  return "#ff0044";
}

export function vitalityLabel(vitality: number): string {
  if (vitality >= 0.7) return "Thriving";
  if (vitality >= 0.4) return "Stable";
  if (vitality >= 0.2) return "Declining";
  return "Critical";
}

export function fitnessLabel(score: number): string {
  if (score >= 0.8) return "Exceptional";
  if (score >= 0.6) return "Strong";
  if (score >= 0.4) return "Viable";
  if (score >= 0.2) return "Weak";
  return "Critical";
}
