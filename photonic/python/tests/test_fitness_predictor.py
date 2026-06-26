"""Tests for genome fitness predictor."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
import numpy as np
from fitness_predictor import (
    GenomeFeatures, predict_fitness, predict_fitness_batch,
    feature_importance, features_to_array, _generate_synthetic_training_data,
    train,
)


@pytest.fixture(scope="module")
def trained_model():
    """Train model once for all tests."""
    return train()


class TestGenomeFeatures:
    def test_excellent_agent(self, trained_model):
        f = GenomeFeatures(
            capability_count=15,
            tool_count=10,
            generation=12,
            bpd_rate=0.95,
            avg_bpd_quality=0.90,
            compositional_success_rate=0.75,
            surplus_rate_eth=0.3,
            diversity_score=0.8,
            resurrection_vouches=3,
            total_deliveries=200,
            time_active_days=90.0,
            has_parents=True,
        )
        score = predict_fitness(f)
        assert 0.0 <= score <= 1.0
        assert score >= 0.55, f"High-performing agent should have high fitness, got {score:.3f}"

    def test_dead_agent(self, trained_model):
        f = GenomeFeatures(
            capability_count=1,
            tool_count=1,
            generation=0,
            bpd_rate=0.0,
            avg_bpd_quality=0.0,
            compositional_success_rate=0.0,
            surplus_rate_eth=0.0,
            diversity_score=0.0,
            resurrection_vouches=0,
            total_deliveries=0,
            time_active_days=0.1,
            has_parents=False,
        )
        score = predict_fitness(f)
        assert 0.0 <= score <= 1.0
        assert score <= 0.4, f"Dead agent should have low fitness, got {score:.3f}"

    def test_fitness_monotone_bpd_quality(self, trained_model):
        """Higher BPD quality → higher predicted fitness."""
        base = dict(
            capability_count=8, tool_count=6, generation=5,
            bpd_rate=0.7, compositional_success_rate=0.5,
            surplus_rate_eth=0.1, diversity_score=0.5,
            resurrection_vouches=1, total_deliveries=50,
            time_active_days=30.0, has_parents=True,
        )
        low = predict_fitness(GenomeFeatures(avg_bpd_quality=0.1, **base))
        high = predict_fitness(GenomeFeatures(avg_bpd_quality=0.9, **base))
        assert high > low, "Higher BPD quality should yield higher fitness"

    def test_batch_consistency(self, trained_model):
        features_list = [
            GenomeFeatures(capability_count=i+1, tool_count=2, generation=i,
                           bpd_rate=0.5, avg_bpd_quality=0.5,
                           compositional_success_rate=0.3, surplus_rate_eth=0.05,
                           diversity_score=0.4, resurrection_vouches=0,
                           total_deliveries=10, time_active_days=5.0, has_parents=False)
            for i in range(5)
        ]
        batch = predict_fitness_batch(features_list)
        singles = [predict_fitness(f) for f in features_list]
        assert len(batch) == 5
        for b, s in zip(batch, singles):
            assert abs(b - s) < 1e-6, "Batch and single predictions should match"

    def test_feature_array_shape(self):
        f = GenomeFeatures(
            capability_count=5, tool_count=3, generation=2,
            bpd_rate=0.6, avg_bpd_quality=0.7,
            compositional_success_rate=0.4, surplus_rate_eth=0.05,
            diversity_score=0.5, resurrection_vouches=1,
            total_deliveries=20, time_active_days=10.0, has_parents=True,
        )
        arr = features_to_array(f)
        assert arr.shape == (14,), f"Expected 14 features, got {arr.shape}"
        assert np.all(np.isfinite(arr)), "All features should be finite"

    def test_feature_importance_returns_all(self, trained_model):
        importances = feature_importance()
        assert len(importances) == 14
        total = sum(importances.values())
        assert abs(total - 1.0) < 1e-6, "Feature importances should sum to 1.0"

    def test_synthetic_data_shape(self):
        X, y = _generate_synthetic_training_data(100)
        assert X.shape == (100, 14)
        assert y.shape == (100,)
        assert np.all(y >= 0) and np.all(y <= 1), "Targets should be in [0, 1]"

    def test_predict_empty_batch(self, trained_model):
        result = predict_fitness_batch([])
        assert result == []
