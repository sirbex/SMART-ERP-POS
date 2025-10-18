# 📦 Bulk Purchase System - Demo & Test Guide

## Overview
Enhanced inventory system now supports **bulk purchasing** with automatic cost calculations and flexible selling options.

## 🎯 **Complete Workflow Example: Bottle Purchase**

### **Step 1: Bulk Purchase**
1. **Open Inventory Management**
2. **Click "📦 Bulk Purchase"** button
3. **Fill in the form:**
   - **Product Name**: `Coca Cola`
   - **Batch**: `CC-2025-001`  
   - **Category**: `Beverages`
   - **Supplier**: `Coca Cola Distributors`

### **Step 2: Configure Units**
1. **Individual Unit (What you sell):**
   - Unit ID: `bottle`
   - Display Name: `Bottle`

2. **Purchase Unit (How you buy):**
   - Unit ID: `box`  
   - Display Name: `Box`
   - **Units per Box**: `24` bottles
   - **Cost per Box**: `$12.00`

3. **Sales Pricing:**
   - **Markup Percentage**: `25%`
   - **Minimum Selling Price**: `$0.60` (optional)

### **Step 3: Automatic Calculations**
System automatically calculates:
- **Cost per Bottle**: $12.00 ÷ 24 = `$0.50`
- **Selling Price per Bottle**: $0.50 × 1.25 = `$0.625` (rounds to $0.63)
- **Selling Price per Box**: $12.00 × 1.25 = `$15.00`
- **Total Inventory**: 24 bottles received

## 🏪 **Point of Sale Usage**

### **Selling Individual Bottles**
1. **Search for "Coca Cola"** in POS
2. **Product appears with UoM options:**
   - `Bottle` - $0.63 each
   - `Box` - $15.00 each
3. **Select "Bottle"** → Customer buys 1 bottle for $0.63
4. **Inventory updates**: 23 bottles remaining

### **Selling Whole Boxes**  
1. **Search for "Coca Cola"** in POS
2. **Select "Box"** → Customer buys 1 box for $15.00
3. **Inventory updates**: 0 bottles remaining (24 bottles sold as 1 box)

## 🧮 **Cost & Profit Analysis**

### **Per Bottle Sales:**
- **Cost**: $0.50
- **Selling Price**: $0.63
- **Profit**: $0.13 per bottle (26% markup)

### **Per Box Sales:**
- **Cost**: $12.00
- **Selling Price**: $15.00  
- **Profit**: $3.00 per box (25% markup)

### **Mixed Sales Example:**
Starting inventory: **24 bottles** (1 box purchased for $12.00)

**Sales:**
- 10 individual bottles @ $0.63 = $6.30
- 1 box (14 bottles) @ $15.00 = $15.00
- **Total Revenue**: $21.30
- **Total Cost**: $12.00
- **Total Profit**: $9.30 (77.5% profit!)

## 🔧 **Quick Setup Scenarios**

### **Scenario 1: Medicine Tablets**
- **Base Unit**: `tablet` 
- **Purchase Unit**: `strip` (10 tablets)
- **Cost**: $5.00 per strip
- **Auto-calculated**: $0.50 per tablet
- **Markup**: 30% → $0.65 per tablet, $6.50 per strip

### **Scenario 2: Bulk Items**  
- **Base Unit**: `piece`
- **Purchase Unit**: `dozen` (12 pieces)
- **Cost**: $8.00 per dozen
- **Auto-calculated**: $0.67 per piece
- **Markup**: 20% → $0.80 per piece, $9.60 per dozen

## 📊 **Inventory Display**

Enhanced inventory table shows:
- **📦 $0.50 cost** - Indicates bulk purchased item
- **Available units**: Both bottles and boxes
- **Pricing**: Individual and bulk pricing
- **Purchase info**: Hover for cost breakdown

## ✅ **Testing Checklist**

### **Inventory Management:**
- [ ] Click "📦 Bulk Purchase" button
- [ ] Fill product information
- [ ] Configure purchase and sale units  
- [ ] Verify automatic cost calculations
- [ ] Save item to inventory

### **Point of Sale:**
- [ ] Search for bulk purchased item
- [ ] Verify both UoM options appear (bottle + box)
- [ ] Sell individual units
- [ ] Sell bulk units  
- [ ] Check inventory updates correctly

### **Cost Tracking:**
- [ ] Verify cost per unit calculations
- [ ] Check profit margins
- [ ] Validate pricing consistency

## 🚀 **Advanced Features**

### **Multiple Purchase Updates**
- Add more boxes → System updates weighted average cost
- Track different batches separately
- Maintain cost history per purchase

### **Flexible Pricing**
- Set minimum selling prices
- Configure maximum discount limits
- Adjust markup per product category

### **Inventory Integration**  
- Real-time stock updates
- Low stock alerts work with bulk units
- Purchase history tracking
- Cost analysis reporting

---

**🎉 Ready to test! The system handles the complete bulk purchase → individual/bulk sales workflow with automatic cost tracking and profit calculations.**