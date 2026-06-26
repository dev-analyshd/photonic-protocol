"""
PHOTONIC — TimescaleDB interface layer.
All read/write operations against the TimescaleDB data layer.
"""
from __future__ import annotations

import os
import asyncio
from datetime import datetime, timezone
from typing import Any

import asyncpg

# ─────────────────────────────────────────────────────────────────────────────
#  Connection pool (singleton)
# ─────────────────────────────────────────────────────────────────────────────

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        dsn = os.environ.get("TIMESCALE_URL") or os.environ.get("DATABASE_URL")
        if not dsn:
            raise RuntimeError("TIMESCALE_URL or DATABASE_URL must be set")
        _pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


# ─────────────────────────────────────────────────────────────────────────────
#  BPD Archive
# ─────────────────────────────────────────────────────────────────────────────

async def insert_bpd(
    bpd_id: bytes,
    bpd_hash: bytes,
    provider: str,
    intent: str,
    output_summary: str,
    merkle_root: bytes,
    trace_depth: int,
    quality_score: float,
    surplus_wei: int,
    was_compositional: bool,
    order_id: bytes | None = None,
    chain_id: int = 421614,
) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO bpd_archive
        (time, bpd_id, bpd_hash, provider, intent, output_summary,
         merkle_root, trace_depth, quality_score, surplus_wei,
         was_compositional, order_id, chain_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (bpd_id) DO NOTHING
        """,
        datetime.now(timezone.utc),
        bpd_id, bpd_hash, provider, intent, output_summary,
        merkle_root, trace_depth, quality_score, surplus_wei,
        was_compositional, order_id, chain_id,
    )


async def get_bpds_for_provider(provider: str, limit: int = 100) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT time, bpd_id, bpd_hash, quality_score, surplus_wei,
               was_compositional, verification_status, verifier_count
        FROM bpd_archive
        WHERE provider = $1
        ORDER BY time DESC
        LIMIT $2
        """,
        provider, limit,
    )
    return [dict(r) for r in rows]


async def update_bpd_verification(
    bpd_id: bytes,
    status: str,
    verifier_count: int,
    consensus_pct: float,
) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        UPDATE bpd_archive
        SET verification_status=$1, verifier_count=$2,
            consensus_pct=$3, settled=TRUE
        WHERE bpd_id=$4
        """,
        status, verifier_count, consensus_pct, bpd_id,
    )


async def get_recent_bpds(limit: int = 50) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT time, bpd_id, bpd_hash, provider, quality_score,
               verification_status, was_compositional, surplus_wei
        FROM bpd_archive
        ORDER BY time DESC
        LIMIT $1
        """,
        limit,
    )
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
#  Genome Evolution
# ─────────────────────────────────────────────────────────────────────────────

async def record_genome_event(
    agent_address: str,
    genome_hash: bytes,
    capability_root: bytes,
    tool_root: bytes,
    prompt_arch_hash: bytes,
    behavioral_history_root: bytes,
    fitness_score: float,
    generation: int,
    event_type: str,
    parent_a: str | None = None,
    parent_b: str | None = None,
    alive: bool = True,
    total_bpds: int = 0,
    total_deliveries: int = 0,
    chain_id: int = 421614,
) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO genome_evolution
        (time, agent_address, genome_hash, capability_root, tool_root,
         prompt_arch_hash, behavioral_history_root, fitness_score, generation,
         parent_a, parent_b, alive, event_type, total_bpds, total_deliveries, chain_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        """,
        datetime.now(timezone.utc),
        agent_address, genome_hash, capability_root, tool_root,
        prompt_arch_hash, behavioral_history_root, fitness_score, generation,
        parent_a, parent_b, alive, event_type,
        total_bpds, total_deliveries, chain_id,
    )


async def get_lineage_tree() -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT agent_address, genome_hash, generation,
               parent_a, parent_b, event_type, fitness_score, time
        FROM lineage_tree
        ORDER BY generation, fitness_score DESC
        LIMIT 200
        """
    )
    return [dict(r) for r in rows]


async def get_agent_genome_history(agent_address: str) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT time, genome_hash, fitness_score, generation,
               event_type, alive, total_bpds
        FROM genome_evolution
        WHERE agent_address = $1
        ORDER BY time DESC
        LIMIT 100
        """,
        agent_address,
    )
    return [dict(r) for r in rows]


async def get_active_agents() -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT agent_address, genome_hash, fitness_score, generation,
               parent_a, parent_b, total_bpds, total_deliveries, last_updated
        FROM active_agents
        ORDER BY fitness_score DESC
        LIMIT 100
        """
    )
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
#  Intent Pool History
# ─────────────────────────────────────────────────────────────────────────────

