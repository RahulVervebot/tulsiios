//invoxie deatail.js
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  ImageBackground
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppHeader from '../../components/AppHeader.js';
import EditProduct from '../../components/icms/EditProduct.js';
import reportbg from '../../assets/images/report-bg.png';
import InvoiceRow from '../../components/icms/InvoiceRow.js';
import { useRoute } from '@react-navigation/native';
import LinkProductModal from '../../components/icms/LinkProduct.js';
import API_ENDPOINTS, { initICMSBase } from '../../../icms_config/api';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const getImageSource = val => (typeof val === 'number' ? val : { uri: val });
const isItemRow = (x) =>
  !!x &&
  typeof x === 'object' &&
  (
    x.description != null ||
    x.barcode != null ||
    x.itemNo != null ||
    x.ProductId != null ||
    x.unitPrice != null ||
    x.extendedPrice != null
  );

const extractRowsFromPayload = (payload, fallbackInvoice) => {
  if (Array.isArray(payload?.InvoiceData)) return payload.InvoiceData;
  if (Array.isArray(payload?.tableData)) return payload.tableData;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload) && Array.isArray(payload?.[0]?.InvoiceData)) return payload[0].InvoiceData;
  if (Array.isArray(payload) && Array.isArray(payload?.[0]?.tableData)) return payload[0].tableData;
  if (Array.isArray(payload) && payload.every(isItemRow)) return payload;
  if (isItemRow(payload)) return [payload];
  if (Array.isArray(fallbackInvoice?.InvoiceData)) return fallbackInvoice.InvoiceData;
  if (Array.isArray(fallbackInvoice?.tableData)) return fallbackInvoice.tableData;
  return [];
};

