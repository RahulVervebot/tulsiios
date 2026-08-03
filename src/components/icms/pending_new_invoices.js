import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AppHeader from '../AppHeader';
import API_ENDPOINTS, { initICMSBase } from '../../../icms_config/api';

const HEADER_FALLBACK = '#ffffff';
const STAGE_COUNT = 4;

const formatDateOnly = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-CA');
};

const getStatusTone = (status) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PROCESSING') {
    return {
      bg: '#FEF3C7',
      text: '#92400E',
    };
  }
  if (normalized === 'REQUESTED') {
    return {
      bg: '#DBEAFE',
      text: '#1D4ED8',
    };
  }
  if (normalized === 'COMPLETED') {
    return {
      bg: '#DCFCE7',
      text: '#166534',
    };
  }
  return {
    bg: '#E5E7EB',
    text: '#374151',
  };
};

export default function PendingNewInvoices() {
  const [headerBg, setHeaderBg] = useState({ type: 'color', value: HEADER_FALLBACK });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [jobs, setJobs] = useState([]);
  const [expandedJobId, setExpandedJobId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [notifyModalVisible, setNotifyModalVisible] = useState(false);
  const [pendingNotifyJobId, setPendingNotifyJobId] = useState('');
  const [notifiedJobIds, setNotifiedJobIds] = useState(new Set());
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [previewJobId, setPreviewJobId] = useState('');
  const [previewActionLoading, setPreviewActionLoading] = useState(false);

  useEffect(() => {
    const loadHeader = async () => {
      try {
        const topBanner = await AsyncStorage.getItem('topabanner');
        if (topBanner) {
          setHeaderBg({ type: 'image', value: topBanner });
          return;
        }
      } catch (_error) {
        // fall back to color
      }
      setHeaderBg({ type: 'color', value: HEADER_FALLBACK });
    };

    loadHeader();
  }, []);

  const fetchPendingJobs = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      await initICMSBase();
      const token = await AsyncStorage.getItem('access_token');
      const icmsStore = await AsyncStorage.getItem('icms_store');
      const storeurl = await AsyncStorage.getItem('storeurl');
      console.log('Fetching pending invoices with:', { API_ENDPOINTS, icmsStore, storeurl,token });
      const response = await fetch(API_ENDPOINTS.PENDINGINVOICES, {
        method: 'GET',
        headers: {
          access_token: token ?? '',
          mode: 'MOBILE',
          store: icmsStore ?? '',
          app_url: storeurl ?? '',
        },
      });

      const data = await response.json().catch(() => ({}));
      console.log('PENDINGINVOICES response:', data);
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || `Request failed (${response.status})`);
      }

      const nextJobs = Array.isArray(data?.jobs) ? data.jobs : [];
      setJobs(nextJobs);
      if (!expandedJobId && nextJobs.length) {
        setExpandedJobId(String(nextJobs[0]?.jobId || nextJobs[0]?.invoiceNo || ''));
      }
    } catch (error) {
      console.log('Pending new invoices error:', error?.message || error);
      setJobs([]);
      setErrorMessage(error?.message || 'Unable to load pending new invoices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPendingJobs();
    }, [fetchPendingJobs]),
  );

  const openNotifyModal = useCallback((jobId) => {
    if (!jobId) return;
    setPendingNotifyJobId(String(jobId));
    setNotifyModalVisible(true);
  }, []);

  const handleNotifyConfirm = useCallback(async () => {
    const jobId = String(pendingNotifyJobId || '').trim();
    if (!jobId) {
      setNotifyModalVisible(false);
      return;
    }

    setNotifyModalVisible(false);
    try {
      await initICMSBase();
      const token = await AsyncStorage.getItem('access_token');
      const icmsStore = await AsyncStorage.getItem('icms_store');
      const storeurl = await AsyncStorage.getItem('storeurl');
      const body = {
        notificationUpdate: true,
        data: [
          {
            invoiceId: jobId,
            IsNotify: true,
          },
        ],
      };

      const response = await fetch(API_ENDPOINTS.UPDATE_ROWINOVICE, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          access_token: token ?? '',
          mode: 'MOBILE',
          store: icmsStore ?? '',
          app_url: storeurl ?? '',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(message || `Request failed (${response.status})`);
      }
console.log("response notify",response);
      setNotifiedJobIds((prev) => new Set(prev).add(jobId));
    } catch (error) {
      console.log('Pending new invoice notify error:', error?.message || error);
      setErrorMessage(error?.message || 'Unable to notify Tulsi team.');
    } finally {
      setPendingNotifyJobId('');
    }
  }, [pendingNotifyJobId]);

  const getIcmsHeaders = useCallback(async () => {
    await initICMSBase();
    const token = await AsyncStorage.getItem('access_token');
    const icmsStore = await AsyncStorage.getItem('icms_store');
    const storeurl = await AsyncStorage.getItem('storeurl');
    return {
      'Content-Type': 'application/json',
      access_token: token ?? '',
      mode: 'MOBILE',
      store: icmsStore ?? '',
      app_url: storeurl ?? '',
    };
  }, []);

  const loadPreview = useCallback(async (jobId) => {

    const normalizedJobId = String(jobId || '').trim();
    if (!normalizedJobId) return;

    setPreviewLoading(true);
    setPreviewError('');

    try {
      const headers = await getIcmsHeaders();
      const response = await fetch(API_ENDPOINTS.AUTO_REGEX_PREVIEW, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jobId: normalizedJobId }),
      });
      const data = await response.json().catch(() => ({}));
      console.log('AUTO_REGEX_PREVIEW response:', data);
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || `Request failed (${response.status})`);
      }
      setPreviewData(data);
    } catch (error) {
      console.log('Auto regex preview error:', error?.message || error);
      setPreviewError(error?.message || 'Unable to load preview.');
    } finally {
      setPreviewLoading(false);
    }
  }, [getIcmsHeaders]);

  const handlePreview = useCallback(async (jobId) => {
    const normalizedJobId = String(jobId || '').trim();
    if (!normalizedJobId) return;

    setPreviewJobId(normalizedJobId);
    setPreviewModalVisible(true);
    setPreviewData(null);
    await loadPreview(normalizedJobId);
  }, [loadPreview]);

  const closePreviewModal = useCallback(() => {
    setPreviewModalVisible(false);
    setPreviewData(null);
    setPreviewError('');
    setPreviewJobId('');
  }, []);

  const handleApprove = useCallback(async () => {
    const normalizedJobId = String(previewJobId || '').trim();
    if (!normalizedJobId) return;

    setPreviewActionLoading(true);
    try {
      const headers = await getIcmsHeaders();
      const response = await fetch(API_ENDPOINTS.AUTO_REGEX_APPROVE, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jobId: normalizedJobId }),
      });

      const data = await response.json().catch(() => ({}));
      console.log('AUTO_REGEX_APPROVE response:', data);
      if (response.status === 200) {
        Alert.alert('Approved successfully');
        closePreviewModal();
        fetchPendingJobs();
      } else {
        Alert.alert(data?.status || data?.message || `Request failed (${response.status})`);
      }
    } catch (error) {
      console.log('Auto regex approve error:', error?.message || error);
      Alert.alert(error?.message || 'Unable to approve.');
    } finally {
      setPreviewActionLoading(false);
    }
  }, [previewJobId, getIcmsHeaders, closePreviewModal, fetchPendingJobs]);

  const handleRegenerate = useCallback(async () => {
    const normalizedJobId = String(previewJobId || '').trim();
    if (!normalizedJobId) return;

    setPreviewActionLoading(true);
    try {
      const headers = await getIcmsHeaders();
      const response = await fetch(API_ENDPOINTS.AUTO_REGEX, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jobId: normalizedJobId,
          userPrompt: 'The first numeric column is a serial number, ignore it.',
        }),
      });

      const data = await response.json().catch(() => ({}));
      console.log('AUTO_REGEX response:', data);
      if (!response.ok) {
        throw new Error(data?.message || `Request failed (${response.status})`);
      }

      if (data?.status === 'waiting_for_review') {
        await loadPreview(normalizedJobId);
      } else {
        Alert.alert(data?.status || 'Regenerate status unknown');
      }
    } catch (error) {
      console.log('Auto regex regenerate error:', error?.message || error);
      Alert.alert(error?.message || 'Unable to regenerate.');
    } finally {
      setPreviewActionLoading(false);
    }
  }, [previewJobId, getIcmsHeaders, loadPreview]);

  const sortedJobs = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filteredJobs = normalizedQuery
      ? jobs.filter((item) => {
          const vendor = String(item?.vendor || '').toLowerCase();
          const invoiceNo = String(item?.invoiceNo || '').toLowerCase();
          return vendor.includes(normalizedQuery) || invoiceNo.includes(normalizedQuery);
        })
      : jobs;

    return [...filteredJobs].sort((a, b) => {
      const aTime = new Date(a?.createdAt || 0).getTime();
      const bTime = new Date(b?.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [jobs, searchQuery]);

  const renderStepper = (stageValue) => {
    const currentStage = Math.max(0, Math.min(STAGE_COUNT, Number(stageValue || 0)));

    return (
      <View style={styles.stepperRow}>
        {Array.from({ length: STAGE_COUNT }, (_, index) => {
          const stageNumber = index + 1;
          const isDone = currentStage >= stageNumber;
          const isCurrent = currentStage === stageNumber;

          return (
            <View key={stageNumber} style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  isDone && styles.stepDotActive,
                  isCurrent && styles.stepDotCurrent,
                ]}
              >
                <Text style={[styles.stepDotText, isDone && styles.stepDotTextActive]}>
                  {stageNumber}
                </Text>
              </View>
              {stageNumber < STAGE_COUNT ? (
                <View
                  style={[
                    styles.stepConnector,
                    currentStage > stageNumber && styles.stepConnectorActive,
                  ]}
                />
              ) : null}
              <Text style={[styles.stepLabel, isDone && styles.stepLabelActive]}>
                {`Stage ${stageNumber}`}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderItem = ({ item }) => {
    const key = String(item?.jobId || item?.invoiceNo || item?.createdAt || Math.random());
    const isExpanded = expandedJobId === key;
    const statusTone = getStatusTone(item?.status);
    const stageNumber = Math.max(0, Math.min(STAGE_COUNT, Number(item?.stage || 0)));
    const isNotified = notifiedJobIds.has(String(item?.jobId || ''));

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.card}
        onPress={() => setExpandedJobId((prev) => (prev === key ? '' : key))}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <Text style={styles.vendorName} numberOfLines={1}>
              {item?.vendor || '-'}
            </Text>
            <Text style={styles.jobMeta} numberOfLines={1}>
              {item?.jobId || 'No Job ID'}
            </Text>
          </View>
          <View style={styles.cardHeaderRight}>
            <View style={[styles.statusPill, { backgroundColor: statusTone.bg }]}>
              <Text style={[styles.statusText, { color: statusTone.text }]}>
                {item?.status || '-'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.notifyIconBtn, isNotified && styles.notifyIconBtnDisabled]}
              onPress={() => openNotifyModal(item?.jobId)}
              disabled={!item?.jobId || isNotified}
            >
              <Icon
                name={isNotified ? 'notifications-active' : 'notifications-none'}
                size={16}
                color={isNotified ? '#94A3B8' : '#fff'}
              />
            </TouchableOpacity>
          </View>
        </View>

        {isExpanded ? (
          <View style={styles.expandedBlock}>
            <View style={styles.metaPanel}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Invoice No</Text>
                <Text style={styles.metaValue}>{item?.invoiceNo || '-'}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Created At</Text>
                <Text style={styles.metaValue}>{formatDateOnly(item?.createdAt)}</Text>
              </View>
            </View>

            {renderStepper(stageNumber)}

            {String(item?.stageCode || '').toLowerCase() === 'waiting_for_review' ? (
              <View style={styles.progressCard}>
                <View style={styles.progressCardHeader}>
                  <TouchableOpacity
                    style={styles.previewBtn}
                    onPress={() => handlePreview(item?.jobId)}
                    disabled={!item?.jobId}
                  >
                    <Text style={styles.previewBtnText}>Preview</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <AppHeader
        Title="Pending Invoices"
        backgroundType={headerBg.type}
        backgroundValue={headerBg.value}
      />

      <View style={styles.content}>
        <View style={styles.searchWrap}>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search vendor or invoice no"
              placeholderTextColor="#7B8A81"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchPendingJobs}>
              <Icon name="refresh" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#319241" />
            <Text style={styles.stateText}>Loading pending invoice jobs...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Unable to load jobs</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchPendingJobs}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={sortedJobs}
            keyExtractor={(item, index) =>
              String(item?.jobId || `${item?.invoiceNo || 'job'}-${index}`)
            }
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.centerState}>
                <Text style={styles.stateText}>No pending invoice jobs found.</Text>
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
              Do you want to notify Tulsi team for this pending invoice job?
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

      <Modal visible={previewModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={styles.modalBackdropTouch} onPress={closePreviewModal} />
          <View style={styles.previewModalCard}>
            <Text style={styles.modalTitle}>Invoice Preview</Text>

            {previewLoading ? (
              <View style={styles.previewCenterState}>
                <ActivityIndicator size="large" color="#319241" />
                <Text style={styles.stateText}>Loading preview...</Text>
              </View>
            ) : previewError ? (
              <View style={styles.previewCenterState}>
                <Text style={styles.errorText}>{previewError}</Text>
              </View>
            ) : previewData ? (
              <>
                <Text style={styles.previewSummary}>
                  {`Total Rows: ${previewData?.totalRowCount ?? 0}`}
                </Text>
                <FlatList
                  style={styles.previewTableScroll}
                  data={
                    Array.isArray(previewData?.invoiceData) ? previewData.invoiceData : []
                  }
                  keyExtractor={(row, index) => String(row?.SerialNoInInv ?? index)}
                  ListHeaderComponent={
                    <View style={[styles.previewRow, styles.previewHeaderRow]}>
                      <Text style={[styles.previewCell, styles.previewHeaderCell, styles.previewCellNo]}>#</Text>
                      <Text style={[styles.previewCell, styles.previewHeaderCell]}>Item No</Text>
                      <Text style={[styles.previewCell, styles.previewHeaderCell, styles.previewCellWide]}>Description</Text>
                      <Text style={[styles.previewCell, styles.previewHeaderCell]}>Qty</Text>
                      <Text style={[styles.previewCell, styles.previewHeaderCell]}>Unit Price</Text>
                      <Text style={[styles.previewCell, styles.previewHeaderCell]}>Ext Price</Text>
                    </View>
                  }
                  renderItem={({ item: row, index }) => (
                    <View
                      style={[
                        styles.previewRow,
                        index % 2 === 1 && styles.previewRowAlt,
                      ]}
                    >
                      <Text style={[styles.previewCell, styles.previewCellNo]}>
                        {row?.SerialNoInInv ?? index + 1}
                      </Text>
                      <Text style={styles.previewCell}>{row?.itemNo || '-'}</Text>
                      <Text style={[styles.previewCell, styles.previewCellWide]}>{row?.description || '-'}</Text>
                      <Text style={styles.previewCell}>{row?.qty || '-'}</Text>
                      <Text style={styles.previewCell}>{row?.unitPrice || '-'}</Text>
                      <Text style={styles.previewCell}>{row?.extendedPrice || '-'}</Text>
                    </View>
                  )}
                  ListEmptyComponent={
                    <Text style={styles.stateText}>No rows found in preview.</Text>
                  }
                />
              </>
            ) : null}

            <View style={styles.previewModalActions}>
              {previewData ? (
                <>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnApprove]}
                    onPress={handleApprove}
                    disabled={previewActionLoading || previewLoading}
                  >
                    <Text style={styles.modalBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnRegenerate]}
                    onPress={handleRegenerate}
                    disabled={previewActionLoading || previewLoading}
                  >
                    <Text style={styles.modalBtnText}>Regenerate</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={closePreviewModal}
                disabled={previewActionLoading}
              >
                <Text style={styles.modalBtnGhostText}>Close</Text>
              </TouchableOpacity>
            </View>
            {previewActionLoading ? (
              <ActivityIndicator style={styles.previewActionLoader} size="small" color="#319241" />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#D4E7DC',
  },
  content: {
    flex: 1,
    backgroundColor: '#D4E7DC',
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#F6FBF7',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CFE3D5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#10261A',
    fontSize: 14,
  },
  refreshBtn: {
    backgroundColor: '#319241',
    borderRadius: 12,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: '#F6FBF7',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CFE3D5',
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardHeaderText: {
    flex: 1,
  },
  vendorName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10261A',
  },
  jobMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#5F6F66',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  notifyIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#0F8B65',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifyIconBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  expandedBlock: {
    marginTop: 14,
  },
  metaPanel: {
    backgroundColor: '#EAF5ED',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D7ECDD',
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#466052',
  },
  metaValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
    color: '#10261A',
  },
  stepperRow: {
    marginTop: 16,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepDotActive: {
    backgroundColor: '#319241',
  },
  stepDotCurrent: {
    borderWidth: 2,
    borderColor: '#10351B',
  },
  stepDotText: {
    color: '#475569',
    fontWeight: '700',
  },
  stepDotTextActive: {
    color: '#fff',
  },
  stepConnector: {
    position: 'absolute',
    top: 14,
    right: '-50%',
    width: '100%',
    height: 3,
    backgroundColor: '#D1D5DB',
    zIndex: 1,
  },
  stepConnectorActive: {
    backgroundColor: '#319241',
  },
  stepLabel: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: '#166534',
  },
  progressCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE7DE',
    padding: 12,
    gap: 6,
  },
  progressCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  progressTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewBtn: {
    backgroundColor: '#319241',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  previewBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  progressText: {
    fontSize: 13,
    color: '#334155',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stateText: {
    marginTop: 12,
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 13,
    color: '#7F1D1D',
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: '#319241',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    paddingHorizontal: 20,
  },
  modalBackdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#10261A',
  },
  modalText: {
    marginTop: 8,
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalBtnPrimary: {
    backgroundColor: '#319241',
  },
  modalBtnGhost: {
    backgroundColor: '#E2E8F0',
  },
  modalBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalBtnGhostText: {
    color: '#334155',
    fontWeight: '700',
  },
  previewModalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
  },
  previewCenterState: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSummary: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#10261A',
  },
  previewTableScroll: {
    maxHeight: 320,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
  },
  previewRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  previewHeaderRow: {
    backgroundColor: '#EAF5ED',
  },
  previewRowAlt: {
    backgroundColor: '#F8FAFB',
  },
  previewCell: {
    flex: 1,
    fontSize: 11,
    color: '#334155',
    paddingHorizontal: 2,
  },
  previewHeaderCell: {
    fontWeight: '700',
    color: '#10261A',
  },
  previewCellNo: {
    flex: 0.4,
  },
  previewCellWide: {
    flex: 1.6,
  },
  previewModalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  modalBtnApprove: {
    backgroundColor: '#0F8B65',
  },
  modalBtnRegenerate: {
    backgroundColor: '#D97706',
  },
  previewActionLoader: {
    marginTop: 10,
  },
});