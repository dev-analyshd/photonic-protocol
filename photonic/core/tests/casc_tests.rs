/// PHOTONIC Core — CASC (Cross-Agent State Capsule) integration tests

use photonic_core::casc::{
    build_casc, generate_session_key, is_casc_fresh, can_access, hash_casc,
    CASCInput,
};

fn sample_casc_input() -> CASCInput {
    let session_key = generate_session_key();
    CASCInput {
        state_fragments: vec![
            serde_json::json!({"context": "user intent: generate a trading strategy"}),
            serde_json::json!({"memory": {"market": "crypto", "risk_tolerance": "medium"}}),
        ],
        session_key,
        max_age_secs: 3600,
        provider: "0xProviderAgent".to_string(),
        previous_casc_hash: None,
        access_policy: vec!["0xAgentB".to_string(), "0xAgentC".to_string()],
    }
}

#[test]
fn test_build_casc_produces_commitments() {
    let input = sample_casc_input();
    let casc = build_casc(input);
    assert_eq!(casc.encrypted_fragments.len(), 2);
    assert_ne!(casc.session_key_commitment, [0u8; 32]);
    assert_eq!(casc.continuity_proof, [0u8; 32], "No previous CASC → zero continuity proof");
    assert_eq!(casc.access_policy.len(), 2);
}

#[test]
fn test_build_casc_with_previous_hash() {
    let prev_hash = [42u8; 32];
    let mut input = sample_casc_input();
    input.previous_casc_hash = Some(prev_hash);
    let casc = build_casc(input);
    // Continuity proof should be non-zero when chained
    assert_ne!(casc.continuity_proof, [0u8; 32]);
}

#[test]
fn test_casc_fresh_passes_within_max_age() {
    let input = sample_casc_input();
    let casc = build_casc(input);
    is_casc_fresh(&casc).expect("Freshly built CASC should pass freshness check");
}

#[test]
fn test_casc_stale_fails_after_expiry() {
    let mut input = sample_casc_input();
    input.max_age_secs = 0; // 0 seconds = immediately stale
    let mut casc = build_casc(input);
    // Make it appear old by setting timestamp far in the past
    casc.timestamp_unix = 0;
    let result = is_casc_fresh(&casc);
    assert!(result.is_err(), "Stale CASC should fail freshness check");
}

#[test]
fn test_can_access_allowed_agent() {
    let input = sample_casc_input();
    let casc = build_casc(input);
    can_access(&casc, "0xAgentB").expect("Allowed agent should have access");
}

#[test]
fn test_can_access_case_insensitive() {
    let input = sample_casc_input();
    let casc = build_casc(input);
    can_access(&casc, "0XAGENTB").expect("Access check should be case-insensitive");
}

#[test]
fn test_can_access_denied_for_unknown_agent() {
    let input = sample_casc_input();
    let casc = build_casc(input);
    let result = can_access(&casc, "0xUnknownAgent");
    assert!(result.is_err(), "Unknown agent should be denied access");
}

#[test]
fn test_hash_casc_is_deterministic() {
    let input = sample_casc_input();
    let casc = build_casc(input);
    let h1 = hash_casc(&casc);
    let h2 = hash_casc(&casc);
    assert_eq!(h1, h2, "CASC hash should be deterministic");
}

#[test]
fn test_hash_casc_differs_across_capsules() {
    let input_a = sample_casc_input();
    let input_b = sample_casc_input(); // Different session key
    let casc_a = build_casc(input_a);
    let casc_b = build_casc(input_b);
    assert_ne!(hash_casc(&casc_a), hash_casc(&casc_b));
}

#[test]
fn test_session_key_is_random() {
    let k1 = generate_session_key();
    let k2 = generate_session_key();
    assert_ne!(k1, k2, "Session keys should be random");
    assert_ne!(k1, [0u8; 32], "Session key should not be all zeros");
}

#[test]
fn test_encrypted_fragments_differ_by_content() {
    let mut input = sample_casc_input();
    input.state_fragments = vec![
        serde_json::json!({"data": "fragment_one"}),
        serde_json::json!({"data": "fragment_two"}),
    ];
    let casc = build_casc(input);
    assert_ne!(
        casc.encrypted_fragments[0], casc.encrypted_fragments[1],
        "Different fragments should produce different encrypted outputs"
    );
}

#[test]
fn test_empty_state_fragments() {
    let mut input = sample_casc_input();
    input.state_fragments = vec![];
    let casc = build_casc(input);
    assert_eq!(casc.encrypted_fragments.len(), 0);
}
