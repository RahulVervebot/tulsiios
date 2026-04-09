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
  Alert,
  ImageBackground,
  Platform,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Camera, CameraType } from 'react-native-camera-kit';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import {
  getQuantityDiscountPromotions,
  createQuantityDiscountPromotion,
  updateQuantityDiscountPromotion,
  deleteQuantityDiscountPromotion,
  searchProductsByBarcode,
} from './function';
import AppHeader from '../../components/AppHeader';
import reportbg from '../../assets/images/report-bg.png';

const DEFAULT_FORM = {
  product_id: null,
  no_of_product_to_buy: '1',
  discount_amount: '1',
  start_date: '',
  end_date: '',
};

export default function QuantityDiscountScreen() {
  const onEndReachedCalledDuringMomentum = useRef(false);
  const searchInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState(null);

  const [query, setQuery] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [showFilterStartPicker, setShowFilterStartPicker] = useState(false);
  const [showFilterEndPicker, setShowFilterEndPicker] = useState(false);

  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productDropdownVisible, setProductDropdownVisible] = useState(false);
  const productDebounceRef = useRef(null);

  const [scannerVisible, setScannerVisible] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [formModalVisible, setFormModalVisible] = useState(false);

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
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    updateForm('start_date', `${yyyy}-${mm}-${dd} 00:00:00`);
    // if (Platform.OS === 'ios') {
    //   setShowStartPicker(false);
    // } else {
    //   setShowStartPicker(false);
    // }
  };

  const handleEndDateChange = (_, date) => {
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    updateForm('end_date', `${yyyy}-${mm}-${dd} 23:59:59`);
    // if (Platform.OS === 'ios') {
    //   setShowEndPicker(false);
    // } else {
    //   setShowEndPicker(false);
    // }
  };

  const handleFilterStartDateChange = (_, date) => {
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    setFilterStart(`${yyyy}-${mm}-${dd}`);
    setShowFilterStartPicker(false);
  };

  const handleFilterEndDateChange = (_, date) => {
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    setFilterEnd(`${yyyy}-${mm}-${dd}`);
    setShowFilterEndPicker(false);
  };

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const loadPromotions = async ({ nextPage = 1, append = false } = {}) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      const res = await getQuantityDiscountPromotions({
        page: nextPage,
        limit: 10,
        start_date: filterStart || undefined,
        end_date: filterEnd || undefined,
      });
      const nextRows = Array.isArray(res?.data) ? res.data : [];
      console.log("loaded promotions,", res);
      setRows((prev) => (append ? [...prev, ...nextRows] : nextRows));
      setPage(Number(res?.page ?? nextPage) || nextPage);
      setTotalPages(Number(res?.total_pages ?? 1) || 1);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to load promotions.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setPage(1);
    loadPromotions({ nextPage: 1, append: false });
  }, [filterStart, filterEnd]);

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

  const handleOpen = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setSelectedProduct(null);
    setProductQuery('');
    setProductResults([]);
    setProductDropdownVisible(false);
    setShowStartPicker(false);
    setShowEndPicker(false);
    setFormModalVisible(true);
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 300);
  };

  const handleCreateOrUpdate = async () => {
    if (!selectedProduct?.id && !form.product_id) {
      return Alert.alert('Missing info', 'Please select a product.');
    }
    const payload = {
      product_id: Number(selectedProduct?.id ?? form.product_id),
      no_of_product_to_buy: Number(form.no_of_product_to_buy || 0),
      discount_amount: Number(form.discount_amount || 0),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    };
    try {
      setSubmitting(true);
      const res = editingId
        ? await updateQuantityDiscountPromotion(payload)
        : await createQuantityDiscountPromotion(payload);
      const message = res?.message || res?.result?.message || 'Quantity discount saved successfully';
      Alert.alert('Success', message);
      setFormModalVisible(false);
      loadPromotions();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to save promotion.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (productId) => {
    if (!productId) return;
    Alert.alert('Delete Promotion', 'Are you sure you want to delete this promotion?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setSubmitting(true);
            const res = await deleteQuantityDiscountPromotion(productId);
            const message = res?.message || res?.result?.message || 'Promotion deleted successfully';
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

  const handleSearchProducts = (text) => {
    setProductQuery(text);
    if (productDebounceRef.current) clearTimeout(productDebounceRef.current);
    if (text.trim().length < 2) {
      setProductResults([]);
      setProductDropdownVisible(false);
      return;
    }
    productDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchProductsByBarcode(text.trim());
        const normalized = Array.isArray(results)
          ? results.map((p) => ({
              id: Number(p.id ?? p.product_id ?? p._id),
              name: p.productName ?? p.product_name ?? p.name ?? 'Product',
              barcode: p.barcode || '',
              salePrice: p.salePrice ?? p.sale_price ?? '',
            }))
          : [];
          console.log("search products results,", results);
        const searchTerm = text.trim().toLowerCase();
        const filtered = normalized.filter((p) => {
          if (!Number.isFinite(p.id)) return false;
          const nameMatch = String(p.name).toLowerCase().includes(searchTerm);
          const barcodeMatch = String(p.barcode).toLowerCase().includes(searchTerm);
          const priceMatch = String(p.salePrice).toLowerCase().includes(searchTerm);
          return nameMatch || barcodeMatch || priceMatch;
        });
        setProductResults(filtered);
 
        setProductDropdownVisible(filtered.length > 0);
      } catch (e) {
        setProductResults([]);
        setProductDropdownVisible(false);
      }
    }, 300);
  };

  const handleScanBarcode = () => {
    if (!hasCameraPermission) {
      Alert.alert('Camera Permission', 'Enable camera access in settings to scan.');
      return;
    }
    setScannerVisible(true);
  };

  const onReadCode = (event) => {
    const value = event?.nativeEvent?.codeStringValue;
    if (!value) return;
    setScannerVisible(false);
    setProductQuery(value);
    handleSearchProducts(value);
  };

const filteredRows = useMemo(() => {
  const q = query.trim().toLowerCase();
  const startFilter = filterStart.trim();
  const endFilter = filterEnd.trim();

  return rows.filter((item) => {
    const productName = String(item?.product_name || '').toLowerCase();
    const barcode = String(item?.barcode || '').toLowerCase();

    const searchMatch =
      !q ||
      productName.includes(q) ||
      barcode.includes(q);

    if (!searchMatch) return false;

    const startVal = formatDateOnly(item?.start_date || '');
    const endVal = formatDateOnly(item?.end_date || '');

    if (!startFilter && !endFilter) return true;
    if (startFilter && !endFilter) return startVal && startVal >= startFilter;
    if (!startFilter && endFilter) return endVal && endVal <= endFilter;

    return startVal && endVal && startVal <= endFilter && endVal >= startFilter;
  });
}, [rows, query, filterStart, filterEnd]);

  const handleLoadMore = () => {
    if (loadingMore || loading) return;
    if (page >= totalPages) return;
    const next = page + 1;
    loadPromotions({ nextPage: next, append: true });
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => {
        setEditingId(item?.id ?? null);
        setForm({
          product_id: item?.product_id ?? null,
          product_name: item?.product_name ?? null,
          no_of_product_to_buy: String(item?.number_of_product_to_buy ?? 1),
          discount_amount: String(item?.discount_amount ?? 0),
          start_date: item?.start_date || '',
          end_date: item?.end_date || '',
        });
        setSelectedProduct({
          id: Number(item?.product_id),
          name: item?.product_name || 'Product',
          barcode: item?.barcode || '',
        });
        console.log("editing promotion,", item);
        setProductQuery('');
        setProductResults([]);
        setProductDropdownVisible(false);
        setShowStartPicker(false);
        setShowEndPicker(false);
        setFormModalVisible(true);
      }}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item?.product_name || '-'}</Text>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item?.product_id)}>
          <Icon name="delete" size={16} color="#B91C1C" />
        </TouchableOpacity>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Barcode</Text>
        <Text style={styles.detailValue}>{item?.barcode || '-'}</Text>
      </View>
      <View style={styles.detailGrid}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Sale Price</Text>
          <Text style={styles.detailValue}>{item?.actual_product_price.toFixed(2) ?? '-'}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Buy Qty</Text>
          <Text style={styles.detailValue}>{(item?.number_of_product_to_buy) ?? '-'}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Discount Amount</Text>
          <Text style={styles.detailValue}>{Number(item?.discount_amount).toFixed(2) ?? '-'}</Text>
        </View>
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

  return (
    <ImageBackground source={reportbg} style={styles.screen} resizeMode="cover">
      <AppHeader Title="QUANTITY DISCOUNT" backgroundType="image" backgroundValue={reportbg} />

      <View style={styles.panelInner}>
        <View style={styles.searchCard}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by product name or barcode"
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
                <Icon name="calendar-today" size={18} color="#111" />
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
                <Icon name="calendar-today" size={18} color="#111" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
         {showFilterStartPicker && (
          <Modal visible={showFilterStartPicker} transparent animationType="fade">
            <View style={styles.datePickerModal}>
              <TouchableOpacity 
                style={styles.datePickerBackdrop}
                activeOpacity={1}
                onPress={() => setShowFilterStartPicker(false)}
              />
              <View style={styles.datePickerContainer}>
                <View style={styles.datePickerHeader}>
                  <Text style={styles.datePickerTitle}>Filter by Start Date</Text>
                  <TouchableOpacity onPress={() => setShowFilterStartPicker(false)}>
                    <Icon name="close" size={24} color="#111" />
                  </TouchableOpacity>
                </View>
                <View style={styles.datePickerContent}>
                  <DateTimePicker
                    value={toDate(filterStart)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleFilterStartDateChange}
                    textColor="#111"
                    themeVariant="light"
                  />
                </View>
                <View style={styles.datePickerFooter}>
                  <TouchableOpacity 
                    style={[styles.btn, styles.btnCancel]}
                    onPress={() => setShowFilterStartPicker(false)}
                  >
                    <Text style={styles.btnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.btn, styles.btnConfirm]}
                    onPress={() => setShowFilterStartPicker(false)}
                  >
                    <Text style={styles.btnConfirmText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
        {showFilterEndPicker && (
          <Modal visible={showFilterEndPicker} transparent animationType="fade">
            <View style={styles.datePickerModal}>
              <TouchableOpacity 
                style={styles.datePickerBackdrop}
                activeOpacity={1}
                onPress={() => setShowFilterEndPicker(false)}
              />
              <View style={styles.datePickerContainer}>
                <View style={styles.datePickerHeader}>
                  <Text style={styles.datePickerTitle}>Filter by End Date</Text>
                  <TouchableOpacity onPress={() => setShowFilterEndPicker(false)}>
                    <Icon name="close" size={24} color="#111" />
                  </TouchableOpacity>
                </View>
                <View style={styles.datePickerContent}>
                  <DateTimePicker
                    value={toDate(filterEnd)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleFilterEndDateChange}
                    textColor="#111"
                    themeVariant="light"
                  />
                </View>
                <View style={styles.datePickerFooter}>
                  <TouchableOpacity 
                    style={[styles.btn, styles.btnCancel]}
                    onPress={() => setShowFilterEndPicker(false)}
                  >
                    <Text style={styles.btnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.btn, styles.btnConfirm]}
                    onPress={() => setShowFilterEndPicker(false)}
                  >
                    <Text style={styles.btnConfirmText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.centerText}>Loading…</Text>
          </View>
        ) : (
          <FlatList
            data={filteredRows}
            keyExtractor={(item) => String(item?.id ?? item?.product_id ?? Math.random())}
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
        <Text style={styles.createBtnText}>Create Quantity Discount</Text>
      </TouchableOpacity>

      <Modal
        visible={formModalVisible && !scannerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFormModalVisible(false)}
      >
        <View style={styles.formModalRoot}>
          <TouchableOpacity
            style={styles.formModalOverlay}
            activeOpacity={1}
            onPress={() => setFormModalVisible(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.select({ ios: 'padding', android: undefined })}
            style={styles.formModalCentered}
          >
            <View style={styles.formModalCard}>
            <TouchableOpacity style={styles.formModalCloseBtn} onPress={() => setFormModalVisible(false)}>
              <Icon name="close" size={20} color="#111" />
            </TouchableOpacity>
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>{editingId ? 'Update Quantity Discount' : 'Create Quantity Discount'}</Text>

          <View style={styles.searchBox}>
           { !editingId ?
           <>
             <View style={styles.searchRowInline}>
              <TextInput
                style={[styles.input, styles.inputFlex]}
                placeholder="Search product by barcode (min 3 chars)"
                placeholderTextColor="#9CA3AF"
                value={productQuery}
                onChangeText={handleSearchProducts}
              />
              <TouchableOpacity style={styles.scanBtn} onPress={handleScanBarcode}>
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
                        setSelectedProduct(p);
                        updateForm('product_id', p.id);
                        setProductDropdownVisible(false);
                        setProductResults([]);
                        setProductQuery('');
                      }}
                    >
                      <Text style={styles.dropdownTitle}>{p.name}</Text>
                      <Text style={styles.dropdownMeta}>Barcode: {p.barcode || '-'}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            </>
      :''    }
            {selectedProduct && (
              <View style={[styles.card, { marginTop: 8 }]}>
                <Text style={styles.cardTitle}>{selectedProduct?.name || 'Product'}</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Barcode</Text>
                  <Text style={styles.detailValue}>{selectedProduct?.barcode || '-'}</Text>
                </View>
              </View>
            )}

          
          </View>

          <View style={styles.row}>
            <View style={styles.inputHalf}>
              <View style={styles.dateInputHeader}>
                <Icon name="shopping-cart" size={16} color="#319241" />
                <Text style={styles.dateInputLabel}>Buy Qty</Text>
              </View>
              <TextInput
                style={[styles.input, { marginBottom: 0 }]}
                placeholder="Enter quantity"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                value={form.no_of_product_to_buy}
                onChangeText={(v) => updateForm('no_of_product_to_buy', v)}
              />
            </View>
      
            <View style={styles.inputHalf}>
              <View style={styles.dateInputHeader}>
                <Icon name="local-offer" size={16} color="#D9534F" />
                <Text style={styles.dateInputLabel}>Discount Amount</Text>
              </View>
              <TextInput
                style={[styles.input, { marginBottom: 0 }]}
                placeholder="Enter discount"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                value={form.discount_amount}
                onChangeText={(v) => updateForm('discount_amount', v)}
              />
            </View>
         
          </View>

          <View style={styles.dateRow}>
            <TouchableOpacity
              style={[styles.dateInput, { flex: 1 }]}
              onPress={() => setShowStartPicker(true)}
              activeOpacity={0.7}
            >
              <View style={styles.dateInputHeader}>
                <Icon name="event" size={16} color="#319241" />
                <Text style={styles.dateInputLabel}>Start Date</Text>
              </View>
              <Text style={form.start_date ? styles.dateInputText : styles.dateInputPlaceholder}>
                {form.start_date ? formatDateOnly(form.start_date) : 'Select'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dateInput, { flex: 1 }]}
              onPress={() => setShowEndPicker(true)}
              activeOpacity={0.7}
            >
              <View style={styles.dateInputHeader}>
                <Icon name="event" size={16} color="#D9534F" />
                <Text style={styles.dateInputLabel}>End Date</Text>
              </View>
              <Text style={form.end_date ? styles.dateInputText : styles.dateInputPlaceholder}>
                {form.end_date ? formatDateOnly(form.end_date) : 'Select'}
              </Text>
            </TouchableOpacity>
          </View>

          {showStartPicker && (
            <Modal visible={showStartPicker} transparent animationType="fade">
              <View style={styles.datePickerModal}>
                <TouchableOpacity 
                  style={styles.datePickerBackdrop}
                  activeOpacity={1}
                  onPress={() => setShowStartPicker(false)}
                />
                <View style={styles.datePickerContainer}>
                  <View style={styles.datePickerHeader}>
                    <Text style={styles.datePickerTitle}>Select Start Date</Text>
                    <TouchableOpacity onPress={() => setShowStartPicker(false)}>
                      <Icon name="close" size={24} color="#111" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.datePickerContent}>
                    <DateTimePicker
                      value={toDate(form.start_date)}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleStartDateChange}
                      textColor="#111"
                      themeVariant="light"
                    />
                  </View>
                  <View style={styles.datePickerFooter}>
                    <TouchableOpacity 
                      style={[styles.btn, styles.btnCancel]}
                      onPress={() => setShowStartPicker(false)}
                    >
                      <Text style={styles.btnCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.btn, styles.btnConfirm]}
                      onPress={() => setShowStartPicker(false)}
                    >
                      <Text style={styles.btnConfirmText}>Confirm</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          )}
          {showEndPicker && (
            <Modal visible={showEndPicker} transparent animationType="fade">
              <View style={styles.datePickerModal}>
                <TouchableOpacity 
                  style={styles.datePickerBackdrop}
                  activeOpacity={1}
                  onPress={() => setShowEndPicker(false)}
                />
                <View style={styles.datePickerContainer}>
                  <View style={styles.datePickerHeader}>
                    <Text style={styles.datePickerTitle}>Select End Date</Text>
                    <TouchableOpacity onPress={() => setShowEndPicker(false)}>
                      <Icon name="close" size={24} color="#111" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.datePickerContent}>
                    <DateTimePicker
                      value={toDate(form.end_date)}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleEndDateChange}
                      textColor="#111"
                      themeVariant="light"
                    />
                  </View>
                  <View style={styles.datePickerFooter}>
                    <TouchableOpacity 
                      style={[styles.btn, styles.btnCancel]}
                      onPress={() => setShowEndPicker(false)}
                    >
                      <Text style={styles.btnCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.btn, styles.btnConfirm]}
                      onPress={() => setShowEndPicker(false)}
                    >
                      <Text style={styles.btnConfirmText}>Confirm</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleCreateOrUpdate}
            disabled={submitting}
          >
            <Text style={styles.submitBtnText}>
              {submitting ? 'Saving…' : editingId ? 'Update Quantity Discount' : 'Create Quantity Discount'}
            </Text>
          </TouchableOpacity>
            </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={scannerVisible} animationType="slide">
        {hasCameraPermission ? (
          <View style={{ flex: 1 }}>
            <Camera style={{ flex: 1 }} cameraType={CameraType.Back} scanBarcode onReadCode={onReadCode} />
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
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  searchHalf: { flex: 1 },

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
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', flex: 1, paddingRight: 8 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
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

  formModalRoot: {
    flex: 1,
  },
  formModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000077',
  },
  formModalCentered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  formModalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 8,
      },
    }),
  },
  formModalCloseBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 14, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#111',
    fontSize: 14,
    backgroundColor: '#FAFBFC',
    marginBottom: 12,
  },
  row: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  inputHalf: { flex: 1 },
  dateRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  dateInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
  },
  dateInputHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  dateInputLabel: { fontSize: 11, color: '#6B7280', fontWeight: '700' },
  dateInputText: { fontSize: 14, color: '#111', fontWeight: '700' },
  dateInputPlaceholder: { fontSize: 14, color: '#9CA3AF', fontWeight: '500' },
  submitBtn: {
    backgroundColor: '#319241',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
    elevation: 2,
    shadowColor: '#319241',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  searchBox: { position: 'relative', marginBottom: 10, overflow: 'visible', zIndex: 100 },
  searchRowInline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputFlex: { flex: 1 },
  searchInput: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  scanBtn: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderColor: '#319241',
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
  dropdownMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  dropdownMeta: { fontSize: 11, color: '#666' },
  datePickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  datePickerBackdrop: {
    flex: 1,
  },
  datePickerContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 0,
    maxHeight: '70%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: -4 },
      },
      android: {
        elevation: 8,
      },
    }),
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  datePickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  datePickerContent: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  datePickerFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  btnConfirm: {
    backgroundColor: '#319241',
  },
  btnCancelText: {
    color: '#666',
    fontWeight: '700',
    fontSize: 14,
  },
  btnConfirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  selectedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E7F5EC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#B7E4C7',
  },
  chipText: { fontSize: 12, fontWeight: '700', color: '#166534', flex: 1 },
  chipRemove: { fontSize: 14, fontWeight: '700', color: '#D9534F' },

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
