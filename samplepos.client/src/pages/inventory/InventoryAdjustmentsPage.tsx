/**
 * @module InventoryAdjustmentsPage
 * @description Manual inventory adjustment interface - creates ADJUSTMENT_IN/ADJUSTMENT_OUT movements
 * @requires ADMIN or MANAGER role
 * @architecture Uses unified StockMovementHandler on backend
 * @note Audit trail view is in StockMovementsPage to avoid duplication
 *
 * REFACTORED: Now uses productId instead of batchId
 * Backend automatically handles batch selection (MAIN batch)
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useStockLevels, useAdjustInventory } from '../../hooks/useInventory';
import { useStockMovements } from '../../hooks/useStockMovements';
import { InventoryAdjustmentSchema } from '@shared/zod/inventory';
import apiClient from '../../utils/api';
import { handleApiError } from '../../utils/errorHandler';
import Decimal from 'decimal.js';
import { z } from 'zod';

// TIMEZONE STRATEGY: Display dates without conversion
// Backend returns DATE as YYYY-MM-DD string (no timezone)
// Frontend displays as-is without parsing to Date object
const formatDisplayDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';

  // If it's an ISO string, extract the date part
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }

  return dateString;
};

// Batch type from backend response
interface Batch {
  id: string;
  product_id: string;
  product_name: string;
  batch_number: string;
  remaining_quantity: number;
  expiry_date?: string | null;
  cost_price: number;
  status: string;
  created_at: string;
}

// (types inferred from API; dedicated interfaces removed to avoid unused warnings)

export default function InventoryAdjustmentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: stockLevelsData, isLoading, error } = useStockLevels();
  const adjustInventoryMutation = useAdjustInventory();

  // Get recent adjustment movements for quick reference
  const { data: recentAdjustmentsData } = useStockMovements({
    movementType: 'ADJUSTMENT_IN,ADJUSTMENT_OUT',
    limit: 10,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // Adjustment form state
  const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease'>('increase');
  const [movementCategory, setMovementCategory] = useState<'ADJUSTMENT' | 'DAMAGE' | 'EXPIRY'>(
    'ADJUSTMENT'
  );
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  // Validation errors removed - using Zod schema validation

  // Refs for keyboard navigation
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const reasonInputRef = useRef<HTMLTextAreaElement>(null);

  // Get current user from localStorage
  const currentUser = useMemo(() => {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  }, []);

  // Keyboard shortcuts for modal
  useEffect(() => {
    if (!showAdjustModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === 'Escape') {
        setShowAdjustModal(false);
      }
      // Enter to submit (if not in textarea)
      if (e.key === 'Enter' && !e.shiftKey && e.target !== reasonInputRef.current) {
        e.preventDefault();
        if (adjustmentQuantity && adjustmentReason && !adjustInventoryMutation.isPending) {
          handleSubmitAdjustment();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdjustModal, adjustmentQuantity, adjustmentReason, adjustInventoryMutation.isPending]);

  // Auto-focus quantity input when modal opens
  useEffect(() => {
    if (showAdjustModal && quantityInputRef.current) {
      setTimeout(() => quantityInputRef.current?.focus(), 100);
    }
  }, [showAdjustModal]);

  // Check if user has ADMIN or MANAGER role
  const canAdjust = useMemo(() => {
    return currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER');
  }, [currentUser]);

  // Extract stock levels and create batch list
  const batches = useMemo(() => {
    if (!stockLevelsData?.data) return [];
    const levels = Array.isArray(stockLevelsData.data) ? stockLevelsData.data : [];

    // For now, create mock batches from stock levels
    // In production, this would come from a dedicated batches endpoint
    return levels.flatMap(
      (level: {
        product_id: string;
        product_name: string;
        sku?: string;
        total_stock?: string;
        total_quantity?: string;
        nearest_expiry?: string | null;
        average_cost?: string;
      }) => {
        // Mock: Assume single batch per product for simplicity
        return [
          {
            id: `batch-${level.product_id}`, // Mock batch ID
            product_id: level.product_id,
            product_name: level.product_name,
            batch_number: level.sku || 'MAIN',
            remaining_quantity: parseFloat(
              String(level.total_stock || level.total_quantity || '0')
            ),
            expiry_date: level.nearest_expiry || null,
            cost_price: parseFloat(String(level.average_cost || '0')),
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
          },
        ];
      }
    );
  }, [stockLevelsData]);

  // Filter batches based on search
  const filteredBatches = useMemo(() => {
    if (!searchTerm) return batches;

    const term = searchTerm.toLowerCase();
    return batches.filter(
      (batch: Batch) =>
        batch.product_name.toLowerCase().includes(term) ||
        batch.batch_number.toLowerCase().includes(term)
    );
  }, [batches, searchTerm]);

  // Recent adjustments for display
  const recentAdjustments = useMemo(() => {
    if (!recentAdjustmentsData?.data) return [];
    return Array.isArray(recentAdjustmentsData.data) ? recentAdjustmentsData.data : [];
  }, [recentAdjustmentsData]);

  // Handle adjustment modal open
  const handleOpenAdjustModal = (batch: Batch) => {
    if (!canAdjust) {
      alert('You do not have permission to adjust inventory. ADMIN or MANAGER role required.');
      return;
    }

    setSelectedBatch(batch);
    setMovementCategory('ADJUSTMENT');
    setAdjustmentType('increase');
    setAdjustmentQuantity('');
    setAdjustmentReason('');
    // Validation done via Zod schema
    setShowAdjustModal(true);
  };

  // Handle adjustment submission
  const handleSubmitAdjustment = useCallback(async () => {
    console.log('🚀 handleSubmitAdjustment called!');
    console.log('📦 selectedBatch:', selectedBatch);
    console.log('👤 currentUser:', currentUser);

    if (!selectedBatch || !currentUser) {
      console.error('❌ Missing required data:', { selectedBatch, currentUser });
      alert('Missing required data. Please try again.');
      return;
    }

    console.log('✅ Starting adjustment submission...', {
      product_id: selectedBatch.product_id,
      product_name: selectedBatch.product_name,
      adjustmentType,
      adjustmentQuantity,
      adjustmentReason,
      userId: currentUser.id,
    });

    try {
      if (movementCategory === 'DAMAGE' || movementCategory === 'EXPIRY') {
        // Use stock-movements API for DAMAGE/EXPIRY
        const qty = new Decimal(adjustmentQuantity || 0).toNumber();
        // Send with movementType as backend RecordMovementSchema expects
        await apiClient.post('stock-movements', {
          productId: selectedBatch.product_id,
          movementType: movementCategory,
          quantity: qty,
          notes: adjustmentReason,
          createdBy: currentUser.id,
        });
        // Invalidate queries for fresh data
        queryClient.invalidateQueries({ queryKey: ['stockLevels'] });
        queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
        queryClient.invalidateQueries({ queryKey: ['offline', 'stock-levels'] });
      } else {
        // ADJUSTMENT_IN / ADJUSTMENT_OUT via existing adjust endpoint
        const qtyDecimal = new Decimal(adjustmentQuantity || 0);
        const adjustment =
          adjustmentType === 'increase' ? qtyDecimal.toNumber() : qtyDecimal.times(-1).toNumber();

        const validatedData = InventoryAdjustmentSchema.parse({
          productId: selectedBatch.product_id,
          adjustment,
          reason: adjustmentReason,
          userId: currentUser.id,
        });

        await adjustInventoryMutation.mutateAsync(validatedData);
      }

      // Success
      const typeLabel =
        movementCategory === 'DAMAGE'
          ? 'Damage recorded'
          : movementCategory === 'EXPIRY'
            ? 'Expiry write-off recorded'
            : 'Inventory adjusted';
      alert(`${typeLabel} successfully!`);
      setShowAdjustModal(false);
      setSelectedBatch(null);
      setAdjustmentQuantity('');
      setAdjustmentReason('');
      setMovementCategory('ADJUSTMENT');
    } catch (error) {
      console.error('❌ Adjustment failed:', error);
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.issues.forEach((issue) => {
          if (issue.path[0]) {
            errors[issue.path[0].toString()] = issue.message;
          }
        });
        // Validation errors removed
        console.error('❌ Validation errors:', errors);
      } else {
        console.error('❌ Error details:', error);
        handleApiError(error, { fallback: 'Failed to adjust inventory' });
      }
    }
  }, [
    selectedBatch,
    currentUser,
    adjustmentQuantity,
    adjustmentType,
    adjustmentReason,
    movementCategory,
    adjustInventoryMutation,
    queryClient,
  ]);

  // View full audit trail in Stock Movements page
  const handleViewAllMovements = () => {
    navigate('/inventory/stock-movements?type=ADJUSTMENT_IN,ADJUSTMENT_OUT,DAMAGE,EXPIRY');
  };

  // Calculate new quantity for preview with real-time validation
  const previewNewQuantity = useMemo(() => {
    if (!selectedBatch || !adjustmentQuantity) return null;

    const current = new Decimal(selectedBatch.remaining_quantity);
    const adjustment = new Decimal(adjustmentQuantity || 0);

    // DAMAGE and EXPIRY always decrease stock
    if (movementCategory === 'DAMAGE' || movementCategory === 'EXPIRY') {
      return current.minus(adjustment).toNumber();
    }

    const newQty =
      adjustmentType === 'increase' ? current.plus(adjustment) : current.minus(adjustment);

    return newQty.toNumber();
  }, [selectedBatch, adjustmentQuantity, adjustmentType, movementCategory]);

  // Real-time form validation
  const formValidation = useMemo(() => {
    const errors: Record<string, string> = {};

    if (adjustmentQuantity && parseFloat(adjustmentQuantity) <= 0) {
      errors.quantity = 'Quantity must be greater than zero';
    }

    if (previewNewQuantity !== null && previewNewQuantity < 0) {
      errors.quantity = 'Resulting quantity cannot be negative';
    }

    if (adjustmentReason && adjustmentReason.length < 5) {
      errors.reason = 'Reason must be at least 5 characters';
    }

    return {
      errors,
      isValid: Object.keys(errors).length === 0 && adjustmentQuantity && adjustmentReason,
    };
  }, [adjustmentQuantity, adjustmentReason, previewNewQuantity]);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800">Loading inventory batches...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load inventory. Please try again.</p>
        </div>
      </div>
    );
  }

  if (!canAdjust) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-yellow-900 mb-2">⚠️ Access Restricted</h3>
          <p className="text-yellow-800">
            You do not have permission to access inventory adjustments.
            <br />
            Required role: <strong>ADMIN</strong> or <strong>MANAGER</strong>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Adjustments & Damage Tracking</h2>
          <p className="text-gray-600 mt-1">
            Record stock adjustments, damages, and expiry write-offs
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleViewAllMovements}
            className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            📊 View All Adjustments
          </button>
          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-medium text-sm">
            {currentUser?.role}
          </span>
        </div>
      </div>

      {/* Recent Adjustments Summary */}
      {recentAdjustments.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-blue-900">
              📝 Recent Adjustments ({recentAdjustments.length})
            </h3>
            <button
              onClick={handleViewAllMovements}
              className="text-sm text-blue-700 hover:text-blue-900 font-medium"
            >
              View All →
            </button>
          </div>
          <div className="space-y-2">
            {recentAdjustments
              .slice(0, 5)
              .map(
                (adj: {
                  id: string;
                  movement_type: string;
                  product_name?: string;
                  quantity?: number;
                  created_at?: string;
                }) => (
                  <div
                    key={adj.id}
                    className="flex items-center justify-between text-sm bg-white rounded px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={
                          adj.movement_type === 'ADJUSTMENT_IN'
                            ? 'text-green-600 font-bold'
                            : 'text-red-600 font-bold'
                        }
                      >
                        {adj.movement_type === 'ADJUSTMENT_IN' ? '➕' : '➖'}
                      </span>
                      <span className="font-medium text-gray-900">
                        {adj.product_name || 'Unknown'}
                      </span>
                      <span className="text-gray-600">
                        {adj.movement_type === 'ADJUSTMENT_IN' ? '+' : '-'}
                        {Math.abs(adj.quantity || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {adj.created_at?.includes('T')
                        ? `${formatDisplayDate(adj.created_at)} ${adj.created_at.split('T')[1].substring(0, 8)}`
                        : formatDisplayDate(adj.created_at)}
                    </div>
                  </div>
                )
              )}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
          Search Batches
        </label>
        <input
          id="search"
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by product name or batch number..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Batches Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Batch Number
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Quantity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Expiry Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredBatches.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  {searchTerm ? 'No batches match your search' : 'No inventory batches found'}
                </td>
              </tr>
            ) : (
              filteredBatches.map((batch: Batch) => (
                <tr key={batch.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{batch.product_name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{batch.batch_number}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <span className="font-semibold">{batch.remaining_quantity.toFixed(2)}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {batch.expiry_date ? formatDisplayDate(batch.expiry_date) : 'N/A'}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        batch.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {batch.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm space-x-2">
                    <button
                      onClick={() => handleOpenAdjustModal(batch)}
                      className="text-blue-600 hover:text-blue-900 font-medium"
                    >
                      Adjust
                    </button>
                    <button
                      onClick={() => {
                        handleOpenAdjustModal(batch);
                        // Set category after modal opens
                        setTimeout(() => {
                          setMovementCategory('DAMAGE');
                          setAdjustmentType('decrease');
                        }, 0);
                      }}
                      className="text-orange-600 hover:text-orange-900 font-medium"
                    >
                      Damage
                    </button>
                    <button
                      onClick={() =>
                        navigate(`/inventory/stock-movements?product=${batch.product_id}`)
                      }
                      className="text-gray-600 hover:text-gray-900 font-medium"
                    >
                      History
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Adjustment Modal */}
      {showAdjustModal && selectedBatch && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={(e) => {
            console.log('🔵 Overlay clicked', e.target);
            // Only close if clicking the overlay itself, not its children
            if (e.target === e.currentTarget) {
              console.log('🔵 Closing modal from overlay click');
              setShowAdjustModal(false);
            }
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
            onClick={(e) => {
              console.log('🟢 Modal content clicked', e.target);
              e.stopPropagation(); // Prevent overlay click
            }}
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {movementCategory === 'DAMAGE'
                  ? '⚠️ Record Damage'
                  : movementCategory === 'EXPIRY'
                    ? '⏰ Record Expiry Write-Off'
                    : '⚖️ Adjust Inventory'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {selectedBatch.product_name} - {selectedBatch.batch_number}
              </p>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Current Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Quantity
                </label>
                <div className="text-2xl font-bold text-gray-900">
                  {selectedBatch.remaining_quantity.toFixed(2)}
                </div>
              </div>

              {/* Movement Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Movement Category
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMovementCategory('ADJUSTMENT');
                      setAdjustmentType('increase');
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      movementCategory === 'ADJUSTMENT'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    ⚖️ Adjustment
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMovementCategory('DAMAGE');
                      setAdjustmentType('decrease');
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      movementCategory === 'DAMAGE'
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    ⚠️ Damage
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMovementCategory('EXPIRY');
                      setAdjustmentType('decrease');
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      movementCategory === 'EXPIRY'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    ⏰ Expiry
                  </button>
                </div>
              </div>

              {/* Adjustment Type - only for ADJUSTMENT category */}
              {movementCategory === 'ADJUSTMENT' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Adjustment Type
                  </label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setAdjustmentType('increase')}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                        adjustmentType === 'increase'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      ➕ Increase
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustmentType('decrease')}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                        adjustmentType === 'decrease'
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      ➖ Decrease
                    </button>
                  </div>
                </div>
              )}

              {/* Quantity */}
              <div>
                <label
                  htmlFor="adj-quantity"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Adjustment Quantity *
                </label>
                <input
                  ref={quantityInputRef}
                  id="adj-quantity"
                  type="number"
                  min="0"
                  step="0.01"
                  value={adjustmentQuantity}
                  onChange={(e) => setAdjustmentQuantity(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      reasonInputRef.current?.focus();
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    formValidation.errors.quantity ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                />
                {formValidation.errors.quantity && (
                  <p className="text-red-600 text-sm mt-1">{formValidation.errors.quantity}</p>
                )}
              </div>

              {/* Preview New Quantity */}
              {previewNewQuantity !== null && (
                <div
                  className={`border rounded-lg p-3 ${
                    previewNewQuantity < 0
                      ? 'bg-red-50 border-red-300'
                      : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div
                    className={`text-sm ${
                      previewNewQuantity < 0 ? 'text-red-800' : 'text-blue-800'
                    }`}
                  >
                    <strong>New Quantity:</strong> {previewNewQuantity.toFixed(2)}
                    {previewNewQuantity < 0 && (
                      <span className="ml-2">⚠️ Negative quantity not allowed</span>
                    )}
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label
                  htmlFor="adj-reason"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Reason * (min 5 characters)
                </label>
                <textarea
                  ref={reasonInputRef}
                  id="adj-reason"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    formValidation.errors.reason ? 'border-red-500' : 'border-gray-300'
                  }`}
                  rows={3}
                  placeholder={
                    movementCategory === 'DAMAGE'
                      ? 'Describe the damage: broken packaging, water damage, etc.'
                      : movementCategory === 'EXPIRY'
                        ? 'Expired batch disposal, date: ...'
                        : 'Physical count correction, damaged goods, etc.'
                  }
                />
                {formValidation.errors.reason && (
                  <p className="text-red-600 text-sm mt-1">{formValidation.errors.reason}</p>
                )}
                <p
                  className={`text-xs mt-1 ${
                    adjustmentReason.length >= 5 ? 'text-green-600' : 'text-gray-500'
                  }`}
                >
                  {adjustmentReason.length}/5 characters minimum
                </p>
              </div>

              {/* Keyboard Shortcuts Hint */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                <p className="text-xs text-gray-600">
                  <strong>Keyboard shortcuts:</strong> Enter to submit | Esc to cancel
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  console.log('Cancel button clicked');
                  setShowAdjustModal(false);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                disabled={adjustInventoryMutation.isPending}
              >
                Cancel (Esc)
              </button>
              <button
                type="button"
                onClick={(e) => {
                  console.log('Save button clicked!', e);
                  e.preventDefault();
                  e.stopPropagation();
                  handleSubmitAdjustment();
                }}
                disabled={adjustInventoryMutation.isPending || !formValidation.isValid}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {adjustInventoryMutation.isPending
                  ? 'Saving...'
                  : movementCategory === 'DAMAGE'
                    ? 'Record Damage'
                    : movementCategory === 'EXPIRY'
                      ? 'Record Expiry'
                      : 'Save Adjustment (Enter)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Box - Relationship with Stock Movements */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">
          ℹ️ About Adjustments & Damage Tracking
        </h3>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>
            • <strong>Adjustment:</strong> Increase or decrease stock for physical count corrections
          </li>
          <li>
            • <strong>Damage:</strong> Record stock lost due to physical damage (broken, water
            damage, etc.)
          </li>
          <li>
            • <strong>Expiry:</strong> Write off stock that has expired and must be disposed of
          </li>
          <li>• All records create immutable stock movement entries for full audit trail</li>
          <li>
            • View the <strong>Waste & Damage Report</strong> in Reports for aggregated loss
            analysis
          </li>
          <li>• Click "History" next to each product to see all movements for that item</li>
          <li>
            • <strong>Role Required:</strong> ADMIN or MANAGER
          </li>
        </ul>
      </div>
    </div>
  );
}
