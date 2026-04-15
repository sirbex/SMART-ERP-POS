import Layout from '../../components/Layout';
import QuickLoginSettings from './QuickLoginSettings';

export default function MyQuickLoginPage() {
    return (
        <Layout>
            <div className="max-w-2xl mx-auto py-6 px-4">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Quick Login Setup</h1>
                <p className="text-sm text-gray-600 mb-6">
                    Set up a PIN or biometric login for fast user switching at the POS terminal.
                </p>
                <QuickLoginSettings />
            </div>
        </Layout>
    );
}
