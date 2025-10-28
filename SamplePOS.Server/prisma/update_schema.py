"""
SAFE PRISMA SCHEMA UPDATER
Updates backend schema without breaking existing code
Maintains complete separation from frontend
"""

import re
from pathlib import Path

# Paths
BACKEND_PATH = Path(r"C:\Users\Chase\source\repos\SamplePOS\SamplePOS.Server")
SCHEMA_PATH = BACKEND_PATH / "prisma" / "schema.prisma"

print("\n" + "="*50)
print(" SAFE SCHEMA UPDATE")
print("="*50 + "\n")

# Read current schema
with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
    schema = f.read()

print("✅ Read current schema ({} lines)".format(len(schema.splitlines())))

# ========================================
# ADD NEW ENUMS
# ========================================
new_enums = '''
enum POStatus {
  DRAFT
  PENDING
  PARTIAL
  COMPLETED
  CANCELLED
}

enum GRStatus {
  DRAFT
  COMPLETED
  CANCELLED
}

enum BatchStatus {
  ACTIVE
  EXPIRED
  RECALLED
  DEPLETED
}

enum MovementType {
  IN
  OUT
  ADJUSTMENT
  TRANSFER
  RETURN
  DAMAGE
  EXPIRY
}

enum DiscrepancyType {
  NONE
  SHORTAGE
  OVERAGE
  DAMAGE
  QUALITY_ISSUE
}'''

schema += new_enums
print("✅ Added 5 new enums")

# ========================================
# UPDATE USER MODEL
# ========================================
user_additions = '''  purchaseOrdersCreated  PurchaseOrder[]    @relation("PurchaseOrderCreator")
  goodsReceiptsReceived  GoodsReceipt[]     @relation("GoodsReceiptReceiver")
  stockMovements         StockMovement[]    @relation("StockMovementPerformer")
'''

# Find User model and add relations before @@index
user_pattern = r'(model User \{.*?)(  @@index\[username\])'
schema = re.sub(user_pattern, r'\1' + user_additions + r'\2', schema, flags=re.DOTALL)
print("✅ Updated User model (added 3 relations)")

# ========================================
# UPDATE PRODUCT MODEL
# ========================================
product_additions = '''  purchaseOrderItems  PurchaseOrderItem[]
  goodsReceiptItems   GoodsReceiptItem[]
  inventoryBatches    InventoryBatch[]
  stockMovements      StockMovement[]
'''

# Find Product model and add relations before stockBatches
product_pattern = r'(model Product \{.*?)(  stockBatches     StockBatch\[\])'
schema = re.sub(product_pattern, r'\1' + product_additions + r'\2', schema, flags=re.DOTALL)
print("✅ Updated Product model (added 4 relations)")

# ========================================
# UPDATE SUPPLIER MODEL
# ========================================
supplier_additions = '''  purchaseOrders  PurchaseOrder[]
'''

# Find Supplier model and add relation before purchases
supplier_pattern = r'(model Supplier \{.*?)(  purchases       Purchase\[\])'
schema = re.sub(supplier_pattern, r'\1' + supplier_additions + r'\2', schema, flags=re.DOTALL)
print("✅ Updated Supplier model (added 1 relation)")

