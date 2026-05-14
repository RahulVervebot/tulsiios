import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Switch,
  Alert,
  ImageBackground,
  Platform,
  Modal,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Icon from 'react-native-vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Camera, CameraType } from 'react-native-camera-kit';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import {
  createMixMatchPromotion,
  getPromotionGroupsDetails,
  updateMixMatchPromotion,
  deleteMixMatchPromotion,
  getDaysList,
  searchProductsByBarcode,
} from './function';
import AppHeader from '../../components/AppHeader';
import reportbg from '../../assets/images/report-bg.png';

const DEFAULT_FORM = {
  name: '',
  product_ids: '',
  no_of_products_to_buy: '1',
  no_of_free_products: '1',
  discount_product_ids: '',
  is_add_discount_on_product: false,
  sale_price: '',
  status: true,
  start_date: '',
  end_date: '',
  days_of_week_ids: [],
  applicable_for_single_unit: true,
  offer_type: 'quantity_based_offer',
};

const FIXED_OFFER_TYPE = 'quantity_based_offer';
const SCREEN_TITLE = 'MIX MATCH QUANTITY BASED OFFER';


export default function MixMatchScreen() {
  const onEndReachedCalledDuringMomentum = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [daysList, setDaysList] = useState([]);
  const [selectedDays, setSelectedDays] = useState([]);
  const [dayPickerValue, setDayPickerValue] = useState('');

  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [productDropdownVisible, setProductDropdownVisible] = useState(false);
  const productDebounceRef = useRef(null);

  const [discountQuery, setDiscountQuery] = useState('');
  const [discountResults, setDiscountResults] = useState([]);
  const [selectedDiscountProducts, setSelectedDiscountProducts] = useState([]);
  const [discountDropdownVisible, setDiscountDropdownVisible] = useState(false);
  const discountDebounceRef = useRef(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanTarget, setScanTarget] = useState('product');
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [formModalVisible, setFormModalVisible] = useState(false);
  const isQuantityBasedScreen = true;

  const normalizeDayIds = (list) => {
    const raw = Array.isArray(list)
      ? list
      : typeof list === 'string'
        ? list.split(/[,\s]+/).filter(Boolean)
        : [];
    const expanded = raw.flatMap((entry) => {
      if (typeof entry === 'string' && entry.includes(',')) {
        return entry.split(',').map((v) => v.trim()).filter(Boolean);
      }
      return [entry];
    });
    return expanded
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          return Number(entry.id ?? entry.value ?? entry.day_id);
        }
        return Number(entry);
      })
      .filter((id) => Number.isFinite(id) && id > 0);
  };

  const getDayNames = (ids) => {
    if (!Array.isArray(ids)) return [];
    if (!daysList.length) return [];
    const directNames = ids
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          return entry.name || entry.day_name || null;
        }
        if (typeof entry === 'string' && Number.isNaN(Number(entry))) {
          return entry;
        }
        return null;
      })
      .filter(Boolean);
    if (directNames.length) return directNames;
    const normalized = normalizeDayIds(ids);
    return normalized
      .map((id) => daysList.find((d) => Number(d.id) === id)?.name)
      .filter(Boolean);
  };

  const formatDateOnly = (value) => {
    if (!value) return '';
    const datePart = String(value).split(' ')[0];
    return datePart || '';
  };

  const toDate = (value) => {
    const datePart = formatDateOnly(value);
    if (!datePart) return new Date();
    const [y, m, d] = datePart.split('-').map((n) => Number(n));
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d);
  };

  const handleStartDateChange = (_, date) => {
    if (Platform.OS === 'android') setShowStartPicker(false);
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    updateForm('start_date', `${yyyy}-${mm}-${dd} 00:00:00`);
    if (Platform.OS === 'ios') setShowStartPicker(false);
  };

  const handleEndDateChange = (_, date) => {
    if (Platform.OS === 'android') setShowEndPicker(false);
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    updateForm('end_date', `${yyyy}-${mm}-${dd} 23:59:59`);
    if (Platform.OS === 'ios') setShowEndPicker(false);
  };

  const handleFilterStartDateChange = (_, date) => {
    // if (Platform.OS === 'android') setShowFilterStartPicker(false);
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    setFilterStart(`${yyyy}-${mm}-${dd}`);
    // if (Platform.OS === 'ios') setShowFilterStartPicker(false);
  };

  const handleFilterEndDateChange = (_, date) => {
    // if (Platform.OS === 'android') setShowFilterEndPicker(false);
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    setFilterEnd(`${yyyy}-${mm}-${dd}`);
    // if (Platform.OS === 'ios') setShowFilterEndPicker(false);
  };

  const normalizeProductEntry = (entry) => {
    if (entry && typeof entry === 'object') {
      const id = Number(entry.id ?? entry.product_id ?? entry._id);
      const barcode = entry.barcode || '';
      const name =
        entry.product_name ||
        entry.productName ||
        entry.name ||
        (barcode ? `Barcode: ${barcode}` : `ID: ${id || '-'}`);
      return Number.isFinite(id) ? { id, name, barcode } : null;
    }
    const id = Number(entry);
    if (!Number.isFinite(id)) return null;
    return { id, name: `ID: ${id}`, barcode: '' };
  };
  const [query, setQuery] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [showFilterStartPicker, setShowFilterStartPicker] = useState(false);
  const [showFilterEndPicker, setShowFilterEndPicker] = useState(false);

  const loadPromotions = async ({ nextPage = 1, append = false } = {}) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      const [promoRes, days] = await Promise.all([
        getPromotionGroupsDetails({ page: nextPage, limit: 10 }),
        getDaysList(),
      ]);
      console.log('mix match promotions response:', promoRes);
      const nextRows = Array.isArray(promoRes?.data) ? promoRes.data : [];
      setRows((prev) => (append ? [...prev, ...nextRows] : nextRows));
      setPage(Number(promoRes?.page ?? nextPage) || nextPage);
      setTotalPages(Number(promoRes?.total_pages ?? 1) || 1);
      setDaysList(Array.isArray(days) ? days : []);
      if (Array.isArray(promoRes?.data)) {
        console.log('mix match days_of_week_ids (load):', promoRes.data.map((d) => d?.days_of_week_ids));
      }
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to load promotions.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadPromotions({ nextPage: 1, append: false });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const perm = Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;
        const result = await request(perm);
        setHasCameraPermission(result === RESULTS.GRANTED);
      } catch {
        setHasCameraPermission(false);
      }
    })();
  }, []);

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleOpen = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setSelectedDays([]);
    setSelectedProducts([]);
    setSelectedDiscountProducts([]);
    setProductQuery('');
    setDiscountQuery('');
    setProductResults([]);
    setDiscountResults([]);
    setProductDropdownVisible(false);
    setDiscountDropdownVisible(false);
    setDayPickerValue('');
    setFormModalVisible(true);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      return Alert.alert('Missing info', 'Please enter promotion name.');
    }
    if (!selectedProducts.length) {
      return Alert.alert('Missing info', 'Please select at least one product.');
    }
    const dayIds = normalizeDayIds(selectedDays);
    console.log("dayIds:",dayIds);
    const payload = {
      name: form.name.trim(),
      product_ids: selectedProducts.map((p) => Number(p.id)),
      no_of_products_to_buy: Number(form.no_of_products_to_buy || 0),
      no_of_free_products: 0,
      discount_product_ids: [],
      is_add_discount_on_product: !!form.is_add_discount_on_product,
      sale_price: Number(form.sale_price || 0),
      status: !!form.status,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      days_of_week_ids: dayIds,
      applicable_for_single_unit: !!form.applicable_for_single_unit,
      offer_type: FIXED_OFFER_TYPE,
    };
    console.log('mix match days selected:', selectedDays, 'normalized:', normalizeDayIds(selectedDays));
    console.log("mix matched payload:",payload);
    try {
      setSubmitting(true);
      const res = editingId
        ? await updateMixMatchPromotion({ group_id: editingId, ...payload })
        : await createMixMatchPromotion(payload);
        console.log("response:",res);
      const message = res?.result?.message || 'Discount product group created successfully';
      Alert.alert('Success', message);
      setFormModalVisible(false);
      loadPromotions();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to create promotion.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (groupId) => {
    if (!groupId) return;
    Alert.alert('Delete Promotion', 'Are you sure you want to delete this promotion?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setSubmitting(true);
            const res = await deleteMixMatchPromotion(groupId);
            console.log("delete res:",res)
            const message = res?.result?.message || 'Promotion deleted successfully';
            Alert.alert('Success', message);
            loadPromotions();
          } catch (e) {
            Alert.alert('Error', e?.message || 'Failed to delete promotion.');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => (
 
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => {
        const groupId = item?.group_id ?? item?.id ?? null;
        setEditingId(groupId);
        setForm({
          name: item?.name || '',
          product_ids: '',
          no_of_products_to_buy: String(item?.no_of_products_to_buy ?? 1),
          no_of_free_products: '0',
          discount_product_ids: '',
          is_add_discount_on_product: false,
          sale_price: String(item?.sale_price ?? ''),
          status: !!item?.status,
          start_date: item?.start_date || '',
          end_date: item?.end_date || '',
          days_of_week_ids: Array.isArray(item?.days_of_week_ids) ? item.days_of_week_ids : [],
          applicable_for_single_unit: !!item?.applicable_for_single_unit,
          offer_type: FIXED_OFFER_TYPE,
        });
        const daysFromItem = normalizeDayIds(item?.days_of_week_ids);
        console.log('mix match edit days from item:', item?.days_of_week_ids, 'normalized:', daysFromItem);
        setSelectedDays(daysFromItem);
        setDayPickerValue('');
        setSelectedProducts(
          Array.isArray(item?.product_ids)
            ? item.product_ids
                .map(normalizeProductEntry)
                .filter(Boolean)
            : []
        );
        setSelectedDiscountProducts([]);
        setProductQuery('');
        setDiscountQuery('');
        setProductResults([]);
        setDiscountResults([]);
        setProductDropdownVisible(false);
        setDiscountDropdownVisible(false);
        setFormModalVisible(true);
      }}
    >
    
  
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item?.name || '-'}</Text>
        <View style={styles.cardHeaderActions}>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item?.group_id ?? item?.id)}
          >
            <Icon name="delete" size={16} color="#B91C1C" />
          </TouchableOpacity>
          <View style={[styles.badge, item?.status ? styles.badgeOn : styles.badgeOff]}>
            <Text style={styles.badgeText}>{item?.status ? 'Active' : 'Inactive'}</Text>
          </View>
        </View>
      </View>
      <View style={styles.detailGrid}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Buy</Text>
          <Text style={styles.detailValue}>{item?.no_of_products_to_buy ?? '-'}</Text>
        </View>
        {isQuantityBasedScreen ? (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Price</Text>
            <Text style={styles.detailValue}>{item?.sale_price ?? 0}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Single Unit</Text>
        <Text style={styles.detailValue}>{item?.applicable_for_single_unit ? 'Yes' : 'No'}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Days</Text>
        <Text style={styles.detailValue}>
          {daysList.length
            ? (getDayNames(item?.days_of_week_ids).join(', ') || normalizeDayIds(item?.days_of_week_ids).join(', ') || '-')
            : (normalizeDayIds(item?.days_of_week_ids).join(', ') || '-')}
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Start</Text>
        <Text style={styles.detailValue}>{item?.start_date || '-'}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>End</Text>
        <Text style={styles.detailValue}>{item?.end_date || '-'}</Text>
      </View>
      
    </TouchableOpacity>
    
  );


  const handleSearchProducts = (text) => {
    setProductQuery(text);
    if (productDebounceRef.current) clearTimeout(productDebounceRef.current);
    if (text.trim().length < 3) {
      setProductResults([]);
      setProductDropdownVisible(false);
      return;
    }
    productDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchProductsByBarcode(text.trim());
        
        // Check if first product has variants array
        let productList = [];
        if (Array.isArray(results) && results.length > 0) {
          const firstProduct = results[0];
          if (Array.isArray(firstProduct?.variants) && firstProduct.variants.length > 0) {
            // Show variants instead of the parent product
            productList = firstProduct.variants;
          } else {
            // Show regular products
            productList = results;
          }
        }
        
        const normalized = productList.map((p) => ({
          id: Number(p.id ?? p.product_id ?? p._id),
          name: p.productName ?? p.name ?? p.product_name ?? 'Product',
          barcode: p.barcode,
        }));
        
        setProductResults(normalized.filter((p) => Number.isFinite(p.id)));
        setProductDropdownVisible(true);
      } catch (e) {
        setProductResults([]);
        setProductDropdownVisible(false);
      }
    }, 300);
  };

  const handleSearchDiscountProducts = (text) => {
    setDiscountQuery(text);
    if (discountDebounceRef.current) clearTimeout(discountDebounceRef.current);
    if (text.trim().length < 3) {
      setDiscountResults([]);
      setDiscountDropdownVisible(false);
      return;
    }
    discountDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchProductsByBarcode(text.trim());
        
        // Check if first product has variants array
        let productList = [];
        if (Array.isArray(results) && results.length > 0) {
          const firstProduct = results[0];
          if (Array.isArray(firstProduct?.variants) && firstProduct.variants.length > 0) {
            // Show variants instead of the parent product
            productList = firstProduct.variants;
          } else {
            // Show regular products
            productList = results;
          }
        }
        
        const normalized = productList.map((p) => ({
          id: Number(p.id ?? p.product_id ?? p._id),
          name: p.productName ?? p.name ?? p.product_name ?? 'Product',
          barcode: p.barcode,
        }));
        
        setDiscountResults(normalized.filter((p) => Number.isFinite(p.id)));
        setDiscountDropdownVisible(true);
      } catch (e) {
        setDiscountResults([]);
        setDiscountDropdownVisible(false);
      }
    }, 300);
  };

  const addProduct = (item, setList) => {
    setList((prev) => {
      if (prev.some((p) => p.id === item.id)) return prev;
      return [...prev, item];
    });
  };

  const handleScanBarcode = (target) => {
    if (!hasCameraPermission) {
      Alert.alert('Camera Permission', 'Enable camera access in settings to scan.');
      return;
    }
    setScanTarget(target);
    setScannerVisible(true);
  };

  const onReadCode = (event) => {
    const value = event?.nativeEvent?.codeStringValue;
    if (!value) return;
    setScannerVisible(false);
    if (scanTarget === 'discount') {
      setDiscountQuery(value);
      handleSearchDiscountProducts(value);
    } else {
      setProductQuery(value);
      handleSearchProducts(value);
    }
  };

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const startFilter = filterStart.trim();
    const endFilter = filterEnd.trim();
    return rows.filter((item) => {
      const nameMatch = !q || String(item?.name || '').toLowerCase().includes(q);
      if (!nameMatch) return false;
      if (String(item?.offer_type || '') !== FIXED_OFFER_TYPE) return false;

      const startVal = formatDateOnly(item?.start_date || '');
      const endVal = formatDateOnly(item?.end_date || '');
      if (!startFilter && !endFilter) return true;
      if (startFilter && !endFilter) return startVal && startVal >= startFilter;
      if (!startFilter && endFilter) return endVal && endVal <= endFilter;
      // overlap between [startVal, endVal] and [startFilter, endFilter]
      return (
        startVal &&
        endVal &&
        startVal <= endFilter &&
        endVal >= startFilter
      );
    });
  }, [rows, query, filterStart, filterEnd]);

  const handleLoadMore = () => {
    if (loadingMore || loading) return;
    if (page >= totalPages) return;
    const next = page + 1;
    loadPromotions({ nextPage: next, append: true });
  };

  return (
    <ImageBackground source={reportbg} style={styles.screen} resizeMode="cover">
      <AppHeader Title={SCREEN_TITLE} backgroundType="image" backgroundValue={reportbg} />

      <View style={styles.panelInner}>
        <View style={styles.searchCard}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name"
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
          />
          <View style={styles.searchRow}>
            <View style={[styles.dateFilterWrap, styles.searchHalf]}>
              <TextInput
                style={[styles.searchInput, styles.dateFilterInput]}
                placeholder="Start Date (YYYY-MM-DD)"
                placeholderTextColor="#9CA3AF"
                value={filterStart}
                onChangeText={setFilterStart}
              />
              <TouchableOpacity
                style={styles.calendarBtn}
                onPress={() => setShowFilterStartPicker(true)}
              >
                <Icon name="calendar-today" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={[styles.dateFilterWrap, styles.searchHalf]}>
              <TextInput
                style={[styles.searchInput, styles.dateFilterInput]}
                placeholder="End Date (YYYY-MM-DD)"
                placeholderTextColor="#9CA3AF"
                value={filterEnd}
                onChangeText={setFilterEnd}
              />
              <TouchableOpacity
                style={styles.calendarBtn}
                onPress={() => setShowFilterEndPicker(true)}
              >
                <Icon name="calendar-today" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {Platform.OS === 'android' && showFilterStartPicker && (
          <DateTimePicker
            value={toDate(filterStart)}
            mode="date"
            display="default"
            onChange={handleFilterStartDateChange}
          />
        )}
        {Platform.OS === 'android' && showFilterEndPicker && (
          <DateTimePicker
            value={toDate(filterEnd)}
            mode="date"
            display="default"
            onChange={handleFilterEndDateChange}
          />
        )}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.centerText}>Loading…</Text>
          </View>
        ) : (
          <FlatList
            data={filteredRows}
            keyExtractor={(item) => String(item?.group_id ?? item?.id ?? Math.random())}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 90 }}
            onEndReached={() => {
              if (onEndReachedCalledDuringMomentum.current) return;
              onEndReachedCalledDuringMomentum.current = true;
              handleLoadMore();
            }}
            onEndReachedThreshold={0.4}
            onMomentumScrollBegin={() => {
              onEndReachedCalledDuringMomentum.current = false;
            }}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.center}>
                  <ActivityIndicator size="small" />
                  <Text style={styles.centerText}>Loading more…</Text>
                </View>
              ) : page < totalPages ? (
                <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
                  <Text style={styles.loadMoreText}>Load more</Text>
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.centerText}>
                  {query || filterStart || filterEnd ? 'No matching promotions.' : 'No promotions found.'}
                </Text>
              </View>
            }
          />
        )}
      </View>

      <TouchableOpacity style={styles.createBtn} onPress={handleOpen}>
        <Text style={styles.createBtnText}>Create Mix Match</Text>
      </TouchableOpacity>

      <Modal visible={formModalVisible && !scannerVisible} transparent animationType="fade" onRequestClose={() => setFormModalVisible(false)}>
        <View style={styles.mainModalRoot}>
          <TouchableOpacity style={styles.mainModalBackdrop} activeOpacity={1} onPress={() => setFormModalVisible(false)} />
          <View style={styles.sheet}>
            <TouchableOpacity style={styles.mainModalCloseBtn} onPress={() => setFormModalVisible(false)}>
              <Icon name="close" size={24} color="#111" />
            </TouchableOpacity>
            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
          <Text style={styles.sheetTitle}>{editingId ? 'Update Mix Match' : 'Create Mix Match'}</Text>

          <View style={styles.twoColRow}>
            <View style={styles.twoColItem}>
              <Text style={styles.fieldLabel}>Promotion Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Name"
                placeholderTextColor="#9CA3AF"
                value={form.name}
                onChangeText={(v) => updateForm('name', v)}
              />
            </View>
            <View style={styles.twoColItem}>
              <Text style={styles.fieldLabel}>Buy Quantity</Text>
              <TextInput
                style={styles.input}
                placeholder="Buy Qty"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                value={form.no_of_products_to_buy}
                onChangeText={(v) => updateForm('no_of_products_to_buy', v)}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Products</Text>
          <View style={styles.searchBox}>
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, styles.inputFlex]}
                placeholder="Search product by barcode (min 3 chars)"
                placeholderTextColor="#9CA3AF"
                value={productQuery}
                onChangeText={handleSearchProducts}
              />
              <TouchableOpacity
                style={styles.scanBtn}
                onPress={() => handleScanBarcode('product')}
              >
                <Icon name="qr-code-scanner" size={20} color="#111" />
              </TouchableOpacity>
            </View>
            {productDropdownVisible && productResults.length > 0 && (
              <View style={styles.dropdown}>
                <ScrollView style={{ maxHeight: 180 }}>
                  {productResults.map((p) => (
                    <TouchableOpacity
                      key={String(p.id)}
                      style={styles.dropdownItem}
                      onPress={() => {
                        addProduct(p, setSelectedProducts);
                        setProductDropdownVisible(false);
                        setProductResults([]);
                        setProductQuery('');
                      }}
                    >
                      <Text style={styles.dropdownTitle}>{p.name}</Text>
                      <Text style={styles.dropdownMeta}>ID: {p.id} | Barcode: {p.barcode || '-'}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {!!selectedProducts.length && (
              <View style={styles.selectedWrap}>
                {selectedProducts.map((p) => (
                  <View key={`prod-${p.id}`} style={styles.chip}>
                    <Text style={styles.chipText}>{p.name}</Text>
                    <TouchableOpacity
                      onPress={() => setSelectedProducts((prev) => prev.filter((x) => x.id !== p.id))}
                    >
                      <Text style={styles.chipRemove}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.twoColRow}>
            <View style={styles.twoColItem}>
              <Text style={styles.fieldLabel}>Sale Price</Text>
              <TextInput
                style={styles.input}
                placeholder="Sale Price"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                value={form.sale_price}
                onChangeText={(v) => updateForm('sale_price', v)}
              />
            </View>
            <View style={styles.twoColItem} />
          </View>
          <View style={styles.datePairRow}>
            <View style={[styles.dateSelector, styles.dateSelectorHalf]}>
              <Text style={styles.dateInputLabel}>Start Date</Text>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={toDate(form.start_date)}
                  mode="date"
                  display="compact"
                  themeVariant="light"
                  onChange={handleStartDateChange}
                  style={styles.iosPicker}
                />
              ) : (
                <TouchableOpacity onPress={() => setShowStartPicker(true)} activeOpacity={0.8}>
                  <Text style={form.start_date ? styles.dateInputText : styles.dateInputPlaceholder}>
                    {form.start_date ? formatDateOnly(form.start_date) : 'Select date'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={[styles.dateSelector, styles.dateSelectorHalf]}>
              <Text style={styles.dateInputLabel}>End Date</Text>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={toDate(form.end_date)}
                  mode="date"
                  display="compact"
                  themeVariant="light"
                  onChange={handleEndDateChange}
                  style={styles.iosPicker}
                />
              ) : (
                <TouchableOpacity onPress={() => setShowEndPicker(true)} activeOpacity={0.8}>
                  <Text style={form.end_date ? styles.dateInputText : styles.dateInputPlaceholder}>
                    {form.end_date ? formatDateOnly(form.end_date) : 'Select date'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.twoColRow}>
            <View style={styles.twoColItem}>
              <Text style={styles.fieldLabel}>Applicable Days</Text>
              <View style={styles.pickerWrap}>
                <Picker
                  selectedValue={dayPickerValue}
                  onValueChange={(val) => {
                    setDayPickerValue(val);
                    const dayId = Number(val?.id ?? val?.value ?? val);
                    if (!Number.isFinite(dayId) || dayId <= 0) return;
                    setSelectedDays((prev) => {
                      const next = prev.includes(dayId)
                        ? prev.filter((id) => id !== dayId)
                        : [...prev, dayId];
                      console.log('mix match day toggle:', dayId, 'next:', next);
                      return next;
                    });
                  }}
                  style={{ color: '#111' }}
                  dropdownIconColor="#333"
                >
                  <Picker.Item label="Select Day" value="" />
                  {daysList.map((d) => (
                    <Picker.Item key={String(d.id)} label={String(d.name)} value={d.id} />
                  ))}
                </Picker>
              </View>
            </View>
          </View>

          {Platform.OS === 'android' && showStartPicker && (
            <DateTimePicker
              value={toDate(form.start_date)}
              mode="date"
              display="default"
              onChange={handleStartDateChange}
            />
          )}
          {Platform.OS === 'android' && showEndPicker && (
            <DateTimePicker
              value={toDate(form.end_date)}
              mode="date"
              display="default"
              onChange={handleEndDateChange}
            />
          )}

          {!!selectedDays.length && (
            <View style={styles.selectedWrap}>
              {selectedDays.map((id) => {
                const dayName = daysList.find((d) => d.id === id)?.name || `ID: ${id}`;
                return (
                  <View key={`day-${id}`} style={styles.chip}>
                    <Text style={styles.chipText}>{dayName}</Text>
                    <TouchableOpacity onPress={() => setSelectedDays((prev) => prev.filter((x) => x !== id))}>
                      <Text style={styles.chipRemove}>×</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.toggleRow}>
            {/* <View style={[styles.twoColItem, styles.toggleItem]}>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Discount on Product</Text>
                <Switch
                  value={form.is_add_discount_on_product}
                  onValueChange={(v) => updateForm('is_add_discount_on_product', v)}
                />
              </View>
            </View> */}
            <View style={[styles.twoColItem, styles.toggleItem]}>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Applicable for Single Unit</Text>
                <Switch
                  value={form.applicable_for_single_unit}
                  onValueChange={(v) => updateForm('applicable_for_single_unit', v)}
                />
              </View>
            </View>
          </View>
          <View style={styles.toggleRow}>
            <View style={[styles.twoColItem, styles.toggleItem]}>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Status</Text>
                <Switch value={form.status} onValueChange={(v) => updateForm('status', v)} />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleCreate}
            disabled={submitting}
          >
            <Text style={styles.submitBtnText}>
              {submitting ? 'Saving…' : editingId ? 'Update Mix Match' : 'Create Mix Match'}
            </Text>
          </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {Platform.OS === 'ios' && (
        <Modal visible={showFilterStartPicker} transparent animationType="fade" onRequestClose={() => setShowFilterStartPicker(false)}>
          <View style={styles.filterPickerModalRoot}>
            <TouchableOpacity style={styles.filterPickerModalBackdrop} activeOpacity={1} onPress={() => setShowFilterStartPicker(false)} />
            <View style={styles.filterPickerModalCard}>
              <Text style={styles.filterPickerTitle}>Select Start Date</Text>
              <DateTimePicker
                value={toDate(filterStart)}
                mode="date"
                display="inline"
                themeVariant="light"
                onChange={handleFilterStartDateChange}
              />
              <TouchableOpacity style={styles.filterPickerDoneBtn} onPress={() => setShowFilterStartPicker(false)}>
                <Text style={styles.filterPickerDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={showFilterEndPicker} transparent animationType="fade" onRequestClose={() => setShowFilterEndPicker(false)}>
          <View style={styles.filterPickerModalRoot}>
            <TouchableOpacity style={styles.filterPickerModalBackdrop} activeOpacity={1} onPress={() => setShowFilterEndPicker(false)} />
            <View style={styles.filterPickerModalCard}>
              <Text style={styles.filterPickerTitle}>Select End Date</Text>
              <DateTimePicker
                value={toDate(filterEnd)}
                mode="date"
                display="inline"
                themeVariant="light"
                onChange={handleFilterEndDateChange}
              />
              <TouchableOpacity style={styles.filterPickerDoneBtn} onPress={() => setShowFilterEndPicker(false)}>
                <Text style={styles.filterPickerDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      <Modal visible={scannerVisible} animationType="slide">
        {hasCameraPermission ? (
          <View style={{ flex: 1 }}>
            <Camera
              style={{ flex: 1 }}
              cameraType={CameraType.Back}
              scanBarcode
              onReadCode={onReadCode}
            />
            <View style={styles.scannerControls}>
              <TouchableOpacity style={styles.scannerBtn} onPress={() => setScannerVisible(false)}>
                <Text style={styles.scannerBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.permissionDenied}>
            <Text style={{ color: 'red' }}>Camera permission denied. Please allow access in settings.</Text>
            <TouchableOpacity style={[styles.scannerBtn, { marginTop: 16 }]} onPress={() => setScannerVisible(false)}>
              <Text style={styles.scannerBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { paddingVertical: 40, alignItems: 'center' },
  centerText: { marginTop: 8, color: '#666' },
  panelInner: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
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
  searchCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    padding: 10,
    marginBottom: 12,
  },
  searchRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  dateFilterWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#111',
    backgroundColor: '#fff',
  },
  dateFilterInput: { flex: 1 },
  calendarBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
  },
  searchHalf: { flex: 1 },
  filterPickerModalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  filterPickerModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000055',
  },
  filterPickerModalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
  },
  filterPickerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 10,
  },
  filterPickerDoneBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    backgroundColor: '#16A34A',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  filterPickerDoneText: {
    color: '#fff',
    fontWeight: '700',
  },

  card: {
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1FAE5',
    borderLeftWidth: 4,
    borderLeftColor: '#16A34A',
    backgroundColor: '#F0FDF4',
    marginBottom: 12,
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  detailItem: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DCFCE7',
    padding: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  detailLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  detailValue: { fontSize: 12, color: '#111827', fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeOn: { backgroundColor: '#DCFCE7' },
  badgeOff: { backgroundColor: '#FEE2E2' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#111' },
  cardHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  createBtn: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    ...Platform.select({
      android: { elevation: 3 },
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
    }),
  },
  createBtnText: { color: '#fff', fontWeight: '700' },
  loadMoreBtn: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#16A34A',
    backgroundColor: '#EAF7EF',
  },
  loadMoreText: { color: '#166534', fontWeight: '700' },

  mainModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  mainModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000077',
  },
  sheet: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  modalScrollContent: { paddingBottom: 28 },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  twoColItem: {
    flex: 1,
    minWidth: 140,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  toggleItem: {
    minWidth: 220,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mainModalCloseBtn: {
    alignSelf: 'flex-end',
    padding: 4,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#111',
    marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 10 },
  inputHalf: { flex: 1 },
  pickerWrap: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 10,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  dateInputLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  dateInputText: { marginTop: 4, fontSize: 13, color: '#111', fontWeight: '600' },
  dateInputPlaceholder: { marginTop: 4, fontSize: 13, color: '#9CA3AF' },
  datePairRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  dateSelector: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  dateSelectorHalf: {
    flex: 1,
    minWidth: 140,
  },
  iosPicker: {
    marginTop: 2,
    alignSelf: 'stretch',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchLabel: { color: '#111', fontWeight: '600', flex: 1, flexShrink: 1 },
  submitBtn: {
    backgroundColor: '#319241',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  submitBtnText: { color: '#fff', fontWeight: '700' },
  searchBox: { position: 'relative', marginBottom: 10, overflow: 'visible', zIndex: 100 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputFlex: { flex: 1 },
  scanBtn: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  dropdown: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    zIndex: 999,
    elevation: 20,
  },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EFEFEF' },
  dropdownTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  dropdownMeta: { fontSize: 11, color: '#666', marginTop: 2 },
  selectedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipText: { fontSize: 11, fontWeight: '600', color: '#1E3A8A' },
  chipRemove: { fontSize: 12, fontWeight: '700', color: '#1E3A8A' },
  scannerControls: {
    position: 'absolute',
    bottom: 30,
    width: '100%',
    alignItems: 'center',
  },
  scannerBtn: {
    backgroundColor: '#000000AA',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  scannerBtnText: { color: '#fff', fontWeight: '700' },
  permissionDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
});
