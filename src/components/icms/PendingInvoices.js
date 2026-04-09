import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_ENDPOINTS, { initICMSBase } from '../../../icms_config/api';
import AppHeader from '../AppHeader';
const LIGHT_GREEN = '#e6f6ec';
const HEADER_FALLBACK = '#ffffff';

const COLORS = {
  bg: '#f6f8fb',
  card: '#ffffff',
  border: '#e4e7ee',
  text: '#14181f',
  sub: '#657081',
  primary: '#7bcf95',
  accent: '#0F8B65',
  danger: '#D9534F',
  shadow: '#0b1220',
};

const formatDate = value => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString();
};

export default function PendingInvoices() {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [notifyModalVisible, setNotifyModalVisible] = useState(false);
  const [pendingNotifyIds, setPendingNotifyIds] = useState([]);
  const [headerBg, setHeaderBg] = useState({ type: 'color', value: HEADER_FALLBACK });

  useEffect(() => {
    const loadHeader = async () => {
      try {
        const topBanner = await AsyncStorage.getItem('topabanner');
        if (topBanner) {
          setHeaderBg({ type: 'image', value: topBanner });
        } else {
          setHeaderBg({ type: 'color', value: HEADER_FALLBACK });
        }
      } catch (e) {
        setHeaderBg({ type: 'color', value: HEADER_FALLBACK });
      }
    };
    loadHeader();
  }, []);

  const fetchPendingInvoices = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      await initICMSBase();
      const token = await AsyncStorage.getItem('access_token');
      const icms_store = await AsyncStorage.getItem('icms_store');

       const res = await fetch(API_ENDPOINTS.GET_ROWINOVICE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': token ?? '',
          'mode': 'MOBILE',
          'store': icms_store,
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `Request failed (${res.status})`);
      }

      const data = await res.json().catch(() => ({}));
      console.log('GET_ROWINOVICE response:', data);
      const list = Array.isArray(data?.data) ? data.data : [];
      setInvoices(list);
    } catch (err) {
      console.error('GET_ROWINOVICE failed:', err);
      setErrorMessage('Unable to load pending invoices.');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPendingInvoices();
    }, [fetchPendingInvoices]),
  );

  const filteredInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = invoices;
    if (q) {
      list = invoices.filter(item => {
        const name = (item?.UserInvoiceName || '').toLowerCase();
        const invNo = (item?.SavedInvoiceNo || '').toLowerCase();
        return name.includes(q) || invNo.includes(q);
      });
    }
    const sorted = [...list].sort((a, b) => {
      const an = a?.IsNotify ? 1 : 0;
      const bn = b?.IsNotify ? 1 : 0;
      if (an !== bn) return an - bn;
      return 0;
    });
    return sorted;
  }, [invoices, searchQuery]);

  const toggleSelected = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const openNotifyModal = useCallback((ids) => {
    setPendingNotifyIds(ids);
    setNotifyModalVisible(true);
  }, []);

  const handleNotifyConfirm = useCallback(async () => {
    const ids = pendingNotifyIds.filter(Boolean);
    if (!ids.length) {
      setNotifyModalVisible(false);
      return;
    }
    setNotifyModalVisible(false);
    try {
      const token = await AsyncStorage.getItem('access_token');
      const icms_store = await AsyncStorage.getItem('icms_store');
      const body = {
        notificationUpdate: true,
        data: ids.map(id => ({
          invoiceId: id,
          IsNotify: true,
        })),
      };
      // const res = await fetch('http://192.168.1.53:5055/api/update_invoice_status', {
      //   method: 'PUT',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'access_token': token ?? '',
      //     'mode': 'MOBILE',
      //     'store': icms_store,
      //   },
      //   body: JSON.stringify(body),
      // });

         const res = await fetch(API_ENDPOINTS.UPDATE_ROWINOVICE, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'access_token': token ?? '',
          'mode': 'MOBILE',
          'store': icms_store,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `Request failed (${res.status})`);
      }

      setInvoices(prev =>
        prev.map(item =>
          ids.includes(item?._id)
            ? { ...item, IsNotify: true }
            : item,
        ),
      );
      setSelectedIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
    } catch (err) {
      console.error('UPDATE_ROWINOVICE failed:', err);
      setErrorMessage('Unable to update notify status.');
    }
  }, [pendingNotifyIds]);

  const renderCard = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      key={item?._id}
      activeOpacity={0.9}
      onPress={() => openNotifyModal([item?._id])}
    >
      <View style={styles.cardHeader}>
        <View style={styles.nameRow}>
          {item?.IsNotify ? <View style={styles.notifyDot} /> : null}
          <Text style={styles.vendorName} numberOfLines={1}>
            {item?.UserInvoiceName || '-'}
          </Text>
        </View>
        <View style={[styles.statusPill, styles.statusRequested]}>
          <Text style={styles.statusText}>{item?.status || '-'}</Text>
        </View>
      </View>

      <View style={styles.selectRow}>
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => toggleSelected(item?._id)}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.checkboxInner,
              selectedIds.has(item?._id) && styles.checkboxChecked,
            ]}
          />
        </TouchableOpacity>
        <Text style={styles.selectLabel}>Select for notify</Text>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Invoice No</Text>
        <Text style={styles.metaValue}>{item?.SavedInvoiceNo || '-'}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Saved Date</Text>
        <Text style={styles.metaValue}>{formatDate(item?.SavedDate)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Created At</Text>
        <Text style={styles.metaValue}>{formatDate(item?.createdAt)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Is Notify</Text>
        <Text
          style={[
            styles.metaValue,
            item?.IsNotify ? styles.notifyTrue : styles.notifyFalse,
          ]}
        >
          {item?.IsNotify ? 'TRUE' : 'FALSE'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.screen}>
      <AppHeader Title="PENDING INVOICES" backgroundType={headerBg.type} backgroundValue={headerBg.value} />

      <View style={styles.content}>
        <View style={styles.searchCard}>
          <Text style={styles.searchLabel}>Search</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by vendor or invoice no..."
            placeholderTextColor="#9aa4b2"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <View style={styles.searchActions}>
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchPendingInvoices}>
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
            {selectedIds.size > 0 && (
              <TouchableOpacity
                style={styles.notifyBtn}
                onPress={() => openNotifyModal(Array.from(selectedIds))}
              >
                <Text style={styles.notifyBtnText}>
                  Notify Selected ({selectedIds.size})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading pending invoices...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchPendingInvoices}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredInvoices}
            keyExtractor={(item, index) => item?._id || `${index}`}
            renderItem={renderCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>No pending invoices</Text>
                <Text style={styles.emptyText}>Try adjusting your search.</Text>
              </View>
            }
          />
        )}
      </View>

      <Modal visible={notifyModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalBackdropTouch}
            onPress={() => setNotifyModalVisible(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Send Notification?</Text>
            <Text style={styles.modalText}>
              Do you want to notify for the selected invoice(s)?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={handleNotifyConfirm}
              >
                <Text style={styles.modalBtnText}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setNotifyModalVisible(false)}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: LIGHT_GREEN,
  },
  content: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  searchCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchLabel: {
    color: COLORS.sub,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.4,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: '#fff',
  },
  searchActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  refreshBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  refreshText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  notifyBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  notifyBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxInner: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
  },
  selectLabel: {
    color: COLORS.sub,
    fontWeight: '600',
    fontSize: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  vendorName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    flexShrink: 1,
  },
  notifyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusRequested: {
    backgroundColor: '#e6f6ec',
    borderColor: '#C9DAFF',
  },
  statusText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f2f6',
  },
  metaLabel: {
    color: COLORS.sub,
    fontSize: 12,
    fontWeight: '600',
  },
  metaValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  notifyTrue: {
    color: COLORS.accent,
  },
  notifyFalse: {
    color: COLORS.danger,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.sub,
    fontWeight: '600',
  },
  errorText: {
    color: COLORS.danger,
    fontWeight: '700',
    marginBottom: 10,
  },
  retryBtn: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  emptyText: {
    marginTop: 6,
    color: COLORS.sub,
    fontWeight: '500',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalBackdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  modalText: {
    marginTop: 8,
    color: COLORS.sub,
    fontWeight: '500',
  },
  modalActions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  modalBtnPrimary: {
    backgroundColor: COLORS.primary,
  },
  modalBtnGhost: {
    backgroundColor: '#eaf7ef',
  },
  modalBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalBtnGhostText: {
    color: COLORS.text,
    fontWeight: '700',
  },
});
