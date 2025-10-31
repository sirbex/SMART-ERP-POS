import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import LoansList from '@/components/loans/LoansList';
import NewLoanDialog from '@/components/loans/NewLoanDialog';
import LoanStats from '@/components/loans/LoanStats';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import LoanDetails from '@/components/loans/LoanDetails';
import type { Loan } from '@/services/loanService';

export default function LoansPage() {
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<Loan | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-qb-gray-900">Loans Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage customer, supplier, and employee loans
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>New Loan</Button>
      </div>

      <LoanStats />

      <Card className="p-4">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="ACTIVE">Active</TabsTrigger>
            <TabsTrigger value="PAID_OFF">Paid Off</TabsTrigger>
            <TabsTrigger value="DEFAULTED">Defaulted</TabsTrigger>
            <TabsTrigger value="WRITTEN_OFF">Written Off</TabsTrigger>
          </TabsList>

          <TabsContent value="all"><LoansList filter="all" onSelectLoan={setSelected} /></TabsContent>
          <TabsContent value="ACTIVE"><LoansList filter="ACTIVE" onSelectLoan={setSelected} /></TabsContent>
          <TabsContent value="PAID_OFF"><LoansList filter="PAID_OFF" onSelectLoan={setSelected} /></TabsContent>
          <TabsContent value="DEFAULTED"><LoansList filter="DEFAULTED" onSelectLoan={setSelected} /></TabsContent>
          <TabsContent value="WRITTEN_OFF"><LoansList filter="WRITTEN_OFF" onSelectLoan={setSelected} /></TabsContent>
        </Tabs>
      </Card>

      <NewLoanDialog open={newOpen} onOpenChange={setNewOpen} />

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Loan Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <LoanDetails loanId={selected.id} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
