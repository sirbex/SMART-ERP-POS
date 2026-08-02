import { ReactNode, useEffect, useMemo, useState } from 'react';

import { useNavigate, useLocation, Navigate } from 'react-router-dom';

import Layout from './Layout';

import { useOfflineContext } from '../contexts/OfflineContext';

import { useMultistoreEnabled } from '../hooks/useMultistore';

import { useAuth } from '../hooks/useAuth';

import { useNavOverflow } from '../hooks/useNavOverflow';

import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

import {
  isCashierAllowedPath,
  isCashierLockdownActive,
  resolveCashierHomePath,
} from '../utils/cashierLockdown';

import { useRestaurantModeForRouting } from '../hooks/useRestaurantEnabled';
import { RestaurantModeBoot } from './auth/RestaurantModeBoot';

import {

  INVENTORY_MORE_NAV,

  INVENTORY_PRIMARY_NAV,

  groupInventoryMoreNav,

  filterInventoryNavByPermissions,

  isInventoryMoreNavActive,

  isInventoryNavActive,

  type InventoryNavItem,

} from './inventory/inventoryNavConfig';



interface InventoryLayoutProps {

  children: ReactNode;

}



function renderNavTabButton(
  tab: InventoryNavItem,
  isActive: boolean,
  onNavigate: (path: string) => void,
  measureOnly = false,
) {
  return (
    <button
      key={tab.id}
      type="button"
      {...(measureOnly ? { 'data-nav-tab': '' } : {})}
      onClick={measureOnly ? undefined : () => onNavigate(tab.path)}
      tabIndex={measureOnly ? -1 : 0}
      aria-hidden={measureOnly || undefined}
      className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
        isActive
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      <span>{tab.icon}</span>
      <span>{tab.label}</span>
    </button>
  );
}



