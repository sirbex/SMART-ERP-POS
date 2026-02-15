# Sales Reports API Documentation

## Overview

The Sales Reports API provides comprehensive analytics and insights into product sales performance, helping businesses make data-driven decisions.

## Authentication

All endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Product Sales Summary

Get aggregated sales data per product with revenue, cost, profit, and margin analysis.

**Endpoint:** `GET /api/sales/reports/product-summary`

**Query Parameters:**
- `startDate` (optional): Filter sales from this date (ISO 8601 format: `YYYY-MM-DD`)
- `endDate` (optional): Filter sales until this date (ISO 8601 format: `YYYY-MM-DD`)
- `productId` (optional): Filter by specific product UUID
- `customerId` (optional): Filter by specific customer UUID

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "product_id": "uuid",
      "product_name": "Product Name",
      "transaction_count": 15,
      "total_quantity_sold": 45,
      "total_revenue": 50000,
      "total_cost": 30000,
      "total_profit": 20000,
      "profit_margin_pct": "40.00",
      "avg_selling_price": 1111.11,
      "avg_cost_price": 666.67,
      "first_sale_date": "2025-10-01T10:00:00.000Z",
      "last_sale_date": "2025-11-09T15:30:00.000Z"
    }
  ],
  "message": "Retrieved sales summary for 10 product(s)"
}
```

**Use Cases:**
- Identify most profitable products
- Analyze product performance over time
- Compare sales across different periods
- Calculate inventory turnover rates

**Example:**
```bash
# All products, all time
GET /api/sales/reports/product-summary

# Last 30 days
GET /api/sales/reports/product-summary?startDate=2025-10-10&endDate=2025-11-09

# Specific product
GET /api/sales/reports/product-summary?productId=abc-123-def

# Customer purchase history
GET /api/sales/reports/product-summary?customerId=xyz-789-uvw
```

---

### 2. Top Selling Products

Get the top N products ranked by quantity sold.

**Endpoint:** `GET /api/sales/reports/top-selling`

**Query Parameters:**
- `limit` (optional): Number of products to return (default: 10)
- `startDate` (optional): Filter sales from this date
- `endDate` (optional): Filter sales until this date

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "product_id": "uuid",
      "product_name": "Product Name",
      "total_quantity": 120,
      "total_revenue": 150000,
      "sale_count": 35
    }
  ]
}
```

**Use Cases:**
- Stock planning and reordering
- Marketing campaign focus
- Shelf space allocation
- Bundle product recommendations

**Example:**
```bash
# Top 10 products, all time
GET /api/sales/reports/top-selling

# Top 20 products, last 7 days
GET /api/sales/reports/top-selling?limit=20&startDate=2025-11-02&endDate=2025-11-09

# Top 5 products this month
GET /api/sales/reports/top-selling?limit=5&startDate=2025-11-01
```

---

### 3. Sales Summary by Date

Get sales aggregated by day, week, or month with transaction counts, revenue, cost, and profit.

**Endpoint:** `GET /api/sales/reports/summary-by-date`

**Query Parameters:**
- `groupBy` (optional): Aggregation period - `day`, `week`, or `month` (default: `day`)
- `startDate` (optional): Filter sales from this date
- `endDate` (optional): Filter sales until this date

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "period": "2025-11-09T00:00:00.000Z",
      "transaction_count": 25,
      "total_revenue": 125000,
      "total_cost": 75000,
      "total_profit": 50000,
      "avg_transaction_value": 5000
    }
  ]
}
```

**Use Cases:**
- Daily sales tracking
- Weekly performance comparison
- Monthly revenue forecasting
- Seasonal trend analysis
- Staff performance by shift/day

**Example:**
```bash
# Daily sales, last 7 days
GET /api/sales/reports/summary-by-date?groupBy=day&startDate=2025-11-02

# Weekly sales, last 4 weeks
GET /api/sales/reports/summary-by-date?groupBy=week&startDate=2025-10-12

