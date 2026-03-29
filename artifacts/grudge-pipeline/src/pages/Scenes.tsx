import { useState } from "react";
import { Map, Plus, Trash2, Download } from "lucide-react";
import { useScenes, useCreateScene } from "../hooks/use-grudge-assets";

const TEMPLATES = ["custom", "arena", "island", "dungeon", "moba_lane", "port_city", "pirate_cove", "boss_arena"];

export default function Scenes() {
  const scenes = useScenes();
  const createScene = useCreateScene();
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("custom");

  const handleCreate = () => {
    if (!newName.trim()) return;
    createScene.mutate({ name: newName.trim(), template: newTemplate as any }, {
      onSuccess: () => setNewName(""),
    });
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-xl font-bold tracking-widest text-blue-400 flex items-center gap-2">
          <Map className="w-5 h-5" /> SCENE EDITOR
        </h1>

        {/* Create scene */}
        <div className="border border-panel-border rounded-lg p-4 bg-black/20">
          <div className="text-xs font-mono text-muted mb-3">NEW SCENE</div>
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Scene name..."
              className="flex-1 bg-black/40 border border-panel-border rounded px-3 py-2 text-sm font-mono text-foreground focus:border-primary/50 outline-none"
            />
            <select
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
              className="bg-black/40 border border-panel-border rounded px-3 py-2 text-sm font-mono text-foreground focus:border-primary/50 outline-none"
            >
              {TEMPLATES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ").toUpperCase()}</option>
              ))}
            </select>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || createScene.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-400/10 text-blue-400 border border-blue-400/30 rounded text-xs font-mono hover:bg-blue-400/20 disabled:opacity-50 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Create
            </button>
          </div>
        </div>

        {/* Scene list */}
        <div className="space-y-3">
          {scenes.data?.map((s) => (
            <div key={s.id} className="border border-panel-border rounded-lg p-4 bg-black/20 hover:border-blue-400/30 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm">{s.name}</div>
                  <div className="text-[11px] text-muted font-mono flex gap-3 mt-1">
                    <span className="text-blue-400">{s.template}</span>
                    <span>{(s.placements as any[])?.length ?? 0} assets placed</span>
                    {s.description && <span>{s.description}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.open(`/api/scenes/${s.id}/export`, "_blank")}
                    className="p-2 rounded border border-panel-border hover:border-blue-400/50 text-muted hover:text-blue-400 transition-all"
                    title="Export scene JSON"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {scenes.data?.length === 0 && (
            <div className="text-center py-12 text-muted font-mono text-sm">
              No scenes yet. Create one above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
