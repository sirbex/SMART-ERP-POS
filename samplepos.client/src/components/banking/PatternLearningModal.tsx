/**
 * PATTERN LEARNING MODAL
 * 
 * Modal for learning transaction patterns from bank statement lines.
 * Allows users to create rules for automatic categorization.
 */

import React, { useState, useEffect } from 'react';
import { Brain, Check, X, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    useLearnPattern,
    useFindMatchingPatterns,
    usePatternFeedback,
    useBankCategories,
    BankPattern,
} from '../../hooks/useBanking';
import { useSubmitOnEnter } from '../../hooks/useSubmitOnEnter';

interface PatternLearningModalProps {
    isOpen: boolean;
    onClose: () => void;
    description: string;
    amount: number;
    transactionType: 'CREDIT' | 'DEBIT';
    onPatternApplied?: (categoryId: string) => void;
}

export const PatternLearningModal: React.FC<PatternLearningModalProps> = ({
    isOpen,
    onClose,
    description,
    amount,
    transactionType,
    onPatternApplied,
}) => {
    const [patternText, setPatternText] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState('');
    const [notes, setNotes] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);

    const { data: categories = [] } = useBankCategories();
    const { data: matchingPatterns = [] } = useFindMatchingPatterns(description, transactionType);
    const learnMutation = useLearnPattern();
    const feedbackMutation = usePatternFeedback();

    // Extract pattern from description
    useEffect(() => {
        if (description) {
            // Simple pattern extraction - take first meaningful words
            const words = description.split(/\s+/).slice(0, 3).join(' ');
            setPatternText(words.toUpperCase());
        }
    }, [description]);

    if (!isOpen) return null;

    const handleApplyPattern = (pattern: BankPattern) => {
        if (pattern.categoryId && onPatternApplied) {
            onPatternApplied(pattern.categoryId);
        }
        // Positive feedback
        feedbackMutation.mutate({ patternId: pattern.id, wasCorrect: true });
        onClose();
    };

    const handleRejectPattern = (pattern: BankPattern) => {
        // Negative feedback
        feedbackMutation.mutate({ patternId: pattern.id, wasCorrect: false });
    };

    const handleCreatePattern = async () => {
        if (!patternText || !selectedCategoryId) return;

        try {
            await learnMutation.mutateAsync({
                descriptionPattern: patternText,
                categoryId: selectedCategoryId,
                transactionType,
                notes,
            });

            if (onPatternApplied) {
                onPatternApplied(selectedCategoryId);
            }
            onClose();
        } catch (error) {
            console.error('Failed to create pattern:', error);
        }
    };

    const filteredCategories = categories.filter(
        cat => cat.direction === (transactionType === 'CREDIT' ? 'IN' : 'OUT')
    );

    useSubmitOnEnter(
        isOpen,
        !learnMutation.isPending && !!patternText && !!selectedCategoryId,
        handleCreatePattern
    );

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        <h2 className="text-lg font-semibold">Pattern Learning</h2>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Transaction Info */}
                    <div className="bg-muted p-3 rounded-md">
                        <div className="text-sm text-muted-foreground">Transaction Description:</div>
                        <div className="font-medium">{description}</div>
                        <div className="flex gap-2 mt-2">
                            <Badge variant={transactionType === 'CREDIT' ? 'default' : 'secondary'}>
                                {transactionType}
                            </Badge>
                            <Badge variant="outline">{amount.toFixed(2)}</Badge>
                        </div>
                    </div>

                    {/* Matching Patterns */}
                    {matchingPatterns.length > 0 && !showCreateForm && (
                        <div className="space-y-2">
                            <h3 className="font-medium">Suggested Patterns</h3>
                            <p className="text-sm text-muted-foreground">
                                These patterns match your transaction description
                            </p>
                            {matchingPatterns.map((pattern) => (
                                <div
                                    key={pattern.id}
                                    className="flex items-center justify-between p-3 border rounded-md"
                                >
                                    <div>
                                        <div className="font-medium">{pattern.categoryName || 'Uncategorized'}</div>
                                        <div className="text-sm text-muted-foreground">
                                            Pattern: {pattern.name || pattern.matchRules?.descriptionContains?.[0] || 'Unknown'}
                                        </div>
                                        <div className="flex gap-2 mt-1">
                                            <Badge variant="outline" className="text-xs">
                                                {pattern.confidence}% confidence
                                            </Badge>
                                            <Badge variant="outline" className="text-xs">
                                                {pattern.timesUsed} matches
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleRejectPattern(pattern)}
                                            title="Not a match"
                                        >
                                            <ThumbsDown className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => handleApplyPattern(pattern)}
                                            title="Apply this pattern"
                                        >
                                            <ThumbsUp className="h-4 w-4 mr-1" />
                                            Apply
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => setShowCreateForm(true)}
                            >
                                Create New Pattern Instead
                            </Button>
                        </div>
                    )}

                    {/* Create New Pattern */}
                    {(matchingPatterns.length === 0 || showCreateForm) && (
                        <div className="space-y-4">
                            <h3 className="font-medium">Create New Pattern</h3>
                            <p className="text-sm text-muted-foreground">
                                Teach the system to recognize similar transactions
                            </p>

                            <div className="space-y-2">
                                <Label htmlFor="patternText">Pattern Text</Label>
                                <Input
                                    id="patternText"
                                    value={patternText}
                                    onChange={(e) => setPatternText(e.target.value)}
                                    placeholder="e.g., AMAZON PAYMENT"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Transactions containing this text will match this pattern
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="category">Category</Label>
                                <select
                                    id="category"
                                    aria-label="Category"
                                    className="w-full h-10 px-3 border rounded-md bg-background"
                                    value={selectedCategoryId}
                                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                                >
                                    <option value="">Select category...</option>
                                    {filteredCategories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name} ({cat.code})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="notes">Notes (Optional)</Label>
                                <Input
                                    id="notes"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="e.g., Online shopping expenses"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 p-4 border-t">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    {(matchingPatterns.length === 0 || showCreateForm) && (
                        <Button
                            onClick={handleCreatePattern}
                            disabled={!patternText || !selectedCategoryId || learnMutation.isPending}
                        >
                            <Check className="h-4 w-4 mr-2" />
                            Create Pattern
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PatternLearningModal;
