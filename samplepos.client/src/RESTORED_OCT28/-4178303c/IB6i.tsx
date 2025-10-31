import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import BankAccountsList from '@/components/banking/BankAccountsList';
import BankAccountDetails from '@/components/banking/BankAccountDetails';
import NewBankAccountDialog from '@/components/banking/NewBankAccountDialog';
import type { BankAccount } from '@/services/bankService';

export default function BankingPage() {
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<BankAccount | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-qb-gray-900">Bank Accounts & Reconciliation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage bank accounts, transactions, and reconciliations
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>New Bank Account</Button>
      </div>

      <Card className="p-4">
        <Tabs defaultValue="accounts">
          <TabsList>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="reconciliations">Reconciliations</TabsTrigger>
          </TabsList>

          <TabsContent value="accounts">
            <BankAccountsList onSelectAccount={setSelected} />
          </TabsContent>
          <TabsContent value="transactions">
            <div className="text-sm text-muted-foreground p-4">Transactions view coming soon...</div>
          </TabsContent>
          <TabsContent value="reconciliations">
            <div className="text-sm text-muted-foreground p-4">Reconciliations view coming soon...</div>
          </TabsContent>
        </Tabs>
      </Card>

      <NewBankAccountDialog open={newOpen} onOpenChange={setNewOpen} />

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Bank Account Details</DialogTitle>
          </DialogHeader>
          {selected && <BankAccountDetails account={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
