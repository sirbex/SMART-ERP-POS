const { Decimal, toBaseQty } = require('../utils/uomUtils');
const { 
  calcEffectiveCostPerPurchaseUnit,
  calcUnitCostBase,
  convertCurrency
} = require('../utils/costUtils');
const LandedCostService = require('../services/LandedCostService');

class PurchaseController {
  constructor(models, sequelize) {
    this.models = models;
    this.sequelize = sequelize;
    this.landedCostService = new LandedCostService(models);
  }

  /**
   * Receive a purchase order with Multi-UOM support
   * POST /api/purchases/receive
   * Body: {
   *   purchaseId, productId, uom, quantity, unitCost,
   *   discount: { type, value }, taxes: [], landedCosts: [],
   *   supplierInvoice, currency, exchangeRate, receivedAt
   * }
   */
  async receivePurchase(req, res) {
    const transaction = await this.sequelize.transaction();

    try {
      const {
        purchaseId,
        productId,
        uom,
        quantity,
        unitCost,
        discount,
        taxes,
        landedCosts,
        supplierInvoice,
        currency = 'USD',
        exchangeRate = 1.0,
        receivedAt = new Date(),
        includeTaxesInCost = false,
        landedCostAllocationMethod = 'quantity'
      } = req.body;

      // Validate required fields
      if (!productId || !uom || !quantity || !unitCost) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: productId, uom, quantity, unitCost'
        });
      }

      // Find product UOM
      const productUOM = await this.models.ProductUOM.findOne({
        where: {
          productId,
          uomName: uom
        },
        transaction
      });

      if (!productUOM) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          error: `UOM '${uom}' not found for product ${productId}`
        });
      }

      // Convert quantity to base units
      const qtyInBase = toBaseQty(quantity, productUOM.conversionToBase);

      // Calculate effective cost per purchase unit (after discounts and taxes)
      const effectiveCostPerPurchaseUnit = calcEffectiveCostPerPurchaseUnit(
        unitCost,
        discount,
        taxes,
        includeTaxesInCost
      );

      // Calculate unit cost per base unit
      const unitCostBase = calcUnitCostBase(
        effectiveCostPerPurchaseUnit,
        productUOM.conversionToBase
      );

      // Convert to base currency if needed
      const unitCostBaseInBaseCurrency = convertCurrency(unitCostBase, exchangeRate);
      const totalCostBase = unitCostBaseInBaseCurrency.times(qtyInBase);

      // Create inventory batch
      const batch = await this.models.InventoryBatch.create({
        productId,
        sourcePurchaseId: purchaseId,
        batchReference: supplierInvoice || `PO-${purchaseId}`,
        qtyInBase: qtyInBase.toString(),
        remainingQtyInBase: qtyInBase.toString(),
        unitCostBase: unitCostBaseInBaseCurrency.toString(),
        totalCostBase: totalCostBase.toString(),
        currency,
        exchangeRate,
        metadata: {
          purchaseUOM: uom,
          purchaseQuantity: quantity,
          purchaseUnitCost: unitCost,
          conversionToBase: productUOM.conversionToBase.toString(),
          discount,
          taxes,
          effectiveCostPerPurchaseUnit: effectiveCostPerPurchaseUnit.toString()
        },
        receivedAt: new Date(receivedAt)
      }, { transaction });

      // Allocate landed costs if any
      let updatedBatch = batch;
      if (landedCosts && landedCosts.length > 0) {
        const validation = this.landedCostService.validateLandedCostLines(landedCosts);
        
        if (!validation.valid) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            error: 'Invalid landed cost lines',
            details: validation.errors
          });
        }

        const batches = [{
          id: batch.id,
          qtyInBase: batch.qtyInBase,
          unitCostBase: batch.unitCostBase
        }];

        const updatedBatches = await this.landedCostService.allocateLandedCosts(
          batches,
          landedCosts,
          landedCostAllocationMethod,
          transaction
        );

        updatedBatch = updatedBatches[0];
      }

      // Update purchase order item if exists
      if (purchaseId) {
        const purchaseItem = await this.models.PurchaseOrderItem.findOne({
          where: {
            purchaseOrderId: purchaseId,
            productId
          },
          transaction
        });

        if (purchaseItem) {
          purchaseItem.purchaseUom = uom;
          purchaseItem.qtyInBase = qtyInBase.toString();
          purchaseItem.unitCostBase = updatedBatch.unitCostBase;
          purchaseItem.discountType = discount?.type;
          purchaseItem.discountValue = discount?.value;
          purchaseItem.taxAmount = taxes?.reduce((sum, tax) => sum + (tax.amount || 0), 0);
          purchaseItem.landedCostLines = landedCosts;
          await purchaseItem.save({ transaction });
        }
      }

      await transaction.commit();

      return res.status(201).json({
        success: true,
        message: 'Purchase received successfully',
        data: {
          batchId: batch.id.toString(),
          productId,
          uom,
          quantity,
          qtyInBase: qtyInBase.toString(),
          unitCost,
          effectiveCostPerPurchaseUnit: effectiveCostPerPurchaseUnit.toString(),
          unitCostBase: updatedBatch.unitCostBase,
          totalCostBase: updatedBatch.totalCostBase,
          currency,
          exchangeRate,
          receivedAt: batch.receivedAt,
          allocatedLandedCost: updatedBatch.allocatedLandedCost || '0'
        }
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Error receiving purchase:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to receive purchase',
        details: error.message
      });
    }
  }

  /**
   * Get landed cost preview for a purchase
   * POST /api/purchases/preview-landed-cost
   */
  async previewLandedCost(req, res) {
    try {
      const { items, landedCosts, allocationMethod = 'quantity' } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Items array is required'
        });
      }

      // Validate and process items
      const processedItems = await Promise.all(items.map(async (item) => {
        if (!item.productId || !item.uom || !item.quantity || !item.unitCost) {
          throw new Error('Each item must have productId, uom, quantity, and unitCost');
        }

        const productUOM = await this.models.ProductUOM.findOne({
          where: {
            productId: item.productId,
            uomName: item.uom
          }
        });

        if (!productUOM) {
          throw new Error(`UOM '${item.uom}' not found for product ${item.productId}`);
        }

        const qtyInBase = toBaseQty(item.quantity, productUOM.conversionToBase);
        const effectiveCost = calcEffectiveCostPerPurchaseUnit(
          item.unitCost,
          item.discount,
          item.taxes,
          item.includeTaxesInCost
        );
        const unitCostBase = calcUnitCostBase(effectiveCost, productUOM.conversionToBase);

        return {
          productId: item.productId,
          uom: item.uom,
          quantity: item.quantity,
          qtyInBase: qtyInBase.toString(),
          unitCostBase: unitCostBase.toString()
        };
      }));

      const preview = this.landedCostService.calculateLandedCostPreview(
        processedItems,
        landedCosts,
        allocationMethod
      );

      return res.status(200).json({
        success: true,
        data: preview
      });

    } catch (error) {
      console.error('Error previewing landed cost:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to preview landed cost',
        details: error.message
      });
    }
  }

  /**
   * Get product UOMs
   * GET /api/products/:productId/uoms
   */
  async getProductUOMs(req, res) {
    try {
      const { productId } = req.params;
      const { uomType } = req.query;

      const where = { productId };
      if (uomType) {
        where.uomType = [uomType, 'all'];
      }

      const uoms = await this.models.ProductUOM.findAll({
        where,
        order: [['isDefault', 'DESC'], ['uomName', 'ASC']]
      });

      return res.status(200).json({
        success: true,
        data: uoms.map(uom => ({
          id: uom.id,
          uomName: uom.uomName,
          conversionToBase: uom.conversionToBase,
          uomType: uom.uomType,
          isDefault: uom.isDefault
        }))
      });

    } catch (error) {
      console.error('Error fetching product UOMs:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch product UOMs',
        details: error.message
      });
    }
  }
}

module.exports = PurchaseController;
