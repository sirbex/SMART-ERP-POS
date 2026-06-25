/**
 * BaseDocumentLayout — the master template.
 *
 * The ONLY place that:
 *   • opens a pdfkit document
 *   • draws header (logo, company info, document title)
 *   • draws footer (page n/N, footer text)
 *   • exposes layout primitives (table, kvGrid, sectionTitle, hr, totalsBlock)
 *
 * Document bodies receive a `LayoutContext` and use these primitives — they
 * MUST NOT instantiate their own pdfkit doc, set their own colors, or use
 * raw hex codes. Theme propagation is mandatory.
 */

import PDFDocument from 'pdfkit';
import type { Writable } from 'stream';
import type { DocumentTheme, PaperSize, PaperDefinition } from './documentTheme.js';
import { PAPER_DEFINITIONS } from './documentTheme.js';

// =============================================================================
// PUBLIC TYPES
// =============================================================================

export interface DocumentMeta {
    /** e.g. "INVOICE", "PURCHASE ORDER", "RECEIPT" */
    title: string;
    /** Business identifier displayed in header (SALE-2025-0001 / PO-2025-0042) */
    number: string;
    /** Optional subtitle (e.g. supplier name, period) */
    subtitle?: string;
    /** Optional secondary metadata pairs shown in header right column */
    badges?: Array<{ label: string; value: string }>;
    /** Watermark text (e.g. "DRAFT", "VOID", "DUPLICATE") */
    watermark?: string;
}

export interface LayoutOptions {
    paperSize?: PaperSize;
    /** Override theme (rarely used — for tenant overrides) */
    themeOverride?: Partial<DocumentTheme>;
}

export interface LayoutContext {
    doc: InstanceType<typeof PDFDocument>;
    theme: DocumentTheme;
    paper: PaperDefinition;
    /** Drawable content width (paper width minus L/R margins) */
    contentWidth: number;
    /** Cursor X (left margin) — same as paper.margin.left */
    contentLeft: number;
    /** Cursor Y the body should start drawing at (set by header) */
    bodyTop: number;
    /** Y coordinate at which the footer begins reserving space */
    footerTop: number;
}

// =============================================================================
// PRIMITIVES — every document MUST use these instead of raw pdfkit calls
// =============================================================================

