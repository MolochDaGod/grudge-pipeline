import { useState } from "react";
import { Music, Plus } from "lucide-react";
import { useAnimations, useCreateAnimation } from "../hooks/use-grudge-assets";
import type { CharacterClass } from "../types/grudge";

const CLASSES: CharacterClass[] = ["warrior", "mage", "ranger", "worge"];
const SKELETON_TYPES = ["mixamo_65", "mixamo_49", "mixamo_41", "mixamo_25", "custom"];

export default function Animations() {
  const [classFilter, setClassFilter] = useState<string>("");
  const animations = useAnimations(classFilter ? { characterClass: classFilter } : undefined);
  const createAnimation = useCreateAnimation();

  const [showCreate, setShowCreate] = useState(false);
  const [newSetName, setNewSetName] = useState("");
  const [newClass, setNewClass] = useState<string>("warrior");
  const [newSkeleton, setNewSkeleton] = useState("mixamo_65");
  const [newWeaponCtx, setNewWeaponCtx] = useState("");

  const handleCreate = () => {
    if (!newSetName.trim()) return;
    createAnimation.mutate({
      animationSetName: newSetName.trim(),
      characterClass: newClass,
      skeletonType: newSkeleton as any,
      weaponContext: newWeaponCtx || undefined,
      animationUrls: {},
    }, {
      onSuccess: () => {
        setNewSetName("");
        setShowCreate(false);
      },
    });
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-widest text-purple-400 flex items-center gap-2">
            <Music className="w-5 h-5" /> ANIMATION MAPPINGS
          </h1>
          <div className="flex gap-2">
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="bg-black/40 border border-panel-border rounded px-3 py-1.5 text-xs font-mono text-foreground focus:border-primary/50 outline-none"
            >
              <option value="">All Classes</option>
              {CLASSES.map((c) => (
                <option key={c} value={c}>{c.toUpperCase()}</option>
              ))}
            </select>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-400/10 text-purple-400 border border-purple-400/30 rounded text-xs font-mono hover:bg-purple-400/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> New Mapping
            </button>
          </div>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="border border-purple-400/30 rounded-lg p-4 bg-purple-400/5">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input
                type="text"
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                placeholder="Animation set name..."
                className="bg-black/40 border border-panel-border rounded px-3 py-2 text-sm font-mono text-foreground focus:border-primary/50 outline-none"
              />
              <select
                value={newClass}
                onChange={(e) => setNewClass(e.target.value)}
                className="bg-black/40 border border-panel-border rounded px-3 py-2 text-sm font-mono text-foreground focus:border-primary/50 outline-none"
              >
                {CLASSES.map((c) => (
                  <option key={c} value={c}>{c.toUpperCase()}</option>
                ))}
              </select>
              <select
                value={newSkeleton}
                onChange={(e) => setNewSkeleton(e.target.value)}
                className="bg-black/40 border border-panel-border rounded px-3 py-2 text-sm font-mono text-foreground focus:border-primary/50 outline-none"
              >
                {SKELETON_TYPES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                type="text"
                value={newWeaponCtx}
                onChange={(e) => setNewWeaponCtx(e.target.value)}
                placeholder="Weapon context (e.g. sword+shield)"
                className="bg-black/40 border border-panel-border rounded px-3 py-2 text-sm font-mono text-foreground focus:border-primary/50 outline-none"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={!newSetName.trim() || createAnimation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-400/10 text-purple-400 border border-purple-400/30 rounded text-xs font-mono hover:bg-purple-400/20 disabled:opacity-50 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Create Animation Mapping
            </button>
          </div>
        )}

        {/* Animation list */}
        <div className="space-y-2">
          {animations.data?.map((a) => (
            <div key={a.id} className="border border-panel-border rounded-lg p-4 bg-black/20 hover:border-purple-400/30 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm">{a.animationSetName}</div>
                  <div className="text-[11px] text-muted font-mono flex gap-3 mt-1">
                    {a.characterClass && <span className="text-purple-400">{a.characterClass}</span>}
                    <span>{a.skeletonType}</span>
                    {a.weaponContext && <span>weapon: {a.weaponContext}</span>}
                    <span>{Object.keys(a.animationUrls).filter((k) => a.animationUrls[k]).length} animations</span>
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(a.animationUrls)
                    .filter(([_, url]) => url)
                    .slice(0, 5)
                    .map(([key]) => (
                      <span key={key} className="text-[9px] font-mono bg-purple-400/10 text-purple-400 px-1.5 py-0.5 rounded">
                        {key}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          ))}
          {animations.data?.length === 0 && (
            <div className="text-center py-12 text-muted font-mono text-sm">
              No animation mappings yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
