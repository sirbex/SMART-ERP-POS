import React from "react";
import SettingsService from '../services/SettingsService';

const ReportsShadcn: React.FC = () => {
  const businessInfo = SettingsService.getInstance().getBusinessInfo();

  return (
    <div className="w-full h-full p-4 md:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">
          {businessInfo.businessName || 'Sample POS'} - Reports & Analytics
        </h1>
      </div>
      
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold mb-4">Reports Dashboard</h2>
        <p className="text-sm sm:text-base text-gray-600">
          Coming soon - Comprehensive reporting and analytics functionality will be available here.
        </p>
      </div>
    </div>
  );
};

export default ReportsShadcn;