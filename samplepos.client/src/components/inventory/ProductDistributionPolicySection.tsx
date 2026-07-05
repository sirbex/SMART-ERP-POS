import { MultistoreGate } from './MultistoreGate';
import { ProductDistributionPolicyPanel } from './ProductDistributionPolicyPanel';
import {
  useProductDistributionPolicy,
  useUpdateProductDistributionPolicy,
} from '../../hooks/useProductDistribution';
import type { UpdateProductDistributionPolicyDto } from '../../../../shared/types/productDistribution';
import toast from 'react-hot-toast';

interface ProductDistributionPolicySectionProps {
  productId: string;
  readOnly?: boolean;
}

export function ProductDistributionPolicySection({
  productId,
  readOnly = false,
}: ProductDistributionPolicySectionProps) {
  const { data: policy, isLoading } = useProductDistributionPolicy(productId, true);
  const update = useUpdateProductDistributionPolicy(productId);

  const handleSave = async (body: UpdateProductDistributionPolicyDto) => {
    try {
      await update.mutateAsync(body);
      toast.success('Distribution policy saved');
    } catch {
      toast.error('Failed to save distribution policy');
    }
  };

  return (
    <MultistoreGate>
      <ProductDistributionPolicyPanel
        productId={productId}
        policy={policy}
        isLoading={isLoading}
        isSaving={update.isPending}
        onSave={handleSave}
        readOnly={readOnly}
      />
    </MultistoreGate>
  );
}
