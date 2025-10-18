import React from "react";
import SettingsService from '../services/SettingsService';

const ReportsShadcn: React.FC = () => {
  const businessInfo = SettingsService.getInstance().getBusinessInfo();

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          {businessInfo.businessName || 'Sample POS'} - Reports & Analytics
        </h1>
      </div>
      
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Reports Dashboard</h2>
        <p className="text-gray-600">
          Coming soon - Comprehensive reporting and analytics functionality will be available here.
        </p>
      </div>
    </div>
  );
};

export default ReportsShadcn;