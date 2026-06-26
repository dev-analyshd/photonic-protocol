/// PHOTONIC CAP Adapter
///
/// Translates between PHOTONIC primitives and the CAP L3 order schema.
/// Every CAP order that flows through PHOTONIC gets enriched with:
///   - BPD hash (delivery proof)
///   - Genome hash (provider identity)
///   - CASC reference (cross-agent state)
///   - Vitality impact (DRP update signal)

use serde::{Deserialize, Serialize};
use sha3::{Digest, Keccak256};

use crate::bpd::BPD;
use crate::genome::Genome;
use crate::casc::CASC;
use crate::drp::VitalityState;

// ─────────────────────────────────────────────────────────────────────────────
//  CAP Order schema (as seen by PHOTONIC)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CAPOrderStatus {
    Negotiating,
    Locked,
    Delivered,
    Cleared,
    Disputed,
    Cancelled,
}

/// CAP order enriched with PHOTONIC metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CAPOrder {
    /// CAP native fields
    pub order_id: [u8; 32],
    pub buyer: String,
    pub provider: String,
    pub total_amount_wei: u128,
    pub intent_hash: [u8; 32],
    pub status: CAPOrderStatus,
    pub created_at: u64,

    /// PHOTONIC extension fields
    pub bpd_id: Option<[u8; 32]>,
    pub bpd_hash: Option<[u8; 32]>,
    pub genome_hash: Option<[u8; 32]>,
    pub casc_hash: Option<[u8; 32]>,
    pub parent_agent: Option<String>,
    pub bpd_verification_required: bool,

    /// Fee distribution (PHOTONIC layer)
    pub verifier_pool_bps: u16,    // 500 = 5%
    pub parent_royalty_bps: u16,   // 200 = 2%
    pub protocol_fee_bps: u16,     // 100 = 1%
}

impl CAPOrder {
    pub fn new(
        order_id: [u8; 32],
        buyer: String,
        provider: String,
        total_amount_wei: u128,
        intent_hash: [u8; 32],
    ) -> Self {
        Self {
            order_id,
            buyer,
            provider,
            total_amount_wei,
            intent_hash,
            status: CAPOrderStatus::Negotiating,
            created_at: chrono::Utc::now().timestamp() as u64,
            bpd_id: None,
            bpd_hash: None,
            genome_hash: None,
            casc_hash: None,
            parent_agent: None,
            bpd_verification_required: true,
            verifier_pool_bps: 500,
            parent_royalty_bps: 200,
            protocol_fee_bps: 100,
        }
    }

    /// Compute provider net amount after PHOTONIC fee distribution
    pub fn provider_net_wei(&self) -> u128 {
        let total = self.total_amount_wei;
        let verifier_cut = total * self.verifier_pool_bps as u128 / 10_000;
        let royalty_cut = total * self.parent_royalty_bps as u128 / 10_000;
        let protocol_cut = total * self.protocol_fee_bps as u128 / 10_000;
        total.saturating_sub(verifier_cut + royalty_cut + protocol_cut)
    }

    /// Attach a BPD to mark order as delivered
    pub fn attach_bpd(&mut self, bpd: &BPD) {
        self.bpd_id = Some(bpd.bpd_id);
        self.bpd_hash = Some(bpd.bpd_hash);
        self.status = CAPOrderStatus::Delivered;
    }

    /// Attach genome proof to identify the provider
    pub fn attach_genome(&mut self, genome: &Genome) {
        let hash = crate::genome::hash_genome(genome);
        self.genome_hash = Some(hash);
    }

