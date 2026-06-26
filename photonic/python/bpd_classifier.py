"""
PHOTONIC — BPD Quality Classifier (ML/AI)

Classifies a BPD's quality based on structural features of the execution trace.
Used to:
1. Pre-score BPDs before on-chain verification (saves gas for obvious failures)
2. Set the quality_score field in TimescaleDB
3. Feed into vitality computation

Output: quality_class in {low, medium, high, excellent} + continuous score [0, 1]

Features:
- Execution trace depth (number of steps)
- Step type diversity (tool calls vs LLM vs API vs computation)
- Output length
- Trace completeness (no missing inputs/outputs)
- Timing regularity (no suspiciously fast steps)
- External API call ratio
"""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score
import joblib
import os
from dataclasses import dataclass
from enum import Enum


# ─────────────────────────────────────────────────────────────────────────────
#  Feature schema
# ─────────────────────────────────────────────────────────────────────────────

class QualityClass(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    EXCELLENT = "excellent"


QUALITY_TO_SCORE = {
    QualityClass.LOW: 0.15,
    QualityClass.MEDIUM: 0.45,
    QualityClass.HIGH: 0.75,
    QualityClass.EXCELLENT: 0.95,
}

QUALITY_THRESHOLD = {
    QualityClass.LOW: (0.0, 0.25),
    QualityClass.MEDIUM: (0.25, 0.55),
    QualityClass.HIGH: (0.55, 0.80),
    QualityClass.EXCELLENT: (0.80, 1.01),
}


@dataclass
class BPDFeatures:
    """Features extracted from a BPD execution trace."""
    trace_depth: int                # Number of execution steps
    step_type_diversity: int        # Distinct step types (0-4)
    has_tool_calls: bool
    has_llm_inference: bool
    has_external_api: bool
    has_computation: bool
    output_length_chars: int        # Length of output string
    avg_step_duration_ms: float     # Average time per step
    max_step_duration_ms: float     # Longest single step
    min_step_duration_ms: float     # Shortest step (flags suspicious instant ops)
    completeness_ratio: float       # Steps with both input+output / total (0-1)
    external_api_ratio: float       # external_api steps / total
    llm_ratio: float                # llm_inference steps / total


def features_to_array(f: BPDFeatures) -> np.ndarray:
    return np.array([
        np.log1p(f.trace_depth),
        f.step_type_diversity,
        float(f.has_tool_calls),
        float(f.has_llm_inference),
        float(f.has_external_api),
        float(f.has_computation),
        np.log1p(f.output_length_chars),
        np.log1p(f.avg_step_duration_ms),
        np.log1p(f.max_step_duration_ms),
        f.min_step_duration_ms,             # suspicious if exactly 0
        f.completeness_ratio,
        f.external_api_ratio,
        f.llm_ratio,
        # Interactions
        f.step_type_diversity * f.completeness_ratio,
        np.log1p(f.trace_depth) * f.completeness_ratio,
    ], dtype=np.float32)


FEATURE_NAMES = [
    "log_trace_depth", "step_type_diversity",
    "has_tool_calls", "has_llm_inference", "has_external_api", "has_computation",
    "log_output_length", "log_avg_step_ms", "log_max_step_ms", "min_step_ms",
    "completeness_ratio", "external_api_ratio", "llm_ratio",
    "diversity_completeness", "depth_completeness",
]


def score_to_class(score: float) -> QualityClass:
    for qc, (lo, hi) in QUALITY_THRESHOLD.items():
        if lo <= score < hi:
            return qc
    return QualityClass.LOW


# ─────────────────────────────────────────────────────────────────────────────
#  Synthetic training data
# ─────────────────────────────────────────────────────────────────────────────

def _generate_training_data(n: int = 2000) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(13)
    X_list, y_list = [], []

    for _ in range(n):
        quality_tier = rng.choice(["low", "medium", "high", "excellent"],
                                  p=[0.25, 0.35, 0.25, 0.15])

        if quality_tier == "excellent":
            depth = int(rng.integers(10, 30))
            diversity = int(rng.integers(3, 5))
            completeness = float(rng.uniform(0.9, 1.0))
            output_len = int(rng.integers(800, 3000))
            ext_ratio = float(rng.uniform(0.2, 0.6))
            llm_ratio = float(rng.uniform(0.2, 0.5))
            avg_ms = float(rng.uniform(200, 2000))
        elif quality_tier == "high":
            depth = int(rng.integers(6, 18))
            diversity = int(rng.integers(2, 4))
            completeness = float(rng.uniform(0.7, 0.95))
            output_len = int(rng.integers(300, 1000))
            ext_ratio = float(rng.uniform(0.1, 0.4))
            llm_ratio = float(rng.uniform(0.2, 0.5))
            avg_ms = float(rng.uniform(100, 1000))
        elif quality_tier == "medium":
            depth = int(rng.integers(3, 10))
            diversity = int(rng.integers(1, 3))
            completeness = float(rng.uniform(0.5, 0.8))
            output_len = int(rng.integers(100, 400))
            ext_ratio = float(rng.uniform(0.0, 0.2))
            llm_ratio = float(rng.uniform(0.3, 0.7))
            avg_ms = float(rng.uniform(50, 500))
        else:  # low
            depth = int(rng.integers(0, 4))
            diversity = int(rng.integers(0, 2))
            completeness = float(rng.uniform(0.0, 0.5))
            output_len = int(rng.integers(0, 150))
            ext_ratio = 0.0
            llm_ratio = float(rng.uniform(0.0, 0.3))
            avg_ms = float(rng.uniform(0, 100))

        f = BPDFeatures(
            trace_depth=depth,
            step_type_diversity=diversity,
            has_tool_calls=diversity >= 2,
            has_llm_inference=llm_ratio > 0,
            has_external_api=ext_ratio > 0,
            has_computation=rng.random() > 0.4,
            output_length_chars=output_len,
            avg_step_duration_ms=avg_ms,
            max_step_duration_ms=avg_ms * float(rng.uniform(1.5, 4.0)),
            min_step_duration_ms=float(rng.uniform(0, avg_ms * 0.5)),
            completeness_ratio=completeness,
            external_api_ratio=ext_ratio,
            llm_ratio=llm_ratio,
        )
        X_list.append(features_to_array(f))
        y_list.append(quality_tier)

    return np.array(X_list), np.array(y_list)


# ─────────────────────────────────────────────────────────────────────────────
#  Model
# ─────────────────────────────────────────────────────────────────────────────

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "bpd_classifier.pkl")
ENCODER_PATH = os.path.join(os.path.dirname(__file__), "models", "bpd_label_encoder.pkl")


