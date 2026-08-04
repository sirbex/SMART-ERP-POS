/**
 * Kitchen Ops Hub — pure next-action business logic (ADR-005 Phase 6).
 * Guides one-place operations without multi-round draft → post navigation.
 */

export type KitchenOpsActionCode =
  | 'PRODUCE'
  | 'START_SERVICE'
  | 'SELL_COVERS'
  | 'END_SERVICE'
  | 'RECORD_WASTE'
  | 'REVIEW';

export type KitchenOpsAction = {
  code: KitchenOpsActionCode;
  title: string;
  detail: string;
  /** Primary CTA on the hub (operator should do this next). */
  primary: boolean;
};

export type KitchenOpsBoardSignals = {
  /** POSTED production batches on the service date */
  postedBatchCount: number;
  /** Prepared / finished goods with positive on-hand qty */
  preparedStockLines: number;
  openSessionCount: number;
  openSessions: Array<{
    soldCovers: number;
    expectedCovers: number;
  }>;
  /** POSTED waste docs on the service date */
  postedWasteCount: number;
};

/**
 * Recommend the next single operator action for the kitchen day.
 * Prefer capacity/service flow over microscopic multi-form workflows.
 */
export function recommendKitchenOpsAction(s: KitchenOpsBoardSignals): KitchenOpsAction {
  const hasStock = s.preparedStockLines > 0 || s.postedBatchCount > 0;
  const open = s.openSessionCount > 0;

  if (!hasStock && !open) {
    return {
      code: 'PRODUCE',
      title: 'Produce finished food',
      detail:
        'Cook to stock in one step (recipe → ingredients issue → FG receipt). No separate draft/post rounds.',
      primary: true,
    };
  }

  if (hasStock && !open) {
    return {
      code: 'START_SERVICE',
      title: 'Start buffet / meal service',
      detail:
        'Open a service session in one step so POS cover sales attach capacity without leaving the kitchen board.',
      primary: true,
    };
  }

  if (open) {
    const totalSold = s.openSessions.reduce((n, x) => n + (Number(x.soldCovers) || 0), 0);
    const totalExpected = s.openSessions.reduce((n, x) => n + (Number(x.expectedCovers) || 0), 0);
    const serviceStillRunning =
      totalExpected <= 0 || totalSold < totalExpected || totalSold === 0;

    if (serviceStillRunning) {
      return {
        code: 'SELL_COVERS',
        title: 'Sell covers at POS',
        detail:
          'Service is open. Sell cover products on POS — sold covers update here automatically (no kitchen re-entry).',
        primary: true,
      };
    }

    return {
      code: 'END_SERVICE',
      title: 'End service + leftovers',
      detail:
        'Close the open session and post leftover write-off in one action when service is done.',
      primary: true,
    };
  }

  if (s.postedWasteCount === 0 && hasStock) {
    return {
      code: 'RECORD_WASTE',
      title: 'Record waste / yield',
      detail: 'Write off cooking loss or spoilage in one post when needed mid-day.',
      primary: false,
    };
  }

  return {
    code: 'REVIEW',
    title: 'Review kitchen costs',
    detail: 'Service complete for now. Check food-cost KPIs or produce for the next meal period.',
    primary: false,
  };
}

/** True when operator can run produce-and-done (recipe plan auto filled). */
export function canQuickProduce(input: {
  outputProductId?: string | null;
  outputQtyBase?: number;
  hasRecipeLines?: boolean;
}): boolean {
  if (!input.outputProductId) return false;
  if (!(Number(input.outputQtyBase) > 0)) return false;
  // lines optional: service loads recipe when missing
  return true;
}

/** True when start-service can collapse draft+open into one shot. */
export function canStartService(input: {
  name?: string | null;
  coverProductId?: string | null;
  expectedCovers?: number;
}): boolean {
  if (!input.name?.trim()) return false;
  if (!input.coverProductId) return false;
  if (!(Number(input.expectedCovers) >= 0)) return false;
  return true;
}
