import React, { useState, useEffect } from 'react';
import { useCustomerLedger } from '../context/CustomerLedgerContext';
import type { Customer } from '../context/CustomerLedgerContext';
import { useFocusTrap } from '../hooks/useFocusTrap';

// Import Shadcn UI components
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Textarea } from './ui/textarea';

interface CreateCustomerModalProps {
  onSave: (customer: Customer) => void;
  onCancel: () => void;
}

const CreateCustomerModal: React.FC<CreateCustomerModalProps> = ({ onSave, onCancel }) => {
  const { customers, setCustomers } = useCustomerLedger();
  const modalRef = useFocusTrap(true, onCancel);
  
  const [newCustomer, setNewCustomer] = useState<Customer>({
    name: '',
    contact: '',
    email: '',
    address: '',
    balance: 0,
    joinDate: new Date().toISOString().split('T')[0], // Today's date
    type: 'individual',
    creditLimit: 0,
    notes: ''
  });

  const [formErrors, setFormErrors] = useState<{
    name?: string;
    contact?: string;
  }>({});
  
  // Handle form field changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Special handling for numeric fields
    if (name === 'creditLimit' || name === 'balance') {
      setNewCustomer({
        ...newCustomer,
        [name]: parseFloat(value) || 0
      });
    } else {
      setNewCustomer({
        ...newCustomer,
        [name]: value
      });
    }
    
    // Clear error for this field if it exists
    if (formErrors[name as keyof typeof formErrors]) {
      setFormErrors({
        ...formErrors,
        [name]: undefined
      });
    }
  };
  
  // Validate the form
  const validateForm = (): boolean => {
    const errors: {
      name?: string;
      contact?: string;
    } = {};
    
    // Required fields
    if (!newCustomer.name.trim()) {
      errors.name = 'Name is required';
    }
    
    if (!newCustomer.contact.trim()) {
      errors.contact = 'Contact is required';
    }
    
    // Check if customer name already exists
    if (customers.some(c => c.name.toLowerCase() === newCustomer.name.toLowerCase())) {
      errors.name = 'Customer with this name already exists';
    }
    
    setFormErrors(errors);
    
    // Form is valid if there are no errors
    return Object.keys(errors).length === 0;
  };
  
  // Handle save button click
  const handleSave = () => {
    if (validateForm()) {
      // Generate a unique ID for the new customer
      const newId = `customer-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      const customerWithId: Customer = {
        ...newCustomer,
        id: newId
      };
      
      // Add to customers list
      setCustomers([...customers, customerWithId]);
      
      // Call the onSave callback with the new customer
      onSave(customerWithId);
    }
  };
  
  // Add ESC key handler
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    
    window.addEventListener('keydown', handleEscapeKey);
    return () => {
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, [onCancel]);
  
  return (
    <Dialog open={true} onOpenChange={() => onCancel()}>
      <DialogContent className="sm:max-w-[525px]" ref={modalRef as React.RefObject<HTMLDivElement>}>
        <DialogHeader>
          <DialogTitle>Create New Customer</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid items-center gap-1.5">
            <Label htmlFor="name">
              Customer Name*
            </Label>
            <Input 
              id="name"
              name="name"
              value={newCustomer.name}
              onChange={handleChange}
              className={formErrors.name ? "border-destructive" : ""}
              autoFocus
            />
            {formErrors.name && <p className="text-sm text-destructive">{formErrors.name}</p>}
          </div>
          
          <div className="grid items-center gap-1.5">
            <Label htmlFor="contact">
              Contact Phone*
            </Label>
            <Input 
              id="contact"
              name="contact"
              value={newCustomer.contact}
              onChange={handleChange}
              className={formErrors.contact ? "border-destructive" : ""}
            />
            {formErrors.contact && <p className="text-sm text-destructive">{formErrors.contact}</p>}
          </div>
          
          <div className="grid items-center gap-1.5">
            <Label htmlFor="email">
              Email
            </Label>
            <Input 
              type="email"
              id="email"
              name="email"
              value={newCustomer.email || ''}
              onChange={handleChange}
            />
          </div>
          
          <div className="grid items-center gap-1.5">
            <Label htmlFor="type">
              Customer Type
            </Label>
            <Select 
              value={newCustomer.type} 
              onValueChange={(value) => {
                setNewCustomer({
                  ...newCustomer,
                  type: value as 'individual' | 'business'
                });
              }}
            >
              <SelectTrigger id="type">
                <SelectValue placeholder="Select customer type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="business">Business</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid items-center gap-1.5">
            <Label htmlFor="address">
              Address
            </Label>
            <Input 
              id="address"
              name="address"
              value={newCustomer.address || ''}
              onChange={handleChange}
            />
          </div>
          
          <div className="grid items-center gap-1.5">
            <Label htmlFor="creditLimit">
              Credit Limit
            </Label>
            <Input
              type="number"
              id="creditLimit"
              name="creditLimit"
              value={newCustomer.creditLimit || 0}
              onChange={handleChange}
              min={0}
              step={1}
            />
          </div>
          
          <div className="grid items-center gap-1.5">
            <Label htmlFor="notes">
              Notes
            </Label>
            <Textarea
              id="notes"
              name="notes"
              value={newCustomer.notes || ''}
              onChange={handleChange}
              rows={3}
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateCustomerModal;