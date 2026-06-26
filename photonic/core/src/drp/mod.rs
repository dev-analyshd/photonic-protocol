/// PHOTONIC — Death and Resurrection Protocol (DRP)
///
/// dV/dt = -λ*(1 - BPD_rate) + μ*surplus_generated
///
/// V(t) = α*BPD_quality + β*compositional_success + γ*surplus_rate
///         + δ*diversity_contribution + ε*resurrection_vouches
/// Weights: α=0.30, β=0.25, γ=0.25, δ=0.10, ε=0.10

use serde::{Deserialize, Serialize};
use crate::PhotonicError;

// ─────────────────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────────────────

pub const ALPHA: f64 = 0.30;
pub const BETA:  f64 = 0.25;
pub const GAMMA: f64 = 0.25;
pub const DELTA: f64 = 0.10;
pub const EPSILON: f64 = 0.10;

pub const V_DEATH_DEFAULT: f64 = 0.20;  // Θ_min
pub const V_MAX_MATURE: f64    = 0.85;  // Θ_max
pub const RESURRECTION_WINDOW_SECS: u64 = 48 * 3600;
pub const RESURRECTION_BPDS_REQUIRED: u32 = 3;

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VitalityState {
    pub vitality: f64,                    // 0.0–1.0
    pub bpd_quality_accum: f64,
    pub compositional_successes: u32,
    pub surplus_accum_wei: u128,
    pub diversity_score: f64,             // Set by oracle
    pub resurrection_vouches: u32,
    pub total_bpds: u32,
    pub total_deliveries: u32,
    pub last_decay_unix: u64,
    pub in_resurrection_trial: bool,
    pub resurrection_trial_start: u64,
    pub resurrection_bpd_count: u32,
    pub resurrection_sponsor: Option<String>,
}

impl Default for VitalityState {
    fn default() -> Self {
        Self {
            vitality: 0.25,               // New agents start at 25%
            bpd_quality_accum: 0.0,
            compositional_successes: 0,
            surplus_accum_wei: 0,
            diversity_score: 0.0,
            resurrection_vouches: 0,
            total_bpds: 0,
            total_deliveries: 0,
            last_decay_unix: 0,
            in_resurrection_trial: false,
            resurrection_trial_start: 0,
            resurrection_bpd_count: 0,
            resurrection_sponsor: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentLifeStatus {
    Alive,
    Dead { died_at: u64, cause: String },
    InResurrectionTrial { trial_start: u64 },
    PermanentlyExtinct,
}

// ─────────────────────────────────────────────────────────────────────────────
//  Vitality Computation
// ─────────────────────────────────────────────────────────────────────────────

/// V(t) = α*BPD_quality + β*compositional + γ*surplus + δ*diversity + ε*vouches
pub fn compute_vitality(state: &VitalityState) -> f64 {
    if state.total_deliveries == 0 {
        return 0.25;
    }

    let avg_bpd_quality = (state.bpd_quality_accum / state.total_deliveries as f64).min(1.0);

    let compositional_score = (state.compositional_successes as f64
        / state.total_deliveries as f64).min(1.0);

    // Surplus score: 1 ETH surplus = max score
    let surplus_score = ((state.surplus_accum_wei as f64) / 1e18_f64).min(1.0);

    let diversity_score = state.diversity_score.min(1.0);

    let vouch_score = (state.resurrection_vouches as f64 / 10.0).min(1.0);

    (avg_bpd_quality * ALPHA
        + compositional_score * BETA
        + surplus_score * GAMMA
        + diversity_score * DELTA
        + vouch_score * EPSILON)
        .min(1.0)
}

/// Θ(t) = Θ_min + (Θ_max - Θ_min) * M(t)
/// M(t) = marketplace maturity index, 0.0 at genesis, 1.0 at saturation
pub fn dynamic_threshold(marketplace_maturity: f64) -> f64 {
    V_DEATH_DEFAULT + (V_MAX_MATURE - V_DEATH_DEFAULT) * marketplace_maturity.min(1.0)
}

// ─────────────────────────────────────────────────────────────────────────────
//  Vitality Updates
// ─────────────────────────────────────────────────────────────────────────────

/// Apply natural decay over elapsed intervals
/// dV = -λ * (1 - BPD_rate) per interval
pub fn apply_decay(
    state: &mut VitalityState,
    now_unix: u64,
    decay_interval_secs: u64,
    lambda: f64,
) {
    if state.last_decay_unix == 0 {
        state.last_decay_unix = now_unix;
        return;
    }

    let intervals = (now_unix - state.last_decay_unix) / decay_interval_secs;
    if intervals == 0 { return; }

    state.last_decay_unix += intervals * decay_interval_secs;

    let bpd_rate = if state.total_deliveries > 0 {
        (state.total_bpds as f64 / state.total_deliveries as f64).min(1.0)
    } else {
        0.0
    };

    let decay_per_interval = lambda * (1.0 - bpd_rate);
    let total_decay = (decay_per_interval * intervals as f64).min(1.0);
    state.vitality = (state.vitality - total_decay).max(0.0);
}

/// Record a successful BPD delivery — boosts vitality
pub fn record_bpd(
    state: &mut VitalityState,
    bpd_quality: f64,
    surplus_wei: u128,
    was_compositional: bool,
) {
    state.bpd_quality_accum += bpd_quality;
    state.total_bpds += 1;
    state.total_deliveries += 1;
    state.surplus_accum_wei += surplus_wei;
    if was_compositional {
        state.compositional_successes += 1;
    }
    if state.in_resurrection_trial {
        state.resurrection_bpd_count += 1;
    }
    state.vitality = compute_vitality(state);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Death Check
// ─────────────────────────────────────────────────────────────────────────────

pub fn is_dead(state: &VitalityState, marketplace_maturity: f64) -> bool {
    state.vitality < dynamic_threshold(marketplace_maturity)
}

// ─────────────────────────────────────────────────────────────────────────────
//  Resurrection
// ─────────────────────────────────────────────────────────────────────────────

pub fn begin_resurrection(
    state: &mut VitalityState,
    sponsor: &str,
    now_unix: u64,
) -> Result<(), PhotonicError> {
    state.in_resurrection_trial = true;
    state.resurrection_trial_start = now_unix;
    state.resurrection_bpd_count = 0;
    state.resurrection_sponsor = Some(sponsor.to_string());
    state.vitality = 0.25;
    Ok(())
}

pub fn check_resurrection_outcome(
    state: &VitalityState,
    now_unix: u64,
) -> Option<bool> {
    if !state.in_resurrection_trial { return None; }

    if state.resurrection_bpd_count >= RESURRECTION_BPDS_REQUIRED {
        return Some(true); // Success
    }

    if now_unix >= state.resurrection_trial_start + RESURRECTION_WINDOW_SECS {
        return Some(false); // Failure — slash sponsor
    }

    None // Still running
}
