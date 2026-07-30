/**
 * Shown while restaurant_mode_enabled is unknown — never mount retail POS during this gap.
 */
export function RestaurantModeBoot() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50" data-restaurant-mode-boot="true">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
    </div>
  );
}
