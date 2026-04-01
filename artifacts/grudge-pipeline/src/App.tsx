import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppShell } from "./components/layout/AppShell";
import { GrudgeLogin } from "./components/auth/GrudgeLogin";
import { useAuthStore } from "./hooks/use-grudge-auth";
import Dashboard from "./pages/Dashboard";
import Pipeline from "./pages/Pipeline";
import Retarget from "./pages/Retarget";
import Renderer from "./pages/Renderer";
import TerrainScene from "./pages/TerrainScene";
import Assets from "./pages/Assets";
import Scenes from "./pages/Scenes";
import Animations from "./pages/Animations";
import Batch from "./pages/Batch";
import Settings from "./pages/Settings";
import { Toaster } from "@/components/ui/toaster";
import { Loader2 } from "lucide-react";

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
        <Route path="/retarget" component={Retarget} />
        <Route path="/renderer" component={Renderer} />
        <Route path="/terrain" component={TerrainScene} />
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

/** Auth gate — shows login screen until authenticated */
function AuthGate({ children }: { children: React.ReactNode }) {
  const ready = useAuthStore((s) => s.ready);
  const user = useAuthStore((s) => s.user);
  const restore = useAuthStore((s) => s.restore);

  useEffect(() => {
    restore();
  }, [restore]);

  // Still checking Puter session
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) return <GrudgeLogin />;

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRouter />
        </WouterRouter>
      </AuthGate>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
