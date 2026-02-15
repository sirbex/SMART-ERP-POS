// Table components for Banking module
import React from 'react';

export const Table: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
    <div className="overflow-x-auto">
        <table className={`min-w-full divide-y divide-gray-200 ${className}`}>{children}</table>
    </div>
);

export const TableHeader: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
    <thead className={`bg-gray-50 ${className}`}>{children}</thead>
);

export const TableBody: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
    <tbody className={`bg-white divide-y divide-gray-200 ${className}`}>{children}</tbody>
);

export const TableRow: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
    <tr className={className}>{children}</tr>
);

export const TableHead: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
    <th
        scope="col"
        className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${className}`}
    >
        {children}
    </th>
);

export const TableCell: React.FC<{ className?: string; title?: string; children: React.ReactNode }> = ({ className = '', title, children }) => (
    <td className={`px-4 py-3 text-sm ${className}`} title={title}>{children}</td>
);
