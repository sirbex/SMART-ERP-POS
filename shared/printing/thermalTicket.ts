/**
 * Canonical thermal ticket model — consumed by EscPosRenderer and HtmlRenderer.
 * Business formatting lives once here; renderers only paint.
 */

export type ThermalTicketKind = 'KOT_FIRE' | 'KOT_VOID' | 'GUEST_BILL' | 'RECEIPT';

export type ThermalTicketItem = {
  quantity: number;
  name: string;
  /** Modifier / line note (no prices on KOT). */
  note?: string | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
};

export type ThermalTicket = {
  kind: ThermalTicketKind;
  /** Kitchen station code for KOT (KITCHEN / BAR / …). */
  station?: string | null;
  title: string;
  documentNumber: string;
  tableLabel: string;
  stewardName?: string | null;
  serverName?: string | null;
  firedAt: string;
  voidReason?: string | null;
  orderChannel?: string | null;
  channelLabel?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  deliveryAddress?: string | null;
  pickupLabel?: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  /** Guest bill / receipt meta (Table, Order, Date, …). */
  metaRows?: Array<{ label: string; value: string }> | null;
  items: ThermalTicketItem[];
  /** Bill/receipt only */
  subtotal?: number | null;
  discountAmount?: number | null;
  taxAmount?: number | null;
  taxName?: string | null;
  totalAmount?: number | null;
  currencySymbol?: string | null;
  paymentRows?: Array<{ label: string; value: string }> | null;
  customNote?: string | null;
  footerLines?: string[];
};
