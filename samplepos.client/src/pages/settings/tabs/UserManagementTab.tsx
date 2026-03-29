import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Key, RefreshCw, Shield } from 'lucide-react';
import { api } from '../../../services/api';
import { handleApiError } from '../../../utils/errorHandler';

// Utility function to format dates without timezone conversion
const formatDisplayDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';
  // If it's an ISO string with time, extract just the date part
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }
  // Otherwise return as-is (already in YYYY-MM-DD format)
  return dateString;
};

interface User {
  id: string;
  userNumber: string; // Human-readable ID (e.g., USR-0001)
  email: string;
  fullName: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// RBAC Types
interface RbacRole {
  id: string;
  name: string;
  description: string;
  isSystemRole: boolean;
  createdAt: string;
}

interface UserRoleAssignment {
  roleId: string;
  roleName: string;
  assignedAt: string;
  assignedBy: string;
}

interface UserStats {
  total: number;
  active: number;
  inactive: number;
  byRole: {
    ADMIN: number;
    MANAGER: number;
    CASHIER: number;
    STAFF: number;
  };
}

interface CreateUserData {
  email: string;
  password: string;
  fullName: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';
}

interface UpdateUserData {
  email?: string;
  fullName?: string;
  role?: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';
  isActive?: boolean;
}

interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function UserManagementTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRolesModalOpen, setIsRolesModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
    fetchStats();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: result } = await api.get('/users');
      if (result.success) {
        setUsers(result.data);
      } else {
        setError(result.error || 'Failed to fetch users');
      }
    } catch (err) {
      setError('Network error. Please check your connection.');
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data: result } = await api.get('/users/stats');
      if (result.success) {
        setStats(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleCreateUser = async (data: CreateUserData) => {
    try {
      const { data: result } = await api.post('/users', data);
      if (result.success) {
        setIsCreateModalOpen(false);
        fetchUsers();
        fetchStats();
      } else {
        handleApiError(new Error(result.error || 'Failed to create user'));
      }
    } catch (err) {
      handleApiError(err, { fallback: 'Failed to create user' });
    }
  };

  const handleUpdateUser = async (userId: string, data: UpdateUserData) => {
    try {
      const { data: result } = await api.put(`/users/${userId}`, data);
      if (result.success) {
        setIsEditModalOpen(false);
        setSelectedUser(null);
        fetchUsers();
        fetchStats();
      } else {
        handleApiError(new Error(result.error || 'Failed to update user'));
      }
    } catch (err) {
      handleApiError(err, { fallback: 'Failed to update user' });
    }
  };

  const handleChangePassword = async (userId: string, data: ChangePasswordData) => {
    try {
      const { data: result } = await api.post(`/users/${userId}/change-password`, data);
      if (result.success) {
        setIsPasswordModalOpen(false);
        setSelectedUser(null);
        alert('Password changed successfully');
      } else {
        handleApiError(new Error(result.error || 'Failed to change password'));
      }
    } catch (err) {
      handleApiError(err, { fallback: 'Failed to change password' });
    }
  };

  const handleDeleteUser = async (userId: string, permanent: boolean = false) => {
    try {
      const url = permanent ? `/users/${userId}?permanent=true` : `/users/${userId}`;

      const { data: result } = await api.delete(url);
      if (result.success) {
        setIsDeleteDialogOpen(false);
        setSelectedUser(null);
        fetchUsers();
        fetchStats();

        if (result.permanentlyDeleted) {
          alert('User permanently deleted');
        }
      } else {
        handleApiError(new Error(result.error || 'Failed to delete user'));
      }
    } catch (err) {
      handleApiError(err, { fallback: 'Failed to delete user' });
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.fullName?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && user.isActive) ||
      (statusFilter === 'INACTIVE' && !user.isActive);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const getRoleBadgeColor = (role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF') => {
    switch (role) {
      case 'ADMIN':
        return 'bg-red-100 text-red-800';
      case 'MANAGER':
        return 'bg-purple-100 text-purple-800';
      case 'CASHIER':
        return 'bg-blue-100 text-blue-800';
      case 'STAFF':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Users</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <span className="text-2xl">👥</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Users</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{stats.active}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <span className="text-2xl">✅</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Inactive Users</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">{stats.inactive}</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg">
                <span className="text-2xl">⏸️</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Admins</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{stats.byRole.ADMIN}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <span className="text-2xl">🔐</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Main Content Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header with Search and Filters */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <h2 className="text-xl font-semibold text-gray-900">User Management</h2>

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1 sm:w-64">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Role Filter */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                aria-label="Filter by role"
              >
                <option value="ALL">All Roles</option>
                <option value="ADMIN">Admin</option>
                <option value="MANAGER">Manager</option>
                <option value="CASHIER">Cashier</option>
                <option value="STAFF">Staff</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                aria-label="Filter by status"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>

              {/* Refresh Button */}
              <button
                onClick={() => {
                  fetchUsers();
                  fetchStats();
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
              >
                <RefreshCw size={18} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              {/* Create User Button */}
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <Plus size={18} />
                Add User
              </button>
            </div>
          </div>
        </div>

        {/* User Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No users found</p>
              <p className="text-gray-400 text-sm mt-2">Try adjusting your search or filters</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold">
                            {user.fullName?.[0]?.toUpperCase() || 'U'}
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.fullName || 'Unnamed'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {user.userNumber || user.id.slice(0, 8)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(
                          user.role
                        )}`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDisplayDate(user.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setIsRolesModalOpen(true);
                          }}
                          className="text-purple-600 hover:text-purple-900 p-2 hover:bg-purple-50 rounded"
                          title="Manage RBAC Roles"
                        >
                          <Shield size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setIsEditModalOpen(true);
                          }}
                          className="text-blue-600 hover:text-blue-900 p-2 hover:bg-blue-50 rounded"
                          title="Edit User"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setIsPasswordModalOpen(true);
                          }}
                          className="text-yellow-600 hover:text-yellow-900 p-2 hover:bg-yellow-50 rounded"
                          title="Change Password"
                        >
                          <Key size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setIsDeleteDialogOpen(true);
                          }}
                          className="text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded"
                          title="Delete User"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      {isCreateModalOpen && (
        <CreateUserModal onClose={() => setIsCreateModalOpen(false)} onCreate={handleCreateUser} />
      )}

      {isEditModalOpen && selectedUser && (
        <EditUserModal
          user={selectedUser}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedUser(null);
          }}
          onUpdate={(data) => handleUpdateUser(selectedUser.id, data)}
        />
      )}

      {isPasswordModalOpen && selectedUser && (
        <ChangePasswordModal
          user={selectedUser}
          onClose={() => {
            setIsPasswordModalOpen(false);
            setSelectedUser(null);
          }}
          onChangePassword={(data) => handleChangePassword(selectedUser.id, data)}
        />
      )}

      {isDeleteDialogOpen && selectedUser && (
        <DeleteUserDialog
          user={selectedUser}
          onClose={() => {
            setIsDeleteDialogOpen(false);
            setSelectedUser(null);
          }}
          onDeactivate={() => handleDeleteUser(selectedUser.id, false)}
          onPermanentDelete={() => handleDeleteUser(selectedUser.id, true)}
        />
      )}

      {isRolesModalOpen && selectedUser && (
        <ManageRolesModal
          user={selectedUser}
          onClose={() => {
            setIsRolesModalOpen(false);
            setSelectedUser(null);
          }}
        />
      )}
    </div>
  );
}

// Create User Modal Component
function CreateUserModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: CreateUserData) => void;
}) {
  const [formData, setFormData] = useState<CreateUserData>({
    email: '',
    password: '',
    fullName: '',
    role: 'STAFF',
  });
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      alert('Password must be at least 8 characters long');
      return;
    }

    onCreate(formData);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Create New User</h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
            <select
              required
              value={formData.role}
              onChange={(e) =>
                setFormData({ ...formData, role: e.target.value as CreateUserData['role'] })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="User role"
            >
              <option value="STAFF">Staff</option>
              <option value="CASHIER">Cashier</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <input
              type="password"
              required
              minLength={8}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Min 8 characters"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password *
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Repeat password"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Edit User Modal Component
function EditUserModal({
  user,
  onClose,
  onUpdate,
}: {
  user: User;
  onClose: () => void;
  onUpdate: (data: UpdateUserData) => void;
}) {
  const [formData, setFormData] = useState<UpdateUserData>({
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(formData);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Edit User: {user.fullName}</h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="editEmail" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="editEmail"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="User email"
            />
          </div>

          <div>
            <label htmlFor="editFullName" className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              id="editFullName"
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="User full name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={formData.role}
              onChange={(e) =>
                setFormData({ ...formData, role: e.target.value as UpdateUserData['role'] })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="User role"
            >
              <option value="STAFF">Staff</option>
              <option value="CASHIER">Cashier</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              aria-label="Active user status"
            />
            <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
              Active User
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Update User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Change Password Modal Component
function ChangePasswordModal({
  user,
  onClose,
  onChangePassword,
}: {
  user: User;
  onClose: () => void;
  onChangePassword: (data: ChangePasswordData) => void;
}) {
  const [formData, setFormData] = useState<ChangePasswordData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.newPassword !== formData.confirmPassword) {
      alert('New passwords do not match');
      return;
    }

    if (formData.newPassword.length < 8) {
      alert('New password must be at least 8 characters long');
      return;
    }

    onChangePassword(formData);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Change Password: {user.fullName}</h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label
              htmlFor="currentPassword"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Current Password *
            </label>
            <input
              id="currentPassword"
              type="password"
              required
              value={formData.currentPassword}
              onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Current password"
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
              New Password *
            </label>
            <input
              id="newPassword"
              type="password"
              required
              minLength={8}
              value={formData.newPassword}
              onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Min 8 characters"
              aria-label="New password"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Confirm New Password *
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Repeat new password"
              aria-label="Confirm new password"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Change Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Delete User Dialog Component
function DeleteUserDialog({
  user,
  onClose,
  onDeactivate,
  onPermanentDelete,
}: {
  user: User;
  onClose: () => void;
  onDeactivate: () => void;
  onPermanentDelete: () => void;
}) {
  const [showPermanentDelete, setShowPermanentDelete] = useState(false);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-orange-600">Delete User</h3>
        </div>

        <div className="p-6">
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-600">
              <strong>Name:</strong> {user.fullName}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              <strong>Email:</strong> {user.email}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              <strong>Role:</strong> {user.role}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              <strong>Current Status:</strong>{' '}
              <span className={user.isActive ? 'text-green-600' : 'text-gray-500'}>
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
            </p>
          </div>

          {!showPermanentDelete ? (
            <>
              <p className="text-gray-700 mb-2">Choose how to delete this user:</p>

              <div className="space-y-3 mb-6">
                <div className="border border-orange-200 rounded-lg p-3 bg-orange-50">
                  <p className="font-semibold text-orange-800 mb-1">Deactivate (Recommended)</p>
                  <p className="text-sm text-gray-700">
                    User will be marked as <span className="font-semibold">Inactive</span> and
                    preserved in the database. Can be reactivated later. Maintains audit trails and
                    data integrity.
                  </p>
                </div>

                <div className="border border-red-200 rounded-lg p-3 bg-red-50">
                  <p className="font-semibold text-red-800 mb-1">Permanent Delete</p>
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Permanently</span> removes user from database.{' '}
                    <span className="font-semibold text-red-600">Cannot be undone!</span> Only
                    available for users without transactions.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={onDeactivate}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Deactivate
                </button>
                <button
                  onClick={() => setShowPermanentDelete(true)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete Forever
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-800 font-semibold mb-2">⚠️ Warning: Permanent Deletion</p>
                <p className="text-sm text-red-700">
                  This will <span className="font-bold">permanently delete</span> the user from the
                  database. This action <span className="font-bold">CANNOT be undone</span>.
                </p>
                <p className="text-sm text-red-700 mt-2">
                  If the user has any associated transactions (sales, stock movements, purchase
                  orders), the deletion will fail.
                </p>
              </div>

              <p className="text-gray-700 mb-4 font-medium">
                Are you absolutely sure you want to permanently delete this user?
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowPermanentDelete(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Go Back
                </button>
                <button
                  onClick={onPermanentDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
                >
                  Yes, Delete Forever
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Manage RBAC Roles Modal Component
function ManageRolesModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [allRoles, setAllRoles] = useState<RbacRole[]>([]);
  const [userRoles, setUserRoles] = useState<UserRoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all available roles and user's current roles in parallel
      const [rolesRes, userRolesRes] = await Promise.all([
        api.get('/rbac/roles'),
        api.get(`/rbac/users/${user.id}/roles`),
      ]);

      if (rolesRes.data.success) {
        setAllRoles(rolesRes.data.data);
      }
      if (userRolesRes.data.success) {
        setUserRoles(userRolesRes.data.data);
      }
    } catch (err) {
      setError('Failed to load roles data');
      console.error('Failed to fetch roles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user.id]);

  const handleAssignRole = async (roleId: string) => {
    try {
      setAssigning(true);
      const { data: result } = await api.post('/rbac/users/roles', {
        userId: String(user.id),
        roleId,
      });
      if (result.success) {
        await fetchData();
      } else {
        handleApiError(new Error(result.error || 'Failed to assign role'));
      }
    } catch (err) {
      handleApiError(err, { fallback: 'Failed to assign role' });
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveRole = async (roleId: string) => {
    try {
      setAssigning(true);
      const { data: result } = await api.delete('/rbac/users/roles', {
        data: { userId: String(user.id), roleId },
      });
      if (result.success) {
        await fetchData();
      } else {
        handleApiError(new Error(result.error || 'Failed to remove role'));
      }
    } catch (err) {
      handleApiError(err, { fallback: 'Failed to remove role' });
    } finally {
      setAssigning(false);
    }
  };

  const assignedRoleIds = new Set(userRoles.map((ur) => ur.roleId));
  const availableRoles = allRoles.filter((role) => !assignedRoleIds.has(role.id));

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-2xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 bg-purple-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Shield className="text-purple-600" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Manage RBAC Roles</h3>
              <p className="text-sm text-gray-600">
                {user.fullName} ({user.email})
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
              {error}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Current Roles */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="p-1 bg-green-100 rounded">✓</span>
                  Assigned Roles ({userRoles.length})
                </h4>
                {userRoles.length === 0 ? (
                  <p className="text-gray-500 text-sm italic">No roles assigned yet</p>
                ) : (
                  <div className="space-y-2">
                    {userRoles.map((assignment) => (
                      <div
                        key={assignment.roleId}
                        className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{assignment.roleName}</p>
                          <p className="text-xs text-gray-500">
                            Assigned: {formatDisplayDate(assignment.assignedAt)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveRole(assignment.roleId)}
                          disabled={assigning}
                          className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Available Roles */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="p-1 bg-gray-100 rounded">+</span>
                  Available Roles ({availableRoles.length})
                </h4>
                {availableRoles.length === 0 ? (
                  <p className="text-gray-500 text-sm italic">All roles are already assigned</p>
                ) : (
                  <div className="space-y-2">
                    {availableRoles.map((role) => (
                      <div
                        key={role.id}
                        className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-gray-900">
                            {role.name}
                            {role.isSystemRole && (
                              <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                System
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-gray-600">{role.description}</p>
                        </div>
                        <button
                          onClick={() => handleAssignRole(role.id)}
                          disabled={assigning}
                          className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors disabled:opacity-50"
                        >
                          Assign
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
