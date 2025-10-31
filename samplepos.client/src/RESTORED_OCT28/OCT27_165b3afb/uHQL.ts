/**
 * Admin Settings Service
 * Manages all system configuration and administrative settings
 */

export interface CurrencySettings {
  code: string;
  symbol: string;
  name: string;
  decimalPlaces: number;
  symbolPosition: 'before' | 'after';
  thousandsSeparator: string;
  decimalSeparator: string;
}

export interface BusinessSettings {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessEmail: string;
  taxId: string;
  website: string;
  logoUrl?: string;
  receiptFooter: string;
  timezone: string;
}

export interface SystemSettings {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  dateFormat: string;
  timeFormat: '12' | '24';
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  lowStockThreshold: number;
  expiryAlertDays: number;
  enableNotifications: boolean;
  enableBarcodeScanner: boolean;
  printReceipts: boolean;
  cashDrawerEnabled: boolean;
  // Payments & UI helpers
  enableQuickAmounts: boolean; // Toggle quick amount chips in Payment dialog
  quickAmountSteps: number[]; // e.g., [50,100,200,500]
  enableQuickRoundingSuggestions: boolean; // Toggle Exact/Next-10/50/100 suggestions
}

export interface TaxSettings {
  defaultTaxRate: number;
  taxName: string;
  taxIncluded: boolean;
  multipleTaxRates: Array<{
    id: string;
    name: string;
    rate: number;
    isDefault: boolean;
  }>;
}

export interface SecuritySettings {
  requireAuth: boolean;
  sessionTimeout: number; // minutes
  maxLoginAttempts: number;
  enableAuditLog: boolean;
  backupRetentionDays: number;
  allowRemoteAccess: boolean;
}

export interface UserSettings {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'manager' | 'cashier';
  permissions: string[];
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface AdminSettings {
  currency: CurrencySettings;
  business: BusinessSettings;
  system: SystemSettings;
  tax: TaxSettings;
  security: SecuritySettings;
  users: UserSettings[];
  lastModified: string;
  version: string;
}

// Common currencies for quick selection
export const COMMON_CURRENCIES: CurrencySettings[] = [
  {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    decimalPlaces: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.'
  },
  {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    decimalPlaces: 2,
    symbolPosition: 'after',
    thousandsSeparator: ' ',
    decimalSeparator: ','
  },
  {
    code: 'GBP',
    symbol: '£',
    name: 'British Pound',
    decimalPlaces: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.'
  },
  {
    code: 'UGX',
    symbol: 'UGX',
    name: 'Ugandan Shilling',
    decimalPlaces: 0,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.'
  },
  {
    code: 'KES',
    symbol: 'KSh',
    name: 'Kenyan Shilling',
    decimalPlaces: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.'
  },
  {
    code: 'NGN',
    symbol: '₦',
    name: 'Nigerian Naira',
    decimalPlaces: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.'
  },
  {
    code: 'ZAR',
    symbol: 'R',
    name: 'South African Rand',
    decimalPlaces: 2,
    symbolPosition: 'before',
    thousandsSeparator: ' ',
    decimalSeparator: '.'
  }
];

class SettingsService {
  private static instance: SettingsService;
  private readonly SETTINGS_KEY = 'pos_admin_settings';

