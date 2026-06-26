# PHOTONIC Protocol

A self-evolving agent commerce protocol for the CROO Agent Hackathon (June 2026). PHOTONIC implements 5 primitives — BPD, CG, SAIP, CASC, DRP — enabling AI agents to prove delivery, evolve genomes, bid in sealed auctions, share encrypted state, and resurrect from death.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite (`artifacts/photonic-frontend`)
- SDK: `@photonic/sdk` TypeScript SDK (`photonic/sdk/`)
- On-chain: 5 Solidity contracts on Arbitrum Sepolia (chainId 421614)
- ML/AI: FastAPI + scikit-learn Python service (`photonic/python/`)
- Storage: TimescaleDB hypertables (`photonic/timescale/`)
- Rust core: Cargo workspace (`photonic/core/`) with BPD/CG/SAIP/CASC/DRP modules

## Where things live

- `artifacts/photonic-frontend/` — React + Vite UI (dashboard, lineage explorer, fossil record)
- `artifacts/api-server/src/routes/photonic.ts` — all PHOTONIC REST endpoints
- `photonic/sdk/src/` — TypeScript SDK (bpd.ts, genome.ts, genome-builder.ts, intent.ts, casc.ts, intent-client.ts, provider-client.ts, types.ts)
- `photonic/core/src/` — Rust implementations of all 5 primitives
- `photonic/python/app.py` — FastAPI ML service (fitness prediction, compatibility scoring, BPD classification)
- `photonic/timescale/schema.sql` — TimescaleDB hypertable schema
- `photonic/contracts/` — Solidity contracts (Registry, Vitality, Verifier, Auction, Escrow)
- `photonic/scripts/` — deployment + GitHub push scripts

## Deployed Contracts (Arbitrum Sepolia, chainId 421614)

| Contract  | Address |
|-----------|---------|
| Registry  | 0xb1075B5b608A2F22C35cFAF84AD6cC7bda7480FC |
| Vitality  | 0x6c9e388C8C35ef4190e4BaAf94124402cc8578B7 |
| Verifier  | 0x81A24B7eACcb5d2d67F3945e05459DD28448D421 |
| Auction   | 0x2Eb41741012C9add2556f74660Ad1f97f6f7865D |
| Escrow    | 0x97aA63BEd46C23b5bA720c938BB985A79D6A0fFB |

## Architecture decisions

- **Contract-first, then SDK**: All on-chain logic is authoritative; the TypeScript SDK wraps ethers.js calls with typed helpers matching the ABI.
- **Mock-first API routes**: `/api/photonic/*` endpoints return realistic mock data so the frontend can be built/demoed before a live DB is connected.
- **TimescaleDB for time-series**: Agent vitality, BPD history, and genome evolution use hypertables with continuous aggregates for efficient range queries.
- **Rust for protocol core**: BPD, CG, SAIP, CASC, and DRP are all implemented in Rust (`photonic/core`) for performance and correctness; the Python ML service wraps sklearn models via FastAPI.
- **ZK commitments via client-side hash**: The SAIP sealed-bid auction uses keccak256(bid || nonce) commitments generated in the browser SDK, matching the on-chain `Auction` contract verification.

## PHOTONIC Primitives

| ID   | Name | Purpose |
|------|------|---------|
| BPD  | Behavioral Proof of Delivery | Cryptographic execution trace proving agent task completion |
| CG   | Capability Genome | Merkle-hashed capability/tool/prompt-arch descriptor that evolves across generations |
| SAIP | Sealed-bid Auction for Intent Procurement | ZK commitment-reveal auction where agents bid on user intents |
| CASC | Cross-Agent State Capsule | Encrypted session-key state transfer between agents |
| DRP  | Death & Resurrection Protocol | Vitality scoring with on-chain resurrection mechanics |

## Product

- **Dashboard**: Live view of registered agents, vitality bars, BPD counts, genome generation
- **Lineage Explorer**: Visual genome ancestry tree showing parent→child evolution
- **Fossil Record**: Archive of dead/resurrected agents with resurrection proof
- **Intent Pool**: Active/closed SAIP auctions with commitment/reveal timers
- **Vitality Monitor**: Per-agent vitality time-series with death threshold overlays

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `viaIR: true` is required for the Solidity contracts (bytecode size limits).
- SDK re-exports: `buildMerkleRoot`/`mergeGenomes` live in `genome.ts`; `buildCapabilityMerkleRoot`/`mergeBuiltGenomes` are the GenomeBuilder helpers in `genome-builder.ts` — do not confuse them.
- `ZKIntentPreimage` lives in `intent.ts` only; it was removed from `types.ts` to avoid dual-export collision.
- `ExecutionStep` lives in `types.ts` only; import from there, not from `bpd.ts`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Contract addresses and chainId are in `photonic/sdk/src/index.ts` → `PHOTONIC_ADDRESSES`
