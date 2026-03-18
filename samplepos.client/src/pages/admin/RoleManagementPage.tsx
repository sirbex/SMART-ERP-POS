/**
 * Role Management Page
 * Admin page for managing RBAC roles and their permissions
 */

import { useState, useMemo, useEffect } from 'react';
import Layout from '../../components/Layout';
import {
  useRoles,
  useRole,
  usePermissions,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
} from '../../hooks/useRbac';
import type { Role, Permission } from '../../types/rbac';
import toast from 'react-hot-toast';

export default function RoleManagementPage() {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPermissions, setFormPermissions] = useState<Set<string>>(new Set());

  // Queries
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: roleDetails, isLoading: roleDetailsLoading } = useRole(selectedRoleId);
  const { data: permissions, isLoading: permissionsLoading, error: permissionsError } = usePermissions();

  // Mutations
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  // Derive a human-readable label from a permission key.
  // For most modules the action alone is unique (e.g. sales.read → "read").
  // For the system module, sub-resources produce duplicates, so we show
  // "users: read", "roles: create", etc.
  const permissionLabel = (perm: Permission): string => {
    const parts = perm.key.split('.');
    const actionPart = parts[1] || perm.action; // e.g. "users_read"
    if (perm.module === 'system' && actionPart.includes('_')) {
      const [sub, act] = actionPart.split('_');
      return `${sub}: ${act}`;
    }
    return perm.action;
  };

  // Group permissions by module
  const groupedPermissions = useMemo(() => {
    if (!permissions) return {};
    const grouped: Record<string, Permission[]> = {};
    for (const perm of permissions) {
      if (!grouped[perm.module]) grouped[perm.module] = [];
      grouped[perm.module].push(perm);
    }
    return grouped;
  }, [permissions]);

  // Handle create
  const handleOpenCreate = () => {
    setFormName('');
    setFormDescription('');
    setFormPermissions(new Set());
    setShowCreateModal(true);
  };

  const handleCreate = async () => {
    if (!formName.trim()) {
      toast.error('Role name is required');
      return;
    }

    if (formPermissions.size === 0) {
      toast.error('At least one permission is required');
      return;
    }

    try {
      await createRole.mutateAsync({
        name: formName.trim(),
        description: formDescription.trim(),
        permissionKeys: Array.from(formPermissions),
      });
      setShowCreateModal(false);
    } catch (error) {
      // Error handled by hook
    }
  };

  // Handle edit
  const handleOpenEdit = (role: Role) => {
    setFormPermissions(new Set()); // Clear first
    setSelectedRoleId(role.id);
    setFormName(role.name);
    setFormDescription(role.description);
    setShowEditModal(true);
  };

  // Effect: populate permissions when roleDetails loads
  useEffect(() => {
    if (roleDetails?.permissions && showEditModal && selectedRoleId) {
      console.log('Setting permissions from roleDetails:', roleDetails.permissions);
      setFormPermissions(new Set(roleDetails.permissions));
    }
  }, [roleDetails?.permissions, showEditModal, selectedRoleId]);

  const handleUpdate = async () => {
    if (!selectedRoleId) return;

    if (!formName.trim()) {
      toast.error('Role name is required');
      return;
    }

    try {
      await updateRole.mutateAsync({
        roleId: selectedRoleId,
        input: {
          name: formName.trim(),
          description: formDescription.trim(),
          permissionKeys: Array.from(formPermissions),
        },
      });
      setShowEditModal(false);
      setSelectedRoleId(null);
    } catch (error) {
      // Error handled by hook
    }
  };

  // Handle delete
  const handleOpenDelete = (role: Role) => {
    setSelectedRoleId(role.id);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!selectedRoleId) return;

    try {
      await deleteRole.mutateAsync(selectedRoleId);
      setShowDeleteConfirm(false);
      setSelectedRoleId(null);
    } catch (error) {
      // Error handled by hook
    }
  };

  // Toggle permission
  const togglePermission = (permKey: string) => {
    setFormPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permKey)) {
        next.delete(permKey);
      } else {
        next.add(permKey);
      }
      return next;
    });
  };

  // Toggle all permissions in a module
  const toggleModule = (module: string) => {
    const modulePerms = groupedPermissions[module] || [];
    const moduleKeys = modulePerms.map((p) => p.key);
    const allSelected = moduleKeys.every((k) => formPermissions.has(k));

    setFormPermissions((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        moduleKeys.forEach((k) => next.delete(k));
      } else {
        moduleKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const selectedRole = useMemo(() => {
    return roles?.find((r) => r.id === selectedRoleId) || null;
  }, [roles, selectedRoleId]);

  if (rolesLoading || permissionsLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading roles and permissions...</span>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Role Management</h1>
            <p className="text-gray-600 mt-1">
              Manage roles and their permission assignments
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <span>+</span> Create Role
          </button>
        </div>

        {/* Roles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles?.map((role) => (
            <div
              key={role.id}
              className={`bg-white rounded-lg shadow p-4 border-l-4 ${role.isSystemRole ? 'border-yellow-500' : 'border-blue-500'
                }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{role.name}</h3>
                  {role.isSystemRole && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                      System Role
                    </span>
                  )}
                </div>
                <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {role.permissionCount} perms
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-2 line-clamp-2">{role.description}</p>
              <div className="mt-4 flex gap-2">
                {!role.isSystemRole && (
                  <>
                    <button
                      onClick={() => handleOpenEdit(role)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleOpenDelete(role)}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleOpenEdit(role)}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  View Permissions
                </button>
              </div>
            </div>
          ))}
        </div>

        {roles?.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No roles found. Create one to get started.
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {showCreateModal ? 'Create Role' : `Edit Role: ${selectedRole?.name}`}
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedRoleId(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {/* Name & Description */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role Name *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    disabled={selectedRole?.isSystemRole}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    placeholder="e.g., Sales Manager"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    disabled={selectedRole?.isSystemRole}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    placeholder="Describe the role's purpose"
                  />
                </div>
              </div>

              {/* Permissions */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">
                    Permissions ({formPermissions.size} selected)
                  </label>
                  {permissionsError && (
                    <span className="text-red-500 text-sm">Failed to load permissions</span>
                  )}
                </div>

                {permissionsLoading ? (
                  <div className="text-center py-8 text-gray-500">Loading permissions catalog...</div>
                ) : roleDetailsLoading && showEditModal ? (
                  <div className="text-center py-8 text-gray-500">Loading role permissions...</div>
                ) : Object.keys(groupedPermissions).length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No permissions available. Check console for errors.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(groupedPermissions)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([module, perms]) => {
                        const moduleKeys = perms.map((p) => p.key);
                        const selectedCount = moduleKeys.filter((k) =>
                          formPermissions.has(k)
                        ).length;
                        const allSelected = selectedCount === moduleKeys.length;

                        return (
                          <div
                            key={module}
                            className="bg-gray-50 rounded-lg p-3 border border-gray-200"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={allSelected}
                                  onChange={() => toggleModule(module)}
                                  disabled={selectedRole?.isSystemRole}
                                  className="rounded text-blue-600 focus:ring-blue-500"
                                />
                                <span className="font-medium text-gray-900 capitalize">
                                  {module}
                                </span>
                              </label>
                              <span className="text-xs text-gray-500">
                                {selectedCount}/{perms.length}
                              </span>
                            </div>
                            <div className="space-y-1 ml-6">
                              {perms.map((perm) => (
                                <label
                                  key={perm.key}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={formPermissions.has(perm.key)}
                                    onChange={() => togglePermission(perm.key)}
                                    disabled={selectedRole?.isSystemRole}
                                    className="rounded text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-gray-700" title={perm.description}>
                                    {permissionLabel(perm)}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedRoleId(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              {!selectedRole?.isSystemRole && (
                <button
                  onClick={showCreateModal ? handleCreate : handleUpdate}
                  disabled={createRole.isPending || updateRole.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {createRole.isPending || updateRole.isPending
                    ? 'Saving...'
                    : showCreateModal
                      ? 'Create Role'
                      : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Delete Role</h2>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete the role "{selectedRole.name}"? This action cannot
              be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setSelectedRoleId(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteRole.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleteRole.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
