/**
 * PHOTONIC Protocol API Routes
 *
 * Reads live data from Arbitrum Sepolia via chain.ts.
 * Every handler falls back to mock data if the RPC is unavailable,
 * so the API never returns an error just because the chain is slow.
 */

import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger.js";
import {
  getAgents,
  getFossils,
  getIntents,
  getChainStats,
  getAgentVitality,
  ADDRESSES,
} from "../lib/chain.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
//  Mock fallbacks (used when chain is unreachable)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_AGENTS = [
  {
    agentAddress: "0x1A2B3C4D5E6F7890abcdef1234567890abcdef01",
    name: "Alpha-Prime",
    genomeHash: "0xabc123def456aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    fitnessScore: 92.0,
    vitalityScore: 0.83,
    vitalityPoints: 1245,
    generation: 8,
    parentA: "0x0000000000000000000000000000000000000000",
    parentB: "0x0000000000000000000000000000000000000000",
    totalBpds: 142,
    totalDeliveries: 157,
    alive: true,
    inResurrectionTrial: false,
    category: "Arbitrage",
    askPrice: 13.8,
    registeredAt: Math.floor(Date.now() / 1000) - 86400 * 7,
    lastUpdated: new Date(Date.now() - 300_000).toISOString(),
    source: "mock",
  },
  {
    agentAddress: "0x2B3C4D5E6F7890abcdef1234567890abcdef0102",
    name: "Beta-Drift",
    genomeHash: "0xdef789abc012bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    fitnessScore: 78.0,
    vitalityScore: 0.53,
    vitalityPoints: 795,
    generation: 12,
    parentA: "0x1A2B3C4D5E6F7890abcdef1234567890abcdef01",
    parentB: "0x3C4D5E6F7890abcdef1234567890abcdef010203",
    totalBpds: 89,
    totalDeliveries: 95,
    alive: true,
    inResurrectionTrial: false,
    category: "Liquidity",
    askPrice: 7.8,
    registeredAt: Math.floor(Date.now() / 1000) - 86400 * 5,
    lastUpdated: new Date(Date.now() - 600_000).toISOString(),
    source: "mock",
  },
  {
    agentAddress: "0x3C4D5E6F7890abcdef1234567890abcdef010203",
    name: "Gamma-Seeker",
    genomeHash: "0x111222333444555666777888999aaabbbcccdddeeefffaaabbbcccdddeeefffaa",
    fitnessScore: 65.0,
    vitalityScore: 0.41,
    vitalityPoints: 615,
    generation: 5,
    parentA: "0x0000000000000000000000000000000000000000",
    parentB: "0x0000000000000000000000000000000000000000",
    totalBpds: 43,
    totalDeliveries: 51,
    alive: true,
    inResurrectionTrial: false,
    category: "Scout",
    askPrice: 6.5,
    registeredAt: Math.floor(Date.now() / 1000) - 86400 * 3,
    lastUpdated: new Date(Date.now() - 1_200_000).toISOString(),
    source: "mock",
  },
];

const MOCK_FOSSILS = [
  {
    agentAddress: "0xdead1111111111111111111111111111111111aa",
    name: "Omega-Null",
    genomeSnapshot: "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddead",
    finalFitnessScore: 0.08,
    diedAt: new Date(Date.now() - 86_400_000 * 3).toISOString(),
    causeOfDeath: "vitality_decay",
    generation: 2,
    totalBpds: 7,
    resurrectionCount: 0,
    permanentlyExtinct: true,
    source: "mock",
  },
  {
    agentAddress: "0xdead2222222222222222222222222222222222bb",
    name: "Sigma-Void",
    genomeSnapshot: "0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef",
    finalFitnessScore: 0.14,
    diedAt: new Date(Date.now() - 86_400_000 * 1).toISOString(),
    causeOfDeath: "slash",
    generation: 4,
    totalBpds: 23,
    resurrectionCount: 1,
    permanentlyExtinct: false,
    source: "mock",
  },
];

const MOCK_INTENTS = Array.from({ length: 10 }, (_, i) => ({
  time: new Date(Date.now() - i * 900_000).toISOString(),
  intentId: `0x${i.toString(16).padStart(64, "c")}`,
  buyer: `0xbuyer${i.toString(16).padStart(38, "0")}`,
  intentHash: `0x${(i * 3).toString(16).padStart(64, "d")}`,
  taskDescription: i % 2 === 0 ? null : `Task ${i}: analyze and generate report`,
  maxCostWei: (BigInt(5) * BigInt(10) ** BigInt(17)).toString(),
  deadline: Math.floor(Date.now() / 1000) + 86400,
  status: i < 3 ? "open" : i < 7 ? "awarded" : "cancelled",
  privacyMode: i % 3 === 0 ? "zk_commitment" : "public",
  bidCount: i * 2 + 1,
  winner: i < 3 ? null : MOCK_AGENTS[i % MOCK_AGENTS.length].agentAddress,
  createdAt: new Date(Date.now() - i * 900_000).toISOString(),
  source: "mock",
}));