# Monthly sales, last 6 months
GET /api/sales/reports/summary-by-date?groupBy=month&startDate=2025-05-01
```

---

## Data Fields Explained

### Product Sales Summary Fields

| Field | Type | Description |
|-------|------|-------------|
| `product_id` | UUID | Unique product identifier |
| `product_name` | String | Product name |
| `transaction_count` | Integer | Number of sales transactions containing this product |
| `total_quantity_sold` | Number | Total units sold |
| `total_revenue` | Number | Total selling price × quantity |
| `total_cost` | Number | Total cost price × quantity |
| `total_profit` | Number | Revenue - Cost |
| `profit_margin_pct` | String | (Profit / Revenue) × 100, formatted to 2 decimals |
| `avg_selling_price` | Number | Average selling price per unit |
| `avg_cost_price` | Number | Average cost price per unit |
| `first_sale_date` | DateTime | Date of first sale |
| `last_sale_date` | DateTime | Date of most recent sale |

### Top Selling Products Fields

| Field | Type | Description |
|-------|------|-------------|
| `product_id` | UUID | Unique product identifier |
| `product_name` | String | Product name |
| `total_quantity` | Number | Total units sold |
| `total_revenue` | Number | Total revenue generated |
| `sale_count` | Integer | Number of transactions |

### Sales Summary by Date Fields

| Field | Type | Description |
|-------|------|-------------|
| `period` | DateTime | Start of the period (day/week/month) |
| `transaction_count` | Integer | Number of sales in period |
| `total_revenue` | Number | Total revenue in period |
| `total_cost` | Number | Total cost in period |
| `total_profit` | Number | Total profit in period |
| `avg_transaction_value` | Number | Average sale amount |

---

## Common Query Patterns

### Last 7 Days Performance
```bash
GET /api/sales/reports/product-summary?startDate=2025-11-02&endDate=2025-11-09
```

### Current Month Top Sellers
```bash
GET /api/sales/reports/top-selling?startDate=2025-11-01&limit=10
```

### Quarterly Sales Trend
```bash
GET /api/sales/reports/summary-by-date?groupBy=month&startDate=2025-08-01&endDate=2025-10-31
```

### Customer Purchase Analysis
```bash
GET /api/sales/reports/product-summary?customerId=customer-uuid
```

### Single Product Performance
```bash
GET /api/sales/reports/product-summary?productId=product-uuid
```

---

## Business Intelligence Use Cases

### 1. Inventory Management
- **Question:** "Which products need reordering?"
- **Solution:** Use Product Sales Summary to identify fast-moving items with high `total_quantity_sold` and recent `last_sale_date`

### 2. Pricing Strategy
- **Question:** "Are we pricing products correctly?"
- **Solution:** Compare `avg_selling_price` vs `avg_cost_price` and review `profit_margin_pct` across products

### 3. Customer Insights
- **Question:** "What does customer X usually buy?"
- **Solution:** Filter Product Sales Summary by `customerId` to see purchase patterns

### 4. Seasonal Trends
- **Question:** "How do sales vary by season?"
- **Solution:** Use Sales Summary by Date with `groupBy=month` over 12+ months

### 5. Sales Performance
- **Question:** "Are we meeting weekly targets?"
- **Solution:** Use Sales Summary by Date with `groupBy=week` and compare `total_revenue` to targets

### 6. Product Profitability
- **Question:** "Which products generate the most profit?"
- **Solution:** Sort Product Sales Summary by `total_profit` or `profit_margin_pct`

---

## Error Responses

### 400 Bad Request
Invalid query parameters (e.g., invalid date format)

```json
{
  "success": false,
  "error": "Invalid query parameters",
  "details": []
}
```

### 401 Unauthorized
Missing or invalid authentication token

```json
{
  "success": false,
  "error": "Unauthorized"
}
```

### 500 Internal Server Error
Server-side error

```json
{
  "success": false,
  "error": "Failed to get product sales summary"
}
```

---

## Testing

Run the test script to validate all endpoints:

```powershell
.\test-sales-reports.ps1
```

---

## Notes

- All monetary values are stored without decimal formatting (e.g., 50000 = UGX 50,000)
- Dates are returned in ISO 8601 format with UTC timezone
- All reports only include completed sales (`status = 'COMPLETED'`)
- Reports are read-only - no data modification
- Large date ranges may take longer to process
- Consider adding pagination for reports returning many products

---

## Integration Examples

### React/TypeScript Frontend

```typescript
import { api } from './api';

// Get product sales summary
const getProductSummary = async (startDate?: string, endDate?: string) => {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  
  const response = await api.get(`/sales/reports/product-summary?${params}`);
  return response.data.data;
};

// Get top selling products
const getTopSellers = async (limit: number = 10) => {
  const response = await api.get(`/sales/reports/top-selling?limit=${limit}`);
  return response.data.data;
};

// Get daily sales
const getDailySales = async (days: number = 7) => {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  
  const response = await api.get(
    `/sales/reports/summary-by-date?groupBy=day&startDate=${startDate}&endDate=${endDate}`
  );
  return response.data.data;
};
```

### Excel/Power BI Integration

Use Power Query to fetch data:

```m
let
    Source = Json.Document(
        Web.Contents(
            "http://localhost:3001/api/sales/reports/product-summary",
            [
                Headers=[
                    Authorization="Bearer YOUR_TOKEN_HERE"
                ]
            ]
        )
    ),
    data = Source[data],
    #"Converted to Table" = Table.FromList(data, Splitter.SplitByNothing())
in
    #"Converted to Table"
```

---

## Version History

- **v1.0** (2025-11-09): Initial release with three report endpoints
  - Product Sales Summary
  - Top Selling Products
  - Sales Summary by Date
