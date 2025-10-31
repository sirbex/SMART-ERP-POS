'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('inventory_batches', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      source_purchase_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'purchases',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Link to the purchase order/receipt that created this batch'
      },
      batch_reference: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Supplier invoice number, PO number, or other reference'
      },
      qty_in_base: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
        comment: 'Original quantity received in base UOM'
      },
      remaining_qty_in_base: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
        comment: 'Current remaining quantity in base UOM (reduced by sales)'
      },
      unit_cost_base: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
        comment: 'Cost per base unit after all discounts, taxes, and landed cost allocation'
      },
      total_cost_base: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
        comment: 'Total cost of this batch (qty_in_base * unit_cost_base)'
      },
      currency: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'USD'
      },
      exchange_rate: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
        defaultValue: 1.0,
        comment: 'Exchange rate to base currency at time of receipt'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Additional data: landed cost breakdown, original purchase UOM details, etc.'
      },
      received_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'Date/time batch was received (used for FIFO ordering)'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for FIFO queries and performance
    await queryInterface.addIndex('inventory_batches', ['product_id', 'received_at'], {
      name: 'inventory_batches_fifo_idx'
    });
    await queryInterface.addIndex('inventory_batches', ['product_id', 'remaining_qty_in_base'], {
      name: 'inventory_batches_stock_idx'
    });
    await queryInterface.addIndex('inventory_batches', ['source_purchase_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('inventory_batches');
  }
};
