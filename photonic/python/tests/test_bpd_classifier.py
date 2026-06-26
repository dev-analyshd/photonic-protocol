"""Tests for BPD quality classifier."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from bpd_classifier import (
    BPDFeatures, classify_bpd, features_from_trace,
    QualityClass, QUALITY_TO_SCORE, train,
)


@pytest.fixture(scope="module")
def trained_model():
    return train()


class TestBPDClassifier:
    def test_high_quality_bpd(self, trained_model):
        f = BPDFeatures(
            trace_depth=15,
            step_type_diversity=4,
            has_tool_calls=True,
            has_llm_inference=True,
            has_external_api=True,
            has_computation=True,
            output_length_chars=1500,
            avg_step_duration_ms=500.0,
            max_step_duration_ms=2000.0,
            min_step_duration_ms=100.0,
            completeness_ratio=0.95,
            external_api_ratio=0.3,
            llm_ratio=0.4,
        )
        result = classify_bpd(f)
        assert result["quality_class"] in ["high", "excellent"]
        assert result["quality_score"] >= 0.55

    def test_low_quality_bpd(self, trained_model):
        f = BPDFeatures(
            trace_depth=1,
            step_type_diversity=1,
            has_tool_calls=False,
            has_llm_inference=False,
            has_external_api=False,
            has_computation=False,
            output_length_chars=20,
            avg_step_duration_ms=5.0,
            max_step_duration_ms=5.0,
            min_step_duration_ms=0.0,
            completeness_ratio=0.0,
            external_api_ratio=0.0,
            llm_ratio=0.0,
        )
        result = classify_bpd(f)
        assert result["quality_class"] in ["low", "medium"]
        assert result["quality_score"] <= 0.55

    def test_result_schema(self, trained_model):
        f = BPDFeatures(
            trace_depth=5, step_type_diversity=2,
            has_tool_calls=True, has_llm_inference=True,
            has_external_api=False, has_computation=False,
            output_length_chars=300, avg_step_duration_ms=200.0,
            max_step_duration_ms=600.0, min_step_duration_ms=50.0,
            completeness_ratio=0.8, external_api_ratio=0.0, llm_ratio=0.6,
        )
        result = classify_bpd(f)
        assert "quality_class" in result
        assert "quality_score" in result
        assert "probabilities" in result
        assert 0.0 <= result["quality_score"] <= 1.0
        assert abs(sum(result["probabilities"].values()) - 1.0) < 1e-5

    def test_features_from_trace_empty(self):
        f = features_from_trace([], "no output")
        assert f.trace_depth == 0
        assert f.completeness_ratio == 0.0

    def test_features_from_trace_rich(self):
        trace = [
            {"step_type": "tool_call", "input": "query", "output": "result", "duration_ms": 200},
            {"step_type": "llm_inference", "input": "prompt", "output": "response", "duration_ms": 1500},
            {"step_type": "external_api", "input": "call", "output": "data", "duration_ms": 300},
            {"step_type": "computation", "input": "data", "output": "processed", "duration_ms": 50},
        ]
        f = features_from_trace(trace, "final output " * 50)
        assert f.trace_depth == 4
        assert f.step_type_diversity == 4
        assert f.has_tool_calls
        assert f.has_llm_inference
        assert f.has_external_api
        assert f.has_computation
        assert f.completeness_ratio == 1.0
        assert f.llm_ratio == 0.25
        assert f.external_api_ratio == 0.25

    def test_classify_from_trace(self, trained_model):
        trace = [
            {"step_type": "llm_inference", "input": "x", "output": "y", "duration_ms": 1000},
            {"step_type": "tool_call", "input": "a", "output": "b", "duration_ms": 200},
            {"step_type": "external_api", "input": "q", "output": "r", "duration_ms": 500},
        ]
        f = features_from_trace(trace, "final " * 100)
        result = classify_bpd(f)
        assert result["quality_class"] in ["low", "medium", "high", "excellent"]

    def test_probabilities_sum_to_one(self, trained_model):
        f = BPDFeatures(
            trace_depth=8, step_type_diversity=3,
            has_tool_calls=True, has_llm_inference=True,
            has_external_api=False, has_computation=True,
            output_length_chars=500, avg_step_duration_ms=300.0,
            max_step_duration_ms=800.0, min_step_duration_ms=80.0,
            completeness_ratio=0.9, external_api_ratio=0.0, llm_ratio=0.4,
        )
        result = classify_bpd(f)
        total = sum(result["probabilities"].values())
        assert abs(total - 1.0) < 1e-5
