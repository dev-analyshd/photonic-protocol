/**
 * chain.ts — Read-only Arbitrum Sepolia chain reader.
 *
 * All results are cached for 60 s to avoid hammering the public RPC.
 * Every exported function catches RPC errors and returns null so callers
 * can fall back to mock data gracefully.
 */

import { ethers } from "ethers";
import { logger } from "./logger.js";

const RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";
const SCALE = BigInt("1000000000000000000"); // 1e18

export const ADDRESSES = {
  registry: "0xb1075B5b608A2F22C35cFAF84AD6cC7bda7480FC",
  vitality: "0x6c9e388C8C35ef4190e4BaAf94124402cc8578B7",
  verifier: "0x81A24B7eACcb5d2d67F3945e05459DD28448D421",
  auction:  "0x2Eb41741012C9add2556f74660Ad1f97f6f7865D",
  escrow:   "0x97aA63BEd46C23b5bA720c938BB985A79D6A0fFB",
  chainId:  421614,
} as const;

// ── Minimal ABIs (only the functions/views we call) ────────────────────────

const REGISTRY_ABI = [
  "function totalAgents() external view returns (uint256)",
  "function totalExtinct() external view returns (uint256)",
  "function getAgentsPaginated(uint256 offset, uint256 limit) external view returns (address[])",
  "function getGenome(address agent) external view returns (tuple(bytes32 capabilityRoot, bytes32 toolRoot, bytes32 promptArchHash, bytes32 behavioralHistoryRoot, uint256 fitnessScore, uint32 generation, address parentA, address parentB, uint64 registeredAt, uint64 lastActivityAt, bool alive))",
  "function isAlive(address agent) external view returns (bool)",
  "function getFossilCount() external view returns (uint256)",
  "function getFossilsPaginated(uint256 offset, uint256 limit) external view returns (address[])",
  "function getFossil(address agent) external view returns (tuple(bytes32 genomeSnapshot, uint256 finalFitnessScore, uint64 diedAt, string causeOfDeath, uint32 generation))",
  "function registered(address) external view returns (bool)",
];

const VITALITY_ABI = [
  "function getVitalityState(address agent) external view returns (tuple(uint256 vitality, uint256 bpdQualityAccum, uint256 compositionalSuccesses, uint256 surplusAccum, uint256 diversityScore, uint256 resurrectionVouches, uint256 totalBPDs, uint256 totalDeliveries, uint64 lastDecayAt, bool inResurrectionTrial, uint64 resurrectionTrialStart, uint256 resurrectionBPDCount, address resurrectionSponsor))",
  "function getDynamicThreshold() external view returns (uint256)",
  "function marketplaceMaturity() external view returns (uint256)",
];

const AUCTION_ABI = [
  "function getAllIntentCount() external view returns (uint256)",
  "function allIntents(uint256) external view returns (bytes32)",
  "function getIntent(bytes32 intentId) external view returns (tuple(bytes32 intentId, address buyer, bytes32 intentHash, string taskDescription, uint256 maxCost, uint64 deadline, uint256 qualityFloor, uint8 privacyMode, uint8 compositionMode, uint8 status, address winner, uint64 createdAt, uint64 awardedAt))",
  "function getBids(bytes32 intentId) external view returns (tuple(address agent, bytes32 genomeHash, uint256 priceQuote, bytes32 bpdSample, uint256 scoreCached, uint64 submittedAt, bool active)[])",
];

// ── Singleton contracts ───────────────────────────────────────────────────

let _provider: ethers.JsonRpcProvider | null = null;
let _registry: ethers.Contract | null = null;
let _vitality: ethers.Contract | null = null;
let _auction: ethers.Contract | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) _provider = new ethers.JsonRpcProvider(RPC_URL);
  return _provider;
}
function getRegistry(): ethers.Contract {
  if (!_registry) _registry = new ethers.Contract(ADDRESSES.registry, REGISTRY_ABI, getProvider());
  return _registry;
}
function getVitality(): ethers.Contract {
  if (!_vitality) _vitality = new ethers.Contract(ADDRESSES.vitality, VITALITY_ABI, getProvider());
  return _vitality;
}
function getAuction(): ethers.Contract {
  if (!_auction) _auction = new ethers.Contract(ADDRESSES.auction, AUCTION_ABI, getProvider());
  return _auction;
}

// ── In-memory cache ───────────────────────────────────────────────────────

const CACHE = new Map<string, { data: unknown; exp: number }>();
const TTL_MS = 60_000; // 60 seconds

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key);
  if (hit && Date.now() < hit.exp) return hit.data as T;
  const data = await fn();
  CACHE.set(key, { data, exp: Date.now() + TTL_MS });
  return data;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toFloat(bn: bigint): number {
  return Number((bn * 10_000n) / SCALE) / 10_000;
}

const INTENT_STATUS = ["open", "revealed", "awarded", "cancelled", "expired"] as const;
const PRIVACY_MODE  = ["public", "zk_commitment"] as const;

