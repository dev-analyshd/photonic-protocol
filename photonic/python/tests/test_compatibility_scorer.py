"""Tests for compositional compatibility scorer."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from compatibility_scorer import (
    AgentProfile, score_compatibility, rank_compositions,
    compute_compatibility_features, _jaccard, _complement_score, train,
)


@pytest.fixture(scope="module")
def trained_model():
    return train()


class TestCompatibilityScorer:
    def test_complementary_agents_score_high(self, trained_model):
        agent_a = AgentProfile(
            capabilities={"research", "summarize", "web_search"},
            tools={"browser", "pdf_reader"},
            generation=5,
            fitness_score=0.85,
            bpd_rate=0.9,
            diversity_score=0.7,
            total_deliveries=100,
        )
        agent_b = AgentProfile(
            capabilities={"code_generation", "testing", "deploy"},
            tools={"python_repl", "git", "docker"},
            generation=4,
            fitness_score=0.80,
            bpd_rate=0.85,
            diversity_score=0.75,
            total_deliveries=80,
        )
        score = score_compatibility(agent_a, agent_b)
        assert 0.0 <= score <= 1.0
        assert score >= 0.4, f"Complementary agents should compose well, got {score:.3f}"

    def test_identical_agents_score_low(self, trained_model):
        caps = {"research", "summarize", "analyze"}
        tools = {"browser", "pdf_reader"}
        agent_a = AgentProfile(
            capabilities=caps, tools=tools, generation=5,
            fitness_score=0.7, bpd_rate=0.7, diversity_score=0.5, total_deliveries=50,
        )
        agent_b = AgentProfile(
            capabilities=caps, tools=tools, generation=5,
            fitness_score=0.7, bpd_rate=0.7, diversity_score=0.5, total_deliveries=50,
        )
        score = score_compatibility(agent_a, agent_b)
        assert score <= 0.6, f"Identical agents should have lower composition value, got {score:.3f}"

    def test_score_in_range(self, trained_model):
        a = AgentProfile(
            capabilities={"a", "b"}, tools={"t1"}, generation=1,
            fitness_score=0.5, bpd_rate=0.5, diversity_score=0.5, total_deliveries=10,
        )
        b = AgentProfile(
            capabilities={"c", "d"}, tools={"t2"}, generation=2,
            fitness_score=0.5, bpd_rate=0.5, diversity_score=0.5, total_deliveries=10,
        )
        score = score_compatibility(a, b)
        assert 0.0 <= score <= 1.0

    def test_rank_returns_sorted(self, trained_model):
        primary = AgentProfile(
            capabilities={"research", "analyze"}, tools={"browser"},
            generation=3, fitness_score=0.8, bpd_rate=0.8,
            diversity_score=0.6, total_deliveries=60,
        )
        candidates = [
            AgentProfile(capabilities={"code", "deploy"}, tools={"python", "git"},
                         generation=3, fitness_score=0.75, bpd_rate=0.8,
                         diversity_score=0.7, total_deliveries=50),
            AgentProfile(capabilities={"research", "analyze"}, tools={"browser"},
                         generation=3, fitness_score=0.75, bpd_rate=0.8,
                         diversity_score=0.6, total_deliveries=50),
            AgentProfile(capabilities={"finance", "trading"}, tools={"market_api"},
                         generation=5, fitness_score=0.9, bpd_rate=0.9,
                         diversity_score=0.8, total_deliveries=120),
        ]
        ranked = rank_compositions(primary, candidates)
        assert len(ranked) == 3
        scores = [s for _, s in ranked]
        assert scores == sorted(scores, reverse=True), "Results should be sorted descending"

    def test_empty_candidates(self, trained_model):
        primary = AgentProfile(
            capabilities={"a"}, tools={"t"}, generation=1,
            fitness_score=0.5, bpd_rate=0.5, diversity_score=0.5, total_deliveries=5,
        )
        result = rank_compositions(primary, [])
        assert result == []

    def test_jaccard_function(self):
        assert _jaccard({"a", "b"}, {"b", "c"}) == pytest.approx(1/3, rel=1e-5)
        assert _jaccard(set(), set()) == 1.0
        assert _jaccard({"a"}, {"a"}) == 1.0
        assert _jaccard({"a"}, {"b"}) == 0.0

    def test_complement_function(self):
        assert _complement_score({"a", "b"}, {"c", "d"}) == 1.0  # fully complementary
        assert _complement_score({"a"}, {"a"}) == 0.0             # identical
        assert _complement_score(set(), set()) == 0.0

    def test_features_shape(self):
        a = AgentProfile(capabilities={"x"}, tools={"y"}, generation=1,
                         fitness_score=0.5, bpd_rate=0.5, diversity_score=0.5, total_deliveries=5)
        b = AgentProfile(capabilities={"z"}, tools={"w"}, generation=2,
                         fitness_score=0.6, bpd_rate=0.6, diversity_score=0.6, total_deliveries=10)
        f = compute_compatibility_features(a, b)
        assert 0.0 <= f.capability_jaccard <= 1.0
        assert 0.0 <= f.generation_distance <= 1.0
        assert 0.0 <= f.fitness_product <= 1.0
