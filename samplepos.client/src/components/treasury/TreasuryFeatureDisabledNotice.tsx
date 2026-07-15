/**
 * Operator-facing notice when Treasury Documents are off.
 * Avoids raw flag names / API paths in the UI.
 */
export function TreasuryFeatureDisabledNotice({
  featureLabel,
}: {
  featureLabel: string;
}) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">{featureLabel} is not enabled for this company.</p>
      <p className="mt-1 text-amber-800/90">
        An admin can turn it on under{' '}
        <span className="font-medium">Settings → Tax → Enable Treasury Documents</span>. Until then,
        existing cash register and banking workflows stay the same.
      </p>
    </div>
  );
}
