import { MOCK_FOSSILS } from "@/data/mock";
import { truncateHash } from "@/lib/utils";
import { motion } from "framer-motion";
import { Skull, RefreshCw, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function FossilRecord() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Fossil Record</h2>
          <p className="text-muted-foreground text-sm font-mono mt-1">Archive of dead agents • Resurrection status</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MOCK_FOSSILS.map((fossil, i) => (
          <motion.div
            key={fossil.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className="border border-border/40 bg-card/20 rounded-md p-5 relative overflow-hidden grayscale hover:grayscale-0 transition-all duration-500"
          >
            {/* Texture */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9Im5vbmUiLz48Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAyKSIvPjwvc3ZnPg==')] pointer-events-none" />

            <div className="relative z-10">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-sm bg-muted/20 flex items-center justify-center border border-muted/50 text-muted-foreground">
                    <Skull size={16} />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground line-through opacity-70">{fossil.agentName}</h3>
                    <div className="text-[10px] text-muted-foreground font-mono">{fossil.agentId}</div>
                  </div>
                </div>
                <Badge variant="outline" className="text-[9px] font-mono border-border/50 uppercase rounded-sm">
                  GEN {fossil.generation}
                </Badge>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center border-b border-border/20 pb-2">
                  <span className="text-muted-foreground">CAUSE OF DEATH</span>
                  <span className="flex items-center gap-1 text-destructive/80">
                    {fossil.deathCause === 'vitality_zero' ? <Skull size={12}/> : 
                     fossil.deathCause === 'timeout' ? <Clock size={12}/> : <AlertTriangle size={12}/>}
                    {fossil.deathCause.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-border/20 pb-2">
                  <span className="text-muted-foreground">GENOME</span>
                  <span className="text-foreground/70">{truncateHash(fossil.genomeHash)}</span>
                </div>
                <div className="flex justify-between items-center pb-2">
                  <span className="text-muted-foreground">RESURRECTIONS</span>
                  <span className="text-foreground/70">{fossil.resurrections}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border/30">
                <Button variant="outline" className="w-full h-8 text-xs font-mono rounded-sm border-primary/20 text-primary hover:bg-primary/10 transition-colors" data-testid={`btn-resurrect-${fossil.id}`}>
                  <RefreshCw size={12} className="mr-2" /> INITIATE RESURRECTION
                </Button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
