// ─────────────────────────────────────────────────────────────────────────────
//  PHOTONIC SDK — Genome Builder
//  Constructs agent genome Merkle roots from capability/tool lists.
// ─────────────────────────────────────────────────────────────────────────────

import { keccak256, toUtf8Bytes } from "ethers";
import type { Bytes32, GenomeInput } from "./types.js";

// Simple Merkle tree over a list of leaf hashes
export function buildMerkleRoot(leaves: string[]): Bytes32 {
  if (leaves.length === 0) return "0x" + "0".repeat(64) as Bytes32;

  let nodes: string[] = leaves.map((l) => keccak256(toUtf8Bytes(l)));

  while (nodes.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = nodes[i + 1] ?? nodes[i]; // duplicate last if odd
      // Sort to make tree order-independent
      const [a, b] = left < right ? [left, right] : [right, left];
      next.push(keccak256(a + b.slice(2))); // concat and hash
    }
    nodes = next;
  }

  return nodes[0] as Bytes32;
}

export function buildCapabilityRoot(capabilities: string[]): Bytes32 {
  return buildMerkleRoot(capabilities);
}

export function buildToolRoot(tools: string[]): Bytes32 {
  return buildMerkleRoot(tools);
}

export function hashPromptArch(description: string): Bytes32 {
  return keccak256(toUtf8Bytes(description)) as Bytes32;
}

/// Build all genome hashes from a GenomeInput
export function buildGenomeHashes(input: GenomeInput): {
  capabilityRoot: Bytes32;
  toolRoot: Bytes32;
  promptArchHash: Bytes32;
} {
  return {
    capabilityRoot: buildCapabilityRoot(input.capabilities),
    toolRoot: buildToolRoot(input.tools),
    promptArchHash: hashPromptArch(input.promptArchDescription),
  };
}

/// Merge two genomes for reproductive composition
/// The offspring genome takes the union of capabilities and tools,
/// and uses an XOR-blended prompt arch hash.
export function mergeGenomes(
  parentAInput: GenomeInput,
  parentBInput: GenomeInput
): GenomeInput {
  const capabilities = Array.from(
    new Set([...parentAInput.capabilities, ...parentBInput.capabilities])
  );
  const tools = Array.from(
    new Set([...parentAInput.tools, ...parentBInput.tools])
  );
  const promptArchDescription = `${parentAInput.promptArchDescription} ⊗ ${parentBInput.promptArchDescription}`;

  return { capabilities, tools, promptArchDescription };
}

/// Compute genome hash (for bidding without revealing internals)
export function hashGenome(input: GenomeInput): Bytes32 {
  const { capabilityRoot, toolRoot, promptArchHash } = buildGenomeHashes(input);
  return keccak256(
    capabilityRoot + toolRoot.slice(2) + promptArchHash.slice(2)
  ) as Bytes32;
}
