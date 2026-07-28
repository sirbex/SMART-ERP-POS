import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAdaptiveLayout } from './AdaptiveAppShell';

export type AdaptiveNavItem = {
  name: string;
  path: string;
  icon: string;
  color: string;
};

type AdaptiveNavFooterContext = {
  showLabels: boolean;
  persistentNav: boolean;
};

type AdaptiveNavigationProps = {
  brandName: string;
  items: AdaptiveNavItem[];
  isActive: (path: string) => boolean;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  userName?: string;
  userRole?: string;
  userInitial?: string;
  footer?: ReactNode | ((ctx: AdaptiveNavFooterContext) => ReactNode);
};

/**
 * Tier-driven side navigation:
 * - mobile: drawer overlay
 * - compact: icon rail (expandable labels)
 * - desktop/wide: expandable sidebar
 */
export function AdaptiveNavigation({
  brandName,
  items,
  isActive,
  expanded,
  onExpandedChange,
  userName,
  userRole,
  userInitial = 'U',
  footer,
}: AdaptiveNavigationProps) {
  const { isMobile, tokens } = useAdaptiveLayout();
  const persistentNav = !isMobile;
  const showLabels = expanded || isMobile;
  const footerNode =
    typeof footer === 'function'
      ? footer({ showLabels, persistentNav })
      : footer;

  return (
    <>
      <aside
        className={[
          'bg-white border-r border-gray-200 flex flex-col overflow-hidden',
          'transition-all duration-300 ease-in-out',
          isMobile ? 'absolute inset-y-0 left-0 z-30 shadow-lg' : 'static z-auto shadow-none',
          isMobile && !expanded ? '-translate-x-full' : 'translate-x-0',
        ].join(' ')}
        style={{
          width: expanded || isMobile
            ? 'var(--layout-sidebar-expanded)'
            : 'var(--layout-sidebar-rail)',
        }}
        data-nav-mode={tokens.navMode}
        aria-label="Primary"
      >
        <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">
            {showLabels ? brandName : brandName.slice(0, 2).toUpperCase()}
          </h1>
          {persistentNav && (
            <button
              type="button"
              onClick={() => onExpandedChange(!expanded)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors hidden md:flex min-h-[var(--layout-touch-target)] min-w-[var(--layout-touch-target)] items-center justify-center"
              aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {expanded ? '◀' : '▶'}
            </button>
          )}
          {isMobile && (
            <button
              type="button"
              onClick={() => onExpandedChange(false)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors min-h-[var(--layout-touch-target)] min-w-[var(--layout-touch-target)] flex items-center justify-center"
              aria-label="Close sidebar"
            >
              ✕
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {items.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center gap-3 px-3 rounded-lg transition-colors min-h-[var(--layout-touch-target)] ${
                    isActive(item.path)
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : 'text-gray-700 hover:bg-gray-100 font-semibold'
                  }`}
                  title={!showLabels && persistentNav ? item.name : undefined}
                  onClick={() => {
                    if (isMobile) onExpandedChange(false);
                  }}
                >
                  <span className={`text-xl flex-shrink-0 ${item.color}`}>{item.icon}</span>
                  {showLabels && <span className="text-sm whitespace-nowrap">{item.name}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-gray-200 p-4 flex-shrink-0">
          <div className={showLabels ? 'flex items-center gap-3' : 'flex flex-col items-center gap-2'}>
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0">
              {userInitial}
            </div>
            {showLabels && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
                <p className="text-xs text-gray-500 truncate">{userRole}</p>
              </div>
            )}
          </div>
          {footerNode}
        </div>
      </aside>

      {isMobile && expanded && (
        <div
          className="absolute inset-0 bg-black/50 z-20"
          onClick={() => onExpandedChange(false)}
          aria-hidden
        />
      )}
    </>
  );
}

type AdaptiveShellBarProps = {
  brandName: string;
  userInitial?: string;
  onMenuClick: () => void;
  trailing?: ReactNode;
};

/** Top shell bar — menu affordance on mobile + compact. */
export function AdaptiveShellBar({
  brandName,
  userInitial = 'U',
  onMenuClick,
  trailing,
}: AdaptiveShellBarProps) {
  const { isMobile, isCompact, isDesktopLike } = useAdaptiveLayout();

  return (
    <header className="h-12 flex-shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-40 shadow-sm">
      <div className="flex items-center gap-2">
        {(isMobile || isCompact) && (
          <button
            type="button"
            onClick={onMenuClick}
            className="p-2 rounded-lg hover:bg-gray-100 min-h-[var(--layout-touch-target)] min-w-[var(--layout-touch-target)] flex items-center justify-center"
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        {!isDesktopLike && (
          <h1 className="text-lg font-bold text-gray-900">{brandName}</h1>
        )}
      </div>
      <div className="flex items-center gap-3">
        {trailing}
        {!isDesktopLike && (
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
            {userInitial}
          </div>
        )}
      </div>
    </header>
  );
}

type AdaptiveBottomNavProps = {
  items: AdaptiveNavItem[];
  isActive: (path: string) => boolean;
  onOpenFullMenu: () => void;
};

/**
 * Mobile primary destinations + More (opens full drawer).
 * Only rendered on mobile tier.
 */
export function AdaptiveBottomNav({
  items,
  isActive,
  onOpenFullMenu,
}: AdaptiveBottomNavProps) {
  const { isMobile } = useAdaptiveLayout();
  if (!isMobile) return null;

  const primary = items.slice(0, 3);

  return (
    <nav
      className="adaptive-bottom-nav flex-shrink-0 bg-white border-t border-gray-200 flex items-stretch z-40"
      aria-label="Primary destinations"
    >
      {primary.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[var(--layout-touch-target)] text-[11px] font-semibold ${
            isActive(item.path) ? 'text-blue-700' : 'text-gray-600'
          }`}
        >
          <span className={`text-lg ${item.color}`}>{item.icon}</span>
          <span className="truncate max-w-[4.5rem]">{item.name.split(' ')[0]}</span>
        </Link>
      ))}
      <button
        type="button"
        onClick={onOpenFullMenu}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[var(--layout-touch-target)] text-[11px] font-semibold text-gray-600"
      >
        <span className="text-lg">☰</span>
        <span>More</span>
      </button>
    </nav>
  );
}
