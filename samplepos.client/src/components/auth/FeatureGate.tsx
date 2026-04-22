import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import { useTenant } from '../../contexts/TenantContext';
import { PLAN_LIMITS } from '../../types/plans';

interface FeatureGateProps {
    feature: string;
    children: React.ReactNode;
}

/**
 * Blocks access to a route if the tenant's plan does not include the feature.
 * Shows an upgrade prompt instead of the page content.
 */
export function FeatureGate({ feature, children }: FeatureGateProps) {
    const hasAccess = useFeatureAccess(feature);
    const { config, loading } = useTenant();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
        );
    }

    if (hasAccess) {
        return <>{children}</>;
    }

    const currentPlan = config.plan || 'FREE';
    const requiredPlan = getMinimumPlan(feature);

    return (
        <div className="flex items-center justify-center min-h-[60vh] bg-gray-50 p-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg border p-8 text-center">
                <div className="text-5xl mb-4">🔒</div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    Module Not Available
                </h1>
                <p className="text-gray-600 mb-6">
                    <span className="font-semibold capitalize">{feature.replace(/_/g, ' ')}</span>{' '}
                    is not included in your current <span className="font-semibold uppercase">{currentPlan}</span> plan.
                </p>
                {requiredPlan && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                        <p className="text-sm text-blue-800">
                            Upgrade to <span className="font-bold uppercase">{requiredPlan}</span> or higher to unlock this module.
                        </p>
                    </div>
                )}
                <button
                    onClick={() => window.history.back()}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                    Go Back
                </button>
            </div>
        </div>
    );
}

function getMinimumPlan(feature: string): string | null {
    const order: Array<keyof typeof PLAN_LIMITS> = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
    for (const plan of order) {
        if ((PLAN_LIMITS[plan].features as readonly string[]).includes(feature)) {
            return plan;
        }
    }
    return null;
}
