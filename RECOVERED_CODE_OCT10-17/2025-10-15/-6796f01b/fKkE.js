const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const InventoryBatch = sequelize.define('InventoryBatch', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'product_id'
    },
    sourcePurchaseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'source_purchase_id',
      comment: 'Link to the purchase order/receipt that created this batch'
    },
    batchReference: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'batch_reference',
      comment: 'Supplier invoice number, PO number, or other reference'
    },
    qtyInBase: {
      type: DataTypes.DECIMAL(18, 6),
      allowNull: false,
      field: 'qty_in_base',
      comment: 'Original quantity received in base UOM'
    },
    remainingQtyInBase: {
      type: DataTypes.DECIMAL(18, 6),
      allowNull: false,
      field: 'remaining_qty_in_base',
      comment: 'Current remaining quantity in base UOM (reduced by sales)'
    },
    unitCostBase: {
      type: DataTypes.DECIMAL(18, 6),
      allowNull: false,
      field: 'unit_cost_base',
      comment: 'Cost per base unit after all discounts, taxes, and landed cost allocation'
    },
    totalCostBase: {
      type: DataTypes.DECIMAL(18, 6),
      allowNull: false,
      field: 'total_cost_base',
      comment: 'Total cost of this batch (qty_in_base * unit_cost_base)'
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'USD'
    },
    exchangeRate: {
      type: DataTypes.DECIMAL(18, 6),
      allowNull: false,
      defaultValue: 1.0,
      field: 'exchange_rate',
      comment: 'Exchange rate to base currency at time of receipt'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Additional data: landed cost breakdown, original purchase UOM details, etc.'
    },
    receivedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'received_at',
      comment: 'Date/time batch was received (used for FIFO ordering)'
    }
  }, {
    tableName: 'inventory_batches',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['product_id', 'received_at'],
        name: 'inventory_batches_fifo_idx'
      },
      {
        fields: ['product_id', 'remaining_qty_in_base'],
        name: 'inventory_batches_stock_idx'
      },
      {
        fields: ['source_purchase_id']
      }
    ]
  });

  InventoryBatch.associate = (models) => {
    InventoryBatch.belongsTo(models.Product, {
      foreignKey: 'productId',
      as: 'product'
    });

    if (models.Purchase) {
      InventoryBatch.belongsTo(models.Purchase, {
        foreignKey: 'sourcePurchaseId',
        as: 'sourcePurchase'
      });
    }
  };

  return InventoryBatch;
};
