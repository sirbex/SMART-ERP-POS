# 🎨 Responsive Layout & Form Design System

## 📋 Overview

This document describes the unified responsive layout and form design system for the SamplePOS application using ShadCN UI and Tailwind CSS.

## 🏗️ Architecture

### Core Components

#### 1. **MainLayout** (`components/layout/MainLayout.tsx`)

The primary layout wrapper that all pages should use.

**Features:**
- ✅ Responsive header with mobile/desktop views
- ✅ Collapsible sidebar (desktop) / Sheet menu (mobile)
- ✅ Floating mobile menu button
- ✅ Page title and subtitle support
- ✅ Action buttons area
- ✅ Responsive max-width containers
- ✅ Optional footer
- ✅ Smooth transitions and animations

**Props:**
```typescript
interface MainLayoutProps {
  children: React.ReactNode;
  selected: string;              // Current navigation item
  onNavigate: (screen: string) => void;
  title?: string;                // Page title
  subtitle?: string;             // Page subtitle
  actions?: React.ReactNode;     // Action buttons (top-right)
  maxWidth?: 'full' | '7xl' | '6xl' | '5xl' | '4xl';
  noPadding?: boolean;           // Remove default padding
}
```

**Usage:**
```tsx
<MainLayout
  selected="dashboard"
  onNavigate={setScreen}
  title="Dashboard"
  subtitle="Overview of your business"
  actions={
    <>
      <Button size="sm">Export</Button>
      <Button size="sm">Add New</Button>
    </>
  }
  maxWidth="7xl"
>
  {/* Your page content */}
</MainLayout>
```

**Responsive Behavior:**
- **Mobile (<1024px):** Sidebar hidden, floating menu button appears
- **Desktop (≥1024px):** Sidebar visible, can be collapsed to icon-only view
- **Tablet (768px-1024px):** Optimized spacing and grid layouts
- **Widescreen (≥1536px):** Max-width containers prevent excessive stretching

---

#### 2. **FormField** (`components/Form/FormField.tsx`)

Unified form input component with consistent styling and validation.

**Supported Types:**
- `text`, `number`, `email`, `password`, `tel`, `url`, `date`, `time`, `datetime-local`
- `textarea` - Multi-line text input
- `select` - Dropdown selection
- `checkbox` - Boolean checkbox
- `switch` - Toggle switch

**Props:**
```typescript
interface FormFieldProps {
  label: string;                 // Field label
  name: string;                  // Field name
  type?: string;                 // Input type
  value?: string | number | boolean;
  onChange?: (value: any) => void;
  placeholder?: string;
  error?: string;                // Validation error message
  required?: boolean;
  disabled?: boolean;
  className?: string;
  options?: Array<{ value: string; label: string }>; // For select
  rows?: number;                 // For textarea
  min?: number;                  // For number
  max?: number;
  step?: number;
  helpText?: string;             // Helper text below input
  fullWidth?: boolean;           // Span full container width
}
```

**Usage Examples:**

```tsx
// Text Input
<FormField
  label="Product Name"
  name="productName"
  type="text"
  value={formData.productName}
  onChange={(value) => setFormData({...formData, productName: value})}
  placeholder="Enter product name"
  required
  fullWidth
/>

// Number Input
<FormField
  label="Price"
  name="price"
  type="number"
  value={formData.price}
  onChange={(value) => setFormData({...formData, price: value})}
  min={0}
  step={0.01}
  required
/>

// Select Dropdown
<FormField
  label="Category"
  name="category"
  type="select"
  value={formData.category}
  onChange={(value) => setFormData({...formData, category: value})}
  options={[
    { value: 'electronics', label: 'Electronics' },
    { value: 'clothing', label: 'Clothing' },
    { value: 'food', label: 'Food & Beverage' },
  ]}
  required
/>

// Textarea
<FormField
  label="Description"
  name="description"
  type="textarea"
  value={formData.description}
  onChange={(value) => setFormData({...formData, description: value})}
  rows={4}
  placeholder="Enter product description..."
/>

// Switch
<FormField
  label="Active Status"
  name="isActive"
  type="switch"
  value={formData.isActive}
  onChange={(value) => setFormData({...formData, isActive: value})}
  helpText="Enable to make this product visible"
/>
```