export const Layout = {
    /** Horizontal rule across content width */
    hr(ctx: LayoutContext, y?: number, color?: string): void {
        const { doc, theme, contentLeft, contentWidth } = ctx;
        const yy = y ?? doc.y;
        doc
            .strokeColor(color ?? theme.colors.border)
            .lineWidth(0.5)
            .moveTo(contentLeft, yy)
            .lineTo(contentLeft + contentWidth, yy)
            .stroke();
        doc.y = yy + theme.spacing.sm;
    },

    /** Section heading */
    sectionTitle(ctx: LayoutContext, text: string): void {
        const { doc, theme, contentLeft, contentWidth } = ctx;
        doc
            .fillColor(theme.colors.primary)
            .font(theme.fonts.familyBold)
            .fontSize(theme.fonts.size.md)
            .text(text.toUpperCase(), contentLeft, doc.y, { width: contentWidth, align: 'left' });
        doc.x = contentLeft;
        doc.moveDown(0.3);
        doc.fillColor(theme.colors.text).font(theme.fonts.family);
    },

    /** Body text (paragraph) */
    text(ctx: LayoutContext, text: string, opts?: PDFKit.Mixins.TextOptions): void {
        const { doc, theme } = ctx;
        doc
            .fillColor(theme.colors.text)
            .font(theme.fonts.family)
            .fontSize(theme.fonts.size.base)
            .text(text, opts);
    },

    /**
     * Reference details block — shared by quotation and invoice PDFs.
     * Renders nothing when lines are empty (no title, no placeholders).
     */
    referenceDetailsBlock(
        ctx: LayoutContext,
        title: string,
        lines: string[],
    ): void {
        const content = lines.filter((line) => line.trim() !== '');
        if (content.length === 0) return;
        Layout.sectionTitle(ctx, title);
        content.forEach((line) => Layout.text(ctx, line));
        ctx.doc.moveDown(0.3);
    },

    /** Label/value pair grid (2 cols by default) */
    kvGrid(
        ctx: LayoutContext,
        pairs: Array<{ label: string; value: string }>,
        opts: { columns?: 1 | 2; startY?: number; rowHeight?: number } = {},
    ): void {
        const { doc, theme, contentLeft, contentWidth } = ctx;
        const cols = opts.columns ?? 2;
        const rowH = opts.rowHeight ?? 14;
        const colW = contentWidth / cols;
        let y = opts.startY ?? doc.y;
        pairs.forEach((kv, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = contentLeft + col * colW;
            const yy = y + row * rowH;
            doc
                .fillColor(theme.colors.muted)
                .font(theme.fonts.family)
                .fontSize(theme.fonts.size.xs)
                .text(kv.label.toUpperCase(), x, yy, { width: colW - 4 });
            doc
                .fillColor(theme.colors.text)
                .font(theme.fonts.familyBold)
                .fontSize(theme.fonts.size.base)
                .text(kv.value || '—', x, yy + 8, { width: colW - 4, ellipsis: true });
        });
        const rows = Math.ceil(pairs.length / cols);
        doc.y = y + rows * rowH + theme.spacing.sm;
    },

    /**
     * Table with theme-styled header, alternating rows, right-aligned numerics.
     * Columns: { header, key, width? (proportion of contentWidth, defaults equal split), align? }
     */
    table<T extends Record<string, unknown>>(
        ctx: LayoutContext,
        rows: T[],
        columns: Array<{
            header: string;
            key: keyof T;
            width?: number; // proportion 0..1
            align?: 'left' | 'right' | 'center';
            format?: (v: T[keyof T], row: T) => string;
        }>,
        opts: { zebra?: boolean } = {},
    ): void {
        const { doc, theme, contentLeft, contentWidth } = ctx;
        const zebra = opts.zebra ?? true;

        // Compute widths
        const totalDefined = columns.reduce((s, c) => s + (c.width ?? 0), 0);
        const undefinedCols = columns.filter(c => c.width == null).length;
        const remainder = Math.max(0, 1 - totalDefined);
        const fillEach = undefinedCols ? remainder / undefinedCols : 0;
        const widths = columns.map(c => (c.width ?? fillEach) * contentWidth);

        const headerH = 20;
        const rowH = 20;
        let y = doc.y;

        // Header band
        doc.rect(contentLeft, y, contentWidth, headerH).fill(theme.colors.primary);
        let x = contentLeft;
        columns.forEach((c, i) => {
            doc
                .fillColor('#ffffff')
                .font(theme.fonts.familyBold)
                .fontSize(theme.fonts.size.sm)
                .text(c.header.toUpperCase(), x + 4, y + 6, {
                    width: widths[i] - 8,
                    align: c.align ?? 'left',
                    lineBreak: false,
                });
            x += widths[i];
        });
        y += headerH;

        // Rows
        rows.forEach((row, rIdx) => {
            // Page break check
            if (y + rowH > ctx.footerTop) {
                doc.addPage();
                y = ctx.bodyTop;
                // redraw header on new page
                doc.rect(contentLeft, y, contentWidth, headerH).fill(theme.colors.primary);
                let xh = contentLeft;
                columns.forEach((c, i) => {
                    doc
                        .fillColor('#ffffff')
                        .font(theme.fonts.familyBold)
                        .fontSize(theme.fonts.size.sm)
                        .text(c.header.toUpperCase(), xh + 4, y + 6, {
                            width: widths[i] - 8,
                            align: c.align ?? 'left',
                            lineBreak: false,
                        });
                    xh += widths[i];
                });
                y += headerH;
            }

            if (zebra && rIdx % 2 === 1) {
                doc.rect(contentLeft, y, contentWidth, rowH).fill(theme.colors.bgSubtle);
            }
            x = contentLeft;
            columns.forEach((c, i) => {
                const raw = row[c.key];
                const value = c.format ? c.format(raw, row) : (raw == null ? '' : String(raw));
                // Keep every cell strictly single-line: flatten newlines/tabs and collapse whitespace.
                const safeValue = String(value).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
                doc
                    .fillColor(theme.colors.text)
                    .font(theme.fonts.family)
                    .fontSize(theme.fonts.size.base)
                    .text(safeValue, x + 4, y + 6, {
                        width: widths[i] - 8,
                        height: rowH - 8,
                        align: c.align ?? 'left',
                        lineBreak: false,
                        ellipsis: true,
                    });
                x += widths[i];
            });
            // Bottom border
            doc
                .strokeColor(theme.colors.border)
                .lineWidth(0.3)
                .moveTo(contentLeft, y + rowH)
                .lineTo(contentLeft + contentWidth, y + rowH)
                .stroke();
            y += rowH;
        });

        doc.y = y + theme.spacing.md;
    },

    /** Right-aligned totals block (subtotal/tax/total etc.) */
    totalsBlock(
        ctx: LayoutContext,
        rows: Array<{ label: string; value: string; emphasize?: boolean }>,
    ): void {
        const { doc, theme, contentLeft, contentWidth } = ctx;
        const blockW = Math.min(220, contentWidth * 0.5);
        const blockX = contentLeft + contentWidth - blockW;
        let y = doc.y;
        const rowH = 16;
        rows.forEach(r => {
            if (r.emphasize) {
                doc.rect(blockX, y, blockW, rowH).fill(theme.colors.primary);
                doc
                    .fillColor('#ffffff')
                    .font(theme.fonts.familyBold)
                    .fontSize(theme.fonts.size.md)
                    .text(r.label, blockX + 6, y + 4, { width: blockW * 0.55 })
                    .text(r.value, blockX + 6, y + 4, { width: blockW - 12, align: 'right' });
            } else {
                doc
                    .fillColor(theme.colors.muted)
                    .font(theme.fonts.family)
                    .fontSize(theme.fonts.size.base)
                    .text(r.label, blockX + 6, y + 4, { width: blockW * 0.55 });
                doc
                    .fillColor(theme.colors.text)
                    .font(theme.fonts.familyBold)
                    .text(r.value, blockX + 6, y + 4, { width: blockW - 12, align: 'right' });
            }
            y += rowH;
        });
        doc.y = y + theme.spacing.md;
    },
};

