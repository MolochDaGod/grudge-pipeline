import { Link } from "wouter";
import { Cpu, Database, Map, ListTodo, ArrowRight, Music } from "lucide-react";
import { useBatchSummary, usePipelineAssets, useScenes } from "../hooks/use-grudge-assets";

export default function Dashboard() {
  const summary = useBatchSummary();
  const assets = usePipelineAssets();
  const scenes = useScenes();

  const stats = [
    {
      label: "PIPELINE JOBS",
      value: summary.data?.total ?? 0,
      sub: `${summary.data?.completed ?? 0} done / ${summary.data?.failed ?? 0} failed`,
      icon: ListTodo,
      color: "text-accent",
      link: "/batch",
    },
    {
      label: "ASSETS",
      value: assets.data?.length ?? 0,
      sub: "Local pipeline assets",
      icon: Database,
      color: "text-primary",
      link: "/assets",
    },
    {
      label: "SCENES",
      value: scenes.data?.length ?? 0,
      sub: "Scene compositions",
      icon: Map,
      color: "text-blue-400",
      link: "/scenes",
    },
    {
      label: "IN PROGRESS",
      value: summary.data?.inProgress ?? 0,
      sub: `${summary.data?.queued ?? 0} queued`,
      icon: Cpu,
      color: "text-yellow-400",
      link: "/batch",
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-widest text-primary">COMMAND CENTER</h1>
          <p className="text-sm text-muted font-mono mt-1">
            Grudge Pipeline — Asset rendering, rigging, and deployment
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <Link key={s.label} href={s.link}>
              <div className="border border-panel-border rounded-lg p-4 bg-black/30 hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer group">
                <div className="flex items-center justify-between mb-3">
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                  <ArrowRight className="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className={`text-3xl font-bold font-mono ${s.color}`}>{s.value}</div>
                <div className="text-xs font-mono text-foreground/80 mt-1">{s.label}</div>
                <div className="text-[10px] font-mono text-muted mt-0.5">{s.sub}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick actions */}
        <div>
          <h2 className="text-sm font-bold font-mono text-foreground/70 mb-3 tracking-widest">QUICK ACTIONS</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link href="/pipeline">
              <div className="border border-primary/30 rounded-lg p-4 bg-primary/5 hover:bg-primary/10 transition-all cursor-pointer">
                <Cpu className="w-5 h-5 text-primary mb-2" />
                <div className="text-sm font-bold text-primary">New Character</div>
                <div className="text-[11px] text-muted font-mono">AI → 3D → Rig → Deploy</div>
              </div>
            </Link>
            <Link href="/scenes">
              <div className="border border-blue-400/30 rounded-lg p-4 bg-blue-400/5 hover:bg-blue-400/10 transition-all cursor-pointer">
                <Map className="w-5 h-5 text-blue-400 mb-2" />
                <div className="text-sm font-bold text-blue-400">Build Scene</div>
                <div className="text-[11px] text-muted font-mono">Compose assets into game scenes</div>
              </div>
            </Link>
            <Link href="/animations">
              <div className="border border-purple-400/30 rounded-lg p-4 bg-purple-400/5 hover:bg-purple-400/10 transition-all cursor-pointer">
                <Music className="w-5 h-5 text-purple-400 mb-2" />
                <div className="text-sm font-bold text-purple-400">Map Animations</div>
                <div className="text-[11px] text-muted font-mono">Bind Mixamo sets to characters</div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