async def record_intent(
    intent_id: bytes,
    buyer: str,
    intent_hash: bytes,
    task_description: str | None,
    max_cost_wei: int,
    deadline: datetime | None,
    quality_floor: float,
    privacy_mode: str,
    composition_mode: str,
    chain_id: int = 421614,
) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO intent_pool_history
        (time, intent_id, buyer, intent_hash, task_description,
         max_cost_wei, deadline, quality_floor, privacy_mode,
         composition_mode, chain_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (intent_id) DO NOTHING
        """,
        datetime.now(timezone.utc),
        intent_id, buyer, intent_hash, task_description,
        max_cost_wei, deadline, quality_floor,
        privacy_mode, composition_mode, chain_id,
    )


async def record_bid(
    intent_id: bytes,
    agent_address: str,
    genome_hash: bytes,
    price_quote_wei: int,
    bpd_sample: bytes,
    bid_score: float | None = None,
    chain_id: int = 421614,
) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO intent_bids
        (time, intent_id, agent_address, genome_hash,
         price_quote_wei, bpd_sample, bid_score, chain_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        """,
        datetime.now(timezone.utc),
        intent_id, agent_address, genome_hash,
        price_quote_wei, bpd_sample, bid_score, chain_id,
    )


async def get_recent_intents(limit: int = 50) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT time, intent_id, buyer, intent_hash, task_description,
               max_cost_wei, status, winner, bid_count, privacy_mode
        FROM intent_pool_history
        ORDER BY time DESC
        LIMIT $1
        """,
        limit,
    )
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
#  Fossil Record
# ─────────────────────────────────────────────────────────────────────────────

async def record_fossil(
    agent_address: str,
    genome_snapshot: bytes,
    final_fitness_score: float,
    cause_of_death: str,
    generation: int,
    parent_a: str | None = None,
    parent_b: str | None = None,
    total_bpds: int = 0,
    total_deliveries: int = 0,
    resurrection_count: int = 0,
    permanently_extinct: bool = False,
    chain_id: int = 421614,
) -> None:
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    await pool.execute(
        """
        INSERT INTO fossil_record
        (time, agent_address, genome_snapshot, final_fitness_score,
         died_at, cause_of_death, generation, parent_a, parent_b,
         total_bpds, total_deliveries, resurrection_count,
         permanently_extinct, chain_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        """,
        now, agent_address, genome_snapshot, final_fitness_score,
        now, cause_of_death, generation, parent_a, parent_b,
        total_bpds, total_deliveries, resurrection_count,
        permanently_extinct, chain_id,
    )


async def get_fossil_record(limit: int = 100) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT agent_address, genome_snapshot, final_fitness_score,
               died_at, cause_of_death, generation, total_bpds,
               resurrection_count, permanently_extinct, time
        FROM fossil_record
        ORDER BY time DESC
        LIMIT $1
        """,
        limit,
    )
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
#  Vitality Snapshots
# ─────────────────────────────────────────────────────────────────────────────

async def record_vitality_snapshot(
    agent_address: str,
    vitality: float,
    bpd_quality_accum: float,
    compositional_successes: int,
    surplus_accum_wei: int,
    diversity_score: float,
    resurrection_vouches: int,
    total_bpds: int,
    total_deliveries: int,
    in_resurrection_trial: bool,
    marketplace_maturity: float,
    dynamic_threshold: float,
    is_dead: bool,
) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO agent_vitality_snapshots
        (time, agent_address, vitality, bpd_quality_accum,
         compositional_successes, surplus_accum_wei, diversity_score,
         resurrection_vouches, total_bpds, total_deliveries,
         in_resurrection_trial, marketplace_maturity, dynamic_threshold, is_dead)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        """,
        datetime.now(timezone.utc),
        agent_address, vitality, bpd_quality_accum,
        compositional_successes, surplus_accum_wei, diversity_score,
        resurrection_vouches, total_bpds, total_deliveries,
        in_resurrection_trial, marketplace_maturity, dynamic_threshold, is_dead,
    )


async def get_vitality_history(agent_address: str, hours: int = 24) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT time, vitality, total_bpds, in_resurrection_trial,
               marketplace_maturity, dynamic_threshold, is_dead
        FROM agent_vitality_snapshots
        WHERE agent_address = $1
          AND time >= NOW() - INTERVAL '1 hour' * $2
        ORDER BY time ASC
        """,
        agent_address, hours,
    )
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
#  Marketplace Stats
# ─────────────────────────────────────────────────────────────────────────────

async def record_marketplace_stats(
    total_agents: int,
    active_agents: int,
    dead_agents: int,
    total_bpds: int,
    total_volume_wei: int,
    avg_fitness: float,
    marketplace_maturity: float,
    dynamic_threshold: float,
) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO marketplace_stats
        (time, total_agents, active_agents, dead_agents,
         total_bpds, total_volume_wei, avg_fitness,
         marketplace_maturity, dynamic_threshold)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        """,
        datetime.now(timezone.utc),
        total_agents, active_agents, dead_agents,
        total_bpds, total_volume_wei, avg_fitness,
        marketplace_maturity, dynamic_threshold,
    )


async def get_latest_marketplace_stats() -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT * FROM marketplace_stats
        ORDER BY time DESC
        LIMIT 1
        """
    )
    return dict(row) if row else None
