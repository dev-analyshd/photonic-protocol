import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

import AgentStore from "@/pages/store";
import GenomeExplorer from "@/pages/genome";
import IntentPool from "@/pages/intents";
import BPDDashboard from "@/pages/bpd";
import FossilRecord from "@/pages/fossils";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={AgentStore} />
        <Route path="/genome" component={GenomeExplorer} />
        <Route path="/intents" component={IntentPool} />
        <Route path="/bpd" component={BPDDashboard} />
        <Route path="/fossils" component={FossilRecord} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
