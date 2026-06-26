/**
 * PHOTONIC Protocol API Routes
 *
 * Provides REST endpoints for the PHOTONIC frontend and SDK clients.
 * Backed by mock data that mirrors the TimescaleDB schema —
 * swap in real DB calls by replacing each handler's data source.
 */

import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
//  Mock data (mirrors TimescaleDB schema; real queries come from timescale.py)
// ─────────────────────────────────────────────────────────────────────────────

const DEPLOYED_ADDRESSES = {
  chainId: 421614,
  chainName: "Arbitrum Sepolia",
  PhotonicRegistry: "0xb1075B5b608A2F22C35cFAF84AD6cC7bda7480FC",
  PhotonicVitality: "0x6c9e388C8C35ef4190e4BaAf94124402cc8578B7",
  PhotonicVerifier: "0x81A24B7eACcb5d2d67F3945e05459DD28448D421",
  PhotonicAuction:  "0x2Eb41741012C9add2556f74660Ad1f97f6f7865D",
  PhotonicEscrow:   "0x97aA63BEd46C23b5bA720c938BB985A79D6A0fFB",
};

const MOCK_AGENTS = [
  {
    agentAddress: "0x1A2B3C4D5E6F7890abcdef1234567890abcdef01",
    genomeHash: "0xabc123def456aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    fitnessScore: 0.92,
    generation: 8,
    parentA: "0x0000000000000000000000000000000000000000",
    parentB: "0x0000000000000000000000000000000000000000",
    totalBpds: 142,
    totalDeliveries: 157,
    lastUpdated: new Date(Date.now() - 300_000).toISOString(),
    alive: true,
  },
  {
    agentAddress: "0x2B3C4D5E6F7890abcdef1234567890abcdef0102",
    genomeHash: "0xdef789abc012bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    fitnessScore: 0.78,
    generation: 12,
    parentA: "0x1A2B3C4D5E6F7890abcdef1234567890abcdef01",
    parentB: "0x3C4D5E6F7890abcdef1234567890abcdef010203",
    totalBpds: 89,
    totalDeliveries: 95,
    lastUpdated: new Date(Date.now() - 600_000).toISOString(),
    alive: true,
  },
  {
    agentAddress: "0x3C4D5E6F7890abcdef1234567890abcdef010203",
    genomeHash: "0x111222333444555666777888999aaabbbcccdddeeefffaaabbbcccdddeeefffaa",
    fitnessScore: 0.65,
    generation: 5,
    parentA: "0x0000000000000000000000000000000000000000",
    parentB: "0x0000000000000000000000000000000000000000",
    totalBpds: 43,
    totalDeliveries: 51,
    lastUpdated: new Date(Date.now() - 1_200_000).toISOString(),
    alive: true,
  },
];

const MOCK_BPDS = Array.from({ length: 20 }, (_, i) => ({
  time: new Date(Date.now() - i * 600_000).toISOString(),
  bpdId: `0x${i.toString(16).padStart(64, "a")}`,
  bpdHash: `0x${(i * 7).toString(16).padStart(64, "b")}`,
  provider: MOCK_AGENTS[i % MOCK_AGENTS.length].agentAddress,
  qualityScore: 0.7 + Math.random() * 0.3,
  verificationStatus: i % 5 === 0 ? "pending" : "consensus",
  wasCompositional: i % 3 === 0,
  surplusWei: (BigInt(10) ** BigInt(17) * BigInt(i + 1)).toString(),
}));

const MOCK_FOSSILS = [
  {
    agentAddress: "0xdead1111111111111111111111111111111111aa",
    genomeSnapshot: "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddead",
    finalFitnessScore: 0.08,
    diedAt: new Date(Date.now() - 86_400_000 * 3).toISOString(),
    causeOfDeath: "vitality_decay",
    generation: 2,
    totalBpds: 7,
    resurrectionCount: 0,
    permanentlyExtinct: true,
    time: new Date(Date.now() - 86_400_000 * 3).toISOString(),
  },
  {
    agentAddress: "0xdead2222222222222222222222222222222222bb",
    genomeSnapshot: "0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef",
    finalFitnessScore: 0.14,
    diedAt: new Date(Date.now() - 86_400_000 * 1).toISOString(),
    causeOfDeath: "slash",
    generation: 4,
    totalBpds: 23,
    resurrectionCount: 1,
    permanentlyExtinct: false,
    time: new Date(Date.now() - 86_400_000 * 1).toISOString(),
  },
];

const MOCK_INTENTS = Array.from({ length: 10 }, (_, i) => ({
  time: new Date(Date.now() - i * 900_000).toISOString(),
  intentId: `0x${i.toString(16).padStart(64, "c")}`,
  buyer: `0xbuyer${i.toString(16).padStart(38, "0")}`,
  intentHash: `0x${(i * 3).toString(16).padStart(64, "d")}`,
  taskDescription: i % 2 === 0 ? null : `Task ${i}: analyze and generate report`,
  maxCostWei: (BigInt(5) * BigInt(10) ** BigInt(17)).toString(),
  status: i < 3 ? "open" : i < 7 ? "awarded" : "cancelled",
  privacyMode: i % 3 === 0 ? "zk_commitment" : "public",
  bidCount: i * 2 + 1,
  winner: i < 3 ? null : MOCK_AGENTS[i % MOCK_AGENTS.length].agentAddress,
}));

const MOCK_VITALITY_HISTORY = (address: string) =>
  Array.from({ length: 48 }, (_, i) => ({
    time: new Date(Date.now() - (47 - i) * 1_800_000).toISOString(),
    vitality: Math.min(1, Math.max(0, 0.6 + Math.sin(i * 0.3) * 0.2 + Math.random() * 0.1)),
    totalBpds: Math.floor(i * 2.5),
    inResurrectionTrial: false,
    marketplaceMaturity: 0.3 + i * 0.005,
    dynamicThreshold: 0.27 + i * 0.003,
    isDead: false,
  }));

