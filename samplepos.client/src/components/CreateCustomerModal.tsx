import React, { useState, useEffect } from 'react';
import type { Customer } from '../types';
import type { CreateCustomerData } from '../services/api/customersApi';
import { useCreateCustomer, useCustomers } from '../services/api/customersApi';
import { useFocusTrap } from '../hooks/useFocusTrap';

// Import Shadcn UI components
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Textarea } from './ui/textarea';

interface CreateCustomerModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onSave?: (customer: Omit<Customer, "id">) => Promise<void>;
}

const CreateCustomerModal: React.FC<CreateCustomerModalProps> = ({ open, onClose, onSuccess }) => {
  const modalRef = useFocusTrap(open, onClose);
  
  // React Query hooks
  const { data: customersData } = useCustomers();
  const createCustomer = useCreateCustomer();
  
  const customers = customersData?.data || [];
  
  const [formData, setFormData] = useState<CreateCustomerData>({
    name: '',
    phone: '',
    email: '',
    address: '',
    type: 'INDIVIDUAL',
    creditLimit: 0,
    notes: ''
  });

  const [formErrors, setFormErrors] = useState<{
    name?: string;
    phone?: string;
  }>({});
  
  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setFormData({
        name: '',
        phone: '',
        email: '',
        address: '',
        type: 'INDIVIDUAL',
        creditLimit: 0,
        notes: ''
      });
      setFormErrors({});
    }
  }, [open]);
  
  // Handle form field changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Special handling for numeric fields
    if (name === 'creditLimit') {
      setFormData({
        ...formData,
        [name]: parseFloat(value) || 0
      });
    } else {
      setFormData({
        ...formData,
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
      phone?: string;
    } = {};
    
    // Required fields
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }
    
    if (!formData.phone?.trim()) {
      errors.phone = 'Phone is required';
    }
    
    // Check if customer name already exists
    if (customers.some((c) => c.name.toLowerCase() === formData.name.toLowerCase())) {
      errors.name = 'Customer with this name already exists';
    }
    
    setFormErrors(errors);
    
    // Form is valid if there are no errors
    return Object.keys(errors).length === 0;
  };
  
  // Handle save button click
  const handleSave = async () => {
    if (validateForm()) {
      try {
        // Create customer via API
        await createCustomer.mutateAsync({
          name: formData.name,
          phone: formData.phone || undefined,
          email: formData.email || undefined,
          address: formData.address || undefined,
          type: formData.type,
          creditLimit: formData.creditLimit || undefined,
          notes: formData.notes || undefined
        });
        
        // Call success callback if provided
        if (onSuccess) {
          onSuccess();
        }
        
        // Close the modal after successful save
        onClose();
      } catch (error) {
        console.error('Failed to save customer:', error);
        setFormErrors({
          name: 'Failed to create customer. Please try again.'
        });
      }
    }
  };
  
  // Add ESC key handler
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscapeKey);
    return () => {
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, [onClose]);
  
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
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
              value={formData.name}
              onChange={handleChange}
              className={formErrors.name ? "border-destructive" : ""}
              autoFocus
            />
            {formErrors.name && <p className="text-sm text-destructive">{formErrors.name}</p>}
          </div>
          
          <div className="grid items-center gap-1.5">
            <Label htmlFor="phone">
              Contact Phone*
            </Label>
            <Input 
              id="phone"
              name="phone"
              value={formData.phone || ''}
              onChange={handleChange}
              className={formErrors.phone ? "border-destructive" : ""}
            />
            {formErrors.phone && <p className="text-sm text-destructive">{formErrors.phone}</p>}
          </div>
          
          <div className="grid items-center gap-1.5">
            <Label htmlFor="email">
              Email
            </Label>
            <Input 
              type="email"
              id="email"
              name="email"
              value={formData.email || ''}
              onChange={handleChange}
            />
          </div>
          
          <div className="grid items-center gap-1.5">
            <Label htmlFor="type">
              Customer Type
            </Label>
            <Select 
              value={formData.type} 
              onValueChange={(value) => {
                setFormData({
                  ...formData,
                  type: value as 'INDIVIDUAL' | 'BUSINESS'
                });
              }}
            >
              <SelectTrigger id="type">
                <SelectValue placeholder="Select customer type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                <SelectItem value="BUSINESS">Business</SelectItem>
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
              value={formData.address || ''}
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
              value={formData.creditLimit || 0}
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
              value={formData.notes || ''}
              onChange={handleChange}
              rows={3}
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createCustomer.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createCustomer.isPending}>
            {createCustomer.isPending ? 'Saving...' : 'Save Customer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateCustomerModal;