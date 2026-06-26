import { MOCK_GENOMES } from "@/data/mock";
import { truncateHash } from "@/lib/utils";
import { motion } from "framer-motion";
import { Activity, Dna, GitCommit } from "lucide-react";

export default function GenomeExplorer() {
  // Simple layout simulation for the tree
  const generations = [1, 2, 3, 4, 5, 6];
  
  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Genome Explorer</h2>
        <p className="text-muted-foreground text-sm font-mono mt-1">Lineage • Mutation History • Trait Inheritance</p>
      </div>

      <div className="flex-1 border border-border/50 bg-card/20 rounded-lg p-6 overflow-auto relative">
        {/* Canvas background grid */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgNDBMIDQwIDQwIE00MCAwIEw0MCA0MCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiLz48L3N2Zz4=')] pointer-events-none" />
        
        <div className="min-w-[800px] h-full flex items-stretch gap-12 relative z-10 pb-8">
          {generations.map((gen, gIdx) => {
            const nodes = MOCK_GENOMES.filter(n => n.generation === gen);
            return (
              <div key={gen} className="flex-1 flex flex-col justify-around relative">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-mono text-muted-foreground bg-background px-2 border border-border/50 rounded-sm">
                  GEN {gen}
                </div>
                
                {nodes.map((node, i) => (
                  <motion.div
                    key={node.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: (gIdx * 0.1) + (i * 0.05) }}
                    className="relative group my-2"
                  >
                    {/* Simulated SVG line to previous gen (just visually hinted here with pseudo elements) */}
                    {node.parentId && (
                      <div className="absolute top-1/2 right-full w-12 h-px bg-border/50 group-hover:bg-primary/50 transition-colors" />
                    )}

                    <div className="border border-border/60 bg-background/80 backdrop-blur-md rounded-md p-3 w-48 shadow-lg hover:border-primary hover:shadow-[0_0_15px_rgba(0,255,255,0.15)] transition-all cursor-pointer">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-mono font-bold">{node.agentId}</span>
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-sm bg-muted/50 text-muted-foreground font-mono">
                          {node.mutationType}
                        </span>
                      </div>
                      
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-muted-foreground flex items-center gap-1"><Activity size={10}/> Fit</span>
                          <span className="text-primary">{node.fitness.toFixed(1)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-muted-foreground flex items-center gap-1"><Dna size={10}/> Traits</span>
                          <span className={node.traitDelta > 0 ? "text-emerald-500" : node.traitDelta < 0 ? "text-destructive" : "text-foreground"}>
                            {node.traitDelta > 0 ? '+' : ''}{node.traitDelta}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
