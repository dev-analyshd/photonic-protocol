/// PHOTONIC — Compositional Genetics (CG)
/// Agent genome: capabilities, tools, prompt arch, behavioral history, fitness.

use serde::{Deserialize, Serialize};
use sha3::{Digest, Keccak256};
use crate::bpd::build_merkle_root;
use crate::PhotonicError;

fn keccak256(data: &[u8]) -> [u8; 32] {
    let mut h = Keccak256::new();
    h.update(data);
    h.finalize().into()
}

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Genome {
    pub capability_root: [u8; 32],
    pub tool_root: [u8; 32],
    pub prompt_arch_hash: [u8; 32],
    pub behavioral_history_root: [u8; 32],
    pub fitness_score: f64,           // Surplus generated / cost
    pub generation: u32,
    pub parent_a: Option<String>,
    pub parent_b: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenomeInput {
    pub capabilities: Vec<String>,
    pub tools: Vec<String>,
    pub prompt_arch_description: String,
    pub parent_a: Option<String>,
    pub parent_b: Option<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
//  Builder
// ─────────────────────────────────────────────────────────────────────────────

pub fn build_capability_root(capabilities: &[String]) -> [u8; 32] {
    let leaves: Vec<[u8; 32]> = capabilities.iter()
        .map(|c| keccak256(c.as_bytes()))
        .collect();
    build_merkle_root(&leaves)
}

pub fn build_tool_root(tools: &[String]) -> [u8; 32] {
    let leaves: Vec<[u8; 32]> = tools.iter()
        .map(|t| keccak256(t.as_bytes()))
        .collect();
    build_merkle_root(&leaves)
}

pub fn hash_prompt_arch(description: &str) -> [u8; 32] {
    keccak256(description.as_bytes())
}

pub fn build_genome(input: &GenomeInput, generation: u32) -> Genome {
    Genome {
        capability_root: build_capability_root(&input.capabilities),
        tool_root: build_tool_root(&input.tools),
        prompt_arch_hash: hash_prompt_arch(&input.prompt_arch_description),
        behavioral_history_root: [0u8; 32],
        fitness_score: 0.0,
        generation,
        parent_a: input.parent_a.clone(),
        parent_b: input.parent_b.clone(),
    }
}

/// Update genome after a BPD delivery. Extends behavioral history Merkle root.
pub fn update_behavioral_history(genome: &mut Genome, new_bpd_hash: &[u8; 32]) {
    let mut combined = [0u8; 64];
    combined[..32].copy_from_slice(&genome.behavioral_history_root);
    combined[32..].copy_from_slice(new_bpd_hash);
    genome.behavioral_history_root = keccak256(&combined);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Merger (Compositional Genetics)
// ─────────────────────────────────────────────────────────────────────────────

/// Merge two parent genomes into an offspring genome.
/// Takes union of capabilities and tools, XOR-blends prompt arch.
pub fn merge_genomes(
    parent_a_input: &GenomeInput,
    parent_b_input: &GenomeInput,
    parent_a_fitness: f64,
    parent_b_fitness: f64,
    fitness_threshold: f64,
) -> Result<GenomeInput, PhotonicError> {
    if parent_a_fitness < fitness_threshold {
        return Err(PhotonicError::GenomeFitnessBelowThreshold { fitness: parent_a_fitness });
    }
    if parent_b_fitness < fitness_threshold {
        return Err(PhotonicError::GenomeFitnessBelowThreshold { fitness: parent_b_fitness });
    }

    let mut capabilities: Vec<String> = parent_a_input.capabilities.clone();
    for cap in &parent_b_input.capabilities {
        if !capabilities.contains(cap) {
            capabilities.push(cap.clone());
        }
    }

    let mut tools: Vec<String> = parent_a_input.tools.clone();
    for tool in &parent_b_input.tools {
        if !tools.contains(tool) {
            tools.push(tool.clone());
        }
    }

    let prompt_arch_description = format!(
        "{} ⊗ {}",
        parent_a_input.prompt_arch_description,
        parent_b_input.prompt_arch_description
    );

    Ok(GenomeInput {
        capabilities,
        tools,
        prompt_arch_description,
        parent_a: None,
        parent_b: None,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
//  Fitness
// ─────────────────────────────────────────────────────────────────────────────

/// F(t) = [V(t) >= Θ(t)] * S(t) * e^(M_moat * t)
pub fn compute_agent_fitness(
    vitality: f64,
    vitality_threshold: f64,
    surplus: f64,
    moat_factor: f64,
    time_units: f64,
) -> f64 {
    if vitality < vitality_threshold {
        return 0.0;
    }
    surplus * (moat_factor * time_units).exp()
}

pub fn hash_genome(genome: &Genome) -> [u8; 32] {
    let mut combined = [0u8; 96];
    combined[..32].copy_from_slice(&genome.capability_root);
    combined[32..64].copy_from_slice(&genome.tool_root);
    combined[64..].copy_from_slice(&genome.prompt_arch_hash);
    keccak256(&combined)
}
