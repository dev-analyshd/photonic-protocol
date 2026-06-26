/// PHOTONIC Core CLI — protocol engine demo
use photonic_core::{bpd, genome, saip, casc, drp};
use serde_json::json;

fn main() {
    println!("═══════════════════════════════════════════════════════");
    println!("  PHOTONIC — Self-Evolving Agent Commerce Protocol");
    println!("  Core Engine v0.1.0");
    println!("═══════════════════════════════════════════════════════\n");

    // 1. Build agent genome
    println!("[1] Building agent genome...");
    let genome_input = genome::GenomeInput {
        capabilities: vec![
            "defi_research".to_string(),
            "yield_analysis".to_string(),
            "risk_assessment".to_string(),
        ],
        tools: vec![
            "web_search".to_string(),
            "dex_api".to_string(),
            "price_oracle".to_string(),
        ],
        prompt_arch_description: "Chain-of-thought DeFi analyst with quantitative reasoning".to_string(),
        parent_a: None,
        parent_b: None,
    };
    let agent_genome = genome::build_genome(&genome_input, 0);
    let genome_hash = genome::hash_genome(&agent_genome);
    println!("  Genome hash: 0x{}", hex::encode(genome_hash));
    println!("  Generation: {}", agent_genome.generation);

    // 2. Build ZK intent commitment
    println!("\n[2] Building ZK intent commitment...");
    let task = "Research the top 5 DeFi yield opportunities on Arbitrum with >10% APY and <medium risk";
    let zk_intent = saip::build_zk_commitment(task);
    println!("  Intent hash: 0x{}", hex::encode(zk_intent.intent_hash));
    println!("  Task hidden from agents until reveal.");

    // 3. Submit bids (simulated)
    println!("\n[3] Simulating silent auction bids...");
    let intent = saip::Intent {
        intent_id: zk_intent.intent_id,
        task_description: None,
        intent_hash: zk_intent.intent_hash,
        max_cost_wei: 100_000_000_000_000_000, // 0.1 ETH
        deadline_unix: 9999999999,
        quality_floor: 0.7,
        privacy_mode: saip::PrivacyMode::ZkCommitment,
    };

    let bids = vec![
        saip::Bid {
            agent_id: "agent_alpha".to_string(),
            genome_hash: [1u8; 32],
            price_quote_wei: 80_000_000_000_000_000,
            bpd_sample: [2u8; 32],
            diversity_score: 0.8,
            compositional_fitness: 0.9,
        },
        saip::Bid {
            agent_id: "agent_beta".to_string(),
            genome_hash: [3u8; 32],
            price_quote_wei: 50_000_000_000_000_000,
            bpd_sample: [4u8; 32],
            diversity_score: 0.6,
            compositional_fitness: 0.7,
        },
    ];

    let scored = saip::run_auction(bids, &intent, vec![0.85, 0.70]).unwrap();
    println!("  Auction results:");
    for (i, sb) in scored.iter().enumerate() {
        println!("    #{}: {} — score: {:.4}", i + 1, sb.bid.agent_id, sb.score);
    }

    // 4. Generate BPD
    println!("\n[4] Generating Behavioral Proof of Delivery...");
    let steps = vec![
        bpd::ExecutionStep {
            step_id: "step_1".to_string(),
            step_type: bpd::StepType::ExternalApi,
            input: json!({"endpoint": "defillama.com/protocols"}),
            output: json!({"count": 200, "status": "ok"}),
            timestamp_ms: 1000,
        },
        bpd::ExecutionStep {
            step_id: "step_2".to_string(),
            step_type: bpd::StepType::LlmInference,
            input: json!({"prompt": "Filter protocols by APY > 10%"}),
            output: json!({"protocols": ["aave", "compound", "curve"]}),
            timestamp_ms: 2000,
        },
        bpd::ExecutionStep {
            step_id: "step_3".to_string(),
            step_type: bpd::StepType::Computation,
            input: json!({"action": "risk_score"}),
            output: json!({"scores": [0.3, 0.4, 0.2]}),
            timestamp_ms: 3000,
        },
    ];

    let output = "Top 5 Arbitrum DeFi yields: 1. GMX 14.2% APY (low-med risk)...";
    let proof = bpd::generate_bpd(task, output, steps, "0xAGENT_ALPHA");
    let score = bpd::score_bpd(&proof);
    println!("  BPD ID:   0x{}", hex::encode(proof.bpd_id));
    println!("  BPD Hash: 0x{}", hex::encode(proof.bpd_hash));
    println!("  Quality score: {:.4}", score);

    // 5. Verify BPD
    println!("\n[5] Verifying BPD (peer re-execution)...");
    match bpd::verify_bpd(&proof) {
        Ok(_) => println!("  ✓ BPD verified — consensus reached"),
        Err(e) => println!("  ✗ BPD failed: {}", e),
    }

    // 6. DRP vitality
    println!("\n[6] Computing agent vitality (DRP)...");
    let mut vitality = drp::VitalityState::default();
    drp::record_bpd(&mut vitality, score, 20_000_000_000_000_000u128, false);
    drp::record_bpd(&mut vitality, 0.82, 15_000_000_000_000_000u128, true);
    println!("  Vitality: {:.4}", drp::compute_vitality(&vitality));
    println!("  Above threshold (genesis): {}", !drp::is_dead(&vitality, 0.0));
    println!("  Total BPDs: {}", vitality.total_bpds);

    println!("\n═══════════════════════════════════════════════════════");
    println!("  PHOTONIC Core OK — all primitives operational");
    println!("═══════════════════════════════════════════════════════");
}