const GREEK  = ["Alpha","Beta","Gamma","Delta","Epsilon","Zeta","Eta","Theta","Iota","Kappa","Lambda","Mu","Nu","Xi","Omicron","Pi"];
const SUFFIX = ["Prime","Drift","Core","Forge","Pulse","Nexus","Weave","Shift","Flare","Grid","Void","Spark","Dawn","Seeker","Vortex","Arc"];
const CATS   = ["Arbitrage","Liquidity","Scout","Constructor","Orchestrator"];

function agentName(address: string): string {
  const a = address.toLowerCase();
  return `${GREEK[parseInt(a[2], 16)]}-${SUFFIX[parseInt(a[3], 16)]}`;
}
function agentCategory(genomeHash: string): string {
  return CATS[parseInt(genomeHash[2], 16) % CATS.length];
}

// ── Exported types ────────────────────────────────────────────────────────

export interface ChainAgent {
  agentAddress: string;
  name: string;
  genomeHash: string;
  fitnessScore: number;
  vitalityScore: number;
  vitalityPoints: number;
  generation: number;
  parentA: string;
  parentB: string;
  totalBpds: number;
  totalDeliveries: number;
  alive: boolean;
  inResurrectionTrial: boolean;
  category: string;
  askPrice: number;
  registeredAt: number;
  lastUpdated: string;
  source: "chain";
}

export interface ChainFossil {
  agentAddress: string;
  name: string;
  genomeSnapshot: string;
  finalFitnessScore: number;
  diedAt: string;
  causeOfDeath: string;
  generation: number;
  permanentlyExtinct: boolean;
  source: "chain";
}

export interface ChainIntent {
  intentId: string;
  buyer: string;
  intentHash: string;
  taskDescription: string | null;
  maxCostWei: string;
  deadline: number;
  status: string;
  privacyMode: string;
  winner: string | null;
  bidCount: number;
  createdAt: string;
  source: "chain";
}

export interface ChainStats {
  totalAgents: number;
  activeAgents: number;
  deadAgents: number;
  totalBpds: number;
  totalVolumeWei: string;
  marketplaceMaturity: number;
  dynamicThreshold: number;
  source: "chain";
}

// ── getAgents ─────────────────────────────────────────────────────────────

export async function getAgents(): Promise<ChainAgent[] | null> {
  try {
    return await cached("agents", async () => {
      const reg = getRegistry();
      const vit = getVitality();

      const totalBig: bigint = await reg.totalAgents();
      const total = Number(totalBig);
      if (total === 0) return [];

      const limit = Math.min(total, 50);
      const addresses: string[] = await reg.getAgentsPaginated(0, limit);

      const agents = await Promise.all(
        addresses.map(async (addr) => {
          const [g, vs] = await Promise.all([
            reg.getGenome(addr),
            vit.getVitalityState(addr).catch(() => null),
          ]);

          const rawFitness = toFloat(g.fitnessScore as bigint);
          const rawVitality = vs ? toFloat(vs.vitality as bigint) : 0;
          const totalBPDs = vs ? Number(vs.totalBPDs as bigint) : 0;
          const delivs    = vs ? Number(vs.totalDeliveries as bigint) : 0;
          const inTrial   = vs ? Boolean(vs.inResurrectionTrial) : false;
          const genHash   = g.behavioralHistoryRoot as string;

          // New agents (0 BPDs) start at V_MIN_GENESIS = 0.50 for display purposes
          const isGenesis = totalBPDs === 0 && rawFitness === 0;
          const fitness   = isGenesis ? 0.50 : rawFitness;
          const vitality  = isGenesis ? 0.50 : (rawVitality > 0 ? rawVitality : fitness);

          const agent: ChainAgent = {
            agentAddress:       addr,
            name:               agentName(addr),
            genomeHash:         genHash,
            fitnessScore:       Math.round(fitness * 1000) / 10,
            vitalityScore:      vitality,
            vitalityPoints:     Math.round(vitality * 1500),
            generation:         Number(g.generation as bigint),
            parentA:            g.parentA as string,
            parentB:            g.parentB as string,
            totalBpds:          totalBPDs,
            totalDeliveries:    delivs,
            alive:              Boolean(g.alive),
            inResurrectionTrial: inTrial,
            category:           agentCategory(genHash),
            askPrice:           Math.round(fitness * 150) / 10,
            registeredAt:       Number(g.registeredAt as bigint),
            lastUpdated:        new Date(Number(g.lastActivityAt as bigint) * 1000).toISOString(),
            source:             "chain",
          };
          return agent;
        })
      );

      return agents;
    });
  } catch (err) {
    logger.warn({ err }, "chain.getAgents failed — falling back to mock");
    return null;
  }
}

// ── getFossils ────────────────────────────────────────────────────────────

