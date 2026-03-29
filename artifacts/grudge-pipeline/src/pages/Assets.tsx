import { useState } from "react";
import { Search, Database, ExternalLink, Download, FolderOpen } from "lucide-react";
import { usePipelineAssets, useBrowseCatalog, useCatalogCategories } from "../hooks/use-grudge-assets";

export default function Assets() {
  const [tab, setTab] = useState<"pipeline" | "catalog">("pipeline");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const pipelineAssets = usePipelineAssets();
  const catalog = useBrowseCatalog({ type: categoryFilter || undefined, search: search || undefined });
  const categories = useCatalogCategories();

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-widest text-primary flex items-center gap-2">
            <Database className="w-5 h-5" /> ASSET MANAGER
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => setTab("pipeline")}
              className={`px-3 py-1.5 text-xs font-mono rounded border transition-all ${
                tab === "pipeline"
                  ? "border-primary text-primary bg-primary/10"
                  : "border-panel-border text-muted hover:text-foreground"
              }`}
            >
              Pipeline Assets
            </button>
            <button
              onClick={() => setTab("catalog")}
              className={`px-3 py-1.5 text-xs font-mono rounded border transition-all ${
                tab === "catalog"
                  ? "border-primary text-primary bg-primary/10"
                  : "border-panel-border text-muted hover:text-foreground"
              }`}
            >
              Grudge Catalog
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets..."
              className="w-full bg-black/40 border border-panel-border rounded pl-10 pr-4 py-2 text-sm font-mono text-foreground focus:border-primary/50 outline-none"
            />
          </div>
          {tab === "catalog" && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-black/40 border border-panel-border rounded px-3 py-2 text-sm font-mono text-foreground focus:border-primary/50 outline-none"
            >
              <option value="">All Categories</option>
              {categories.data?.categories?.map((c) => (
                <option key={c.category} value={c.category}>
                  {c.category} ({c.count})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Asset grid */}
        {tab === "pipeline" ? (
          <div className="space-y-2">
            {pipelineAssets.data?.length === 0 && (
              <div className="text-center py-12 text-muted font-mono text-sm">
                <FolderOpen className="w-8 h-8 mx-auto mb-3 opacity-50" />
                No pipeline assets yet. Generate characters in the Pipeline tab.
              </div>
            )}
            {pipelineAssets.data?.map((a) => (
              <div
                key={a.id}
                className="border border-panel-border rounded-lg p-4 bg-black/20 hover:border-primary/30 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm">{a.name}</div>
                    <div className="text-[11px] text-muted font-mono flex gap-3 mt-1">
                      <span>{a.category}</span>
                      <span>{a.fileFormat?.toUpperCase()}</span>
                      {a.polycount && <span>{(a.polycount / 1000).toFixed(0)}k polys</span>}
                      {a.fileSize && <span>{(a.fileSize / 1024).toFixed(0)} KB</span>}
                      <span>{a.source}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {a.meshUrl && (
                      <button
                        onClick={() => window.open(a.meshUrl!, "_blank")}
                        className="p-2 rounded border border-panel-border hover:border-primary/50 text-muted hover:text-primary transition-all"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    {a.grudgeAssetUuid && (
                      <span className="text-[9px] font-mono text-primary/50 self-center">
                        R2: {a.grudgeAssetUuid.slice(0, 8)}...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-muted font-mono mb-2">
              {catalog.data?.total ?? 0} assets in Grudge catalog
            </div>
            {catalog.data?.assets?.map((a) => (
              <div
                key={a.uuid}
                className="border border-panel-border rounded-lg p-4 bg-black/20 hover:border-primary/30 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm">{a.name}</div>
                    <div className="text-[11px] text-muted font-mono flex gap-3 mt-1">
                      <span>{a.type}</span>
                      {a.sizeBytes > 0 && <span>{(a.sizeBytes / 1024).toFixed(0)} KB</span>}
                      {a.tags?.length > 0 && <span>{a.tags.join(", ")}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => window.open(a.url, "_blank")}
                    className="p-2 rounded border border-panel-border hover:border-primary/50 text-muted hover:text-primary transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
