const { Decimal, toBaseQty, getAvailableInUOM } = require('../utils/uomUtils');
const { calcGrossProfit, calcGrossProfitMargin } = require('../utils/costUtils');
const FifoService = require('../services/FifoService');

class SalesController {
  constructor(models, sequelize) {
    this.models = models;
    this.sequelize = sequelize;
    this.fifoService = new FifoService(models);
  }

  /**
   * Record a sale with Multi-UOM and FIFO COGS calculation
   * POST /api/sales
   * Body: {
   *   saleId, productId, uom, quantity, pricePerUom, customerId
   * }
   */
  async recordSale(req, res) {
    const transaction = await this.sequelize.transaction();

    try {
      const {
        saleId,
        productId,
        uom,
        quantity,
        pricePerUom,
        customerId,
        saleDate = new Date()
      } = req.body;

      // Validate required fields
      if (!productId || !uom || !quantity || !pricePerUom) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: productId, uom, quantity, pricePerUom'
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

      // Convert sale quantity to base units
      const saleQtyBase = toBaseQty(quantity, productUOM.conversionToBase);

      // Check available stock
      const availableStock = await this.fifoService.getAvailableStock(productId, transaction);
      
      if (availableStock.lessThan(saleQtyBase)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          error: 'Insufficient stock',
          details: {
            required: saleQtyBase.toString(),
            available: availableStock.toString(),
            availableInRequestedUOM: getAvailableInUOM(availableStock, productUOM.conversionToBase).toString()
          }
        });
      }

      // Deduct stock using FIFO and get COGS breakdown
      const fifoResult = await this.fifoService.deductFromStock(
        productId,
        saleQtyBase,
        transaction
      );

