#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Initialize Complete POS System from Scratch

.DESCRIPTION
    Creates a production-ready full-stack POS system with:
    - Backend: Node.js + Express + TypeScript + Prisma + PostgreSQL
    - Frontend: React + Vite + TailwindCSS + TypeScript
    - Complete separation, REST API communication only
#>

$ErrorActionPreference = "Stop"

Write-Host "🚀 POS System - Complete Rebuild Initialization" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Get target directory
$targetDir = Read-Host "Enter target directory (default: C:\Users\Chase\source\repos\pos-project)"
if ([string]::IsNullOrWhiteSpace($targetDir)) {
    $targetDir = "C:\Users\Chase\source\repos\pos-project"
}

Write-Host ""
Write-Host "📁 Creating project at: $targetDir" -ForegroundColor Yellow
Write-Host ""

# Create root directory
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

# ============================================================================
# BACKEND INITIALIZATION
# ============================================================================
Write-Host "🔧 Initializing Backend (Node.js + Express + TypeScript + Prisma)..." -ForegroundColor Cyan

$backendDir = Join-Path $targetDir "pos-backend"
New-Item -ItemType Directory -Path $backendDir -Force | Out-Null
Set-Location $backendDir

# Create backend package.json
$backendPackage = @"
{
  "name": "pos-backend",
  "version": "1.0.0",
  "description": "POS System Backend - TypeScript + Express + Prisma",
  "main": "dist/server.js",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts"
  },
  "keywords": ["pos", "inventory", "typescript", "express", "prisma"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "@prisma/client": "^5.18.0",
    "express": "^4.18.3",
    "cors": "^2.8.5",
    "helmet": "^7.2.0",
    "compression": "^1.8.1",
    "dotenv": "^16.4.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "express-validator": "^7.2.0",
    "winston": "^3.18.3",
    "date-fns": "^3.6.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/compression": "^1.7.5",
    "@types/bcryptjs": "^2.4.6",
    "@types/jsonwebtoken": "^9.0.6",
    "typescript": "^5.5.0",
    "tsx": "^4.16.0",
    "prisma": "^5.18.0"
  }
}
"@
Set-Content -Path "package.json" -Value $backendPackage

# Create tsconfig.json for backend
$backendTsConfig = @"
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "rootDir": "./src",
    "outDir": "./dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
"@
Set-Content -Path "tsconfig.json" -Value $backendTsConfig

# Create .env.example
$envExample = @"
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/pos_system"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_EXPIRES_IN="7d"

# Server
PORT=3001
NODE_ENV=development

# Company Settings
COMPANY_NAME="Your Company"
COMPANY_ADDRESS="123 Business St"
COMPANY_TAX_ID="TAX-123456"
CURRENCY="USD"
"@
Set-Content -Path ".env.example" -Value $envExample

# Create Prisma schema
$prismaDir = Join-Path $backendDir "prisma"
New-Item -ItemType Directory -Path $prismaDir -Force | Out-Null

$prismaSchema = @"
// Prisma Schema for POS System
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  password  String
  name      String
  role      UserRole @default(CASHIER)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  sales     Sale[]
  purchases Purchase[]

  @@map("users")
}

enum UserRole {
  ADMIN
  MANAGER
  CASHIER
}

// ============================================================================
// PRODUCT & INVENTORY
// ============================================================================

model Product {
  id              Int            @id @default(autoincrement())
  sku             String         @unique
  name            String
  description     String?
  category        String?
  basePrice       Decimal        @db.Decimal(10, 2)
  costPrice       Decimal        @db.Decimal(10, 2)
  taxRate         Decimal        @default(0) @db.Decimal(5, 2)
  reorderLevel    Int            @default(10)
  baseUnit        String         // e.g., "pcs", "kg", "liter"
  isActive        Boolean        @default(true)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  units           ProductUnit[]
  batches         StockBatch[]
  purchaseItems   PurchaseItem[]
  saleItems       SaleItem[]

  @@map("products")
}

model ProductUnit {
  id              Int      @id @default(autoincrement())
  productId       Int
  unitName        String   // e.g., "box", "carton", "dozen"
  conversionRate  Decimal  @db.Decimal(10, 4) // e.g., 1 box = 12 pcs
  isBaseUnit      Boolean  @default(false)
  barcode         String?
  createdAt       DateTime @default(now())

  product         Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([productId, unitName])
  @@map("product_units")
}