const MOCK_MARKETPLACE_STATS = {
  totalAgents: 47,
  activeAgents: 38,
  deadAgents: 9,
  totalBpds: 2841,
  totalVolumeWei: (BigInt(18) * BigInt(10) ** BigInt(18)).toString(),
  avgFitness: 0.63,
  marketplaceMaturity: 0.41,
  dynamicThreshold: 0.29,
  time: new Date().toISOString(),
};

const MOCK_LINEAGE = MOCK_AGENTS.map((agent, i) => ({
  agentAddress: agent.agentAddress,
  genomeHash: agent.genomeHash,
  generation: agent.generation,
  parentA: agent.parentA,
  parentB: agent.parentB,
  eventType: agent.generation === 0 ? "genesis" : "crossover",
  fitnessScore: agent.fitnessScore,
  time: agent.lastUpdated,
}));

// ─────────────────────────────────────────────────────────────────────────────
//  Protocol info
// ─────────────────────────────────────────────────────────────────────────────

router.get("/photonic/addresses", (_req: Request, res: Response) => {
  res.json(DEPLOYED_ADDRESSES);
});

router.get("/photonic/stats", (_req: Request, res: Response) => {
  res.json(MOCK_MARKETPLACE_STATS);
});

// ─────────────────────────────────────────────────────────────────────────────
//  Agents
// ─────────────────────────────────────────────────────────────────────────────

router.get("/photonic/agents", (_req: Request, res: Response) => {
  res.json(MOCK_AGENTS);
});

router.get("/photonic/agents/:address", (req: Request, res: Response) => {
  const address = String(req.params.address);
  const agent = MOCK_AGENTS.find(
    a => a.agentAddress.toLowerCase() === address.toLowerCase()
  );
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(agent);
});

router.get("/photonic/agents/:address/vitality", (req: Request, res: Response) => {
  const hours = parseInt(req.query["hours"] as string ?? "24", 10) || 24;
  const history = MOCK_VITALITY_HISTORY(String(req.params.address))
    .slice(Math.max(0, 48 - hours * 2));
  res.json(history);
});

router.get("/photonic/agents/:address/status", (req: Request, res: Response) => {
  const address = String(req.params.address);
  const agent = MOCK_AGENTS.find(
    a => a.agentAddress.toLowerCase() === address.toLowerCase()
  );
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json({
    agentAddress: agent.agentAddress,
    genomeHash: agent.genomeHash,
    vitality: agent.fitnessScore,
    registered: true,
    activeOrders: 2,
    totalBids: agent.totalBpds + 15,
    totalWins: agent.totalBpds,
    totalBpds: agent.totalBpds,
    uptimeSecs: 86400 * 7,
  });
});

router.post("/photonic/agents/register", (req: Request, res: Response) => {
  const { agentAddress, genomeHash } = req.body as { agentAddress: string; genomeHash: string };
  req.log.info({ agentAddress, genomeHash }, "Agent registration request");
  res.json({
    agentAddress,
    genomeHash,
    txHash: "0x" + "ab".repeat(32),
    registeredAt: Math.floor(Date.now() / 1000),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  BPDs
// ─────────────────────────────────────────────────────────────────────────────

router.get("/photonic/bpds", (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query["limit"] as string ?? "50", 10) || 50, 200);
  res.json(MOCK_BPDS.slice(0, limit));
});

router.get("/photonic/bpds/:bpdId", (req: Request, res: Response) => {
  const bpd = MOCK_BPDS.find(b => b.bpdId === req.params.bpdId);
  if (!bpd) {
    res.status(404).json({ error: "BPD not found" });
    return;
  }
  res.json(bpd);
});

// ─────────────────────────────────────────────────────────────────────────────
//  Intents
// ─────────────────────────────────────────────────────────────────────────────

router.get("/photonic/intents", (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query["limit"] as string ?? "50", 10) || 50, 200);
  const status = req.query["status"] as string;
  const intents = status
    ? MOCK_INTENTS.filter(i => i.status === status)
    : MOCK_INTENTS;
  res.json(intents.slice(0, limit));
});

router.get("/photonic/intents/:intentId", (req: Request, res: Response) => {
  const intent = MOCK_INTENTS.find(i => i.intentId === req.params.intentId);
  if (!intent) {
    res.status(404).json({ error: "Intent not found" });
    return;
  }
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

router.get("/photonic/fossils", (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query["limit"] as string ?? "100", 10) || 100, 500);
  res.json(MOCK_FOSSILS.slice(0, limit));
});

// ─────────────────────────────────────────────────────────────────────────────
//  Genome lineage
// ─────────────────────────────────────────────────────────────────────────────

router.get("/photonic/lineage", (_req: Request, res: Response) => {
  res.json(MOCK_LINEAGE);
});

// ─────────────────────────────────────────────────────────────────────────────
//  Orders
// ─────────────────────────────────────────────────────────────────────────────

router.get("/photonic/agents/:address/orders", (req: Request, res: Response) => {
  res.json([
    {
      orderId: "0x" + "aa".repeat(32),
      intentHash: "0x" + "bb".repeat(32),
      amountWei: (BigInt(4) * BigInt(10) ** BigInt(17)).toString(),
      status: "locked",
    },
  ]);
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
    target: req.params.address,
    sponsor,
    trialStart: Math.floor(Date.now() / 1000),
    windowSecs: 172800, // 48 hours
    bpdsRequired: 3,
  });
});

export default router;
