/**
 * Admin Settings Page
 * Comprehensive settings management for currency, business, system, and admin configurations
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import { Separator } from './ui/separator';
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, CreditCard, Download, Globe, RefreshCw, Settings2, Shield, Trash2, Upload, User, Users } from 'lucide-react';
import SettingsService, { type AdminSettings, type CurrencySettings, type UserSettings, COMMON_CURRENCIES } from '../services/SettingsService';

interface SettingsProps {
  onBack: () => void;
}

const AdminSettingsPage: React.FC<SettingsProps> = ({ onBack }) => {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('currency');
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserSettings | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const settingsService = SettingsService.getInstance();

  // Load settings on component mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    setLoading(true);
    try {
      const loadedSettings = settingsService.loadSettings();
      setSettings(loadedSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
    setLoading(false);
  };

  const saveSettings = async (updatedSettings: AdminSettings) => {
    setSaveStatus('saving');
    try {
      const success = settingsService.saveSettings(updatedSettings);
      if (success) {
        setSettings(updatedSettings);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleCurrencyChange = (field: keyof CurrencySettings, value: any) => {
    if (!settings) return;
    const updatedSettings = {
      ...settings,
      currency: {
        ...settings.currency,
        [field]: value
      }
    };
    saveSettings(updatedSettings);
  };

  const selectCommonCurrency = (currency: CurrencySettings) => {
    if (!settings) return;
    const updatedSettings = {
      ...settings,
      currency: currency
    };
    saveSettings(updatedSettings);
  };

  const handleBusinessChange = (field: string, value: string) => {
    if (!settings) return;
    const updatedSettings = {
      ...settings,
      business: {
        ...settings.business,
        [field]: value
      }
    };
    saveSettings(updatedSettings);
  };

  const handleSystemChange = (field: string, value: any) => {
    if (!settings) return;
    const updatedSettings = {
      ...settings,
      system: {
        ...settings.system,
        [field]: value
      }
    };
    saveSettings(updatedSettings);
  };

  const handleTaxChange = (field: string, value: any) => {
    if (!settings) return;
    const updatedSettings = {
      ...settings,
      tax: {
        ...settings.tax,
        [field]: value
      }
    };
    saveSettings(updatedSettings);
  };

  const handleSecurityChange = (field: string, value: any) => {
    if (!settings) return;
    const updatedSettings = {
      ...settings,
      security: {
        ...settings.security,
        [field]: value
      }
    };
    saveSettings(updatedSettings);
  };

  const exportSettings = () => {
    const exportData = settingsService.exportSettings();
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pos-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const success = settingsService.importSettings(content);
        if (success) {
          loadSettings();
          alert('Settings imported successfully!');
        } else {
          alert('Failed to import settings. Please check the file format.');
        }
      } catch (error) {
        alert('Error importing settings: ' + error);
      }
    };
    reader.readAsText(file);
  };

  const resetToDefaults = () => {
    const success = settingsService.resetToDefaults();
    if (success) {
      loadSettings();
      setShowResetDialog(false);
      alert('Settings reset to defaults successfully!');
    }
  };

  const addUser = (userData: Omit<UserSettings, 'id' | 'createdAt'>) => {
    const success = settingsService.addUser(userData);
    if (success) {
      loadSettings();
      setShowUserDialog(false);
      setEditingUser(null);
    }
  };

  const updateUser = (userId: string, updates: Partial<UserSettings>) => {
    const success = settingsService.updateUser(userId, updates);
    if (success) {
      loadSettings();
      setShowUserDialog(false);
      setEditingUser(null);
    }
  };

  const deleteUser = (userId: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      const success = settingsService.deleteUser(userId);
      if (success) {
        loadSettings();
      }
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to POS
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Settings2 className="h-8 w-8" />
              Admin Settings
            </h1>
            <p className="text-gray-600">Manage your POS system configuration</p>
          </div>
          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && (
              <Badge variant="outline" className="bg-blue-50">
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Saving...
              </Badge>
            )}
            {saveStatus === 'saved' && (
              <Badge variant="outline" className="bg-green-50 text-green-700">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Saved
              </Badge>
            )}
            {saveStatus === 'error' && (
              <Badge variant="outline" className="bg-red-50 text-red-700">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Error
              </Badge>
            )}
          </div>
        </div>

        {/* Settings Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 lg:grid-cols-6">
            <TabsTrigger value="currency" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Currency</span>
            </TabsTrigger>
            <TabsTrigger value="business" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Business</span>
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">System</span>
            </TabsTrigger>
            <TabsTrigger value="tax" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">Tax</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Users</span>
            </TabsTrigger>
          </TabsList>

          {/* Currency Settings */}
          <TabsContent value="currency" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Currency Configuration
                </CardTitle>
                <CardDescription>
                  Set your business currency and formatting preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Quick Currency Selection */}
                <div>
                  <Label className="text-sm font-medium mb-3 block">Quick Currency Selection</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {COMMON_CURRENCIES.map((currency) => (
                      <Button
                        key={currency.code}
                        variant={settings.currency.code === currency.code ? "default" : "outline"}
                        className="justify-start h-auto p-3"
                        onClick={() => selectCommonCurrency(currency)}
                      >
                        <div className="text-left">
                          <div className="font-medium">{currency.symbol} {currency.code}</div>
                          <div className="text-xs text-muted-foreground">{currency.name}</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Custom Currency Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="currency-code">Currency Code</Label>
                    <Input
                      id="currency-code"
                      value={settings.currency.code}
                      onChange={(e) => handleCurrencyChange('code', e.target.value.toUpperCase())}
                      placeholder="USD"
                      maxLength={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="currency-symbol">Currency Symbol</Label>
                    <Input
                      id="currency-symbol"
                      value={settings.currency.symbol}
                      onChange={(e) => handleCurrencyChange('symbol', e.target.value)}
                      placeholder="$"
                    />
                  </div>
                  <div>
                    <Label htmlFor="currency-name">Currency Name</Label>
                    <Input
                      id="currency-name"
                      value={settings.currency.name}
                      onChange={(e) => handleCurrencyChange('name', e.target.value)}
                      placeholder="US Dollar"
                    />
                  </div>
                  <div>
                    <Label htmlFor="decimal-places">Decimal Places</Label>
                    <Select 
                      value={settings.currency.decimalPlaces.toString()}
                      onValueChange={(value) => handleCurrencyChange('decimalPlaces', parseInt(value))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0 (No decimals)</SelectItem>
                        <SelectItem value="2">2 (Standard)</SelectItem>
                        <SelectItem value="3">3 (Precise)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="symbol-position">Symbol Position</Label>
                    <Select 
                      value={settings.currency.symbolPosition}
                      onValueChange={(value) => handleCurrencyChange('symbolPosition', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="before">Before ($100.00)</SelectItem>
                        <SelectItem value="after">After (100.00$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Preview */}
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Preview</h4>
                  <div className="space-y-1 text-sm">
                    <div>Small amount: {settingsService.formatCurrency(12.34, settings)}</div>
                    <div>Medium amount: {settingsService.formatCurrency(1234.56, settings)}</div>
                    <div>Large amount: {settingsService.formatCurrency(123456.78, settings)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Business Settings */}
          <TabsContent value="business" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Business Information
                </CardTitle>
                <CardDescription>
                  Configure your business details for receipts and reports
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="business-name">Business Name</Label>
                    <Input
                      id="business-name"
                      value={settings.business.businessName}
                      onChange={(e) => handleBusinessChange('businessName', e.target.value)}
                      placeholder="Your Business Name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="business-email">Email</Label>
                    <Input
                      id="business-email"
                      type="email"
                      value={settings.business.businessEmail}
                      onChange={(e) => handleBusinessChange('businessEmail', e.target.value)}
                      placeholder="contact@yourbusiness.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="business-phone">Phone</Label>
                    <Input
                      id="business-phone"
                      value={settings.business.businessPhone}
                      onChange={(e) => handleBusinessChange('businessPhone', e.target.value)}
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                  <div>
                    <Label htmlFor="business-website">Website</Label>
                    <Input
                      id="business-website"
                      value={settings.business.website}
                      onChange={(e) => handleBusinessChange('website', e.target.value)}
                      placeholder="https://yourbusiness.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="tax-id">Tax ID</Label>
                    <Input
                      id="tax-id"
                      value={settings.business.taxId}
                      onChange={(e) => handleBusinessChange('taxId', e.target.value)}
                      placeholder="123456789"
                    />
                  </div>
                  <div>
                    <Label htmlFor="timezone">Timezone</Label>
                    <Select 
                      value={settings.business.timezone}
                      onValueChange={(value) => handleBusinessChange('timezone', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UTC">UTC</SelectItem>
                        <SelectItem value="America/New_York">Eastern Time</SelectItem>
                        <SelectItem value="America/Chicago">Central Time</SelectItem>
                        <SelectItem value="America/Denver">Mountain Time</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                        <SelectItem value="Europe/London">London</SelectItem>
                        <SelectItem value="Africa/Kampala">East Africa Time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="business-address">Business Address</Label>
                  <Textarea
                    id="business-address"
                    value={settings.business.businessAddress}
                    onChange={(e) => handleBusinessChange('businessAddress', e.target.value)}
                    placeholder="123 Main Street, City, State, ZIP Code"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="receipt-footer">Receipt Footer</Label>
                  <Textarea
                    id="receipt-footer"
                    value={settings.business.receiptFooter}
                    onChange={(e) => handleBusinessChange('receiptFooter', e.target.value)}
                    placeholder="Thank you for your business!"
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Settings */}
          <TabsContent value="system" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Display & Interface</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="theme">Theme</Label>
                    <Select 
                      value={settings.system.theme}
                      onValueChange={(value) => handleSystemChange('theme', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="auto">Auto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="language">Language</Label>
                    <Select 
                      value={settings.system.language}
                      onValueChange={(value) => handleSystemChange('language', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="sw">Kiswahili</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="date-format">Date Format</Label>
                    <Select 
                      value={settings.system.dateFormat}
                      onValueChange={(value) => handleSystemChange('dateFormat', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="time-format">Time Format</Label>
                    <Select 
                      value={settings.system.timeFormat}
                      onValueChange={(value) => handleSystemChange('timeFormat', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12">12 Hour</SelectItem>
                        <SelectItem value="24">24 Hour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="enable-quick-amounts">Enable Quick Amounts</Label>
                      <p className="text-sm text-muted-foreground">Show preset amount chips in Payment dialog</p>
                    </div>
                    <Switch
                      id="enable-quick-amounts"
                      checked={settings.system.enableQuickAmounts}
                      onCheckedChange={(checked) => handleSystemChange('enableQuickAmounts', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="enable-quick-suggestions">Round-up Suggestions</Label>
                      <p className="text-sm text-muted-foreground">Show Exact / Next-10 / Next-50 / Next-100</p>
                    </div>
                    <Switch
                      id="enable-quick-suggestions"
                      checked={settings.system.enableQuickRoundingSuggestions}
                      onCheckedChange={(checked) => handleSystemChange('enableQuickRoundingSuggestions', checked)}
                      disabled={!settings.system.enableQuickAmounts}
                    />
                  </div>
                  <div>
                    <Label htmlFor="quick-amount-steps">Quick Amount Steps (comma-separated)</Label>
                    <Input
                      id="quick-amount-steps"
                      value={(settings.system.quickAmountSteps || []).join(',')}
                      onChange={(e) => {
                        const parts = e.target.value.split(',').map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n) && n >= 0);
                        handleSystemChange('quickAmountSteps', parts);
                      }}
                      disabled={!settings.system.enableQuickAmounts}
                      placeholder="50,100,200,500"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Inventory & Alerts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="low-stock-threshold">Low Stock Threshold</Label>
                    <Input
                      id="low-stock-threshold"
                      type="number"
                      value={settings.system.lowStockThreshold}
                      onChange={(e) => handleSystemChange('lowStockThreshold', parseInt(e.target.value) || 5)}
                      min="1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="expiry-alert-days">Expiry Alert Days</Label>
                    <Input
                      id="expiry-alert-days"
                      type="number"
                      value={settings.system.expiryAlertDays}
                      onChange={(e) => handleSystemChange('expiryAlertDays', parseInt(e.target.value) || 7)}
                      min="1"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="enable-notifications">Enable Notifications</Label>
                    <Switch
                      id="enable-notifications"
                      checked={settings.system.enableNotifications}
                      onCheckedChange={(checked) => handleSystemChange('enableNotifications', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="barcode-scanner">Barcode Scanner</Label>
                    <Switch
                      id="barcode-scanner"
                      checked={settings.system.enableBarcodeScanner}
                      onCheckedChange={(checked) => handleSystemChange('enableBarcodeScanner', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="print-receipts">Auto Print Receipts</Label>
                    <Switch
                      id="print-receipts"
                      checked={settings.system.printReceipts}
                      onCheckedChange={(checked) => handleSystemChange('printReceipts', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="cash-drawer">Cash Drawer</Label>
                    <Switch
                      id="cash-drawer"
                      checked={settings.system.cashDrawerEnabled}
                      onCheckedChange={(checked) => handleSystemChange('cashDrawerEnabled', checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Backup & Data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-backup">Auto Backup</Label>
                  <Switch
                    id="auto-backup"
                    checked={settings.system.autoBackup}
                    onCheckedChange={(checked) => handleSystemChange('autoBackup', checked)}
                  />
                </div>
                <div>
                  <Label htmlFor="backup-frequency">Backup Frequency</Label>
                  <Select 
                    value={settings.system.backupFrequency}
                    onValueChange={(value) => handleSystemChange('backupFrequency', value)}
                    disabled={!settings.system.autoBackup}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={exportSettings} className="flex-1">
                    <Download className="h-4 w-4 mr-2" />
                    Export Settings
                  </Button>
                  <div className="flex-1">
                    <Input
                      type="file"
                      accept=".json"
                      onChange={importSettings}
                      className="hidden"
                      id="import-settings"
                    />
                    <Label htmlFor="import-settings" className="cursor-pointer">
                      <Button variant="outline" className="w-full" asChild>
                        <span>
                          <Upload className="h-4 w-4 mr-2" />
                          Import Settings
                        </span>
                      </Button>
                    </Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tax Settings */}
          <TabsContent value="tax" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Tax Configuration
                </CardTitle>
                <CardDescription>
                  Configure tax rates and calculation settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="tax-name">Tax Name</Label>
                    <Input
                      id="tax-name"
                      value={settings.tax.taxName}
                      onChange={(e) => handleTaxChange('taxName', e.target.value)}
                      placeholder="VAT, GST, Sales Tax, etc."
                    />
                  </div>
                  <div>
                    <Label htmlFor="default-tax-rate">Default Tax Rate (%)</Label>
                    <Input
                      id="default-tax-rate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={(settings.tax.defaultTaxRate * 100).toFixed(2)}
                      onChange={(e) => handleTaxChange('defaultTaxRate', parseFloat(e.target.value) / 100 || 0)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="tax-included">Tax Included in Prices</Label>
                    <p className="text-sm text-muted-foreground">
                      Whether displayed prices include tax
                    </p>
                  </div>
                  <Switch
                    id="tax-included"
                    checked={settings.tax.taxIncluded}
                    onCheckedChange={(checked) => handleTaxChange('taxIncluded', checked)}
                  />
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Tax Calculation Preview</h4>
                  <div className="space-y-1 text-sm">
                    <div>Item Price: $100.00</div>
                    <div>
                      {settings.tax.taxIncluded 
                        ? `Tax (${(settings.tax.defaultTaxRate * 100).toFixed(1)}% included): $${(100 * settings.tax.defaultTaxRate / (1 + settings.tax.defaultTaxRate)).toFixed(2)}`
                        : `Tax (${(settings.tax.defaultTaxRate * 100).toFixed(1)}%): $${(100 * settings.tax.defaultTaxRate).toFixed(2)}`
                      }
                    </div>
                    <div className="font-medium">
                      Total: $
                      {settings.tax.taxIncluded 
                        ? "100.00"
                        : (100 * (1 + settings.tax.defaultTaxRate)).toFixed(2)
                      }
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Security & Access Control
                </CardTitle>
                <CardDescription>
                  Configure security settings and access controls
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="require-auth">Require Authentication</Label>
                    <p className="text-sm text-muted-foreground">
                      Require login to access the POS system
                    </p>
                  </div>
                  <Switch
                    id="require-auth"
                    checked={settings.security.requireAuth}
                    onCheckedChange={(checked) => handleSecurityChange('requireAuth', checked)}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
                    <Input
                      id="session-timeout"
                      type="number"
                      min="5"
                      max="1440"
                      value={settings.security.sessionTimeout}
                      onChange={(e) => handleSecurityChange('sessionTimeout', parseInt(e.target.value) || 480)}
                      disabled={!settings.security.requireAuth}
                    />
                  </div>
                  <div>
                    <Label htmlFor="max-login-attempts">Max Login Attempts</Label>
                    <Input
                      id="max-login-attempts"
                      type="number"
                      min="1"
                      max="10"
                      value={settings.security.maxLoginAttempts}
                      onChange={(e) => handleSecurityChange('maxLoginAttempts', parseInt(e.target.value) || 5)}
                      disabled={!settings.security.requireAuth}
                    />
                  </div>
                  <div>
                    <Label htmlFor="backup-retention">Backup Retention (days)</Label>
                    <Input
                      id="backup-retention"
                      type="number"
                      min="1"
                      max="365"
                      value={settings.security.backupRetentionDays}
                      onChange={(e) => handleSecurityChange('backupRetentionDays', parseInt(e.target.value) || 30)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="audit-log">Enable Audit Log</Label>
                  <Switch
                    id="audit-log"
                    checked={settings.security.enableAuditLog}
                    onCheckedChange={(checked) => handleSecurityChange('enableAuditLog', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="remote-access">Allow Remote Access</Label>
                  <Switch
                    id="remote-access"
                    checked={settings.security.allowRemoteAccess}
                    onCheckedChange={(checked) => handleSecurityChange('allowRemoteAccess', checked)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Management */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    User Management
                  </div>
                  <Button onClick={() => {
                    setEditingUser(null);
                    setShowUserDialog(true);
                  }}>
                    <User className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                </CardTitle>
                <CardDescription>
                  Manage user accounts and permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {settings.users.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{user.username}</h4>
                          <Badge variant={user.isActive ? "default" : "secondary"}>
                            {user.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Badge variant="outline">{user.role}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        {user.lastLogin && (
                          <p className="text-xs text-muted-foreground">
                            Last login: {new Date(user.lastLogin).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingUser(user);
                            setShowUserDialog(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteUser(user.id)}
                          disabled={settings.users.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Reset Settings */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible actions that will reset your configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="destructive" 
              onClick={() => setShowResetDialog(true)}
              className="mb-4"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset to Default Settings
            </Button>
            <p className="text-sm text-muted-foreground">
              This will reset all settings to their default values. This action cannot be undone.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Settings to Defaults?</DialogTitle>
            <DialogDescription>
              This will permanently reset all settings to their default values. 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={resetToDefaults}>
              Reset Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Edit User' : 'Add New User'}
            </DialogTitle>
            <DialogDescription>
              {editingUser ? 'Update user information and permissions' : 'Create a new user account'}
            </DialogDescription>
          </DialogHeader>
          <UserForm
            user={editingUser}
            onSubmit={editingUser ? 
              (updates) => updateUser(editingUser.id, updates) :
              (userData) => addUser(userData)
            }
            onCancel={() => {
              setShowUserDialog(false);
              setEditingUser(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

// User Form Component
const UserForm: React.FC<{
  user?: UserSettings | null;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}> = ({ user, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    role: user?.role || 'cashier',
    isActive: user?.isActive ?? true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="user-username">Username</Label>
        <Input
          id="user-username"
          value={formData.username}
          onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
          required
        />
      </div>
      <div>
        <Label htmlFor="user-email">Email</Label>
        <Input
          id="user-email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
          required
        />
      </div>
      <div>
        <Label htmlFor="user-role">Role</Label>
        <Select
          value={formData.role}
          onValueChange={(value) => setFormData(prev => ({ ...prev, role: value as any }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Administrator</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="cashier">Cashier</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="user-active">Active Account</Label>
        <Switch
          id="user-active"
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {user ? 'Update User' : 'Create User'}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default AdminSettingsPage;