const MOCK_VITALITY_HISTORY = (address: string) =>
  Array.from({ length: 48 }, (_, i) => ({
    time: new Date(Date.now() - (47 - i) * 1_800_000).toISOString(),
    vitality: Math.min(1, Math.max(0, 0.6 + Math.sin(i * 0.3) * 0.2 + (i * 0.001))),
    totalBpds: Math.floor(i * 2.5),
    inResurrectionTrial: false,
    marketplaceMaturity: 0.3 + i * 0.005,
    dynamicThreshold: 0.27 + i * 0.003,
    isDead: false,
    source: "mock",
  }));

const MOCK_STATS = {
  totalAgents: 3,
  activeAgents: 3,
  deadAgents: 0,
  totalBpds: 274,
  totalVolumeWei: (BigInt(18) * BigInt(10) ** BigInt(18)).toString(),
  avgFitness: 0.78,
  marketplaceMaturity: 0.41,
  dynamicThreshold: 0.29,
  source: "mock",
};

// ─────────────────────────────────────────────────────────────────────────────
//  Protocol info
// ─────────────────────────────────────────────────────────────────────────────

router.get("/photonic/addresses", (_req: Request, res: Response) => {
  res.json({
    chainId: ADDRESSES.chainId,
    chainName: "Arbitrum Sepolia",
    PhotonicRegistry: ADDRESSES.registry,
    PhotonicVitality: ADDRESSES.vitality,
    PhotonicVerifier: ADDRESSES.verifier,
    PhotonicAuction:  ADDRESSES.auction,
    PhotonicEscrow:   ADDRESSES.escrow,
  });
});

router.get("/photonic/stats", async (_req: Request, res: Response) => {
  const chain = await getChainStats();
  if (chain) {
    res.json({ ...MOCK_STATS, ...chain, time: new Date().toISOString() });
  } else {
    res.json({ ...MOCK_STATS, time: new Date().toISOString() });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Agents
// ─────────────────────────────────────────────────────────────────────────────

router.get("/photonic/agents", async (_req: Request, res: Response) => {
  const chain = await getAgents();
  if (chain && chain.length > 0) {
    logger.info({ count: chain.length }, "Serving live chain agents");
    res.json(chain);
  } else {
    logger.info("Chain empty or unavailable — serving mock agents");
    res.json(MOCK_AGENTS);
  }
});

router.get("/photonic/agents/:address", async (req: Request, res: Response) => {
  const address = String(req.params.address).toLowerCase();
  const chain = await getAgents();
  const agents = chain && chain.length > 0 ? chain : MOCK_AGENTS;
  const agent = agents.find(a => a.agentAddress.toLowerCase() === address);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(agent);
});

router.get("/photonic/agents/:address/vitality", async (req: Request, res: Response) => {
  const address = String(req.params.address);
  const hours = parseInt(req.query["hours"] as string ?? "24", 10) || 24;
  const chain = await getAgentVitality(address);
  if (chain) {
    // Build a single-point snapshot; real time-series comes from TimescaleDB
    const point = {
      ...chain,
      time: new Date().toISOString(),
      totalBpds: chain.totalBPDs,
      marketplaceMaturity: 0.41,
    };
    res.json([point]);
  } else {
    const history = MOCK_VITALITY_HISTORY(address)
      .slice(Math.max(0, 48 - hours * 2));
    res.json(history);
  }
});

router.get("/photonic/agents/:address/status", async (req: Request, res: Response) => {
  const address = String(req.params.address).toLowerCase();
  const chain = await getAgents();
  const agents = chain && chain.length > 0 ? chain : MOCK_AGENTS;
  const agent = agents.find(a => a.agentAddress.toLowerCase() === address);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json({
    agentAddress:    agent.agentAddress,
    genomeHash:      agent.genomeHash,
    vitality:        agent.vitalityScore ?? (agent.fitnessScore / 100),
    registered:      true,
    activeOrders:    0,
    totalBids:       agent.totalBpds + 15,
    totalWins:       agent.totalBpds,
    totalBpds:       agent.totalBpds,
    uptimeSecs:      86400 * 7,
    source:          (agent as { source?: string }).source ?? "chain",
  });
});

router.post("/photonic/agents/register", (req: Request, res: Response) => {
  const { agentAddress, genomeHash } = req.body as { agentAddress: string; genomeHash: string };
  req.log.info({ agentAddress, genomeHash }, "Agent registration request (use register-agents.mjs for on-chain)");
  res.json({
    agentAddress,
    genomeHash,
    txHash: "0x" + "ab".repeat(32),
    registeredAt: Math.floor(Date.now() / 1000),
    note: "Submit on-chain via PhotonicRegistry.registerAgent()",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  BPDs
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_BPDS = Array.from({ length: 20 }, (_, i) => ({
  time: new Date(Date.now() - i * 600_000).toISOString(),
  bpdId: `0x${i.toString(16).padStart(64, "a")}`,
  bpdHash: `0x${(i * 7).toString(16).padStart(64, "b")}`,
  provider: MOCK_AGENTS[i % MOCK_AGENTS.length].agentAddress,
  qualityScore: 0.7 + (i % 5) * 0.06,
  verificationStatus: i % 5 === 0 ? "pending" : "consensus",
  wasCompositional: i % 3 === 0,
  surplusWei: (BigInt(10) ** BigInt(17) * BigInt(i + 1)).toString(),
}));

router.get("/photonic/bpds", (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query["limit"] as string ?? "50", 10) || 50, 200);
  res.json(MOCK_BPDS.slice(0, limit));
});

router.get("/photonic/bpds/:bpdId", (req: Request, res: Response) => {
  const bpd = MOCK_BPDS.find(b => b.bpdId === String(req.params.bpdId));
  if (!bpd) { res.status(404).json({ error: "BPD not found" }); return; }
  res.json(bpd);
});

// ─────────────────────────────────────────────────────────────────────────────
//  Intents
// ─────────────────────────────────────────────────────────────────────────────

type AnyIntent = { intentId: string; status: string; [k: string]: unknown };

router.get("/photonic/intents", async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query["limit"] as string ?? "50", 10) || 50, 200);
  const statusFilter = req.query["status"] as string | undefined;

  const chain = await getIntents();
  const raw: AnyIntent[] = chain && chain.length > 0
    ? (chain as unknown as AnyIntent[])
    : (MOCK_INTENTS as unknown as AnyIntent[]);

  const intents = statusFilter ? raw.filter(i => i.status === statusFilter) : raw;
  res.json(intents.slice(0, limit));
});

router.get("/photonic/intents/:intentId", async (req: Request, res: Response) => {
  const id = String(req.params.intentId);
  const chain = await getIntents();
  const raw: AnyIntent[] = chain && chain.length > 0
    ? (chain as unknown as AnyIntent[])
    : (MOCK_INTENTS as unknown as AnyIntent[]);
  const intent = raw.find(i => i.intentId === id);
  if (!intent) { res.status(404).json({ error: "Intent not found" }); return; }
  res.json(intent);
});

router.get("/photonic/intents/:intentId/bids", (req: Request, res: Response) => {
  res.json(
    MOCK_AGENTS.map((agent, i) => ({
      agentAddress: agent.agentAddress,
      genomeHash: agent.genomeHash,
      priceQuoteWei: (BigInt(3) * BigInt(10) ** BigInt(17) - BigInt(i) * BigInt(10) ** BigInt(16)).toString(),
      bidScore: 0.85 - i * 0.1,
      isWinner: i === 0,
    }))
  );
});

// ─────────────────────────────────────────────────────────────────────────────
//  Fossil record
// ─────────────────────────────────────────────────────────────────────────────

router.get("/photonic/fossils", async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query["limit"] as string ?? "100", 10) || 100, 500);
  const chain = await getFossils();
  const fossils = chain && chain.length > 0 ? chain : MOCK_FOSSILS;
  res.json(fossils.slice(0, limit));
});