// =============================================================================
// LAYOUT FACTORY
// =============================================================================

/**
 * Open a new pdfkit document, draw the standard header, register the standard
 * footer, and return a LayoutContext for the body to render into.
 *
 * The body receives `ctx` and writes its content via the `Layout` primitives.
 * The footer is drawn automatically on every page (including pages added via
 * `doc.addPage()` from inside the body).
 */
export function createDocument(
    meta: DocumentMeta,
    theme: DocumentTheme,
    output: Writable,
    opts: LayoutOptions = {},
): LayoutContext {
    const paper = PAPER_DEFINITIONS[opts.paperSize ?? 'A4'];
    const doc = new PDFDocument({
        size: paper.pdfkitSize,
        margins: paper.margin,
        bufferPages: true, // needed for page-numbering footer
        info: {
            Title: `${meta.title} ${meta.number}`,
            Author: theme.company.name,
        },
    });
    doc.pipe(output);

    const contentLeft = paper.margin.left;
    const contentWidth = doc.page.width - paper.margin.left - paper.margin.right;

    // ── HEADER ──
    let bodyTop: number;
    if (paper.isReceipt) {
        bodyTop = drawReceiptHeader(doc, theme, meta, contentLeft, contentWidth);
    } else {
        bodyTop = drawStandardHeader(doc, theme, meta, contentLeft, contentWidth);
    }

    // Footer reserves a fixed band at bottom of every page
    const footerHeight = paper.isReceipt ? 30 : 50;
    const footerTop = doc.page.height - paper.margin.bottom - footerHeight;

    // Watermark (drawn under content on every page via on('pageAdded'))
    if (meta.watermark) {
        drawWatermark(doc, theme, meta.watermark);
        doc.on('pageAdded', () => drawWatermark(doc, theme, meta.watermark!));
    }

    // Position cursor for body
    doc.x = contentLeft;
    doc.y = bodyTop;

    return { doc, theme, paper, contentWidth, contentLeft, bodyTop, footerTop };
}

/**
 * Finalize the document: stamps the footer on every buffered page, then ends
 * the stream. MUST be called after the body has finished writing.
 */
export function finalizeDocument(ctx: LayoutContext, meta: DocumentMeta): void {
    const { doc, theme, paper, contentLeft, contentWidth } = ctx;
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        drawFooter(
            doc,
            theme,
            paper,
            contentLeft,
            contentWidth,
            i - range.start + 1,
            range.count,
            meta,
        );
    }
    doc.end();
}

// =============================================================================
// INTERNAL DRAWERS
// =============================================================================

