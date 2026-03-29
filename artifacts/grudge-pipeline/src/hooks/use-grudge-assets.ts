import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PipelineAsset, CatalogAsset, PipelineJob, BatchSummary, Scene, AnimationMapping } from "../types/grudge";

const fetchApi = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

// ── Pipeline Assets ──────────────────────────────────────────────────────────

export function usePipelineAssets() {
  return useQuery({
    queryKey: ["pipelineAssets"],
    queryFn: () => fetchApi<{ assets: PipelineAsset[] }>("/assets"),
    select: (d) => d.assets,
  });
}

export function useBrowseCatalog(params: { type?: string; search?: string; page?: number }) {
  return useQuery({
    queryKey: ["catalog", params],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params.type) qs.set("type", params.type);
      if (params.search) qs.set("search", params.search);
      if (params.page) qs.set("page", String(params.page));
      return fetchApi<{ total: number; assets: CatalogAsset[] }>(`/assets/browse?${qs}`);
    },
  });
}

export function useCatalogCategories() {
  return useQuery({
    queryKey: ["catalogCategories"],
    queryFn: () => fetchApi<{ total: number; categories: { category: string; count: number }[] }>("/assets/categories"),
  });
}

export function useUploadFromPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      modelUrl: string; filename: string; name?: string;
      category?: string; pipelineJobId?: string; sourceStep?: string;
      sourceTaskId?: string; tags?: string[]; polycount?: number;
    }) => fetchApi<{ asset: PipelineAsset; grudgeUuid: string; url: string }>(
      "/assets/upload-from-pipeline", { method: "POST", body: JSON.stringify(data) },
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipelineAssets"] }),
  });
}

// ── Scenes ───────────────────────────────────────────────────────────────────

export function useScenes() {
  return useQuery({
    queryKey: ["scenes"],
    queryFn: () => fetchApi<{ scenes: Scene[] }>("/scenes"),
    select: (d) => d.scenes,
  });
}

export function useCreateScene() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Scene>) =>
      fetchApi<{ scene: Scene }>("/scenes", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenes"] }),
  });
}

export function useUpdateScene() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Scene> & { id: string }) =>
      fetchApi<{ scene: Scene }>(`/scenes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenes"] }),
  });
}

// ── Animations ───────────────────────────────────────────────────────────────

export function useAnimations(params?: { characterClass?: string }) {
  return useQuery({
    queryKey: ["animations", params],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params?.characterClass) qs.set("characterClass", params.characterClass);
      return fetchApi<{ animations: AnimationMapping[] }>(`/animations?${qs}`);
    },
    select: (d) => d.animations,
  });
}

export function useCreateAnimation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AnimationMapping>) =>
      fetchApi<{ animation: AnimationMapping }>("/animations", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["animations"] }),
  });
}

// ── Batch / Jobs ─────────────────────────────────────────────────────────────

export function usePipelineJobs(status?: string) {
  return useQuery({
    queryKey: ["pipelineJobs", status],
    queryFn: () => {
      const qs = status ? `?status=${status}` : "";
      return fetchApi<{ jobs: PipelineJob[] }>(`/batch/jobs${qs}`);
    },
    select: (d) => d.jobs,
    refetchInterval: 5000,
  });
}

export function useBatchSummary() {
  return useQuery({
    queryKey: ["batchSummary"],
    queryFn: () => fetchApi<BatchSummary>("/batch/summary"),
    refetchInterval: 5000,
  });
}

export function useSubmitBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobs: Array<{ prompt: string; config?: Record<string, unknown> }>) =>
      fetchApi<{ batchSize: number; jobs: PipelineJob[] }>("/batch/generate", {
        method: "POST",
        body: JSON.stringify({ jobs }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelineJobs"] });
      qc.invalidateQueries({ queryKey: ["batchSummary"] });
    },
  });
}
