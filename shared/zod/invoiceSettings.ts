// Invoice Settings Validation Schemas

import { z } from 'zod';

// Payment account schema for bank, mobile money, etc.
export const PaymentAccountSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['BANK', 'MOBILE_MONEY', 'WALLET']),
  provider: z.string().min(1).max(100),   // e.g. "Stanbic Bank", "MTN Mobile Money", "Airtel Money"
  accountName: z.string().min(1).max(255),
  accountNumber: z.string().min(1).max(100),
  branchOrCode: z.string().max(100).optional(), // bank branch or short code
  isActive: z.boolean().default(true),
  showOnReceipt: z.boolean().default(true),
  showOnInvoice: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export type PaymentAccount = z.infer<typeof PaymentAccountSchema>;

export const InvoiceTemplateType = z.enum(['modern', 'classic', 'minimal', 'professional']);

// Helper schema for nullable empty strings (convert empty strings to null)
// Nullable string helper removed - not used in current schema

export const InvoiceSettingsSchema = z.object({
  id: z.string().uuid(),

  // Company Information
  companyName: z.string().min(1, 'Company name is required').max(255, 'Company name too long').trim(),
  companyAddress: z.string().max(1000, 'Address too long').nullable(),
  companyPhone: z.string().max(50, 'Phone number too long').nullable(),
  companyEmail: z.string().email('Invalid email format').max(255).nullable().or(z.literal(null)),
  companyTin: z.string().max(100, 'TIN too long').nullable(),
  companyLogoUrl: z.string().url('Invalid URL format').max(500).nullable().or(z.literal(null)),

  // Template Settings
  templateType: InvoiceTemplateType,

  // Color Theme (strict hex validation)
  primaryColor: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Primary color must be valid hex format (#RRGGBB)')
    .default('#2563eb'),
  secondaryColor: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Secondary color must be valid hex format (#RRGGBB)')
    .default('#10b981'),

  // Display Options (strict booleans)
  showCompanyLogo: z.boolean().default(false),
  showTaxBreakdown: z.boolean().default(true),
  showPaymentInstructions: z.boolean().default(true),

  // Payment Accounts
  paymentAccounts: z.array(PaymentAccountSchema).default([]),

  // Text Content
  paymentInstructions: z.string().max(2000, 'Payment instructions too long').nullable(),
  termsAndConditions: z.string().max(5000, 'Terms and conditions too long').nullable(),
  footerText: z.string().max(500, 'Footer text too long').nullable(),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const UpdateInvoiceSettingsSchema = z.object({
  companyName: z.string().min(1, 'Company name cannot be empty').max(255).trim().optional(),
  companyAddress: z.preprocess(
    val => val === '' ? null : val,
    z.string().max(1000).nullable().optional()
  ),
  companyPhone: z.preprocess(
    val => val === '' ? null : val,
    z.string().max(50).nullable().optional()
  ),
  companyEmail: z.preprocess(
    val => val === '' ? null : val,
    z.string().email('Invalid email format').max(255).nullable().optional()
  ),
  companyTin: z.preprocess(
    val => val === '' ? null : val,
    z.string().max(100).nullable().optional()
  ),
  companyLogoUrl: z.preprocess(
    val => val === '' ? null : val,
    z.string().url('Invalid URL format').max(500).nullable().optional()
  ),

  templateType: InvoiceTemplateType.optional(),

  primaryColor: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Primary color must be valid hex format (#RRGGBB)')
    .optional(),
  secondaryColor: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Secondary color must be valid hex format (#RRGGBB)')
    .optional(),

  showCompanyLogo: z.boolean().optional(),
  showTaxBreakdown: z.boolean().optional(),
  showPaymentInstructions: z.boolean().optional(),

  paymentAccounts: z.array(PaymentAccountSchema).optional(),

  paymentInstructions: z.preprocess(
    val => val === '' ? null : val,
    z.string().max(2000, 'Payment instructions too long').nullable().optional()
  ),
  termsAndConditions: z.preprocess(
    val => val === '' ? null : val,
    z.string().max(5000, 'Terms and conditions too long').nullable().optional()
  ),
  footerText: z.preprocess(
    val => val === '' ? null : val,
    z.string().max(500, 'Footer text too long').nullable().optional()
  ),
}).strict();

export type InvoiceSettings = z.infer<typeof InvoiceSettingsSchema>;
export type UpdateInvoiceSettings = z.infer<typeof UpdateInvoiceSettingsSchema>;
export type TemplateType = z.infer<typeof InvoiceTemplateType>;
