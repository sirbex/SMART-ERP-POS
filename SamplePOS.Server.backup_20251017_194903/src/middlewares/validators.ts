import type { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

/**
 * Middleware to validate inventory item data
 */
export const validateInventoryItem = [
  body('name')
    .notEmpty().withMessage('Item name is required')
    .isString().withMessage('Item name must be a string')
    .isLength({ min: 1, max: 255 }).withMessage('Item name must be between 1 and 255 characters'),
  
  body('sku')
    .optional()
    .isString().withMessage('SKU must be a string')
    .isLength({ min: 1, max: 50 }).withMessage('SKU must be between 1 and 50 characters'),
  
  body('basePrice')
    .notEmpty().withMessage('Base price is required')
    .isNumeric().withMessage('Base price must be a number')
    .custom(value => value >= 0).withMessage('Base price must be a non-negative number'),
  
  body('taxRate')
    .optional()
    .isNumeric().withMessage('Tax rate must be a number')
    .custom(value => value >= 0).withMessage('Tax rate must be a non-negative number'),
  
  body('reorderLevel')
    .optional()
    .isInt().withMessage('Reorder level must be an integer')
    .custom(value => value >= 0).withMessage('Reorder level must be a non-negative integer'),
  
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be a boolean'),
  
  // Validate the request
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map(err => err.msg)
      });
    }
    
    next();
  }
];

/**
 * Middleware to validate inventory batch data
 */
export const validateInventoryBatch = [
  body('inventoryItemId')
    .notEmpty().withMessage('Inventory item ID is required')
    .isInt().withMessage('Inventory item ID must be an integer'),
  
  body('batchNumber')
    .optional()
    .isString().withMessage('Batch number must be a string')
    .isLength({ min: 1, max: 100 }).withMessage('Batch number must be between 1 and 100 characters'),
  
  body('quantity')
    .notEmpty().withMessage('Quantity is required')
    .isNumeric().withMessage('Quantity must be a number')
    .custom(value => value >= 0).withMessage('Quantity must be a non-negative number'),
  
  body('remainingQuantity')
    .optional()
    .isNumeric().withMessage('Remaining quantity must be a number')
    .custom(value => value >= 0).withMessage('Remaining quantity must be a non-negative number'),
  
  body('unitCost')
    .optional()
    .isNumeric().withMessage('Unit cost must be a number')
    .custom(value => value >= 0).withMessage('Unit cost must be a non-negative number'),
  
  body('expiryDate')
    .optional()
    .isISO8601().withMessage('Expiry date must be a valid date'),
  
  body('receivedDate')
    .optional()
    .isISO8601().withMessage('Received date must be a valid date'),
  
  // Validate the request
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map(err => err.msg)
      });
    }
    
    next();
  }
];