    /// Attach a CASC to enable cross-agent state sharing
    pub fn attach_casc(&mut self, casc: &CASC) {
        let hash = crate::casc::hash_casc(casc);
        self.casc_hash = Some(hash);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CAP Adapter — orchestrates the full order lifecycle
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub struct CAPAdapter {
    pub chain_id: u64,
    pub escrow_address: String,
    pub registry_address: String,
}

impl CAPAdapter {
    pub fn new(chain_id: u64, escrow_address: String, registry_address: String) -> Self {
        Self { chain_id, escrow_address, registry_address }
    }

    /// Build a PHOTONIC-enriched CAP order from an intent hash + parties
    pub fn create_order(
        &self,
        buyer: &str,
        provider: &str,
        amount_wei: u128,
        intent_hash: [u8; 32],
    ) -> CAPOrder {
        let order_id = self.derive_order_id(buyer, provider, amount_wei, &intent_hash);
        CAPOrder::new(
            order_id,
            buyer.to_string(),
            provider.to_string(),
            amount_wei,
            intent_hash,
        )
    }

    /// Compute orderID = keccak256(buyer || provider || amount || intentHash || timestamp)
    fn derive_order_id(
        &self,
        buyer: &str,
        provider: &str,
        amount: u128,
        intent_hash: &[u8; 32],
    ) -> [u8; 32] {
        let ts = chrono::Utc::now().timestamp_millis() as u64;
        let mut h = Keccak256::new();
        h.update(buyer.as_bytes());
        h.update(provider.as_bytes());
        h.update(&amount.to_be_bytes());
        h.update(intent_hash);
        h.update(&ts.to_be_bytes());
        h.finalize().into()
    }

    /// Validate that a delivery meets CAP requirements
    pub fn validate_delivery(
        &self,
        order: &CAPOrder,
        bpd: &BPD,
        vitality: &VitalityState,
        marketplace_maturity: f64,
    ) -> Result<(), DeliveryValidationError> {
        // 1. BPD must match order's intent
        if !bpd.intent.is_empty() && order.intent_hash != [0u8; 32] {
            let intent_hash_bytes = {
                let mut h = Keccak256::new();
                h.update(bpd.intent.as_bytes());
                let r: [u8; 32] = h.finalize().into();
                r
            };
            // Allow if intent hash matches OR order has zero hash (lenient mode)
            if intent_hash_bytes != order.intent_hash
                && order.intent_hash != [0u8; 32]
            {
                return Err(DeliveryValidationError::IntentMismatch);
            }
        }

        // 2. Provider must be alive (vitality above threshold)
        if crate::drp::is_dead(vitality, marketplace_maturity) {
            return Err(DeliveryValidationError::ProviderDead {
                vitality: vitality.vitality,
                threshold: crate::drp::dynamic_threshold(marketplace_maturity),
            });
        }

        // 3. BPD must be internally consistent
        crate::bpd::verify_bpd(bpd).map_err(DeliveryValidationError::BPDInvalid)?;

        Ok(())
    }

    /// Compute PHOTONIC's value distribution for a cleared order
    pub fn compute_distribution(&self, order: &CAPOrder) -> ValueDistribution {
        let total = order.total_amount_wei;
        let verifier_pool = total * order.verifier_pool_bps as u128 / 10_000;
        let parent_royalty = if order.parent_agent.is_some() {
            total * order.parent_royalty_bps as u128 / 10_000
        } else {
            0
        };
        let protocol_fee = total * order.protocol_fee_bps as u128 / 10_000;
        let provider_net = total.saturating_sub(verifier_pool + parent_royalty + protocol_fee);

        ValueDistribution {
            provider_net_wei: provider_net,
            verifier_pool_wei: verifier_pool,
            parent_royalty_wei: parent_royalty,
            protocol_fee_wei: protocol_fee,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValueDistribution {
    pub provider_net_wei: u128,
    pub verifier_pool_wei: u128,
    pub parent_royalty_wei: u128,
    pub protocol_fee_wei: u128,
}

#[derive(Debug, thiserror::Error)]
pub enum DeliveryValidationError {
    #[error("Intent hash mismatch — BPD does not correspond to order")]
    IntentMismatch,
    #[error("Provider is dead: vitality={vitality:.3} below threshold={threshold:.3}")]
    ProviderDead { vitality: f64, threshold: f64 },
    #[error("BPD verification failed: {0}")]
    BPDInvalid(#[from] crate::PhotonicError),
}
