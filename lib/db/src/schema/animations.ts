import { pgTable, uuid, text, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const skeletonTypeEnum = pgEnum("skeleton_type", [
  "mixamo_65",
  "mixamo_49",
  "mixamo_41",
  "mixamo_25",
  "custom",
]);

export const animationMappings = pgTable("animation_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  characterAssetId: uuid("character_asset_id"),
  animationSetName: text("animation_set_name").notNull(),
  skeletonType: skeletonTypeEnum("skeleton_type").notNull().default("mixamo_65"),
  characterClass: text("character_class"),
  weaponContext: text("weapon_context"),

  // Animation URLs keyed by action name
  animationUrls: jsonb("animation_urls").$type<{
    idle?: string;
    walk?: string;
    run?: string;
    jump?: string;
    attack_1?: string;
    attack_2?: string;
    attack_3?: string;
    dodge?: string;
    block?: string;
    parry?: string;
    death?: string;
    harvest?: string;
    cast?: string;
    sprint?: string;
    strafe_left?: string;
    strafe_right?: string;
    walk_backward?: string;
    combo_1?: string;
    combo_2?: string;
    combo_3?: string;
    [key: string]: string | undefined;
  }>().notNull(),

  // Retargeting config for skeleton compatibility
  retargetConfig: jsonb("retarget_config").$type<{
    sourceSkeletonType?: string;
    boneMapping?: Record<string, string>;
    scaleAdjustment?: number;
  }>(),

  grudgeId: text("grudge_id"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAnimationMappingSchema = createInsertSchema(animationMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAnimationMapping = z.infer<typeof insertAnimationMappingSchema>;
export type AnimationMapping = typeof animationMappings.$inferSelect;
