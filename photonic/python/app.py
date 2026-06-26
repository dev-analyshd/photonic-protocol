"""
PHOTONIC — Python ML/AI FastAPI Service

Endpoints:
  POST /fitness/predict          — predict genome fitness
  POST /fitness/batch            — batch fitness prediction
  GET  /fitness/importances      — feature importances
  POST /compatibility/score      — score two agents' compatibility
  POST /compatibility/rank       — rank candidates for composition
  POST /bpd/classify             — classify BPD quality
  POST /bpd/classify-trace       — classify from raw execution trace

  GET  /db/bpds                  — recent BPDs from TimescaleDB
  GET  /db/agents                — active agents from genome_evolution
  GET  /db/fossils               — fossil record
  GET  /db/intents               — recent intents
  GET  /db/vitality/{address}    — vitality history for an agent
  GET  /db/marketplace/stats     — latest marketplace stats
  GET  /db/lineage               — full lineage tree

  POST /db/bpds                  — insert BPD into archive
  POST /db/genome                — record genome event
  POST /db/fossil                — record agent death
  POST /db/vitality              — record vitality snapshot
  POST /db/intent                — record intent
"""
from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from fitness_predictor import (
    GenomeFeatures, predict_fitness, predict_fitness_batch,
    feature_importance, get_model as get_fitness_model,
)
from compatibility_scorer import (
    AgentProfile, score_compatibility, rank_compositions,
    get_model as get_compat_model,
)
from bpd_classifier import (
    BPDFeatures, classify_bpd, features_from_trace,
    get_model as get_bpd_model,
)
import timescale as db

# ─────────────────────────────────────────────────────────────────────────────
#  Lifespan — warm models on startup
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[PHOTONIC ML] Warming up models...")
    get_fitness_model()
    get_compat_model()
    get_bpd_model()
    print("[PHOTONIC ML] All models ready")
    yield
    await db.close_pool()
    print("[PHOTONIC ML] Shutdown complete")


