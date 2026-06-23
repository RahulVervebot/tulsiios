import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  ScrollView,
  FlatList,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AppHeader from '../components/AppHeader';
import reportbg from '../assets/images/report-bg.png';
import DateRangePickerModal from '../components/DateRangePickerModal';
import { SectionCard, currency, safeNumber, sumBy } from '../components/reports/shared/ReportUI';
import { OrderHoldReport, OrderPaidReport, OrderHoldDetailReport, OrderPaidDetailReport,OrderTransactions } from '../functions/reports/pos_reports';
export default function OrderHold() {
  const pad = (n) => String(n).padStart(2, '0');
  const fmtLocal = (d) => {
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
  };
  const fmtDateOnly = (d) => {
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    return `${y}-${m}-${day}`;
  };
  const formatNumber = (value, digits = 2) =>
    safeNumber(value).toLocaleString(undefined, { maximumFractionDigits: digits });

  const [pickerVisible, setPickerVisible] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState('hold'); // 'hold' or 'paid'
  const [searchText, setSearchText] = useState('');
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [transactionModalVisible, setTransactionModalVisible] = useState(false);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionData, setTransactionData] = useState(null);
  const [transactionError, setTransactionError] = useState('');

  const [range, setRange] = useState(() => {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return { start, end };
  });

  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const styles = getStyles(isTablet);

  const reqIdRef = useRef(0);

  const fetchOrders = useCallback(async (startDate, endDate, tabType) => {
    const id = ++reqIdRef.current;
    setLoading(true);
    setErrorMsg('');
    try {
      const report = tabType === 'hold' 
        ? await OrderHoldReport(fmtLocal(startDate), fmtLocal(endDate))
        : await OrderPaidReport(fmtLocal(startDate), fmtLocal(endDate));
      
      if (id !== reqIdRef.current) return;
      
      const list = Array.isArray(report?.orders) ? report.orders : [];
      setOrders(list);
      setLoading(false);
    } catch (e) {
      if (id !== reqIdRef.current) return;
      setOrders([]);
      setLoading(false);
      setErrorMsg(e?.message || 'Failed to load orders.');
      console.log('error:', e?.message || e);
    }
  }, []);

  useEffect(() => {
    fetchOrders(range.start, range.end, activeTab);
  }, [activeTab, range]);

  const handleShowDetail = useCallback(async (orderId) => {
    setDetailModalVisible(true);
    setDetailLoading(true);
    setDetailError('');
    setDetailData(null);
    setSelectedOrderId(orderId);

    try {
      const detail = activeTab === 'hold'
        ? await OrderHoldDetailReport(orderId)
        : await OrderPaidDetailReport(orderId);
      setDetailData(detail);
    } catch (e) {
      setDetailError(e?.message || 'Failed to load order details.');
      console.log('detail error:', e?.message || e);
    } finally {
      setDetailLoading(false);
    }
  }, [activeTab]);

  const handleShowTransactions = useCallback(async (orderId) => {
    setTransactionModalVisible(true);
    setTransactionLoading(true);
    setTransactionError('');
    setTransactionData(null);

    try {
      const txnData = await OrderTransactions(orderId);
      setTransactionData(txnData);
    } catch (e) {
      setTransactionError(e?.message || 'Failed to load transactions.');
      console.log('transaction error:', e?.message || e);
    } finally {
      setTransactionLoading(false);
    }
  }, []);

  const filteredOrders = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return orders;

    return orders.filter((item) => {
      const ref = String(item?.orderReference || '').toLowerCase();
      const partner = String(item?.partnerName || '').toLowerCase();
      const session = String(item?.posSession || '').toLowerCase();
      const userName = String(item?.userName || '').toLowerCase();

      return (
        ref.includes(term) ||
        partner.includes(term) ||
        session.includes(term) ||
        userName.includes(term)
      );
    });
  }, [orders, searchText]);

  const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

  const renderOrderItem = ({ item }) => {
    return (
      <View style={styles.orderCard}>
        <View style={styles.cardRow}>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item?.orderReference || '-'}
            </Text>
            <Text style={styles.cardSubtext} numberOfLines={1}>
              {item?.partnerName || '-'}
            </Text>
          </View>
          <View style={styles.cardAmount}>
            <Text style={styles.amountLabel}>Total: ${currency(safeNumber(item?.totalAmount))}</Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardRow}>
          <View style={styles.cardField}>
            <Text style={styles.fieldLabel}>Session</Text>
            <Text style={styles.fieldValue} numberOfLines={1}>{item?.posSession || '-'}</Text>
          </View>
          <View style={styles.cardField}>
            <Text style={styles.fieldLabel}>Staff</Text>
            <Text style={styles.fieldValue} numberOfLines={1}>{item?.userName || '-'}</Text>
          </View>
        </View>

        <View style={styles.cardRow}>
          <View style={styles.cardField}>
            <Text style={styles.fieldLabel}>Date</Text>
            <Text style={styles.fieldValue} numberOfLines={1}>{item?.orderDate || '-'}</Text>
          </View>
        </View>

        <View style={styles.cardRow}>
          <View style={styles.cardField}>
            <Text style={styles.fieldLabel}>Paid</Text>
            <Text style={styles.fieldValue}>${currency(safeNumber(item?.paidAmount))}</Text>
          </View>
          <View style={styles.cardField}>
            <Text style={styles.fieldLabel}>Remaining</Text>
            <Text style={[styles.fieldValue, { color: '#d32f2f' }]}>
              ${currency(safeNumber(item?.remainingAmount))}
            </Text>
          </View>
        </View>
