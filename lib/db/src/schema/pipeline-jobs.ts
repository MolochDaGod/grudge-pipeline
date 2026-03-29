import { pgTable, uuid, text, integer, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pipelineStatusEnum = pgEnum("pipeline_status", [
  "queued",
  "concept_art",
  "preview",
  "refine",
  "retexture",
  "remesh",
  "rig",
  "uploading",
  "completed",
  "failed",
]);

export const pipelineJobs = pgTable("pipeline_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  grudgeId: text("grudge_id"),
  prompt: text("prompt").notNull(),
  status: pipelineStatusEnum("status").notNull().default("queued"),
  currentStep: integer("current_step").notNull().default(0),
  totalSteps: integer("total_steps").notNull().default(6),

  // Meshy task IDs for each step
  conceptTaskId: text("concept_task_id"),
  previewTaskId: text("preview_task_id"),
  refineTaskId: text("refine_task_id"),
  retextureTaskId: text("retexture_task_id"),
  remeshTaskId: text("remesh_task_id"),
  rigTaskId: text("rig_task_id"),

  // Final output references
  finalMeshUrl: text("final_mesh_url"),
  finalRigUrl: text("final_rig_url"),
  finalThumbnailUrl: text("final_thumbnail_url"),

  // Grudge asset UUIDs after upload
  meshAssetUuid: text("mesh_asset_uuid"),
  rigAssetUuid: text("rig_asset_uuid"),

  // Pipeline config
  config: jsonb("config").$type<{
    ai_model?: string;
    topology?: string;
    target_polycount?: number;
    pose_mode?: string;
    enable_pbr?: boolean;
    target_formats?: string[];
    height_meters?: number;
  }>(),

  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertPipelineJobSchema = createInsertSchema(pipelineJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export type InsertPipelineJob = z.infer<typeof insertPipelineJobSchema>;
export type PipelineJob = typeof pipelineJobs.$inferSelect;
