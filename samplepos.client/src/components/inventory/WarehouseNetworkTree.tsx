import type { StoreLocation } from '../../../../shared/types/warehouseNetwork';
import type { WarehouseNetworkTreeNode } from './warehouseNetworkUtils';

const TYPE_ICON: Record<string, string> = {
  MAIN: '🏭',
  SELLING: '🏪',
  TRANSIT: '🚚',
  DAMAGE: '⚠️',
  EXPIRED: '⏳',
  RETURN: '↩️',
};

interface WarehouseNetworkTreeProps {
  nodes: WarehouseNetworkTreeNode[];
  selectedId: string | null;
  onSelect: (store: StoreLocation) => void;
  depth?: number;
}

function TreeBranch({
  node,
  selectedId,
  onSelect,
  depth,
}: {
  node: WarehouseNetworkTreeNode;
  selectedId: string | null;
  onSelect: (store: StoreLocation) => void;
  depth: number;
}) {
  const { store, children } = node;
  const isSelected = selectedId === store.id;
  const icon = TYPE_ICON[store.storeType] ?? '📍';

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(store)}
        className={`w-full text-left py-2 pr-3 rounded-md transition-colors flex items-start gap-2 ${
          isSelected ? 'bg-blue-100 text-blue-900 ring-1 ring-blue-300' : 'hover:bg-gray-50'
        }`}
        style={{ paddingLeft: depth * 16 + 12 }}
      >
        <span className="text-base shrink-0" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-sm truncate">{store.name}</span>
          <span className="block text-[11px] text-gray-500 font-mono">{store.code}</span>
        </span>
      </button>
      {children.length > 0 && (
        <div className="border-l border-gray-200 ml-5">
          {children.map((child) => (
            <TreeBranch
              key={child.store.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WarehouseNetworkTree({
  nodes,
  selectedId,
  onSelect,
  depth = 0,
}: WarehouseNetworkTreeProps) {
  if (nodes.length === 0) {
    return <p className="text-sm text-gray-500 p-4">No active stores in the network.</p>;
  }

  return (
    <div className="py-2" role="tree" aria-label="Warehouse network">
      {nodes.map((node) => (
        <TreeBranch
          key={node.store.id}
          node={node}
          selectedId={selectedId}
          onSelect={onSelect}
          depth={depth}
        />
      ))}
    </div>
  );
}
