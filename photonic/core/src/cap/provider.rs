/// PHOTONIC CAP Provider Daemon
///
/// The provider daemon is the off-chain component that:
/// 1. Registers the agent's genome in the registry
/// 2. Polls the SAIP intent pool for matching intents
/// 3. Submits bids on behalf of the agent
/// 4. Monitors assigned orders and triggers BPD generation
/// 5. Sends vitality update signals to the DRP

use serde::{Deserialize, Serialize};
use crate::genome::{Genome, GenomeInput, build_genome, hash_genome};
use crate::saip::{Intent, Bid};
use crate::drp::VitalityState;
use crate::PhotonicError;

// ─────────────────────────────────────────────────────────────────────────────
//  Provider Configuration
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    /// On-chain address of this agent
    pub agent_address: String,
    /// RPC endpoint for the chain
    pub rpc_url: String,
    /// PHOTONIC contract addresses
    pub registry_address: String,
    pub escrow_address: String,
    pub auction_address: String,
    pub verifier_address: String,
    pub vitality_address: String,
    /// Agent capabilities and tools
    pub genome_input: GenomeInput,
    /// Max cost the agent will accept for a task (in wei)
    pub max_accepted_cost_wei: u128,
    /// Poll interval for the intent pool (in seconds)
    pub poll_interval_secs: u64,
    /// Minimum bid score for the agent to participate in an auction
    pub min_bid_score: f64,
}

impl ProviderConfig {
    pub fn new(
        agent_address: String,
        rpc_url: String,
        registry_address: String,
        escrow_address: String,
        auction_address: String,
        verifier_address: String,
        vitality_address: String,
        genome_input: GenomeInput,
    ) -> Self {
        Self {
            agent_address,
            rpc_url,
            registry_address,
            escrow_address,
            auction_address,
            verifier_address,
            vitality_address,
            genome_input,
            max_accepted_cost_wei: 1_000_000_000_000_000_000, // 1 ETH default
            poll_interval_secs: 30,
            min_bid_score: 0.3,
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Provider State
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderState {
    pub genome: Genome,
    pub genome_hash: [u8; 32],
    pub vitality: VitalityState,
    pub registered: bool,
    pub active_order_ids: Vec<[u8; 32]>,
    pub total_bids_submitted: u32,
    pub total_orders_won: u32,
    pub total_bpds_generated: u32,
    pub started_at: u64,
}

impl ProviderState {
    pub fn new(genome_input: &GenomeInput, generation: u32) -> Self {
        let genome = build_genome(genome_input, generation);
        let genome_hash = hash_genome(&genome);
        Self {
            genome,
            genome_hash,
            vitality: VitalityState::default(),
            registered: false,
            active_order_ids: Vec::new(),
            total_bids_submitted: 0,
            total_orders_won: 0,
            total_bpds_generated: 0,
            started_at: chrono::Utc::now().timestamp() as u64,
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CAP Provider
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub struct CAPProvider {
    pub config: ProviderConfig,
    pub state: ProviderState,
}

impl CAPProvider {
    pub fn new(config: ProviderConfig) -> Self {
        let state = ProviderState::new(&config.genome_input, 0);
        Self { config, state }
    }

    /// Build a bid for an intent
    pub fn build_bid(
        &self,
        intent: &Intent,
        price_quote_wei: u128,
        bpd_sample: [u8; 32],
        diversity_score: f64,
        compositional_fitness: f64,
    ) -> Result<Bid, PhotonicError> {
        if price_quote_wei > intent.max_cost_wei {
            return Err(PhotonicError::AuctionNoBids); // price above buyer's max
        }

        Ok(Bid {
            agent_id: self.config.agent_address.clone(),
            genome_hash: self.state.genome_hash,
            price_quote_wei,
            bpd_sample,
            diversity_score,
            compositional_fitness,
        })
    }

    /// Check if this provider is eligible to bid on an intent
    pub fn can_bid(&self, intent: &Intent, marketplace_maturity: f64) -> bool {
        // Provider must be alive
        if crate::drp::is_dead(&self.state.vitality, marketplace_maturity) {
            return false;
        }
        // Price must be within range
        if intent.max_cost_wei < self.config.max_accepted_cost_wei / 10 {
            return false; // too cheap
        }
        true
    }

    /// Update state after winning a bid
    pub fn on_order_won(&mut self, order_id: [u8; 32]) {
        self.state.total_orders_won += 1;
        self.state.active_order_ids.push(order_id);
    }

    /// Update state after delivering a BPD
    pub fn on_bpd_delivered(
        &mut self,
        order_id: &[u8; 32],
        bpd_quality: f64,
        surplus_wei: u128,
        was_compositional: bool,
    ) {
        self.state.total_bpds_generated += 1;
        self.state.active_order_ids.retain(|id| id != order_id);

        crate::drp::record_bpd(
            &mut self.state.vitality,
            bpd_quality,
            surplus_wei,
            was_compositional,
        );
    }

    /// Apply vitality decay (call periodically)
    pub fn apply_decay(&mut self, now_unix: u64, decay_interval_secs: u64, lambda: f64) {
        crate::drp::apply_decay(
            &mut self.state.vitality,
            now_unix,
            decay_interval_secs,
            lambda,
        );
    }

    /// Summary report for logging
    pub fn status_report(&self) -> ProviderStatus {
        let uptime_secs = chrono::Utc::now().timestamp() as u64 - self.state.started_at;
        ProviderStatus {
            agent_address: self.config.agent_address.clone(),
            genome_hash: format!("0x{}", hex::encode(self.state.genome_hash)),
            vitality: self.state.vitality.vitality,
            registered: self.state.registered,
            active_orders: self.state.active_order_ids.len(),
            total_bids: self.state.total_bids_submitted,
            total_wins: self.state.total_orders_won,
            total_bpds: self.state.total_bpds_generated,
            uptime_secs,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderStatus {
    pub agent_address: String,
    pub genome_hash: String,
    pub vitality: f64,
    pub registered: bool,
    pub active_orders: usize,
    pub total_bids: u32,
    pub total_wins: u32,
    pub total_bpds: u32,
    pub uptime_secs: u64,
}
