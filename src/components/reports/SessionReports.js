import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from 'react-native';

import AppHeader from '../AppHeader';
import reportbg from '../../assets/images/report-bg.png';
import DateRangePickerModal from '../DateRangePickerModal';

import {
  getTodaySessions,
  getYesterdaySessions,
  getCustomDateSessions,
  getSessionZReportPreview,
  getRegisterList,
  printSessionReport,
} from '../../functions/reports/pos_reports';

const TABS = ['Today', 'Yesterday', 'Custom'];

const formatDate = (d) => {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function SessionReports() {
  const [activeTab, setActiveTab] = useState('Today');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [fromDate, setFromDate] = useState(formatDate(new Date()));
  const [toDate, setToDate] = useState(formatDate(new Date()));
  const [pickerVisible, setPickerVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [registers, setRegisters] = useState([]);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [selectedRegisterId, setSelectedRegisterId] = useState('');
  const [printLoading, setPrintLoading] = useState(false);
  const [printMessage, setPrintMessage] = useState('');
  const [registerModalVisible, setRegisterModalVisible] = useState(false);

  const [range, setRange] = useState(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  });

  const title = useMemo(() => {
    if (activeTab === 'Custom') return 'Custom Date Sessions';
    if (activeTab === 'Yesterday') return 'Yesterday Sessions';
    return 'Today Sessions';
  }, [activeTab]);

  const selectedRegisterName =
    registers.find((r) => String(r.id) === String(selectedRegisterId))?.name || '';

  const loadSessions = async (tab = activeTab, customDates) => {
    try {
      setLoading(true);
      setErrorMsg('');
      let data = [];
      if (tab === 'Today') {
        data = await getTodaySessions();
      } else if (tab === 'Yesterday') {
        data = await getYesterdaySessions();
      } else {
        const { from, to } = customDates || { from: fromDate, to: toDate };
        data = await getCustomDateSessions(from, to);
      }
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to load sessions.');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions(activeTab);
  }, [activeTab]);

  const handlePreview = async (session) => {
    try {
      setSelectedSession(session);
      setPreviewData(null);
      setPrintMessage('');
      setSelectedRegisterId('');
      setPreviewLoading(true);
      const data = await getSessionZReportPreview(session.id);
      setPreviewData(data);
    } catch (err) {
      setPreviewData({ error: err?.message || 'Failed to load report.' });
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadRegisters = async () => {
      if (!selectedSession) return;
      try {
        setRegisterLoading(true);
        const data = await getRegisterList();
        if (!active) return;
        const list = Array.isArray(data) ? data : [];
        list.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
        setRegisters(list);
      } catch {
        if (!active) return;
        setRegisters([]);
      } finally {
        if (active) setRegisterLoading(false);
      }
    };

    loadRegisters();

    return () => {
      active = false;
    };
  }, [selectedSession]);

  const handlePrint = async () => {
    if (!selectedSession?.id || !selectedRegisterId || printLoading) return;
    try {
      setPrintLoading(true);
      setPrintMessage('');
      const res = await printSessionReport([selectedSession.id], selectedRegisterId);
      const msg =
        res?.message ||
        res?.result?.message ||
        res?.error?.message ||
        res?.result?.error ||
        res?.error ||
        'Print request sent';
      setPrintMessage(msg);
    } catch (err) {
      setPrintMessage(err?.message || 'Print failed');
    } finally {
      setPrintLoading(false);
    }
  };

  const filteredSessions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sessions;
    return sessions.filter((s) => {
      const name = String(s?.name || '').toLowerCase();
      const configName = String(s?.config_name || '').toLowerCase();
      return name.includes(term) || configName.includes(term);
    });
  }, [sessions, search]);

  const money = (v) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <View style={styles.screen}>
      <AppHeader Title="SESSIONS REPORT" backgroundType="image" backgroundValue={reportbg} />

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.searchWrap}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by Name or Config Name"
            placeholderTextColor="#9CA3AF"
            style={styles.searchInput}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.tabsRow}>
          {TABS.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === 'Custom' && (
          <View style={styles.dateCard}>
            <TouchableOpacity onPress={() => setPickerVisible(true)} style={styles.dateCardHeader}>
              <View>
                <Text style={styles.dateCardHeaderText}>Select Date</Text>
                <Text style={styles.dateCardSubText}>Tap to change the reporting range</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setPickerVisible(true)}>
              <View style={styles.datetimeselector}>
                <View style={styles.dateshow}>
                  <Text style={styles.dateLabel}>From</Text>
                  <View style={styles.dateBadge}>
                    <Text style={styles.dateBadgeText}>{fromDate}</Text>
                  </View>
                </View>
                <View style={styles.dateshow}>
                  <Text style={styles.dateLabel}>To</Text>
                  <View style={styles.dateBadge}>
                    <Text style={styles.dateBadgeText}>{toDate}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() => loadSessions('Custom', { from: fromDate, to: toDate })}
            >
              <Text style={styles.applyText}>Apply</Text>
            </TouchableOpacity>

            <DateRangePickerModal
              visible={pickerVisible}
              onClose={() => setPickerVisible(false)}
              onApply={({ start, end }) => {
                setRange({ start, end });
                const startDate = formatDate(start);
                const endDate = formatDate(end);
                setFromDate(startDate);
                setToDate(endDate);
                setPickerVisible(false);
              }}
              initialPreset="custom"
              initialStart={range.start}
              initialEnd={range.end}
            />
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionMeta}>{filteredSessions.length} sessions</Text>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : filteredSessions.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No sessions found.</Text>
          </View>
        ) : (
          <View style={styles.cardsWrap}>
            {filteredSessions.map((s) => (
              <TouchableOpacity
                key={String(s.id)}
                style={styles.card}
                activeOpacity={0.9}
                onPress={() => handlePreview(s)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{s.name || `Session ${s.id}`}</Text>
                  <View style={[styles.stateBadge, s.state === 'closed' && styles.stateBadgeClosed]}>
                    <Text style={styles.stateText}>{s.state || 'unknown'}</Text>
                  </View>
                </View>

                <Text style={styles.cardSub}>{s.config_name || s.config_id}</Text>
                <View style={styles.cardMetaRow}>
                  <Text style={styles.cardMeta}>Start: {s.start_at || '-'}</Text>
                  <Text style={styles.cardMeta}>Stop: {s.stop_at || '-'}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={!!selectedSession}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => {
          setSelectedSession(null);
          setRegisterModalVisible(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Session Report</Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedSession(null);
                  setRegisterModalVisible(false);
                }}
              >
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {previewLoading ? (
                <View style={styles.centered}>
                  <ActivityIndicator size="large" />
                  <Text style={styles.loadingText}>Loading report…</Text>
                </View>
              ) : previewData?.error ? (
                <Text style={styles.errorText}>{previewData.error}</Text>
              ) : previewData ? (
                <View style={styles.receiptWrap}>
                  <View style={styles.receiptHeader}>
                    <Text style={styles.receiptTitle}>{previewData?.company?.name || '-'}</Text>
                    <Text style={styles.receiptText}>
                      {previewData?.company?.receipt_name || 'Sales Receipt'}
                    </Text>
                    <Text style={styles.receiptText}>{previewData?.company?.phone || '-'}</Text>
                    <Text style={styles.receiptText}>
                      Served by {previewData?.company?.cashier || '-'}
                    </Text>
                  </View>

                  <Text style={styles.receiptLine}>------------------------------------------</Text>

                  <View style={styles.receiptSection}>
                    <Text style={styles.receiptLabel}>SESSION</Text>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptText}>Name</Text>
                      <Text style={styles.receiptText}>{previewData?.session?.name || '-'}</Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptText}>Config</Text>
                      <Text style={styles.receiptText}>{previewData?.session?.config || '-'}</Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptText}>Cashier</Text>
                      <Text style={styles.receiptText}>{previewData?.session?.cashier || '-'}</Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptText}>Start</Text>
                      <Text style={styles.receiptText}>{previewData?.session?.start_at || '-'}</Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptText}>Stop</Text>
                      <Text style={styles.receiptText}>{previewData?.session?.stop_at || '-'}</Text>
                    </View>
                  </View>

                  <Text style={styles.receiptLine}>------------------------------------------</Text>

                  <View style={styles.receiptSection}>
                    <Text style={styles.receiptLabel}>ORDERS</Text>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptText}>Total Orders</Text>
                      <Text style={styles.receiptText}>{previewData?.orders?.total_orders ?? 0}</Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptText}>Total Amount</Text>
                      <Text style={styles.receiptText}>$ {money(previewData?.orders?.total_amount)}</Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptText}>Refunded Orders</Text>
                      <Text style={styles.receiptText}>{previewData?.orders?.refunded_orders ?? 0}</Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptText}>Refunded Amount</Text>
                      <Text style={styles.receiptText}>$ {money(previewData?.orders?.refunded_amount)}</Text>
                    </View>
                  </View>

                  <Text style={styles.receiptLine}>------------------------------------------</Text>

                  <View style={styles.receiptSection}>
                    <Text style={styles.receiptLabel}>CASH SUMMARY</Text>
                    {[
                      ['Opening', previewData?.cash_summary?.opening],
                      ['Cash In', previewData?.cash_summary?.cash_in],
                      ['Cash Out', previewData?.cash_summary?.cash_out],
                      ['Cash Sales', previewData?.cash_summary?.cash_sales],
                      ['Closing', previewData?.cash_summary?.closing],
                      ['Difference', previewData?.cash_summary?.difference],
                    ].map(([label, val]) => (
                      <View key={label} style={styles.receiptRow}>
                        <Text style={styles.receiptText}>{label}</Text>
                        <Text style={styles.receiptText}>$ {money(val)}</Text>
                      </View>
                    ))}
                  </View>

                  <Text style={styles.receiptLine}>------------------------------------------</Text>

                  <View style={styles.receiptSection}>
                    <Text style={styles.receiptLabel}>OTHER PAYMENTS</Text>
                    {(previewData?.other_payments || []).map((p, idx) => (
                      <View key={`${p?.name || 'payment'}-${idx}`} style={styles.receiptRow}>
                        <Text style={styles.receiptText}>{p?.name || '-'}</Text>
                        <Text style={styles.receiptText}>$ {money(p?.amount)}</Text>
                      </View>
                    ))}
                  </View>

                  <Text style={styles.receiptLine}>------------------------------------------</Text>
                  <Text style={styles.receiptFooter}>
                    Report generated at: {previewData?.report_generated_at || '-'}
                  </Text>
                </View>
              ) : null}

              <View style={styles.printSection}>
                <View style={styles.printRow}>
                  <TouchableOpacity
                    style={styles.registerSelectBtn}
                    onPress={() => {
                      if (!registerLoading) setRegisterModalVisible(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.registerSelectLabel}>Register</Text>
                    <Text
                      style={[
                        styles.registerSelectValue,
                        !selectedRegisterName && styles.registerPlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {registerLoading
                        ? 'Loading...'
                        : selectedRegisterName || 'Select Register'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.printBtn, (!selectedRegisterId || printLoading) && styles.printBtnDisabled]}
                    onPress={handlePrint}
                    disabled={!selectedRegisterId || printLoading}
                  >
                    <Text style={styles.printBtnText}>
                      {printLoading ? 'Printing...' : 'Print Receipt'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {!!printMessage && (
                  <Text style={styles.printMessage}>{printMessage}</Text>
                )}
              </View>
            </ScrollView>

            {registerModalVisible && (
              <View style={styles.innerOverlay}>
                <TouchableOpacity
                  style={styles.innerOverlayBackdrop}
                  activeOpacity={1}
                  onPress={() => setRegisterModalVisible(false)}
                />
                <View style={styles.registerModalCard}>
                  <Text style={styles.registerModalTitle}>Select Register</Text>

                  {registerLoading ? (
                    <View style={styles.centeredSmall}>
                      <ActivityIndicator size="small" />
                      <Text style={styles.loadingText}>Loading registers…</Text>
                    </View>
                  ) : registers.length === 0 ? (
                    <View style={styles.centeredSmall}>
                      <Text style={styles.emptyText}>No registers found.</Text>
                    </View>
                  ) : (
                    <ScrollView
                      style={styles.registerList}
                      contentContainerStyle={styles.registerListContent}
                      showsVerticalScrollIndicator={false}
                    >
                      {registers.map((item) => {
                        const active = String(selectedRegisterId) === String(item.id);
                        return (
                          <TouchableOpacity
                            key={String(item.id)}
                            style={[
                              styles.registerRow,
                              active && styles.registerRowActive,
                            ]}
                            onPress={() => {
                              setSelectedRegisterId(String(item.id));
                              setRegisterModalVisible(false);
                            }}
                          >
                            <Text
                              style={[
                                styles.registerRowText,
                                active && styles.registerRowTextActive,
                              ]}
                            >
                              {String(item.name)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}

                  <TouchableOpacity
                    style={[styles.btnBase, styles.closeRegisterBtn]}
                    onPress={() => setRegisterModalVisible(false)}
                  >
                    <Text style={styles.closeRegisterBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F7F8' },
  scrollArea: { flex: 1 },
  scrollContent: { paddingBottom: 16 },

  searchWrap: { paddingHorizontal: 12, paddingTop: 10 },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#111',
  },

  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tabBtnActive: { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#111' },
  tabTextActive: { color: '#1B5E20' },

  dateCard: {
    marginHorizontal: 12,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateCardHeader: { marginBottom: 10 },
  dateCardHeaderText: { fontSize: 14, fontWeight: '800', color: '#111' },
  dateCardSubText: { fontSize: 12, color: '#666', marginTop: 2 },
  datetimeselector: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  dateshow: { flex: 1 },
  dateLabel: { fontSize: 11, color: '#666', marginBottom: 6, fontWeight: '700' },
  dateBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  dateBadgeText: { fontSize: 12, fontWeight: '700', color: '#111' },
  applyBtn: {
    alignSelf: 'flex-end',
    backgroundColor: '#16A34A',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 10,
  },
  applyText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#111' },
  sectionMeta: { fontSize: 12, color: '#666', fontWeight: '700' },

  centered: { paddingVertical: 40, alignItems: 'center' },
  centeredSmall: { paddingVertical: 20, alignItems: 'center' },
  loadingText: { marginTop: 8, color: '#666' },
  errorText: { color: '#B91C1C', fontSize: 13, fontWeight: '600' },
  emptyText: { color: '#666', fontSize: 13, fontStyle: 'italic' },

  cardsWrap: { paddingHorizontal: 12, paddingBottom: 16, gap: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#111' },
  cardSub: { fontSize: 12, color: '#555', marginTop: 6 },
  cardMetaRow: { marginTop: 6, gap: 4 },
  cardMeta: { fontSize: 11, color: '#666' },
  stateBadge: {
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  stateBadgeClosed: { backgroundColor: '#DCFCE7' },
  stateText: { fontSize: 10, fontWeight: '700', color: '#111' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderColor: '#EEE',
  },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#111' },
  modalClose: { fontSize: 12, fontWeight: '700', color: '#111' },
  modalBody: { padding: 14 },

  receiptWrap: { gap: 12 },
  receiptHeader: { alignItems: 'center', gap: 4 },
  receiptTitle: { fontSize: 16, fontWeight: '800', color: '#111', textAlign: 'center' },
  receiptText: {
    fontSize: 12,
    color: '#111',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
  },
  receiptLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
  },
  receiptSection: { gap: 4 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  receiptLine: {
    fontSize: 12,
    color: '#111',
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
  },
  receiptFooter: {
    textAlign: 'center',
    fontSize: 11,
    color: '#111',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
  },

  printSection: { marginTop: 16, gap: 10 },
  printRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },

  registerSelectBtn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    minHeight: 48,
  },
  registerSelectLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#111',
    marginBottom: 4,
  },
  registerSelectValue: {
    fontSize: 12,
    color: '#111',
  },
  registerPlaceholder: {
    color: '#6B7280',
  },

  printBtn: {
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  printBtnDisabled: { opacity: 0.5 },
  printBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  printMessage: { fontSize: 12, color: '#111', textAlign: 'center' },

  innerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    elevation: 40,
  },
  innerOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },

  registerModalCard: {
    width: '88%',
    maxWidth: 420,
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    zIndex: 1000,
    elevation: 50,
  },
  registerModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111',
    marginBottom: 12,
  },
  registerList: {
    maxHeight: 320,
  },
  registerListContent: {
    paddingBottom: 8,
  },
  registerRow: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  registerRowActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#16A34A',
  },
  registerRowText: {
    fontSize: 13,
    color: '#111',
    fontWeight: '600',
  },
  registerRowTextActive: {
    color: '#15803D',
    fontWeight: '800',
  },

  btnBase: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeRegisterBtn: {
    backgroundColor: '#111827',
    marginTop: 10,
  },
  closeRegisterBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
});