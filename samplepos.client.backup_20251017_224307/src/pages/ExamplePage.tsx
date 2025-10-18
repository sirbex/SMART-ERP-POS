/**
 * Example Responsive Page Template
 * Use this as a reference for creating new pages with consistent layout
 */

import React, { useState } from 'react';
import MainLayout from '../components/layout/MainLayout';
import { FormField, FormCard, FormGrid } from '../components/Form';
import { Button } from '../components/ui/button';
import { Plus, Download, Filter } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

interface ExamplePageProps {
  onNavigate: (screen: string) => void;
}

const ExamplePage: React.FC<ExamplePageProps> = ({ onNavigate }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    category: '',
    description: '',
    isActive: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
  };

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <MainLayout
      selected="example"
      onNavigate={onNavigate}
      title="Example Page"
      subtitle="This is a template showing responsive layout patterns"
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Filter</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add New</span>
          </Button>
        </>
      }
      maxWidth="7xl"
    >
      {/* Tabs for different sections */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Stats Grid - Responsive columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Sales</CardDescription>
                <CardTitle className="text-3xl">$45,231</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">+20.1% from last month</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Orders</CardDescription>
                <CardTitle className="text-3xl">+2,350</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">+180.1% from last month</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Customers</CardDescription>
                <CardTitle className="text-3xl">+12,234</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">+19% from last month</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Now</CardDescription>
                <CardTitle className="text-3xl">+573</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">+201 since last hour</p>
              </CardContent>
            </Card>
          </div>

          {/* Table Card - Full width on mobile, contained on desktop */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>You have 265 transactions this month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">ID</th>
                      <th className="text-left py-3 px-4 hidden sm:table-cell">Customer</th>
                      <th className="text-left py-3 px-4">Amount</th>
                      <th className="text-left py-3 px-4 hidden md:table-cell">Status</th>
                      <th className="text-left py-3 px-4 hidden lg:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">#00{i}</td>
                        <td className="py-3 px-4 hidden sm:table-cell">Customer {i}</td>
                        <td className="py-3 px-4">${(Math.random() * 1000).toFixed(2)}</td>
                        <td className="py-3 px-4 hidden md:table-cell">
                          <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">
                            Paid
                          </span>
                        </td>
                        <td className="py-3 px-4 hidden lg:table-cell">
                          {new Date().toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="space-y-6">
          {/* Form Example - Using FormCard and FormGrid */}
          <FormCard
            title="Edit Details"
            description="Update the information below"
            onSubmit={handleSubmit}
            submitLabel="Save Changes"
            onCancel={() => console.log('Cancelled')}
          >
            <FormGrid columns={2} gap="md">
              <FormField
                label="Full Name"
                name="name"
                type="text"
                value={formData.name}
                onChange={(value) => updateField('name', value)}
                placeholder="Enter full name"
                required
                fullWidth
              />
              
              <FormField
                label="Email Address"
                name="email"
                type="email"
                value={formData.email}
                onChange={(value) => updateField('email', value)}
                placeholder="email@example.com"
                required
                fullWidth
              />
              
              <FormField
                label="Phone Number"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={(value) => updateField('phone', value)}
                placeholder="(123) 456-7890"
                fullWidth
              />
              
              <FormField
                label="Category"
                name="category"
                type="select"
                value={formData.category}
                onChange={(value) => updateField('category', value)}
                options={[
                  { value: 'retail', label: 'Retail' },
                  { value: 'wholesale', label: 'Wholesale' },
                  { value: 'online', label: 'Online' },
                ]}
                fullWidth
              />
            </FormGrid>

            <FormField
              label="Description"
              name="description"
              type="textarea"
              value={formData.description}
              onChange={(value) => updateField('description', value)}
              placeholder="Enter a detailed description..."
              rows={4}
              fullWidth
            />

            <FormField
              label="Active Status"
              name="isActive"
              type="switch"
              value={formData.isActive}
              onChange={(value) => updateField('isActive', value)}
              helpText="Enable to make this item active"
            />
          </FormCard>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
              <CardDescription>Configure your preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Settings content goes here...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
};

export default ExamplePage;