<View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
   <TouchableOpacity
        onPress={() => handleShowDetail(item.orderId)}
        activeOpacity={0.8}
        style={styles.transactionBtn}
      >
        <Text style={styles.transactionBtnText}>Order Details</Text>
      </TouchableOpacity>
        <TouchableOpacity
          style={styles.transactionBtn}
          onPress={() => handleShowTransactions(item.orderId)}
          activeOpacity={0.75}
        >
          <Icon name="receipt" size={16} color="#fff" />
          <Text style={styles.transactionBtnText}>View Transactions</Text>
        </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ImageBackground source={getImageSource(reportbg)} style={styles.screen} resizeMode="cover">
      <AppHeader Title={activeTab === 'hold' ? "Hold Orders" : "Paid Orders"} backgroundType="image" backgroundValue={reportbg} />

      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.filterIconBtn}
          onPress={() => setPickerVisible(true)}
          activeOpacity={0.85}
        >
          <Icon name="filter-list" size={22} color="#111" />
        </TouchableOpacity>

        <View style={styles.searchBox}>
          <Icon name="search" size={20} color="#6B7280" />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search by Order, Partner, Session"
            placeholderTextColor="#9CA3AF"
            style={styles.searchInput}
            autoCapitalize="none"
          />
        </View>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'hold' && styles.tabActive]}
          onPress={() => {
            setActiveTab('hold');
            setSearchText('');
          }}
        >
          <Text style={[styles.tabText, activeTab === 'hold' && styles.tabTextActive]}>
            Hold Orders
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'paid' && styles.tabActive]}
          onPress={() => {
            setActiveTab('paid');
            setSearchText('');
          }}
        >
          <Text style={[styles.tabText, activeTab === 'paid' && styles.tabTextActive]}>
            Paid Orders
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" />
            <Text style={styles.centerText}>Loading…</Text>
          </View>
        ) : filteredOrders.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.centerText}>
              {errorMsg || `No ${activeTab === 'hold' ? 'hold' : 'paid'} orders for this range.`}
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            <FlatList
              data={filteredOrders}
              keyExtractor={(item, idx) => `${item?.orderId || 'order'}-${idx}`}
              renderItem={renderOrderItem}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.gap} />}
              contentContainerStyle={styles.listContent}
            />
          </View>
        )}
      </ScrollView>

      <DateRangePickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onApply={({ start, end }) => {
          setRange({ start, end });
          setPickerVisible(false);
          setSearchText('');
          fetchOrders(start, end, activeTab);
        }}
        initialPreset="today"
      />

      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.detailModalBackdrop}>
          <View style={styles.detailModalCard}>
            <View style={styles.detailModalHeader}>
              <Text style={styles.detailModalTitle}>Order Details</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Icon name="close" size={24} color="#111" />
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <View style={styles.detailCentered}>
                <ActivityIndicator size="large" />
              </View>
            ) : detailError ? (
              <View style={styles.detailCentered}>
                <Text style={styles.detailErrorText}>{detailError}</Text>
              </View>
            ) : detailData ? (
              <ScrollView style={styles.detailContent} showsVerticalScrollIndicator={false}>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Order Reference</Text>
                  <Text style={styles.detailValue}>{detailData?.orderReference || '-'}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Order Date</Text>
                  <Text style={styles.detailValue}>{detailData?.orderDate || '-'}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Total Order Amount</Text>
                  <Text style={[styles.detailValue, { fontSize: 16, fontWeight: '800', color: '#1B5E20' }]}>
                    ${currency(safeNumber(detailData?.totalOrderAmount))}
                  </Text>
                </View>

                <View style={styles.detailDivider} />

                <Text style={styles.detailItemsTitle}>Order Items</Text>

                {Array.isArray(detailData?.orderDetail) && detailData.orderDetail.length > 0 ? (
                  <View>
                    {detailData.orderDetail.map((item, idx) => (
                      <View key={`${item?.productId || 'item'}-${idx}`} style={styles.detailItemCard}>
                        <View style={styles.itemRow}>
                          <Text style={styles.itemName} numberOfLines={2}>
                            {item?.productName || '-'}
                          </Text>
                          <Text style={styles.itemPrice}>
                            ${currency(safeNumber(item?.priceUnit))}
                          </Text>
                        </View>

                        <View style={styles.itemRow}>
                          <Text style={styles.itemLabel}>Barcode</Text>
                          <Text style={styles.itemValue}>{item?.productBarcode || '-'}</Text>
                        </View>

                        <View style={styles.itemRow}>
                          <View style={styles.itemField}>
                            <Text style={styles.itemLabel}>Quantity</Text>
                            <Text style={styles.itemValue}>{formatNumber(item?.quantity, 0)}</Text>
                          </View>
                          <View style={styles.itemField}>
                            <Text style={styles.itemLabel}>Discount</Text>
                            <Text style={styles.itemValue}>${currency(safeNumber(item?.discount))}</Text>
                          </View>
                          <View style={styles.itemField}>
                            <Text style={styles.itemLabel}>Total</Text>
                            <Text style={[styles.itemValue, { fontWeight: '700' }]}>
                              ${currency(safeNumber(item?.totalPrice))}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyItemsText}>No items found.</Text>
                )}
              </ScrollView>
            ) : (
              <View style={styles.detailCentered}>
                <Text style={styles.detailErrorText}>No data available</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={transactionModalVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => setTransactionModalVisible(false)}
      >
        <View style={styles.detailModalBackdrop}>
          <View style={styles.detailModalCard}>
            <View style={styles.detailModalHeader}>
              <Text style={styles.detailModalTitle}>Transactions</Text>
              <TouchableOpacity onPress={() => setTransactionModalVisible(false)}>
                <Icon name="close" size={24} color="#111" />
              </TouchableOpacity>
            </View>

            {transactionLoading ? (
              <View style={styles.detailCentered}>
                <ActivityIndicator size="large" />
              </View>
            ) : transactionError ? (
              <View style={styles.detailCentered}>
                <Text style={styles.detailErrorText}>{transactionError}</Text>
              </View>
            ) : transactionData ? (
              <ScrollView style={styles.detailContent} showsVerticalScrollIndicator={false}>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Order Number</Text>
                  <Text style={styles.detailValue}>{transactionData?.orderNumber || '-'}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Paid Order Number</Text>
                  <Text style={styles.detailValue}>{transactionData?.paidOrderNumber || '-'}</Text>
                </View>

                <View style={styles.detailDivider} />

                <Text style={styles.detailItemsTitle}>Payment Transactions</Text>

                {Array.isArray(transactionData?.transactionsDetail) && transactionData.transactionsDetail.length > 0 ? (
                  <View>
                    {transactionData.transactionsDetail.map((txn, idx) => (
                      <View key={`${txn?.date || 'txn'}-${idx}`} style={styles.transactionItemCard}>
                        <View style={styles.itemRow}>
                          <View style={styles.txnField}>
                            <Text style={styles.itemLabel}>Date</Text>
                            <Text style={styles.itemValue}>{txn?.date || '-'}</Text>
                          </View>
                          <View style={styles.txnField}>
                            <Text style={styles.itemLabel}>Method</Text>
                            <Text style={styles.itemValue}>{txn?.paymentMethod || '-'}</Text>
                          </View>
                        </View>
                        <View style={styles.itemRow}>
                          <Text style={styles.itemLabel}>Amount</Text>
                          <Text style={[styles.itemPrice, { color: '#1B5E20', fontWeight: '800' }]}>
                            ${currency(safeNumber(txn?.amount))}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyItemsText}>No transactions found.</Text>
                )}

                <View style={styles.detailDivider} />

                <View style={styles.summaryContainer}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Total Amount</Text>
                    <Text style={styles.summaryValue}>${currency(safeNumber(transactionData?.totalAmount))}</Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Paid Amount</Text>
                    <Text style={styles.summaryValue}>${currency(safeNumber(transactionData?.paidAmount))}</Text>
                  </View>

                  <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.summaryLabel}>Remaining Amount</Text>
                    <Text style={[styles.summaryValue, { color: '#d32f2f' }]}>
                      ${currency(safeNumber(transactionData?.remainingAmount))}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            ) : (
              <View style={styles.detailCentered}>
                <Text style={styles.detailErrorText}>No data available</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const getStyles = (isTablet) =>
  StyleSheet.create({
    screen: { flex: 1 },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 10,
      backgroundColor: 'rgba(255,255,255,0.9)',
    },
    filterIconBtn: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 8,
      backgroundColor: '#f5f5f5',
    },
    searchBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#f5f5f5',
      borderRadius: 8,
      paddingHorizontal: 12,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      height: 40,
      fontSize: 14,
      color: '#111',
    },

    tabBar: {
      flexDirection: 'row',
      backgroundColor: 'rgba(255,255,255,0.85)',
      borderBottomWidth: 1,
      borderBottomColor: '#E6E6E6',
    },
    tab: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderBottomWidth: 3,
      borderBottomColor: 'transparent',
    },
    tabActive: {
      borderBottomColor: '#1B5E20',
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#666',
    },
    tabTextActive: {
      color: '#1B5E20',
    },

    scrollArea: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: 20,
      backgroundColor: 'rgba(255,255,255,0.85)',
    },

    listContainer: { flex: 1 },
    listContent: {
      padding: 12,
    },
    gap: { height: 8 },

    orderCard: {
      backgroundColor: '#fff',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#E6E6E6',
      padding: 12,
      ...Platform.select({
        android: { elevation: 2 },
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
        },
      }),
    },

    cardRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    cardContent: {
      flex: 1,
      marginRight: 12,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#111',
      marginBottom: 4,
    },
    cardSubtext: {
      fontSize: 12,
      color: '#666',
    },
    cardAmount: {
      alignItems: 'flex-end',
    },
    amountLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: '#1B5E20',
    },

    cardDivider: {
      height: 1,
      backgroundColor: '#E6E6E6',
      marginVertical: 10,
    },

    cardField: {
      flex: 1,
    },
    fieldLabel: {
      fontSize: 11,
      color: '#666',
      fontWeight: '600',
      marginBottom: 2,
    },
    fieldValue: {
      fontSize: 12,
      color: '#111',
      fontWeight: '600',
    },

    transactionBtn: {
      marginTop: 10,
      backgroundColor: '#1B5E20',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    transactionBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 12,
    },

    centerState: {
      paddingVertical: 60,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centerText: {
      marginTop: 12,
      color: '#666',
      fontSize: 14,
    },

    // Detail Modal Styles
    detailModalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    detailModalCard: {
      backgroundColor: '#fff',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: '90%',
      flexGrow: 1,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 10,
          shadowOffset: { height: -3 },
        },
      }),
    },
    detailModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: '#E6E6E6',
    },
    detailModalTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: '#111',
    },
    detailContent: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    detailCentered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    detailErrorText: {
      fontSize: 14,
      color: '#d32f2f',
      textAlign: 'center',
    },

    detailSection: {
      marginBottom: 14,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#F0F0F0',
    },
    detailLabel: {
      fontSize: 11,
      color: '#666',
      fontWeight: '600',
      marginBottom: 4,
    },
    detailValue: {
      fontSize: 13,
      color: '#111',
      fontWeight: '600',
    },

    detailDivider: {
      height: 2,
      backgroundColor: '#E6E6E6',
      marginVertical: 16,
    },

    detailItemsTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#111',
      marginBottom: 12,
    },

    detailItemCard: {
      backgroundColor: '#F8F8F8',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#E6E6E6',
      padding: 12,
      marginBottom: 10,
    },
    itemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    itemName: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: '#111',
      marginRight: 8,
    },
    itemPrice: {
      fontSize: 13,
      fontWeight: '700',
      color: '#1B5E20',
    },
    itemLabel: {
      fontSize: 10,
      color: '#666',
      fontWeight: '600',
      marginBottom: 2,
    },
    itemValue: {
      fontSize: 12,
      color: '#111',
      fontWeight: '600',
    },
    itemField: {
      flex: 1,
    },
    emptyItemsText: {
      fontSize: 12,
      color: '#999',
      fontStyle: 'italic',
      textAlign: 'center',
      paddingVertical: 20,
    },

    transactionItemCard: {
      backgroundColor: '#F8F8F8',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#E6E6E6',
      padding: 12,
      marginBottom: 10,
    },
    txnField: {
      flex: 1,
    },

    summaryContainer: {
      backgroundColor: '#FFF7E6',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#FFE59D',
      padding: 12,
      marginTop: 12,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#FFE59D',
    },
    summaryLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: '#333',
    },
    summaryValue: {
      fontSize: 13,
      fontWeight: '800',
      color: '#1B5E20',
    },
  });