model StockBatch {
  id                Int       @id @default(autoincrement())
  productId         Int
  batchNumber       String
  initialQuantity   Decimal   @db.Decimal(10, 2)
  remainingQuantity Decimal   @db.Decimal(10, 2)
  unitCost          Decimal   @db.Decimal(10, 2)
  supplierInvoice   String?
  receivedDate      DateTime  @default(now())
  expiryDate        DateTime?
  location          String?
  createdAt         DateTime  @default(now())

  product           Product   @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId, remainingQuantity])
  @@map("stock_batches")
}

// ============================================================================
// CUSTOMERS
// ============================================================================

model Customer {
  id              Int              @id @default(autoincrement())
  name            String
  email           String?          @unique
  phone           String?
  address         String?
  taxId           String?
  creditLimit     Decimal          @default(0) @db.Decimal(10, 2)
  currentBalance  Decimal          @default(0) @db.Decimal(10, 2)
  totalDeposits   Decimal          @default(0) @db.Decimal(10, 2)
  isActive        Boolean          @default(true)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  sales           Sale[]
  transactions    CustomerTransaction[]

  @@map("customers")
}

model CustomerTransaction {
  id          Int                     @id @default(autoincrement())
  customerId  Int
  type        CustomerTransactionType
  amount      Decimal                 @db.Decimal(10, 2)
  reference   String?
  notes       String?
  createdAt   DateTime                @default(now())

  customer    Customer                @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@map("customer_transactions")
}

enum CustomerTransactionType {
  SALE
  PAYMENT
  DEPOSIT
  REFUND
  ADJUSTMENT
}

// ============================================================================
// SUPPLIERS
// ============================================================================

model Supplier {
  id              Int       @id @default(autoincrement())
  name            String
  email           String?   @unique
  phone           String?
  address         String?
  taxId           String?
  paymentTerms    String?   // e.g., "Net 30"
  currentBalance  Decimal   @default(0) @db.Decimal(10, 2)
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  purchases       Purchase[]

  @@map("suppliers")
}

// ============================================================================
// PURCHASES
// ============================================================================

model Purchase {
  id                Int            @id @default(autoincrement())
  invoiceNumber     String         @unique
  supplierId        Int
  userId            Int
  totalAmount       Decimal        @db.Decimal(10, 2)
  taxAmount         Decimal        @default(0) @db.Decimal(10, 2)
  discountAmount    Decimal        @default(0) @db.Decimal(10, 2)
  finalAmount       Decimal        @db.Decimal(10, 2)
  status            PurchaseStatus @default(PENDING)
  purchaseDate      DateTime       @default(now())
  dueDate           DateTime?
  notes             String?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  supplier          Supplier       @relation(fields: [supplierId], references: [id])
  user              User           @relation(fields: [userId], references: [id])
  items             PurchaseItem[]

  @@map("purchases")
}

model PurchaseItem {
  id          Int      @id @default(autoincrement())
  purchaseId  Int
  productId   Int
  quantity    Decimal  @db.Decimal(10, 2)
  unitCost    Decimal  @db.Decimal(10, 2)
  totalCost   Decimal  @db.Decimal(10, 2)
  unit        String   // Which UOM used
  batchNumber String?
  expiryDate  DateTime?

  purchase    Purchase @relation(fields: [purchaseId], references: [id], onDelete: Cascade)
  product     Product  @relation(fields: [productId], references: [id])

  @@map("purchase_items")
}

enum PurchaseStatus {
  PENDING
  RECEIVED
  PARTIAL
  CANCELLED
}

// ============================================================================
// SALES
// ============================================================================

model Sale {
  id              Int         @id @default(autoincrement())
  invoiceNumber   String      @unique
  customerId      Int?
  userId          Int
  subtotal        Decimal     @db.Decimal(10, 2)
  taxAmount       Decimal     @default(0) @db.Decimal(10, 2)
  discountAmount  Decimal     @default(0) @db.Decimal(10, 2)
  totalAmount     Decimal     @db.Decimal(10, 2)
  paidAmount      Decimal     @db.Decimal(10, 2)
  outstandingAmount Decimal   @default(0) @db.Decimal(10, 2)
  costOfGoods     Decimal     @db.Decimal(10, 2) // FIFO calculated
  profit          Decimal     @db.Decimal(10, 2)
  status          SaleStatus  @default(COMPLETED)
  saleDate        DateTime    @default(now())
  notes           String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  customer        Customer?   @relation(fields: [customerId], references: [id])
  user            User        @relation(fields: [userId], references: [id])
  items           SaleItem[]
  payments        Payment[]
  documents       Document[]

  @@map("sales")
}

