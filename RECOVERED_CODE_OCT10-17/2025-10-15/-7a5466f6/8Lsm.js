'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add base_uom to products table
    await queryInterface.addColumn('products', 'base_uom', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: 'piece',
      comment: 'Base unit of measure for this product (all inventory stored in this UOM)'
    });

    // Update purchase_order_items to support Multi-UOM
    await queryInterface.addColumn('purchase_order_items', 'purchase_uom', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'UOM used for this purchase'
    });

    await queryInterface.addColumn('purchase_order_items', 'qty_in_base', {
      type: Sequelize.DECIMAL(18, 6),
      allowNull: true,
      comment: 'Quantity converted to base UOM'
    });

    await queryInterface.addColumn('purchase_order_items', 'unit_cost_base', {
      type: Sequelize.DECIMAL(18, 6),
      allowNull: true,
      comment: 'Cost per base unit'
    });

    await queryInterface.addColumn('purchase_order_items', 'discount_type', {
      type: Sequelize.ENUM('percent', 'amount'),
      allowNull: true
    });

    await queryInterface.addColumn('purchase_order_items', 'discount_value', {
      type: Sequelize.DECIMAL(18, 6),
      allowNull: true
    });

    await queryInterface.addColumn('purchase_order_items', 'tax_amount', {
      type: Sequelize.DECIMAL(18, 6),
      allowNull: true
    });

    await queryInterface.addColumn('purchase_order_items', 'landed_cost_lines', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Allocated landed costs (shipping, duties, etc.)'
    });

    // Update sale_lines to support Multi-UOM and COGS breakdown
    await queryInterface.addColumn('sale_lines', 'sale_uom', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'UOM used for this sale'
    });

    await queryInterface.addColumn('sale_lines', 'qty_in_base', {
      type: Sequelize.DECIMAL(18, 6),
      allowNull: true,
      comment: 'Quantity converted to base UOM'
    });

    await queryInterface.addColumn('sale_lines', 'price_per_uom', {
      type: Sequelize.DECIMAL(18, 6),
      allowNull: true,
      comment: 'Price per sale UOM'
    });

    await queryInterface.addColumn('sale_lines', 'cogs_amount', {
      type: Sequelize.DECIMAL(18, 6),
      allowNull: true,
      comment: 'Total Cost of Goods Sold for this line'
    });

    await queryInterface.addColumn('sale_lines', 'cogs_breakdown', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'FIFO batch breakdown: [{batchId, takenQty, unitCostBase, cost}]'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove columns from products
    await queryInterface.removeColumn('products', 'base_uom');

    // Remove columns from purchase_order_items
    await queryInterface.removeColumn('purchase_order_items', 'purchase_uom');
    await queryInterface.removeColumn('purchase_order_items', 'qty_in_base');
    await queryInterface.removeColumn('purchase_order_items', 'unit_cost_base');
    await queryInterface.removeColumn('purchase_order_items', 'discount_type');
    await queryInterface.removeColumn('purchase_order_items', 'discount_value');
    await queryInterface.removeColumn('purchase_order_items', 'tax_amount');
    await queryInterface.removeColumn('purchase_order_items', 'landed_cost_lines');

    // Remove columns from sale_lines
    await queryInterface.removeColumn('sale_lines', 'sale_uom');
    await queryInterface.removeColumn('sale_lines', 'qty_in_base');
    await queryInterface.removeColumn('sale_lines', 'price_per_uom');
    await queryInterface.removeColumn('sale_lines', 'cogs_amount');
    await queryInterface.removeColumn('sale_lines', 'cogs_breakdown');
  }
};
