// Invoice Settings Repository

import { Pool } from 'pg';

export interface InvoiceSettings {
  id: string;
  companyName: string;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyTin: string | null;
  companyLogoUrl: string | null;
  templateType: string;
  primaryColor: string;
  secondaryColor: string;
  showCompanyLogo: boolean;
  showTaxBreakdown: boolean;
  showPaymentInstructions: boolean;
  paymentInstructions: string | null;
  termsAndConditions: string | null;
  footerText: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getInvoiceSettings(pool: Pool): Promise<InvoiceSettings | null> {
  const result = await pool.query(
    `SELECT 
      id,
      company_name as "companyName",
      company_address as "companyAddress",
      company_phone as "companyPhone",
      company_email as "companyEmail",
      company_tin as "companyTin",
      company_logo_url as "companyLogoUrl",
      template_type as "templateType",
      primary_color as "primaryColor",
      secondary_color as "secondaryColor",
      show_company_logo as "showCompanyLogo",
      show_tax_breakdown as "showTaxBreakdown",
      show_payment_instructions as "showPaymentInstructions",
      payment_instructions as "paymentInstructions",
      terms_and_conditions as "termsAndConditions",
      footer_text as "footerText",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM invoice_settings
    LIMIT 1`
  );

  return result.rows[0] || null;
}

export async function initializeDefaults(pool: Pool): Promise<InvoiceSettings> {
  const result = await pool.query(
    `INSERT INTO invoice_settings (
      company_name,
      company_address,
      company_phone,
      company_email,
      company_tin,
      template_type,
      primary_color,
      secondary_color,
      payment_instructions,
      footer_text
    ) VALUES (
      'SMART ERP',
      'Kampala, Uganda',
      '+256 700 000 000',
      'info@smarterp.com',
      'TIN: 1000000000',
      'modern',
      '#2563eb',
      '#10b981',
      'Payment can be made via Mobile Money, Bank Transfer, or Cash.',
      'Thank you for your business!'
    )
    RETURNING 
      id,
      company_name as "companyName",
      company_address as "companyAddress",
      company_phone as "companyPhone",
      company_email as "companyEmail",
      company_tin as "companyTin",
      company_logo_url as "companyLogoUrl",
      template_type as "templateType",
      primary_color as "primaryColor",
      secondary_color as "secondaryColor",
      show_company_logo as "showCompanyLogo",
      show_tax_breakdown as "showTaxBreakdown",
      show_payment_instructions as "showPaymentInstructions",
      payment_instructions as "paymentInstructions",
      terms_and_conditions as "termsAndConditions",
      footer_text as "footerText",
      created_at as "createdAt",
      updated_at as "updatedAt"`
  );

  return result.rows[0];
}

export async function updateInvoiceSettings(
  pool: Pool,
  data: Partial<Omit<InvoiceSettings, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<InvoiceSettings> {
  // Build dynamic UPDATE query
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.companyName !== undefined) {
    fields.push(`company_name = $${paramIndex++}`);
    values.push(data.companyName);
  }
  if (data.companyAddress !== undefined) {
    fields.push(`company_address = $${paramIndex++}`);
    values.push(data.companyAddress);
  }
  if (data.companyPhone !== undefined) {
    fields.push(`company_phone = $${paramIndex++}`);
    values.push(data.companyPhone);
  }
  if (data.companyEmail !== undefined) {
    fields.push(`company_email = $${paramIndex++}`);
    values.push(data.companyEmail);
  }
  if (data.companyTin !== undefined) {
    fields.push(`company_tin = $${paramIndex++}`);
    values.push(data.companyTin);
  }
  if (data.companyLogoUrl !== undefined) {
    fields.push(`company_logo_url = $${paramIndex++}`);
    values.push(data.companyLogoUrl);
  }
  if (data.templateType !== undefined) {
    fields.push(`template_type = $${paramIndex++}`);
    values.push(data.templateType);
  }
  if (data.primaryColor !== undefined) {
    fields.push(`primary_color = $${paramIndex++}`);
    values.push(data.primaryColor);
  }
  if (data.secondaryColor !== undefined) {
    fields.push(`secondary_color = $${paramIndex++}`);
    values.push(data.secondaryColor);
  }
  if (data.showCompanyLogo !== undefined) {
    fields.push(`show_company_logo = $${paramIndex++}`);
    values.push(data.showCompanyLogo);
  }
  if (data.showTaxBreakdown !== undefined) {
    fields.push(`show_tax_breakdown = $${paramIndex++}`);
    values.push(data.showTaxBreakdown);
  }
  if (data.showPaymentInstructions !== undefined) {
    fields.push(`show_payment_instructions = $${paramIndex++}`);
    values.push(data.showPaymentInstructions);
  }
  if (data.paymentInstructions !== undefined) {
    fields.push(`payment_instructions = $${paramIndex++}`);
    values.push(data.paymentInstructions);
  }
  if (data.termsAndConditions !== undefined) {
    fields.push(`terms_and_conditions = $${paramIndex++}`);
    values.push(data.termsAndConditions);
  }
  if (data.footerText !== undefined) {
    fields.push(`footer_text = $${paramIndex++}`);
    values.push(data.footerText);
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);

  const result = await pool.query(
    `UPDATE invoice_settings
     SET ${fields.join(', ')}
     RETURNING 
      id,
      company_name as "companyName",
      company_address as "companyAddress",
      company_phone as "companyPhone",
      company_email as "companyEmail",
      company_tin as "companyTin",
      company_logo_url as "companyLogoUrl",
      template_type as "templateType",
      primary_color as "primaryColor",
      secondary_color as "secondaryColor",
      show_company_logo as "showCompanyLogo",
      show_tax_breakdown as "showTaxBreakdown",
      show_payment_instructions as "showPaymentInstructions",
      payment_instructions as "paymentInstructions",
      terms_and_conditions as "termsAndConditions",
      footer_text as "footerText",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    values
  );

  return result.rows[0];
}
