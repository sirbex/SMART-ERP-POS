// System Settings Validation Schema
// Schema for application-wide configuration settings

import { z } from 'zod';

/**
 * System setting category types
 */
export const SettingCategorySchema = z.enum([
  'GENERAL',
  'SALES',
  'INVENTORY',
  'ACCOUNTING',
  'SECURITY',
  'NOTIFICATIONS',
  'INTEGRATION',
  'APPEARANCE',
]);

export type SettingCategory = z.infer<typeof SettingCategorySchema>;

/**
 * System setting value types
 */
export const SettingValueTypeSchema = z.enum([
  'STRING',
  'NUMBER',
  'BOOLEAN',
  'JSON',
  'DATE',
]);

export type SettingValueType = z.infer<typeof SettingValueTypeSchema>;

/**
 * System setting validation schema
 */
export const SystemSettingSchema = z
  .object({
    id: z.string().uuid(),
    settingsKey: z
      .string()
      .min(1, 'Settings key is required')
      .max(255)
      .regex(/^[A-Z_]+$/, 'Settings key must be uppercase with underscores'),
    settingsValue: z.string().max(1000),
    valueType: SettingValueTypeSchema,
    category: SettingCategorySchema,
    description: z.string().max(500).optional().nullable(),
    isEncrypted: z.boolean().default(false),
    isReadOnly: z.boolean().default(false),
    isActive: z.boolean().default(true),
    defaultValue: z.string().max(1000).optional().nullable(),
    validationRule: z.string().max(500).optional().nullable(), // JSON string for validation rules
    displayOrder: z.number().int().nonnegative().default(0),
    lastModifiedBy: z.string().uuid().optional().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type SystemSetting = z.infer<typeof SystemSettingSchema>;

/**
 * Create system setting schema (without generated fields)
 */
export const CreateSystemSettingSchema = SystemSettingSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateSystemSettingInput = z.infer<typeof CreateSystemSettingSchema>;

/**
 * Update system setting schema (partial except key)
 */
export const UpdateSystemSettingSchema = SystemSettingSchema.omit({
  id: true,
  settingsKey: true, // Cannot change key
  createdAt: true,
  updatedAt: true,
  lastModifiedBy: true,
}).partial();

export type UpdateSystemSettingInput = z.infer<typeof UpdateSystemSettingSchema>;

/**
 * Bulk update settings schema
 */
export const BulkUpdateSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        settingsKey: z.string(),
        settingsValue: z.string(),
      })
    )
    .min(1, 'At least one setting required'),
  userId: z.string().uuid(),
});

export type BulkUpdateSettingsInput = z.infer<typeof BulkUpdateSettingsSchema>;

/**
 * Query filter schema
 */
export const SystemSettingsFilterSchema = z.object({
  category: SettingCategorySchema.optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
});

export type SystemSettingsFilter = z.infer<typeof SystemSettingsFilterSchema>;
