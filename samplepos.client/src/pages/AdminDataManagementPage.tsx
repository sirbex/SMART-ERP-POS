import Layout from '../components/Layout';
import DataManagementTab from './settings/tabs/DataManagementTab';
import { Database } from 'lucide-react';

export default function AdminDataManagementPage() {
  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <Database className="w-8 h-8 text-blue-600" />
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Data Management</h2>
              <p className="text-gray-600 mt-1">Backup, restore, and manage system data</p>
            </div>
          </div>
        </div>

        <DataManagementTab />
      </div>
    </Layout>
  );
}
