/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable jsx-a11y/label-has-for */
/* eslint-disable jsx-a11y/no-interactive-element-to-noninteractive-role */
import React, { useState, useEffect } from 'react';
import { CustomerAccountService } from '../services/CustomerAccountService';
import type { 
  CustomerAccount, 
  AccountTransaction, 
  InstallmentPlan,
  CreditSaleOptions,
  AccountSummary,
  PaymentMethod 
} from '../types/CustomerAccount';
import './CustomerAccountManager.css';

interface CustomerAccountManagerProps {
  onClose?: () => void;
}

export const CustomerAccountManager: React.FC<CustomerAccountManagerProps> = ({ onClose }) => {
  const [customers, setCustomers] = useState<CustomerAccount[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerAccount | null>(null);
  const [accountSummary, setAccountSummary] = useState<AccountSummary | null>(null);
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [installmentPlans, setInstallmentPlans] = useState<InstallmentPlan[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'credit-sale' | 'payment' | 'deposit' | 'installments'>('overview');
  const [loading, setLoading] = useState(false);

  // Credit Sale State
  const [creditSaleForm, setCreditSaleForm] = useState<{
    items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
    paymentType: 'full_credit' | 'partial_credit' | 'deposit_and_credit' | 'installment';
    useDepositAmount: number;
    creditAmount: number;
    installmentPlan?: {
      numberOfInstallments: number;
      frequency: 'weekly' | 'bi-weekly' | 'monthly';
      interestRate: number;
    };
    notes: string;
  }>({
    items: [{ name: '', quantity: 1, unitPrice: 0, total: 0 }],
    paymentType: 'full_credit',
    useDepositAmount: 0,
    creditAmount: 0,
    notes: ''
  });

  // Payment Form State
  const [paymentForm, setPaymentForm] = useState<{
    amount: number;
    paymentMethod: PaymentMethod;
    applyToInstallment: boolean;
    installmentPlanId: string;
    notes: string;
  }>({
    amount: 0,
    paymentMethod: 'cash',
    applyToInstallment: false,
    installmentPlanId: '',
    notes: ''
  });

  // Deposit Form State
  const [depositForm, setDepositForm] = useState<{
    amount: number;
    paymentMethod: PaymentMethod;
    notes: string;
  }>({
    amount: 0,
    paymentMethod: 'cash',
    notes: ''
  });

  // New Customer Form State
  const [newCustomerForm, setNewCustomerForm] = useState<{
    name: string;
    contact: string;
    email: string;
    address: string;
    customerType: 'individual' | 'business' | 'wholesale' | 'retail';
    creditLimit: number;
    paymentTermsDays: number;
  }>({
    name: '',
    contact: '',
    email: '',
    address: '',
    customerType: 'individual',
    creditLimit: 10000,
    paymentTermsDays: 30
  });

  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      loadCustomerDetails();
    }
  }, [selectedCustomerId]);

  const loadCustomers = () => {
    const allCustomers = CustomerAccountService.getAllCustomers();
    setCustomers(allCustomers);
  };

  const loadCustomerDetails = async () => {
    if (!selectedCustomerId) return;

    setLoading(true);
    try {
      const customer = CustomerAccountService.getCustomerAccount(selectedCustomerId);
      const summary = CustomerAccountService.getAccountSummary(selectedCustomerId);
      const customerTransactions = CustomerAccountService.getCustomerTransactions(selectedCustomerId);
      const customerPlans = CustomerAccountService.getCustomerInstallmentPlans(selectedCustomerId);

      setSelectedCustomer(customer);
      setAccountSummary(summary);
      setTransactions(customerTransactions);
      setInstallmentPlans(customerPlans);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = async () => {
    try {
      const newCustomer = await CustomerAccountService.createCustomerAccount({
        name: newCustomerForm.name,
        contact: newCustomerForm.contact,
        email: newCustomerForm.email || undefined,
        address: newCustomerForm.address || undefined,
        customerType: newCustomerForm.customerType,
        creditLimit: newCustomerForm.creditLimit,
        paymentTermsDays: newCustomerForm.paymentTermsDays
      });

      setCustomers([...customers, newCustomer]);
      setShowNewCustomerModal(false);
      setNewCustomerForm({
        name: '',
        contact: '',
        email: '',
        address: '',
        customerType: 'individual',
        creditLimit: 10000,
        paymentTermsDays: 30
      });
    } catch (error) {
      alert('Error creating customer: ' + (error as Error).message);
    }
  };

  const handleCreditSale = async () => {
    if (!selectedCustomerId || creditSaleForm.items.length === 0) return;

    try {
      const saleAmount = creditSaleForm.items.reduce((sum, item) => sum + item.total, 0);
      
      const options: CreditSaleOptions = {
        customerId: selectedCustomerId,
        saleAmount,
        items: creditSaleForm.items.filter(item => item.name && item.quantity > 0),
        paymentType: creditSaleForm.paymentType,
        useDepositAmount: creditSaleForm.paymentType === 'deposit_and_credit' ? creditSaleForm.useDepositAmount : undefined,
        creditAmount: creditSaleForm.paymentType !== 'full_credit' ? creditSaleForm.creditAmount : saleAmount,
        installmentPlan: creditSaleForm.paymentType === 'installment' ? creditSaleForm.installmentPlan : undefined,
        notes: creditSaleForm.notes || undefined
      };

      const result = await CustomerAccountService.processCreditSale(options);
      
      if (result.success) {
        await loadCustomerDetails();
        setCreditSaleForm({
          items: [{ name: '', quantity: 1, unitPrice: 0, total: 0 }],
          paymentType: 'full_credit',
          useDepositAmount: 0,
          creditAmount: 0,
          notes: ''
        });
        alert('Credit sale processed successfully!');
      } else {
        alert('Error processing credit sale: ' + (result.errors?.join(', ') || 'Unknown error'));
      }
    } catch (error) {
      alert('Error processing credit sale: ' + (error as Error).message);
    }
  };

  const handleMakePayment = async () => {
    if (!selectedCustomerId || paymentForm.amount <= 0) return;

    try {
      const result = await CustomerAccountService.recordPayment({
        customerId: selectedCustomerId,
        amount: paymentForm.amount,
        paymentMethod: paymentForm.paymentMethod,
        applyToInstallment: paymentForm.applyToInstallment,
        installmentPlanId: paymentForm.applyToInstallment ? paymentForm.installmentPlanId : undefined,
        notes: paymentForm.notes || undefined
      });

      if (result.success) {
        await loadCustomerDetails();
        setPaymentForm({
          amount: 0,
          paymentMethod: 'cash',
          applyToInstallment: false,
          installmentPlanId: '',
          notes: ''
        });
        alert('Payment recorded successfully!');
      } else {
        alert('Error recording payment: ' + (result.errors?.join(', ') || 'Unknown error'));
      }
    } catch (error) {
      alert('Error recording payment: ' + (error as Error).message);
    }
  };

  const handleMakeDeposit = async () => {
    if (!selectedCustomerId || depositForm.amount <= 0) return;

    try {
      const result = await CustomerAccountService.addDeposit({
        customerId: selectedCustomerId,
        amount: depositForm.amount,
        paymentMethod: depositForm.paymentMethod,
        notes: depositForm.notes || undefined
      });

      if (result.success) {
        await loadCustomerDetails();
        setDepositForm({
          amount: 0,
          paymentMethod: 'cash',
          notes: ''
        });
        alert('Deposit added successfully!');
      } else {
        alert('Error adding deposit: ' + (result.errors?.join(', ') || 'Unknown error'));
      }
    } catch (error) {
      alert('Error adding deposit: ' + (error as Error).message);
    }
  };

  const updateCreditSaleItem = (index: number, field: string, value: any) => {
    const updatedItems = [...creditSaleForm.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'unitPrice') {
      updatedItems[index].total = updatedItems[index].quantity * updatedItems[index].unitPrice;
    }
    
    setCreditSaleForm({ ...creditSaleForm, items: updatedItems });
  };

  const addCreditSaleItem = () => {
    setCreditSaleForm({
      ...creditSaleForm,
      items: [...creditSaleForm.items, { name: '', quantity: 1, unitPrice: 0, total: 0 }]
    });
  };

  const removeCreditSaleItem = (index: number) => {
    setCreditSaleForm({
      ...creditSaleForm,
      items: creditSaleForm.items.filter((_, i) => i !== index)
    });
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.contact.includes(searchTerm) ||
    customer.accountNumber.includes(searchTerm)
  );

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDate = (date: string) => new Date(date).toLocaleDateString();

  return (
    <div className="customer-account-manager">
      <div className="cam-header">
        <h2>Customer Account Management</h2>
        {onClose && (
          <button onClick={onClose} className="cam-close-btn">×</button>
        )}
      </div>

      <div className="cam-layout">
        {/* Customer List Sidebar */}
        <div className="cam-sidebar">
          <div className="cam-search-section">
            <div className="cam-search-bar">
              <input
                type="text"
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="cam-search-input"
              />
            </div>
            <button
              onClick={() => setShowNewCustomerModal(true)}
              className="cam-new-customer-btn"
            >
              + New Customer
            </button>
          </div>

          <div className="cam-customer-list">
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                className={`cam-customer-item ${selectedCustomerId === customer.id ? 'active' : ''}`}
                onClick={() => setSelectedCustomerId(customer.id)}
              >
                <div className="cam-customer-name">{customer.name}</div>
                <div className="cam-customer-info">
                  <span className="cam-account-number">{customer.accountNumber}</span>
                  <span className={`cam-status ${customer.status}`}>{customer.status}</span>
                </div>
                <div className="cam-customer-balance">
                  Balance: {formatCurrency(customer.currentBalance)}
                </div>
                {customer.depositBalance > 0 && (
                  <div className="cam-deposit-balance">
                    Deposit: {formatCurrency(customer.depositBalance)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="cam-main-content">
          {selectedCustomer ? (
            <>
              {/* Customer Header */}
              <div className="cam-customer-header">
                <div className="cam-customer-details">
                  <h3>{selectedCustomer.name}</h3>
                  <div className="cam-customer-meta">
                    <span>Account: {selectedCustomer.accountNumber}</span>
                    <span>Contact: {selectedCustomer.contact}</span>
                    <span>Type: {selectedCustomer.customerType}</span>
                    <span className={`status ${selectedCustomer.status}`}>
                      {selectedCustomer.status}
                    </span>
                  </div>
                </div>

                {accountSummary && (
                  <div className="cam-account-summary">
                    <div className="cam-summary-card">
                      <div className="cam-balance-info">
                        <div className="cam-current-balance">
                          <label>Current Balance</label>
                          <span className={accountSummary.currentBalance > 0 ? 'negative' : 'positive'}>
                            {formatCurrency(accountSummary.currentBalance)}
                          </span>
                        </div>
                        <div className="cam-deposit-balance">
                          <label>Deposit Balance</label>
                          <span className="positive">{formatCurrency(accountSummary.depositBalance)}</span>
                        </div>
                        <div className="cam-credit-info">
                          <label>Available Credit</label>
                          <span>{formatCurrency(accountSummary.availableCredit)}</span>
                        </div>
                      </div>
                      {(accountSummary.totalOverdueAmount || 0) > 0 && (
                        <div className="cam-overdue-alert">
                          <span>Overdue: {formatCurrency(accountSummary.totalOverdueAmount || 0)}</span>
                          <span>Days: {accountSummary.daysOverdue}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Tab Navigation */}
              <div className="cam-tabs">
                <button
                  className={activeTab === 'overview' ? 'active' : ''}
                  onClick={() => setActiveTab('overview')}
                >
                  Overview
                </button>
                <button
                  className={activeTab === 'transactions' ? 'active' : ''}
                  onClick={() => setActiveTab('transactions')}
                >
                  Transactions
                </button>
                <button
                  className={activeTab === 'credit-sale' ? 'active' : ''}
                  onClick={() => setActiveTab('credit-sale')}
                >
                  Credit Sale
                </button>
                <button
                  className={activeTab === 'payment' ? 'active' : ''}
                  onClick={() => setActiveTab('payment')}
                >
                  Make Payment
                </button>
                <button
                  className={activeTab === 'deposit' ? 'active' : ''}
                  onClick={() => setActiveTab('deposit')}
                >
                  Add Deposit
                </button>
                <button
                  className={activeTab === 'installments' ? 'active' : ''}
                  onClick={() => setActiveTab('installments')}
                >
                  Installment Plans
                </button>
              </div>

              {/* Tab Content */}
              <div className="cam-tab-content">
                {loading && <div className="cam-loading">Loading...</div>}

                {/* Overview Tab */}
                {activeTab === 'overview' && accountSummary && (
                  <div className="cam-overview">
                    <div className="cam-stats-grid">
                      <div className="cam-stat-card">
                        <h4>Account Statistics</h4>
                        <div className="cam-stat-item">
                          <label>Lifetime Value:</label>
                          <span>{formatCurrency(accountSummary.lifetimeValue)}</span>
                        </div>
                        <div className="cam-stat-item">
                          <label>Total Payments:</label>
                          <span>{formatCurrency(accountSummary.totalPayments)}</span>
                        </div>
                        <div className="cam-stat-item">
                          <label>Credit Score:</label>
                          <span>{accountSummary.creditScore}/100</span>
                        </div>
                        {accountSummary.lastPaymentDate && (
                          <div className="cam-stat-item">
                            <label>Last Payment:</label>
                            <span>{formatDate(accountSummary.lastPaymentDate)}</span>
                          </div>
                        )}
                      </div>

                      <div className="cam-stat-card">
                        <h4>Payment Information</h4>
                        <div className="cam-stat-item">
                          <label>Payment Terms:</label>
                          <span>{selectedCustomer.paymentTermsDays} days</span>
                        </div>
                        <div className="cam-stat-item">
                          <label>Interest Rate:</label>
                          <span>{selectedCustomer.interestRate}% annually</span>
                        </div>
                        <div className="cam-stat-item">
                          <label>Late Fee:</label>
                          <span>{formatCurrency(selectedCustomer.lateFeeAmount)}</span>
                        </div>
                        {accountSummary.nextPaymentDate && (
                          <div className="cam-stat-item">
                            <label>Next Payment Due:</label>
                            <span>{formatDate(accountSummary.nextPaymentDate)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Recent Transactions */}
                    <div className="cam-recent-transactions">
                      <h4>Recent Transactions</h4>
                      <div className="cam-transaction-list">
                        {transactions.slice(0, 5).map((transaction) => (
                          <div key={transaction.id} className="cam-transaction-item">
                            <div className="cam-transaction-info">
                              <span className="cam-transaction-type">{transaction.type.replace('_', ' ')}</span>
                              <span className="cam-transaction-date">{formatDate(transaction.date)}</span>
                            </div>
                            <div className={`cam-transaction-amount ${transaction.amount > 0 ? 'positive' : 'negative'}`}>
                              {formatCurrency(Math.abs(transaction.amount))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Transactions Tab */}
                {activeTab === 'transactions' && (
                  <div className="cam-transactions">
                    <div className="cam-transaction-filters">
                      <select className="cam-filter-select" aria-label="Filter by transaction type">
                        <option value="">All Transaction Types</option>
                        <option value="sale_credit">Credit Sales</option>
                        <option value="payment_cash">Cash Payments</option>
                        <option value="payment_installment">Installment Payments</option>
                        <option value="deposit">Deposits</option>
                      </select>
                      <input
                        type="date"
                        className="cam-filter-date"
                        placeholder="From Date"
                      />
                      <input
                        type="date"
                        className="cam-filter-date"
                        placeholder="To Date"
                      />
                    </div>

                    <div className="cam-transaction-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Description</th>
                            <th>Reference</th>
                            <th>Amount</th>
                            <th>Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactions.map((transaction) => (
                            <tr key={transaction.id}>
                              <td>{formatDate(transaction.date)}</td>
                              <td>{transaction.type.replace('_', ' ')}</td>
                              <td>{transaction.description}</td>
                              <td>{transaction.transactionNumber || transaction.id}</td>
                              <td className={transaction.amount > 0 ? 'positive' : 'negative'}>
                                {formatCurrency(Math.abs(transaction.amount))}
                              </td>
                              <td>{formatCurrency(transaction.balanceAfter || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Credit Sale Tab */}
                {activeTab === 'credit-sale' && (
                  <div className="cam-credit-sale">
                    <h4>Process Credit Sale</h4>
                    
                    {/* Items Section */}
                    <div className="cam-sale-items">
                      <h5>Sale Items</h5>
                      {creditSaleForm.items.map((item, index) => (
                        <div key={index} className="cam-sale-item">
                          <input
                            type="text"
                            placeholder="Item name"
                            value={item.name}
                            onChange={(e) => updateCreditSaleItem(index, 'name', e.target.value)}
                          />
                          <input
                            type="number"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => updateCreditSaleItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Unit Price"
                            value={item.unitPrice}
                            onChange={(e) => updateCreditSaleItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Total"
                            value={item.total}
                            readOnly
                          />
                          <button
                            type="button"
                            onClick={() => removeCreditSaleItem(index)}
                            className="cam-remove-item-btn"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addCreditSaleItem}
                        className="cam-add-item-btn"
                      >
                        + Add Item
                      </button>
                    </div>

                    {/* Sale Total */}
                    <div className="cam-sale-total">
                      <strong>
                        Total Sale Amount: {formatCurrency(creditSaleForm.items.reduce((sum, item) => sum + item.total, 0))}
                      </strong>
                    </div>

                    {/* Payment Options */}
                    <div className="cam-payment-options">
                      <h5>Payment Options</h5>
                      <div className="cam-payment-type">
                        <label>
                          <input
                            type="radio"
                            name="paymentType"
                            value="full_credit"
                            checked={creditSaleForm.paymentType === 'full_credit'}
                            onChange={(e) => setCreditSaleForm({ ...creditSaleForm, paymentType: e.target.value as any })}
                          />
                          Full Credit Sale
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="paymentType"
                            value="deposit_and_credit"
                            checked={creditSaleForm.paymentType === 'deposit_and_credit'}
                            onChange={(e) => setCreditSaleForm({ ...creditSaleForm, paymentType: e.target.value as any })}
                          />
                          Use Deposit + Credit
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="paymentType"
                            value="installment"
                            checked={creditSaleForm.paymentType === 'installment'}
                            onChange={(e) => setCreditSaleForm({ ...creditSaleForm, paymentType: e.target.value as any })}
                          />
                          Installment Plan
                        </label>
                      </div>

                      {creditSaleForm.paymentType === 'deposit_and_credit' && (
                        <div className="cam-deposit-usage">
                          <label htmlFor="deposit-amount">Use from Deposit Balance:</label>
                          <input
                            id="deposit-amount"
                            type="number"
                            step="0.01"
                            value={creditSaleForm.useDepositAmount}
                            onChange={(e) => setCreditSaleForm({ 
                              ...creditSaleForm, 
                              useDepositAmount: parseFloat(e.target.value) || 0 
                            })}
                            max={selectedCustomer?.depositBalance || 0}
                          />
                          <small>Available: {formatCurrency(selectedCustomer?.depositBalance || 0)}</small>
                        </div>
                      )}

                      {creditSaleForm.paymentType === 'installment' && (
                        <div className="cam-installment-options">
                          <div className="cam-installment-field">
                            <label htmlFor="installments-count">Number of Installments:</label>
                            <input
                              id="installments-count"
                              type="number"
                              value={creditSaleForm.installmentPlan?.numberOfInstallments || 1}
                              onChange={(e) => setCreditSaleForm({ 
                                ...creditSaleForm, 
                                installmentPlan: { 
                                  ...creditSaleForm.installmentPlan!, 
                                  numberOfInstallments: parseInt(e.target.value) || 1 
                                } 
                              })}
                            />
                          </div>
                          <div className="cam-installment-field">
                            <label htmlFor="installment-frequency">Frequency:</label>
                            <select
                              id="installment-frequency"
                              value={creditSaleForm.installmentPlan?.frequency || 'monthly'}
                              onChange={(e) => setCreditSaleForm({ 
                                ...creditSaleForm, 
                                installmentPlan: { 
                                  ...creditSaleForm.installmentPlan!, 
                                  frequency: e.target.value as any 
                                } 
                              })}
                            >
                              <option value="weekly">Weekly</option>
                              <option value="bi-weekly">Bi-weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>
                          <div className="cam-installment-field">
                            <label htmlFor="interest-rate">Interest Rate (%):</label>
                            <input
                              id="interest-rate"
                              type="number"
                              step="0.1"
                              value={creditSaleForm.installmentPlan?.interestRate || 0}
                              onChange={(e) => setCreditSaleForm({ 
                                ...creditSaleForm, 
                                installmentPlan: { 
                                  ...creditSaleForm.installmentPlan!, 
                                  interestRate: parseFloat(e.target.value) || 0 
                                } 
                              })}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <div className="cam-sale-notes">
                      <label>Notes:</label>
                      <textarea
                        value={creditSaleForm.notes}
                        onChange={(e) => setCreditSaleForm({ ...creditSaleForm, notes: e.target.value })}
                        placeholder="Additional notes for this sale..."
                      />
                    </div>

                    <button
                      onClick={handleCreditSale}
                      className="cam-process-sale-btn"
                      disabled={creditSaleForm.items.length === 0 || !creditSaleForm.items.some(item => item.name)}
                    >
                      Process Credit Sale
                    </button>
                  </div>
                )}

                {/* Payment Tab */}
                {activeTab === 'payment' && (
                  <div className="cam-payment">
                    <h4>Record Payment</h4>
                    
                    <div className="cam-payment-form">
                      <div className="cam-payment-field">
                        <label htmlFor="payment-amount">Payment Amount:</label>
                        <input
                          id="payment-amount"
                          type="number"
                          step="0.01"
                          placeholder="Enter payment amount"
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                        />
                      </div>

                      <div className="cam-payment-field">
                        <label htmlFor="payment-method-select">Payment Method:</label>
                        <select
                          id="payment-method-select"
                          value={paymentForm.paymentMethod}
                          onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value as PaymentMethod })}
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="mobile_money">Mobile Money</option>
                          <option value="check">Check</option>
                        </select>
                      </div>

                      <div className="cam-payment-field">
                        <label>
                          <input
                            type="checkbox"
                            checked={paymentForm.applyToInstallment}
                            onChange={(e) => setPaymentForm({ ...paymentForm, applyToInstallment: e.target.checked })}
                          />
                          Apply to Specific Installment Plan
                        </label>
                      </div>

                      {paymentForm.applyToInstallment && (
                        <div className="cam-payment-field">
                          <label htmlFor="installment-plan-select">Installment Plan:</label>
                          <select
                            id="installment-plan-select"
                            value={paymentForm.installmentPlanId}
                            onChange={(e) => setPaymentForm({ ...paymentForm, installmentPlanId: e.target.value })}
                          >
                            <option value="">Select Plan</option>
                            {installmentPlans.map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                Plan #{plan.id} - {formatCurrency(plan.remainingAmount)} remaining
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="cam-payment-field">
                        <label>Notes:</label>
                        <textarea
                          value={paymentForm.notes}
                          onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                          placeholder="Payment notes..."
                        />
                      </div>

                      <button
                        onClick={handleMakePayment}
                        className="cam-record-payment-btn"
                        disabled={paymentForm.amount <= 0}
                      >
                        Record Payment
                      </button>
                    </div>
                  </div>
                )}

                {/* Deposit Tab */}
                {activeTab === 'deposit' && (
                  <div className="cam-deposit">
                    <h4>Add Customer Deposit</h4>
                    
                    <div className="cam-deposit-form">
                      <div className="cam-deposit-field">
                        <label htmlFor="deposit-amount">Deposit Amount:</label>
                        <input
                          id="deposit-amount"
                          type="number"
                          step="0.01"
                          placeholder="Enter deposit amount"
                          value={depositForm.amount}
                          onChange={(e) => setDepositForm({ ...depositForm, amount: parseFloat(e.target.value) || 0 })}
                        />
                      </div>

                      <div className="cam-deposit-field">
                        <label htmlFor="payment-method">Payment Method:</label>
                        <select
                          id="payment-method"
                          value={depositForm.paymentMethod}
                          onChange={(e) => setDepositForm({ ...depositForm, paymentMethod: e.target.value as PaymentMethod })}
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="mobile_money">Mobile Money</option>
                          <option value="check">Check</option>
                        </select>
                      </div>

                      <div className="cam-deposit-field">
                        <label>Notes:</label>
                        <textarea
                          value={depositForm.notes}
                          onChange={(e) => setDepositForm({ ...depositForm, notes: e.target.value })}
                          placeholder="Deposit notes..."
                        />
                      </div>

                      <button
                        onClick={handleMakeDeposit}
                        className="cam-add-deposit-btn"
                        disabled={depositForm.amount <= 0}
                      >
                        Add Deposit
                      </button>
                    </div>
                  </div>
                )}

                {/* Installments Tab */}
                {activeTab === 'installments' && (
                  <div className="cam-installments">
                    <h4>Installment Plans</h4>
                    
                    {installmentPlans.length === 0 ? (
                      <div className="cam-no-installments">
                        No installment plans found for this customer.
                      </div>
                    ) : (
                      <div className="cam-installment-plans">
                        {installmentPlans.map((plan) => (
                          <div key={plan.id} className="cam-installment-plan">
                            <div className="cam-plan-header">
                              <h5>Plan #{plan.id}</h5>
                              <span className={`cam-plan-status ${plan.status}`}>{plan.status}</span>
                            </div>
                            <div className="cam-plan-details">
                              <div className="cam-plan-info">
                                <span>Total Amount: {formatCurrency(plan.totalAmount)}</span>
                                <span>Remaining: {formatCurrency(plan.remainingAmount)}</span>
                                <span>Installments: {plan.numberOfInstallments}</span>
                                <span>Frequency: {plan.frequency}</span>
                              </div>
                              <div className="cam-plan-dates">
                                <span>Start: {formatDate(plan.startDate)}</span>
                                <span>End: {formatDate(plan.endDate)}</span>
                                <span>Next Due: {formatDate(plan.nextDueDate)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="cam-no-customer">
              <p>Select a customer from the list to manage their account.</p>
            </div>
          )}
        </div>
      </div>

      {/* New Customer Modal */}
      {showNewCustomerModal && (
        <div className="cam-modal-overlay">
          <div className="cam-modal">
            <div className="cam-modal-header">
              <h3>Create New Customer</h3>
              <button
                onClick={() => setShowNewCustomerModal(false)}
                className="cam-modal-close"
              >
                ×
              </button>
            </div>
            <div className="cam-modal-body">
              <div className="cam-form-field">
                <label htmlFor="customer-name">Customer Name *</label>
                <input
                  id="customer-name"
                  type="text"
                  placeholder="Enter customer name"
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="cam-form-field">
                <label htmlFor="customer-contact">Contact Number *</label>
                <input
                  id="customer-contact"
                  type="text"
                  placeholder="Enter phone number"
                  value={newCustomerForm.contact}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, contact: e.target.value })}
                  required
                />
              </div>
              <div className="cam-form-field">
                <label htmlFor="customer-email">Email</label>
                <input
                  id="customer-email"
                  type="email"
                  placeholder="Enter email address"
                  value={newCustomerForm.email}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                />
              </div>
              <div className="cam-form-field">
                <label htmlFor="customer-address">Address</label>
                <textarea
                  id="customer-address"
                  placeholder="Enter customer address"
                  value={newCustomerForm.address}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, address: e.target.value })}
                />
              </div>
              <div className="cam-form-field">
                <label htmlFor="customer-type">Customer Type</label>
                <select
                  id="customer-type"
                  value={newCustomerForm.customerType}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, customerType: e.target.value as any })}
                >
                  <option value="individual">Individual</option>
                  <option value="business">Business</option>
                  <option value="wholesale">Wholesale</option>
                  <option value="retail">Retail</option>
                </select>
              </div>
              <div className="cam-form-field">
                <label htmlFor="credit-limit">Credit Limit</label>
                <input
                  id="credit-limit"
                  type="number"
                  step="0.01"
                  placeholder="Enter credit limit"
                  value={newCustomerForm.creditLimit}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, creditLimit: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="cam-form-field">
                <label htmlFor="payment-terms">Payment Terms (Days)</label>
                <input
                  id="payment-terms"
                  type="number"
                  placeholder="Enter payment terms in days"
                  value={newCustomerForm.paymentTermsDays}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, paymentTermsDays: parseInt(e.target.value) || 30 })}
                />
              </div>
            </div>
            <div className="cam-modal-footer">
              <button
                onClick={() => setShowNewCustomerModal(false)}
                className="cam-cancel-btn"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCustomer}
                className="cam-create-btn"
                disabled={!newCustomerForm.name || !newCustomerForm.contact}
              >
                Create Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerAccountManager;