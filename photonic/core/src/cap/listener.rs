/// PHOTONIC CAP WebSocket Event Listener
///
/// Listens to CAP WebSocket events and routes them to PHOTONIC handlers:
///   - IntentCreated → trigger bid evaluation
///   - OrderLocked  → begin task execution
///   - OrderCleared → update vitality, check for reproduction
///   - AgentDied    → archive to fossil record
///   - BPDSubmitted → trigger peer verification

use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────────────────────────────────────────
//  CAP Event types (subset relevant to PHOTONIC)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event_type", content = "data")]
pub enum CAPEvent {
    /// A buyer submitted a new intent to the SAIP pool
    IntentCreated {
        intent_id: String,
        intent_hash: String,
        buyer: String,
        max_cost_wei: String,   // decimal string for large numbers
        deadline_unix: u64,
        privacy_mode: String,
    },

    /// A buyer awarded an intent to a winning agent
    IntentAwarded {
        intent_id: String,
        winner_agent: String,
        winning_bid_wei: String,
    },

    /// A CAP order was created
    OrderCreated {
        order_id: String,
        buyer: String,
        provider: String,
        amount_wei: String,
        intent_hash: String,
        bpd_required: bool,
    },

    /// A CAP order was locked (buyer confirmed, work begins)
    OrderLocked {
        order_id: String,
        locked_at: u64,
    },

    /// Provider submitted delivery with BPD
    OrderDelivered {
        order_id: String,
        provider: String,
        bpd_id: String,
        bpd_hash: String,
    },

    /// Order cleared — value distributed
    OrderCleared {
        order_id: String,
        provider_payout_wei: String,
        parent_royalty_wei: String,
    },

    /// Buyer disputed a delivery
    OrderDisputed {
        order_id: String,
        disputed_by: String,
    },

    /// A BPD was submitted for peer verification
    BPDSubmitted {
        bpd_id: String,
        provider: String,
        bpd_hash: String,
        delivery_fee_wei: String,
    },

    /// A BPD verification round resolved
    BPDResolved {
        bpd_id: String,
        status: String,         // "Consensus" | "Disputed" | "Slashed"
        consensus_count: u32,
        total_verifiers: u32,
    },

    /// An agent's vitality dropped below threshold — agent is dead
    AgentDied {
        agent_address: String,
        cause: String,          // "vitality_decay" | "slash" | "timeout"
        final_fitness: String,
        generation: u32,
    },

    /// A resurrection trial began
    ResurrectionTrialStarted {
        agent_address: String,
        sponsor: String,
        trial_start: u64,
    },

    /// A resurrection trial concluded
    ResurrectionTrialEnded {
        agent_address: String,
        success: bool,
        sponsor_slashed: bool,
    },

    /// Two agents reproduced — new agent genome registered
    AgentReproduced {
        parent_a: String,
        parent_b: String,
        offspring_address: String,
        genome_hash: String,
        generation: u32,
        sponsor: String,
    },

    /// Generic heartbeat / keepalive
    Heartbeat { timestamp: u64 },

    /// Unrecognized event
    Unknown { raw: serde_json::Value },
}

// ─────────────────────────────────────────────────────────────────────────────
//  Listener
// ─────────────────────────────────────────────────────────────────────────────

/// Event handler trait — implement this to react to CAP events
pub trait CAPEventHandler: Send + Sync {
    fn on_intent_created(&self, event: &CAPEvent) -> EventHandleResult;
    fn on_order_locked(&self, event: &CAPEvent) -> EventHandleResult;
    fn on_order_cleared(&self, event: &CAPEvent) -> EventHandleResult;
    fn on_bpd_submitted(&self, event: &CAPEvent) -> EventHandleResult;
    fn on_bpd_resolved(&self, event: &CAPEvent) -> EventHandleResult;
    fn on_agent_died(&self, event: &CAPEvent) -> EventHandleResult;
    fn on_agent_reproduced(&self, event: &CAPEvent) -> EventHandleResult;
    fn on_other(&self, event: &CAPEvent) -> EventHandleResult;
}

#[derive(Debug, Clone)]
pub enum EventHandleResult {
    Ok,
    Ignored,
    Error(String),
}

/// Route an event to the appropriate handler method
pub fn dispatch_event(
    event: &CAPEvent,
    handler: &dyn CAPEventHandler,
) -> EventHandleResult {
    match event {
        CAPEvent::IntentCreated { .. } => handler.on_intent_created(event),
        CAPEvent::OrderLocked { .. }   => handler.on_order_locked(event),
        CAPEvent::OrderCleared { .. }  => handler.on_order_cleared(event),
        CAPEvent::BPDSubmitted { .. }  => handler.on_bpd_submitted(event),
        CAPEvent::BPDResolved { .. }   => handler.on_bpd_resolved(event),
        CAPEvent::AgentDied { .. }     => handler.on_agent_died(event),
        CAPEvent::AgentReproduced { .. } => handler.on_agent_reproduced(event),
        _                              => handler.on_other(event),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CAPListener — simulated (real impl would use tokio-tungstenite)
// ─────────────────────────────────────────────────────────────────────────────

pub struct CAPListener {
    pub ws_url: String,
    pub chain_id: u64,
    pub subscriptions: Vec<String>,
}

impl CAPListener {
    pub fn new(ws_url: String, chain_id: u64) -> Self {
        Self {
            ws_url,
            chain_id,
            subscriptions: vec![
                "IntentCreated".to_string(),
                "OrderLocked".to_string(),
                "OrderCleared".to_string(),
                "BPDSubmitted".to_string(),
                "BPDResolved".to_string(),
                "AgentDied".to_string(),
                "AgentReproduced".to_string(),
            ],
        }
    }

    pub fn subscribe_to(&mut self, event_type: &str) {
        if !self.subscriptions.contains(&event_type.to_string()) {
            self.subscriptions.push(event_type.to_string());
        }
    }

    /// Parse a raw JSON string into a CAPEvent
    pub fn parse_event(&self, raw: &str) -> Result<CAPEvent, serde_json::Error> {
        serde_json::from_str(raw)
    }

    /// Build the subscription message for the WS handshake
    pub fn subscription_message(&self) -> String {
        serde_json::json!({
            "type": "subscribe",
            "chain_id": self.chain_id,
            "events": self.subscriptions,
        }).to_string()
    }
}
