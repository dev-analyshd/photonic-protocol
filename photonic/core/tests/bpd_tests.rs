/// PHOTONIC Core — BPD integration tests

use photonic_core::bpd::{build_bpd, verify_bpd, build_merkle_root, BPD};
use photonic_core::bpd::{ExecutionStep, StepType};

fn sample_steps() -> Vec<ExecutionStep> {
    vec![
        ExecutionStep {
            step_id: "step-1".to_string(),
            step_type: StepType::LlmInference,
            input: serde_json::json!({"prompt": "analyze this data"}),
            output: serde_json::json!({"response": "analysis complete"}),
            timestamp_ms: 1700000000000,
        },
        ExecutionStep {
            step_id: "step-2".to_string(),
            step_type: StepType::ExternalApi,
            input: serde_json::json!({"url": "https://api.example.com/data"}),
            output: serde_json::json!({"status": 200, "data": [1, 2, 3]}),
            timestamp_ms: 1700000001000,
        },
        ExecutionStep {
            step_id: "step-3".to_string(),
            step_type: StepType::Computation,
            input: serde_json::json!({"values": [1, 2, 3]}),
            output: serde_json::json!({"sum": 6, "avg": 2.0}),
            timestamp_ms: 1700000002000,
        },
    ]
}

#[test]
fn test_build_bpd_produces_valid_hash() {
    let bpd = build_bpd(
        "Analyze quarterly revenue and produce forecast",
        "Forecast complete: Q4 revenue projected at $2.3M with 15% YoY growth",
        sample_steps(),
        "0xProviderAddress",
    );
    // BPD hash should be non-zero
    assert_ne!(bpd.bpd_hash, [0u8; 32]);
    // BPD ID should be non-zero
    assert_ne!(bpd.bpd_id, [0u8; 32]);
    // Merkle root should be non-zero for non-empty trace
    assert_ne!(bpd.merkle_root, [0u8; 32]);
    // Provider field should be set
    assert_eq!(bpd.provider, "0xProviderAddress");
    // Trace should contain all steps
    assert_eq!(bpd.execution_trace.len(), 3);
}

#[test]
fn test_verify_bpd_passes_for_valid_bpd() {
    let bpd = build_bpd(
        "Research task",
        "Research complete",
        sample_steps(),
        "0xProvider",
    );
    verify_bpd(&bpd).expect("Valid BPD should pass verification");
}

#[test]
fn test_verify_bpd_fails_for_tampered_hash() {
    let mut bpd = build_bpd(
        "Research task",
        "Research complete",
        sample_steps(),
        "0xProvider",
    );
    // Tamper with the output after building
    bpd.output = "tampered output".to_string();
    // Re-hashing should fail verification since bpd_hash is now wrong
    let result = verify_bpd(&bpd);
    assert!(result.is_err(), "Tampered BPD should fail verification");
}

#[test]
fn test_verify_bpd_fails_for_tampered_merkle_root() {
    let mut bpd = build_bpd(
        "Research task",
        "Research complete",
        sample_steps(),
        "0xProvider",
    );
    bpd.merkle_root = [0u8; 32]; // Zero out Merkle root
    // bpd_hash was built with original merkle_root, so this should fail
    let result = verify_bpd(&bpd);
    assert!(result.is_err(), "Tampered Merkle root should fail verification");
}

#[test]
fn test_merkle_root_empty_trace() {
    let root = build_merkle_root(&[]);
    // Empty tree should produce zero root
    assert_eq!(root, [0u8; 32]);
}

#[test]
fn test_merkle_root_single_leaf() {
    let leaf = [1u8; 32];
    let root = build_merkle_root(&[leaf]);
    assert_eq!(root, leaf);
}

#[test]
fn test_merkle_root_deterministic() {
    let leaves = vec![[1u8; 32], [2u8; 32], [3u8; 32]];
    let root1 = build_merkle_root(&leaves);
    let root2 = build_merkle_root(&leaves);
    assert_eq!(root1, root2, "Merkle root should be deterministic");
}

#[test]
fn test_merkle_root_changes_with_different_input() {
    let leaves_a = vec![[1u8; 32], [2u8; 32]];
    let leaves_b = vec![[1u8; 32], [3u8; 32]];
    let root_a = build_merkle_root(&leaves_a);
    let root_b = build_merkle_root(&leaves_b);
    assert_ne!(root_a, root_b);
}

#[test]
fn test_bpd_unique_id_per_build() {
    let bpd1 = build_bpd("Task", "Output", sample_steps(), "0xProv");
    let bpd2 = build_bpd("Task", "Output", sample_steps(), "0xProv");
    // IDs differ due to nonce
    assert_ne!(bpd1.bpd_id, bpd2.bpd_id);
}

#[test]
fn test_bpd_empty_trace() {
    let bpd = build_bpd("Simple task", "Done", vec![], "0xProv");
    verify_bpd(&bpd).expect("BPD with empty trace should still verify");
    assert_eq!(bpd.merkle_root, [0u8; 32]);
}
