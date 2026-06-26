// ─────────────────────────────────────────────────────────────────────────────
//  PHOTONIC SDK — Core Types
// ─────────────────────────────────────────────────────────────────────────────

export type Hex = `0x${string}`;
export type Address = Hex;
export type Bytes32 = Hex;

// ── Genome ────────────────────────────────────────────────────────────────────

export interface AgentGenome {
  capabilityRoot: Bytes32;
  toolRoot: Bytes32;
  promptArchHash: Bytes32;
  behavioralHistoryRoot: Bytes32;
  fitnessScore: bigint;
  generation: number;
  parentA: Address;
  parentB: Address;
  registeredAt: number;
  lastActivityAt: number;
  alive: boolean;
}

export interface GenomeInput {
  capabilities: string[];
  tools: string[];
  promptArchDescription: string;
  parentA?: Address;
  parentB?: Address;
}

// ── BPD ──────────────────────────────────────────────────────────────────────

export interface ExecutionStep {
  stepId: string;
  type: "tool_call" | "llm_inference" | "external_api" | "computation";
  input: unknown;
  output: unknown;
  timestamp: number;
}

export interface BehavioralProofOfDelivery {
  bpdId: Bytes32;
  bpdHash: Bytes32;
  intent: string;
  output: string;
  executionTrace: ExecutionStep[];
  merkleRoot: Bytes32;
  timestamp: number;
  nonce: Bytes32;
  provider: Address;
}

// ── Intent ────────────────────────────────────────────────────────────────────

export enum PrivacyMode {
  PUBLIC = 0,
  ZK_COMMITMENT = 1,
}

export enum CompositionMode {
  AUTO = 0,
  SPECIFIC = 1,
}

export enum IntentStatus {
  Open = 0,
  Awarded = 1,
  Cancelled = 2,
  Expired = 3,
}

export interface IntentInput {
  taskDescription: string;
  maxCost: bigint;
  qualityFloor: bigint;
  privacyMode: PrivacyMode;
  compositionMode: CompositionMode;
  nonce?: Bytes32; // Required for ZK_COMMITMENT
}

export interface Intent {
  intentId: Bytes32;
  buyer: Address;
  intentHash: Bytes32;
  taskDescription: string;
  maxCost: bigint;
  deadline: number;
  qualityFloor: bigint;
  privacyMode: PrivacyMode;
  compositionMode: CompositionMode;
  status: IntentStatus;
  winner: Address;
  createdAt: number;
  awardedAt: number;
}

// ── Bid ───────────────────────────────────────────────────────────────────────

export interface BidInput {
  intentId: Bytes32;
  genomeHash: Bytes32;
  priceQuote: bigint;
  bpdSample: Bytes32;
}

export interface Bid {
  agent: Address;
  genomeHash: Bytes32;
  priceQuote: bigint;
  bpdSample: Bytes32;
  scoreCached: bigint;
  submittedAt: number;
  active: boolean;
}

// ── CASC ──────────────────────────────────────────────────────────────────────

export interface CASCInput {
  stateFragments: unknown[];
  sessionKey: string;
  maxAgeSeconds: number;
  previousCASCHash?: Bytes32;
  accessPolicy: Address[];
}

export interface CASC {
  encryptedFragments: Bytes32[];
  sessionKeyCommitment: Bytes32;
  maxAge: number;
  timestamp: number;
  continuityProof: Bytes32;
  accessPolicy: Address[];
}

// ── Vitality ──────────────────────────────────────────────────────────────────

export interface VitalityState {
  vitality: bigint;
  bpdQualityAccum: bigint;
  compositionalSuccesses: bigint;
  surplusAccum: bigint;
  diversityScore: bigint;
  resurrectionVouches: bigint;
  totalBPDs: bigint;
  totalDeliveries: bigint;
  lastDecayAt: number;
  inResurrectionTrial: boolean;
  resurrectionTrialStart: number;
  resurrectionBPDCount: bigint;
  resurrectionSponsor: Address;
}

// ── Order ─────────────────────────────────────────────────────────────────────

export enum OrderStatus {
  Negotiating = 0,
  Locked = 1,
  Delivered = 2,
  Cleared = 3,
  Disputed = 4,
  Cancelled = 5,
}

export interface Order {
  orderId: Bytes32;
  buyer: Address;
  provider: Address;
  parentAgent: Address;
  totalAmount: bigint;
  providerAmount: bigint;
  verifierPool: bigint;
  parentRoyalty: bigint;
  protocolFee: bigint;
  intentHash: Bytes32;
  bpdId: Bytes32;
  bpdHash: Bytes32;
  status: OrderStatus;
  bpdVerificationRequired: boolean;
  createdAt: number;
  lockedAt: number;
  deliveredAt: number;
  clearedAt: number;
}

// ── Fossil ────────────────────────────────────────────────────────────────────

export interface FossilRecord {
  agent: Address;
  genomeSnapshot: Bytes32;
  finalFitnessScore: bigint;
  diedAt: number;
  causeOfDeath: string;
  generation: number;
}

// ── Contract Addresses ────────────────────────────────────────────────────────

export interface PhotonicAddresses {
  PhotonicRegistry: Address;
  PhotonicVitality: Address;
  PhotonicVerifier: Address;
  PhotonicAuction: Address;
  PhotonicEscrow: Address;
}
