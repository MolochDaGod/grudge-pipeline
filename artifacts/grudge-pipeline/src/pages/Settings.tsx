import { useState } from "react";
import { Settings as SettingsIcon, CheckCircle, XCircle, RefreshCw, Wallet } from "lucide-react";
import { useAuthStore } from "../hooks/use-grudge-auth";

export default function Settings() {
  const user = useAuthStore((s) => s.user);
  const wallet = useAuthStore((s) => s.wallet);
  const logout = useAuthStore((s) => s.logout);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<Record<string, boolean | null>>({
    api: null,
    assets: null,
    auth: null,
  });

  const checkEndpoint = async (_name: string, url: string) => {
    try {
      const res = await fetch(url, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  };

  const runHealthCheck = async () => {
    setChecking(true);
    const [api, assets, auth] = await Promise.all([
      checkEndpoint("api", "/api/healthz"),
      checkEndpoint("assets", "https://assets-api.grudge-studio.com/assets/catalog?limit=1"),
      checkEndpoint("auth", "https://id.grudge-studio.com/auth/verify"),
    ]);
    setStatus({ api, assets, auth });
    setChecking(false);
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-xl font-bold tracking-widest text-foreground flex items-center gap-2">
          <SettingsIcon className="w-5 h-5" /> SETTINGS
        </h1>

        {/* Connection status */}
        <div className="border border-panel-border rounded-lg p-4 bg-black/20">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-mono text-muted tracking-widest">CONNECTION STATUS</div>
            <button
              onClick={runHealthCheck}
              disabled={checking}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono text-primary border border-primary/30 rounded hover:bg-primary/10 transition-all"
            >
              <RefreshCw className={`w-3 h-3 ${checking ? "animate-spin" : ""}`} /> Check
            </button>
          </div>
          <div className="space-y-2">
            {[
              { key: "api", label: "Pipeline API (local)", url: "/api/healthz" },
              { key: "assets", label: "Grudge Assets API", url: "assets-api.grudge-studio.com" },
              { key: "auth", label: "Grudge Auth", url: "id.grudge-studio.com" },
            ].map((s) => (
              <div key={s.key} className="flex items-center justify-between py-2 border-b border-panel-border/50 last:border-0">
                <div>
                  <div className="text-sm font-mono">{s.label}</div>
                  <div className="text-[10px] text-muted font-mono">{s.url}</div>
                </div>
                {status[s.key] === null ? (
                  <span className="text-[10px] font-mono text-muted">Not checked</span>
                ) : status[s.key] ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Auth */}
        <div className="border border-panel-border rounded-lg p-4 bg-black/20">
          <div className="text-xs font-mono text-muted tracking-widest mb-4">AUTHENTICATION (GRUDGE ID via PUTER)</div>
          {user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm font-mono">
                  Logged in as <span className="text-primary">{user.username}</span>
                </span>
              </div>
              <div className="text-[10px] font-mono text-muted space-y-1">
                <div>Grudge ID: <span className="text-foreground">{user.grudge_id}</span></div>
                <div>Puter ID: <span className="text-foreground">{user.puter_id}</span></div>
                <div>Provider: <span className="text-foreground">{user.provider}</span></div>
              </div>
              {wallet?.address && (
                <div className="flex items-center gap-2 text-[10px] font-mono text-accent/70">
                  <Wallet className="w-3.5 h-3.5" />
                  Server Wallet: {wallet.address}
                </div>
              )}
              <button
                onClick={logout}
                className="px-3 py-1.5 text-xs font-mono text-red-400 border border-red-400/30 rounded hover:bg-red-400/10 transition-all"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-muted font-mono">
                Sign in via the Grudge Login button to authenticate with your Puter account.
                Your Grudge ID and server-side wallet will be provisioned automatically.
              </p>
            </div>
          )}
        </div>

        {/* Environment */}
        <div className="border border-panel-border rounded-lg p-4 bg-black/20">
          <div className="text-xs font-mono text-muted tracking-widest mb-4">ENVIRONMENT</div>
          <div className="space-y-2 text-[11px] font-mono text-muted">
            <div className="flex justify-between">
              <span>Grudge Auth URL</span>
              <span className="text-foreground">id.grudge-studio.com</span>
            </div>
            <div className="flex justify-between">
              <span>Assets API URL</span>
              <span className="text-foreground">assets-api.grudge-studio.com</span>
            </div>
            <div className="flex justify-between">
              <span>Game API URL</span>
              <span className="text-foreground">api.grudge-studio.com</span>
            </div>
            <div className="flex justify-between">
              <span>Asset CDN</span>
              <span className="text-foreground">assets.grudge-studio.com</span>
            </div>
            <div className="flex justify-between">
              <span>ObjectStore</span>
              <span className="text-foreground">objectstore.grudge-studio.com</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
