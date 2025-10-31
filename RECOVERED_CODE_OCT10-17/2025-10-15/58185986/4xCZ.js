'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('product_uoms', {
      id: {
        type: Sequelize.INTEGER,
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
        onDelete: 'CASCADE'
      },
      uom_name: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      conversion_to_base: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
        comment: 'How many base units in 1 of this UOM. E.g., 1 bag = 50 kg, so conversion_to_base = 50'
      },
      uom_type: {
        type: Sequelize.ENUM('purchase', 'sale', 'stock', 'all'),
        allowNull: false,
        defaultValue: 'all',
        comment: 'What operations this UOM can be used for'
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Is this the default UOM for this product for its type'
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

    // Add indexes
    await queryInterface.addIndex('product_uoms', ['product_id']);
    await queryInterface.addIndex('product_uoms', ['product_id', 'uom_name'], {
      unique: true,
      name: 'product_uoms_product_uom_unique'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('product_uoms');
  }
};
