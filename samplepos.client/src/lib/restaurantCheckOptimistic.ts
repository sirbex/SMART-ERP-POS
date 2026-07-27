/**
 * Pure optimistic check painters for online FOH adds.
 * Keeps the ticket responsive while addItems + soft refresh run in the background.
 */

export type OptimisticChannel = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

export type OptimisticTicketTab = {
  id: string;
  orderNumber: string;
  totalAmount: string;
};

export type OptimisticOrderItem = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  discountAmount: string;
  kitchenSentAt?: string | null;
};

export type OptimisticCheckPayload = {
  table: {
    id: string;
    code: string;
    name: string;
    zone?: string;
    seats?: number;
    status: 'FREE' | 'OCCUPIED' | 'BILLING';
    currentOrderId: string | null;
    orderTotal?: string | null;
    guestName?: string | null;
  };
  order: {
    id: string;
    orderNumber: string;
    subtotal: string;
    discountAmount: string;
    taxAmount: string;
    totalAmount: string;
    status: string;
    items: OptimisticOrderItem[];
  } | null;
  meta?: {
    tableCode: string | null;
    tableName: string | null;
    waiterId: string | null;
    waiterName: string | null;
    kitchenStatus: string;
    orderChannel: string;
    guestName?: string | null;
    guestPhone?: string | null;
    deliveryAddress?: string | null;
    pickupLabel?: string | null;
  };
  siblingChecks?: Array<{
    id: string;
    orderNumber: string;
    totalAmount: string;
    createdAt: string;
  }>;
};

export type InFlightOptimisticLine = {
  tempLineId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

export function isTempRestaurantId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id.startsWith('tmp_line_') || id.startsWith('tmp_ord_');
}

export function newTempLineId(now = Date.now()): string {
  return `tmp_line_${now}_${Math.random().toString(36).slice(2, 7)}`;
}

function attachSiblingTabs(
  data: OptimisticCheckPayload,
  knownTabs: OptimisticTicketTab[],
): OptimisticCheckPayload {
  const activeId = data.order?.id;
  const siblings = knownTabs
    .filter((t) => t.id !== activeId)
    .map((t) => ({
      id: t.id,
      orderNumber: t.orderNumber,
      totalAmount: t.totalAmount,
      createdAt: new Date().toISOString(),
    }));
  if (siblings.length === 0) return data;
  return { ...data, siblingChecks: siblings };
}

function recalculateTotals(
  items: OptimisticOrderItem[],
  discountAmount: number,
  taxAmount: number,
): { subtotal: number; total: number } {
  const subtotal = items.reduce((s, it) => s + Number(it.lineTotal || 0), 0);
  return {
    subtotal,
    total: subtotal - discountAmount + taxAmount,
  };
}

/** Optimistic ticket line for online add — UI paints before API returns. */
export function appendOptimisticMenuItem(
  prev: OptimisticCheckPayload | undefined,
  args: {
    table: OptimisticCheckPayload['table'];
    product: { id: string; name: string; sellingPrice?: number | string };
    quantity: number;
    tempLineId: string;
    channel: OptimisticChannel;
    waiterId?: string | null;
    waiterName?: string | null;
    guestName?: string | null;
    guestPhone?: string | null;
    deliveryAddress?: string | null;
    pickupLabel?: string | null;
    knownTabs?: OptimisticTicketTab[];
    now?: number;
  },
): OptimisticCheckPayload {
  const qty = Math.max(1, args.quantity);
  const unitPrice = Number(args.product.sellingPrice) || 0;
  const lineTotal = qty * unitPrice;
  const newItem: OptimisticOrderItem = {
    id: args.tempLineId,
    productId: args.product.id,
    productName: args.product.name,
    quantity: String(qty),
    unitPrice: String(unitPrice),
    lineTotal: String(lineTotal),
    discountAmount: '0',
    kitchenSentAt: null,
  };
  const knownTabs = args.knownTabs || [];

  if (prev?.order) {
    const items = [...(prev.order.items || []), newItem];
    const { subtotal, total } = recalculateTotals(
      items,
      Number(prev.order.discountAmount || 0),
      Number(prev.order.taxAmount || 0),
    );
    return attachSiblingTabs(
      {
        ...prev,
        table: {
          ...prev.table,
          status: 'OCCUPIED',
          currentOrderId: prev.order.id,
          orderTotal: String(total),
        },
        order: {
          ...prev.order,
          items,
          subtotal: String(subtotal),
          totalAmount: String(total),
        },
      },
      knownTabs,
    );
  }

  const tempOrderId = `tmp_ord_${(args.now ?? Date.now()).toString(36)}`;
  return attachSiblingTabs(
    {
      table: {
        ...args.table,
        status: 'OCCUPIED',
        currentOrderId: tempOrderId,
        orderTotal: String(lineTotal),
        guestName: args.guestName ?? null,
      },
      order: {
        id: tempOrderId,
        orderNumber: '…',
        subtotal: String(lineTotal),
        discountAmount: '0',
        taxAmount: '0',
        totalAmount: String(lineTotal),
        status: 'PENDING',
        items: [newItem],
      },
      meta: {
        tableCode: args.table.code,
        tableName: args.table.name,
        orderChannel: args.channel,
        kitchenStatus: 'NONE',
        waiterId: args.waiterId ?? null,
        waiterName: args.waiterName ?? null,
        guestName: args.guestName ?? null,
        guestPhone: args.guestPhone ?? null,
        deliveryAddress: args.deliveryAddress ?? null,
        pickupLabel: args.pickupLabel ?? null,
      },
      siblingChecks: [],
    },
    knownTabs,
  );
}

/**
 * Keep in-flight optimistic lines visible when a soft refresh returns mid-tap race.
 * Confirmed server UUIDs replace temps; remaining temps stay until their mutation finishes.
 */
export function mergeInFlightOptimisticLines(
  data: OptimisticCheckPayload,
  inFlight: Iterable<InFlightOptimisticLine>,
): OptimisticCheckPayload {
  if (!data.order) return data;
  const flight = [...inFlight];
  if (flight.length === 0) return data;

  const existingIds = new Set(data.order.items.map((it) => it.id));
  const extras: OptimisticOrderItem[] = [];
  for (const f of flight) {
    if (existingIds.has(f.tempLineId)) continue;
    const qty = Math.max(1, f.quantity);
    const unitPrice = Number(f.unitPrice) || 0;
    extras.push({
      id: f.tempLineId,
      productId: f.productId,
      productName: f.productName,
      quantity: String(qty),
      unitPrice: String(unitPrice),
      lineTotal: String(qty * unitPrice),
      discountAmount: '0',
      kitchenSentAt: null,
    });
  }
  if (extras.length === 0) return data;

  const items = [...data.order.items, ...extras];
  const { subtotal, total } = recalculateTotals(
    items,
    Number(data.order.discountAmount || 0),
    Number(data.order.taxAmount || 0),
  );
  return {
    ...data,
    table: {
      ...data.table,
      status: 'OCCUPIED',
      currentOrderId: data.order.id,
      orderTotal: String(total),
    },
    order: {
      ...data.order,
      items,
      subtotal: String(subtotal),
      totalAmount: String(total),
    },
  };
}
