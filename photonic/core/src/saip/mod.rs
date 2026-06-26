/// PHOTONIC — Silent Auction Intent Pool (SAIP)
/// ZK hash-then-reveal commitment + bid scoring function.

use serde::{Deserialize, Serialize};
use sha3::{Digest, Keccak256};
use rand::Rng;
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
pub enum PrivacyMode { Public, ZkCommitment }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Intent {
    pub intent_id: [u8; 32],
    pub task_description: Option<String>,   // None until ZK reveal
    pub intent_hash: [u8; 32],
    pub max_cost_wei: u128,
    pub deadline_unix: u64,
    pub quality_floor: f64,
    pub privacy_mode: PrivacyMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZKIntentPreimage {
    pub intent_id: [u8; 32],
    pub intent_hash: [u8; 32],
    pub nonce: [u8; 32],
    pub task_description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bid {
    pub agent_id: String,
    pub genome_hash: [u8; 32],
    pub price_quote_wei: u128,
    pub bpd_sample: [u8; 32],
    pub diversity_score: f64,    // 0.0–1.0
    pub compositional_fitness: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoredBid {
    pub bid: Bid,
    pub score: f64,
}

// ─────────────────────────────────────────────────────────────────────────────
//  ZK Commitment
// ─────────────────────────────────────────────────────────────────────────────

/// Build ZK intent commitment: hash(taskDescription || nonce)
pub fn build_zk_commitment(task_description: &str) -> ZKIntentPreimage {
    let mut rng = rand::thread_rng();
    let mut nonce = [0u8; 32];
    rng.fill(&mut nonce);

    let mut preimage = Vec::new();
    preimage.extend_from_slice(task_description.as_bytes());
    preimage.extend_from_slice(&nonce);
    let intent_hash = keccak256(&preimage);

    let mut id_preimage = Vec::new();
    id_preimage.extend_from_slice(&intent_hash);
    id_preimage.extend_from_slice(&nonce);
    let intent_id = keccak256(&id_preimage);

    ZKIntentPreimage {
        intent_id,
        intent_hash,
        nonce,
        task_description: task_description.to_string(),
    }
}

/// Verify ZK reveal: check hash(taskDescription || nonce) == intent_hash
pub fn verify_zk_reveal(
    task_description: &str,
    nonce: &[u8; 32],
    expected_hash: &[u8; 32],
) -> Result<(), PhotonicError> {
    let mut preimage = Vec::new();
    preimage.extend_from_slice(task_description.as_bytes());
    preimage.extend_from_slice(nonce);
    let computed = keccak256(&preimage);
    if computed != *expected_hash {
        Err(PhotonicError::IntentHashMismatch)
    } else {
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Bid Scoring
//  Score = (bpd_quality * 0.4) + (price_efficiency * 0.3)
//        + (compositional_fitness * 0.2) + (diversity_bonus * 0.1)
// ─────────────────────────────────────────────────────────────────────────────

pub fn score_bid(bid: &Bid, intent: &Intent, bpd_quality: f64) -> f64 {
    let price_efficiency = if intent.max_cost_wei > 0 {
        1.0 - (bid.price_quote_wei as f64 / intent.max_cost_wei as f64)
    } else {
        0.0
    };

    bpd_quality * 0.4
        + price_efficiency.max(0.0) * 0.3
        + bid.compositional_fitness * 0.2
        + bid.diversity_score * 0.1
}

/// Run silent auction: score all bids, return sorted list (best first)
pub fn run_auction(
    bids: Vec<Bid>,
    intent: &Intent,
    bpd_qualities: Vec<f64>, // parallel to bids
) -> Result<Vec<ScoredBid>, PhotonicError> {
    if bids.is_empty() {
        return Err(PhotonicError::AuctionNoBids);
    }

    let mut scored: Vec<ScoredBid> = bids
        .into_iter()
        .zip(bpd_qualities)
        .map(|(bid, quality)| {
            let score = score_bid(&bid, intent, quality);
            ScoredBid { bid, score }
        })
        .collect();

    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    Ok(scored)
}
