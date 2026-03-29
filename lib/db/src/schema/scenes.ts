import { pgTable, uuid, text, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sceneTemplateEnum = pgEnum("scene_template", [
  "custom",
  "arena",
  "island",
  "dungeon",
  "moba_lane",
  "port_city",
  "pirate_cove",
  "boss_arena",
]);

export const scenes = pgTable("scenes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  grudgeId: text("grudge_id"),
  template: sceneTemplateEnum("template").notNull().default("custom"),
  description: text("description"),

  // Scene data stored as JSONB
  placements: jsonb("placements").$type<Array<{
    assetId: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    layer: string;
    metadata?: Record<string, unknown>;
  }>>().default([]),

  environment: jsonb("environment").$type<{
    skybox?: string;
    ambientLight?: { color: string; intensity: number };
    directionalLight?: { color: string; intensity: number; direction: { x: number; y: number; z: number } };
    fog?: { color: string; near: number; far: number };
    terrain?: string;
  }>().default({}),

  lighting: jsonb("lighting").$type<{
    lights: Array<{
      type: "point" | "spot" | "directional" | "ambient";
      color: string;
      intensity: number;
      position?: { x: number; y: number; z: number };
      target?: { x: number; y: number; z: number };
      castShadow?: boolean;
    }>;
  }>().default({ lights: [] }),

  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSceneSchema = createInsertSchema(scenes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertScene = z.infer<typeof insertSceneSchema>;
export type Scene = typeof scenes.$inferSelect;
