/**
 * STATEMENT IMPORT TAB
 * 
 * Upload and process bank statements with CSV parsing and pattern matching.
 */

import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    useBankAccounts,
    useBankTemplates,
    useImportStatement,
    useStatementLines,
    useProcessStatementLine,
    useCompleteStatement,
    useCreateBankTemplate
} from '../../hooks/useBanking';
import { formatCurrency } from '../../utils/currency';
import { StatementLineProcessor } from './StatementLineProcessor';

type ImportState = 'idle' | 'uploading' | 'processing' | 'complete';

interface TemplateFormData {
    name: string;
    bankName: string;
    dateColumn: number;
    dateFormat: string;
    descriptionColumn: number;
    amountColumn: number | null;
    debitColumn: number | null;
    creditColumn: number | null;
    balanceColumn: number | null;
    referenceColumn: number | null;
    skipHeaderRows: number;
    delimiter: string;
    negativeIsDebit: boolean;
}

const emptyTemplateForm: TemplateFormData = {
    name: '',
    bankName: '',
    dateColumn: 0,
    dateFormat: 'YYYY-MM-DD',
    descriptionColumn: 1,
    amountColumn: 2,
    debitColumn: null,
    creditColumn: null,
    balanceColumn: null,
    referenceColumn: null,
    skipHeaderRows: 1,
    delimiter: ',',
    negativeIsDebit: false
};

