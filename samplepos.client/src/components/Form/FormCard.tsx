/**
 * Responsive Form Card Component
 * Consistent card-based form layout with proper spacing
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Loader2 } from 'lucide-react';

export interface FormCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

export const FormCard: React.FC<FormCardProps> = ({
  title,
  description,
  children,
  footer,
  onSubmit,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  onCancel,
  isLoading = false,
  disabled = false,
  className = '',
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disabled && !isLoading) {
      onSubmit?.(e);
    }
  };

  return (
    <Card className={`w-full ${className}`}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle className="text-xl sm:text-2xl">{title}</CardTitle>}
          {description && <CardDescription className="text-sm sm:text-base">{description}</CardDescription>}
        </CardHeader>
      )}
      
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4 sm:space-y-6">
          {children}
        </CardContent>

        {(footer || onSubmit || onCancel) && (
          <CardFooter className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-4">
            {footer}
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading || disabled}
                className="w-full sm:w-auto"
              >
                {cancelLabel}
              </Button>
            )}
            {onSubmit && (
              <Button
                type="submit"
                disabled={isLoading || disabled}
                className="w-full sm:w-auto"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitLabel}
              </Button>
            )}
          </CardFooter>
        )}
      </form>
    </Card>
  );
};

export default FormCard;