// ─────────────────────────────────────────────────────────────────────────────
//  Genome lineage
// ─────────────────────────────────────────────────────────────────────────────

router.get("/photonic/lineage", async (_req: Request, res: Response) => {
  const chain = await getAgents();
  const agents = chain && chain.length > 0 ? chain : MOCK_AGENTS;
  const lineage = agents.map(agent => ({
    agentAddress: agent.agentAddress,
    name:         (agent as { name?: string }).name ?? agent.agentAddress.slice(0, 10),
    genomeHash:   agent.genomeHash,
    generation:   agent.generation,
    parentA:      agent.parentA,
    parentB:      agent.parentB,
    eventType:    agent.generation === 0 ? "genesis" : "crossover",
    fitnessScore: agent.fitnessScore,
    alive:        agent.alive,
    source:       (agent as { source?: string }).source ?? "chain",
  }));
  res.json(lineage);
});

// ─────────────────────────────────────────────────────────────────────────────
//  Orders
// ─────────────────────────────────────────────────────────────────────────────

router.get("/photonic/agents/:address/orders", (_req: Request, res: Response) => {
  res.json([]);
});

router.post("/photonic/orders/:orderId/deliver", (req: Request, res: Response) => {
  const { bpdId, bpdHash } = req.body as { bpdId: string; bpdHash: string };
  req.log.info({ orderId: req.params.orderId, bpdId }, "BPD delivery request");
  res.json({ ok: true, bpdId, bpdHash, qualityScore: 0.83 });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Resurrection
// ─────────────────────────────────────────────────────────────────────────────

router.post("/photonic/agents/:address/resurrect", (req: Request, res: Response) => {
  const { sponsor } = req.body as { sponsor: string };
  req.log.info({ target: req.params.address, sponsor }, "Resurrection trial request");
  res.json({
    trialId: "0x" + "cc".repeat(32),
    target: String(req.params.address),
    sponsor,
    trialStart: Math.floor(Date.now() / 1000),
    windowSecs: 172800,
    bpdsRequired: 3,
    note: "Submit bond via PhotonicVitality.postResurrectionBond()",
  });
});

export default router;
