import React, {useState, useEffect, useMemo, useCallback} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {View, Text, TextInput, Platform, FlatList, TouchableOpacity, StyleSheet, ImageBackground,ActivityIndicator, Alert,ScrollView} from 'react-native';
import {useNavigation, useRoute, useFocusEffect} from '@react-navigation/native';
import API_ENDPOINTS, { initICMSBase, setICMSBase } from '../../../icms_config/api';
import AppHeader from '../../components/AppHeader';
import reportbg from '../../assets/images/report-bg.png';
import { searchVendors } from '../../components/icms/vendorApi';
import InvoiceStepperModal from '../../components/icms/InvoiceStepperModal';

const getImageSource = val => (typeof val === 'number' ? val : { uri: val });

function buildFetchInvoiceUrl(vendor) {
  const base = new URL(API_ENDPOINTS.FETCH_INVOICE);
  if (vendor?.value) base.searchParams.set('value', vendor.value);
    if (vendor?.slug) base.searchParams.set('slug', vendor.slug);
  if (vendor?.jsonName) base.searchParams.set('jsonName', vendor.jsonName);
    if (vendor?.emptyColumn) base.searchParams.set('emptyColumn', vendor.emptyColumn);
  if (vendor?.databaseName) base.searchParams.set('databaseName', vendor.databaseName);
  // if your API expects different keys, set them here
  return base.toString();
}

async function fetchInvoicesForVendor(vendor) {
  try {
    const token = await AsyncStorage.getItem('access_token');
    console.log("token:",token);
      const icms_store = await AsyncStorage.getItem('icms_store');
    const url = buildFetchInvoiceUrl(vendor);
    console.log('FETCH_INVOICE URL =>', url);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'store': icms_store,
        'access_token': token ?? '',
        'mode': 'MOBILE',
      },
    });

    if (!res.ok) {
      console.warn('fetchInvoices failed:', res.status, await res.text().catch(()=>''));
      return [];
    }
    const data = await res.json().catch(() => []);
    console.log("invoice data",data);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('fetchInvoices error:', e);
    return [];
  }
}

async function markSavedInvoiceAsSeen({ vendor, SavedInvoiceNo, SavedDate }) {
  try {
    await initICMSBase();

    const token = await AsyncStorage.getItem('access_token');
    const icms_store = await AsyncStorage.getItem('icms_store');

    const body = {
      params: {
      InvoiceStatus: 'not_seen',
      InvoiceName: String(vendor?.slug || ''),
      SavedInvoiceNo: String(SavedInvoiceNo || ''),
      SavedDate: String(SavedDate || ''),
        }
    };

    const res = fetch(API_ENDPOINTS.SAVEDINVSTATUS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        store: icms_store ?? '',
        access_token: token ?? '',
        mode: 'MOBILE',
      },
      body: JSON.stringify(body),
    });

    console.log('SAVEDINVSTATUS API URL:', API_ENDPOINTS.SAVEDINVSTATUS);
    console.log('SAVEDINVSTATUS raw response:', res);

    const responseText = await res.text().catch(() => '');

    console.log('SAVEDINVSTATUS response text:', responseText);

    if (!res.ok) {
      throw new Error(responseText || `Saved invoice status failed (${res.status})`);
    }

    const json = responseText ? JSON.parse(responseText) : {};

    console.log('SAVEDINVSTATUS parsed response:', json);

    return json;
  } catch (error) {
    console.log('SAVEDINVSTATUS error:', error?.message || error);
    return null;
  }
}

// simple debounce helper
function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

