// Temporary UI component replacements for missing Shadcn components

import React from 'react';

// Basic Card replacement
export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-white border rounded-lg shadow ${className}`}>{children}</div>
);

export const CardHeader: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`px-6 py-4 border-b ${className}`}>{children}</div>
);

export const CardTitle: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <h3 className={`text-lg font-semibold ${className}`}>{children}</h3>
);

export const CardDescription: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <p className={`text-sm text-gray-600 ${className}`}>{children}</p>
);

export const CardContent: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`px-6 py-4 ${className}`}>{children}</div>
);

export const CardFooter: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`px-6 py-4 border-t ${className}`}>{children}</div>
);

// Basic Badge replacement  
export const Badge: React.FC<{ className?: string; variant?: string; children: React.ReactNode }> = ({
  className = '', children
}) => (
  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 ${className}`}>
    {children}
  </span>
);

// Basic Select replacement - simplified to work with HTML select
export const Select: React.FC<{
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  title?: string;
  id?: string;
  'aria-labelledby'?: string;
}> = ({ value, onValueChange, children, title = "Select option", id, ...rest }) => {
  // Extract only SelectItem children and ignore SelectTrigger/SelectValue
  const selectOptions = React.Children.toArray(children).find(child =>
    React.isValidElement(child) && child.type === SelectContent
  );

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
      aria-label={title}
      title={title}
      {...rest}
    >
      {selectOptions || children}
    </select>
  );
};

// These components are for API compatibility but don't render in the final HTML
export const SelectTrigger: React.FC<{ className?: string; children: React.ReactNode }> = () => null;
export const SelectValue: React.FC<{ placeholder?: string }> = () => null;
export const SelectContent: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
export const SelectItem: React.FC<{ value: string; children: React.ReactNode }> = ({ value, children }) => (
  <option value={value}>{children}</option>
);

// Basic Checkbox replacement 
export const Checkbox: React.FC<{
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}> = ({ id, checked, onCheckedChange, className = '' }) => (
  <input
    id={id}
    type="checkbox"
    checked={checked}
    onChange={(e) => onCheckedChange(e.target.checked)}
    className={`h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded ${className}`}
  />
);

// Basic Switch replacement
export const Switch: React.FC<{
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}> = ({ id, checked, onCheckedChange, className = '' }) => (
  <input
    id={id}
    type="checkbox"
    checked={checked}
    onChange={(e) => onCheckedChange(e.target.checked)}
    className={`h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded ${className}`}
  />
);

// Basic Textarea replacement
export const Textarea: React.FC<{
  id?: string;
  value?: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
}> = ({ id, value = '', onChange, placeholder, className = '', rows = 3 }) => (
  <textarea
    id={id}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    rows={rows}
    className={`block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-vertical ${className}`}
  />
);

// Dialog components
export const Dialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode
}> = ({ open, onOpenChange, children }) => (
  open ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => onOpenChange(false)}>
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full m-4" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  ) : null
);

export const DialogTrigger: React.FC<{ asChild?: boolean; children: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);

export const DialogContent: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '', children
}) => (
  <div className={`p-6 ${className}`}>{children}</div>
);

export const DialogHeader: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '', children
}) => (
  <div className={`mb-4 ${className}`}>{children}</div>
);

export const DialogTitle: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '', children
}) => (
  <h2 className={`text-lg font-semibold ${className}`}>{children}</h2>
);

export const DialogDescription: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '', children
}) => (
  <p className={`text-sm text-gray-600 mt-1 ${className}`}>{children}</p>
);

export const DialogFooter: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '', children
}) => (
  <div className={`mt-6 flex justify-end space-x-2 ${className}`}>{children}</div>
);