---

#### 3. **FormCard** (`components/Form/FormCard.tsx`)

Card wrapper for forms with built-in submit/cancel buttons and loading states.

**Props:**
```typescript
interface FormCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;      // Custom footer content
  onSubmit?: (e: React.FormEvent) => void;
  submitLabel?: string;          // Default: "Submit"
  cancelLabel?: string;          // Default: "Cancel"
  onCancel?: () => void;
  isLoading?: boolean;           // Show loading spinner
  disabled?: boolean;
  className?: string;
}
```

**Usage:**
```tsx
<FormCard
  title="Add New Product"
  description="Enter the product details below"
  onSubmit={handleSubmit}
  submitLabel="Save Product"
  onCancel={() => setShowForm(false)}
  isLoading={isSaving}
>
  <FormGrid columns={2}>
    <FormField label="Name" name="name" {...} />
    <FormField label="SKU" name="sku" {...} />
  </FormGrid>
</FormCard>
```

---

#### 4. **FormGrid** (`components/Form/FormGrid.tsx`)

Responsive grid layout for form fields that automatically adjusts to screen size.

**Props:**
```typescript
interface FormGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;       // Number of columns (desktop)
  gap?: 'sm' | 'md' | 'lg';      // Spacing between fields
  className?: string;
}
```

**Responsive Behavior:**
- **Mobile:** Always 1 column
- **Tablet (md):** 1-2 columns depending on `columns` prop
- **Desktop (lg):** 2-4 columns depending on `columns` prop

**Usage:**
```tsx
<FormGrid columns={3} gap="md">
  <FormField label="First Name" {...} />
  <FormField label="Last Name" {...} />
  <FormField label="Email" {...} />
  <FormField label="Phone" {...} />
  <FormField label="Address" {...} />
  <FormField label="City" {...} />
</FormGrid>
```

---

## 📱 Responsive Breakpoints

Following Tailwind CSS defaults:

| Breakpoint | Min Width | Description | Usage |
|------------|-----------|-------------|-------|
| `sm` | 640px | Small tablets | `sm:grid-cols-2` |
| `md` | 768px | Tablets | `md:grid-cols-3` |
| `lg` | 1024px | Desktop | `lg:grid-cols-4` |
| `xl` | 1280px | Large desktop | `xl:max-w-7xl` |
| `2xl` | 1536px | Widescreen | `2xl:max-w-screen-2xl` |

---

## 🎨 Design Patterns

### Pattern 1: Dashboard/Overview Page

```tsx
<MainLayout
  selected="dashboard"
  onNavigate={setScreen}
  title="Dashboard"
  subtitle="Welcome back! Here's your overview"
  maxWidth="7xl"
>
  {/* Stats Grid - 1 column mobile, 2 on tablet, 4 on desktop */}
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <StatCard title="Total Sales" value="$45,231" />
    <StatCard title="Orders" value="2,350" />
    <StatCard title="Customers" value="12,234" />
    <StatCard title="Active Now" value="573" />
  </div>

  {/* Charts and tables */}
  <Card>
    <CardHeader>
      <CardTitle>Sales Chart</CardTitle>
    </CardHeader>
    <CardContent>
      {/* Chart component */}
    </CardContent>
  </Card>
</MainLayout>
```

### Pattern 2: Form Page (Create/Edit)

