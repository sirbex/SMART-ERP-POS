/**
 * When restaurant mode is on, the tenant is FOH/restaurant — retail POS is not the selling surface.
 */

export function shouldHideRetailPos(restaurantEnabled: boolean | null | undefined): boolean {
  return !!restaurantEnabled;
}
