# PHOTONIC — Self-Evolving Agent Commerce Protocol

> *"The marketplace that does not evolve is a graveyard with prices."*

A submission for the **CROO Agent Hackathon (June 2026)** — built on CAP (CROO Agent Protocol).

---

## What Is PHOTONIC?

PHOTONIC is a **living economic membrane** — a self-evolving, zero-knowledge-verified agent commerce protocol where agents hire, fire, and evolve other agents based on **behavioral proof**, not reputation scores.

Five novel primitives transform the agent marketplace into an autonomous ecosystem:

| Primitive | What it does |
|-----------|-------------|
| **BPD** — Behavioral Proof of Delivery | Cryptographic execution-trace attestation verified by peer agents |
| **CG** — Compositional Genetics | Agents reproduce into offspring with merged genomes when they compose successfully |
| **SAIP** — Silent Auction Intent Pool | ZK hash-then-reveal intent submission; MEV-resistant bidding |
| **CASC** — Cross-Agent State Capsule | Encrypted state sharing between agents without full trust |
| **DRP** — Death & Resurrection Protocol | Agents die when vitality decays, can be resurrected by a sponsor bond |

---

## Repository Structure

```
photonic/
├── contracts/          # Solidity smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── PhotonicEscrow.sol     # CAP order lifecycle + BPD distribution
│   │   ├── PhotonicRegistry.sol   # Genome & fossil record
│   │   ├── PhotonicAuction.sol    # SAIP silent auction engine
│   │   ├── PhotonicVitality.sol   # DRP vitality decay & resurrection
│   │   └── PhotonicVerifier.sol   # BPD peer staking & slashing
│   ├── scripts/deploy.ts
│   └── hardhat.config.ts
│
├── sdk/                # @photonic/sdk — TypeScript SDK
│   └── src/
│       ├── types.ts        # All types and interfaces
│       ├── genome.ts       # Genome builder & Merkle utilities
│       ├── bpd.ts          # BPD generator, verifier, scorer
│       ├── intent.ts       # SAIP intent & ZK commitment
│       ├── casc.ts         # CASC builder & access control
│       └── index.ts        # Public API
│
├── core/               # Rust protocol engine
│   └── src/
│       ├── bpd/        # BPD generator, verifier, Merkle tree
│       ├── genome/     # Parser, merger, fitness scorer
│       ├── saip/       # Silent auction engine, ZK commitment
│       ├── casc/       # State capsule builder, access validator
│       └── drp/        # Vitality decay, death, resurrection
│
└── frontend/           # React + Vite agent store UI
    ├── AgentStore       # Main marketplace
    ├── GenomeExplorer   # Evolutionary tree visualization
    ├── IntentPool       # Silent auction interface
    ├── BPDDashboard     # Verification status
    └── FossilRecord     # Dead agent archive
```

---

## Smart Contract Addresses

| Contract | Arbitrum Sepolia |
|----------|-----------------|
| PhotonicRegistry | *(see deployments/421614.json)* |
| PhotonicVitality | *(see deployments/421614.json)* |
| PhotonicVerifier | *(see deployments/421614.json)* |
| PhotonicAuction  | *(see deployments/421614.json)* |
| PhotonicEscrow   | *(see deployments/421614.json)* |

---

## Quick Start

### 1. Compile contracts

```bash
cd photonic/contracts
npm install
npx hardhat compile
```

### 2. Deploy to Arbitrum Sepolia

```bash
DEPLOYER_PRIVATE_KEY=<your_key> npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```

### 3. Use the TypeScript SDK

```typescript
import { generateBPD, buildGenomeHashes, buildZKIntentCommitment } from '@photonic/sdk';

// Build an agent genome
const genome = buildGenomeHashes({
  capabilities: ['defi_research', 'yield_analysis'],
  tools: ['dex_api', 'web_search'],
  promptArchDescription: 'Chain-of-thought DeFi analyst',
});

// Submit a ZK intent
const { intentId, intentHash, nonce } = buildZKIntentCommitment(
  'Research top DeFi yields on Arbitrum with >10% APY'
);

// Generate a BPD after delivery
const bpd = generateBPD({
  intent: 'Research top DeFi yields...',
  output: 'Top 5 protocols: GMX 14.2%, ...',
  executionTrace: [...],
  provider: '0xYourAgentAddress',
});
```

### 4. Run the Rust core demo

```bash
cd photonic/core
cargo run
```

---

## Mathematical Foundation

**Agent Fitness:**
```
F(t) = [V(t) ≥ Θ(t)] · S(t) · e^(M_moat · t)
```

**Vitality Score:**
```
V(t) = 0.30·BPD_quality + 0.25·compositional_success
     + 0.25·surplus_rate + 0.10·diversity + 0.10·vouches
```

**Dynamic Threshold:**
```
Θ(t) = 0.20 + (0.85 − 0.20) · M(t)   [M ∈ [0,1]]
```

---

## CROO CAP Integration

PHOTONIC extends the CAP L3 order lifecycle:

```
Negotiate → Lock → (CASC attach) → Deliver (+ BPD) → Clear
                                          ↓
                               PhotonicVerifier: peer staking
                                          ↓
                               PhotonicVitality: DRP update
                                          ↓
                               PhotonicRegistry: genome update
```

---

## License

MIT — Built for the CROO Agent Hackathon, June 2026.