// Basic Button replacement
export const Button: React.FC<{
  onClick?: () => void | Promise<void>;
  variant?: 'default' | 'outline' | 'destructive';
  size?: string;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, variant = 'default', size, className = '', disabled, children }) => {
  const baseClasses = 'rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2';
  const sizeClasses = size === 'sm' ? 'px-3 py-1 text-sm' : 'px-4 py-2';
  const variantClasses = {
    default: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-blue-500',
    destructive: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${sizeClasses} ${variantClasses[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </button>
  );
};

// Basic Input replacement
export const Input: React.FC<{
  id?: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  step?: string;
  max?: number | string;
  min?: string;
}> = ({ id, type = 'text', value, onChange, placeholder, className = '', step, max, min }) => (
  <input
    id={id}
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    step={step}
    max={max}
    min={min}
    className={`block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${className}`}
  />
);

// Basic Label replacement
export const Label: React.FC<{
  htmlFor?: string;
  className?: string;
  children: React.ReactNode
}> = ({ htmlFor, className = '', children }) => (
  <label htmlFor={htmlFor} className={`block text-sm font-medium text-gray-700 ${className}`}>
    {children}
  </label>
);

// Basic Table components
export const Table: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <table className={`min-w-full divide-y divide-gray-200 ${className}`}>{children}</table>
);

export const TableHeader: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <thead className={`bg-gray-50 ${className}`}>{children}</thead>
);

export const TableBody: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <tbody className={`bg-white divide-y divide-gray-200 ${className}`}>{children}</tbody>
);

export const TableRow: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <tr className={`hover:bg-gray-50 ${className}`}>{children}</tr>
);

export const TableHead: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <th className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${className}`}>
    {children}
  </th>
);

export const TableCell: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${className}`}>{children}</td>
);

// Dropdown Menu components (simplified)
export const DropdownMenu: React.FC<{
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}> = ({ children }) => (
  <div className="relative inline-block text-left">{children}</div>
);

export const DropdownMenuTrigger: React.FC<{
  asChild?: boolean;
  children: React.ReactNode;
}> = ({ children }) => <>{children}</>;

export const DropdownMenuContent: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className = '', children }) => (
  <div className={`absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10 ${className}`}>
    <div className="py-1">
      {children}
    </div>
  </div>
);

export const DropdownMenuItem: React.FC<{
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}> = ({ className = '', onClick, children }) => (
  <button
    onClick={onClick}
    className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${className}`}
  >
    {children}
  </button>
);

// Basic Popover replacement
export const Popover: React.FC<{
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}> = ({ children }) => (
  <div className="relative inline-block">{children}</div>
);

export const PopoverTrigger: React.FC<{
  asChild?: boolean;
  children: React.ReactNode;
}> = ({ children }) => <>{children}</>;

export const PopoverContent: React.FC<{
  className?: string;
  align?: string;
  children: React.ReactNode;
}> = ({ className = '', children }) => (
  <div className={`absolute top-full left-0 mt-2 p-4 bg-white border border-gray-300 rounded-md shadow-lg z-10 ${className}`}>
    {children}
  </div>
);

// Basic Calendar replacement (simplified date input)
export const Calendar: React.FC<{
  mode?: string;
  selected?: Date;
  onSelect: (date: Date | undefined) => void;
  className?: string;
}> = ({ selected, onSelect, className = '' }) => (
  <input
    type="date"
    value={selected ? selected.toLocaleDateString('en-CA') : ''}
    onChange={(e) => onSelect(e.target.value ? new Date(e.target.value) : undefined)}
    className={`block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${className}`}
    aria-label="Select date"
  />
);

// Basic Tabs replacement
interface TabsContextType {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextType | undefined>(undefined);

export const Tabs: React.FC<{
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}> = ({ value, onValueChange, className = '', children }) => (
  <TabsContext.Provider value={{ value, onValueChange }}>
    <div className={`${className}`}>
      {children}
    </div>
  </TabsContext.Provider>
);

export const TabsList: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className = '', children }) => (
  <div className={`inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1 text-gray-500 ${className}`}>
    {children}
  </div>
);

export const TabsTrigger: React.FC<{
  value: string;
  className?: string;
  children: React.ReactNode;
}> = ({ value, className = '', children }) => {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error('TabsTrigger must be used within Tabs');

  const isActive = context.value === value;

  return (
    <button
      onClick={() => context.onValueChange(value)}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${isActive
        ? 'bg-white text-gray-950 shadow-sm'
        : 'hover:bg-gray-200 hover:text-gray-900'
        } ${className}`}
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
  const context = React.useContext(TabsContext);
  if (!context) throw new Error('TabsContent must be used within Tabs');

  if (context.value !== value) return null;

  return (
    <div className={`mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 ${className}`}>
      {children}
    </div>
  );
};
