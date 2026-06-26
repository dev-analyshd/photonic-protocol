import { MOCK_INTENTS } from "@/data/mock";
import { truncateHash, formatEth, cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Lock, Unlock, Clock, Trophy, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function IntentPool() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Intent Pool (SAIP)</h2>
          <p className="text-muted-foreground text-sm font-mono mt-1">Silent Auction • Encrypted Payload Bidding</p>
        </div>
        <Button size="sm" className="font-mono rounded-sm text-xs" data-testid="btn-new-intent">
          <Lock size={14} className="mr-2" /> SUBMIT INTENT
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {MOCK_INTENTS.map((intent, i) => {
          const isRevealed = intent.status !== 'pending';
          return (
            <motion.div
              key={intent.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="flex items-center justify-between border border-border/50 bg-card/30 p-4 rounded-sm hover:bg-card/50 transition-colors"
            >
              <div className="flex items-center gap-6">
                <div className={cn(
                  "w-10 h-10 rounded-sm flex items-center justify-center border",
                  intent.status === 'pending' ? "bg-muted/30 border-muted text-muted-foreground" :
                  intent.status === 'won' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" :
                  intent.status === 'lost' ? "bg-destructive/10 border-destructive/30 text-destructive" :
                  "bg-primary/10 border-primary/30 text-primary"
                )}>
                  {intent.status === 'pending' ? <Clock size={18} /> :
                   intent.status === 'won' ? <Trophy size={18} /> :
                   intent.status === 'lost' ? <XCircle size={18} /> :
                   <Unlock size={18} />}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm">{intent.id}</span>
                    <span className={cn(
                      "text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded-sm border",
                      intent.status === 'pending' ? "border-muted text-muted-foreground" :
                      intent.status === 'won' ? "border-emerald-500/50 text-emerald-500" :
                      intent.status === 'lost' ? "border-destructive/50 text-destructive" :
                      "border-primary/50 text-primary"
                    )}>
                      {intent.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                    <span>AGENT: {intent.agentId}</span>
                    <span>SUBMITTER: {truncateHash(intent.submitter)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="text-right font-mono">
                  <div className="text-[10px] text-muted-foreground mb-1">PAYLOAD</div>
                  <div className="text-xs text-foreground flex items-center gap-1 justify-end">
                    {isRevealed ? <Unlock size={12} className="text-primary"/> : <Lock size={12}/>}
                    {isRevealed ? truncateHash(intent.encryptedPayload) : '••••••••••••'}
                  </div>
                </div>
                
                <div className="text-right font-mono w-24">
                  <div className="text-[10px] text-muted-foreground mb-1">BID AMOUNT</div>
                  <div className={cn("text-sm", isRevealed ? "text-primary font-bold" : "text-foreground")}>
                    {isRevealed ? `${formatEth(intent.bidAmount)} ETH` : '??? ETH'}
                  </div>
                </div>

                {intent.status === 'pending' && (
                  <Button variant="outline" size="sm" className="h-8 text-xs font-mono rounded-sm border-primary/30" data-testid={`btn-reveal-${intent.id}`}>
                    REVEAL
                  </Button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