      if (!fifoResult.success) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          error: fifoResult.error,
          details: fifoResult
        });
      }

      // Calculate revenue and profit
      const revenue = new Decimal(quantity).times(pricePerUom);
      const cogsAmount = fifoResult.cogsTotal;
      const grossProfit = calcGrossProfit(revenue, cogsAmount);
      const grossProfitMargin = calcGrossProfitMargin(revenue, cogsAmount);

      // Create sale line record
      const saleLine = await this.models.SaleLine.create({
        saleId,
        productId,
        saleUom: uom,
        quantity,
        qtyInBase: saleQtyBase.toString(),
        pricePerUom,
        totalPrice: revenue.toString(),
        cogsAmount: cogsAmount.toString(),
        cogsBreakdown: fifoResult.batchBreakdown,
        grossProfit: grossProfit.toString(),
        grossProfitMargin: grossProfitMargin.toString(),
        saleDate: new Date(saleDate)
      }, { transaction });

      // Update sale record if exists
      if (saleId) {
        const sale = await this.models.Sale.findByPk(saleId, { transaction });
        
        if (sale) {
          // Recalculate sale totals
          const allLines = await this.models.SaleLine.findAll({
            where: { saleId },
            transaction
          });

          const totalRevenue = allLines.reduce((sum, line) => {
            return sum.plus(line.totalPrice || 0);
          }, new Decimal(0));

          const totalCOGS = allLines.reduce((sum, line) => {
            return sum.plus(line.cogsAmount || 0);
          }, new Decimal(0));

          sale.totalAmount = totalRevenue.toString();
          sale.totalCOGS = totalCOGS.toString();
          sale.grossProfit = totalRevenue.minus(totalCOGS).toString();
          await sale.save({ transaction });
        }
      }

      await transaction.commit();

      return res.status(201).json({
        success: true,
        message: 'Sale recorded successfully',
        data: {
          saleLineId: saleLine.id,
          productId,
          uom,
          quantity,
          qtyInBase: saleQtyBase.toString(),
          pricePerUom,
          revenue: revenue.toString(),
          cogsAmount: cogsAmount.toString(),
          cogsBreakdown: fifoResult.batchBreakdown,
          grossProfit: grossProfit.toString(),
          grossProfitMargin: grossProfitMargin.toFixed(2) + '%'
        }
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Error recording sale:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to record sale',
        details: error.message
      });
    }
  }

  /**
   * Get available stock for a product in a specific UOM
   * GET /api/products/:productId/stock
   */
  async getProductStock(req, res) {
    try {
      const { productId } = req.params;
      const { uom } = req.query;

      // Get total stock in base units
      const stockInBase = await this.fifoService.getAvailableStock(productId);
      const inventoryValue = await this.fifoService.getInventoryValuation(productId);
      const averageCost = await this.fifoService.getAverageUnitCost(productId);

      let stockInRequestedUOM = null;
      let uomInfo = null;

      if (uom) {
        const productUOM = await this.models.ProductUOM.findOne({
          where: { productId, uomName: uom }
        });

        if (productUOM) {
          stockInRequestedUOM = getAvailableInUOM(stockInBase, productUOM.conversionToBase);
          uomInfo = {
            uomName: uom,
            conversionToBase: productUOM.conversionToBase,
            stockInUOM: stockInRequestedUOM.toString()
          };
        }
      }

      // Get batch details
      const batches = await this.fifoService.getBatchDetails(productId, false);

      return res.status(200).json({
        success: true,
        data: {
          productId,
          stockInBase: stockInBase.toString(),
          inventoryValue: inventoryValue.toString(),
          averageCost: averageCost.toString(),
          uomInfo,
          batches
        }
      });

    } catch (error) {
      console.error('Error fetching product stock:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch product stock',
        details: error.message
      });
    }
  }

  /**
   * Get FIFO batch details for a product
   * GET /api/products/:productId/batches
   */
  async getProductBatches(req, res) {
    try {
      const { productId } = req.params;
      const { includeEmpty = 'false' } = req.query;

      const batches = await this.fifoService.getBatchDetails(
        productId,
        includeEmpty === 'true'
      );

      return res.status(200).json({
        success: true,
        data: {
          productId,
          batchCount: batches.length,
          batches
        }
      });

    } catch (error) {
      console.error('Error fetching product batches:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch product batches',
        details: error.message
      });
    }
  }

  /**
   * Preview sale (check stock and calculate COGS without committing)
   * POST /api/sales/preview
   */
  async previewSale(req, res) {
    try {
      const { productId, uom, quantity, pricePerUom } = req.body;

      if (!productId || !uom || !quantity || !pricePerUom) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: productId, uom, quantity, pricePerUom'
        });
      }

      // Find product UOM
      const productUOM = await this.models.ProductUOM.findOne({
        where: { productId, uomName: uom }
      });

      if (!productUOM) {
        return res.status(404).json({
          success: false,
          error: `UOM '${uom}' not found for product ${productId}`
        });
      }

      // Convert to base units
      const saleQtyBase = toBaseQty(quantity, productUOM.conversionToBase);

      // Check available stock
      const availableStock = await this.fifoService.getAvailableStock(productId);
      const availableInUOM = getAvailableInUOM(availableStock, productUOM.conversionToBase);

      if (availableStock.lessThan(saleQtyBase)) {
        return res.status(200).json({
          success: false,
          canFulfill: false,
          error: 'Insufficient stock',
          data: {
            required: quantity,
            requiredInBase: saleQtyBase.toString(),
            available: availableInUOM.toString(),
            availableInBase: availableStock.toString()
          }
        });
      }

      // Get batch details for COGS estimation
      const batches = await this.fifoService.getBatchDetails(productId, false);
      
      // Simulate FIFO to estimate COGS
      let qtyRemaining = new Decimal(saleQtyBase);
      let estimatedCOGS = new Decimal(0);
      const batchEstimate = [];

      for (const batch of batches) {
        if (qtyRemaining.lessThanOrEqualTo(0)) break;

        const takeQty = Decimal.min(batch.remainingQtyInBase, qtyRemaining);
        const costThis = new Decimal(takeQty).times(batch.unitCostBase);

        qtyRemaining = qtyRemaining.minus(takeQty);
        estimatedCOGS = estimatedCOGS.plus(costThis);

        batchEstimate.push({
          batchId: batch.id,
          takenQty: takeQty.toString(),
          unitCostBase: batch.unitCostBase,
          cost: costThis.toString()
        });
      }

      const revenue = new Decimal(quantity).times(pricePerUom);
      const grossProfit = calcGrossProfit(revenue, estimatedCOGS);
      const grossProfitMargin = calcGrossProfitMargin(revenue, estimatedCOGS);

      return res.status(200).json({
        success: true,
        canFulfill: true,
        data: {
          productId,
          uom,
          quantity,
          qtyInBase: saleQtyBase.toString(),
          pricePerUom,
          revenue: revenue.toString(),
          estimatedCOGS: estimatedCOGS.toString(),
          grossProfit: grossProfit.toString(),
          grossProfitMargin: grossProfitMargin.toFixed(2) + '%',
          batchEstimate,
          availableStock: availableInUOM.toString()
        }
      });

    } catch (error) {
      console.error('Error previewing sale:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to preview sale',
        details: error.message
      });
    }
  }
}

module.exports = SalesController;