  static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  // Get default settings
  getDefaultSettings(): AdminSettings {
    return {
      currency: COMMON_CURRENCIES[0], // Default to USD
      business: {
        businessName: 'Sample POS Business',
        businessAddress: '123 Main Street, City, Country',
        businessPhone: '+1 (555) 123-4567',
        businessEmail: 'contact@samplebusiness.com',
        taxId: '',
        website: '',
        receiptFooter: 'Thank you for your business!',
        timezone: 'UTC'
      },
      system: {
        theme: 'light',
        language: 'en',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12',
        autoBackup: true,
        backupFrequency: 'daily',
        lowStockThreshold: 5,
        expiryAlertDays: 7,
        enableNotifications: true,
        enableBarcodeScanner: false,
        printReceipts: true,
        cashDrawerEnabled: false,
        enableQuickAmounts: true,
        quickAmountSteps: [50, 100, 200, 500],
        enableQuickRoundingSuggestions: true
      },
      tax: {
        defaultTaxRate: 0.18, // 18%
        taxName: 'VAT',
        taxIncluded: false,
        multipleTaxRates: [
          {
            id: 'vat-standard',
            name: 'Standard VAT',
            rate: 0.18,
            isDefault: true
          }
        ]
      },
      security: {
        requireAuth: false,
        sessionTimeout: 480, // 8 hours
        maxLoginAttempts: 5,
        enableAuditLog: true,
        backupRetentionDays: 30,
        allowRemoteAccess: true
      },
      users: [
        {
          id: 'admin-001',
          username: 'admin',
          email: 'admin@samplebusiness.com',
          role: 'admin',
          permissions: ['*'],
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ],
      lastModified: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  // Load settings from localStorage
  loadSettings(): AdminSettings {
    try {
      const stored = localStorage.getItem(this.SETTINGS_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        // Merge with defaults to ensure all properties exist
        return { ...this.getDefaultSettings(), ...settings };
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
    return this.getDefaultSettings();
  }

  // Save settings to localStorage
  saveSettings(settings: AdminSettings): boolean {
    try {
      settings.lastModified = new Date().toISOString();
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
      
      // Trigger settings change event
      window.dispatchEvent(new CustomEvent('settingsChanged', { detail: settings }));
      
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
  }

  // Update specific section of settings
  updateCurrency(currency: CurrencySettings): boolean {
    const settings = this.loadSettings();
    settings.currency = currency;
    return this.saveSettings(settings);
  }

  updateBusiness(business: BusinessSettings): boolean {
    const settings = this.loadSettings();
    settings.business = business;
    return this.saveSettings(settings);
  }

  updateSystem(system: SystemSettings): boolean {
    const settings = this.loadSettings();
    settings.system = system;
    return this.saveSettings(settings);
  }

  updateTax(tax: TaxSettings): boolean {
    const settings = this.loadSettings();
    settings.tax = tax;
    return this.saveSettings(settings);
  }

  updateSecurity(security: SecuritySettings): boolean {
    const settings = this.loadSettings();
    settings.security = security;
    return this.saveSettings(settings);
  }

  // User management
  addUser(user: Omit<UserSettings, 'id' | 'createdAt'>): boolean {
    const settings = this.loadSettings();
    const newUser: UserSettings = {
      ...user,
      id: `user-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    settings.users.push(newUser);
    return this.saveSettings(settings);
  }

  updateUser(userId: string, updates: Partial<UserSettings>): boolean {
    const settings = this.loadSettings();
    const userIndex = settings.users.findIndex(u => u.id === userId);
    if (userIndex >= 0) {
      settings.users[userIndex] = { ...settings.users[userIndex], ...updates };
      return this.saveSettings(settings);
    }
    return false;
  }

  deleteUser(userId: string): boolean {
    const settings = this.loadSettings();
    settings.users = settings.users.filter(u => u.id !== userId);
    return this.saveSettings(settings);
  }

  // Backup and restore
  exportSettings(): string {
    const settings = this.loadSettings();
    return JSON.stringify(settings, null, 2);
  }

  importSettings(settingsJson: string): boolean {
    try {
      const settings = JSON.parse(settingsJson);
      // Validate the structure (basic validation)
      if (settings.currency && settings.business && settings.system) {
        return this.saveSettings(settings);
      }
      return false;
    } catch (error) {
      console.error('Error importing settings:', error);
      return false;
    }
  }

  // Reset to defaults
  resetToDefaults(): boolean {
    return this.saveSettings(this.getDefaultSettings());
  }

  // Format currency according to settings
  formatCurrency(amount: number, settings?: AdminSettings): string {
    const currencySettings = settings?.currency || this.loadSettings().currency;
    
    const formattedNumber = amount.toLocaleString(undefined, {
      minimumFractionDigits: currencySettings.decimalPlaces,
      maximumFractionDigits: currencySettings.decimalPlaces,
      useGrouping: true
    });

    if (currencySettings.symbolPosition === 'before') {
      return `${currencySettings.symbol} ${formattedNumber}`;
    } else {
      return `${formattedNumber} ${currencySettings.symbol}`;
    }
  }

  // Get current currency settings for other services
  getCurrentCurrency(): CurrencySettings {
    return this.loadSettings().currency;
  }

  // Get current business info
  getBusinessInfo(): BusinessSettings {
    return this.loadSettings().business;
  }

  // Get current tax settings
  getTaxSettings(): TaxSettings {
    return this.loadSettings().tax;
  }
}

export default SettingsService;