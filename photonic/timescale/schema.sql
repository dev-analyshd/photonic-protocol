-- ============================================================
-- PHOTONIC Protocol — TimescaleDB Schema
-- ============================================================
-- Run this against a TimescaleDB-enabled PostgreSQL instance.
-- TimescaleDB extension must already be installed.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ─────────────────────────────────────────────────────────────
-- 1. BPD ARCHIVE (append-only, hypertable by timestamp)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bpd_archive (
    time            TIMESTAMPTZ     NOT NULL,
    bpd_id          BYTEA           NOT NULL UNIQUE,
    bpd_hash        BYTEA           NOT NULL,
    provider        VARCHAR(42)     NOT NULL,
    intent          TEXT            NOT NULL,
    output_summary  TEXT,
    merkle_root     BYTEA           NOT NULL,
    trace_depth     SMALLINT        NOT NULL DEFAULT 0,
    quality_score   DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    surplus_wei     NUMERIC(38,0)   NOT NULL DEFAULT 0,
    was_compositional BOOLEAN       NOT NULL DEFAULT FALSE,
    verification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    verifier_count  SMALLINT        NOT NULL DEFAULT 0,
    consensus_pct   DOUBLE PRECISION,
    settled         BOOLEAN         NOT NULL DEFAULT FALSE,
    order_id        BYTEA,
    chain_id        INTEGER         NOT NULL DEFAULT 421614
);

