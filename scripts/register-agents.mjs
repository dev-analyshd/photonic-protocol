#!/usr/bin/env node
/**
 * register-agents.mjs
 *
 * Registers 3 test agents on the live PhotonicRegistry contract
 * on Arbitrum Sepolia (chainId 421614).
 *
 * Run: node photonic/scripts/register-agents.mjs
 * Requires: DEPLOYER_PRIVATE_KEY env var
 */

import { ethers, keccak256, toUtf8Bytes, ZeroAddress, concat } from "ethers";

const RPC   = "https://sepolia-rollup.arbitrum.io/rpc";
const REGISTRY_ADDR = "0xb1075B5b608A2F22C35cFAF84AD6cC7bda7480FC";

const REGISTRY_ABI = [
  "function registerAgent(address agent, bytes32 capabilityRoot, bytes32 toolRoot, bytes32 promptArchHash, address parentA, address parentB) external",
  "function registered(address) external view returns (bool)",
  "function totalAgents() external view returns (uint256)",
  "function getGenome(address agent) external view returns (tuple(bytes32 capabilityRoot, bytes32 toolRoot, bytes32 promptArchHash, bytes32 behavioralHistoryRoot, uint256 fitnessScore, uint32 generation, address parentA, address parentB, uint64 registeredAt, uint64 lastActivityAt, bool alive))",
];

// ── Merkle helpers ────────────────────────────────────────────────────────

function hashLeaf(s) {
  return keccak256(toUtf8Bytes(s));
}

function merkleRoot(leaves) {
  if (leaves.length === 0) return "0x" + "00".repeat(32);
  let layer = leaves.map(hashLeaf);
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const a = layer[i];
      const b = layer[i + 1] ?? a;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      next.push(keccak256(concat([lo, hi])));
    }
    layer = next;
  }
  return layer[0];
}

// ── Agent definitions ─────────────────────────────────────────────────────

// Agent addresses are derived deterministically from well-known strings
// so they're reproducible across runs.
function deterministicAddress(seed) {
  const hash = keccak256(toUtf8Bytes(seed));
  // Take the last 20 bytes (40 hex chars) and format as an EIP-55 address
  return ethers.getAddress("0x" + hash.slice(-40));
}

const AGENTS = [
  {
    seed:  "PHOTONIC_AGENT_ANALYTICAL_REASONER_V2",
    label: "Alpha-Prime (Analytical Reasoner)",
    capabilities: ["web-scraping", "data-analysis", "report-writing", "trend-detection"],
    tools:        ["browser-use", "pandas", "matplotlib", "duckdb"],
    promptArch:   "analytical-reasoner-v2 — chain-of-thought with fact-checking loop",
    parentA: ZeroAddress,
    parentB: ZeroAddress,
  },
  {
    seed:  "PHOTONIC_AGENT_CODE_ENGINEER_V3",
    label: "Beta-Drift (Code Engineer)",
    capabilities: ["code-generation", "unit-testing", "optimization", "refactoring"],
    tools:        ["python-lsp", "typescript-compiler", "jest", "semgrep"],
    promptArch:   "software-engineer-v3 — iterative red-green-refactor loop",
    parentA: ZeroAddress,
    parentB: ZeroAddress,
  },
  {
    seed:  "PHOTONIC_AGENT_LANGUAGE_SPECIALIST_V1",
    label: "Gamma-Seeker (Language Specialist)",
    capabilities: ["nlp", "summarization", "translation", "sentiment-analysis"],
    tools:        ["transformers", "langchain", "openai-api", "tiktoken"],
    promptArch:   "language-specialist-v1 — retrieval-augmented generation",
    parentA: ZeroAddress,
    parentB: ZeroAddress,
  },
];

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(RPC);
  const deployer = new ethers.Wallet(key, provider);
  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, deployer);

  console.log(`\n=== PHOTONIC Agent Registration ===`);
  console.log(`Network  : Arbitrum Sepolia (chainId 421614)`);
  console.log(`Registry : ${REGISTRY_ADDR}`);
  console.log(`Deployer : ${deployer.address}`);

  const [network, totalBefore, balance] = await Promise.all([
    provider.getNetwork(),
    registry.totalAgents(),
    provider.getBalance(deployer.address),
  ]);

  console.log(`Chain ID : ${network.chainId}`);
  console.log(`Balance  : ${ethers.formatEther(balance)} ETH`);
  console.log(`Agents   : ${totalBefore} registered so far\n`);

  if (balance < ethers.parseEther("0.001")) {
    throw new Error("Deployer balance too low — need at least 0.001 ETH for gas");
  }

  for (const agentDef of AGENTS) {
    const agentAddr = deterministicAddress(agentDef.seed);
    console.log(`\n── ${agentDef.label}`);
    console.log(`   Address : ${agentAddr}`);

    const alreadyRegistered = await registry.registered(agentAddr);
    if (alreadyRegistered) {
      console.log(`   Status  : already registered ✓`);
      const g = await registry.getGenome(agentAddr);
      console.log(`   Genome  : ${g.behavioralHistoryRoot}`);
      console.log(`   Gen     : ${g.generation}`);
      continue;
    }

    const capabilityRoot = merkleRoot(agentDef.capabilities);
    const toolRoot       = merkleRoot(agentDef.tools);
    const promptArchHash = keccak256(toUtf8Bytes(agentDef.promptArch));

    console.log(`   capRoot : ${capabilityRoot}`);
    console.log(`   toolRoot: ${toolRoot}`);
    console.log(`   promptH : ${promptArchHash}`);
    console.log(`   Sending registerAgent tx...`);

    const tx = await registry.registerAgent(
      agentAddr,
      capabilityRoot,
      toolRoot,
      promptArchHash,
      agentDef.parentA,
      agentDef.parentB,
    );

    console.log(`   TxHash  : ${tx.hash}`);
    const receipt = await tx.wait(1);
    console.log(`   Block   : ${receipt.blockNumber}  Gas: ${receipt.gasUsed}`);
    console.log(`   Status  : registered ✓`);
  }

  const totalAfter = await registry.totalAgents();
  console.log(`\n=== Done. Total registered agents: ${totalAfter} ===\n`);

  // Print Arbiscan links
  console.log("View on Arbiscan:");
  console.log(`  https://sepolia.arbiscan.io/address/${REGISTRY_ADDR}`);
  for (const def of AGENTS) {
    const addr = deterministicAddress(def.seed);
    console.log(`  https://sepolia.arbiscan.io/address/${addr}`);
  }
}

main().catch((err) => {
  console.error("\n✗ Registration failed:", err.message);
  process.exit(1);
});
