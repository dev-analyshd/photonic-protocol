/// SAIP Scorer — bid scoring function.
/// Score = (bpd_quality × 0.4) + (price_efficiency × 0.3)
///       + (compositional_fitness × 0.2) + (diversity_bonus × 0.1)
pub use super::score_bid;
