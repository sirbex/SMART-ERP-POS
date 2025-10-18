import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';
import { Button } from './ui/button';


interface CustomerNotificationProps {
  title: string;
  description: string;
  action?: string;
  cancel?: string;
  onAction?: () => void;
  onCancel?: () => void;
  children?: React.ReactNode;
}

/**
 * A reusable customer notification component built with Shadcn UI AlertDialog
 */
const CustomerNotification: React.FC<CustomerNotificationProps> = ({
  title,
  description,
  action = "Continue",
  cancel = "Cancel",
  onAction,
  onCancel,
  children,
}) => {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {children || <Button variant="outline">Open Notification</Button>}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onAction}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CustomerNotification;