export default function InvoiceList() {
  const navigation = useNavigation();

  // vendor search state
  const [vendorQuery, setVendorQuery] = useState('');
  const [vendorResults, setVendorResults] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [vendorSearching, setVendorSearching] = useState(false);
  const [vendorSearchError, setVendorSearchError] = useState('');
  // invoices state
  const [loading, setLoading] = useState(false);
  const [allInvoices, setAllInvoices] = useState([]);
  const [visibleInvoices, setVisibleInvoices] = useState([]);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [stepperVisible, setStepperVisible] = useState(false);
  const [selectedInvoiceForStepper, setSelectedInvoiceForStepper] = useState(null);

  // sort state
  const [sortState, setSortState] = useState({ key: 'date', dir: 'desc' }); // 'inv' | 'date'

  const normalizeInvNo = (item) =>
    (item?.SavedInvoiceNo ?? item?.invoiceNo ?? '').toString();

  const parseDate = (item) => {
    const d = item?.SavedDate ? new Date(item.SavedDate) : null;
    return d && !isNaN(d) ? d.getTime() : 0;
  };

  const applyFilters = useCallback(() => {
    let rows = [...allInvoices];

    // search by invoice no
    const q = invoiceSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter(r => normalizeInvNo(r).toLowerCase().includes(q));
    }

    // sort
    rows.sort((a, b) => {
      const aIsNew = a?.InvoiceStatus === 'not_seen' ? 1 : 0;
      const bIsNew = b?.InvoiceStatus === 'not_seen' ? 1 : 0;
      if (aIsNew !== bIsNew) {
        return bIsNew - aIsNew; // NEW rows first
      }

      if (sortState.key === 'inv') {
        const av = normalizeInvNo(a), bv = normalizeInvNo(b);
        const an = Number(av), bn = Number(bv);
        if (!Number.isNaN(an) && !Number.isNaN(bn)) {
          return sortState.dir === 'asc' ? an - bn : bn - an;
        }
        return sortState.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      } else {
        const av = parseDate(a), bv = parseDate(b);
        return sortState.dir === 'asc' ? av - bv : bv - av;
      }
    });

    setVisibleInvoices(rows);
  }, [allInvoices, invoiceSearch, sortState]);

  useEffect(() => {
    initICMSBase();
    applyFilters();
  }, [applyFilters]);

  // vendor search (debounced suggestions)
  const runVendorSearch = async (q) => {
      setVendorSearching(true);
    const results = await searchVendors(q);
    setVendorResults(results);
    setVendorSearching(false);
  };
  const debouncedVendorSearch = useMemo(() => debounce(runVendorSearch, 300), []);

  // click "Search" (explicit API call) OR use suggestions
  const onPressSearchVendor = async () => {
  setVendorSearchError('');
  setVendorSearching(true);
  try {
    const results = await searchVendors(vendorQuery);
    if (!Array.isArray(results) || results.length === 0) {
      // no match: clear list + show message
      setVendorResults([]);
      setSelectedVendor(null);
      setAllInvoices([]);
      setVisibleInvoices([]);
      setVendorSearchError('No vendor found');
    } else {
      // ✅ auto-pick the first result and load invoices
      await onSelectVendor(results[0]);   // onSelectVendor already fetches invoices & updates UI
      setVendorResults([]);               // hide dropdown
      setVendorSearchError('');
    }
  } catch (e) {
    setVendorSearchError('Search failed. Try again.');
    Alert.alert("Vendor Search Failed", 'Please try again');
  } finally {
    setVendorSearching(false);
  }
};

