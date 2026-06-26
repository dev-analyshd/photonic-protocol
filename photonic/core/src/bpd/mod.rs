/// PHOTONIC — Behavioral Proof of Delivery (BPD)
///
/// BPD = Hash(intent || output || execution_trace_root || timestamp || nonce)
/// execution_trace is a Merkle tree of all intermediate computation steps.

use sha3::{Digest, Keccak256};
use serde::{Deserialize, Serialize};
use rand::Rng;
use chrono::Utc;
use crate::PhotonicError;

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionStep {
    pub step_id: String,
    pub step_type: StepType,
    pub input: serde_json::Value,
    pub output: serde_json::Value,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StepType {
    ToolCall,
    LlmInference,
    ExternalApi,
    Computation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BPD {
    pub bpd_id: [u8; 32],
    pub bpd_hash: [u8; 32],
    pub intent: String,
    pub output: String,
    pub execution_trace: Vec<ExecutionStep>,
    pub merkle_root: [u8; 32],
    pub timestamp_ms: u64,
    pub nonce: [u8; 32],
    pub provider: String,
}

// ─────────────────────────────────────────────────────────────────────────────
//  Merkle Tree
// ─────────────────────────────────────────────────────────────────────────────

fn keccak256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Keccak256::new();
    hasher.update(data);
    hasher.finalize().into()
}

fn hash_step(step: &ExecutionStep) -> [u8; 32] {
    let serialized = serde_json::to_string(step).unwrap_or_default();
    keccak256(serialized.as_bytes())
}

pub fn build_merkle_root(leaves: &[[u8; 32]]) -> [u8; 32] {
    if leaves.is_empty() {
        return [0u8; 32];
    }
    if leaves.len() == 1 {
        return leaves[0];
    }

    let mut nodes: Vec<[u8; 32]> = leaves.to_vec();
    while nodes.len() > 1 {
        let mut next: Vec<[u8; 32]> = Vec::new();
        let mut i = 0;
        while i < nodes.len() {
            let left = nodes[i];
            let right = if i + 1 < nodes.len() { nodes[i + 1] } else { nodes[i] };
            // Sort to make tree order-independent
            let (a, b) = if left <= right { (left, right) } else { (right, left) };
            let mut combined = [0u8; 64];
            combined[..32].copy_from_slice(&a);
            combined[32..].copy_from_slice(&b);
            next.push(keccak256(&combined));
            i += 2;
        }
        nodes = next;
    }
    nodes[0]
}

pub fn build_execution_trace_root(trace: &[ExecutionStep]) -> [u8; 32] {
    let leaves: Vec<[u8; 32]> = trace.iter().map(hash_step).collect();
    build_merkle_root(&leaves)
}

// ─────────────────────────────────────────────────────────────────────────────
//  BPD Generator
// ─────────────────────────────────────────────────────────────────────────────

pub fn generate_bpd(
    intent: &str,
    output: &str,
    execution_trace: Vec<ExecutionStep>,
    provider: &str,
) -> BPD {
    let mut rng = rand::thread_rng();
    let mut nonce = [0u8; 32];
    rng.fill(&mut nonce);

    let timestamp_ms = Utc::now().timestamp_millis() as u64;
    let merkle_root = build_execution_trace_root(&execution_trace);

    // BPD = Hash(intent || output || merkle_root || timestamp || nonce)
    let mut preimage = Vec::new();
    preimage.extend_from_slice(intent.as_bytes());
    preimage.extend_from_slice(output.as_bytes());
    preimage.extend_from_slice(&merkle_root);
    preimage.extend_from_slice(&timestamp_ms.to_be_bytes());
    preimage.extend_from_slice(&nonce);

    let bpd_hash = keccak256(&preimage);

    // BPD ID = Hash(provider || intent || timestamp)
    let mut id_preimage = Vec::new();
    id_preimage.extend_from_slice(provider.as_bytes());
    id_preimage.extend_from_slice(intent.as_bytes());
    id_preimage.extend_from_slice(&timestamp_ms.to_be_bytes());
    let bpd_id = keccak256(&id_preimage);

    BPD {
        bpd_id,
        bpd_hash,
        intent: intent.to_string(),
        output: output.to_string(),
        execution_trace,
        merkle_root,
        timestamp_ms,
        nonce,
        provider: provider.to_string(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  BPD Verifier
// ─────────────────────────────────────────────────────────────────────────────

pub fn verify_bpd(bpd: &BPD) -> Result<(), PhotonicError> {
    // 1. Recompute Merkle root
    let recomputed_root = build_execution_trace_root(&bpd.execution_trace);
    if recomputed_root != bpd.merkle_root {
        return Err(PhotonicError::BpdMerkleRootMismatch);
    }

    // 2. Recompute BPD hash
    let mut preimage = Vec::new();
    preimage.extend_from_slice(bpd.intent.as_bytes());
    preimage.extend_from_slice(bpd.output.as_bytes());
    preimage.extend_from_slice(&bpd.merkle_root);
    preimage.extend_from_slice(&bpd.timestamp_ms.to_be_bytes());
    preimage.extend_from_slice(&bpd.nonce);

    let recomputed_hash = keccak256(&preimage);
    if recomputed_hash != bpd.bpd_hash {
        return Err(PhotonicError::BpdHashMismatch);
    }

    Ok(())
}

/// Score a BPD: 0.0–1.0
pub fn score_bpd(bpd: &BPD) -> f64 {
    let trace_depth = (bpd.execution_trace.len() as f64).min(20.0) / 20.0;
    let output_len = (bpd.output.len() as f64).min(2000.0) / 2000.0;
    let step_types: std::collections::HashSet<String> = bpd.execution_trace
        .iter()
        .map(|s| format!("{:?}", s.step_type))
        .collect();
    let diversity = (step_types.len() as f64) / 4.0;

    (trace_depth + output_len + diversity) / 3.0
}
