import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./components/layout/AppShell";
import Dashboard from "./pages/Dashboard";
import Pipeline from "./pages/Pipeline";
import Assets from "./pages/Assets";
import Scenes from "./pages/Scenes";
import Animations from "./pages/Animations";
import Batch from "./pages/Batch";
import Settings from "./pages/Settings";
import { Toaster } from "@/components/ui/toaster";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    }
  }
});

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-primary font-mono">
      <h1>404 | NOT_FOUND</h1>
    </div>
  );
}

function AppRouter() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/pipeline" component={Pipeline} />
        <Route path="/assets" component={Assets} />
        <Route path="/scenes" component={Scenes} />
        <Route path="/animations" component={Animations} />
        <Route path="/batch" component={Batch} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AppRouter />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
