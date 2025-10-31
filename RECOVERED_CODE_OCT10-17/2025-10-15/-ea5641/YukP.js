const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProductUOM = sequelize.define('ProductUOM', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'product_id'
    },
    uomName: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'uom_name'
    },
    conversionToBase: {
      type: DataTypes.DECIMAL(18, 6),
      allowNull: false,
      field: 'conversion_to_base',
      comment: 'How many base units in 1 of this UOM. E.g., 1 bag = 50 kg, so conversion_to_base = 50'
    },
    uomType: {
      type: DataTypes.ENUM('purchase', 'sale', 'stock', 'all'),
      allowNull: false,
      defaultValue: 'all',
      field: 'uom_type',
      comment: 'What operations this UOM can be used for'
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_default',
      comment: 'Is this the default UOM for this product for its type'
    }
  }, {
    tableName: 'product_uoms',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['product_id']
      },
      {
        unique: true,
        fields: ['product_id', 'uom_name'],
        name: 'product_uoms_product_uom_unique'
      }
    ]
  });

  ProductUOM.associate = (models) => {
    ProductUOM.belongsTo(models.Product, {
      foreignKey: 'productId',
      as: 'product'
    });
  };

  return ProductUOM;
};