model SaleItem {
  id          Int     @id @default(autoincrement())
  saleId      Int
  productId   Int
  quantity    Decimal @db.Decimal(10, 2)
  unitPrice   Decimal @db.Decimal(10, 2)
  totalPrice  Decimal @db.Decimal(10, 2)
  costPrice   Decimal @db.Decimal(10, 2) // FIFO calculated
  unit        String

  sale        Sale    @relation(fields: [saleId], references: [id], onDelete: Cascade)
  product     Product @relation(fields: [productId], references: [id])

  @@map("sale_items")
}

model Payment {
  id            Int          @id @default(autoincrement())
  saleId        Int
  amount        Decimal      @db.Decimal(10, 2)
  method        PaymentMethod
  reference     String?
  notes         String?
  createdAt     DateTime     @default(now())

  sale          Sale         @relation(fields: [saleId], references: [id], onDelete: Cascade)

  @@map("payments")
}

enum PaymentMethod {
  CASH
  CARD
  MOBILE_MONEY
  BANK_TRANSFER
  DEPOSIT
  CREDIT
}

enum SaleStatus {
  COMPLETED
  PENDING
  PARTIAL
  CANCELLED
  REFUNDED
}

// ============================================================================
// DOCUMENTS
// ============================================================================

model Document {
  id              Int           @id @default(autoincrement())
  documentNumber  String        @unique
  type            DocumentType
  saleId          Int?
  content         String        // JSON or HTML
  generatedAt     DateTime      @default(now())

  sale            Sale?         @relation(fields: [saleId], references: [id])

  @@map("documents")
}

enum DocumentType {
  INVOICE
  DELIVERY_NOTE
  RECEIPT
  QUOTATION
}

// ============================================================================
// SETTINGS
// ============================================================================

model Setting {
  id    Int    @id @default(autoincrement())
  key   String @unique
  value String
  updatedAt DateTime @updatedAt

  @@map("settings")
}
"@
Set-Content -Path (Join-Path $prismaDir "schema.prisma") -Value $prismaSchema

Write-Host "✅ Backend structure created" -ForegroundColor Green

# ============================================================================
# FRONTEND INITIALIZATION
# ============================================================================
Write-Host ""
Write-Host "⚛️  Initializing Frontend (React + Vite + TypeScript + TailwindCSS)..." -ForegroundColor Cyan

Set-Location $targetDir

# Run Vite create command
Write-Host "Creating Vite project..." -ForegroundColor Yellow
npm create vite@latest pos-frontend -- --template react-ts

Set-Location (Join-Path $targetDir "pos-frontend")

# Update package.json with all dependencies
$frontendPackageAdditions = @"
,
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.24.0",
    "@tanstack/react-query": "^5.45.0",
    "axios": "^1.7.2",
    "date-fns": "^3.6.0",
    "lucide-react": "^0.395.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^7.13.0",
    "@typescript-eslint/parser": "^7.13.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "tailwindcss": "^3.4.4",
    "postcss": "^8.4.38",
    "autoprefixer": "^10.4.19",
    "eslint": "^8.57.0"
  }
"@

Write-Host "✅ Frontend structure created" -ForegroundColor Green

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "✅ Project Structure Created!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Yellow
Write-Host "1. cd $backendDir" -ForegroundColor White
Write-Host "2. npm install" -ForegroundColor White
Write-Host "3. Copy .env.example to .env and configure DATABASE_URL" -ForegroundColor White
Write-Host "4. npx prisma migrate dev --name init" -ForegroundColor White
Write-Host "5. cd $targetDir\pos-frontend" -ForegroundColor White
Write-Host "6. npm install" -ForegroundColor White
Write-Host "7. npx tailwindcss init -p" -ForegroundColor White
Write-Host ""
Write-Host "📁 Project created at: $targetDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "🚀 Ready to start building!" -ForegroundColor Green
"@

Set-Content -Path (Join-Path $targetDir "INIT_SCRIPT.ps1") -Value $initScript
