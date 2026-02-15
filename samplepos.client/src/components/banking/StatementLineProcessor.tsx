/**
 * STATEMENT LINE PROCESSOR
 * 
 * Component for processing a single statement line with pattern matching.
 * Shows pattern suggestions and allows learning new patterns.
 */

import React, { useState } from 'react';
import { Loader2, Sparkles, Plus, Check, X, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    useBankCategories,
    useFindMatchingPatterns,
    useLearnPattern,
    usePatternFeedback,
    StatementLine
} from '../../hooks/useBanking';

interface StatementLineProcessorProps {
    line: StatementLine;
    isProcessing: boolean;
    onProcess: (action: 'CREATE' | 'MATCH' | 'SKIP', categoryId?: string) => void;
}

export const StatementLineProcessor: React.FC<StatementLineProcessorProps> = ({
    line,
    isProcessing,
    onProcess
}) => {
    const [showLearnPattern, setShowLearnPattern] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const { data: categories = [] } = useBankCategories();
    const transactionType = parseFloat(String(line.amount)) >= 0 ? 'CREDIT' : 'DEBIT';
    const { data: matchingPatterns = [] } = useFindMatchingPatterns(line.description || '', transactionType);
    const learnPatternMutation = useLearnPattern();
    const patternFeedbackMutation = usePatternFeedback();

    // Get the top matching pattern
    const topPattern = matchingPatterns.length > 0 ? matchingPatterns[0] : null;

    // If we have a high-confidence pattern match, show it prominently
    const hasConfidentMatch = topPattern && topPattern.confidence >= 0.7;

    const handleAcceptPattern = () => {
        if (!topPattern?.categoryId) return;

        // Provide positive feedback to the pattern
        patternFeedbackMutation.mutate({ patternId: topPattern.id, wasCorrect: true });

        // Process with the suggested category
        onProcess('CREATE', topPattern.categoryId);
    };

    const handleRejectPattern = () => {
        if (!topPattern) return;

        // Provide negative feedback
        patternFeedbackMutation.mutate({ patternId: topPattern.id, wasCorrect: false });

        // Show category selector
        setSelectedCategory(null);
    };

    const handleManualCategory = (categoryId: string) => {
        setSelectedCategory(categoryId);
        onProcess('CREATE', categoryId);

        // Offer to learn this as a pattern
        setShowLearnPattern(true);
    };

    const handleLearnPattern = async () => {
        if (!selectedCategory) return;

        try {
            await learnPatternMutation.mutateAsync({
                descriptionPattern: line.description || '',
                categoryId: selectedCategory,
                transactionType
            });
            setShowLearnPattern(false);
        } catch {
            // Error handled by mutation
        }
    };

    if (isProcessing) {
        return (
            <div className="flex justify-end">
                <Loader2 className="h-4 w-4 animate-spin" />
            </div>
        );
    }

    // If already processed
    if (line.matchStatus !== 'UNMATCHED') {
        return null;
    }

    return (
        <div className="flex items-center justify-end gap-1">
            {/* Pattern Suggestion Section */}
            {hasConfidentMatch && (
                <div className="flex items-center gap-1">
                    <Badge
                        variant="outline"
                        className="gap-1 cursor-pointer hover:bg-accent"
                        onClick={handleAcceptPattern}
                        title={`Accept pattern suggestion (${Math.round(topPattern.confidence * 100)}% confidence)`}
                    >
                        <Sparkles className="h-3 w-3 text-yellow-500" />
                        {topPattern.categoryName}
                        <Check className="h-3 w-3 text-green-500" />
                    </Badge>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={handleRejectPattern}
                        title="Reject suggestion and choose manually"
                    >
                        <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                </div>
            )}

            {/* Low Confidence or Manual Selection */}
            {!hasConfidentMatch && (
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8">
                            <Plus className="h-3 w-3 mr-1" />
                            Categorize
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="end">
                        <div className="space-y-2">
                            {/* Show low-confidence suggestions if any */}
                            {matchingPatterns.length > 0 && (
                                <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground">Suggestions</p>
                                    {matchingPatterns.slice(0, 3).map(pattern => (
                                        <Button
                                            key={pattern.id}
                                            variant="ghost"
                                            size="sm"
                                            className="w-full justify-between"
                                            onClick={() => {
                                                patternFeedbackMutation.mutate({ patternId: pattern.id, wasCorrect: true });
                                                onProcess('CREATE', pattern.categoryId);
                                            }}
                                        >
                                            <span className="flex items-center gap-1">
                                                <Sparkles className="h-3 w-3 text-yellow-500" />
                                                {pattern.categoryName}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {Math.round(pattern.confidence * 100)}%
                                            </span>
                                        </Button>
                                    ))}
                                    <hr className="my-2" />
                                </div>
                            )}

                            {/* All categories */}
                            <p className="text-xs font-medium text-muted-foreground">All Categories</p>
                            <div className="max-h-48 overflow-y-auto space-y-1">
                                {categories.map(cat => (
                                    <Button
                                        key={cat.id}
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-start"
                                        onClick={() => handleManualCategory(cat.id)}
                                    >
                                        {cat.name}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            )}

            {/* Skip Button */}
            <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onProcess('SKIP')}
                title="Skip this line"
            >
                <X className="h-4 w-4" />
            </Button>

            {/* Learn Pattern Dialog (inline) */}
            {showLearnPattern && (
                <Popover open={showLearnPattern} onOpenChange={setShowLearnPattern}>
                    <PopoverTrigger asChild>
                        <span className="hidden" />
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="end">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <BookOpen className="h-4 w-4 text-blue-500" />
                                <h4 className="font-medium">Learn Pattern?</h4>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Remember this categorization for future transactions with similar descriptions?
                            </p>
                            <div className="text-xs bg-muted p-2 rounded font-mono">
                                "{line.description}"
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowLearnPattern(false)}
                                >
                                    No Thanks
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleLearnPattern}
                                    disabled={learnPatternMutation.isPending}
                                >
                                    {learnPatternMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        'Learn Pattern'
                                    )}
                                </Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
};

export default StatementLineProcessor;