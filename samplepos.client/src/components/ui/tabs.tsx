// Tabs components for Banking module
import React, { createContext, useContext } from 'react';

interface TabsContextType {
    value: string;
    onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

export const Tabs: React.FC<{
    value: string;
    onValueChange: (value: string) => void;
    className?: string;
    children: React.ReactNode;
}> = ({ value, onValueChange, className = '', children }) => (
    <TabsContext.Provider value={{ value, onValueChange }}>
        <div className={className}>{children}</div>
    </TabsContext.Provider>
);

export const TabsList: React.FC<{
    className?: string;
    children: React.ReactNode;
    'aria-label'?: string;
}> = ({ className = '', children, 'aria-label': ariaLabel = 'Tabs' }) => (
    <div
        className={`inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground ${className}`}
        role="tablist"
        aria-label={ariaLabel}
    >
        {children}
    </div>
);

export const TabsTrigger: React.FC<{
    value: string;
    className?: string;
    children: React.ReactNode;
}> = ({ value, className = '', children }) => {
    const context = useContext(TabsContext);
    if (!context) throw new Error('TabsTrigger must be used within Tabs');

    const isActive = context.value === value;

    return (
        <button
            type="button"
            role="tab"
            aria-selected={isActive ? 'true' : 'false'}
            onClick={() => context.onValueChange(value)}
            className={`
        inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5
        text-sm font-medium ring-offset-background transition-all
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
        disabled:pointer-events-none disabled:opacity-50
        ${isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'hover:bg-background/50 hover:text-foreground'
                }
        ${className}
      `}
        >
            {children}
        </button>
    );
};

export const TabsContent: React.FC<{
    value: string;
    className?: string;
    children: React.ReactNode;
}> = ({ value, className = '', children }) => {
    const context = useContext(TabsContext);
    if (!context) throw new Error('TabsContent must be used within Tabs');

    if (context.value !== value) return null;

    return (
        <div
            role="tabpanel"
            className={`mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
        >
            {children}
        </div>
    );
};