function drawStandardHeader(
    doc: InstanceType<typeof PDFDocument>,
    theme: DocumentTheme,
    meta: DocumentMeta,
    contentLeft: number,
    contentWidth: number,
): number {
    const headerH = 90;
    // Brand band
    doc.rect(0, 0, doc.page.width, headerH).fill(theme.colors.primary);

    // Company name (left)
    doc
        .fillColor('#ffffff')
        .font(theme.fonts.familyBold)
        .fontSize(theme.fonts.size['2xl'])
        .text(theme.company.name, contentLeft, 18, { width: contentWidth * 0.55 });

    // Doc title (right)
    doc
        .fontSize(theme.fonts.size['2xl'])
        .text(meta.title, contentLeft, 18, { width: contentWidth, align: 'right' });

    // Doc number (right)
    doc
        .font(theme.fonts.familyBold)
        .fontSize(theme.fonts.size.lg)
        .text(meta.number, contentLeft, 46, { width: contentWidth, align: 'right' });

    // Company contact (left, small)
    const contactLines = [theme.company.address, theme.company.phone, theme.company.email, theme.company.tin]
        .filter(Boolean)
        .join('  •  ');
    doc
        .font(theme.fonts.family)
        .fontSize(theme.fonts.size.xs)
        .fillColor('#ffffff')
        .text(contactLines, contentLeft, 60, { width: contentWidth * 0.55 });

    // Subtitle / badges (right)
    if (meta.subtitle) {
        doc
            .font(theme.fonts.family)
            .fontSize(theme.fonts.size.xs)
            .text(meta.subtitle, contentLeft, 64, { width: contentWidth, align: 'right' });
    }

    return headerH + theme.spacing.lg;
}

function drawReceiptHeader(
    doc: InstanceType<typeof PDFDocument>,
    theme: DocumentTheme,
    meta: DocumentMeta,
    contentLeft: number,
    contentWidth: number,
): number {
    let y = doc.page.margins.top;
    doc
        .fillColor(theme.colors.text)
        .font(theme.fonts.familyBold)
        .fontSize(theme.fonts.size.md)
        .text(theme.company.name, contentLeft, y, { width: contentWidth, align: 'center' });
    y = doc.y + theme.spacing.xs;
    if (theme.company.address) {
        doc
            .font(theme.fonts.family)
            .fontSize(theme.fonts.size.xs)
            .text(theme.company.address, contentLeft, y, { width: contentWidth, align: 'center' });
        y = doc.y;
    }
    if (theme.company.phone) {
        doc.text(theme.company.phone, contentLeft, y, { width: contentWidth, align: 'center' });
        y = doc.y;
    }
    if (theme.company.tin) {
        doc.text(theme.company.tin, contentLeft, y, { width: contentWidth, align: 'center' });
        y = doc.y;
    }
    y += theme.spacing.sm;
    doc
        .strokeColor(theme.colors.border)
        .lineWidth(0.5)
        .moveTo(contentLeft, y)
        .lineTo(contentLeft + contentWidth, y)
        .stroke();
    y += theme.spacing.sm;
    doc
        .font(theme.fonts.familyBold)
        .fontSize(theme.fonts.size.base)
        .text(meta.title, contentLeft, y, { width: contentWidth, align: 'center' });
    y = doc.y;
    doc
        .font(theme.fonts.family)
        .fontSize(theme.fonts.size.xs)
        .text(meta.number, contentLeft, y, { width: contentWidth, align: 'center' });
    return doc.y + theme.spacing.sm;
}

function drawFooter(
    doc: InstanceType<typeof PDFDocument>,
    theme: DocumentTheme,
    paper: PaperDefinition,
    contentLeft: number,
    contentWidth: number,
    pageNum: number,
    pageCount: number,
    meta: DocumentMeta,
): void {
    const footerY = doc.page.height - paper.margin.bottom - (paper.isReceipt ? 24 : 40);

        if (!paper.isReceipt) {
        doc
            .strokeColor(theme.colors.border)
            .lineWidth(0.5)
            .moveTo(contentLeft, footerY)
            .lineTo(contentLeft + contentWidth, footerY)
            .stroke();

        const footerText = theme.copy.footerText?.trim();
        if (footerText) {
            doc
                .fillColor(theme.colors.muted)
                .font(theme.fonts.family)
                .fontSize(theme.fonts.size.xs)
                .text(footerText, contentLeft, footerY + 6, {
                    width: contentWidth * 0.7,
                    align: 'left',
                });
        }
    }

    doc
        .fillColor(theme.colors.muted)
        .font(theme.fonts.family)
        .fontSize(theme.fonts.size.xs)
        .text(
            `${meta.title} ${meta.number}  •  Page ${pageNum} of ${pageCount}`,
            contentLeft,
            footerY + (paper.isReceipt ? 4 : 6),
            { width: contentWidth, align: 'right' },
        );
}

function drawWatermark(
    doc: InstanceType<typeof PDFDocument>,
    theme: DocumentTheme,
    text: string,
): void {
    doc.save();
    doc
        .fillColor(theme.colors.danger)
        .opacity(0.08)
        .font(theme.fonts.familyBold)
        .fontSize(120)
        .rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] })
        .text(text.toUpperCase(), 0, doc.page.height / 2 - 60, {
            width: doc.page.width,
            align: 'center',
        });
    doc.restore();
}