export default function InvoiceDetails() {
  const itemsRef = useRef([]);
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [linkingItem, setLinkingItem] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [invoiceData, setInvoiceData] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [query, setQuery] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferMessage, setTransferMessage] = useState('');
  const [storedVendor, setStoredVendor] = useState(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [categories, setCategories] = useState([]);
  const [posUpdateLoading, setPosUpdateLoading] = useState(false);
  const [loadingConfirmAiId, setLoadingConfirmAiId] = useState(null);
  const [loadingUnlinkId, setLoadingUnlinkId] = useState(null);
  const [isicmsstore, setIsICMSStore] = useState(null);
  const route = useRoute();
  const params = route?.params ?? {};
  const fallbackInvoice = params?.Invoice ?? null;
  const invoiceNoParam = params?.invoiceNo ?? fallbackInvoice?.SavedInvoiceNo ?? '';
  const invoiceNameParam = params?.invoiceName ?? fallbackInvoice?.InvoiceName ?? '';
  const dateParam = params?.date ?? fallbackInvoice?.SavedDate ?? '';

  const fetchInvoiceData = useCallback(async () => {
    const hasRequiredPayload = !!(invoiceNoParam && invoiceNameParam && dateParam);
    if (!hasRequiredPayload) {
      setInvoiceData(fallbackInvoice);
      itemsRef.current = extractRowsFromPayload(fallbackInvoice, fallbackInvoice);
      return;
    }

    try {
      setInvoiceLoading(true);
      setInvoiceError('');
      await initICMSBase();
      const token = await AsyncStorage.getItem('access_token');
      const icms_store = await AsyncStorage.getItem('icms_store');
       const storeurl = await AsyncStorage.getItem('storeurl');
       setIsICMSStore(icms_store);
      const bodyPayload = {
        invoiceNo: invoiceNoParam,
        invoiceName: invoiceNameParam,
        date: dateParam,
      };

      const res = await fetch(API_ENDPOINTS.GETINVOICEDATA, {
        method: 'POST',
        body: JSON.stringify(bodyPayload),
        headers: {
         'Content-Type': 'application/json',
          store: icms_store ?? '',
          app_url: storeurl,
          access_token: token ?? '',
          mode: 'MOBILE',
        },
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json?.message || json?.error?.message || 'Failed to fetch invoice details';
        throw new Error(msg);
      }
console.log("resonse details:",json);
      const normalized = Array.isArray(json) ? (json[0] ?? null) : json;
      const normalizedInvoice = isItemRow(normalized)
        ? {
            SavedInvoiceNo: invoiceNoParam,
            InvoiceName: invoiceNameParam,
            SavedDate: dateParam,
          }
        : (normalized || fallbackInvoice || null);

      setInvoiceData(normalizedInvoice);
      itemsRef.current = extractRowsFromPayload(json, fallbackInvoice);
    } catch (e) {
      setInvoiceError(e?.message || 'Failed to fetch invoice details');
      setInvoiceData(fallbackInvoice || null);
      itemsRef.current = extractRowsFromPayload(fallbackInvoice, fallbackInvoice);
    } finally {
      setInvoiceLoading(false);
    }
  }, [dateParam, fallbackInvoice, invoiceNameParam, invoiceNoParam]);

  useEffect(() => {
    fetchInvoiceData();
    setSelectedIds(new Set());
  }, [fetchInvoiceData]);

  useEffect(() => {
    const loadVendor = async () => {
      try {
        const value = await AsyncStorage.getItem('vendor');
        if (value) setStoredVendor(JSON.parse(value));
      } catch {
        setStoredVendor(null);
      }
    };
    loadVendor();
  }, []);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const storeUrl = await AsyncStorage.getItem('storeurl');
        const token = await AsyncStorage.getItem('access_token');
        if (!storeUrl || !token) return;
        const url = `${storeUrl}/pos/app/categories`;
        const res = await fetch(url, {
          method: 'GET',
          headers: { accept: 'application/json', access_token: token },
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => ({}));
        setCategories(Array.isArray(json?.categories) ? json.categories : []);
      } catch {
        setCategories([]);
      }
    };
    fetchCategories();
  }, []);

  const categoryMetaByDept = useMemo(() => {
    const map = {};
    (categories || []).forEach((cat) => {
      const key = String(cat?.categoryName ?? '').trim().toLowerCase();
      if (!key) return;
      map[key] = {
        margin: Number(cat?.categoryMargin ?? 0),
        markup: Number(cat?.categoryMarkup ?? 0),
        pp: Number(cat?.categoryPP ?? cat?.categoryPp ?? cat?.categoryProfitPercentage ?? 0),
      };
    });
    return map;
  }, [categories]);

  const invoice = invoiceData || fallbackInvoice || {};
  const vendorDatabaseName =
    params?.vendorDatabaseName || invoice?.vendorDatabaseName || invoice?.invoice || '';
  const day = invoice?.SavedDate || dateParam;
  const InvNumber = invoice?.SavedInvoiceNo || invoiceNoParam;
  const vendorName = invoice?.InvoiceName || invoiceNameParam;
  const items = itemsRef.current;
  const totalExtendedPrice = items.reduce(
    (sum, item) => sum + (Number(item?.extendedPrice) || 0),
    0,
  );
  const totalUnitPrice = items.reduce(
    (sum, item) => sum + (Number(item?.unitPrice) || 0),
    0,
  );
  const totalRows = items.length;
  const filteredItems = items.filter(item => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      item?.description,
      item?.barcode,
      item?.itemNo,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
  // console.log('Invoice Details:', Invoice);
  const openModal = useCallback(item => {
    setSelectedItem(item);
    console.log("check all item fileds:",item);
    setModalVisible(true);
  }, []);
  const openLinkProduct = item => {
    setLinkingItem(item);
    setLinkModalVisible(true);
  };

  const handleProductSelect = async (product) => {
    console.log(
      `Link ${product.name} to invoice item ${linkingItem.ProductId}`,
    );
    // Refresh invoice data after successful linking
    await fetchInvoiceData();
  };

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setSelectedItem(null);
  }, []);

  const handleToggleSelect = id => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkUpdate = () => {
    const selectedItems = itemsRef.current.filter(item =>
      selectedIds.has(item.ProductId),
    );

    if (selectedItems.length === 0) {
      alert('Please select at least one row.');
      return;
    }

    // Example: increase cost by 10%
    const updatedItems = itemsRef.current.map(item => {
      if (selectedIds.has(item.ProductId)) {
        return {
          ...item,
          unitPrice: (Number(item.unitPrice) * 1.1).toFixed(2), // increase cost
          extendedPrice: (Number(item.extendedPrice) * 1.1).toFixed(2),
        };
      }
      return item;
    });

    itemsRef.current = updatedItems;
    setSelectedIds(new Set()); // clear selection
    alert(`Updated ${selectedItems.length} items successfully ✅`);
  };

  const handleLinkingRemove = async () => {
    const selectedItems = itemsRef.current.filter(item =>
      selectedIds.has(item.ProductId),
    );
    const selectedBarcodes = selectedItems
      .map(item => String(item?.barcode ?? '').trim())
      .filter(Boolean);
    if (!vendorDatabaseName) {
      alert('Vendor database name missing.');
      return;
    }
    if (selectedItems.length === 0) {
      alert('Please select at least one row.');
      return;
    }
    if (selectedBarcodes.length === 0) {
      alert('Please select rows that have barcode.');
      return;
    }
    try {
      setTransferLoading(true);
      setTransferMessage('');
      await initICMSBase();
      const token = await AsyncStorage.getItem('access_token');
      const icms_store = await AsyncStorage.getItem('icms_store');
     const userEmail = await AsyncStorage.getItem('userEmail');
     const storeurl = await AsyncStorage.getItem('storeurl');
     
      console.log("token:",token,storeurl);
      const res = await fetch(API_ENDPOINTS.REMOVE_LINKING, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: token ?? '',
          pos_access_token: token ?? '',
          pos_api: `${storeurl}/api/v1`,
          app_url: storeurl,
          mode: 'MOBILE',
          store: icms_store,
          // vendordetails: storedVendor ? JSON.stringify(storedVendor) : '',
        },
        body: JSON.stringify({
          invoice: vendorDatabaseName,
          barcodes: selectedBarcodes,
        }),
      });
       const bodyres = JSON.stringify({
          invoice: vendorDatabaseName,
          barcodes: selectedBarcodes,
        })
      const json = await res.json().catch(() => ({}));
      
       console.log("items link",bodyres);
       console.log("resposne link",res);

      if (!res.ok) {
        const msg = json?.message || json?.error?.message || 'Failed to link items';
        throw new Error(msg);
      }
      fetchInvoiceData();
      setTransferMessage(json?.message || '');
      setSelectedIds(new Set());
    } catch (err) {
      setTransferMessage(err?.message || 'Failed to link items');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleRemoveLinkedItem = async (rowItem) => {
    const rowInvoiceNo = rowItem?.itemNo ?? rowItem?.ProductId ?? rowItem?.invoiceNo ?? '';
    if (!vendorName) {
      alert('Vendor name missing.');
      return;
    }
    if (!rowInvoiceNo) {
      alert('Row item number missing.');
      return;
    }

    try {
      setLoadingUnlinkId(rowItem?.ProductId || rowItem?.itemNo);
      setTransferMessage('');
      await initICMSBase();
      const token = await AsyncStorage.getItem('access_token');
      const icms_store = await AsyncStorage.getItem('icms_store');
      const storeurl = await AsyncStorage.getItem('storeurl');

      const res = await fetch(API_ENDPOINTS.REMOVE_LINKED_ITEM, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          access_token: token ?? '',
          mode: 'MOBILE',
          app_url: storeurl,
          store: icms_store,
        },
        body: JSON.stringify({
          invoiceName: vendorDatabaseName,
          itemNo: rowItem?.itemNo,
        }),
      });

      const json = await res.text().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.message || json?.error?.message || 'Failed to remove linked item';
        throw new Error(msg);
      }
      console.log("unlinked json:",json)
      setTransferMessage(json?.message || 'Linked item removed successfully.');
      await fetchInvoiceData();
    } catch (err) {
      setTransferMessage(err?.message || 'Failed to remove linked item');
    } finally {
      setLoadingUnlinkId(null);
    }
  };

  const fetchVendorDbName = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('access_token');
      const icms_store = await AsyncStorage.getItem('icms_store');
     const storeurl = await AsyncStorage.getItem('storeurl');
      
      const res = await fetch(API_ENDPOINTS.SEARCHVENDOR, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: token ?? '',
          mode: 'MOBILE',
         app_url: storeurl,
          store: icms_store ?? '',
        },
        body: JSON.stringify({ q: vendorName }),
      });
      const json = await res.json().catch(() => ({}));
      const found =
        Array.isArray(json?.results) && json.results.length
          ? json.results.find(
              v => String(v?.value || '').toLowerCase() === String(vendorName || '').toLowerCase(),
            ) || json.results[0]
          : null;
      return found?.databaseName || vendorDatabaseName || '';
    } catch {
      return vendorDatabaseName || '';
    }
  }, [vendorDatabaseName, vendorName]);

  const handleConfirmAiLinking = useCallback(async (rowItem) => {
    if (!rowItem) {
      Alert.alert('Row data missing.');
      return;
    }
    try {
      setLoadingConfirmAiId(rowItem?.ProductId || rowItem?.itemNo);
      setTransferMessage('');
      await initICMSBase();
      const token = await AsyncStorage.getItem('access_token');
      const icms_store = await AsyncStorage.getItem('icms_store');
      const storeurl = await AsyncStorage.getItem('storeurl');
      const invoiceDb = await fetchVendorDbName();
      const payload = {
        invoiceName: invoiceDb || vendorDatabaseName || '',
        items: [rowItem],
      };
      console.log('SingleLinking payload:', payload);

      const res = await fetch(API_ENDPOINTS.SingleLinking, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          access_token: token ?? '',
          mode: 'MOBILE',
          store: icms_store ?? '',
          app_url: storeurl ?? '',
        },
        body: JSON.stringify(payload),
      });

      const raw = await res.text().catch(() => '');
      let json = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = {};
      }
      console.log("confirm single linked ai raw:",raw);
      if (!res.ok) {
        const msg = json?.message || json?.error?.message || raw || 'Failed to confirm AI linking';
        throw new Error(msg);
      }
      setTransferMessage(json?.message || 'AI linking confirmed successfully.');
      await fetchInvoiceData();
    } catch (err) {
      setTransferMessage(err?.message || 'Failed to confirm AI linking');
    } finally {
      setLoadingConfirmAiId(null);
    }
  }, [fetchInvoiceData, fetchVendorDbName, vendorDatabaseName]);

  const runQuantitySpCostUpdate = useCallback(async () => {
    await initICMSBase();
    const token = await AsyncStorage.getItem('access_token');
    const storeurl = await AsyncStorage.getItem('storeurl');
    const icms_store = await AsyncStorage.getItem('icms_store');
    const email = invoice?.UserDetailInfo?.InvoiceUpdatedby || (await AsyncStorage.getItem('userEmail')) || '';
    const invoiceDb = await fetchVendorDbName();

console.log('icms_store value from AsyncStorage:', icms_store);
console.log('All items:', itemsRef.current.map(item => ({ source: item?.source, itemNo: item?.itemNo })));

const tableData = itemsRef.current
  .filter(item => {
    const source = String(item?.source ?? '').trim().toLowerCase();
    const storeValue = String(icms_store ?? '').trim().toLowerCase();
    const matches = source === storeValue;
    console.log(`Item ${item?.itemNo} - source: "${item?.source}" -> normalized: "${source}" vs store: "${storeValue}" -> matches: ${matches}`);
    return matches;
  })
  .map(item => ({
    ...item,
    tableDataCopyElement: { ...item }
  }));

console.log('Filtered tableData count:', tableData.length);
console.log('Filtered tableData:', tableData);
    const body = {
      invoiceName: vendorName,
      invoiceSavedDate: day,
      invoiceNo: InvNumber,
      invoice: invoiceDb,
      tableData: tableData || [],
      email,
    };
     const app_url = await AsyncStorage.getItem('storeurl');
    const res = await fetch(API_ENDPOINTS.QUANTITY_SP_COSTUPDATE, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        store: icms_store ?? '',
        pos_access_token: token ?? '',
        pos_api: `${storeurl}/api/v1` ?? '',
        mode: 'MOBILE',
       app_url: app_url ?? '',
      },
      body: JSON.stringify(body),
      });

    console.log("token",token,storeurl);
    console.log("quantity update res",body);
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(t || `Quantity/Price update failed (${res.status})`);
    }

    console.log("pos update res",res);
  }, [InvNumber, day, fetchVendorDbName, invoice, vendorName]);

  const handlePosUpdateConfirm = useCallback(() => {
    Alert.alert(
      'Update POS Values',
      'Do you want to update Quantity, Selling Price and Cost in POS for this invoice?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
            try {
              setPosUpdateLoading(true);
              await runQuantitySpCostUpdate();
              setTransferMessage('Quantity, Selling Price and Cost updated in POS successfully.');
              Alert.alert("POS update successfully ");
            } catch (e) {
              setTransferMessage(e?.message || 'Failed to update POS values');
               Alert.alert("POS update Failed Please Contact Support");
            } finally {
              setPosUpdateLoading(false);
            }
          },
        },
      ],
      { cancelable: true },
    );
  }, [runQuantitySpCostUpdate]);

  const handleSave = useCallback(
    (updatedItem, commit = true) => {
      if (commit) {
        itemsRef.current = itemsRef.current.map(it => {
          if (it.ProductId && updatedItem.ProductId) {
            return it.ProductId === updatedItem.ProductId ? updatedItem : it;
          }
          if (it.itemNo && updatedItem.itemNo) {
            return it.itemNo === updatedItem.itemNo ? updatedItem : it;
          }
          return it;
        });
        closeModal();
      } else {
        setSelectedItem(updatedItem);
      }
    },
    [closeModal],
  );

  const toggleExpand = useCallback(id => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(prevId => (prevId === id ? null : id));
  }, []);

  const renderHeader = useCallback(
    () => (
      <View style={styles.headerRow}>
        {['', 'S.N', 'Item No', 'QTY', 'Case Cost', 'Unit Cost'].map(
          (title, idx) => (
            <Text
              key={idx}
              style={[
                styles.headerText,
                idx === 0
                  ? { width: 28 }
                  : idx === 1
                  ? { flex: 0.8 }
                  : idx === 2
                  ? { flex: 2.8 }
                  : idx === 3
                  ? { flex: 0.8 }
                  : idx === 4
                  ? { flex: 0.8 }
                  : idx === 5
                  ? { flex: 0.8 }
                  : undefined,
                idx === 0 && { color: '#DC2626', textAlign: 'center' },
              ]}
            >
              {title}
            </Text>
          ),
        )}
      </View>
    ),
    [],
  );

  const handlePriceUpdate = useCallback((itemId, newSellingPrice) => {
    itemsRef.current = itemsRef.current.map(it => {
      if ((it.ProductId && it.ProductId === itemId) || (it.itemNo && it.itemNo === itemId)) {
        return { ...it, PosSellingPrice: newSellingPrice };
      }
      return it;
    });
  }, []);

  const renderItem = useCallback(
    ({ item, index }) => (
      <InvoiceRow
        item={item}
        index={index}
        categoryMetaByDept={categoryMetaByDept}
        isExpanded={expandedId === item.ProductId}
        onToggle={() => toggleExpand(item.ProductId)}
        onToggleSelect={handleToggleSelect}
        selectedIds={selectedIds}
        onEdit={openModal}
        onLinkProduct={openLinkProduct}
        onConfirmAiLinking={handleConfirmAiLinking}
        onRemoveLinkedItem={handleRemoveLinkedItem}
        onPriceUpdate={handlePriceUpdate}
        loadingConfirmAiId={loadingConfirmAiId}
        loadingUnlinkId={loadingUnlinkId}
         isicmsstore={isicmsstore}
      />
    ),
    [expandedId, toggleExpand, handleToggleSelect, selectedIds, handleConfirmAiLinking, handleRemoveLinkedItem, categoryMetaByDept, handlePriceUpdate, loadingConfirmAiId, loadingUnlinkId],
  );

  return (
    <ImageBackground
      source={getImageSource(reportbg)}
      style={styles.screen}
      resizeMode="cover"
    >
      <AppHeader
        Title={`Invoice ${InvNumber ? `- ${InvNumber}` : ''}`}
        backgroundType="image"
        backgroundValue={reportbg}
      ></AppHeader> 
    <View style={{ flex: 1, backgroundColor: '#F5F6FA'}}>

      <View style={styles.searchWrap}>
        <View style={styles.totalWrap}>
          <Text style={styles.totalText}>Total: {totalRows}</Text>
        </View>
         <TouchableOpacity
            style={[styles.posUpdateBtn, posUpdateLoading && styles.transferBtnDisabled]}
            onPress={handlePosUpdateConfirm}
            activeOpacity={0.85}
            disabled={posUpdateLoading}
          >
            {posUpdateLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.posUpdateBtnText}>Update POS</Text>
            )}
          </TouchableOpacity>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by description, barcode, item no"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor="#6b7280"
          selectionColor="#1f1f1f"
        />
        <TouchableOpacity
          style={styles.infoBtn}
          onPress={() => setDetailsModalVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.infoBtnText}>!</Text>
        </TouchableOpacity>
        
      </View>
      <View style={styles.legendWrap}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#ff0000' }]} />
          <Text style={styles.legendText}>Unlinked</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, styles.legendAiBox]}>
            <Icon name="smart-toy" size={9} color="#7C2D12" />
          </View>
          <Text style={styles.legendText}>AI Data</Text>
        </View>
            <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#16A34A' }]} />
          <Text style={styles.legendText}>isStockUpdated</Text>
        </View>
      </View>

      {/* List */}
      {invoiceLoading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="small" color="#319241" />
          <Text style={styles.loadingText}>Loading invoice details...</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          <Text style={styles.emptyText}>
            {query ? 'No matching items.' : (invoiceError || 'No items found in this invoice.')}
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 8 }}>
          {selectedIds.size > 0 && (
            <View style={styles.transferBar}>
              <Text style={styles.transferText}>{selectedIds.size} selected</Text>
              <TouchableOpacity
                style={[styles.transferBtn, transferLoading && styles.transferBtnDisabled]}
                onPress={handleLinkingRemove}
                disabled={transferLoading}
              >
                <Text style={styles.transferBtnText}>
                  {transferLoading ? 'Removing...' : 'Remove Selected Linking'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          <FlatList
            data={filteredItems}
            keyExtractor={(item, index) =>
              (item?.ProductId ?? item?.itemNo ?? index).toString()
            }
            ListHeaderComponent={renderHeader}
            stickyHeaderIndices={[0]}
            renderItem={renderItem}
            extraData={selectedIds}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
            initialNumToRender={6}
            windowSize={5}
            removeClippedSubviews
          />

          <EditProduct
            visible={isModalVisible}
            item={selectedItem}
            InvoiceDate={day}
            InvNumber={InvNumber}
            vendorName={vendorName}
            onClose={closeModal}
            onSave={handleSave}
          />

          {linkModalVisible && (
            <LinkProductModal
              visible={linkModalVisible}
              onClose={() => setLinkModalVisible(false)}
              onSelect={handleProductSelect}
              linkingItem={linkingItem}
              invoice={invoice}
              // ✅ Pass the item being linked
            />
          )}

        </View>
      )}
    </View>
    <Modal visible={detailsModalVisible} transparent animationType="fade">
      <View style={styles.detailsModalOverlay}>
        <TouchableOpacity
          style={styles.detailsModalBackdrop}
          activeOpacity={1}
          onPress={() => setDetailsModalVisible(false)}
        />
        <View style={styles.detailsModalCard}>
          <Text style={styles.detailsTitle}>Invoice Details</Text>
          <View style={styles.detailsRow}>
            <Text style={styles.detailsKey}>Inv Number</Text>
            <Text style={styles.detailsVal}>{InvNumber || '-'}</Text>
          </View>
          <View style={styles.detailsRow}>
            <Text style={styles.detailsKey}>Vendor</Text>
            <Text style={styles.detailsVal}>{vendorName || '-'}</Text>
          </View>
          <View style={styles.detailsRow}>
            <Text style={styles.detailsKey}>Saved Date</Text>
            <Text style={styles.detailsVal}>{day || '-'}</Text>
          </View>
          <View style={styles.detailsRow}>
            <Text style={styles.detailsKey}>Total Rows</Text>
            <Text style={styles.detailsVal}>{totalRows}</Text>
          </View>
          <View style={styles.detailsRow}>
            <Text style={styles.detailsKey}>Extended Price</Text>
            <Text style={styles.detailsVal}>${totalExtendedPrice.toFixed(2)}</Text>
          </View>
          <View style={styles.detailsRow}>
            <Text style={styles.detailsKey}>Case Cost</Text>
            <Text style={styles.detailsVal}>${totalUnitPrice.toFixed(2)}</Text>
          </View>

          <TouchableOpacity
            style={styles.detailsCloseBtn}
            onPress={() => setDetailsModalVisible(false)}
          >
            <Text style={styles.detailsCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    </ImageBackground>
  );
}