export default function InventoryLayout({ children }: InventoryLayoutProps) {

  const navigate = useNavigate();

  const location = useLocation();

  const { isOnline } = useOfflineContext();

  const { user, permissions } = useAuth();

  const { restaurantEnabled, isReady } = useRestaurantModeForRouting();

  const { isMultistoreEnabled } = useMultistoreEnabled();

  const [moreOpen, setMoreOpen] = useState(false);



  const primaryTabs = useMemo(
    () =>
      filterInventoryNavByPermissions(
        INVENTORY_PRIMARY_NAV.filter((tab) => !tab.multistoreOnly || isMultistoreEnabled),
        permissions,
        user?.role,
      ),
    [isMultistoreEnabled, permissions, user?.role],
  );

  const staticMoreTabs = useMemo(
    () =>
      filterInventoryNavByPermissions(
        INVENTORY_MORE_NAV.filter((tab) => !tab.multistoreOnly || isMultistoreEnabled),
        permissions,
        user?.role,
      ),
    [isMultistoreEnabled, permissions, user?.role],
  );

  const activePrimaryIndex = useMemo(
    () => primaryTabs.findIndex((tab) => isInventoryNavActive(location.pathname, tab.path)),
    [primaryTabs, location.pathname],
  );

  const { containerRef, measureRef, moreButtonRef, visibleCount } = useNavOverflow({
    itemCount: primaryTabs.length,
    activeIndex: activePrimaryIndex,
    hasStaticMoreItems: staticMoreTabs.length > 0,
  });

  const visiblePrimaryTabs = primaryTabs.slice(0, visibleCount);
  const overflowPrimaryTabs = primaryTabs.slice(visibleCount);

  const allMoreTabs = useMemo(
    () => [...overflowPrimaryTabs, ...staticMoreTabs],
    [overflowPrimaryTabs, staticMoreTabs],
  );

  const moreSections = useMemo(() => {
    const sections = groupInventoryMoreNav(staticMoreTabs);
    if (overflowPrimaryTabs.length === 0) return sections;

    return [
      {
        group: 'operations' as const,
        label: 'Navigation',
        items: overflowPrimaryTabs,
      },
      ...sections,
    ];
  }, [overflowPrimaryTabs, staticMoreTabs]);



  const activeMoreTab = useMemo(

    () => allMoreTabs.find((tab) => {
      if (overflowPrimaryTabs.includes(tab)) {
        return isInventoryNavActive(location.pathname, tab.path);
      }
      return isInventoryMoreNavActive(location.pathname, tab);
    }),

    [allMoreTabs, overflowPrimaryTabs, location.pathname],

  );



  const moreActive = !!activeMoreTab;

  const showMoreButton = allMoreTabs.length > 0;



  useEffect(() => {

    setMoreOpen(false);

  }, [location.pathname]);



  // Default cashier lockdown still uses CashierPathGuard; only bounce when path not allowed.
  // Elevated Cashier (extra RBAC ticks) uses normal inventory layout + permission filters.
  if (isCashierLockdownActive({ role: user?.role, permissions })) {
    if (!isReady) {
      return <RestaurantModeBoot />;
    }
    if (
      !isCashierAllowedPath(location.pathname, {
        restaurantEnabled,
        permissions,
      })
    ) {
      return <Navigate to={resolveCashierHomePath(restaurantEnabled)} replace />;
    }
  }



  return (

    <Layout>

      <div className="h-full flex flex-col">

        <div className="bg-white border-b border-gray-200 px-6 py-4">

          <div className="flex items-center gap-3 mb-4">

            <div className="text-3xl">📦</div>

            <div>

              <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>

              <p className="text-sm text-gray-600">Products, stock, receipts, and warehouse network</p>

            </div>

            {!isOnline && (

              <span className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">

                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />

                Offline Mode

              </span>

            )}

          </div>



          <div ref={containerRef} className="relative flex gap-2 items-center pb-0.5">

            {visiblePrimaryTabs.map((tab) =>
              renderNavTabButton(
                tab,
                isInventoryNavActive(location.pathname, tab.path),
                navigate,
              ),
            )}



            {showMoreButton && (

              <Popover open={moreOpen} onOpenChange={setMoreOpen}>

                <PopoverTrigger asChild>

                  <button

                    ref={moreButtonRef}

                    type="button"

                    aria-expanded={moreOpen}

                    aria-haspopup="menu"

                    className={`shrink-0 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-2 max-w-[220px] ${

                      moreActive || moreOpen

                        ? 'bg-slate-700 text-white'

                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'

                    }`}

                  >

                    {activeMoreTab ? (

                      <>

                        <span>{activeMoreTab.icon}</span>

                        <span className="truncate">{activeMoreTab.label}</span>

                        <span className="opacity-80">▾</span>

                      </>

                    ) : (

                      <>

                        <span>More</span>

                        <span className="opacity-70">▾</span>

                      </>

                    )}

                  </button>

                </PopoverTrigger>

                <PopoverContent
                  align="end"
                  side="bottom"
                  collisionPadding={12}
                  className="w-[min(100vw-3rem,320px)] p-0 max-h-[min(70vh,420px)] overflow-y-auto"
                >

                  <div className="px-4 py-2 border-b border-gray-100">

                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">

                      More tools

                    </p>

                    <p className="text-xs text-gray-400 mt-0.5">

                      {overflowPrimaryTabs.length > 0
                        ? 'Additional pages and inventory tools'
                        : 'Master data, procurement, batches, audit trail, and reports'}

                    </p>

                  </div>



                  {moreSections.map((section) => (

                    <div key={section.group} className="py-1">

                      <div className="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">

                        {section.label}

                      </div>

                      {section.items.map((tab) => {

                        const isOverflowPrimary = overflowPrimaryTabs.some((t) => t.id === tab.id);

                        const isActive = isOverflowPrimary
                          ? isInventoryNavActive(location.pathname, tab.path)
                          : isInventoryMoreNavActive(location.pathname, tab);

                        return (

                          <button

                            key={tab.id}

                            type="button"

                            role="menuitem"

                            onClick={() => {

                              setMoreOpen(false);

                              navigate(tab.path);

                            }}

                            className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 flex gap-3 ${

                              isActive ? 'bg-blue-50' : ''

                            }`}

                          >

                            <span className="text-lg leading-none mt-0.5 shrink-0">{tab.icon}</span>

                            <span className="min-w-0">

                              <span

                                className={`block text-sm ${

                                  isActive ? 'text-blue-800 font-semibold' : 'text-gray-900 font-medium'

                                }`}

                              >

                                {tab.label}

                              </span>

                              {tab.description && (

                                <span className="block text-xs text-gray-500 mt-0.5 leading-snug">

                                  {tab.description}

                                </span>

                              )}

                            </span>

                          </button>

                        );

                      })}

                    </div>

                  ))}

                </PopoverContent>

              </Popover>

            )}



            <div
              ref={measureRef}
              aria-hidden
              className="pointer-events-none fixed -left-[9999px] top-0 flex gap-2 opacity-0"
            >
              {primaryTabs.map((tab) =>
                renderNavTabButton(tab, false, navigate, true),
              )}
            </div>

          </div>

        </div>



        <div className="flex-1 overflow-auto">{children}</div>

      </div>

    </Layout>

  );

}

