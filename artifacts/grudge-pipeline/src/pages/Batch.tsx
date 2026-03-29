import { useState } from "react";
import { ListTodo, Plus, Play, AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";
import { usePipelineJobs, useBatchSummary, useSubmitBatch } from "../hooks/use-grudge-assets";

export default function Batch() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const jobs = usePipelineJobs(statusFilter || undefined);
  const summary = useBatchSummary();
  const submitBatch = useSubmitBatch();

  const [showBatch, setShowBatch] = useState(false);
  const [batchPrompts, setBatchPrompts] = useState("");

  const handleSubmitBatch = () => {
    const prompts = batchPrompts
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    if (prompts.length === 0) return;
    submitBatch.mutate(
      prompts.map((prompt) => ({ prompt })),
      { onSuccess: () => { setBatchPrompts(""); setShowBatch(false); } },
    );
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-3.5 h-3.5 text-green-400" />;
      case "failed": return <XCircle className="w-3.5 h-3.5 text-red-400" />;
      case "queued": return <Clock className="w-3.5 h-3.5 text-muted" />;
      default: return <Play className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />;
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-widest text-accent flex items-center gap-2">
            <ListTodo className="w-5 h-5" /> BATCH PROCESSING
          </h1>
          <button
            onClick={() => setShowBatch(!showBatch)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 text-accent border border-accent/30 rounded text-xs font-mono hover:bg-accent/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> New Batch
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Total", value: summary.data?.total ?? 0, color: "text-foreground" },
            { label: "Queued", value: summary.data?.queued ?? 0, color: "text-muted" },
            { label: "In Progress", value: summary.data?.inProgress ?? 0, color: "text-yellow-400" },
            { label: "Completed", value: summary.data?.completed ?? 0, color: "text-green-400" },
            { label: "Failed", value: summary.data?.failed ?? 0, color: "text-red-400" },
          ].map((s) => (
            <div key={s.label} className="border border-panel-border rounded p-3 bg-black/20 text-center">
              <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
              <div className="text-[10px] font-mono text-muted mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Batch submit */}
        {showBatch && (
          <div className="border border-accent/30 rounded-lg p-4 bg-accent/5">
            <div className="text-xs font-mono text-accent mb-2">Enter one prompt per line:</div>
            <textarea
              value={batchPrompts}
              onChange={(e) => setBatchPrompts(e.target.value)}
              placeholder={"A cyberpunk ninja warrior in T-pose\nA medieval knight with heavy plate armor\nA space pirate captain with energy sword"}
              className="w-full bg-black/40 border border-panel-border rounded p-3 text-sm font-mono text-foreground focus:border-primary/50 outline-none min-h-[120px]"
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px] font-mono text-muted">
                {batchPrompts.split("\n").filter((l) => l.trim()).length} prompts
              </span>
              <button
                onClick={handleSubmitBatch}
                disabled={submitBatch.isPending || !batchPrompts.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-accent/10 text-accent border border-accent/30 rounded text-xs font-mono hover:bg-accent/20 disabled:opacity-50 transition-all"
              >
                <Play className="w-3.5 h-3.5" /> Submit Batch
              </button>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2">
          {["", "queued", "completed", "failed"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-xs font-mono rounded border transition-all ${
                statusFilter === s
                  ? "border-primary text-primary bg-primary/10"
                  : "border-panel-border text-muted hover:text-foreground"
              }`}
            >
              {s || "All"}
            </button>
          ))}
        </div>

        {/* Jobs list */}
        <div className="space-y-2">
          {jobs.data?.map((j) => (
            <div key={j.id} className="border border-panel-border rounded-lg p-4 bg-black/20 hover:border-primary/20 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {statusIcon(j.status)}
                  <div>
                    <div className="font-bold text-sm">{j.prompt.slice(0, 80)}{j.prompt.length > 80 ? "..." : ""}</div>
                    <div className="text-[11px] text-muted font-mono flex gap-3 mt-1">
                      <span className={j.status === "completed" ? "text-green-400" : j.status === "failed" ? "text-red-400" : "text-yellow-400"}>
                        {j.status}
                      </span>
                      <span>Step {j.currentStep}/{j.totalSteps}</span>
                      {j.error && <span className="text-red-400">{j.error}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-[9px] font-mono text-muted">
                  {new Date(j.createdAt).toLocaleDateString()}
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1 bg-panel-border rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    j.status === "completed" ? "bg-green-400" :
                    j.status === "failed" ? "bg-red-400" : "bg-accent"
                  }`}
                  style={{ width: `${(j.currentStep / j.totalSteps) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {jobs.data?.length === 0 && (
            <div className="text-center py-12 text-muted font-mono text-sm">
              No pipeline jobs found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
