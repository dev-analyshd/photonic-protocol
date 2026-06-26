/// PHOTONIC Core — DRP (Death & Resurrection Protocol) integration tests

use photonic_core::drp::{
    VitalityState, compute_vitality, dynamic_threshold, apply_decay,
    record_bpd, is_dead, begin_resurrection, check_resurrection_outcome,
    ALPHA, BETA, GAMMA, DELTA, EPSILON,
    V_DEATH_DEFAULT, V_MAX_MATURE,
    RESURRECTION_BPDS_REQUIRED, RESURRECTION_WINDOW_SECS,
};

fn new_agent_state() -> VitalityState {
    let mut s = VitalityState::default();
    s.last_decay_unix = 1_700_000_000;
    s
}

#[test]
fn test_default_vitality_is_25_percent() {
    let state = VitalityState::default();
    assert_eq!(state.vitality, 0.25);
}

#[test]
fn test_weight_constants_sum_to_one() {
    let sum = ALPHA + BETA + GAMMA + DELTA + EPSILON;
    assert!((sum - 1.0).abs() < 1e-10, "Weights must sum to 1.0, got {}", sum);
}

#[test]
fn test_compute_vitality_zero_deliveries() {
    let state = VitalityState::default();
    let v = compute_vitality(&state);
    assert_eq!(v, 0.25, "Agent with no deliveries should have 25% vitality");
}

#[test]
fn test_compute_vitality_after_deliveries() {
    let mut state = VitalityState::default();
    // Simulate 10 high-quality deliveries
    for _ in 0..10 {
        record_bpd(&mut state, 0.9, 100_000_000_000_000_000, true); // 0.1 ETH surplus
    }
    let v = compute_vitality(&state);
    assert!(v > 0.5, "High-quality provider should have >50% vitality, got {}", v);
    assert!(v <= 1.0, "Vitality should not exceed 1.0");
}

#[test]
fn test_dynamic_threshold_min_max() {
    let theta_min = dynamic_threshold(0.0);
    let theta_max = dynamic_threshold(1.0);
    assert!((theta_min - V_DEATH_DEFAULT).abs() < 1e-10);
    assert!((theta_max - V_MAX_MATURE).abs() < 1e-10);
}

#[test]
fn test_dynamic_threshold_monotone() {
    let t0 = dynamic_threshold(0.0);
    let t50 = dynamic_threshold(0.5);
    let t100 = dynamic_threshold(1.0);
    assert!(t0 < t50 && t50 < t100, "Threshold should be monotonically increasing");
}

#[test]
fn test_is_dead_low_vitality() {
    let mut state = VitalityState::default();
    state.vitality = 0.05; // Below 0.20 default threshold
    assert!(is_dead(&state, 0.0), "Agent with 5% vitality should be dead at M=0");
}

#[test]
fn test_is_dead_high_vitality() {
    let mut state = VitalityState::default();
    state.vitality = 0.80;
    assert!(!is_dead(&state, 0.0), "Agent with 80% vitality should not be dead");
}

#[test]
fn test_apply_decay_reduces_vitality() {
    let mut state = new_agent_state();
    state.vitality = 0.8;
    // Simulate 1 interval of decay with lambda=0.05 and BPD rate=0
    apply_decay(&mut state, 1_700_000_000 + 86400, 86400, 0.05);
    assert!(state.vitality < 0.8, "Decay should reduce vitality");
    assert!(state.vitality >= 0.0, "Vitality should not go below 0");
}

#[test]
fn test_apply_decay_no_decay_within_interval() {
    let mut state = new_agent_state();
    state.vitality = 0.8;
    // Same timestamp — no decay
    apply_decay(&mut state, 1_700_000_000 + 3600, 86400, 0.05);
    assert_eq!(state.vitality, 0.8, "No decay should occur within the interval");
}

#[test]
fn test_record_bpd_updates_accumulators() {
    let mut state = VitalityState::default();
    record_bpd(&mut state, 0.85, 500_000_000_000_000_000, false);
    assert_eq!(state.total_bpds, 1);
    assert_eq!(state.total_deliveries, 1);
    assert!((state.bpd_quality_accum - 0.85).abs() < 1e-10);
    assert_eq!(state.surplus_accum_wei, 500_000_000_000_000_000);
    assert_eq!(state.compositional_successes, 0);
}

#[test]
fn test_record_bpd_compositional_increments() {
    let mut state = VitalityState::default();
    record_bpd(&mut state, 0.8, 0, true);
    assert_eq!(state.compositional_successes, 1);
}

#[test]
fn test_resurrection_trial_lifecycle() {
    let mut state = VitalityState::default();
    state.vitality = 0.0; // dead

    // Begin resurrection
    let start = 1_700_000_000u64;
    begin_resurrection(&mut state, "0xSponsor", start).unwrap();
    assert!(state.in_resurrection_trial);
    assert_eq!(state.resurrection_bpd_count, 0);
    assert_eq!(state.vitality, 0.25, "Resurrection boosts vitality to 25%");

    // Deliver required BPDs
    for _ in 0..RESURRECTION_BPDS_REQUIRED {
        record_bpd(&mut state, 0.7, 0, false);
    }
    assert_eq!(state.resurrection_bpd_count, RESURRECTION_BPDS_REQUIRED);

    let outcome = check_resurrection_outcome(&state, start + 1000);
    assert_eq!(outcome, Some(true), "Should succeed with enough BPDs");
}

#[test]
fn test_resurrection_timeout_fails() {
    let mut state = VitalityState::default();
    let start = 1_700_000_000u64;
    begin_resurrection(&mut state, "0xSponsor", start).unwrap();
    // Don't deliver any BPDs
    let outcome = check_resurrection_outcome(&state, start + RESURRECTION_WINDOW_SECS + 1);
    assert_eq!(outcome, Some(false), "Should fail on timeout");
}

#[test]
fn test_resurrection_not_started_returns_none() {
    let state = VitalityState::default();
    let outcome = check_resurrection_outcome(&state, 1_700_000_000);
    assert_eq!(outcome, None, "No trial in progress should return None");
}