const styles = StyleSheet.create({
   screen: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#eee',
    padding: 10,
  },
  headerText: {
    fontWeight: 'bold',
    fontSize: 12.6,
    textAlign: 'left',
    color: '#1f1f1f',
  },
  card: {
    marginVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    padding: 10,
  },
    panelInner: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.85)', // helps separate items from bg image
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingVertical:  10,
        paddingHorizontal: 12,
  
        ...Platform.select({
          android: { elevation: 1 },
          ios: {
            shadowColor: '#000',
            shadowOpacity: 0.06,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
          },
        }),
      },
  cell: {
    fontSize: 12.6,
  },
  expandedSection: {
    backgroundColor: '#f0f8ff',
    padding: 10,
    borderTopWidth: 1,
    borderColor: '#ddd',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  expandedRow: border => ({
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: border ? 0.5 : 0,
    borderColor: '#ccc',
    alignItems: 'flex-start',
  }),
  expandedLabel: {
    flex: 1,
    fontSize: 12.6,
    fontWeight: '600',
  },
  expandedValue: {
    flex: 2,
    fontSize: 12.6,
    color: '#000',
  },
  fab: {
    position: 'absolute',
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    right: 30,
    bottom: 30,
    backgroundColor: '#007bff',
    borderRadius: 30,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  fabText: {
    color: 'white',
    fontSize: 24,
  },
  invTopWrap: {
    marginHorizontal: 8,
    marginTop: 8,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  invTopLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
    textTransform: 'uppercase',
  },
  invTopValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#14532D',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  totalWrap: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  totalText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cfd6ea',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    fontSize: 13,
    color: '#1f1f1f',
  },
  infoBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    borderWidth: 1,
    borderColor: '#15803D',
  },
  infoBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },
  posUpdateBtn: {
    minWidth: 48,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F766E',
    borderWidth: 1,
    borderColor: '#0D5E58',
    paddingHorizontal: 10,
  },
  posUpdateBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  detailsPosUpdateBtn: {
    marginTop: 10,
    alignSelf: 'stretch',
    minWidth: 0,
  },
  legendWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 10,
    marginBottom: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendBox: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendAiBox: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  legendText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  transferBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  transferText: { fontSize: 12, fontWeight: '700', color: '#166534' },
  transferBtn: {
    backgroundColor: '#16A34A',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  transferBtnDisabled: { opacity: 0.6 },
  transferBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  transferMessage: { fontSize: 12, color: '#111', marginBottom: 6 },
  detailsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  detailsModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  detailsModalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe3e7',
    padding: 14,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
    gap: 10,
  },
  detailsKey: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '700',
  },
  detailsVal: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
  },
  detailsCloseBtn: {
    marginTop: 12,
    alignSelf: 'flex-end',
    backgroundColor: '#16A34A',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  detailsCloseText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 8, fontSize: 13, color: '#4B5563' },
  emptyText: { fontSize: 16, color: '#666' },
});