SELECT create_hypertable('bpd_archive', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_bpd_provider ON bpd_archive(provider, time DESC);
CREATE INDEX IF NOT EXISTS idx_bpd_hash ON bpd_archive(bpd_hash);
CREATE INDEX IF NOT EXISTS idx_bpd_status ON bpd_archive(verification_status, time DESC);

-- Continuous aggregate: hourly BPD stats per provider
CREATE MATERIALIZED VIEW IF NOT EXISTS bpd_hourly_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    provider,
    COUNT(*)                     AS bpd_count,
    AVG(quality_score)           AS avg_quality,
    SUM(surplus_wei)             AS total_surplus_wei,
    SUM(CASE WHEN was_compositional THEN 1 ELSE 0 END) AS compositional_count
FROM bpd_archive
GROUP BY bucket, provider
WITH NO DATA;

SELECT add_continuous_aggregate_policy('bpd_hourly_stats',
    start_offset => INTERVAL '1 day',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- ─────────────────────────────────────────────────────────────
-- 2. GENOME EVOLUTION TREE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS genome_evolution (
    time                    TIMESTAMPTZ     NOT NULL,
    agent_address           VARCHAR(42)     NOT NULL,
    genome_hash             BYTEA           NOT NULL,
    capability_root         BYTEA           NOT NULL,
    tool_root               BYTEA           NOT NULL,
    prompt_arch_hash        BYTEA           NOT NULL,
    behavioral_history_root BYTEA           NOT NULL,
    fitness_score           DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    generation              INTEGER         NOT NULL DEFAULT 0,
    parent_a                VARCHAR(42),
    parent_b                VARCHAR(42),
    alive                   BOOLEAN         NOT NULL DEFAULT TRUE,
    event_type              VARCHAR(30)     NOT NULL DEFAULT 'update',
    -- event_type: 'genesis' | 'update' | 'mutation' | 'crossover' | 'death' | 'resurrection'
    total_bpds              INTEGER         NOT NULL DEFAULT 0,
    total_deliveries        INTEGER         NOT NULL DEFAULT 0,
    chain_id                INTEGER         NOT NULL DEFAULT 421614
);

SELECT create_hypertable('genome_evolution', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_genome_agent ON genome_evolution(agent_address, time DESC);
CREATE INDEX IF NOT EXISTS idx_genome_generation ON genome_evolution(generation, time DESC);
CREATE INDEX IF NOT EXISTS idx_genome_parent ON genome_evolution(parent_a, parent_b);

-- ─────────────────────────────────────────────────────────────
-- 3. INTENT POOL HISTORY
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intent_pool_history (
    time                TIMESTAMPTZ     NOT NULL,
    intent_id           BYTEA           NOT NULL UNIQUE,
    buyer               VARCHAR(42)     NOT NULL,
    intent_hash         BYTEA           NOT NULL,
    task_description    TEXT,                       -- NULL until ZK reveal
    max_cost_wei        NUMERIC(38,0)   NOT NULL DEFAULT 0,
    deadline            TIMESTAMPTZ,
    quality_floor       DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    privacy_mode        VARCHAR(20)     NOT NULL DEFAULT 'public',
    composition_mode    VARCHAR(20)     NOT NULL DEFAULT 'auto',
    status              VARCHAR(20)     NOT NULL DEFAULT 'open',
    -- status: 'open' | 'awarded' | 'cancelled' | 'expired'
    winner              VARCHAR(42),
    awarded_at          TIMESTAMPTZ,
    winning_bid_wei     NUMERIC(38,0),
    bid_count           SMALLINT        NOT NULL DEFAULT 0,
    chain_id            INTEGER         NOT NULL DEFAULT 421614
);

SELECT create_hypertable('intent_pool_history', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_intent_buyer ON intent_pool_history(buyer, time DESC);
CREATE INDEX IF NOT EXISTS idx_intent_status ON intent_pool_history(status, time DESC);
CREATE INDEX IF NOT EXISTS idx_intent_hash ON intent_pool_history(intent_hash);

-- Intent bids sub-table
CREATE TABLE IF NOT EXISTS intent_bids (
    time                TIMESTAMPTZ     NOT NULL,
    intent_id           BYTEA           NOT NULL,
    agent_address       VARCHAR(42)     NOT NULL,
    genome_hash         BYTEA           NOT NULL,
    price_quote_wei     NUMERIC(38,0)   NOT NULL,
    bpd_sample          BYTEA           NOT NULL,
    bid_score           DOUBLE PRECISION,
    is_winner           BOOLEAN         NOT NULL DEFAULT FALSE,
    chain_id            INTEGER         NOT NULL DEFAULT 421614
);

SELECT create_hypertable('intent_bids', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_bid_intent ON intent_bids(intent_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_bid_agent ON intent_bids(agent_address, time DESC);

-- ─────────────────────────────────────────────────────────────
-- 4. FOSSIL RECORD (permanent, append-only)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fossil_record (
    time                TIMESTAMPTZ     NOT NULL,
    agent_address       VARCHAR(42)     NOT NULL,
    genome_snapshot     BYTEA           NOT NULL,
    final_fitness_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    died_at             TIMESTAMPTZ     NOT NULL,
    cause_of_death      VARCHAR(50)     NOT NULL,
    -- cause: 'vitality_decay' | 'slash' | 'permanent_extinct' | 'timeout'
    generation          INTEGER         NOT NULL DEFAULT 0,
    parent_a            VARCHAR(42),
    parent_b            VARCHAR(42),
    total_bpds          INTEGER         NOT NULL DEFAULT 0,
    total_deliveries    INTEGER         NOT NULL DEFAULT 0,
    resurrection_count  SMALLINT        NOT NULL DEFAULT 0,
    permanently_extinct BOOLEAN         NOT NULL DEFAULT FALSE,
    chain_id            INTEGER         NOT NULL DEFAULT 421614
);

SELECT create_hypertable('fossil_record', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_fossil_agent ON fossil_record(agent_address, time DESC);
CREATE INDEX IF NOT EXISTS idx_fossil_generation ON fossil_record(generation);
CREATE INDEX IF NOT EXISTS idx_fossil_cause ON fossil_record(cause_of_death, time DESC);

-- ─────────────────────────────────────────────────────────────
-- 5. AGENT VITALITY SNAPSHOTS (time-series)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_vitality_snapshots (
    time                        TIMESTAMPTZ     NOT NULL,
    agent_address               VARCHAR(42)     NOT NULL,
    vitality                    DOUBLE PRECISION NOT NULL,
    bpd_quality_accum           DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    compositional_successes     INTEGER         NOT NULL DEFAULT 0,
    surplus_accum_wei           NUMERIC(38,0)   NOT NULL DEFAULT 0,
    diversity_score             DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    resurrection_vouches        SMALLINT        NOT NULL DEFAULT 0,
    total_bpds                  INTEGER         NOT NULL DEFAULT 0,
    total_deliveries            INTEGER         NOT NULL DEFAULT 0,
    in_resurrection_trial       BOOLEAN         NOT NULL DEFAULT FALSE,
    marketplace_maturity        DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    dynamic_threshold           DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    is_dead                     BOOLEAN         NOT NULL DEFAULT FALSE
);

SELECT create_hypertable('agent_vitality_snapshots', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_vitality_agent ON agent_vitality_snapshots(agent_address, time DESC);
CREATE INDEX IF NOT EXISTS idx_vitality_dead ON agent_vitality_snapshots(is_dead, time DESC);

-- Continuous aggregate: daily vitality per agent
CREATE MATERIALIZED VIEW IF NOT EXISTS vitality_daily_avg
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    agent_address,
    AVG(vitality)               AS avg_vitality,
    MAX(vitality)               AS max_vitality,
    MIN(vitality)               AS min_vitality,
    LAST(is_dead, time)         AS ended_dead
FROM agent_vitality_snapshots
GROUP BY bucket, agent_address
WITH NO DATA;

SELECT add_continuous_aggregate_policy('vitality_daily_avg',
    start_offset => INTERVAL '7 days',
    end_offset   => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- ─────────────────────────────────────────────────────────────
-- 6. MARKETPLACE STATS (for maturity index M(t))
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marketplace_stats (
    time                TIMESTAMPTZ     NOT NULL,
    total_agents        INTEGER         NOT NULL DEFAULT 0,
    active_agents       INTEGER         NOT NULL DEFAULT 0,
    dead_agents         INTEGER         NOT NULL DEFAULT 0,
    total_bpds          BIGINT          NOT NULL DEFAULT 0,
    total_volume_wei    NUMERIC(38,0)   NOT NULL DEFAULT 0,
    avg_fitness         DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    marketplace_maturity DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    -- M(t) = active_agents / (active_agents + dead_agents + 1)
    dynamic_threshold   DOUBLE PRECISION NOT NULL DEFAULT 0.20
);

SELECT create_hypertable('marketplace_stats', 'time', if_not_exists => TRUE);

-- ─────────────────────────────────────────────────────────────
-- Helper views
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW active_agents AS
SELECT DISTINCT ON (agent_address)
    agent_address, genome_hash, fitness_score, generation,
    parent_a, parent_b, alive, total_bpds, total_deliveries, time AS last_updated
FROM genome_evolution
WHERE alive = TRUE
ORDER BY agent_address, time DESC;

CREATE OR REPLACE VIEW lineage_tree AS
SELECT
    g.agent_address, g.genome_hash, g.generation,
    g.parent_a, g.parent_b, g.event_type,
    g.fitness_score, g.time
FROM genome_evolution g
INNER JOIN (
    SELECT agent_address, MAX(time) AS latest
    FROM genome_evolution
    GROUP BY agent_address
) latest_g ON g.agent_address = latest_g.agent_address AND g.time = latest_g.latest
ORDER BY g.generation, g.fitness_score DESC;
