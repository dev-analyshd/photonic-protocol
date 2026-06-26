import { Link, useLocation } from "wouter";
import { Activity, GitMerge, FileLock, ShieldCheck, Bone, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Agent Store", icon: Activity },
  { href: "/genome", label: "Genome Explorer", icon: GitMerge },
  { href: "/intents", label: "Intent Pool", icon: FileLock },
  { href: "/bpd", label: "BPD Dashboard", icon: ShieldCheck },
  { href: "/fossils", label: "Fossil Record", icon: Bone },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-border/50 bg-card/30 backdrop-blur-sm flex flex-col h-screen shrink-0">
        <div className="p-6 border-b border-border/50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-primary/20 flex items-center justify-center border border-primary/50 text-primary">
            <Cpu size={18} />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight leading-none">PHOTONIC</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Protocol Explorer</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium transition-all duration-200 cursor-pointer",
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_10px_rgba(0,255,255,0.1)]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent"
                  )}
                >
                  <Icon size={16} className={cn(isActive && "drop-shadow-[0_0_5px_rgba(0,255,255,0.5)]")} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50 text-xs text-muted-foreground font-mono space-y-1">
          <div className="flex justify-between">
            <span>NETWORK</span>
            <span className="text-emerald-500">ONLINE</span>
          </div>
          <div className="flex justify-between">
            <span>BLOCK</span>
            <span className="text-foreground">14,293,001</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto h-screen relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-card/40 via-background to-background">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIi8+PHBhdGggZD0iTTAgMjBMIDIwIDIwIE0yMCAwIEwyMCAyMCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDMpIiBzdHJva2Utd2lkdGg9IjEiLz48L3N2Zz4=')] opacity-50 pointer-events-none" />
        
        <div className="relative z-10 p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
