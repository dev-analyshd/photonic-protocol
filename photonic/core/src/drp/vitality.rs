/// DRP Vitality — V(t) computation.
/// V(t) = α·BPD_quality + β·compositional + γ·surplus + δ·diversity + ε·vouches
/// Weights: α=0.30, β=0.25, γ=0.25, δ=0.10, ε=0.10
pub use super::{
    compute_vitality,
    dynamic_threshold,
    apply_decay,
    record_bpd,
    VitalityState,
    ALPHA, BETA, GAMMA, DELTA, EPSILON,
    V_DEATH_DEFAULT, V_MAX_MATURE,
};
