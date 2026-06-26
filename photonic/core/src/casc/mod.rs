/// PHOTONIC — Cross-Agent State Capsule (CASC)
/// Encrypted state sharing between agents without full trust.

use serde::{Deserialize, Serialize};
use sha3::{Digest, Keccak256};
use rand::Rng;
use chrono::Utc;
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
pub struct CASC {
    pub encrypted_fragments: Vec<[u8; 32]>,   // Simulated AES-GCM ciphertexts (hash-based in demo)
    pub session_key_commitment: [u8; 32],      // keccak256(sessionKey || provider)
    pub max_age_secs: u64,
    pub timestamp_unix: u64,
    pub continuity_proof: [u8; 32],            // Links to previous CASC
    pub access_policy: Vec<String>,             // Agent IDs allowed to decrypt
}

#[derive(Debug, Clone)]
pub struct CASCInput {
    pub state_fragments: Vec<serde_json::Value>,
    pub session_key: [u8; 32],
    pub max_age_secs: u64,
    pub provider: String,
    pub previous_casc_hash: Option<[u8; 32]>,
    pub access_policy: Vec<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
//  Builder
// ─────────────────────────────────────────────────────────────────────────────

/// Simulate fragment encryption with session key (keccak256 in demo; AES-GCM in prod)
fn encrypt_fragment(fragment: &serde_json::Value, session_key: &[u8; 32]) -> [u8; 32] {
    let serialized = serde_json::to_string(fragment).unwrap_or_default();
    let mut preimage = session_key.to_vec();
    preimage.extend_from_slice(serialized.as_bytes());
    keccak256(&preimage)
}

fn build_session_key_commitment(session_key: &[u8; 32], provider: &str) -> [u8; 32] {
    let mut preimage = session_key.to_vec();
    preimage.extend_from_slice(provider.as_bytes());
    keccak256(&preimage)
}

fn build_continuity_proof(previous_hash: Option<&[u8; 32]>, timestamp: u64) -> [u8; 32] {
    match previous_hash {
        None => [0u8; 32],
        Some(prev) => {
            let mut preimage = prev.to_vec();
            preimage.extend_from_slice(&timestamp.to_be_bytes());
            keccak256(&preimage)
        }
    }
}

pub fn build_casc(input: CASCInput) -> CASC {
    let timestamp = Utc::now().timestamp() as u64;

    let encrypted_fragments = input.state_fragments
        .iter()
        .map(|f| encrypt_fragment(f, &input.session_key))
        .collect();

    let session_key_commitment = build_session_key_commitment(&input.session_key, &input.provider);
    let continuity_proof = build_continuity_proof(input.previous_casc_hash.as_ref(), timestamp);

    CASC {
        encrypted_fragments,
        session_key_commitment,
        max_age_secs: input.max_age_secs,
        timestamp_unix: timestamp,
        continuity_proof,
        access_policy: input.access_policy,
    }
}

/// Generate a random session key
pub fn generate_session_key() -> [u8; 32] {
    let mut rng = rand::thread_rng();
    let mut key = [0u8; 32];
    rng.fill(&mut key);
    key
}

// ─────────────────────────────────────────────────────────────────────────────
//  Validation
// ─────────────────────────────────────────────────────────────────────────────

pub fn is_casc_fresh(casc: &CASC) -> Result<(), PhotonicError> {
    let now = Utc::now().timestamp() as u64;
    let age = now.saturating_sub(casc.timestamp_unix);
    if age > casc.max_age_secs {
        Err(PhotonicError::CascStale { age_secs: age, max_age_secs: casc.max_age_secs })
    } else {
        Ok(())
    }
}

pub fn can_access(casc: &CASC, agent_id: &str) -> Result<(), PhotonicError> {
    let id_lower = agent_id.to_lowercase();
    if casc.access_policy.iter().any(|a| a.to_lowercase() == id_lower) {
        Ok(())
    } else {
        Err(PhotonicError::CascAccessDenied { agent_id: agent_id.to_string() })
    }
}

pub fn hash_casc(casc: &CASC) -> [u8; 32] {
    let serialized = serde_json::to_string(casc).unwrap_or_default();
    keccak256(serialized.as_bytes())
}
