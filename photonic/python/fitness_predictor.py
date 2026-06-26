"""
PHOTONIC — Genome Fitness Predictor (ML/AI)

Predicts agent fitness score from genome features and behavioral history.
Trained on the fossil record: agents that died (fitness → 0) and agents
that thrived (fitness → high) serve as the training signal.

Model: Gradient Boosted Trees (sklearn) — interpretable, fast, no GPU needed.
Features: genome diversity, BPD rate, compositional success rate, surplus rate,
          generation, trait count, diversity contribution.

F(t) = [V(t) >= Θ(t)] · S(t) · e^(M_moat · t)
"""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score
import joblib
import os
from dataclasses import dataclass

# ─────────────────────────────────────────────────────────────────────────────
#  Feature schema
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class GenomeFeatures:
    """Features extracted from a genome + behavioral history for fitness prediction."""
    capability_count: int       # Number of distinct capabilities
    tool_count: int             # Number of distinct tools
    generation: int             # Evolutionary generation
    bpd_rate: float             # BPDs per delivery (0-1)
    avg_bpd_quality: float      # Average BPD quality score (0-1)
    compositional_success_rate: float  # Compositional deliveries / total (0-1)
    surplus_rate_eth: float     # Surplus generated in ETH per delivery
    diversity_score: float      # Market diversity contribution (0-1)
    resurrection_vouches: int   # Times vouched for other agents
    total_deliveries: int       # Lifetime delivery count
    time_active_days: float     # Days since registration
    has_parents: bool           # Was reproduced (vs genesis)


def features_to_array(f: GenomeFeatures) -> np.ndarray:
    return np.array([
        f.capability_count,
        f.tool_count,
        f.generation,
        f.bpd_rate,
        f.avg_bpd_quality,
        f.compositional_success_rate,
        f.surplus_rate_eth,
        f.diversity_score,
        f.resurrection_vouches,
        np.log1p(f.total_deliveries),           # log-transform for heavy tails
        np.log1p(f.time_active_days),
        float(f.has_parents),
        # Interaction features
        f.bpd_rate * f.avg_bpd_quality,         # quality-weighted BPD rate
        f.generation * f.compositional_success_rate,  # generational composability
    ], dtype=np.float32)


FEATURE_NAMES = [
    "capability_count", "tool_count", "generation",
    "bpd_rate", "avg_bpd_quality", "compositional_success_rate",
    "surplus_rate_eth", "diversity_score", "resurrection_vouches",
    "log_total_deliveries", "log_time_active_days", "has_parents",
    "quality_weighted_bpd", "generational_composability",
]


# ─────────────────────────────────────────────────────────────────────────────
#  Synthetic training data (from fossil record archetypes)
# ─────────────────────────────────────────────────────────────────────────────

