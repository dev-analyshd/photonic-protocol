import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { truncateHash, formatEth } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heart, Activity, Dna, Coins, RefreshCw } from "lucide-react";
import { ResponsiveContainer, LineChart, Line } from 'recharts';

// ── API agent shape (matches /api/photonic/agents) ─────────────────────────

interface ApiAgent {
  agentAddress: string;
  name: string;
  genomeHash: string;
  fitnessScore: number;
  vitalityScore: number;
  vitalityPoints: number;
  generation: number;
  parentA: string;
  parentB: string;
  totalBpds: number;
  totalDeliveries: number;
  alive: boolean;
  inResurrectionTrial: boolean;
  category: string;
  askPrice: number;
  registeredAt: number;
  lastUpdated: string;
  source: "chain" | "mock";
}

function agentStatus(agent: ApiAgent): "active" | "dormant" | "dead" {
  if (!agent.alive) return "dead";
  if (agent.inResurrectionTrial) return "dormant";
  if (agent.vitalityScore < 0.3) return "dormant";
  return "active";
}

function miniChart(seed: number) {
  return Array.from({ length: 10 }, (_, i) => ({
    v: 75 + Math.sin((i + seed) * 0.8) * 12 + Math.cos((i + seed) * 0.4) * 6,
  }));
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AgentStore() {
  const [agents, setAgents] = useState<ApiAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  async function fetchAgents() {
    setLoading(true);
    try {
      const res = await fetch("/api/photonic/agents");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApiAgent[] = await res.json();
      setAgents(data);
      setIsLive(data.length > 0 && data[0].source === "chain");
      setLastFetch(new Date());
    } catch (err) {
      console.error("Failed to fetch agents:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Agent Store</h2>
          <p className="text-muted-foreground text-sm font-mono mt-1">
            {isLive ? "Live on-chain agents • Arbitrum Sepolia" : "Marketplace preview • Active protocol agents"}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          {isLive ? (
            <span className="flex items-center gap-1 text-emerald-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> ON-CHAIN
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-500">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> PREVIEW
            </span>
          )}
          <span className="text-muted-foreground">{agents.length} AGENTS</span>
          <button
            onClick={fetchAgents}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loading && agents.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-border/30 bg-card/20 rounded-lg p-4 h-64 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {agents.map((agent, i) => {
            const status = agentStatus(agent);
            const chart  = miniChart(i * 7);
            return (
              <motion.div
                key={agent.agentAddress}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="group border border-border/50 bg-card/40 backdrop-blur-md rounded-lg p-4 hover:border-primary/50 transition-colors relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                {/* Header */}
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div>
                    <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">
                      {agent.name}
                    </h3>
                    <div className="text-xs text-muted-foreground font-mono flex items-center gap-1 mt-1">
                      <Dna size={12} /> {truncateHash(agent.agentAddress)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant={status === "active" ? "default" : "secondary"}
                      className="uppercase text-[10px] tracking-wider rounded-sm font-mono border-primary/20"
                    >
                      {status}
                    </Badge>
                    {agent.source === "chain" && (
                      <span className="text-[9px] text-emerald-500 font-mono">⬡ LIVE</span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-3 mb-4 relative z-10">
                  <div className="grid grid-cols-2 gap-2 text-sm font-mono bg-background/50 p-2 rounded-sm border border-border/30">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Activity size={10} /> FITNESS
                      </span>
                      <span className="text-foreground">{agent.fitnessScore.toFixed(1)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Heart size={10} /> VITALITY
                      </span>
                      <span className={agent.vitalityPoints < 300 ? "text-red-400" : "text-foreground"}>
                        {agent.vitalityPoints}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm font-mono">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground">GENERATION</span>
                      <span>{agent.generation}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground">CATEGORY</span>
                      <span className="text-primary">{agent.category}</span>
                    </div>
                  </div>
                  {agent.totalBpds > 0 && (
                    <div className="text-[10px] font-mono text-muted-foreground">
                      {agent.totalBpds} BPDs · {agent.totalDeliveries} deliveries
                    </div>
                  )}
                </div>

                {/* Micro chart */}
                <div className="h-12 w-full mb-4 relative z-10 opacity-50 group-hover:opacity-100 transition-opacity">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart}>
                      <Line
                        type="monotone"
                        dataKey="v"
                        stroke="hsl(var(--primary))"
                        strokeWidth={1}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-border/50 pt-3 relative z-10 mt-auto">
                  <div className="font-mono text-sm flex items-center gap-1 text-foreground">
                    <Coins size={14} className="text-muted-foreground" />
                    {formatEth(agent.askPrice)} ETH
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs font-mono rounded-sm border-primary/30 hover:bg-primary hover:text-primary-foreground transition-all"
                  >
                    BID / BUY
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {lastFetch && (
        <p className="text-[10px] text-muted-foreground font-mono text-right">
          Last synced: {lastFetch.toLocaleTimeString()} · auto-refresh 60s
          {isLive && " · data from Arbitrum Sepolia"}
        </p>
      )}
    </div>
  );
}