def build_model() -> Pipeline:
    return Pipeline([
        ("scaler", StandardScaler()),
        ("gbc", GradientBoostingClassifier(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            random_state=42,
        )),
    ])


def train(X: np.ndarray | None = None, y_raw: np.ndarray | None = None) -> tuple[Pipeline, LabelEncoder]:
    if X is None or y_raw is None:
        X, y_raw = _generate_training_data(2000)

    le = LabelEncoder()
    y = le.fit_transform(y_raw)

    model = build_model()
    model.fit(X, y)

    scores = cross_val_score(model, X, y, cv=5, scoring="accuracy")
    print(f"[BPDClassifier] CV Accuracy = {scores.mean():.4f} ± {scores.std():.4f}")

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    joblib.dump(le, ENCODER_PATH)
    print(f"[BPDClassifier] Saved to {MODEL_PATH}")
    return model, le


def load_model() -> tuple[Pipeline, LabelEncoder]:
    if os.path.exists(MODEL_PATH) and os.path.exists(ENCODER_PATH):
        return joblib.load(MODEL_PATH), joblib.load(ENCODER_PATH)
    print("[BPDClassifier] No saved model, training...")
    return train()


_model: Pipeline | None = None
_encoder: LabelEncoder | None = None


def get_model() -> tuple[Pipeline, LabelEncoder]:
    global _model, _encoder
    if _model is None or _encoder is None:
        _model, _encoder = load_model()
    return _model, _encoder


def classify_bpd(features: BPDFeatures) -> dict:
    """Classify a BPD and return quality class + score."""
    model, le = get_model()
    X = features_to_array(features).reshape(1, -1)
    pred_idx = model.predict(X)[0]
    proba = model.predict_proba(X)[0]

    quality_class = le.inverse_transform([pred_idx])[0]
    classes = le.classes_.tolist()
    class_probas = {c: float(p) for c, p in zip(classes, proba)}

    # Continuous score: weighted average of class mid-scores
    score = sum(
        QUALITY_TO_SCORE.get(QualityClass(c), 0) * p
        for c, p in class_probas.items()
    )

    return {
        "quality_class": quality_class,
        "quality_score": float(np.clip(score, 0.0, 1.0)),
        "probabilities": class_probas,
    }


def features_from_trace(
    trace: list[dict],
    output: str,
) -> BPDFeatures:
    """Extract BPDFeatures from a raw execution trace."""
    if not trace:
        return BPDFeatures(
            trace_depth=0, step_type_diversity=0,
            has_tool_calls=False, has_llm_inference=False,
            has_external_api=False, has_computation=False,
            output_length_chars=len(output),
            avg_step_duration_ms=0, max_step_duration_ms=0, min_step_duration_ms=0,
            completeness_ratio=0.0, external_api_ratio=0.0, llm_ratio=0.0,
        )

    step_types = {s.get("step_type", s.get("type", "")) for s in trace}
    durations = [float(s.get("duration_ms", 0)) for s in trace]
    complete = sum(1 for s in trace if s.get("input") is not None and s.get("output") is not None)

    n = len(trace)
    tool_count = sum(1 for s in trace if s.get("step_type") == "tool_call" or s.get("type") == "tool_call")
    ext_count = sum(1 for s in trace if s.get("step_type") == "external_api" or s.get("type") == "external_api")
    llm_count = sum(1 for s in trace if s.get("step_type") == "llm_inference" or s.get("type") == "llm_inference")

    return BPDFeatures(
        trace_depth=n,
        step_type_diversity=len(step_types),
        has_tool_calls=tool_count > 0,
        has_llm_inference=llm_count > 0,
        has_external_api=ext_count > 0,
        has_computation="computation" in step_types,
        output_length_chars=len(output),
        avg_step_duration_ms=float(np.mean(durations)) if durations else 0.0,
        max_step_duration_ms=float(np.max(durations)) if durations else 0.0,
        min_step_duration_ms=float(np.min(durations)) if durations else 0.0,
        completeness_ratio=complete / n if n > 0 else 0.0,
        external_api_ratio=ext_count / n if n > 0 else 0.0,
        llm_ratio=llm_count / n if n > 0 else 0.0,
    )


if __name__ == "__main__":
    print("Training BPD quality classifier from synthetic data...")
    train()
    print("Done.")
