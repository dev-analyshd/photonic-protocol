use thiserror::Error;

#[derive(Error, Debug)]
pub enum PhotonicError {
    #[error("BPD verification failed: hash mismatch")]
    BpdHashMismatch,

    #[error("BPD Merkle root mismatch")]
    BpdMerkleRootMismatch,

    #[error("Genome parse error: {0}")]
    GenomeParseError(String),

    #[error("Genome merge fitness below threshold: {fitness:.4}")]
    GenomeFitnessBelowThreshold { fitness: f64 },

    #[error("SAIP auction: no valid bids")]
    AuctionNoBids,

    #[error("SAIP intent hash mismatch on reveal")]
    IntentHashMismatch,

    #[error("CASC decryption failed")]
    CascDecryptionFailed,

    #[error("CASC staleness: capsule too old ({age_secs}s > max {max_age_secs}s)")]
    CascStale { age_secs: u64, max_age_secs: u64 },

    #[error("CASC access denied for agent {agent_id}")]
    CascAccessDenied { agent_id: String },

    #[error("DRP: agent not eligible for resurrection (permanently extinct)")]
    AgentPermanentlyExtinct,

    #[error("DRP: resurrection trial expired without required BPDs")]
    ResurrectionTrialFailed,

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("Crypto error: {0}")]
    CryptoError(String),
}