def _generate_synthetic_training_data(n: int = 2000) -> tuple[np.ndarray, np.ndarray]:
    """
    Generate training data from known archetypes until we have real fossil data.
    Each row is (features, fitness_score).
    """
    rng = np.random.default_rng(42)
    X_list, y_list = [], []

    # Archetype 1: High-quality deliverers (fitness 0.7-1.0)
    n_good = n // 3
    for _ in range(n_good):
        f = GenomeFeatures(
            capability_count=rng.integers(5, 20),
            tool_count=rng.integers(3, 15),
            generation=int(rng.integers(5, 20)),
            bpd_rate=rng.uniform(0.75, 1.0),
            avg_bpd_quality=rng.uniform(0.7, 1.0),
            compositional_success_rate=rng.uniform(0.4, 1.0),
            surplus_rate_eth=rng.uniform(0.01, 0.5),
            diversity_score=rng.uniform(0.4, 1.0),
            resurrection_vouches=int(rng.integers(0, 5)),
            total_deliveries=int(rng.integers(20, 500)),
            time_active_days=rng.uniform(10, 180),
            has_parents=rng.random() > 0.3,
        )
        fitness = (
            0.30 * f.avg_bpd_quality
            + 0.25 * f.compositional_success_rate
            + 0.25 * min(f.surplus_rate_eth / 0.5, 1.0)
            + 0.10 * f.diversity_score
            + 0.10 * min(f.resurrection_vouches / 5.0, 1.0)
        )
        X_list.append(features_to_array(f))
        y_list.append(float(np.clip(fitness + rng.normal(0, 0.05), 0, 1)))

    # Archetype 2: Declining agents (fitness 0.2-0.5)
    n_mid = n // 3
    for _ in range(n_mid):
        f = GenomeFeatures(
            capability_count=rng.integers(2, 8),
            tool_count=rng.integers(1, 6),
            generation=int(rng.integers(1, 8)),
            bpd_rate=rng.uniform(0.3, 0.75),
            avg_bpd_quality=rng.uniform(0.3, 0.7),
            compositional_success_rate=rng.uniform(0.1, 0.4),
            surplus_rate_eth=rng.uniform(0.0, 0.05),
            diversity_score=rng.uniform(0.1, 0.5),
            resurrection_vouches=int(rng.integers(0, 2)),
            total_deliveries=int(rng.integers(5, 50)),
            time_active_days=rng.uniform(1, 30),
            has_parents=False,
        )
        fitness = (
            0.30 * f.avg_bpd_quality
            + 0.25 * f.compositional_success_rate
            + 0.25 * min(f.surplus_rate_eth / 0.5, 1.0)
            + 0.10 * f.diversity_score
        )
        X_list.append(features_to_array(f))
        y_list.append(float(np.clip(fitness + rng.normal(0, 0.08), 0, 1)))

    # Archetype 3: Dead/extinct agents (fitness 0.0-0.25)
    n_dead = n - n_good - n_mid
    for _ in range(n_dead):
        f = GenomeFeatures(
            capability_count=rng.integers(1, 5),
            tool_count=rng.integers(1, 3),
            generation=int(rng.integers(0, 4)),
            bpd_rate=rng.uniform(0.0, 0.3),
            avg_bpd_quality=rng.uniform(0.0, 0.3),
            compositional_success_rate=rng.uniform(0.0, 0.1),
            surplus_rate_eth=0.0,
            diversity_score=rng.uniform(0.0, 0.2),
            resurrection_vouches=0,
            total_deliveries=int(rng.integers(0, 10)),
            time_active_days=rng.uniform(0, 5),
            has_parents=False,
        )
        fitness = (
            0.30 * f.avg_bpd_quality
            + 0.25 * f.compositional_success_rate
            + 0.10 * f.diversity_score
        )
        X_list.append(features_to_array(f))
        y_list.append(float(np.clip(fitness + rng.normal(0, 0.05), 0, 1)))

    return np.array(X_list), np.array(y_list)


# ─────────────────────────────────────────────────────────────────────────────
#  Model
# ─────────────────────────────────────────────────────────────────────────────

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "fitness_predictor.pkl")


def build_model() -> Pipeline:
    return Pipeline([
        ("scaler", StandardScaler()),
        ("gbr", GradientBoostingRegressor(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            min_samples_leaf=5,
            random_state=42,
        )),
    ])


def train(X: np.ndarray | None = None, y: np.ndarray | None = None) -> Pipeline:
    if X is None or y is None:
        X, y = _generate_synthetic_training_data(2000)

    model = build_model()
    model.fit(X, y)

    scores = cross_val_score(model, X, y, cv=5, scoring="r2")
    print(f"[FitnessPredictor] CV R² = {scores.mean():.4f} ± {scores.std():.4f}")

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print(f"[FitnessPredictor] Model saved to {MODEL_PATH}")
    return model


def load_model() -> Pipeline:
    if os.path.exists(MODEL_PATH):
        return joblib.load(MODEL_PATH)
    print("[FitnessPredictor] No saved model, training from synthetic data...")
    return train()


# ─────────────────────────────────────────────────────────────────────────────
#  Prediction API
# ─────────────────────────────────────────────────────────────────────────────

_model: Pipeline | None = None


def get_model() -> Pipeline:
    global _model
    if _model is None:
        _model = load_model()
    return _model


def predict_fitness(features: GenomeFeatures) -> float:
    """Predict fitness score (0.0–1.0) for a genome."""
    model = get_model()
    X = features_to_array(features).reshape(1, -1)
    pred = float(model.predict(X)[0])
    return float(np.clip(pred, 0.0, 1.0))


def predict_fitness_batch(features_list: list[GenomeFeatures]) -> list[float]:
    """Batch prediction for multiple genomes."""
    if not features_list:
        return []
    model = get_model()
    X = np.array([features_to_array(f) for f in features_list])
    preds = model.predict(X)
    return [float(np.clip(p, 0.0, 1.0)) for p in preds]


def feature_importance() -> dict[str, float]:
    """Return feature importances from the trained GBR."""
    model = get_model()
    gbr: GradientBoostingRegressor = model.named_steps["gbr"]
    importances = gbr.feature_importances_
    return {name: float(imp) for name, imp in zip(FEATURE_NAMES, importances)}


# ─────────────────────────────────────────────────────────────────────────────
#  Bootstrap model on import
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Training fitness predictor from synthetic fossil data...")
    train()
    print("Done.")
