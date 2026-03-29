import { pgTable, uuid, text, integer, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assetCategoryEnum = pgEnum("asset_category", [
  "model",
  "texture",
  "sprite",
  "animation",
  "audio",
  "video",
  "icon",
  "ui",
  "config",
  "bundle",
  "avatar",
  "build",
  "other",
]);

export const pipelineAssets = pgTable("pipeline_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  grudgeAssetUuid: text("grudge_asset_uuid"),
  pipelineJobId: uuid("pipeline_job_id"),
  category: assetCategoryEnum("category").notNull().default("model"),
  name: text("name").notNull(),
  meshUrl: text("mesh_url"),
  thumbnailUrl: text("thumbnail_url"),
  source: text("source").notNull().default("meshy"),
  sourceStep: text("source_step"),
  sourceTaskId: text("source_task_id"),
  fileFormat: text("file_format"),
  polycount: integer("polycount"),
  fileSize: integer("file_size"),

  tags: text("tags").array(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),

  grudgeId: text("grudge_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPipelineAssetSchema = createInsertSchema(pipelineAssets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPipelineAsset = z.infer<typeof insertPipelineAssetSchema>;
export type PipelineAsset = typeof pipelineAssets.$inferSelect;
