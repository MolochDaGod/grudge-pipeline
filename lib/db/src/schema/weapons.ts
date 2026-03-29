import { pgTable, uuid, text, real, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const weaponTypeEnum = pgEnum("weapon_type", [
  "sword",
  "2h_sword",
  "shield",
  "staff",
  "tome",
  "mace",
  "wand",
  "bow",
  "crossbow",
  "gun",
  "dagger",
  "spear",
  "hammer",
  "off_hand_relic",
  "2h_weapon",
  "cape",
  "trinket",
]);

export const weaponConfigs = pgTable("weapon_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  weaponAssetId: uuid("weapon_asset_id"),
  weaponType: weaponTypeEnum("weapon_type").notNull(),
  name: text("name").notNull(),
  meshUrl: text("mesh_url"),
  thumbnailUrl: text("thumbnail_url"),

  // Mount point on the skeleton
  mountBone: text("mount_bone").notNull().default("mixamorig:RightHand"),

  // Offset from mount bone
  offsetX: real("offset_x").notNull().default(0),
  offsetY: real("offset_y").notNull().default(0),
  offsetZ: real("offset_z").notNull().default(0),

  // Rotation adjustment
  rotationX: real("rotation_x").notNull().default(0),
  rotationY: real("rotation_y").notNull().default(0),
  rotationZ: real("rotation_z").notNull().default(0),

  // Scale
  scaleMultiplier: real("scale_multiplier").notNull().default(1.0),

  // Class restrictions
  allowedClasses: text("allowed_classes").array(),

  // Extended metadata (damage, stats, etc.)
  metadata: jsonb("metadata").$type<{
    damage?: number;
    attackSpeed?: number;
    range?: number;
    tier?: number;
    rarity?: string;
    effects?: string[];
    [key: string]: unknown;
  }>(),

  grudgeAssetUuid: text("grudge_asset_uuid"),
  grudgeId: text("grudge_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWeaponConfigSchema = createInsertSchema(weaponConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWeaponConfig = z.infer<typeof insertWeaponConfigSchema>;
export type WeaponConfig = typeof weaponConfigs.$inferSelect;