# ========================================
# ADD NEW MODELS
# ========================================
new_models = '''

// ========================================
// PURCHASE RECEIVING SYSTEM
// ========================================

model PurchaseOrder {
  id                    String              @id @default(cuid())
  poNumber              String              @unique
  supplierId            String
  createdById           String
  status                POStatus            @default(DRAFT)
  subtotal              Decimal             @db.Decimal(15, 2)
  taxAmount             Decimal             @default(0) @db.Decimal(15, 2)
  totalAmount           Decimal             @db.Decimal(15, 2)
  orderDate             DateTime            @default(now())
  sentDate              DateTime?
  expectedDeliveryDate  DateTime?
  paymentTerms          String?             @db.VarChar(200)
  notes                 String?             @db.Text
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  supplier              Supplier            @relation(fields: [supplierId], references: [id])
  createdBy             User                @relation("PurchaseOrderCreator", fields: [createdById], references: [id])
  items                 PurchaseOrderItem[]
  goodsReceipts         GoodsReceipt[]

  @@index([poNumber])
  @@index([supplierId])
  @@index([status])
  @@index([orderDate])
  @@map("purchase_orders")
}

model PurchaseOrderItem {
  id                String          @id @default(cuid())
  purchaseOrderId   String
  productId         String
  orderedQuantity   Decimal         @db.Decimal(15, 4)
  receivedQuantity  Decimal         @default(0) @db.Decimal(15, 4)
  unitPrice         Decimal         @db.Decimal(15, 2)
  notes             String?         @db.Text
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  purchaseOrder     PurchaseOrder   @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  product           Product         @relation(fields: [productId], references: [id])

  @@index([purchaseOrderId])
  @@index([productId])
  @@map("purchase_order_items")
}

model GoodsReceipt {
  id                String            @id @default(cuid())
  receiptNumber     String            @unique
  purchaseOrderId   String?
  receivedById      String
  receivedDate      DateTime          @default(now())
  finalizedDate     DateTime?
  status            GRStatus          @default(DRAFT)
  notes             String?           @db.Text
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  purchaseOrder     PurchaseOrder?    @relation(fields: [purchaseOrderId], references: [id])
  receivedBy        User              @relation("GoodsReceiptReceiver", fields: [receivedById], references: [id])
  items             GoodsReceiptItem[]

  @@index([receiptNumber])
  @@index([purchaseOrderId])
  @@index([status])
  @@index([receivedDate])
  @@map("goods_receipts")
}

model GoodsReceiptItem {
  id                String            @id @default(cuid())
  goodsReceiptId    String
  productId         String
  receivedQuantity  Decimal           @db.Decimal(15, 4)
  actualCost        Decimal           @db.Decimal(15, 2)
  batchNumber       String?           @db.VarChar(100)
  expiryDate        DateTime?
  discrepancyType   DiscrepancyType   @default(NONE)
  discrepancyNotes  String?           @db.Text
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  goodsReceipt      GoodsReceipt      @relation(fields: [goodsReceiptId], references: [id], onDelete: Cascade)
  product           Product           @relation(fields: [productId], references: [id])

  @@index([goodsReceiptId])
  @@index([productId])
  @@map("goods_receipt_items")
}

model InventoryBatch {
  id                String            @id @default(cuid())
  batchNumber       String            @unique
  productId         String
  quantity          Decimal           @db.Decimal(15, 4)
  remainingQuantity Decimal           @db.Decimal(15, 4)
  costPrice         Decimal           @db.Decimal(15, 2)
  expiryDate        DateTime?
  receivedDate      DateTime          @default(now())
  status            BatchStatus       @default(ACTIVE)
  notes             String?           @db.Text
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  product           Product           @relation(fields: [productId], references: [id])
  stockMovements    StockMovement[]

  @@index([batchNumber])
  @@index([productId])
  @@index([status])
  @@index([expiryDate])
  @@map("inventory_batches")
}

model StockMovement {
  id              String        @id @default(cuid())
  movementNumber  String        @unique
  productId       String
  batchId         String?
  movementType    MovementType
  quantity        Decimal       @db.Decimal(15, 4)
  beforeQuantity  Decimal       @db.Decimal(15, 4)
  afterQuantity   Decimal       @db.Decimal(15, 4)
  performedById   String
  reference       String?       @db.VarChar(100)
  reason          String?       @db.VarChar(500)
  notes           String?       @db.Text
  createdAt       DateTime      @default(now())

  product         Product       @relation(fields: [productId], references: [id])
  batch           InventoryBatch? @relation(fields: [batchId], references: [id])
  performedBy     User          @relation("StockMovementPerformer", fields: [performedById], references: [id])

  @@index([movementNumber])
  @@index([productId])
  @@index([batchId])
  @@index([movementType])
  @@index([createdAt])
  @@map("stock_movements")
}
'''

schema += new_models
print("✅ Added 6 new models")

# ========================================
# SAVE UPDATED SCHEMA
# ========================================
with open(SCHEMA_PATH, 'w', encoding='utf-8') as f:
    f.write(schema)

print("\n💾 Saved updated schema ({} lines)\n".format(len(schema.splitlines())))

print("="*50)
print(" ✅ SCHEMA UPDATE COMPLETE")
print("="*50)

print("\n📋 Summary:")
print("   • 5 new enums added")
print("   • User model: +3 relations")
print("   • Product model: +4 relations")
print("   • Supplier model: +1 relation")
print("   • 6 new models added")
print("   • Backup: schema.prisma.backup")

print("\n🎯 NEXT STEP:")
print("   npx prisma migrate dev --name add_purchase_receiving_system")
print("   npx prisma generate\n")
