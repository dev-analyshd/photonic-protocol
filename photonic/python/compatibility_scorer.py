"""
PHOTONIC — Compositional Compatibility Scorer (ML/AI)

Scores how well two agents can compose together for a workflow.
Used by SAIP to prefer compositionally fit agent pairs.

Score = P(successful_composition | genome_A, genome_B, intent)

Features:
- Jaccard similarity of capability sets
- Jaccard similarity of tool sets
- Generation distance (close generations compose better)
- Fitness product (both agents need to be fit)
- Specialization overlap (avoid redundancy)
- Historical composition success rate between similar genomes
"""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import RandomForestClassifier
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
class AgentProfile:
    """Lightweight profile for compatibility scoring."""
    capabilities: set[str]
    tools: set[str]
    generation: int
    fitness_score: float
    bpd_rate: float
    diversity_score: float
    total_deliveries: int


@dataclass
class CompatibilityFeatures:
    capability_jaccard: float       # |A∩B| / |A∪B| for capabilities
    tool_jaccard: float             # |A∩B| / |A∪B| for tools
    capability_complement: float    # |A\B| + |B\A| — unique capabilities each brings
    tool_complement: float          # similar for tools
    generation_distance: float      # |gen_A - gen_B| (normalized)
    fitness_product: float          # fitness_A * fitness_B
    avg_bpd_rate: float             # (bpd_rate_A + bpd_rate_B) / 2
    diversity_product: float        # diversity_A * diversity_B
    delivery_volume_ratio: float    # min(deliveries) / max(deliveries)


def _jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 1.0
    union = a | b
    return len(a & b) / len(union)


def _complement_score(a: set, b: set) -> float:
    """Fraction of unique traits that complement (not overlap)."""
    total = len(a | b)
    if total == 0:
        return 0.0
    unique = len(a - b) + len(b - a)
    return unique / total


def compute_compatibility_features(
    agent_a: AgentProfile,
    agent_b: AgentProfile,
) -> CompatibilityFeatures:
    max_gen = max(agent_a.generation, agent_b.generation, 1)
    max_deliveries = max(agent_a.total_deliveries, agent_b.total_deliveries, 1)
    min_deliveries = min(agent_a.total_deliveries, agent_b.total_deliveries)

    return CompatibilityFeatures(
        capability_jaccard=_jaccard(agent_a.capabilities, agent_b.capabilities),
        tool_jaccard=_jaccard(agent_a.tools, agent_b.tools),
        capability_complement=_complement_score(agent_a.capabilities, agent_b.capabilities),
        tool_complement=_complement_score(agent_a.tools, agent_b.tools),
        generation_distance=abs(agent_a.generation - agent_b.generation) / max_gen,
        fitness_product=agent_a.fitness_score * agent_b.fitness_score,
        avg_bpd_rate=(agent_a.bpd_rate + agent_b.bpd_rate) / 2,
        diversity_product=agent_a.diversity_score * agent_b.diversity_score,
        delivery_volume_ratio=min_deliveries / max_deliveries,
    )


def features_to_array(f: CompatibilityFeatures) -> np.ndarray:
    return np.array([
        f.capability_jaccard,
        f.tool_jaccard,
        f.capability_complement,
        f.tool_complement,
        f.generation_distance,
        f.fitness_product,
        f.avg_bpd_rate,
        f.diversity_product,
        f.delivery_volume_ratio,
        # Interaction: high complement + high fitness = best compositions
        f.capability_complement * f.fitness_product,
        # Penalty for near-identical agents
        1.0 - f.capability_jaccard * f.tool_jaccard,
    ], dtype=np.float32)


FEATURE_NAMES = [
    "capability_jaccard", "tool_jaccard", "capability_complement",
    "tool_complement", "generation_distance", "fitness_product",
    "avg_bpd_rate", "diversity_product", "delivery_volume_ratio",
    "complement_fitness_interaction", "uniqueness_bonus",
]


