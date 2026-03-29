import { useAuthStore } from "../../hooks/use-grudge-auth";
import { Layers, Loader2, Shield } from "lucide-react";

export function GrudgeLogin() {
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Background grid effect */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(57,255,20,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* Glow orb behind logo */}
      <div className="absolute w-64 h-64 rounded-full bg-primary/10 blur-[100px]" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl scale-150" />
            <div className="relative w-20 h-20 border-2 border-primary/40 rounded-full flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <Layers className="w-10 h-10 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-[0.4em] text-primary glow-text-primary">
            GRUDGE
          </h1>
          <p className="text-xs font-mono text-muted tracking-[0.3em]">
            PIPELINE STUDIO
          </p>
        </div>

        {/* Login card */}
        <div className="w-80 border border-panel-border rounded-xl bg-black/40 backdrop-blur-md p-6 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-sm font-bold tracking-widest text-foreground/90">
              SIGN IN
            </h2>
            <p className="text-[11px] font-mono text-muted leading-relaxed">
              Authenticate to access the pipeline, manage assets, and deploy to
              Grudge Studio.
            </p>
          </div>

          <button
            onClick={login}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg
                       bg-primary/10 border border-primary/40 text-primary font-bold text-sm
                       tracking-wider uppercase
                       hover:bg-primary/20 hover:border-primary/60 hover:shadow-[0_0_20px_rgba(57,255,20,0.15)]
                       active:scale-[0.98]
                       disabled:opacity-50 disabled:cursor-wait
                       transition-all duration-200"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            {loading ? "CONNECTING..." : "GRUDGE LOGIN"}
          </button>

          {/* Subtle divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-panel-border" />
            <span className="text-[9px] font-mono text-muted/50 tracking-wider">
              SECURED BY GRUDGE ID
            </span>
            <div className="flex-1 h-px bg-panel-border" />
          </div>

          <p className="text-[10px] font-mono text-muted/60 text-center leading-relaxed">
            Your Grudge ID includes a server-side wallet and cloud storage
            linked to your account.
          </p>
        </div>

        {/* Footer */}
        <p className="text-[9px] font-mono text-muted/40 tracking-wider">
          BY RACALVIN THE PIRATE KING
        </p>
      </div>
    </div>
  );
}
