/// PHOTONIC Core — Genome (Compositional Genetics) integration tests

use photonic_core::genome::{
    build_genome, merge_genomes, compute_agent_fitness, hash_genome,
    update_behavioral_history, GenomeInput,
};

fn sample_input_a() -> GenomeInput {
    GenomeInput {
        capabilities: vec!["research".to_string(), "summarize".to_string(), "web_search".to_string()],
        tools: vec!["browser".to_string(), "pdf_reader".to_string()],
        prompt_arch_description: "Research and summarization agent".to_string(),
        parent_a: None,
        parent_b: None,
    }
}

fn sample_input_b() -> GenomeInput {
    GenomeInput {
        capabilities: vec!["code_gen".to_string(), "test".to_string(), "deploy".to_string()],
        tools: vec!["python_repl".to_string(), "git".to_string()],
        prompt_arch_description: "Code generation and deployment agent".to_string(),
        parent_a: None,
        parent_b: None,
    }
}

#[test]
fn test_build_genome_produces_valid_roots() {
    let input = sample_input_a();
    let genome = build_genome(&input, 1);
    assert_ne!(genome.capability_root, [0u8; 32]);
    assert_ne!(genome.tool_root, [0u8; 32]);
    assert_ne!(genome.prompt_arch_hash, [0u8; 32]);
    assert_eq!(genome.generation, 1);
    assert_eq!(genome.fitness_score, 0.0);
}

#[test]
fn test_genome_hash_deterministic() {
    let input = sample_input_a();
    let genome = build_genome(&input, 1);
    let h1 = hash_genome(&genome);
    let h2 = hash_genome(&genome);
    assert_eq!(h1, h2, "Genome hash should be deterministic");
}

#[test]
fn test_different_genomes_have_different_hashes() {
    let g1 = build_genome(&sample_input_a(), 1);
    let g2 = build_genome(&sample_input_b(), 1);
    assert_ne!(hash_genome(&g1), hash_genome(&g2));
}

#[test]
fn test_merge_genomes_takes_union_of_capabilities() {
    let input_a = sample_input_a();
    let input_b = sample_input_b();
    let offspring = merge_genomes(&input_a, &input_b, 0.8, 0.9, 0.3).unwrap();

    // All capabilities from both parents should be present
    for cap in &input_a.capabilities {
        assert!(offspring.capabilities.contains(cap), "Missing capability: {}", cap);
    }
    for cap in &input_b.capabilities {
        assert!(offspring.capabilities.contains(cap), "Missing capability: {}", cap);
    }
    // No duplicates
    let unique: std::collections::HashSet<_> = offspring.capabilities.iter().collect();
    assert_eq!(unique.len(), offspring.capabilities.len(), "Offspring should have no duplicate capabilities");
}

#[test]
fn test_merge_genomes_union_of_tools() {
    let input_a = sample_input_a();
    let input_b = sample_input_b();
    let offspring = merge_genomes(&input_a, &input_b, 0.8, 0.9, 0.3).unwrap();
    for tool in &input_a.tools {
        assert!(offspring.tools.contains(tool));
    }
    for tool in &input_b.tools {
        assert!(offspring.tools.contains(tool));
    }
}

#[test]
fn test_merge_fails_if_fitness_below_threshold() {
    let input_a = sample_input_a();
    let input_b = sample_input_b();
    let result = merge_genomes(&input_a, &input_b, 0.2, 0.9, 0.5);
    assert!(result.is_err(), "Should fail when parent A has low fitness");

    let result2 = merge_genomes(&input_a, &input_b, 0.9, 0.1, 0.5);
    assert!(result2.is_err(), "Should fail when parent B has low fitness");
}

#[test]
fn test_merge_blends_prompt_arch() {
    let input_a = sample_input_a();
    let input_b = sample_input_b();
    let offspring = merge_genomes(&input_a, &input_b, 0.8, 0.9, 0.3).unwrap();
    // Prompt arch should contain both descriptions joined by ⊗
    assert!(offspring.prompt_arch_description.contains("⊗"));
    assert!(offspring.prompt_arch_description.contains(&input_a.prompt_arch_description));
    assert!(offspring.prompt_arch_description.contains(&input_b.prompt_arch_description));
}

#[test]
fn test_compute_agent_fitness_dead_agent_returns_zero() {
    // V < Θ → F = 0
    let f = compute_agent_fitness(0.1, 0.3, 100.0, 0.5, 1.0);
    assert_eq!(f, 0.0, "Dead agent (V < Θ) should have zero fitness");
}

#[test]
fn test_compute_agent_fitness_alive_agent() {
    // V >= Θ → F = S * e^(M * t)
    let f = compute_agent_fitness(0.8, 0.3, 10.0, 0.1, 5.0);
    let expected = 10.0 * (0.1 * 5.0f64).exp();
    assert!((f - expected).abs() < 1e-9);
}

#[test]
fn test_compute_agent_fitness_increases_with_moat() {
    let f1 = compute_agent_fitness(0.8, 0.3, 10.0, 0.0, 10.0);  // no moat
    let f2 = compute_agent_fitness(0.8, 0.3, 10.0, 0.3, 10.0);  // with moat
    assert!(f2 > f1, "Moat factor should increase fitness");
}

#[test]
fn test_update_behavioral_history_changes_root() {
    let input = sample_input_a();
    let mut genome = build_genome(&input, 1);
    let initial_root = genome.behavioral_history_root;

    let bpd_hash = [42u8; 32];
    update_behavioral_history(&mut genome, &bpd_hash);

    assert_ne!(genome.behavioral_history_root, initial_root);
    // Second update should change again
    let mid_root = genome.behavioral_history_root;
    update_behavioral_history(&mut genome, &[7u8; 32]);
    assert_ne!(genome.behavioral_history_root, mid_root);
}