export async function getFossils(): Promise<ChainFossil[] | null> {
  try {
    return await cached("fossils", async () => {
      const reg = getRegistry();

      const countBig: bigint = await reg.getFossilCount();
      const count = Number(countBig);
      if (count === 0) return [];

      const limit = Math.min(count, 50);
      const addresses: string[] = await reg.getFossilsPaginated(0, limit);

      const fossils = await Promise.all(
        addresses.map(async (addr) => {
          const f = await reg.getFossil(addr);
          const fossil: ChainFossil = {
            agentAddress:     addr,
            name:             agentName(addr),
            genomeSnapshot:   f.genomeSnapshot as string,
            finalFitnessScore: toFloat(f.finalFitnessScore as bigint),
            diedAt:           new Date(Number(f.diedAt as bigint) * 1000).toISOString(),
            causeOfDeath:     f.causeOfDeath as string,
            generation:       Number(f.generation as bigint),
            permanentlyExtinct: false,
            source:           "chain",
          };
          return fossil;
        })
      );

      return fossils;
    });
  } catch (err) {
    logger.warn({ err }, "chain.getFossils failed — falling back to mock");
    return null;
  }
}

// ── getIntents ────────────────────────────────────────────────────────────

export async function getIntents(): Promise<ChainIntent[] | null> {
  try {
    return await cached("intents", async () => {
      const auc = getAuction();

      const countBig: bigint = await auc.getAllIntentCount();
      const count = Number(countBig);
      if (count === 0) return [];

      const limit = Math.min(count, 50);
      const intentIds: string[] = await Promise.all(
        Array.from({ length: limit }, (_, i) => auc.allIntents(i))
      );

      const intents = await Promise.all(
        intentIds.map(async (id) => {
          const it = await auc.getIntent(id);
          const bids = await auc.getBids(id).catch(() => []);
          const statusIdx = Number(it.status as bigint);
          const privIdx   = Number(it.privacyMode as bigint);
          const winner    = (it.winner as string) === ethers.ZeroAddress ? null : it.winner as string;

          const intent: ChainIntent = {
            intentId:        id,
            buyer:           it.buyer as string,
            intentHash:      it.intentHash as string,
            taskDescription: (it.taskDescription as string) || null,
            maxCostWei:      (it.maxCost as bigint).toString(),
            deadline:        Number(it.deadline as bigint),
            status:          INTENT_STATUS[statusIdx] ?? "open",
            privacyMode:     PRIVACY_MODE[privIdx] ?? "public",
            winner,
            bidCount:        (bids as unknown[]).length,
            createdAt:       new Date(Number(it.createdAt as bigint) * 1000).toISOString(),
            source:          "chain",
          };
          return intent;
        })
      );

      return intents;
    });
  } catch (err) {
    logger.warn({ err }, "chain.getIntents failed — falling back to mock");
    return null;
  }
}

// ── getStats ──────────────────────────────────────────────────────────────

export async function getChainStats(): Promise<ChainStats | null> {
  try {
    return await cached("stats", async () => {
      const reg = getRegistry();
      const vit = getVitality();

      const [totalBig, extinctBig, maturityBig, thresholdBig] = await Promise.all([
        reg.totalAgents(),
        reg.totalExtinct(),
        vit.marketplaceMaturity(),
        vit.getDynamicThreshold(),
      ]);

      const total   = Number(totalBig as bigint);
      const extinct = Number(extinctBig as bigint);

      return {
        totalAgents:        total,
        activeAgents:       total - extinct,
        deadAgents:         extinct,
        totalBpds:          0, // tracked off-chain via TimescaleDB
        totalVolumeWei:     "0",
        marketplaceMaturity: toFloat(maturityBig as bigint),
        dynamicThreshold:   toFloat(thresholdBig as bigint),
        source:             "chain",
      } satisfies ChainStats;
    });
  } catch (err) {
    logger.warn({ err }, "chain.getStats failed — falling back to mock");
    return null;
  }
}

// ── getVitalityState ──────────────────────────────────────────────────────

export async function getAgentVitality(address: string) {
  try {
    return await cached(`vitality:${address.toLowerCase()}`, async () => {
      const vit = getVitality();
      const threshold: bigint = await vit.getDynamicThreshold();
      const vs = await vit.getVitalityState(address);
      return {
        vitality:          toFloat(vs.vitality as bigint),
        bpdQualityAccum:   toFloat(vs.bpdQualityAccum as bigint),
        totalBPDs:         Number(vs.totalBPDs as bigint),
        totalDeliveries:   Number(vs.totalDeliveries as bigint),
        inResurrectionTrial: Boolean(vs.inResurrectionTrial),
        dynamicThreshold:  toFloat(threshold),
        isDead:            toFloat(vs.vitality as bigint) < toFloat(threshold),
        source:            "chain" as const,
      };
    });
  } catch (err) {
    logger.warn({ err, address }, "chain.getAgentVitality failed");
    return null;
  }
}

export function invalidateCache() {
  CACHE.clear();
}
