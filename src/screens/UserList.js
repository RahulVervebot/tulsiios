import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Switch,
  Alert,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AppHeader from '../components/AppHeader';
import { getPosUsers, createPosUser, updatePosUser } from '../functions/users/function';

const ROLE_OPTIONS = [
  { value: 'cashier', label: 'Cashier' },
  { value: 'manager', label: 'Manager' },
  { value: 'account_manager', label: 'Account Manager' },
  { value: 'administrator', label: 'Administrator' },
];

export default function UserList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateRoleDropdown, setShowCreateRoleDropdown] = useState(false);
  const [showEditRoleDropdown, setShowEditRoleDropdown] = useState(false);

  // Create user form state
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    login: '',
    password: '',
    pos_role: 'cashier',
  });

  // Edit user form state
  const [editUser, setEditUser] = useState({
    name: '',
    email: '',
    login: '',
    password: '',
    pos_role: '',
    is_promotion_accessible: false,
    is_show_cost_price: false,
    is_show_credit_sale: false,
    is_product_edit_permission_in_app: false,
    is_product_edit_permission_in_pos: false,
    allow_app_login: false,
  });

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getPosUsers();
      setUsers(result.users || []);
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setEditUser({
      name: user.name || '',
      email: user.email || '',
      login: user.login || '',
      password: '',
      pos_role: user.pos_role || 'cashier',
      is_promotion_accessible: user.is_promotion_accessible || false,
      is_show_cost_price: user.is_show_cost_price || false,
      is_show_credit_sale: user.is_show_credit_sale || false,
      is_product_edit_permission_in_app: user.is_product_edit_permission_in_app || false,
      is_product_edit_permission_in_pos: user.is_product_edit_permission_in_pos || false,
      allow_app_login: user.allow_app_login || false,
    });
    setEditModalVisible(true);
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    // Build body with only changed values
    const body = {};
    
    if (editUser.name !== selectedUser.name) body.name = editUser.name;
    if (editUser.email !== selectedUser.email) body.email = editUser.email;
    if (editUser.login !== selectedUser.login) body.login = editUser.login;
    if (editUser.password) body.password = editUser.password; // Only send if not empty
    if (editUser.pos_role !== selectedUser.pos_role) body.pos_role = editUser.pos_role;
    
    // Always send permission fields
    body.is_promotion_accessible = editUser.is_promotion_accessible;
    body.is_show_cost_price = editUser.is_show_cost_price;
    body.is_show_credit_sale = editUser.is_show_credit_sale;
    body.is_product_edit_permission_in_app = editUser.is_product_edit_permission_in_app;
    body.is_product_edit_permission_in_pos = editUser.is_product_edit_permission_in_pos;
    body.allow_app_login = editUser.allow_app_login;

    try {
      setUpdating(true);
      await updatePosUser(selectedUser.id, body);
      Alert.alert('Success', 'User updated successfully');
      setEditModalVisible(false);
      fetchUsers();
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to update user');
    } finally {
      setUpdating(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.login || !newUser.password) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setCreating(true);
      await createPosUser(newUser);
      Alert.alert('Success', 'User created successfully');
      setCreateModalVisible(false);
      setNewUser({
        name: '',
        email: '',
        login: '',
        password: '',
        pos_role: 'cashier',
      });
      fetchUsers();
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const renderUserCard = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.userName}>{item.name}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
        </View>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => handleEditUser(item)}
        >
          <Icon name="edit" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Role:</Text>
          <Text style={[styles.infoBadge, getRoleBadgeStyle(item.pos_role)]}>
            {item.pos_role}
          </Text>
        </View>

        <View style={styles.permissionsGrid}>
          <PermissionItem
            label="Promotion Access"
            value={item.is_promotion_accessible}
          />
          <PermissionItem
            label="Show Cost Price"
            value={item.is_show_cost_price}
          />
          <PermissionItem
            label="Show Credit Sale"
            value={item.is_show_credit_sale}
          />
          <PermissionItem
            label="Product Edit (App)"
            value={item.is_product_edit_permission_in_app}
          />
          <PermissionItem
            label="App Login"
            value={item.allow_app_login}
          />
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <AppHeader Title="User Management" backgroundType="color" backgroundValue='#319241' />
      <View style={styles.headerActions}>
        <Text style={styles.countText}>Total Users: {users.length}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setCreateModalVisible(true)}
        >
          <Icon name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#319241" />
          <Text style={styles.loadingText}>Loading users...</Text>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No users found</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderUserCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Edit User Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setEditModalVisible(false)}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit User Permissions</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Icon name="close" size={24} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={editUser.name}
                  onChangeText={(text) => setEditUser({ ...editUser, name: text })}
                  placeholder="Enter name"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email *</Text>
                <TextInput
                  style={styles.input}
                  value={editUser.email}
                  onChangeText={(text) => setEditUser({ ...editUser, email: text })}
                  placeholder="Enter email"
                  placeholderTextColor="#9ca3af"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Login *</Text>
                <TextInput
                  style={styles.input}
                  value={editUser.login}
                  onChangeText={(text) => setEditUser({ ...editUser, login: text })}
                  placeholder="Enter login"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password (leave empty to keep current)</Text>
                <TextInput
                  style={styles.input}
                  value={editUser.password}
                  onChangeText={(text) => setEditUser({ ...editUser, password: text })}
                  placeholder="Enter new password"
                  placeholderTextColor="#9ca3af"
                  secureTextEntry
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Role *</Text>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => setShowEditRoleDropdown(!showEditRoleDropdown)}
                >
                  <Text style={styles.dropdownButtonText}>
                    {ROLE_OPTIONS.find(r => r.value === editUser.pos_role)?.label || 'Select Role'}
                  </Text>
                  <Icon name={showEditRoleDropdown ? 'arrow-drop-up' : 'arrow-drop-down'} size={24} color="#6B7280" />
                </TouchableOpacity>
                {showEditRoleDropdown && (
                  <View style={styles.dropdownList}>
                    {ROLE_OPTIONS.map((role) => (
                      <TouchableOpacity
                        key={role.value}
                        style={[
                          styles.dropdownItem,
                          editUser.pos_role === role.value && styles.dropdownItemActive,
                        ]}
                        onPress={() => {
                          setEditUser({ ...editUser, pos_role: role.value });
                          setShowEditRoleDropdown(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            editUser.pos_role === role.value && styles.dropdownItemTextActive,
                          ]}
                        >
                          {role.label}
                        </Text>
                        {editUser.pos_role === role.value && (
                          <Icon name="check" size={20} color="#319241" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.permissionsSection}>
                <Text style={styles.permissionsSectionTitle}>Permissions</Text>
              </View>

              <ToggleRow
                label="Promotion Accessible"
                value={editUser.is_promotion_accessible}
                onToggle={(val) =>
                  setEditUser({ ...editUser, is_promotion_accessible: val })
                }
              />
              <ToggleRow
                label="Show Cost Price"
                value={editUser.is_show_cost_price}
                onToggle={(val) =>
                  setEditUser({ ...editUser, is_show_cost_price: val })
                }
              />
              <ToggleRow
                label="Show Credit Sale"
                value={editUser.is_show_credit_sale}
                onToggle={(val) =>
                  setEditUser({ ...editUser, is_show_credit_sale: val })
                }
              />
              <ToggleRow
                label="Product Edit (App)"
                value={editUser.is_product_edit_permission_in_app}
                onToggle={(val) =>
                  setEditUser({ ...editUser, is_product_edit_permission_in_app: val })
                }
              />
              <ToggleRow
                label="Product Edit (POS)"
                value={editUser.is_product_edit_permission_in_pos}
                onToggle={(val) =>
                  setEditUser({ ...editUser, is_product_edit_permission_in_pos: val })
                }
              />
              <ToggleRow
                label="Allow App Login"
                value={editUser.allow_app_login}
                onToggle={(val) =>
                  setEditUser({ ...editUser, allow_app_login: val })
                }
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, updating && styles.saveBtnDisabled]}
                onPress={handleUpdateUser}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Update</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create User Modal */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setCreateModalVisible(false)}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New User</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Icon name="close" size={24} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={newUser.name}
                  onChangeText={(text) => setNewUser({ ...newUser, name: text })}
                  placeholder="Enter name"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email *</Text>
                <TextInput
                  style={styles.input}
                  value={newUser.email}
                  onChangeText={(text) => setNewUser({ ...newUser, email: text })}
                  placeholder="Enter email"
                  placeholderTextColor="#9ca3af"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Login *</Text>
                <TextInput
                  style={styles.input}
                  value={newUser.login}
                  onChangeText={(text) => setNewUser({ ...newUser, login: text })}
                  placeholder="Enter login"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password *</Text>
                <TextInput
                  style={styles.input}
                  value={newUser.password}
                  onChangeText={(text) => setNewUser({ ...newUser, password: text })}
                  placeholder="Enter password"
                  placeholderTextColor="#9ca3af"
                  secureTextEntry
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Role *</Text>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => setShowCreateRoleDropdown(!showCreateRoleDropdown)}
                >
                  <Text style={styles.dropdownButtonText}>
                    {ROLE_OPTIONS.find(r => r.value === newUser.pos_role)?.label || 'Select Role'}
                  </Text>
                  <Icon name={showCreateRoleDropdown ? 'arrow-drop-up' : 'arrow-drop-down'} size={24} color="#6B7280" />
                </TouchableOpacity>
                {showCreateRoleDropdown && (
                  <View style={styles.dropdownList}>
                    {ROLE_OPTIONS.map((role) => (
                      <TouchableOpacity
                        key={role.value}
                        style={[
                          styles.dropdownItem,
                          newUser.pos_role === role.value && styles.dropdownItemActive,
                        ]}
                        onPress={() => {
                          setNewUser({ ...newUser, pos_role: role.value });
                          setShowCreateRoleDropdown(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            newUser.pos_role === role.value && styles.dropdownItemTextActive,
                          ]}
                        >
                          {role.label}
                        </Text>
                        {newUser.pos_role === role.value && (
                          <Icon name="check" size={20} color="#319241" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setCreateModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, creating && styles.saveBtnDisabled]}
                onPress={handleCreateUser}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Helper Components
const PermissionItem = ({ label, value }) => (
  <View style={styles.permissionItem}>
    <Icon
      name={value ? 'check-circle' : 'cancel'}
      size={16}
      color={value ? '#16A34A' : '#DC2626'}
    />
    <Text style={styles.permissionLabel}>{label}</Text>
  </View>
);

const ToggleRow = ({ label, value, onToggle }) => (
  <View style={styles.toggleRow}>
    <Text style={styles.toggleLabel}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onToggle}
      trackColor={{ true: '#16A34A', false: '#D1D5DB' }}
      thumbColor="#fff"
    />
  </View>
);

const getRoleBadgeStyle = (role) => {
  switch (role?.toLowerCase()) {
    case 'administrator':
      return styles.roleAdmin;
    case 'manager':
      return styles.roleManager;
    case 'account_manager':
      return styles.roleAccountManager;
    case 'cashier':
      return styles.roleCashier;
    default:
      return styles.roleDefault;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  countText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#319241',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  listContent: {
    padding: 16,
    paddingBottom: 30,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  cardHeaderLeft: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: '#6B7280',
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#319241',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  infoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  roleAdmin: {
    backgroundColor: '#DBEAFE',
    color: '#1E40AF',
  },
  roleManager: {
    backgroundColor: '#E0E7FF',
    color: '#4338CA',
  },
  roleAccountManager: {
    backgroundColor: '#FCE7F3',
    color: '#BE185D',
  },
  roleCashier: {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
  },
  roleDefault: {
    backgroundColor: '#E5E7EB',
    color: '#374151',
  },
  permissionsGrid: {
    gap: 8,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  permissionLabel: {
    fontSize: 13,
    color: '#374151',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalUserInfo: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  modalUserEmail: {
    fontSize: 13,
    color: '#6B7280',
  },
  modalBody: {
    padding: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fff',
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  dropdownButtonText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  dropdownList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownItemActive: {
    backgroundColor: '#F0FDF4',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: '#319241',
    fontWeight: '600',
  },
  permissionsSection: {
    marginTop: 8,
    marginBottom: 8,
  },
  permissionsSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#319241',
    minWidth: 100,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