# ─────────────────────────────────────────────────────────────────────────────
#  Synthetic training data
# ─────────────────────────────────────────────────────────────────────────────

def _generate_training_data(n: int = 1500) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(7)
    X_list, y_list = [], []

    caps_pool = [f"cap_{i}" for i in range(30)]
    tool_pool = [f"tool_{i}" for i in range(20)]

    for _ in range(n):
        def random_agent() -> AgentProfile:
            n_caps = rng.integers(2, 15)
            n_tools = rng.integers(1, 10)
            return AgentProfile(
                capabilities=set(rng.choice(caps_pool, size=n_caps, replace=False).tolist()),
                tools=set(rng.choice(tool_pool, size=n_tools, replace=False).tolist()),
                generation=int(rng.integers(0, 20)),
                fitness_score=float(rng.uniform(0.1, 1.0)),
                bpd_rate=float(rng.uniform(0.0, 1.0)),
                diversity_score=float(rng.uniform(0.0, 1.0)),
                total_deliveries=int(rng.integers(1, 300)),
            )

        a, b = random_agent(), random_agent()
        features = compute_compatibility_features(a, b)
        X = features_to_array(features)

        # Ground truth: successful composition = good complementarity + high fitness
        complement_value = features.capability_complement * 0.5 + features.tool_complement * 0.3
        fitness_value = features.fitness_product * 0.4
        quality_value = features.avg_bpd_rate * 0.3
        redundancy_penalty = features.capability_jaccard * 0.2

        prob_success = np.clip(
            complement_value + fitness_value + quality_value - redundancy_penalty,
            0, 1
        )
        y = int(rng.random() < prob_success)

        X_list.append(X)
        y_list.append(y)

    return np.array(X_list), np.array(y_list)


# ─────────────────────────────────────────────────────────────────────────────
#  Model
# ─────────────────────────────────────────────────────────────────────────────

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "compatibility_scorer.pkl")


def build_model() -> Pipeline:
    return Pipeline([
        ("scaler", StandardScaler()),
        ("rf", RandomForestClassifier(
            n_estimators=150,
            max_depth=6,
            min_samples_leaf=5,
            random_state=42,
            class_weight="balanced",
        )),
    ])


def train(X: np.ndarray | None = None, y: np.ndarray | None = None) -> Pipeline:
    if X is None or y is None:
        X, y = _generate_training_data(1500)

    model = build_model()
    model.fit(X, y)

    scores = cross_val_score(model, X, y, cv=5, scoring="roc_auc")
    print(f"[CompatibilityScorer] CV ROC-AUC = {scores.mean():.4f} ± {scores.std():.4f}")

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print(f"[CompatibilityScorer] Saved to {MODEL_PATH}")
    return model


def load_model() -> Pipeline:
    if os.path.exists(MODEL_PATH):
        return joblib.load(MODEL_PATH)
    print("[CompatibilityScorer] No saved model, training...")
    return train()


_model: Pipeline | None = None


def get_model() -> Pipeline:
    global _model
    if _model is None:
        _model = load_model()
    return _model


def score_compatibility(agent_a: AgentProfile, agent_b: AgentProfile) -> float:
    """Return P(successful_composition) in [0, 1]."""
    model = get_model()
    features = compute_compatibility_features(agent_a, agent_b)
    X = features_to_array(features).reshape(1, -1)
    proba = model.predict_proba(X)[0]
    return float(proba[1]) if len(proba) > 1 else float(proba[0])


def rank_compositions(
    primary: AgentProfile,
    candidates: list[AgentProfile],
) -> list[tuple[int, float]]:
    """Rank candidate agents by composition compatibility with primary.
    Returns list of (index, score) sorted descending."""
    if not candidates:
        return []
    scores = [score_compatibility(primary, c) for c in candidates]
    ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
    return ranked


if __name__ == "__main__":
    print("Training compatibility scorer from synthetic data...")
    train()
    print("Done.")
