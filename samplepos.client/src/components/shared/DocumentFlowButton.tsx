/**
 * DocumentFlowModal — SAP-style Document Flow / Odoo Smart Buttons
 *
 * Displays the full chain of linked documents for any entity.
 * Each node is clickable and navigates to the document.
 *
 * Usage:
 *   <DocumentFlowButton entityType="INVOICE" entityId={invoice.id} />
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchDocumentFlow, type DocumentFlowNode } from '../../api/documentFlow';
import { formatCurrency } from '../../utils/currency';

// ── Entity metadata ────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = {
  QUOTATION: 'Quotation',
  SALE: 'Sale',
  DELIVERY_ORDER: 'Delivery Order',
  DELIVERY_NOTE: 'Delivery Note',
  INVOICE: 'Invoice',
  PAYMENT: 'Payment',
  CREDIT_NOTE: 'Credit Note',
  DEBIT_NOTE: 'Debit Note',
  PURCHASE_ORDER: 'Purchase Order',
  GOODS_RECEIPT: 'Goods Receipt',
  RETURN_GRN: 'Return GRN',
  SUPPLIER_INVOICE: 'Supplier Invoice',
  SUPPLIER_PAYMENT: 'Supplier Payment',
};

const ENTITY_ICONS: Record<string, string> = {
  QUOTATION: '📋',
  SALE: '🛒',
  DELIVERY_ORDER: '🚚',
  DELIVERY_NOTE: '📦',
  INVOICE: '🧾',
  PAYMENT: '💳',
  CREDIT_NOTE: '↩️',
  DEBIT_NOTE: '↪️',
  PURCHASE_ORDER: '📝',
  GOODS_RECEIPT: '📥',
  RETURN_GRN: '🔄',
  SUPPLIER_INVOICE: '🧾',
  SUPPLIER_PAYMENT: '💰',
};

const ENTITY_COLORS: Record<string, string> = {
  QUOTATION: 'bg-blue-50 border-blue-300 text-blue-800',
  SALE: 'bg-green-50 border-green-300 text-green-800',
  DELIVERY_ORDER: 'bg-orange-50 border-orange-300 text-orange-800',
  DELIVERY_NOTE: 'bg-orange-50 border-orange-300 text-orange-800',
  INVOICE: 'bg-purple-50 border-purple-300 text-purple-800',
  PAYMENT: 'bg-emerald-50 border-emerald-300 text-emerald-800',
  CREDIT_NOTE: 'bg-red-50 border-red-300 text-red-800',
  DEBIT_NOTE: 'bg-amber-50 border-amber-300 text-amber-800',
  PURCHASE_ORDER: 'bg-indigo-50 border-indigo-300 text-indigo-800',
  GOODS_RECEIPT: 'bg-teal-50 border-teal-300 text-teal-800',
  RETURN_GRN: 'bg-rose-50 border-rose-300 text-rose-800',
  SUPPLIER_INVOICE: 'bg-violet-50 border-violet-300 text-violet-800',
  SUPPLIER_PAYMENT: 'bg-lime-50 border-lime-300 text-lime-800',
};

const STATUS_BADGES: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-800',
  PAID: 'bg-green-100 text-green-800',
  POSTED: 'bg-green-100 text-green-800',
  FINALIZED: 'bg-green-100 text-green-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CONVERTED: 'bg-blue-100 text-blue-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  DRAFT: 'bg-gray-100 text-gray-800',
  CANCELLED: 'bg-red-100 text-red-800',
  VOIDED: 'bg-red-100 text-red-800',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-800',
  PartiallyPaid: 'bg-amber-100 text-amber-800',
  Paid: 'bg-green-100 text-green-800',
  Sent: 'bg-blue-100 text-blue-800',
  Draft: 'bg-gray-100 text-gray-800',
};

function getNavigationPath(entityType: string, entityId: string): string | null {
  const routes: Record<string, string> = {
    QUOTATION: `/quotations/${entityId}`,
    SALE: `/sales`,
    DELIVERY_ORDER: `/delivery`,
    DELIVERY_NOTE: `/delivery-notes`,
    INVOICE: `/accounting/invoices`,
    PURCHASE_ORDER: `/inventory/purchase-orders`,
    GOODS_RECEIPT: `/inventory/goods-receipts`,
    RETURN_GRN: `/inventory/goods-receipts`,
    CREDIT_NOTE: `/accounting/credit-debit-notes`,
    DEBIT_NOTE: `/accounting/credit-debit-notes`,
    SUPPLIER_INVOICE: `/accounting/supplier-payments`,
    SUPPLIER_PAYMENT: `/accounting/supplier-payments`,
  };
  return routes[entityType] ?? null;
}

const RELATION_LABELS: Record<string, string> = {
  CREATED_FROM: 'Created from',
  FULFILLS: 'Fulfills',
  ADJUSTS: 'Adjusts',
  RETURNS: 'Returns',
  PAYS: 'Pays',
};

// ── Node card component ────────────────────────────────────

function FlowNode({
  node,
  isHighlighted,
  onClick,
}: {
  node: DocumentFlowNode;
  isHighlighted: boolean;
  onClick: () => void;
}) {
  const colors = ENTITY_COLORS[node.entityType] ?? 'bg-gray-50 border-gray-300 text-gray-800';
  const statusBadge = node.status ? (STATUS_BADGES[node.status] ?? 'bg-gray-100 text-gray-700') : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md
        ${colors} ${isHighlighted ? 'ring-2 ring-blue-500 shadow-md' : ''} min-w-[180px] text-left`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{ENTITY_ICONS[node.entityType] ?? '📄'}</span>
        <span className="font-semibold text-xs uppercase tracking-wide">
          {ENTITY_LABELS[node.entityType] ?? node.entityType}
        </span>
      </div>
      <div className="font-mono text-sm font-bold truncate" title={node.documentNumber}>
        {node.documentNumber}
      </div>
      <div className="flex items-center justify-between mt-1.5 gap-2">
        {node.date && (
          <span className="text-xs opacity-70">{node.date}</span>
        )}
        {node.amount != null && (
          <span className="text-xs font-medium">{formatCurrency(node.amount)}</span>
        )}
      </div>
      {node.status && (
        <span className={`inline-block mt-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusBadge}`}>
          {node.status}
        </span>
      )}
    </button>
  );
}

// ── Arrow connector ────────────────────────────────────────

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 min-w-[40px]">
      {label && (
        <span className="text-[9px] text-gray-400 uppercase tracking-wider mb-0.5 whitespace-nowrap">
          {label}
        </span>
      )}
      <svg width="32" height="16" viewBox="0 0 32 16" className="text-gray-400">
        <line x1="0" y1="8" x2="26" y2="8" stroke="currentColor" strokeWidth="2" />
        <polygon points="26,3 32,8 26,13" fill="currentColor" />
      </svg>
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────

interface DocumentFlowModalProps {
  entityType: string;
  entityId: string;
  onClose: () => void;
}

function DocumentFlowModal({ entityType, entityId, onClose }: DocumentFlowModalProps) {
  const navigate = useNavigate();

  const { data: nodes = [], isLoading, error } = useQuery({
    queryKey: ['document-flow', entityType, entityId],
    queryFn: () => fetchDocumentFlow(entityType, entityId),
    staleTime: 30_000,
  });

  const handleNodeClick = useCallback(
    (node: DocumentFlowNode) => {
      const path = getNavigationPath(node.entityType, node.entityId);
      if (path) {
        onClose();
        navigate(path);
      }
    },
    [navigate, onClose],
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Document Flow"
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Document Flow</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Traceability chain — click any document to navigate
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
              <span className="ml-3 text-gray-500">Loading document flow...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-red-600">
              Failed to load document flow. Please try again.
            </div>
          )}

          {!isLoading && !error && nodes.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <span className="text-4xl mb-3 block">📄</span>
              No linked documents found. This document is standalone.
            </div>
          )}

          {!isLoading && !error && nodes.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto pb-4 px-2">
              {nodes.map((node, idx) => (
                <div key={`${node.entityType}-${node.entityId}`} className="flex items-center">
                  {idx > 0 && <Arrow label={nodes[idx]?.relationType ? RELATION_LABELS[nodes[idx].relationType!] : undefined} />}
                  <FlowNode
                    node={node}
                    isHighlighted={node.entityType === entityType && node.entityId === entityId}
                    onClick={() => handleNodeClick(node)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-gray-50 rounded-b-xl flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Button trigger (drop this anywhere) ────────────────────

interface DocumentFlowButtonProps {
  entityType: string;
  entityId: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function DocumentFlowButton({
  entityType,
  entityId,
  className = '',
  size = 'sm',
}: DocumentFlowButtonProps) {
  const [open, setOpen] = useState(false);

  if (!entityId) return null;

  const sizeClasses = size === 'sm'
    ? 'text-xs px-2.5 py-1.5'
    : 'text-sm px-3 py-2';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 font-medium rounded-md
          border border-gray-300 text-gray-700 bg-white hover:bg-gray-50
          transition-colors ${sizeClasses} ${className}`}
        title="View document flow"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="5" cy="12" r="3" />
          <circle cx="19" cy="5" r="3" />
          <circle cx="19" cy="19" r="3" />
          <line x1="8" y1="11" x2="16" y2="6" />
          <line x1="8" y1="13" x2="16" y2="18" />
        </svg>
        Document Flow
      </button>
      {open && (
        <DocumentFlowModal
          entityType={entityType}
          entityId={entityId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default DocumentFlowButton;