export const StatementImportTab: React.FC = () => {
    const [importState, setImportState] = useState<ImportState>('idle');
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [statementDate, setStatementDate] = useState(new Date().toISOString().split('T')[0]);
    const [csvContent, setCsvContent] = useState('');
    const [fileName, setFileName] = useState('');
    const [previewLines, setPreviewLines] = useState<string[]>([]);

    const [currentStatementId, setCurrentStatementId] = useState<string | null>(null);
    const [processingLineId, setProcessingLineId] = useState<string | null>(null);

    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [templateForm, setTemplateForm] = useState<TemplateFormData>(emptyTemplateForm);
    const [amountFormatTab, setAmountFormatTab] = useState('single');

    const fileInputRef = useRef<HTMLInputElement>(null);

    const { data: accounts = [] } = useBankAccounts();
    const { data: templates = [], refetch: refetchTemplates } = useBankTemplates();
    const { data: statementLines = [], refetch: refetchLines } = useStatementLines(currentStatementId);

    const importMutation = useImportStatement();
    const processLineMutation = useProcessStatementLine();
    const completeMutation = useCompleteStatement();
    const createTemplateMutation = useCreateBankTemplate();

    // Count lines by status
    const lineCounts = {
        unmatched: statementLines.filter(l => l.matchStatus === 'UNMATCHED').length,
        matched: statementLines.filter(l => l.matchStatus === 'MATCHED').length,
        created: statementLines.filter(l => l.matchStatus === 'CREATED').length,
        skipped: statementLines.filter(l => l.matchStatus === 'SKIPPED').length
    };
    const processedPercent = statementLines.length > 0
        ? ((lineCounts.matched + lineCounts.created + lineCounts.skipped) / statementLines.length) * 100
        : 0;

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setCsvContent(content);

            // Preview first 5 lines
            const lines = content.split(/\r?\n/).slice(0, 5);
            setPreviewLines(lines);
        };
        reader.readAsText(file);
    }, []);

    const handleImport = async () => {
        if (!selectedAccountId || !selectedTemplateId || !csvContent) return;

        setImportState('uploading');
        try {
            const result = await importMutation.mutateAsync({
                bankAccountId: selectedAccountId,
                templateId: selectedTemplateId,
                csvContent,
                statementDate,
                fileName
            });

            setCurrentStatementId(result.statementId);
            setImportState('processing');
        } catch (error) {
            console.error('Import failed:', error);
            setImportState('idle');
        }
    };

    const handleProcessLine = async (lineId: string, action: 'CREATE' | 'MATCH' | 'SKIP', categoryId?: string) => {
        setProcessingLineId(lineId);
        try {
            await processLineMutation.mutateAsync({
                lineId,
                data: {
                    action,
                    categoryId
                }
            });
            refetchLines();
        } catch (error) {
            console.error('Failed to process line:', error);
        } finally {
            setProcessingLineId(null);
        }
    };

    const handleCompleteImport = async () => {
        if (!currentStatementId) return;
        try {
            await completeMutation.mutateAsync(currentStatementId);
            setImportState('complete');
        } catch (error) {
            console.error('Failed to complete statement:', error);
        }
    };

    const handleReset = () => {
        setImportState('idle');
        setCurrentStatementId(null);
        setCsvContent('');
        setFileName('');
        setPreviewLines([]);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleCreateTemplate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createTemplateMutation.mutateAsync({
                name: templateForm.name,
                bankName: templateForm.bankName || undefined,
                columnMappings: {
                    dateColumn: templateForm.dateColumn,
                    dateFormat: templateForm.dateFormat,
                    descriptionColumn: templateForm.descriptionColumn,
                    amountColumn: templateForm.amountColumn ?? undefined,
                    debitColumn: templateForm.debitColumn ?? undefined,
                    creditColumn: templateForm.creditColumn ?? undefined,
                    balanceColumn: templateForm.balanceColumn ?? undefined,
                    referenceColumn: templateForm.referenceColumn ?? undefined,
                    negativeIsDebit: templateForm.negativeIsDebit
                },
                skipHeaderRows: templateForm.skipHeaderRows,
                delimiter: templateForm.delimiter
            });
            setIsTemplateModalOpen(false);
            setTemplateForm(emptyTemplateForm);
            refetchTemplates();
        } catch (error) {
            console.error('Failed to create template:', error);
        }
    };

    // Render based on import state
    if (importState === 'complete') {
        return (
            <Card>
                <CardContent className="py-12">
                    <div className="text-center">
                        <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500" />
                        <h3 className="text-xl font-semibold mb-2">Import Complete!</h3>
                        <p className="text-muted-foreground mb-6">
                            Successfully processed {statementLines.length} transactions.
                        </p>
                        <div className="flex justify-center gap-4 mb-6">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-600">{lineCounts.created}</div>
                                <div className="text-sm text-muted-foreground">Created</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-blue-600">{lineCounts.matched}</div>
                                <div className="text-sm text-muted-foreground">Matched</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-gray-600">{lineCounts.skipped}</div>
                                <div className="text-sm text-muted-foreground">Skipped</div>
                            </div>
                        </div>
                        <Button onClick={handleReset}>Import Another Statement</Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (importState === 'processing') {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Process Statement Lines</CardTitle>
                            <CardDescription>
                                Review and categorize imported transactions
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-sm text-muted-foreground">
                                {lineCounts.unmatched} remaining
                            </div>
                            <Button
                                onClick={handleCompleteImport}
                                disabled={lineCounts.unmatched > 0 || completeMutation.isPending}
                            >
                                {completeMutation.isPending ? 'Completing...' : 'Complete Import'}
                            </Button>
                        </div>
                    </div>
                    <Progress value={processedPercent} className="mt-4" />
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Reference</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead>Suggested</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {statementLines.map(line => (
                                <TableRow
                                    key={line.id}
                                    className={line.matchStatus !== 'UNMATCHED' ? 'opacity-50' : ''}
                                >
                                    <TableCell>{line.lineNumber}</TableCell>
                                    <TableCell>{line.transactionDate || '-'}</TableCell>
                                    <TableCell className="max-w-[200px] truncate" title={line.description}>
                                        {line.description}
                                    </TableCell>
                                    <TableCell>{line.reference || '-'}</TableCell>
                                    <TableCell className="text-right font-mono">
                                        <span className={parseFloat(String(line.amount)) >= 0 ? 'text-green-600' : 'text-red-600'}>
                                            {formatCurrency(Math.abs(parseFloat(String(line.amount))))}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        {line.suggestedCategoryName ? (
                                            <Badge variant="secondary">{line.suggestedCategoryName}</Badge>
                                        ) : (
                                            <span className="text-muted-foreground">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {line.matchStatus === 'UNMATCHED' && (
                                            <Badge variant="outline">Pending</Badge>
                                        )}
                                        {line.matchStatus === 'CREATED' && (
                                            <Badge variant="default" className="bg-green-500">Created</Badge>
                                        )}
                                        {line.matchStatus === 'MATCHED' && (
                                            <Badge variant="default" className="bg-blue-500">Matched</Badge>
                                        )}
                                        {line.matchStatus === 'SKIPPED' && (
                                            <Badge variant="secondary">Skipped</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <StatementLineProcessor
                                            line={line}
                                            isProcessing={processingLineId === line.id}
                                            onProcess={(action, categoryId) => handleProcessLine(line.id, action, categoryId)}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        );
    }

    // Idle / Upload state
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Import Bank Statement</CardTitle>
                    <CardDescription>
                        Upload a CSV file to import transactions
                    </CardDescription>
                </div>
                <Button variant="outline" onClick={() => setIsTemplateModalOpen(true)}>
                    Create Template
                </Button>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Upload Section */}
                <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label>Bank Account *</Label>
                        <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select account..." />
                            </SelectTrigger>
                            <SelectContent>
                                {accounts.map(acc => (
                                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Import Template *</Label>
                        <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select template..." />
                            </SelectTrigger>
                            <SelectContent>
                                {templates.map(tpl => (
                                    <SelectItem key={tpl.id} value={tpl.id}>
                                        {tpl.name}
                                        {tpl.bankName && ` (${tpl.bankName})`}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Statement Date *</Label>
                        <Input
                            type="date"
                            value={statementDate}
                            onChange={e => setStatementDate(e.target.value)}
                        />
                    </div>
                </div>

                {/* File Upload */}
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        className="hidden"
                        id="csv-upload"
                    />
                    {!csvContent ? (
                        <label htmlFor="csv-upload" className="cursor-pointer">
                            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-lg font-medium">Drop CSV file here or click to upload</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Supports standard bank statement CSV formats
                            </p>
                        </label>
                    ) : (
                        <div>
                            <FileText className="h-12 w-12 mx-auto mb-4 text-green-500" />
                            <p className="text-lg font-medium">{fileName}</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                {csvContent.split('\n').length - 1} lines detected
                            </p>
                            <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
                                Choose different file
                            </Button>
                        </div>
                    )}
                </div>

                {/* Preview */}
                {previewLines.length > 0 && (
                    <div className="space-y-2">
                        <Label>Preview (first 5 lines)</Label>
                        <div className="bg-muted p-4 rounded-lg overflow-x-auto">
                            <pre className="text-sm font-mono">
                                {previewLines.map((line, i) => (
                                    <div key={i} className="whitespace-pre">{line}</div>
                                ))}
                            </pre>
                        </div>
                    </div>
                )}

                {/* Import Button */}
                <div className="flex justify-end">
                    <Button
                        onClick={handleImport}
                        disabled={!selectedAccountId || !selectedTemplateId || !csvContent || importMutation.isPending}
                        size="lg"
                    >
                        {importMutation.isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Importing...
                            </>
                        ) : (
                            <>
                                <Upload className="h-4 w-4 mr-2" />
                                Import Statement
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>

            {/* Create Template Modal */}
            <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Create Import Template</DialogTitle>
                        <DialogDescription>
                            Define column mappings for your bank's CSV format
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateTemplate} className="space-y-4 max-h-[60vh] overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="tpl-name">Template Name *</Label>
                                <Input
                                    id="tpl-name"
                                    value={templateForm.name}
                                    onChange={e => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g., Stanbic Bank Format"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="tpl-bank">Bank Name</Label>
                                <Input
                                    id="tpl-bank"
                                    value={templateForm.bankName}
                                    onChange={e => setTemplateForm(prev => ({ ...prev, bankName: e.target.value }))}
                                    placeholder="e.g., Stanbic Bank"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="tpl-delimiter">Delimiter</Label>
                                <Select
                                    value={templateForm.delimiter}
                                    onValueChange={value => setTemplateForm(prev => ({ ...prev, delimiter: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value=",">Comma (,)</SelectItem>
                                        <SelectItem value=";">Semicolon (;)</SelectItem>
                                        <SelectItem value="\t">Tab</SelectItem>
                                        <SelectItem value="|">Pipe (|)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="tpl-skip">Skip Header Rows</Label>
                                <Input
                                    id="tpl-skip"
                                    type="number"
                                    min="0"
                                    value={templateForm.skipHeaderRows}
                                    onChange={e => setTemplateForm(prev => ({ ...prev, skipHeaderRows: parseInt(e.target.value) || 0 }))}
                                />
                            </div>
                        </div>

                        <div className="border-t pt-4">
                            <h4 className="font-medium mb-3">Column Mappings (0-indexed)</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="tpl-date-col">Date Column *</Label>
                                    <Input
                                        id="tpl-date-col"
                                        type="number"
                                        min="0"
                                        value={templateForm.dateColumn}
                                        onChange={e => setTemplateForm(prev => ({ ...prev, dateColumn: parseInt(e.target.value) || 0 }))}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="tpl-date-fmt">Date Format *</Label>
                                    <Select
                                        value={templateForm.dateFormat}
                                        onValueChange={value => setTemplateForm(prev => ({ ...prev, dateFormat: value }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                                            <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                                            <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                                            <SelectItem value="DD-MM-YYYY">DD-MM-YYYY</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-4">
                                <div className="space-y-2">
                                    <Label htmlFor="tpl-desc-col">Description Column *</Label>
                                    <Input
                                        id="tpl-desc-col"
                                        type="number"
                                        min="0"
                                        value={templateForm.descriptionColumn}
                                        onChange={e => setTemplateForm(prev => ({ ...prev, descriptionColumn: parseInt(e.target.value) || 0 }))}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="tpl-ref-col">Reference Column</Label>
                                    <Input
                                        id="tpl-ref-col"
                                        type="number"
                                        min="0"
                                        placeholder="Optional"
                                        value={templateForm.referenceColumn ?? ''}
                                        onChange={e => setTemplateForm(prev => ({
                                            ...prev,
                                            referenceColumn: e.target.value ? parseInt(e.target.value) : null
                                        }))}
                                    />
                                </div>
                            </div>

                            <div className="mt-4">
                                <Label className="mb-2 block">Amount Format</Label>
                                <Tabs value={amountFormatTab} onValueChange={setAmountFormatTab} className="w-full">
                                    <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="single">Single Amount Column</TabsTrigger>
                                        <TabsTrigger value="separate">Separate Debit/Credit</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="single" className="mt-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="tpl-amount-col">Amount Column</Label>
                                            <Input
                                                id="tpl-amount-col"
                                                type="number"
                                                min="0"
                                                value={templateForm.amountColumn ?? ''}
                                                onChange={e => setTemplateForm(prev => ({
                                                    ...prev,
                                                    amountColumn: e.target.value ? parseInt(e.target.value) : null,
                                                    debitColumn: null,
                                                    creditColumn: null
                                                }))}
                                            />
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="separate" className="mt-3">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="tpl-debit-col">Debit Column</Label>
                                                <Input
                                                    id="tpl-debit-col"
                                                    type="number"
                                                    min="0"
                                                    value={templateForm.debitColumn ?? ''}
                                                    onChange={e => setTemplateForm(prev => ({
                                                        ...prev,
                                                        debitColumn: e.target.value ? parseInt(e.target.value) : null,
                                                        amountColumn: null
                                                    }))}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="tpl-credit-col">Credit Column</Label>
                                                <Input
                                                    id="tpl-credit-col"
                                                    type="number"
                                                    min="0"
                                                    value={templateForm.creditColumn ?? ''}
                                                    onChange={e => setTemplateForm(prev => ({
                                                        ...prev,
                                                        creditColumn: e.target.value ? parseInt(e.target.value) : null,
                                                        amountColumn: null
                                                    }))}
                                                />
                                            </div>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsTemplateModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={createTemplateMutation.isPending}>
                                {createTemplateMutation.isPending ? 'Creating...' : 'Create Template'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
};
