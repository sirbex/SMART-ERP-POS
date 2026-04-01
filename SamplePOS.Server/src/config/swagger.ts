import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SMART-ERP-POS API',
      version: '1.0.0',
      description:
        'Enterprise POS system with purchase order management, FEFO inventory tracking, and native accounting.',
    },
    servers: [{ url: '/api', description: 'API base path' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
            requestId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication and authorization' },
      { name: 'Products', description: 'Product management' },
      { name: 'Customers', description: 'Customer management' },
      { name: 'Suppliers', description: 'Supplier management' },
      { name: 'Sales', description: 'Sales and POS' },
      { name: 'Inventory', description: 'Stock management and FEFO tracking' },
      { name: 'Purchase Orders', description: 'Purchase order workflow' },
      { name: 'Goods Receipts', description: 'Goods receipt workflow' },
      { name: 'Invoices', description: 'Invoice management' },
      { name: 'Accounting', description: 'General ledger and financial operations' },
      { name: 'Banking', description: 'Bank accounts and reconciliation' },
      { name: 'Reports', description: 'Financial and operational reports' },
      { name: 'Admin', description: 'System administration' },
      { name: 'Audit', description: 'Audit trail' },
    ],
  },
  // Scan route files for JSDoc annotations (future enhancement)
  apis: ['./src/modules/**/routes.ts', './src/modules/**/*Routes.ts', './src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
