import { PrismaClient, Prisma } from '@prisma/client';
import type {
  CreateProductUoMInput,
  UpdateProductUoMInput,
  BulkUpdateUoMPricesInput,
  SetupProductUoMsInput,
} from '../validators/uom.validators';

const prisma = new PrismaClient();

/**
 * UoM Service - Business Logic Layer
 * Handles all Unit of Measure operations with proper error handling
 */

export class UoMService {
  /**
   * Check if ProductUoM combination already exists
   */
  private async checkDuplicateProductUoM(
    productId: string,
    uomId: string,
    excludeId?: string
  ): Promise<boolean> {
    const existing = await prisma.productUoM.findFirst({
      where: {
        productId,
        uomId,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
    return !!existing;
  }

  /**
   * Ensure only one default UoM per product
   */
  private async ensureSingleDefault(productId: string, newDefaultId: string): Promise<void> {
    await prisma.productUoM.updateMany({
      where: {
        productId,
        id: { not: newDefaultId },
        isDefault: true,
      },
      data: { isDefault: false },
    });
  }

  /**
   * Create a new ProductUoM with individual price
   */
  async createProductUoM(data: CreateProductUoMInput) {
    try {
      // Check if product exists
      const product = await prisma.product.findUnique({
        where: { id: data.productId },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      // Check if UoM exists
      const uom = await prisma.unitOfMeasure.findUnique({
        where: { id: data.uomId },
      });

      if (!uom) {
        throw new Error('Unit of Measure not found');
      }

      // Check for duplicate
      const isDuplicate = await this.checkDuplicateProductUoM(data.productId, data.uomId);
      if (isDuplicate) {
        throw new Error('This UoM is already assigned to the product');
      }

      // If setting as default, remove other defaults
      if (data.isDefault) {
        await this.ensureSingleDefault(data.productId, '');
      }

      // Create ProductUoM
      const productUoM = await prisma.productUoM.create({
        data: {
          productId: data.productId,
          uomId: data.uomId,
          conversionFactor: data.conversionFactor,
          unitPrice: data.unitPrice,
          isDefault: data.isDefault,
          isSaleAllowed: data.isSaleAllowed,
          isPurchaseAllowed: data.isPurchaseAllowed,
          barcode: data.barcode,
          sortOrder: data.sortOrder,
        },
        include: {
          uom: true,
          product: {
            select: {
              id: true,
              name: true,
              baseUnit: true,
            },
          },
        },
      });

      return {
        success: true,
        data: productUoM,
        message: 'Product UoM created successfully',
      };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Failed to create Product UoM',
      };
    }
  }

  /**
   * Update ProductUoM including price
   */
  async updateProductUoM(id: string, data: UpdateProductUoMInput) {
    try {
      // Check if ProductUoM exists
      const existing = await prisma.productUoM.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error('Product UoM not found');
      }

      // If setting as default, remove other defaults
      if (data.isDefault) {
        await this.ensureSingleDefault(existing.productId, id);
      }

      // Update ProductUoM
      const productUoM = await prisma.productUoM.update({
        where: { id },
        data: {
          ...(data.conversionFactor !== undefined && { conversionFactor: data.conversionFactor }),
          ...(data.unitPrice !== undefined && { unitPrice: data.unitPrice }),
          ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
          ...(data.isSaleAllowed !== undefined && { isSaleAllowed: data.isSaleAllowed }),
          ...(data.isPurchaseAllowed !== undefined && { isPurchaseAllowed: data.isPurchaseAllowed }),
          ...(data.barcode !== undefined && { barcode: data.barcode }),
          ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        },
        include: {
          uom: true,
          product: {
            select: {
              id: true,
              name: true,
              baseUnit: true,
            },
          },
        },
      });

      return {
        success: true,
        data: productUoM,
        message: 'Product UoM updated successfully',
      };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Failed to update Product UoM',
      };
    }
  }

  /**
   * Bulk update prices for multiple UoMs
   * Use this when manually setting prices for each unit
   */
  async bulkUpdateUoMPrices(data: BulkUpdateUoMPricesInput) {
    try {
      // Verify product exists
      const product = await prisma.product.findUnique({
        where: { id: data.productId },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      // Verify all UoMs exist and belong to product
      const existingUoMs = await prisma.productUoM.findMany({
        where: {
          productId: data.productId,
          uomId: { in: data.prices.map((p) => p.uomId) },
        },
      });

      if (existingUoMs.length !== data.prices.length) {
        throw new Error('Some UoMs do not exist for this product');
      }

      // Update prices in transaction
      const updates = await prisma.$transaction(
        data.prices.map((priceData) =>
          prisma.productUoM.updateMany({
            where: {
              productId: data.productId,
              uomId: priceData.uomId,
            },
            data: {
              unitPrice: priceData.unitPrice,
            },
          })
        )
      );

      // Fetch updated records
      const updatedUoMs = await prisma.productUoM.findMany({
        where: {
          productId: data.productId,
          uomId: { in: data.prices.map((p) => p.uomId) },
        },
        include: {
          uom: true,
        },
        orderBy: { sortOrder: 'asc' },
      });

      return {
        success: true,
        data: updatedUoMs,
        message: `Updated prices for ${updates.length} units`,
      };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Failed to update UoM prices',
      };
    }
  }

  /**
   * Setup complete UoM configuration for a product
   * Use this for initial setup with all units and prices
   */
  async setupProductUoMs(data: SetupProductUoMsInput) {
    try {
      // Verify product exists
      const product = await prisma.product.findUnique({
        where: { id: data.productId },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      // Verify all UoMs exist
      const uomIds = data.uoms.map((u) => u.uomId);
      const existingUoMs = await prisma.unitOfMeasure.findMany({
        where: { id: { in: uomIds } },
      });

      if (existingUoMs.length !== uomIds.length) {
        throw new Error('Some UoMs do not exist');
      }

      // Check for duplicates in input
      const uniqueUomIds = new Set(uomIds);
      if (uniqueUomIds.size !== uomIds.length) {
        throw new Error('Duplicate UoMs in request');
      }

      // Perform setup in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Delete existing ProductUoMs for this product
        await tx.productUoM.deleteMany({
          where: { productId: data.productId },
        });

        // Create new ProductUoMs
        const created = await Promise.all(
          data.uoms.map((uomData, index) =>
            tx.productUoM.create({
              data: {
                productId: data.productId,
                uomId: uomData.uomId,
                conversionFactor: uomData.conversionFactor,
                unitPrice: uomData.unitPrice,
                isDefault: uomData.isDefault,
                isSaleAllowed: uomData.isSaleAllowed,
                isPurchaseAllowed: uomData.isPurchaseAllowed,
                barcode: uomData.barcode,
                sortOrder: index,
              },
              include: {
                uom: true,
              },
            })
          )
        );

        return created;
      });

      return {
        success: true,
        data: result,
        message: `Configured ${result.length} units for product`,
      };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Failed to setup Product UoMs',
      };
    }
  }

  /**
   * Get all UoMs for a product with prices
   */
  async getProductUoMs(productId: string) {
    try {
      const productUoMs = await prisma.productUoM.findMany({
        where: { productId },
        include: {
          uom: {
            include: {
              category: true,
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });

      return {
        success: true,
        data: productUoMs,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch Product UoMs',
      };
    }
  }

  /**
   * Delete a ProductUoM
   */
  async deleteProductUoM(id: string) {
    try {
      const productUoM = await prisma.productUoM.findUnique({
        where: { id },
      });

      if (!productUoM) {
        throw new Error('Product UoM not found');
      }

      // Check if it's the last UoM for the product
      const count = await prisma.productUoM.count({
        where: { productId: productUoM.productId },
      });

      if (count === 1) {
        throw new Error('Cannot delete the last UoM for a product');
      }

      // Check if it's the default
      if (productUoM.isDefault) {
        throw new Error('Cannot delete the default UoM. Set another UoM as default first');
      }

      await prisma.productUoM.delete({
        where: { id },
      });

      return {
        success: true,
        message: 'Product UoM deleted successfully',
      };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Failed to delete Product UoM',
      };
    }
  }

  /**
   * Calculate price for a given quantity and UoM
   */
  async calculatePrice(productId: string, uomId: string, quantity: number) {
    try {
      const productUoM = await prisma.productUoM.findFirst({
        where: {
          productId,
          uomId,
          isSaleAllowed: true,
        },
        include: {
          uom: true,
          product: true,
        },
      });

      if (!productUoM) {
        throw new Error('UoM not available for sale for this product');
      }

      // Use unitPrice if set, otherwise fallback to calculated price
      const unitPrice = productUoM.unitPrice ?? 
        Number(productUoM.product.sellingPrice) * Number(productUoM.conversionFactor);

      const total = unitPrice * quantity;
      const baseQuantity = quantity * Number(productUoM.conversionFactor);

      return {
        success: true,
        data: {
          unitPrice,
          quantity,
          total,
          baseQuantity,
          unit: productUoM.uom.abbreviation,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Failed to calculate price',
      };
    }
  }
}

export const uomService = new UoMService();