const onSelectVendor = async (v) => {
  setSelectedVendor(v);
  setVendorQuery(v?.value ?? '');
  setVendorResults([]);
  setLoading(true);
  setInvoiceSearch(''); // optional: clear invoice filter for a fresh list
  const data = await fetchInvoicesForVendor(v);
  setAllInvoices(data);
  setLoading(false);
  AsyncStorage.setItem('vendor', JSON.stringify(v)).catch(()=>{});
};

  // restore last vendor on first mount (optional)
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('vendor');
        if (saved) {
          const v = JSON.parse(saved);
          setSelectedVendor(v);
          setVendorQuery(v?.value ?? '');
          setLoading(true);
          const data = await fetchInvoicesForVendor(v);
          setAllInvoices(data);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Refresh invoice list whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (selectedVendor) {
        (async () => {
          setLoading(true);
          const data = await fetchInvoicesForVendor(selectedVendor);
          setAllInvoices(data);
          setLoading(false);
        })();
      }
    }, [selectedVendor])
  );

  const toggleSort = (key) => {
    setSortState(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }
    );
  };

  const header = () => {
    const arrow = (key) =>
      sortState.key === key ? (sortState.dir === 'asc' ? ' ↑' : ' ↓') : '';
    return (
      <View style={styles.headerRow}>
        <TouchableOpacity style={[styles.col, styles.invCol]} onPress={() => toggleSort('inv')}>
          <Text style={styles.headerText}>Inv No{arrow('inv')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.col, styles.dateCol]} onPress={() => toggleSort('date')}>
          <Text style={styles.headerText}>Date{arrow('date')}</Text>
        </TouchableOpacity>
        <View style={[styles.col, styles.actionCol]}>
          <Text style={styles.headerText}>Action</Text>
        </View>
      </View>
    );
  };

  const openInvoice = async (item) => {
    const currentStep = Number(item?.StepGuider?.currentStep || 0);
    const isCompleted = item?.StepGuider?.isCompleted === true;
    const isReady = currentStep === 4 && isCompleted;
    if (isReady) {
      await markSavedInvoiceAsSeen({
        vendor: selectedVendor,
        SavedInvoiceNo: item?.SavedInvoiceNo,
        SavedDate: item?.SavedDate,
      });
      navigation.navigate('InvoiceDetails', {
        invoiceNo: item?.SavedInvoiceNo,
        invoiceName: item?.InvoiceName,
        date: item?.SavedDate,
        vendorDatabaseName: selectedVendor?.databaseName,
      });
      return;
    }
    setSelectedInvoiceForStepper(item);
    setStepperVisible(true);
  };

  return (
    <ImageBackground source={getImageSource(reportbg)} style={styles.screen} resizeMode="cover">
      <AppHeader Title="Invoice List" backgroundType="image" backgroundValue={reportbg} />

      <View style={styles.panelInner}>
        {/* <Text style={styles.title}>
          {`Invoices ${selectedVendor?.value ? `for ${selectedVendor.value}` : ''}`}
        </Text> */}

        {/* 🔎 Row with both searches: Vendor + Invoice No */}
        <View style={styles.searchRow}>
          {/* Vendor search (with dropdown + Search button) */}
          <View style={styles.vendorWrap}>
            <TextInput
              value={vendorQuery}
              onChangeText={(t) => { setVendorQuery(t); debouncedVendorSearch(t); }}
              placeholder="Search Vendor…"
              style={styles.searchInput}
              placeholderTextColor="#6b7280"
              selectionColor="#1f1f1f"
              returnKeyType="search"
              onSubmitEditing={onPressSearchVendor}
            />
            <TouchableOpacity
              style={styles.vendorSearchBtn}
              onPress={onPressSearchVendor}
              disabled={vendorSearching}
            >
  {vendorSearching
    ? <ActivityIndicator size="small" color="#fff" />
    : <Text style={styles.vendorSearchBtnText}>Search</Text>}
</TouchableOpacity>
{/* {vendorSearchError && <Text style={styles.errorText}>{vendorSearchError}</Text>} */}

            {vendorResults.length > 0 && (
              <View style={styles.dropdownContainer}>
                <ScrollView 
                  style={styles.dropdown}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={true}
                >
                  {vendorResults.map((v, i) => (
                    <TouchableOpacity
                      key={(v.slug ?? v.value ?? '') + i}
                      style={[styles.dropdownItem, i % 2 ? styles.dropdownOdd : styles.dropdownEven]}
                      onPress={() => onSelectVendor(v)}
                    >
                      <Text style={styles.dropdownText}>
                        {v.value}  <Text style={{color:'#666'}}>({v.databaseName || v.slug})</Text>
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Invoice number search: show only after list data is loaded */}
          {!loading && allInvoices.length > 0 ? (
            <View style={styles.invoiceWrap}>
              <TextInput
                value={invoiceSearch}
                onChangeText={setInvoiceSearch}
                placeholder="Search Invoice No…"
                style={styles.searchInput}
                placeholderTextColor="#6b7280"
                selectionColor="#1f1f1f"
              />
            </View>
          ) : null}
        </View>

        {loading ? (
          <Text style={styles.helperText}>Loading invoices…</Text>
        ) : (
          <FlatList
            style={styles.invoiceList}
            data={visibleInvoices}
            keyExtractor={(item, idx) => (normalizeInvNo(item) || idx).toString()}
            ListHeaderComponent={header}
            stickyHeaderIndices={[0]}
            renderItem={({ item, index }) => (
              <View style={[styles.row, { backgroundColor: index % 2 === 0 ? '#fafafa' : '#fff' }]}>
                <Text style={[styles.col, styles.invCol, styles.cellText]} numberOfLines={1}>
                  {normalizeInvNo(item) || '-'}
                </Text>
                <Text style={[styles.col, styles.dateCol, styles.cellText]} numberOfLines={1}>
                  {item?.SavedDate ?? '-'}
                </Text>
                <View style={[styles.col, styles.actionCol]}>
                  <TouchableOpacity
                    style={styles.openBtnWrap}
                    onPress={() => openInvoice(item)}
                  >
                    <Text style={styles.openBtnText}>Open</Text>
                    {item?.InvoiceStatus === 'not_seen' && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>new</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={() => (
              <Text style={styles.emptyText}>
              {selectedVendor ? 'No invoices found' : 'Search a vendor to load invoices'}
              </Text>
            )}
          />
          
        )}
        
      </View>
      <InvoiceStepperModal
        visible={stepperVisible}
        onClose={() => setStepperVisible(false)}
        invoiceItem={selectedInvoiceForStepper}
        vendorDatabaseName={selectedVendor?.databaseName}
        onCompleted={() => {
          const inv = selectedInvoiceForStepper;
          setStepperVisible(false);
          if (!inv) return;
          (async () => {
            await markSavedInvoiceAsSeen({
              vendor: selectedVendor,
              SavedInvoiceNo: inv?.SavedInvoiceNo,
              SavedDate: inv?.SavedDate,
            });
            navigation.navigate('InvoiceDetails', {
              invoiceNo: inv?.SavedInvoiceNo,
              invoiceName: inv?.InvoiceName,
              date: inv?.SavedDate,
              vendorDatabaseName: selectedVendor?.databaseName,
            });
          })();
        }}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  panelInner: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 10,
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
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },

  /* —— search row layout —— */
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 10,
    zIndex: 30,
    elevation: 30,
  },
  vendorWrap: {
    flex: 1,
    position: 'relative',
    minWidth: 260,
    zIndex: 40,
    elevation: 40,
  },
  invoiceWrap: {
    flex: 1,
    minWidth: 260,
    zIndex: 1,
    elevation: 1,
  },
  searchInput: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#fff',
    color: '#1f1f1f',
  },
  vendorSearchBtn: {
    position: 'absolute', right: 6, top: 6, bottom: 6,
    paddingHorizontal: 12, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#319241',
  },
  vendorSearchBtnText: { color: '#fff', fontWeight: '700' },

  /* —— dropdown —— */
  dropdownContainer: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e6e8ef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 999,
    maxHeight: 240,
  },
  dropdown: { paddingVertical: 4 },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 12 },
  dropdownEven: { backgroundColor: '#fff' },
  dropdownOdd: { backgroundColor: '#f6f8fb' },
  dropdownText: { fontSize: 15, color: '#222' },

  /* —— table —— */
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  col: { flex: 1 },
  invCol: { flex: 1.2 },
  dateCol: { flex: 1.2 },
  actionCol: { flex: 0.9, alignItems: 'flex-start' },
  headerText: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, color: '#1f1f1f' },
  cellText: { color: '#1f1f1f' },
  openBtnWrap: {
    minWidth: 76,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#e6f6ec',
    borderWidth: 1,
    borderColor: '#ccead6',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  openBtnText: { color: '#256f3a', fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#319241',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: 'white', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  errorText: { marginTop: 6, color: '#d9534f', fontWeight: '600' },
  helperText: { textAlign: 'center', color: '#666' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 20 },
  invoiceList: {
    zIndex: 1,
    elevation: 1,
  },

});
