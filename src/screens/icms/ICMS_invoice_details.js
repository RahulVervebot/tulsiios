import React, {useState, useEffect, useMemo, useCallback} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {View, Text, TextInput, Platform, FlatList, TouchableOpacity, StyleSheet, ImageBackground,ActivityIndicator, Alert} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import API_ENDPOINTS, { initICMSBase, setICMSBase } from '../../../icms_config/api';
import AppHeader from '../../components/AppHeader';
import reportbg from '../../assets/images/headbg.png';
import { searchVendors } from '../../components/icms/vendorApi';

const getImageSource = val => (typeof val === 'number' ? val : { uri: val });

function buildFetchInvoiceUrl() {
  const base = new URL(API_ENDPOINTS.GETINVOICEDATA);
  // if (vendor?.value) base.searchParams.set('value', vendor.value);
  //   if (vendor?.slug) base.searchParams.set('slug', vendor.slug);
  // if (vendor?.jsonName) base.searchParams.set('jsonName', vendor.jsonName);
  //   if (vendor?.emptyColumn) base.searchParams.set('emptyColumn', vendor.emptyColumn);
  // if (vendor?.databaseName) base.searchParams.set('databaseName', vendor.databaseName);
  // if your API expects different keys, set them here
  return base.toString();
}

async function fetchInvoicesForVendor(vendor) {
  try {
    const token = await AsyncStorage.getItem('access_token');
    console.log("token:",token);
      const icms_store = await AsyncStorage.getItem('icms_store');
    const url = buildFetchInvoiceUrl();
    console.log('FETCH_INVOICE URL =>', url);
  const bodyPayload = {
         invoiceNo:'Testdate', 
        invoiceName:'chetak' ,
        date: '2026-01-20'
  }
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(bodyPayload),
      headers: {
        'Content-Type': 'application/json',
        'store': icms_store,
        'access_token': token ?? '',
        'mode': 'MOBILE',
      }
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
    const results = await searchVendors(q);
    setVendorResults(results);
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
                <View style={styles.dropdown}>
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
                </View>
              </View>
            )}
          </View>

          {/* Invoice number search */}
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
        </View>

        {loading ? (
          <Text style={styles.helperText}>Loading invoices…</Text>
        ) : (
          <FlatList
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
                <View style={[styles.col, styles.actionCol, { flexDirection: 'row', gap: 8 }]}>
                  {item?.InvoiceStatus === 'not_seen' && (
                    <View style={styles.badge}><Text style={styles.badgeText}>new</Text></View>
                  )}
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('InvoiceDetails', {
                        Invoice: item,
                        vendorDatabaseName: selectedVendor?.databaseName,
                      })
                    }
                  >
                    <Text style={styles.link}>Open</Text>
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
  },
  vendorWrap: {
    flex: 1,
    position: 'relative',
    minWidth: 260,
  },
  invoiceWrap: {
    flex: 1,
    minWidth: 260,
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
    zIndex: 50,
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
  badge: { backgroundColor: '#319241', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: 'white', fontSize: 12 },
  link: { color: '#319241', fontWeight: '600' },
  errorText: { marginTop: 6, color: '#d9534f', fontWeight: '600' },
  helperText: { textAlign: 'center', color: '#666' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 20 },

});