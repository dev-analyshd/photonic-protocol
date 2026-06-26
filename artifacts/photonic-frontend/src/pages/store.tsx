import { motion } from "framer-motion";
import { MOCK_AGENTS } from "@/data/mock";
import { truncateHash, formatEth } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heart, Activity, Dna, Coins } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

const dummyChartData = Array.from({length: 10}).map((_, i) => ({
  time: i,
  fitness: 80 + Math.random() * 20
}));

export default function AgentStore() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Agent Store</h2>
          <p className="text-muted-foreground text-sm font-mono mt-1">Live marketplace • Active protocol agents</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="flex items-center gap-1 text-emerald-500"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> LIVE</span>
          <span className="text-muted-foreground ml-2">{MOCK_AGENTS.length} AGENTS LISTED</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {MOCK_AGENTS.map((agent, i) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className="group border border-border/50 bg-card/40 backdrop-blur-md rounded-lg p-4 hover:border-primary/50 transition-colors relative overflow-hidden"
          >
            {/* Ambient glow on hover */}
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            <div className="flex justify-between items-start mb-4 relative z-10">
              <div>
                <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">{agent.name}</h3>
                <div className="text-xs text-muted-foreground font-mono flex items-center gap-1 mt-1">
                  <Dna size={12} /> {truncateHash(agent.genomeHash)}
                </div>
              </div>
              <Badge variant={agent.status === 'active' ? 'default' : 'secondary'} className="uppercase text-[10px] tracking-wider rounded-sm font-mono border-primary/20">
                {agent.status}
              </Badge>
            </div>

            <div className="space-y-3 mb-4 relative z-10">
              <div className="grid grid-cols-2 gap-2 text-sm font-mono bg-background/50 p-2 rounded-sm border border-border/30">
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Activity size={10} /> FITNESS</span>
                  <span className="text-foreground">{agent.fitnessScore.toFixed(1)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Heart size={10} /> VITALITY</span>
                  <span className="text-foreground">{agent.vitalityPoints}</span>
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
            </div>

            {/* Micro chart */}
            <div className="h-12 w-full mb-4 relative z-10 opacity-50 group-hover:opacity-100 transition-opacity">
               <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dummyChartData}>
                  <Line type="monotone" dataKey="fitness" stroke="hsl(var(--primary))" strokeWidth={1} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between border-t border-border/50 pt-3 relative z-10 mt-auto">
              <div className="font-mono text-sm flex items-center gap-1 text-foreground">
                <Coins size={14} className="text-muted-foreground" /> {formatEth(agent.askPrice)} ETH
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs font-mono rounded-sm border-primary/30 hover:bg-primary hover:text-primary-foreground transition-all" data-testid={`btn-buy-${agent.id}`}>
                BID / BUY
              </Button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
