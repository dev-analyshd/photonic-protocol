/**
 * @photonic/sdk — GenomeBuilder
 *
 * Fluent builder for constructing PHOTONIC agent genome inputs.
 * Handles capability/tool hashing (Keccak-256 Merkle trees) client-side
 * so callers can preview the genome hash before on-chain registration.
 */

import { keccak256, toUtf8Bytes } from "ethers";
import type { GenomeInput, BuiltGenome, Hex } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Internal Merkle helpers (browser-safe)
// ─────────────────────────────────────────────────────────────────────────────

function hashLeaf(data: string): Hex {
  return keccak256(toUtf8Bytes(data)) as Hex;
}

/**
 * Build a Keccak-256 Merkle root from an array of leaf strings.
 * Empty → 0x000...0, Single → hash of leaf, Two+ → binary Merkle.
 * (Named distinctly to avoid conflict with genome.ts#buildMerkleRoot)
 */
export function buildCapabilityMerkleRoot(leaves: string[]): Hex {
  if (leaves.length === 0) {
    return "0x" + "00".repeat(32) as Hex;
  }
  let layer: Hex[] = leaves.map(hashLeaf);
  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] ?? left;
      // Sort pairs to make tree order-invariant
      const [a, b] = left <= right ? [left, right] : [right, left];
      next.push(keccak256(a + b.slice(2)) as Hex);
    }
    layer = next;
  }
  return layer[0];
}

// ─────────────────────────────────────────────────────────────────────────────
//  GenomeBuilder
// ─────────────────────────────────────────────────────────────────────────────

export class GenomeBuilder {
  private _capabilities: string[] = [];
  private _tools: string[] = [];
  private _promptArchDescription = "";
  private _parentA?: Hex;
  private _parentB?: Hex;

  /** Add a capability (string identifier) */
  withCapability(capability: string): this {
    if (!this._capabilities.includes(capability)) {
      this._capabilities.push(capability);
    }
    return this;
  }

  /** Add multiple capabilities */
  withCapabilities(capabilities: string[]): this {
    for (const cap of capabilities) this.withCapability(cap);
    return this;
  }

  /** Add a tool (string identifier) */
  withTool(tool: string): this {
    if (!this._tools.includes(tool)) {
      this._tools.push(tool);
    }
    return this;
  }

  /** Add multiple tools */
  withTools(tools: string[]): this {
    for (const tool of tools) this.withTool(tool);
    return this;
  }

  /** Set the prompt architecture description */
  withPromptArch(description: string): this {
    this._promptArchDescription = description;
    return this;
  }

  /** Set parent agents for reproductive genealogy */
  withParents(parentA: Hex, parentB: Hex): this {
    this._parentA = parentA;
    this._parentB = parentB;
    return this;
  }

  /** Build the GenomeInput without computing hashes */
  toInput(): GenomeInput {
    return {
      capabilities: [...this._capabilities],
      tools: [...this._tools],
      promptArchDescription: this._promptArchDescription,
      parentA: this._parentA,
      parentB: this._parentB,
    };
  }

  /** Build a full BuiltGenome with all hashes computed */
  build(generation = 0): BuiltGenome {
    const capabilityRoot = buildCapabilityMerkleRoot(this._capabilities);
    const toolRoot = buildCapabilityMerkleRoot(this._tools);
    const promptArchHash = hashLeaf(this._promptArchDescription);

    // genome_hash = keccak256(capRoot || toolRoot || promptHash)
    const combined = capabilityRoot.slice(2) + toolRoot.slice(2) + promptArchHash.slice(2);
    const genomeHash = keccak256("0x" + combined) as Hex;

    return {
      genomeHash,
      capabilityRoot,
      toolRoot,
      promptArchHash,
      behavioralHistoryRoot: ("0x" + "00".repeat(32)) as Hex,
      fitnessScore: 0,
      generation,
      parentA: this._parentA,
      parentB: this._parentB,
      capabilities: [...this._capabilities],
      tools: [...this._tools],
    };
  }

  /** Preview capability Merkle root */
  get capabilityRoot(): Hex {
    return buildCapabilityMerkleRoot(this._capabilities);
  }

  /** Preview tool Merkle root */
  get toolRoot(): Hex {
    return buildCapabilityMerkleRoot(this._tools);
  }

  /** Estimated capability count */
  get capabilityCount(): number {
    return this._capabilities.length;
  }

  /** Estimated tool count */
  get toolCount(): number {
    return this._tools.length;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Genome merge (Compositional Genetics)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge two parent genomes into an offspring genome.
 * Takes union of capabilities/tools, XOR-blends prompt arch.
 * Both parents must have fitness >= fitnessThreshold.
 */
export function mergeBuiltGenomes(
  parentA: BuiltGenome,
  parentB: BuiltGenome,
  parentAFitness: number,
  parentBFitness: number,
  fitnessThreshold = 0.5,
): GenomeBuilder {
  if (parentAFitness < fitnessThreshold) {
    throw new Error(`Parent A fitness ${parentAFitness.toFixed(3)} is below threshold ${fitnessThreshold}`);
  }
  if (parentBFitness < fitnessThreshold) {
    throw new Error(`Parent B fitness ${parentBFitness.toFixed(3)} is below threshold ${fitnessThreshold}`);
  }

  // Union of capabilities and tools
  const capabilities = [...new Set([...parentA.capabilities, ...parentB.capabilities])];
  const tools = [...new Set([...parentA.tools, ...parentB.tools])];
  const promptArch = `${parentA.genomeHash} ⊗ ${parentB.genomeHash}`;

  return new GenomeBuilder()
    .withCapabilities(capabilities)
    .withTools(tools)
    .withPromptArch(promptArch)
    .withParents(parentA.genomeHash, parentB.genomeHash);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Update behavioral history root
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extend an agent's behavioral history root by mixing in a new BPD hash.
 * history_root = keccak256(prev_root || new_bpd_hash)
 */
export function updateBehavioralHistory(
  prevRoot: Hex,
  newBpdHash: Hex,
): Hex {
  const combined = prevRoot.slice(2) + newBpdHash.slice(2);
  return keccak256("0x" + combined) as Hex;
}