```tsx
<MainLayout
  selected="inventory"
  onNavigate={setScreen}
  title="Add Product"
  subtitle="Create a new product in your inventory"
  maxWidth="4xl"
>
  <FormCard
    onSubmit={handleSubmit}
    submitLabel="Save Product"
    onCancel={() => navigate('inventory')}
    isLoading={isSaving}
  >
    {/* Basic Info */}
    <FormGrid columns={2}>
      <FormField label="Product Name" name="name" required fullWidth />
      <FormField label="SKU" name="sku" required fullWidth />
      <FormField label="Category" name="category" type="select" options={categories} fullWidth />
      <FormField label="Price" name="price" type="number" min={0} step={0.01} required fullWidth />
    </FormGrid>

    {/* Description */}
    <FormField label="Description" name="description" type="textarea" rows={4} fullWidth />

    {/* Stock Info */}
    <FormGrid columns={3}>
      <FormField label="Quantity" name="quantity" type="number" min={0} fullWidth />
      <FormField label="Min Stock" name="minStock" type="number" min={0} fullWidth />
      <FormField label="Max Stock" name="maxStock" type="number" min={0} fullWidth />
    </FormGrid>

    {/* Toggles */}
    <FormField label="Active" name="isActive" type="switch" helpText="Enable to list product" />
  </FormCard>
</MainLayout>
```

### Pattern 3: List Page with Table

```tsx
<MainLayout
  selected="customers"
  onNavigate={setScreen}
  title="Customers"
  subtitle="Manage your customer database"
  actions={
    <>
      <Button variant="outline" size="sm"><Filter />Filter</Button>
      <Button variant="outline" size="sm"><Download />Export</Button>
      <Button size="sm"><Plus />Add Customer</Button>
    </>
  }
  maxWidth="7xl"
>
  <Card>
    <CardHeader>
      <CardTitle>Customer List</CardTitle>
      <CardDescription>All registered customers</CardDescription>
    </CardHeader>
    <CardContent>
      {/* Responsive table - horizontal scroll on mobile */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2 hidden sm:table-cell">Email</th>
              <th className="text-left p-2 hidden md:table-cell">Phone</th>
              <th className="text-left p-2 hidden lg:table-cell">Total Orders</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Table rows */}
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>
</MainLayout>
```

### Pattern 4: Tabbed Page

```tsx
<MainLayout selected="settings" onNavigate={setScreen} title="Settings">
  <Tabs defaultValue="general">
    <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
      <TabsTrigger value="general">General</TabsTrigger>
      <TabsTrigger value="security">Security</TabsTrigger>
      <TabsTrigger value="notifications">Notifications</TabsTrigger>
    </TabsList>

    <TabsContent value="general">
      <FormCard title="General Settings" onSubmit={handleSave}>
        <FormGrid columns={2}>
          {/* Settings fields */}
        </FormGrid>
      </FormCard>
    </TabsContent>

    {/* Other tabs */}
  </Tabs>
</MainLayout>
```

---

## 🎯 Best Practices

### 1. **Always Use MainLayout**
Every page should be wrapped in `MainLayout` for consistency:
```tsx
// ✅ Good
<MainLayout selected="pos" onNavigate={setScreen}>
  <YourContent />
</MainLayout>

// ❌ Bad
<div className="custom-layout">
  <YourContent />
</div>
```

### 2. **Use FormCard for All Forms**
```tsx
// ✅ Good
<FormCard title="Edit Product" onSubmit={handleSubmit}>
  <FormGrid columns={2}>
    <FormField label="Name" {...} />
  </FormGrid>
</FormCard>

// ❌ Bad
<form onSubmit={handleSubmit}>
  <div>
    <label>Name</label>
    <input type="text" {...} />
  </div>
</form>
```

### 3. **Use FormGrid for Multi-Column Layouts**
```tsx
// ✅ Good - Auto-responsive
<FormGrid columns={2}>
  <FormField label="First Name" {...} />
  <FormField label="Last Name" {...} />
</FormGrid>

// ❌ Bad - Manual grid classes
<div className="grid grid-cols-2 gap-4">
  <FormField label="First Name" {...} />
  <FormField label="Last Name" {...} />
</div>
```

### 4. **Hide Non-Essential Columns on Mobile**
```tsx
<table>
  <thead>
    <tr>
      <th>Name</th> {/* Always visible */}
      <th className="hidden sm:table-cell">Email</th>
      <th className="hidden md:table-cell">Phone</th>
      <th className="hidden lg:table-cell">Address</th>
    </tr>
  </thead>
</table>
```

