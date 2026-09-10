import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  TouchableOpacity,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import reportbg from '../../assets/images/report-bg.png';
import AppHeader from '../../components/AppHeader';
import { fetchRedProducts } from '../../components/icms/RedProductsAPI';
import EditRedProduct from '../../components/icms/EditRedProduct';
import LinkProductModal from '../../components/icms/LinkProduct';
import { initICMSBase } from '../../../icms_config/api';
import DateRangeSelector from '../../components/DateRangeSelector';

const getImageSource = val => (typeof val === 'number' ? val : { uri: val });

const formatDate = dateStr => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
};

export default function RedProductsScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const styles = getStyles(isTablet);
  if (
    Platform.OS === 'android' &&
    UIManager.setLayoutAnimationEnabledExperimental
  ) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [editVisible, setEditVisible] = useState(false);
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [linkingItem, setLinkingItem] = useState(null);
  const [linkingInvoice, setLinkingInvoice] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [range, setRange] = useState(() => {
    const now = new Date();
    return { start: now, end: now };
  });

  const formatApiDate = date => {
    if (!date) return '';
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${yyyy}-${mm}-${dd}`;
  };

  const loadData = useCallback(async (startDate, endDate) => {
    setLoading(true);
    setError('');
    try {
      await initICMSBase();
      const data = await fetchRedProducts({
        startDate: startDate || formatApiDate(range.start),
        endDate: endDate || formatApiDate(range.end),
      });
      setRows(data);
    } catch (e) {
      setError('Failed to load red products.');
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const openEdit = item => {
    setSelectedItem(item);
    setEditVisible(true);
  };

  const closeEdit = () => {
    setEditVisible(false);
    setSelectedItem(null);
  };

  const mapToLinkingItem = item => ({
    itemNo: item?.Item ?? item?.itemNumber ?? item?.ItemNo ?? item?.itemNo,
    extendedPrice: item?.ExtendedPrice ?? item?.extendedPrice,
    description: item?.Description ?? item?.description,
    qty: item?.Quantity ?? item?.quantity,
    cost: item?.Price ?? item?.price,
    size: item?.Size ?? item?.size,
    ProductId: item?.ProductId ?? item?.productId ?? item?._id,
    isReviewed: item?.isReviewed,
    DefaultLinking: item?.DefaultLinking,
    StockSpliting: item?.StockSpliting,
    LinkingCorrect: item?.LinkingCorrect,
    LinkByBarcode: item?.LinkByBarcode,
    LinkByName: item?.LinkByName,
  });

  const mapToInvoice = item => ({
    SavedDate: item?.InvoiceDate ?? item?.createdAt,
    SavedInvoiceNo: item?.InvoiceNumber ?? item?.InvoiceNo ?? item?.invoiceNo,
    InvoiceName: item?.InvoiceName ?? item?.vendorName ?? item?.invoiceName,
  });

  const openLinkProduct = item => {
    setLinkingItem(mapToLinkingItem(item));
    setLinkingInvoice(mapToInvoice(item));
    setLinkModalVisible(true);
  };

  const handleProductSelect = () => {
    loadData();
  };

  const getRowId = (item, index) =>
    item?._id ?? item?.ProductId ?? item?.Item ?? `${item?.itemNumber ?? 'row'}-${index}`;

  const toggleExpand = id => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(prev => (prev === id ? null : id));
  };

  const isSameRow = (row, updated) => {
    if (row?._id && updated?._id) return row._id === updated._id;
    if (row?.ProductId && updated?.ProductId) return row.ProductId === updated.ProductId;
    const rowItem = row?.Item ?? row?.itemNumber ?? row?.ItemNo ?? row?.itemNo;
    const updItem = updated?.Item ?? updated?.itemNumber ?? updated?.ItemNo ?? updated?.itemNo;
    return rowItem && updItem ? rowItem === updItem : false;
  };

  const handleSave = () => {
    loadData();
  };

  const renderHeader = () => (
    <View style={styles.headerRow}>
      <Text style={[styles.headerText, styles.colItem]}>Item</Text>
      <Text style={[styles.headerText, styles.colInvoiceNumber]}>Inv No</Text>
      <Text style={[styles.headerText, styles.colDescription]}>Description</Text>
    </View>
  );

  const truncateText = (value, maxLen = 10) => {
    const str = (value ?? '').toString();
    if (str.length <= maxLen) return str;
    return `${str.slice(0, maxLen)}...`;
  };

  const renderRow = ({ item, index }) => {
    const rowId = getRowId(item, index);
    const isExpanded = expandedId === rowId;
    return (
      <TouchableOpacity
        onPress={() => toggleExpand(rowId)}
        activeOpacity={0.8}
        style={[styles.card, index % 2 === 1 && styles.rowAlt]}
      >
        <View style={styles.row}>
          <Text style={[styles.cellText, styles.colItem]} numberOfLines={1}>
            {item?.Item || '-'}
          </Text>
          <Text style={[styles.cellText, styles.colInvoiceNumber]} numberOfLines={1}>
            {item?.InvoiceNumber || '-'}
          </Text>
          <Text style={[styles.cellText, styles.colDescription]} numberOfLines={1}>
            {truncateText(item?.Description || '-', 10)}
          </Text>
        </View>

        {isExpanded && (
          <View style={styles.expanded}>
            {[
              ['Invoice Name', item?.InvoiceName],
              ['Invoice No', item?.InvoiceNumber],
              ['Item', item?.Item],
              ['Description', item?.Description],
              ['Quantity', item?.Quantity ?? item?.Qty],
              ['Pieces', item?.price ?? item?.pieces],
             ['Case Cost', item?.price ?? item?.Price],
              ['Extended Price', item?.extendedPrice ?? item?.ExtendedPrice],
              ['Department', item?.Department],
              ['Created', formatDate(item?.createdAt)],
            ].map(([label, value], idx) => (
              <View key={`${label}-${idx}`} style={styles.expandedRow}>
                <Text style={styles.expandedLabel}>{label}:</Text>
                <Text style={styles.expandedValue}>{value ?? '-'}</Text>
              </View>
            ))}

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.linkBtn]}
                onPress={() => openLinkProduct(item)}
              >
                <Text style={styles.actionText}>Link</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const filteredRows = rows.filter(item => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      item?.Description,
      item?.Item,
      item?.InvoiceNumber,
      item?.InvoiceName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  return (
    <ImageBackground source={getImageSource(reportbg)} style={styles.screen} resizeMode="cover">
      <AppHeader Title="Red Products" backgroundType="image" backgroundValue={reportbg} >
          <DateRangeSelector
          start={range.start}
          end={range.end}
          includeTime={false}
          label="Select Date"
          onChange={(next) => {
            setRange({ start: next.start, end: next.end });
            loadData(formatApiDate(next.start), formatApiDate(next.end));
          }}
        />
        </AppHeader>
      <View style={styles.panelInner}>
      
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <>
            {!!error && <Text style={styles.errorText}>{error}</Text>}
            <View style={styles.searchWrap}>
              <Text style={styles.searchLabel}>Search</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Description, item, invoice no, invoice name"
                style={[styles.searchInput, { color: '#1f1f1f' }]}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#6b7280"
                selectionColor="#1f1f1f"
              />
            </View>
            <View style={styles.tableWrap}>
              {renderHeader()}
              <FlatList
                data={filteredRows}
                keyExtractor={(item, idx) => String(getRowId(item, idx))}
                renderItem={renderRow}
                ListEmptyComponent={
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyText}>
                      {query ? 'No matching results.' : 'No red products found.'}
                    </Text>
                  </View>
                }
              />
            </View>
            {/* <EditRedProduct
              visible={editVisible}
              item={selectedItem}
              onClose={closeEdit}
              onSave={handleSave}
            /> */}
            {linkModalVisible && (
              <LinkProductModal
                visible={linkModalVisible}
                onClose={() => setLinkModalVisible(false)}
                onSelect={handleProductSelect}
                linkingItem={linkingItem}
                invoice={linkingInvoice}
              />
            )}
          </>
        )}
      </View>
    </ImageBackground>
  );
}

const getStyles = isTablet =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    panelInner: {
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.85)',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingVertical: isTablet ? 14 : 10,
      paddingHorizontal: isTablet ? 16 : 12,
    },
    searchWrap: {
      marginTop: 8,
      marginBottom: 6,
    },
    searchLabel: {
      fontSize: isTablet ? 13 : 12,
      fontWeight: '700',
      color: '#1b1b1b',
      marginBottom: 6,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: '#cfd6ea',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: isTablet ? 10 : 8,
      backgroundColor: '#fff',
      fontSize: isTablet ? 14 : 13,
      color: '#1f1f1f',
    },
    tableWrap: {
      marginTop: 12,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#d6defc',
      backgroundColor: '#fff',
    },
    card: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: '#e4e7ef',
    },
    headerRow: {
      flexDirection: 'row',
      backgroundColor: '#eef3ff',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: '#d6defc',
      paddingVertical: 10,
      paddingHorizontal: 8,
    },
    row: {
      flexDirection: 'row',
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    rowAlt: {
      backgroundColor: '#f9fafc',
    },
    headerText: {
      fontWeight: '700',
      fontSize: isTablet ? 14 : 13,
      color: '#1b1b1b',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    cellText: {
      fontSize: isTablet ? 14 : 13,
      color: '#1f1f1f',
    },
    colItem: { flex: 1.1, minWidth: isTablet ? 120 : 96, paddingRight: 6 },
    colInvoiceNumber: { flex: 0.9, minWidth: isTablet ? 90 : 80, paddingRight: 6 },
    colDescription: { flex: 1.6, minWidth: isTablet ? 160 : 130, paddingRight: 6 },
    expanded: {
      backgroundColor: '#f3f6ff',
      paddingHorizontal: 10,
      paddingBottom: 12,
      paddingTop: 6,
    },
    expandedRow: {
      flexDirection: 'row',
      paddingVertical: 4,
    },
    expandedLabel: {
      flex: 1,
      fontWeight: '700',
      color: '#334155',
      fontSize: isTablet ? 12 : 11,
    },
    expandedValue: {
      flex: 2,
      color: '#0b1324',
      fontSize: isTablet ? 12 : 11,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 10,
    },
    actionBtn: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
    },
    editBtn: {
      backgroundColor: '#10B981',
    },
    linkBtn: {
      backgroundColor: '#005f9f',
    },
    actionText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: isTablet ? 12 : 11,
    },
    emptyWrap: {
      paddingVertical: 20,
      alignItems: 'center',
    },
    emptyText: {
      color: '#555',
      fontSize: 14,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorText: {
      color: '#c0392b',
      fontWeight: '600',
      marginBottom: 8,
    },
  });
