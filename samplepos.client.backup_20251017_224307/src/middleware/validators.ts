import { Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import type { ApiResponse } from '../types/api';

// Helper function to process validation errors
const processValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const response: ApiResponse = {
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => err.msg)
    };
    
    return res.status(400).json(response);
  }
  
  next();
};

// Export the validation middleware for external use
export const validateRequest = processValidationErrors;

// Inventory Item Validation
export const validateInventoryItem = [
  body('sku')
    .trim()
    .isString()
    .notEmpty().withMessage('SKU is required')
    .isLength({ max: 50 }).withMessage('SKU cannot exceed 50 characters'),
    
  body('name')
    .trim()
    .isString()
    .notEmpty().withMessage('Name is required')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
    
  body('description')
    .optional()
    .trim()
    .isString()
    .isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),
    
  body('category')
    .optional()
    .trim()
    .isString()
    .isLength({ max: 50 }).withMessage('Category cannot exceed 50 characters'),
    
  body('basePrice')
    .isNumeric().withMessage('Base price must be a number')
    .custom(value => value >= 0).withMessage('Base price cannot be negative'),
    
  body('taxRate')
    .optional()
    .isNumeric().withMessage('Tax rate must be a number')
    .custom(value => value >= 0 && value <= 100).withMessage('Tax rate must be between 0 and 100'),
    
  body('reorderLevel')
    .optional()
    .isInt().withMessage('Reorder level must be an integer')
    .custom(value => value >= 0).withMessage('Reorder level cannot be negative'),
    
  body('isActive')
    .optional()
    .isBoolean().withMessage('Is active must be a boolean'),
    
  body('metadata')
    .optional()
    .custom(value => {
      if (value === null) return true;
      if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Metadata must be an object');
      }
      return true;
    }),
    
  processValidationErrors
];

// Inventory Batch Validation
export const validateInventoryBatch = [
  body('inventoryItemId')
    .isInt().withMessage('Inventory item ID must be an integer')
    .custom(value => value > 0).withMessage('Inventory item ID must be positive'),
    
  body('quantity')
    .isNumeric().withMessage('Quantity must be a number')
    .custom(value => value > 0).withMessage('Quantity must be greater than zero'),
    
  body('unitCost')
    .isNumeric().withMessage('Unit cost must be a number')
    .custom(value => value >= 0).withMessage('Unit cost cannot be negative'),
    
  body('expirationDate')
    .optional()
    .isISO8601().withMessage('Expiration date must be a valid date'),
    
  body('lotNumber')
    .optional()
    .trim()
    .isString()
    .isLength({ max: 50 }).withMessage('Lot number cannot exceed 50 characters'),
    
  body('receivedDate')
    .optional()
    .isISO8601().withMessage('Received date must be a valid date'),
    
  body('supplierId')
    .optional()
    .isInt().withMessage('Supplier ID must be an integer'),
    
  body('purchaseOrderId')
    .optional()
    .isString().withMessage('Purchase order ID must be a string')
    .isLength({ max: 50 }).withMessage('Purchase order ID cannot exceed 50 characters'),
    
  body('locationCode')
    .optional()
    .trim()
    .isString()
    .isLength({ max: 50 }).withMessage('Location code cannot exceed 50 characters'),
    
  body('notes')
    .optional()
    .trim()
    .isString()
    .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters'),
    
  processValidationErrors
];

// Batch Quantity Adjustment Validation
export const validateBatchAdjustment = [
  param('id')
    .isInt().withMessage('Batch ID must be an integer')
    .custom(value => value > 0).withMessage('Batch ID must be positive'),
    
  body('quantity')
    .isNumeric().withMessage('Adjustment quantity must be a number')
    .notEmpty().withMessage('Adjustment quantity is required'),
    
  body('reason')
    .trim()
    .isString().withMessage('Reason must be a string')
    .notEmpty().withMessage('Reason is required')
    .isLength({ max: 200 }).withMessage('Reason cannot exceed 200 characters'),
    
  body('reference')
    .optional()
    .trim()
    .isString()
    .isLength({ max: 100 }).withMessage('Reference cannot exceed 100 characters'),
    
  processValidationErrors
];

// Migration Data Validation
export const validateMigrationData = [
  body('items')
    .isArray().withMessage('Items must be an array'),
    
  body('items.*.sku')
    .notEmpty().withMessage('SKU is required for each item')
    .isString().withMessage('SKU must be a string'),
    
  body('items.*.name')
    .notEmpty().withMessage('Name is required for each item')
    .isString().withMessage('Name must be a string'),
    
  body('batches')
    .optional()
    .isArray().withMessage('Batches must be an array'),
    
  body('batches.*.inventoryItemId')
    .if(body('batches').exists())
    .notEmpty().withMessage('Inventory item ID is required for each batch')
    .isString().withMessage('Inventory item ID must be a string or number'),
    
  body('batches.*.quantity')
    .if(body('batches').exists())
    .notEmpty().withMessage('Quantity is required for each batch')
    .isNumeric().withMessage('Quantity must be a number'),
    
  processValidationErrors
];