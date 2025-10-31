import { Card } from '@/components/ui/card';

export default function CashFlowReport() {
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-qb-gray-900 mb-4">Cash Flow Statement</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Track cash inflows and outflows across operating, investing, and financing activities
          </p>
          
          <div className="mt-8 p-8 border-2 border-dashed border-gray-300 rounded-lg">
            <p className="text-muted-foreground">
              Cash Flow reporting is coming soon. This will include:
            </p>
            <ul className="mt-4 text-left max-w-md mx-auto space-y-2 text-sm text-muted-foreground">
              <li>• Operating Activities (day-to-day operations)</li>
              <li>• Investing Activities (assets and investments)</li>
              <li>• Financing Activities (debt and equity)</li>
              <li>• Net change in cash position</li>
              <li>• Period-over-period comparisons</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
