import { Card } from '@/components/ui/card';

export default function ComparativeReports() {
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-qb-gray-900 mb-4">Comparative Financial Reports</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Compare financial performance across different time periods
          </p>
          
          <div className="mt-8 p-8 border-2 border-dashed border-gray-300 rounded-lg">
            <p className="text-muted-foreground">
              Comparative reporting is coming soon. This will include:
            </p>
            <ul className="mt-4 text-left max-w-md mx-auto space-y-2 text-sm text-muted-foreground">
              <li>• Year-over-Year (YoY) comparisons</li>
              <li>• Month-over-Month (MoM) comparisons</li>
              <li>• Quarter-over-Quarter (QoQ) comparisons</li>
              <li>• Variance analysis with percentages</li>
              <li>• Trend visualizations</li>
              <li>• Side-by-side period comparisons</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
