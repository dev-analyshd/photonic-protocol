/// PHOTONIC Core — SAIP (Silent Auction Intent Pool) integration tests

use photonic_core::saip::{
    build_zk_commitment, verify_zk_reveal, score_bid, run_auction,
    Intent, Bid, PrivacyMode,
};

fn sample_intent(max_cost_wei: u128) -> Intent {
    Intent {
        intent_id: [1u8; 32],
        task_description: Some("Analyze market data and generate trading signals".to_string()),
        intent_hash: [2u8; 32],
        max_cost_wei,
        deadline_unix: 9_999_999_999,
        quality_floor: 0.5,
        privacy_mode: PrivacyMode::Public,
    }
}

fn sample_bid(price_wei: u128, bpd_q: f64, diversity: f64, composability: f64) -> Bid {
    Bid {
        agent_id: "0xAgent".to_string(),
        genome_hash: [3u8; 32],
        price_quote_wei: price_wei,
        bpd_sample: [4u8; 32],
        diversity_score: diversity,
        compositional_fitness: composability,
    }
}

#[test]
fn test_zk_commitment_reveal_roundtrip() {
    let task = "Analyze Q4 financial data and produce a summary";
    let preimage = build_zk_commitment(task);

    assert_ne!(preimage.nonce, [0u8; 32], "Nonce should be random");
    assert_eq!(preimage.task_description, task);

    verify_zk_reveal(task, &preimage.nonce, &preimage.intent_hash)
        .expect("Valid reveal should pass");
}

#[test]
fn test_zk_commitment_invalid_reveal_fails() {
    let preimage = build_zk_commitment("Real task");
    let result = verify_zk_reveal("Wrong task", &preimage.nonce, &preimage.intent_hash);
    assert!(result.is_err(), "Wrong task should fail ZK verification");
}

#[test]
fn test_zk_commitment_nonce_changes_hash() {
    let c1 = build_zk_commitment("Same task");
    let c2 = build_zk_commitment("Same task");
    assert_ne!(c1.intent_hash, c2.intent_hash, "Different nonces should produce different hashes");
    assert_ne!(c1.intent_id, c2.intent_id);
}

#[test]
fn test_score_bid_formula() {
    let intent = sample_intent(1_000_000_000_000_000_000); // 1 ETH max
    // bid at 50% of max cost
    let bid = sample_bid(500_000_000_000_000_000, 0.0, 0.0, 0.0);
    let bpd_quality = 0.8;

    // Score = 0.8*0.4 + 0.5*0.3 + 0.0*0.2 + 0.0*0.1 = 0.32 + 0.15 = 0.47
    let score = score_bid(&bid, &intent, bpd_quality);
    let expected = 0.8 * 0.4 + 0.5 * 0.3;
    assert!((score - expected).abs() < 1e-9, "Score mismatch: got {}, expected {}", score, expected);
}

#[test]
fn test_score_bid_all_components() {
    let intent = sample_intent(1_000_000_000_000_000_000);
    // bid at 20% of max = 80% price efficiency
    let bid = sample_bid(200_000_000_000_000_000, 0.0, 0.6, 0.4);
    let bpd_quality = 0.9;

    // Score = 0.9*0.4 + 0.8*0.3 + 0.4*0.2 + 0.6*0.1
    let expected = 0.9 * 0.4 + 0.8 * 0.3 + 0.4 * 0.2 + 0.6 * 0.1;
    let score = score_bid(&bid, &intent, bpd_quality);
    assert!((score - expected).abs() < 1e-9);
}

#[test]
fn test_auction_sorts_descending() {
    let intent = sample_intent(1_000_000_000_000_000_000);
    let bids = vec![
        sample_bid(900_000_000_000_000_000, 0.0, 0.3, 0.3), // low score (expensive + low quality)
        sample_bid(100_000_000_000_000_000, 0.0, 0.8, 0.7), // high score (cheap + high quality)
        sample_bid(500_000_000_000_000_000, 0.0, 0.5, 0.5), // medium
    ];
    let qualities = vec![0.5, 0.9, 0.7];

    let scored = run_auction(bids, &intent, qualities).unwrap();
    assert_eq!(scored.len(), 3);

    // Should be sorted descending
    for i in 0..scored.len() - 1 {
        assert!(
            scored[i].score >= scored[i + 1].score,
            "Auction results should be sorted descending"
        );
    }
    // Best bid should be the cheap + high quality one
    assert_eq!(scored[0].bid.price_quote_wei, 100_000_000_000_000_000);
}

#[test]
fn test_auction_empty_bids_returns_error() {
    let intent = sample_intent(1_000_000_000_000_000_000);
    let result = run_auction(vec![], &intent, vec![]);
    assert!(result.is_err(), "Empty bids should return error");
}

#[test]
fn test_score_bid_above_max_cost_is_negative() {
    let intent = sample_intent(1_000_000_000_000_000_000);
    // Bid above max cost → negative price efficiency → clamped to 0
    let bid = sample_bid(2_000_000_000_000_000_000, 0.0, 0.0, 0.0);
    let score = score_bid(&bid, &intent, 0.5);
    // bpd_quality * 0.4 + 0 (clamped) + 0 + 0 = 0.2
    assert_eq!(score, 0.5 * 0.4);
}
