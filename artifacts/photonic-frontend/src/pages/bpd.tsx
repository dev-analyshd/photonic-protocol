import { MOCK_BPD_RECORDS } from "@/data/mock";
import { truncateHash, formatEth, cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, HelpCircle, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BPDDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">BPD Dashboard</h2>
          <p className="text-muted-foreground text-sm font-mono mt-1">Behavioral Proof Verification • Escrow Management</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="border border-border/50 bg-card/30 p-4 rounded-sm">
          <div className="text-xs font-mono text-muted-foreground mb-1">TOTAL PROOFS VERIFIED</div>
          <div className="text-2xl font-bold text-foreground">1,204</div>
        </div>
        <div className="border border-border/50 bg-card/30 p-4 rounded-sm">
          <div className="text-xs font-mono text-muted-foreground mb-1">ACTIVE ESCROW (ETH)</div>
          <div className="text-2xl font-bold text-primary">84.5020</div>
        </div>
        <div className="border border-border/50 bg-card/30 p-4 rounded-sm">
          <div className="text-xs font-mono text-muted-foreground mb-1">DISPUTE RATE</div>
          <div className="text-2xl font-bold text-destructive">1.2%</div>
        </div>
      </div>

      <div className="border border-border/50 rounded-md overflow-hidden bg-card/20">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/20 font-mono text-xs text-muted-foreground border-b border-border/50">
            <tr>
              <th className="px-4 py-3 font-normal">TASK ID</th>
              <th className="px-4 py-3 font-normal">AGENT</th>
              <th className="px-4 py-3 font-normal">DESCRIPTION</th>
              <th className="px-4 py-3 font-normal">ESCROW</th>
              <th className="px-4 py-3 font-normal">STATUS</th>
              <th className="px-4 py-3 font-normal text-right">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_BPD_RECORDS.map((record, i) => (
              <motion.tr 
                key={record.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.05 }}
                className="border-b border-border/20 hover:bg-muted/10 transition-colors font-mono text-xs"
              >
                <td className="px-4 py-3">{truncateHash(record.taskId)}</td>
                <td className="px-4 py-3 text-primary">{record.agentId}</td>
                <td className="px-4 py-3 text-foreground/80">{record.taskDescription}</td>
                <td className="px-4 py-3">{formatEth(record.escrowAmount)}</td>
                <td className="px-4 py-3">
                  <div className={cn(
                    "flex items-center gap-1.5",
                    record.status === 'verified' ? "text-emerald-500" :
                    record.status === 'disputed' ? "text-destructive" :
                    "text-muted-foreground"
                  )}>
                    {record.status === 'verified' ? <CheckCircle2 size={14} /> :
                     record.status === 'disputed' ? <AlertCircle size={14} /> :
                     <HelpCircle size={14} />}
                    <span className="uppercase tracking-wider">{record.status}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  {record.status === 'pending' && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px] rounded-sm border-primary/30" data-testid={`btn-verify-${record.id}`}>
                      <FileCheck size={12} className="mr-1" /> VERIFY
                    </Button>
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
