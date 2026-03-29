import { Link, useLocation } from "wouter";
import { Layers, Database, Map, ListTodo, Settings, Cpu, Music, Home } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuthStore } from "../../hooks/use-grudge-auth";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: Home },
  { path: "/pipeline", label: "Pipeline", icon: Cpu },
  { path: "/assets", label: "Assets", icon: Database },
  { path: "/scenes", label: "Scenes", icon: Map },
  { path: "/animations", label: "Animations", icon: Music },
  { path: "/batch", label: "Batch", icon: ListTodo },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function NavBar() {
  const [location] = useLocation();
  const user = useAuthStore((s) => s.user);

  return (
    <nav className="bg-black/60 border-b border-panel-border backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 h-12">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Layers className="w-5 h-5 text-primary" />
          <span className="font-bold text-sm tracking-[0.3em] text-primary">
            GRUDGE PIPELINE
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const isActive = location === path || (path !== "/" && location.startsWith(path));
            return (
              <Link
                key={path}
                href={path}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "text-muted hover:text-foreground hover:bg-white/5",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </div>

        {/* User info */}
        <div className="flex items-center gap-2">
          {user ? (
            <span className="text-[10px] font-mono text-primary/70 border border-primary/20 px-2 py-1 rounded">
              {user.username}
            </span>
          ) : (
            <span className="text-[10px] font-mono text-muted border border-panel-border px-2 py-1 rounded">
              OFFLINE
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}