### 5. **Stack Buttons Vertically on Mobile**
```tsx
<div className="flex flex-col sm:flex-row gap-2">
  <Button className="w-full sm:w-auto">Save</Button>
  <Button className="w-full sm:w-auto" variant="outline">Cancel</Button>
</div>
```

### 6. **Use Responsive Text Sizes**
```tsx
<h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">
  Dashboard
</h1>
<p className="text-sm sm:text-base text-muted-foreground">
  Welcome back!
</p>
```

### 7. **Responsive Spacing**
```tsx
<div className="p-4 sm:p-6 lg:p-8">
  <div className="space-y-4 sm:space-y-6 lg:space-y-8">
    {/* Content with increasing spacing on larger screens */}
  </div>
</div>
```

---

## 📊 Component Matrix

| Component | Mobile | Tablet | Desktop | Purpose |
|-----------|--------|--------|---------|---------|
| MainLayout | Sheet menu | Sheet/Sidebar | Sidebar | Page wrapper |
| FormCard | Full width | Constrained | Constrained | Form container |
| FormGrid (2 cols) | 1 column | 2 columns | 2 columns | Form fields |
| FormGrid (3 cols) | 1 column | 2 columns | 3 columns | Form fields |
| FormGrid (4 cols) | 1 column | 2 columns | 4 columns | Form fields |
| Stat Cards | 1 column | 2 columns | 4 columns | Dashboard stats |
| Data Tables | Horizontal scroll | Full width | Full width | List views |

---

## 🔄 Migration Guide

### Step 1: Wrap Page in MainLayout

**Before:**
```tsx
function MyPage() {
  return (
    <div className="container">
      <h1>My Page</h1>
      <div>{content}</div>
    </div>
  );
}
```

**After:**
```tsx
function MyPage({ onNavigate }: { onNavigate: (screen: string) => void }) {
  return (
    <MainLayout
      selected="mypage"
      onNavigate={onNavigate}
      title="My Page"
      maxWidth="7xl"
    >
      {content}
    </MainLayout>
  );
}
```

### Step 2: Replace Forms with FormCard

**Before:**
```tsx
<form onSubmit={handleSubmit}>
  <div>
    <label>Name</label>
    <input type="text" value={name} onChange={e => setName(e.target.value)} />
  </div>
  <button type="submit">Save</button>
  <button type="button" onClick={onCancel}>Cancel</button>
</form>
```

**After:**
```tsx
<FormCard
  title="Edit Item"
  onSubmit={handleSubmit}
  submitLabel="Save"
  onCancel={onCancel}
>
  <FormField
    label="Name"
    name="name"
    value={name}
    onChange={setName}
    fullWidth
  />
</FormCard>
```

### Step 3: Use FormGrid for Multi-Column Forms

**Before:**
```tsx
<div className="grid grid-cols-2 gap-4">
  <div>
    <label>First Name</label>
    <input {...} />
  </div>
  <div>
    <label>Last Name</label>
    <input {...} />
  </div>
</div>
```

**After:**
```tsx
<FormGrid columns={2}>
  <FormField label="First Name" name="firstName" {...} fullWidth />
  <FormField label="Last Name" name="lastName" {...} fullWidth />
</FormGrid>
```

---

## ✅ Testing Checklist

When implementing responsive layouts, test:

- [ ] Mobile (320px, 375px, 414px)
- [ ] Tablet (768px, 1024px)
- [ ] Desktop (1280px, 1440px)
- [ ] Widescreen (1920px, 2560px)
- [ ] No horizontal scroll at any breakpoint
- [ ] All buttons accessible on mobile
- [ ] Forms work with touch input
- [ ] Tables remain readable (or scroll) on mobile
- [ ] Modals fit on screen
- [ ] Navigation works on all devices

---

## 📚 Reference

- **Tailwind CSS Docs:** https://tailwindcss.com/docs
- **ShadCN UI Components:** https://ui.shadcn.com/docs/components
- **Responsive Design:** https://tailwindcss.com/docs/responsive-design
- **Grid System:** https://tailwindcss.com/docs/grid-template-columns

---

**Status:** ✅ Layout system fully implemented and documented
**Version:** 1.0.0
**Last Updated:** October 2025