app = FastAPI(
    title="PHOTONIC ML Service",
    description="Genome fitness prediction, compositional compatibility scoring, BPD quality classification, and TimescaleDB interface for the PHOTONIC Protocol.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
#  Request/Response models
# ─────────────────────────────────────────────────────────────────────────────

class GenomeFeaturesReq(BaseModel):
    capability_count: int = 5
    tool_count: int = 3
    generation: int = 0
    bpd_rate: float = 0.0
    avg_bpd_quality: float = 0.0
    compositional_success_rate: float = 0.0
    surplus_rate_eth: float = 0.0
    diversity_score: float = 0.0
    resurrection_vouches: int = 0
    total_deliveries: int = 0
    time_active_days: float = 0.0
    has_parents: bool = False


class FitnessPredictResponse(BaseModel):
    fitness_score: float
    interpretation: str


class AgentProfileReq(BaseModel):
    capabilities: list[str]
    tools: list[str]
    generation: int = 0
    fitness_score: float = 0.5
    bpd_rate: float = 0.5
    diversity_score: float = 0.5
    total_deliveries: int = 10


class CompatibilityResponse(BaseModel):
    score: float
    interpretation: str


class RankCandidatesReq(BaseModel):
    primary: AgentProfileReq
    candidates: list[AgentProfileReq]


class BPDFeaturesReq(BaseModel):
    trace_depth: int = 0
    step_type_diversity: int = 1
    has_tool_calls: bool = False
    has_llm_inference: bool = True
    has_external_api: bool = False
    has_computation: bool = False
    output_length_chars: int = 100
    avg_step_duration_ms: float = 100.0
    max_step_duration_ms: float = 500.0
    min_step_duration_ms: float = 50.0
    completeness_ratio: float = 1.0
    external_api_ratio: float = 0.0
    llm_ratio: float = 1.0


class BPDTraceReq(BaseModel):
    trace: list[dict]
    output: str


class BPDClassifyResponse(BaseModel):
    quality_class: str
    quality_score: float
    probabilities: dict[str, float]


# ─────────────────────────────────────────────────────────────────────────────
#  Fitness Predictor endpoints
# ─────────────────────────────────────────────────────────────────────────────

def _interp_fitness(score: float) -> str:
    if score >= 0.80: return "excellent — compounding moat active"
    if score >= 0.60: return "high — strong behavioral proof history"
    if score >= 0.40: return "medium — viable but needs more BPDs"
    if score >= 0.20: return "low — approaching vitality threshold"
    return "critical — death imminent"


@app.post("/fitness/predict", response_model=FitnessPredictResponse, tags=["fitness"])
async def predict_fitness_endpoint(req: GenomeFeaturesReq):
    """Predict fitness score [0-1] for a genome from its features."""
    features = GenomeFeatures(**req.model_dump())
    score = predict_fitness(features)
    return FitnessPredictResponse(fitness_score=score, interpretation=_interp_fitness(score))


@app.post("/fitness/batch", tags=["fitness"])
async def predict_fitness_batch_endpoint(reqs: list[GenomeFeaturesReq]):
    """Batch fitness prediction for multiple genomes."""
    if len(reqs) > 100:
        raise HTTPException(status_code=400, detail="Max 100 genomes per batch")
    features_list = [GenomeFeatures(**r.model_dump()) for r in reqs]
    scores = predict_fitness_batch(features_list)
    return [
        {"fitness_score": s, "interpretation": _interp_fitness(s)}
        for s in scores
    ]


@app.get("/fitness/importances", tags=["fitness"])
async def get_feature_importances():
    """Feature importances from the trained gradient boosting regressor."""
    return feature_importance()


# ─────────────────────────────────────────────────────────────────────────────
#  Compatibility Scorer endpoints
# ─────────────────────────────────────────────────────────────────────────────

def _to_agent_profile(req: AgentProfileReq) -> AgentProfile:
    return AgentProfile(
        capabilities=set(req.capabilities),
        tools=set(req.tools),
        generation=req.generation,
        fitness_score=req.fitness_score,
        bpd_rate=req.bpd_rate,
        diversity_score=req.diversity_score,
        total_deliveries=req.total_deliveries,
    )


def _interp_compat(score: float) -> str:
    if score >= 0.80: return "exceptional — ideal compositional pair"
    if score >= 0.60: return "strong — good capability complement"
    if score >= 0.40: return "moderate — some overlap, viable composition"
    if score >= 0.20: return "weak — high redundancy or low fitness"
    return "incompatible — do not compose"


@app.post("/compatibility/score", response_model=CompatibilityResponse, tags=["compatibility"])
async def score_compatibility_endpoint(agent_a: AgentProfileReq, agent_b: AgentProfileReq):
    """Score P(successful_composition) for two agents."""
    a = _to_agent_profile(agent_a)
    b = _to_agent_profile(agent_b)
    score = score_compatibility(a, b)
    return CompatibilityResponse(score=score, interpretation=_interp_compat(score))


@app.post("/compatibility/rank", tags=["compatibility"])
async def rank_candidates_endpoint(req: RankCandidatesReq):
    """Rank candidate agents by composition compatibility with primary."""
    primary = _to_agent_profile(req.primary)
    candidates = [_to_agent_profile(c) for c in req.candidates]
    ranked = rank_compositions(primary, candidates)
    return [
        {
            "index": idx,
            "score": score,
            "interpretation": _interp_compat(score),
            "capabilities": req.candidates[idx].capabilities,
        }
        for idx, score in ranked
    ]


# ─────────────────────────────────────────────────────────────────────────────
#  BPD Classifier endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/bpd/classify", response_model=BPDClassifyResponse, tags=["bpd"])
async def classify_bpd_endpoint(req: BPDFeaturesReq):
    """Classify BPD quality from precomputed features."""
    features = BPDFeatures(**req.model_dump())
    result = classify_bpd(features)
    return BPDClassifyResponse(**result)


@app.post("/bpd/classify-trace", response_model=BPDClassifyResponse, tags=["bpd"])
async def classify_bpd_from_trace(req: BPDTraceReq):
    """Classify BPD quality from raw execution trace."""
    features = features_from_trace(req.trace, req.output)
    result = classify_bpd(features)
    return BPDClassifyResponse(**result)


# ─────────────────────────────────────────────────────────────────────────────
#  TimescaleDB read endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/db/bpds", tags=["timescale"])
async def get_recent_bpds(limit: int = 50):
    """Recent BPDs from the archive."""
    try:
        rows = await db.get_recent_bpds(min(limit, 500))
        return [_serialize(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@app.get("/db/agents", tags=["timescale"])
async def get_active_agents():
    """Active agents from genome evolution table."""
    try:
        rows = await db.get_active_agents()
        return [_serialize(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@app.get("/db/fossils", tags=["timescale"])
async def get_fossils(limit: int = 100):
    """Fossil record of dead agents."""
    try:
        rows = await db.get_fossil_record(min(limit, 500))
        return [_serialize(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@app.get("/db/intents", tags=["timescale"])
async def get_intents(limit: int = 50):
    """Recent intents from the intent pool."""
    try:
        rows = await db.get_recent_intents(min(limit, 200))
        return [_serialize(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@app.get("/db/vitality/{address}", tags=["timescale"])
async def get_vitality(address: str, hours: int = 24):
    """Vitality history for an agent address."""
    try:
        rows = await db.get_vitality_history(address.lower(), min(hours, 720))
        return [_serialize(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@app.get("/db/marketplace/stats", tags=["timescale"])
async def get_marketplace_stats():
    """Latest marketplace stats including maturity index."""
    try:
        row = await db.get_latest_marketplace_stats()
        return _serialize(row) if row else {}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@app.get("/db/lineage", tags=["timescale"])
async def get_lineage():
    """Full lineage tree from genome evolution."""
    try:
        rows = await db.get_lineage_tree()
        return [_serialize(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


# ─────────────────────────────────────────────────────────────────────────────
#  TimescaleDB write endpoints
# ─────────────────────────────────────────────────────────────────────────────

class InsertBPDReq(BaseModel):
    bpd_id_hex: str
    bpd_hash_hex: str
    provider: str
    intent: str
    output_summary: str = ""
    merkle_root_hex: str
    trace_depth: int = 0
    quality_score: float = 0.0
    surplus_wei: int = 0
    was_compositional: bool = False
    order_id_hex: Optional[str] = None
    chain_id: int = 421614


@app.post("/db/bpds", tags=["timescale"])
async def insert_bpd(req: InsertBPDReq):
    try:
        await db.insert_bpd(
            bpd_id=bytes.fromhex(req.bpd_id_hex.lstrip("0x")),
            bpd_hash=bytes.fromhex(req.bpd_hash_hex.lstrip("0x")),
            provider=req.provider,
            intent=req.intent,
            output_summary=req.output_summary,
            merkle_root=bytes.fromhex(req.merkle_root_hex.lstrip("0x")),
            trace_depth=req.trace_depth,
            quality_score=req.quality_score,
            surplus_wei=req.surplus_wei,
            was_compositional=req.was_compositional,
            order_id=bytes.fromhex(req.order_id_hex.lstrip("0x")) if req.order_id_hex else None,
            chain_id=req.chain_id,
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
#  Utility
# ─────────────────────────────────────────────────────────────────────────────

def _serialize(obj):
    """Make asyncpg row JSON-serializable."""
    if obj is None:
        return None
    result = {}
    for k, v in (obj.items() if hasattr(obj, "items") else obj):
        if isinstance(v, bytes):
            result[k] = "0x" + v.hex()
        elif hasattr(v, "isoformat"):
            result[k] = v.isoformat()
        else:
            result[k] = v
    return result


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "service": "photonic-ml"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
