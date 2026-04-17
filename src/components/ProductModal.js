import React, {
  forwardRef, useImperativeHandle, useRef, useState,
  useMemo, useEffect, useContext
} from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, Platform, Modal, Switch, useColorScheme, KeyboardAvoidingView
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { Camera, CameraType } from 'react-native-camera-kit';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  getTopCategories,
  VendorList,
  TaxList,
  getUOMList,
  createCustomVariantProduct,
  updateCustomVariantProduct,
  archiveProduct
} from '../functions/product-function';
import { CartContext } from '../context/CartContext';
import { PrintContext } from '../context/PrintContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createQuantityDiscountPromotion } from '../screens/promotions/function';

const THEME = { primary: '#319241', secondary: '#319241', price: '#27ae60' };

const ProductModal = forwardRef(({ onAddToCart, onAddToPrint }, ref) => {
  const [visible, setVisible] = useState(false);
  const { cart, addToCart, increaseQty, decreaseQty } = useContext(CartContext);
  const { print, addToPrint, increasePrintQty, decreasePrintQty, removeFromprint } = useContext(PrintContext);
  const _isDark = useColorScheme() === 'dark';

  const inputTextColor = '#111';
  const placeholderColor = '#6B7280';
  const inputBg = '#fff';
  const inputBorder = '#ddd';
  const iconColor = '#333';

  const [storeUrl, setStoreUrl] = useState('');
  const [token, setToken] = useState('');

  const [product, setProduct] = useState(null);
  const [userrole, setUserRole] = useState('');

  const [id, setID] = useState('');
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [barcodeOriginal, setBarcodeOriginal] = useState('');
  const [newBarcode, setNewBarcode] = useState('');

  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [qtyavailable, setQtyAvailable] = useState('');
  const [unitc, setUnitc] = useState('');
  const [casecost, setCaseCost] = useState('');

  const [categoryId, setCategoryId] = useState('');
  const [selectedVendors, setSelectedVendors] = useState([]); // Original API objects
  const [searchText, setSearchText] = useState('');
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [vendorModalVisible, setVendorModalVisible] = useState(false);
  const searchDebounceRef = useRef(null);
  const [selectedTaxIds, setSelectedTaxIds] = useState([]);

  const [availablePOS, setAvailablePOS] = useState(false);
  const [in_store_label_product, setin_store_label_product] = useState(false);
  const [serverin_store_label_product, setServerin_store_label_product] = useState(null);
  const [isEBT, setIsEBT] = useState(false);
  const [ewic, setEwic] = useState(false);
  const [otc, setOtc] = useState(false);

  const [allCats, setAllCats] = useState([]);
  const [vendorList, setVendorList] = useState([]);
  const [taxList, setTaxList] = useState([]);
  const [uomList, setUomList] = useState([]);

  const [imgBase64, setImgBase64] = useState('');
  const [imgMime, setImgMime] = useState('image/jpeg');

  const [scannerVisible, setScannerVisible] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);

  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [taxModalVisible, setTaxModalVisible] = useState(false);
  const [uomModalVisible, setUomModalVisible] = useState(false);
  const [selectedUomId, setSelectedUomId] = useState('');
  const [selectedUomName, setSelectedUomName] = useState('');
  const [variantModalVisible, setVariantModalVisible] = useState(false);
  const [variantName, setVariantName] = useState('');
  const [variantCode, setVariantCode] = useState('');
  const [variantBarcode, setVariantBarcode] = useState('');
  const [variantPrice, setVariantPrice] = useState('');
  const [variantSubmitting, setVariantSubmitting] = useState(false);
  const [variantsModalVisible, setVariantsModalVisible] = useState(false);
  const [variantsList, setVariantsList] = useState([]);
  const [editingVariantId, setEditingVariantId] = useState(null);
  const [editingVariantName, setEditingVariantName] = useState('');
  const [editingVariantPrice, setEditingVariantPrice] = useState('');
  const [qdModalVisible, setQdModalVisible] = useState(false);
  const [qdSubmitting, setQdSubmitting] = useState(false);
  const [qdBuyQty, setQdBuyQty] = useState('1');
  const [qdDiscount, setQdDiscount] = useState('1');
  const [qdStartDate, setQdStartDate] = useState('');
  const [qdEndDate, setQdEndDate] = useState('');
  const [qdShowStartPicker, setQdShowStartPicker] = useState(false);
  const [qdShowEndPicker, setQdShowEndPicker] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  
  const [isProductEditPermission, setIsProductEditPermission] = useState(true);
  const [isShowCostPrice, setIsShowCostPrice] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, t, editPerm, costPerm] = await Promise.all([
          AsyncStorage.getItem('storeurl'),
          AsyncStorage.getItem('access_token'),
          AsyncStorage.getItem('is_product_edit_permission_in_app'),
          AsyncStorage.getItem('is_show_cost_price'),
        ]);

        if (!s || !t) {
          Alert.alert('Missing config', 'store_url or access_token not found.');
          return;
        }
        setStoreUrl(s);
        setToken(t);
        setIsProductEditPermission(editPerm === 'true');
        setIsShowCostPrice(costPerm === 'true');
      } catch {
        Alert.alert('Error', 'Failed to load credentials.');
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const perm = Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;
        const result = await request(perm);
        const userRole = await AsyncStorage.getItem('userRole');
        setUserRole(userRole);
        setHasCameraPermission(result === RESULTS.GRANTED);
      } catch {
        setHasCameraPermission(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [cats, taxes, uoms] = await Promise.all([
          getTopCategories(),
          TaxList(),
          getUOMList(),
        ]);
        const normCats = Array.isArray(cats) ? cats.map(c => ({
          id: String(c.id ?? c._id ?? ''),
          name: String(c.name ?? c.category ?? ''),
        })) : [];
        const normTaxes = Array.isArray(taxes) ? taxes.map(t => ({
          id: String(t.id ?? t.taxId ?? t._id ?? ''),
          name: String(t.name ?? t.taxName ?? ''),
        })) : [];
        const uomSource = Array.isArray(uoms)
          ? uoms
          : (Array.isArray(uoms?.data) ? uoms.data : []);
        const normUom = uomSource.map(u => ({
          id: String(u.id ?? u.uomId ?? u._id ?? ''),
          name: String(u.name ?? u.uomName ?? ''),
        }));
        setAllCats(normCats);
        setVendorList([]);
        setTaxList(normTaxes);
        setUomList(normUom);
      } catch (e) {
        console.log('Failed to fetch lists:', e?.message);
      }
    })();
  }, []);

  useImperativeHandle(ref, () => ({
    open: (p) => {
      setProduct(p || null);
      if (p) {
        console.log("Opening product modal for:", p);
        setID(String(p.product_id ?? p.id ?? ''));
        setName(p.productName ?? p.name ?? '');
        setSize(p.productSize ?? p.size ?? '');
        setBarcodeOriginal(p.barcode || '');
        setNewBarcode('');
        setPrice(p.salePrice != null ? String(p.salePrice) : '');
        setCost(p.costPrice != null ? String(p.costPrice) : '');
         setQtyAvailable(p.qtyAvailable != null ? String(p.qtyAvailable) : '');
        setUnitc(p.unitInCase != null ? String(p.unitInCase) : '');
        setCaseCost(p.caseCost != null ? String(p.caseCost) : '');
        setCategoryId(p.categoryId != null ? String(p.categoryId) : '');
        const apiUom = p?.unitOfMeasure && typeof p.unitOfMeasure === 'object' ? p.unitOfMeasure : null;
        const apiUomId = apiUom?.id != null ? String(apiUom.id) : '';
        const apiUomName = String(apiUom?.name ?? '').trim();
        const fallbackUomId = p.uom_id != null ? String(p.uom_id) : (p.uomId != null ? String(p.uomId) : '');
        let resolvedUomId = apiUomId || fallbackUomId;
        if (!resolvedUomId && apiUomName) {
          const matchedByName = (Array.isArray(uomList) ? uomList : []).find(
            (u) => String(u?.name ?? '').trim().toLowerCase() === apiUomName.toLowerCase(),
          );
          resolvedUomId = matchedByName ? String(matchedByName.id) : '';
        }
        setSelectedUomId(resolvedUomId);
        setSelectedUomName(apiUomName);

        const tIds = Array.isArray(p.productTaxes) ? p.productTaxes.map(t => String(t.taxId)) : [];
        console.log("Selected tax IDs:", tIds);
        setSelectedTaxIds(tIds);

        const vendorCodeArray = Array.isArray(p.vendorDetails) ? p.vendorDetails : (p.vendorDetails ? [p.vendorDetails] : []);

        // Keep original objects from API for proper submission format
        const originalVendors = vendorCodeArray.filter(v => v); // Remove empty values
        console.log('📦 Vendors loaded from product (original):', originalVendors);
        console.log('📦 Vendor details:', originalVendors.map(v => ({
          id: v.id ?? v.vendorId ?? v._id,
          name: v.name ?? v.vendorName ?? v.vendor_name,
          fullObject: v
        })));
        setSelectedVendors(originalVendors);
        setSearchText('');
        setShowVendorDropdown(false);
        setAvailablePOS(!!p.availableInPos);
        setIsEBT(!!p.isEbtProduct);
        setEwic(!!p.ewic);
        setOtc(!!p.otc);
        setin_store_label_product(!!p.in_store_label_product);
        setServerin_store_label_product(
          p.in_store_label_product === null || p.in_store_label_product === undefined
            ? null
            : !!p.in_store_label_product
        );
        setImgBase64('');
        setImgMime('image/jpeg');
        setVariantsList(Array.isArray(p.variants) ? p.variants : []);
        setEditingVariantId(null);
        setQdModalVisible(false);
      }
      setVisible(true);
    },
    close: () => setVisible(false),
  }));

  const closeAllInnerPopups = () => {
    setCategoryModalVisible(false);
    setTaxModalVisible(false);
    setUomModalVisible(false);
    setVariantModalVisible(false);
    setVariantsModalVisible(false);
    setQdModalVisible(false);
    setQdShowStartPicker(false);
    setQdShowEndPicker(false);
    setVendorModalVisible(false);
    setSearchText('');
    setVendorList([]);
    setShowVendorDropdown(false);
  };

  const openVariantModal = () => {
    setVariantName('');
    setVariantCode('');
    setVariantBarcode(barcodeOriginal || '');
    setVariantPrice('');
    setVariantModalVisible(true);
  };

  const handleCreateVariant = async () => {
    const baseId = Number(id || product?.product_id || product?.id);
    if (!Number.isFinite(baseId)) {
      Alert.alert('Error', 'Missing product id.');
      return;
    }
    if (!variantName.trim()) {
      Alert.alert('Missing Name', 'Please enter a variant name.');
      return;
    }
    if (!variantCode.trim()) {
      Alert.alert('Missing Code', 'Please enter a default code.');
      return;
    }
    const priceValue = parseFloat(variantPrice);
    if (!Number.isFinite(priceValue)) {
      Alert.alert('Invalid Price', 'Please enter a valid price.');
      return;
    }

    try {
      setVariantSubmitting(true);
      const variantrespnse = await createCustomVariantProduct({
        name: variantName,
        default_code: variantCode.trim(),
        barcode: (variantBarcode.trim() || barcodeOriginal || ''),
        list_price: priceValue,
        parent_id: baseId,
      });

      if (variantrespnse?.result?.error) {
        Alert.alert('Error', variantrespnse.result.error);
      } else if (variantrespnse?.result?.message) {
        Alert.alert('Success', variantrespnse.result.message);
      } else {
        Alert.alert('Success', 'Variant created successfully.');
      }

      setVariantModalVisible(false);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to create variant product.');
    } finally {
      setVariantSubmitting(false);
    }
  };

  const openVariantsModal = () => {
    setVariantsModalVisible(true);
    setEditingVariantId(null);
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

  const handleQdStartDateChange = (_, date) => {
    // if (Platform.OS === 'android') setQdShowStartPicker(false);
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    setQdStartDate(`${yyyy}-${mm}-${dd} 00:00:00`);
    // if (Platform.OS === 'ios') setQdShowStartPicker(false);
  };

  const handleQdEndDateChange = (_, date) => {
    // if (Platform.OS === 'android') setQdShowEndPicker(false);
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    setQdEndDate(`${yyyy}-${mm}-${dd} 23:59:59`);
    // if (Platform.OS === 'ios') setQdShowEndPicker(false);
  };

  const openQdModal = () => {
    setQdBuyQty('1');
    setQdDiscount('1');
    setQdStartDate('');
    setQdEndDate('');
    setQdModalVisible(true);
  };

  const handleCreateQuantityDiscount = async () => {
    if (!product?.product_id && !id) {
      Alert.alert('Missing product', 'Product ID not found.');
      return;
    }
    const payload = {
      product_id: Number(product?.product_id ?? id),
      no_of_product_to_buy: Number(qdBuyQty || 0),
      discount_amount: Number(qdDiscount || 0),
      start_date: qdStartDate || null,
      end_date: qdEndDate || null,
    };
    try {
      setQdSubmitting(true);
      const res = await createQuantityDiscountPromotion(payload);
      const message = res?.message || res?.result?.message || 'Quantity discount created successfully';
      Alert.alert('Success', message);
      setQdModalVisible(false);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to create quantity discount.');
    } finally {
      setQdSubmitting(false);
    }
  };

  const formatVariantName = (value) => {
    const raw = String(value || '');
    return raw.replace(/^\s*\[[^\]]+\]\s*/, '').trim();
  };

  const startEditVariant = (variant) => {
    setEditingVariantId(variant.product_id);
    setEditingVariantName(formatVariantName(variant.productName || ''));
    setEditingVariantPrice(
      variant.salePrice != null ? String(variant.salePrice) : ''
    );
  };

  const handleUpdateVariantLocal = async (variantId) => {
    const priceValue = parseFloat(editingVariantPrice);
    if (!editingVariantName.trim()) {
      Alert.alert('Missing Name', 'Please enter a product name.');
      return;
    }
    if (!Number.isFinite(priceValue)) {
      Alert.alert('Invalid Price', 'Please enter a valid price.');
      return;
    }

    try {
      setVariantSubmitting(true);
      const updateresponsevariant = await updateCustomVariantProduct(variantId, {
        name: editingVariantName.trim(),
        list_price: priceValue,
      });
      setVariantsList((prev) =>
        prev.map((v) =>
          v.product_id === variantId
            ? { ...v, productName: editingVariantName.trim(), salePrice: priceValue }
            : v
        )
      );

      if (updateresponsevariant?.result?.message) {
        Alert.alert('Success', updateresponsevariant.result.message);
      } else if (updateresponsevariant?.result?.error) {
        Alert.alert('Error', updateresponsevariant.result.error);
      } else {
        Alert.alert('Success', 'Variant updated successfully.');
      }
      setEditingVariantId(null);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to update variant product.');
    } finally {
      setVariantSubmitting(false);
    }
  };

  const pickFromGallery = async () => {
    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        includeBase64: true,
        quality: 0.8,
        maxWidth: 1280,
        maxHeight: 1280,
      });
      if (res.didCancel) return;
      const asset = res.assets?.[0];
      if (!asset?.base64) {
        Alert.alert('Image', 'Could not read image data.');
        return;
      }
      setImgBase64(asset.base64);
      setImgMime(asset.type || 'image/jpeg');
    } catch (e) {
      Alert.alert('Image', e.message || 'Failed to pick image.');
    }
  };

  const takePhoto = async () => {
    try {
      const res = await launchCamera({
        mediaType: 'photo',
        includeBase64: true,
        quality: 0.8,
        maxWidth: 1280,
        maxHeight: 1280,
        saveToPhotos: false,
      });
      if (res.didCancel) return;
      const asset = res.assets?.[0];
      if (!asset?.base64) {
        Alert.alert('Camera', 'Could not read image data from camera.');
        return;
      }
      setImgBase64(asset.base64);
      setImgMime(asset.type || 'image/jpeg');
    } catch (e) {
      Alert.alert('Camera', e.message || 'Failed to take photo.');
    }
  };

  const onReadCode = (event) => {
    const value = event?.nativeEvent?.codeStringValue;
    if (value) setNewBarcode(value);
    setScannerVisible(false);
  };

  const calculateUnitCost = () => {
    const cc = parseFloat(casecost);
    const uc = parseInt(unitc, 10);
    if (!Number.isFinite(cc) || !Number.isFinite(uc) || uc <= 0) {
      Alert.alert('Fix inputs', 'Enter valid Case Cost and Units in Case.');
      return;
    }
    setCost((cc / uc).toFixed(2));
  };

  const sortedCategories = useMemo(() => (
    (Array.isArray(allCats) ? allCats : [])
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
  ), [allCats]);

  const sortedTaxes = useMemo(() => (
    (Array.isArray(taxList) ? taxList : [])
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
  ), [taxList]);

  const sortedUom = useMemo(() => (
    (Array.isArray(uomList) ? uomList : [])
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
  ), [uomList]);

  const noTaxId = useMemo(() => {
    const noTax = sortedTaxes.find((t) => String(t.name || '').trim().toLowerCase() === 'no tax');
    return noTax?.id || '';
  }, [sortedTaxes]);

  useEffect(() => {
    if (!noTaxId) return;
    if (selectedTaxIds.includes(noTaxId) && selectedTaxIds.length > 1) {
      setSelectedTaxIds([noTaxId]);
    }
  }, [noTaxId, selectedTaxIds]);

  const categorySummary = useMemo(() => {
    if (!categoryId) return 'Select Category';
    return sortedCategories.find((c) => String(c.id) === String(categoryId))?.name || 'Select Category';
  }, [categoryId, sortedCategories]);

  const taxSummary = useMemo(() => {
    if (!selectedTaxIds.length) return 'Select Tax';
    return sortedTaxes
      .filter((t) => selectedTaxIds.includes(String(t.id)))
      .map((t) => t.name)
      .join(', ');
  }, [selectedTaxIds, sortedTaxes]);

  const uomSummary = useMemo(() => {
    if (!selectedUomId) return selectedUomName || 'Select UoM';
    return (
      sortedUom.find((u) => String(u.id) === String(selectedUomId))?.name ||
      selectedUomName ||
      'Select UoM'
    );
  }, [selectedUomId, selectedUomName, sortedUom]);

  useEffect(() => {
    if (selectedUomId || !selectedUomName || !Array.isArray(uomList) || !uomList.length) {
      return;
    }
    const matchedByName = uomList.find(
      (u) => String(u?.name ?? '').trim().toLowerCase() === selectedUomName.toLowerCase(),
    );
    if (matchedByName) {
      setSelectedUomId(String(matchedByName.id));
    }
  }, [selectedUomId, selectedUomName, uomList]);

  const toggleTax = (taxId) => {
    const id = String(taxId);
    setSelectedTaxIds((prev) => {
      const isSelected = prev.includes(id);
      if (id === noTaxId) return isSelected ? [] : [id];
      if (isSelected) return prev.filter((x) => x !== id);
      const withoutNoTax = noTaxId ? prev.filter((x) => x !== noTaxId) : prev;
      return [...withoutNoTax, id];
    });
  };

  const toggleUom = (uomId) => {
    const id = String(uomId);
    if (String(selectedUomId) === id) {
      setSelectedUomId('');
      setSelectedUomName('');
      return;
    }
    setSelectedUomId(id);
    const matchedById = (Array.isArray(uomList) ? uomList : []).find(
      (u) => String(u?.id) === id,
    );
    setSelectedUomName(String(matchedById?.name ?? '').trim());
  };

  const handleVendorSearch = (text) => {
    setSearchText(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (text.trim().length < 3) {
      setVendorList([]);
      setShowVendorDropdown(false);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const vendors = await VendorList(text);
        const normalized = Array.isArray(vendors)
          ? vendors.map(v => ({
              id: String(v.id ?? v.vendorId ?? v._id ?? ''),
              name: String(v.name ?? v.vendorName ?? ''),
            }))
          : [];
        setVendorList(normalized);
        setShowVendorDropdown(true);
      } catch (err) {
        console.log('Vendor search failed:', err?.message);
        setVendorList([]);
        setShowVendorDropdown(false);
      }
    }, 300);
  };

  const pickVendor = (vendor) => {
    // Keep the original vendor object from search results
    setSelectedVendors(prev => {
      const vendorId = String(vendor.id ?? vendor.vendorId ?? '');
      const alreadyExists = prev.some(v => (v.id ?? v.vendorId ?? '') === vendorId);
      return alreadyExists ? prev : [...prev, vendor];
    });
    setSearchText('');
    setVendorList([]);
    setShowVendorDropdown(false);
  };

  const removeVendor = (vendorId) => {
    setSelectedVendors(prev => prev.filter(v => (v.id ?? v.vendorId ?? v._id) !== vendorId));
  };

  const isUomLockedByServer = serverin_store_label_product === true;

  const handleUpdate = async () => {
    if (!id) {
      Alert.alert('Error', 'Missing product id.');
      return;
    }
    
    // Extract vendor IDs from selectedVendors
    const vendorIds = selectedVendors.length > 0 
      ? selectedVendors.map(v => Number(v.id ?? v.vendorId ?? v._id))
      : undefined;
    
    const body = {
      id: Number(id),
      new_price: (price ?? '').trim(),
      new_std_price: (cost ?? '').trim(),
      new_qty: (qtyavailable ?? '').trim(),
      new_name: (name ?? '').trim(),
      size: (size ?? '').trim(),
      unit_in_case: (unitc ?? '').trim(),
      case_cost: (casecost ?? '').trim(),
      categ_id: categoryId ? Number(categoryId) : undefined,
      uom_id: !in_store_label_product && !isUomLockedByServer && selectedUomId ? Number(selectedUomId) : undefined,
      vendorcode: vendorIds,
      available_in_pos: String(!!availablePOS),
      taxes_id: selectedTaxIds.map(t => Number(t)),
      image: imgBase64 || '',
      is_ebt_product: String(!!isEBT),
      ewic: String(!!ewic),
      otc: String(!!otc),
      in_store_label_product: String(!!in_store_label_product),
      barcode: (newBarcode?.trim() || barcodeOriginal || ''),
    };

    Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

    console.log('📤 Sending update body:', JSON.stringify(body, null, 2));
    console.log('📤 Vendor IDs being sent:', vendorIds);

    try {
      setSubmitting(true);
      const res = await fetch(`${storeUrl}/pos/app/product/update`, {
        method: 'PUT',
        headers: { access_token: token },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('❌ Update failed with error:', data);
        console.error('❌ Full response:', data);
        throw new Error(data?.error || data?.message || 'Failed to update product');
      }

      Alert.alert('Success', 'Product updated successfully.');

      const updated = {
        ...product,
        ...(data?.product || {}),
        product_id: Number(id),
        productName: body.new_name || product.productName,
        productSize: body.size || product.productSize,
        salePrice: body.new_price !== '' ? Number(body.new_price) : product.salePrice,
        costPrice: body.new_std_price !== '' ? Number(body.new_std_price) : product.costPrice,
        barcode: body.barcode || product.barcode,
        categoryId: body.categ_id ?? product.categoryId,
        productTaxes: body.taxes_id?.length
          ? body.taxes_id.map(tid => ({
              taxId: tid,
              taxName: taxList.find(t => Number(t.id) === Number(tid))?.name || ''
            }))
          : product.productTaxes,
        availableInPos: body.available_in_pos === 'true',
        isEbtProduct: body.is_ebt_product === 'true',
        ewic: body.ewic === 'true',
        otc: body.otc === 'true',
        in_store_label_product: body.in_store_label_product === 'true',
        unit_in_case: body.unit_in_case !== '' ? Number(body.unit_in_case) : product.unit_in_case,
        case_cost: body.case_cost !== '' ? Number(body.case_cost) : product.case_cost,
        qty_available: body.new_qty !== '' ? Number(body.new_qty) : product.qty_available,
        productImage: imgBase64 ? imgBase64 : product.productImage,
        vendorcode: selectedVendors.length > 0 ? selectedVendors : product.vendorcode,
      };

      if (data?.product && Object.prototype.hasOwnProperty.call(data.product, 'in_store_label_product')) {
        const nextServerInStore = data.product.in_store_label_product;
        setServerin_store_label_product(
          nextServerInStore === null || nextServerInStore === undefined ? null : !!nextServerInStore
        );
      }

      setProduct(updated);
      setImgBase64('');
      setImgMime('image/jpeg');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const doArchiveProduct = async () => {
    const baseId = Number(id || product?.product_id || product?.id);
    if (!Number.isFinite(baseId) || baseId <= 0) {
      Alert.alert('Error', 'Missing product id.');
      return;
    }
    try {
      setArchiving(true);
      await archiveProduct(baseId);
      Alert.alert('Success', 'Product archived successfully.');
      setVisible(false);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to archive product.');
    } finally {
      setArchiving(false);
    }
  };

  const handleArchiveProduct = () => {
    Alert.alert(
      'Delete Product',
      'Are you sure you want to delete this product?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doArchiveProduct },
      ]
    );
  };

  const inCart = cart.find((p) => String(p.product_id) === String(id));
  const inPrint = print.find((p) => String(p.product_id) === String(id));

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => {
          closeAllInnerPopups();
          setVisible(false);
        }}
      >
        <View style={styles.mainModalRoot}>
          <TouchableOpacity
            style={styles.mainModalBackdrop}
            activeOpacity={1}
            onPress={() => {
              closeAllInnerPopups();
              setVisible(false);
            }}
          />

          <View style={styles.mainModalCard}>
            <TouchableOpacity style={styles.mainModalCloseBtn} onPress={() => {
              closeAllInnerPopups();
              setVisible(false);
            }}>
              <Icon name="close" size={24} color="#111" />
            </TouchableOpacity>

            {!product ? (
              <View style={styles.emptyBox}>
                <Text style={{ color: '#888' }}>No product selected.</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
                {imgBase64 ? (
                  <Image source={{ uri: `data:${imgMime};base64,${imgBase64}` }} style={styles.image} />
                ) : product.productImage ? (
                  <Image source={{ uri: `data:image/webp;base64,${product.productImage}` }} style={styles.image} />
                ) : (
                  <View style={[styles.image, styles.imagePlaceholder]}>
                    <Text style={{ color: '#aaa' }}>No Image</Text>
                  </View>
                )}

                <View style={[styles.row, { marginTop: 8 }]}>
                  <TouchableOpacity style={[styles.smallBtn, styles.ghost]} onPress={pickFromGallery} disabled={!isProductEditPermission}>
                    <Text style={styles.ghostText}>Pick from Gallery</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={takePhoto} disabled={!isProductEditPermission}>
                    <Text style={styles.smallBtnText}>Take Photo</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ marginTop: 12 }}>
                  <View style={styles.rowGap}>
                    <View style={styles.fieldCol}>
                      <Text style={styles.fieldLabel}>Name</Text>
                      <TextInput
                        style={[styles.inputCol, { color: inputTextColor, backgroundColor: inputBg, borderColor: inputBorder }]}
                        placeholder="Name"
                        placeholderTextColor={placeholderColor}
                        value={name}
                        onChangeText={setName}
                        editable={isProductEditPermission}
                      />
                    </View>
                    <View style={styles.fieldCol}>
                      <Text style={styles.fieldLabel}>Size</Text>
                      <TextInput
                        style={[styles.inputCol, { color: inputTextColor, backgroundColor: inputBg, borderColor: inputBorder }]}
                        placeholder="Size"
                        placeholderTextColor={placeholderColor}
                        value={size}
                        onChangeText={setSize}
                        editable={isProductEditPermission}
                      />
                    </View>
                  </View>

                  <View style={[styles.inputWrapper, { marginTop: 10 }]}>
                    <Text style={[styles.inlineHint, { color: inputTextColor }]}>Barcode</Text>
                    <View style={[styles.readonlyField, { borderColor: inputBorder, backgroundColor: inputBg }]}>
                      <Text style={[styles.readonlyText, { color: inputTextColor }]}>
                        {barcodeOriginal || '-'}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.rowGap, { marginTop: 10 }]}>
                    <View style={styles.fieldCol}>
                      <Text style={styles.fieldLabel}>Sale Price</Text>
                      <TextInput
                        style={[styles.inputCol, { color: inputTextColor, backgroundColor: inputBg, borderColor: inputBorder }]}
                        placeholder="Price"
                        placeholderTextColor={placeholderColor}
                        value={price}
                        onChangeText={setPrice}
                        keyboardType="decimal-pad"
                        editable={isProductEditPermission}
                      />
                    </View>
                    {isShowCostPrice && (
                      <View style={styles.fieldCol}>
                        <Text style={styles.fieldLabel}>Cost</Text>
                        <TextInput
                          style={[styles.inputCol, { color: inputTextColor, backgroundColor: inputBg, borderColor: inputBorder }]}
                          placeholder="Cost"
                          placeholderTextColor={placeholderColor}
                          value={cost}
                          onChangeText={setCost}
                          keyboardType="decimal-pad"
                          editable={isProductEditPermission}
                        />
                      </View>
                    )}
                  </View>

                  <View style={[styles.rowGap, { marginTop: 10, alignItems: 'flex-end' }]}>
                    <View style={styles.fieldCol}>
                      <Text style={styles.fieldLabel}>Case Cost</Text>
                      <View style={[styles.readonlyField, { borderColor: inputBorder, backgroundColor: inputBg }]}>
                      <Text style={[styles.readonlyText, { color: inputTextColor }]}>
                        {casecost || '-'}
                      </Text>
                    </View>
                      {/* <TextInput
                        style={[styles.inputCol, { color: inputTextColor, backgroundColor: inputBg, borderColor: inputBorder }]}
                        placeholder="Case Cost"
                        placeholderTextColor={placeholderColor}
                        value={casecost}
                        onChangeText={setCaseCost}
                        keyboardType="decimal-pad"
                      /> */}
                    </View>
                    <View style={styles.fieldCol}>
                      <Text style={styles.fieldLabel}>Units in Case</Text>
                      <View style={[styles.readonlyField, { borderColor: inputBorder, backgroundColor: inputBg }]}>
                      <Text style={[styles.readonlyText, { color: inputTextColor }]}>
                        {unitc || '-'}
                      </Text>
                    </View>
              
                    </View>
          
                  </View>

                  <View style={[styles.rowGap, { marginTop: 10 }]}>
                    <View style={styles.fieldCol}>
                      <Text style={styles.fieldLabel}>Net QTY</Text>
                        <View style={[styles.readonlyField, { borderColor: inputBorder, backgroundColor: inputBg }]}>
                      <Text style={[styles.readonlyText, { color: inputTextColor }]}>
                        {qtyavailable || '-'}
                      </Text>
                    </View>
               
                    </View>
                    <View style={styles.fieldCol}>
                      <Text style={styles.fieldLabel}>Category</Text>
                      <TouchableOpacity
                        style={[styles.selectBox, { borderColor: inputBorder, backgroundColor: inputBg, marginTop: 0 }]}
                        onPress={() => setCategoryModalVisible(true)}
                        disabled={!isProductEditPermission}
                      >
                        <Text style={[styles.selectValue, { color: inputTextColor }]} numberOfLines={2}>
                          {categorySummary}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={[styles.rowGap, { marginTop: 10 }]}>
                    <View style={styles.fieldCol}>
                      <Text style={styles.fieldLabel}>Tax</Text>
                      <TouchableOpacity
                        style={[styles.selectBox, { borderColor: inputBorder, backgroundColor: inputBg, marginTop: 0 }]}
                        onPress={() => setTaxModalVisible(true)}
                        disabled={!isProductEditPermission}
                      >
                        <Text style={[styles.selectValue, { color: inputTextColor }]} numberOfLines={2}>
                          {taxSummary}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {!isUomLockedByServer && (
                      <View style={styles.fieldCol}>
                        <Text style={styles.fieldLabel}>Unit of Measurement</Text>
                        <TouchableOpacity
                          style={[styles.selectBox, { borderColor: inputBorder, backgroundColor: inputBg, marginTop: 0 }]}
                          onPress={() => setUomModalVisible(true)}
                          disabled={!isProductEditPermission}
                        >
                          <Text style={[styles.selectValue, { color: inputTextColor }]} numberOfLines={2}>
                            {uomSummary}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.fieldLabel}>Vendor</Text>
                    <TouchableOpacity
                      style={[styles.inputFlex, { borderColor: inputBorder, backgroundColor: inputBg, paddingVertical: 10, paddingHorizontal: 12 }]}
                      onPress={() => setVendorModalVisible(true)}
                      disabled={!isProductEditPermission}
                    >
                      <Text style={{ color: placeholderColor }}>
                        {selectedVendors.length > 0 ? `${selectedVendors.length} vendor(s) selected` : 'Tap to add vendor'}
                      </Text>
                    </TouchableOpacity>
   
                  </View>

                  <Text style={styles.subTitle}>Settings:</Text>
                  <View style={styles.switchGrid}>
                    <View style={styles.switchCell}><Text style={styles.switchLabel}>In POS</Text><Switch value={availablePOS} onValueChange={setAvailablePOS} disabled={!isProductEditPermission} /></View>
                    <View style={styles.switchCell}><Text style={styles.switchLabel}>InStore Label</Text><Switch value={in_store_label_product} onValueChange={setin_store_label_product} disabled={!isProductEditPermission} /></View>
                  </View>
                  <View style={styles.switchGrid}>
                    <View style={styles.switchCell}><Text style={styles.switchLabel}>EBT Eligible</Text><Switch value={isEBT} onValueChange={setIsEBT} disabled={!isProductEditPermission} /></View>
                    <View style={styles.switchCell}><Text style={styles.switchLabel}>eWIC Eligible</Text><Switch value={ewic} onValueChange={setEwic} disabled={!isProductEditPermission} /></View>
                  </View>
                  <View style={styles.switchGrid}>
                    <View style={styles.switchCell}><Text style={styles.switchLabel}>OTC Product</Text><Switch value={otc} onValueChange={setOtc} disabled={!isProductEditPermission} /></View>
                    {variantsList.length > 0 && (
                      <TouchableOpacity style={[styles.switchCell, styles.variantToggleBtn]} onPress={openVariantsModal}>
                        <Text style={styles.variantToggleText}>View Variants ({variantsList.length})</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {userrole !== 'customer' && isProductEditPermission && (
                  <View>
                    <View style={[styles.row, { marginTop: 20, marginBottom: 8 }]}>
                      <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={openVariantModal}>
                        <Text style={styles.btnText}>📦 Variant</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.btn, styles.btnAccent]} onPress={openQdModal}>
                        <Text style={styles.btnText}>💰 Qty Disc</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={[styles.row, { marginBottom: 8 }]}>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnTeal, { opacity: submitting ? 0.6 : 1 }]}
                        disabled={submitting}
                        onPress={handleUpdate}
                      >
                        <Text style={styles.btnText}>{submitting ? '⏳ Updating…' : '✓ Update'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnArchive, { opacity: archiving ? 0.6 : 1 }]}
                        disabled={archiving}
                        onPress={handleArchiveProduct}
                      >
                        <Text style={styles.btnText}>{archiving ? '⏳ Deleting..' : '🗑 Delete'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {userrole === 'customer' ? (
                  <View style={[styles.row, { marginTop: 12 }]}>
                    {inCart ? (
                      <View style={styles.qtyRow}>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => decreaseQty(product.product_id)}><Text style={styles.qtyText}>-</Text></TouchableOpacity>
                        <Text style={styles.qtyValue}>{inCart.qty}</Text>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => increaseQty(product.product_id)}><Text style={styles.qtyText}>+</Text></TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={[styles.btn, { backgroundColor: THEME.secondary }]} onPress={() => addToCart(product)}>
                        <Text style={styles.btnText}>Add to Cart</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <View style={[styles.row, { marginTop: 12 }]}>
                    {inPrint ? (
                      <TouchableOpacity
                        style={[styles.btn, styles.btnDanger]}
                        onPress={() => removeFromprint(product.product_id)}
                      >
                        <Text style={styles.btnText}>Remove from Print</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.btn, styles.btnSuccess]}
                        onPress={() => addToPrint(product)}
                      >
                        <Text style={styles.btnText}>Add to Print List</Text>
                      </TouchableOpacity>
                    )}
  
                  </View>
                )}
              </ScrollView>
            )}

            {/* CATEGORY OVERLAY */}
            {categoryModalVisible && (
              <View style={styles.innerOverlay}>
                <TouchableOpacity
                  style={styles.innerOverlayBackdrop}
                  activeOpacity={1}
                  onPress={() => setCategoryModalVisible(false)}
                />
                <View style={[styles.optionModalCard, styles.categoryOptionModalCard, styles.innerOverlayCard]}>
                  <Text style={styles.optionModalTitle}>Select Category</Text>
                  <ScrollView style={styles.optionList}>
                    {sortedCategories.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.optionRow}
                        onPress={() => setCategoryId(String(item.id))}
                      >
                        <Text style={styles.optionLabel}>{item.name}</Text>
                        <Switch
                          value={String(categoryId) === String(item.id)}
                          onValueChange={() => setCategoryId(String(item.id))}
                        />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                     <View style={styles.optionFooter}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, styles.optionDoneBtn]} 
          onPress={() => setCategoryModalVisible(false)} >
        <Text style={styles.btnText}>Done</Text>
        </TouchableOpacity>
      </View>
                </View>
              </View>
            )}

            {/* TAX OVERLAY */}
            {taxModalVisible && (
              <View style={styles.innerOverlay}>
                <TouchableOpacity
                  style={styles.innerOverlayBackdrop}
                  activeOpacity={1}
                  onPress={() => setTaxModalVisible(false)}
                />
                <View style={[styles.optionModalCard, styles.innerOverlayCard]}>
                  <Text style={styles.optionModalTitle}>Select Tax</Text>
                  <ScrollView style={styles.optionList}>
                    {sortedTaxes.map((item) => (
                      <TouchableOpacity key={item.id} style={styles.optionRow} onPress={() => toggleTax(item.id)}>
                        <Text style={styles.optionLabel}>{item.name}</Text>
                        <Switch
                          value={selectedTaxIds.includes(String(item.id))}
                          onValueChange={() => toggleTax(item.id)}
                        />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                               <View style={styles.optionFooter}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, styles.optionDoneBtn]} 
          onPress={() => setTaxModalVisible(false)} >
                 
                    <Text style={styles.btnText}>Done</Text>
                  </TouchableOpacity>
                </View>
                </View>
              </View>
            )}

            {/* UOM OVERLAY */}
            {uomModalVisible && (
              <View style={styles.innerOverlay}>
                <TouchableOpacity
                  style={styles.innerOverlayBackdrop}
                  activeOpacity={1}
                  onPress={() => setUomModalVisible(false)}
                />
                <View style={[styles.optionModalCard, styles.innerOverlayCard]}>
                  <Text style={styles.optionModalTitle}>Select UoM</Text>
                  <ScrollView style={styles.optionList}>
                    {sortedUom.map((item) => (
                      <TouchableOpacity key={item.id} style={styles.optionRow} onPress={() => toggleUom(item.id)}>
                        <Text style={styles.optionLabel}>{item.name}</Text>
                        <Switch
                          value={String(selectedUomId) === String(item.id)}
                           onValueChange={() => toggleUom(item.id)}
                        />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                     <View style={styles.optionFooter}>
                    <TouchableOpacity
                     style={[styles.btn, styles.btnPrimary, styles.optionDoneBtn]} 
                     onPress={() => setUomModalVisible(false)} >
                    <Text style={styles.btnText}>Done</Text>
                  </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* VENDOR OVERLAY */}
            {vendorModalVisible && (
              <View style={styles.innerOverlay}>
                <TouchableOpacity
                  style={styles.innerOverlayBackdrop}
                  activeOpacity={1}
                  onPress={() => setVendorModalVisible(false)}
                />
                <View style={[styles.modalCard, styles.innerOverlayCard]}>
                  <Text style={styles.modalTitle}>Add Vendor</Text>
                  
                  {selectedVendors.length > 0 && (
                    <View style={{ backgroundColor: '#ECFDF5', borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#BBF7D0' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#166534', marginBottom: 6 }}>Added Vendors ({selectedVendors.length})</Text>
                      {selectedVendors.map(vendor => {
                        const vendorId = vendor.id ?? vendor.vendorId ?? vendor._id;
                        const vendorName = vendor.name ?? vendor.vendorName ?? vendor.vendor_name ?? '';
                        return (
                          <View key={vendorId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#111', flex: 1 }}>
                              {vendorName || `ID: ${vendorId}`}
                            </Text>
                            {/* <TouchableOpacity onPress={() => removeVendor(vendorId)}>
                              <Icon name="delete" size={16} color="#D9534F" />
                            </TouchableOpacity> */}
                          </View>
                        );
                      })}
                    </View>
                  )}
                  
                  <TextInput
                    style={styles.modalInput}
                    value={searchText}
                    onChangeText={handleVendorSearch}
                    placeholder="Search vendor (min 3 chars)"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                    editable={isProductEditPermission}
                  />

                  {showVendorDropdown && vendorList.length > 0 && (
                    <ScrollView style={{ maxHeight: 200, marginBottom: 10 }}>
                      {vendorList.slice(0, 20).map(v => (
                        <TouchableOpacity
                          key={v.id}
                          style={styles.vendorListItem}
                          onPress={() => pickVendor(v)}
                        >
                          <View>
                            <Text style={styles.vendorListName}>{v.name}</Text>
                            <Text style={styles.vendorListId}>ID: {v.id}</Text>
                          </View>
                          <Icon name="add-circle" size={24} color="#319241" />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}

                  <View style={styles.modalBtnRow}>
                    <TouchableOpacity
                      style={[styles.btn, styles.modalCancelBtn]}
                      onPress={() => {
                        setVendorModalVisible(false);
                        setSearchText('');
                        setVendorList([]);
                        setShowVendorDropdown(false);
                      }}
                    >
                      <Text style={styles.btnText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* CREATE VARIANT OVERLAY */}
            {variantModalVisible && (
              <View style={styles.innerOverlay}>
                <TouchableOpacity
                  style={styles.innerOverlayBackdrop}
                  activeOpacity={1}
                  onPress={() => setVariantModalVisible(false)}
                />
                <KeyboardAvoidingView
                  behavior={Platform.select({ ios: 'padding', android: 'height' })}
                  style={styles.variantKeyboardAvoidWrapper}
                >
                  <View style={[styles.modalCard, styles.innerOverlayCard]}>
                    <Text style={styles.modalTitle}>Create Variant Product</Text>
                    <ScrollView
                      style={{ maxHeight: 280, marginBottom: 16 }}
                      contentContainerStyle={{ paddingHorizontal: 0 }}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={true}
                    >
                      <TextInput
                        style={styles.modalInput}
                        value={variantName}
                        onChangeText={setVariantName}
                        placeholder="Name"
                        placeholderTextColor="#9CA3AF"
                      />
                      <TextInput
                        style={styles.modalInput}
                        value={variantCode}
                        onChangeText={setVariantCode}
                        placeholder="Default Code"
                        placeholderTextColor="#9CA3AF"
                      />
                      <TextInput
                        style={styles.modalInput}
                        value={variantBarcode}
                        onChangeText={setVariantBarcode}
                        placeholder="Barcode"
                        placeholderTextColor="#9CA3AF"
                      />
                      <TextInput
                        style={styles.modalInput}
                        value={variantPrice}
                        onChangeText={setVariantPrice}
                        placeholder="Price"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="decimal-pad"
                      />
                    </ScrollView>
                    <View style={styles.modalBtnRow}>
                      <TouchableOpacity
                        style={[styles.btn, styles.variantBtn]}
                        onPress={handleCreateVariant}
                        disabled={variantSubmitting}
                      >
                        <Text style={styles.btnText}>{variantSubmitting ? 'Submitting...' : 'Submit'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btn, styles.modalCancelBtn]}
                        onPress={() => setVariantModalVisible(false)}
                      >
                        <Text style={styles.btnText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </KeyboardAvoidingView>
              </View>
            )}

            {/* QTY DISCOUNT OVERLAY */}
            {qdModalVisible && (
              <View style={styles.innerOverlay}>
                <TouchableOpacity
                  style={styles.innerOverlayBackdrop}
                  activeOpacity={1}
                  onPress={() => {
                    setQdModalVisible(false);
                    setQdShowStartPicker(false);
                    setQdShowEndPicker(false);
                  }}
                />
                <KeyboardAvoidingView
                  behavior={Platform.select({ ios: 'padding', android: 'height' })}
                  style={styles.qdKeyboardAvoidWrapper}
                >
                  <View style={[styles.modalCard, styles.innerOverlayCard]}>
                  <Text style={styles.modalTitle}>Create Quantity Discount</Text>

                  <ScrollView
                    style={{ maxHeight: 320, marginBottom: 16 }}
                    contentContainerStyle={{ paddingHorizontal: 0 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={true}
                  >
                    <TextInput
                      style={styles.modalInput}
                      value={qdBuyQty}
                      onChangeText={setQdBuyQty}
                      placeholder="No. of products to buy"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="number-pad"
                    />
                    <TextInput
                      style={styles.modalInput}
                      value={qdDiscount}
                      onChangeText={setQdDiscount}
                      placeholder="Discount amount"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="decimal-pad"
                    />

                    <TouchableOpacity
                      style={styles.qdDateInput}
                      onPress={() => {
                        setQdShowEndPicker(false);
                        setQdShowStartPicker(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.qdDateInputHeader}>
                        <Icon name="event" size={16} color="#319241" />
                        <Text style={styles.qdDateInputLabel}>Start Date</Text>
                      </View>
                      <Text style={qdStartDate ? styles.qdDateInputText : styles.qdDateInputPlaceholder}>
                        {qdStartDate ? formatDateOnly(qdStartDate) : 'Select'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.qdDateInput}
                      onPress={() => {
                        setQdShowStartPicker(false);
                        setQdShowEndPicker(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.qdDateInputHeader}>
                        <Icon name="event" size={16} color="#D9534F" />
                        <Text style={styles.qdDateInputLabel}>End Date</Text>
                      </View>
                      <Text style={qdEndDate ? styles.qdDateInputText : styles.qdDateInputPlaceholder}>
                        {qdEndDate ? formatDateOnly(qdEndDate) : 'Select'}
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>

                  <View style={styles.qdModalBtnRow}>
                    <TouchableOpacity
                      style={[styles.qdBtn, styles.qdBtnCancel]}
                      onPress={() => {
                        setQdModalVisible(false);
                        setQdShowStartPicker(false);
                        setQdShowEndPicker(false);
                      }}
                    >
                      <Text style={styles.qdBtnCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.qdBtn, styles.qdBtnConfirm, qdSubmitting && { opacity: 0.6 }]}
                      onPress={handleCreateQuantityDiscount}
                      disabled={qdSubmitting}
                    >
                      <Text style={styles.qdBtnConfirmText}>{qdSubmitting ? 'Saving…' : 'Create'}</Text>
                    </TouchableOpacity>
                  </View>

                  {qdShowStartPicker && (
                    <Modal visible={qdShowStartPicker} transparent animationType="fade">
                      <View style={styles.qdDatePickerModal}>
                        <TouchableOpacity 
                          style={styles.qdDatePickerBackdrop}
                          activeOpacity={1}
                          onPress={() => setQdShowStartPicker(false)}
                        />
                        <View style={styles.qdDatePickerContainer}>
                          <View style={styles.qdDatePickerHeader}>
                            <Text style={styles.qdDatePickerTitle}>Select Start Date</Text>
                            <TouchableOpacity onPress={() => setQdShowStartPicker(false)}>
                              <Icon name="close" size={24} color="#111" />
                            </TouchableOpacity>
                          </View>
                          <View style={styles.qdDatePickerContent}>
                            <DateTimePicker
                              value={toDate(qdStartDate)}
                              mode="date"
                              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                              onChange={handleQdStartDateChange}
                              textColor="#111"
                              themeVariant="light"
                            />
                          </View>
                          <View style={styles.qdDatePickerFooter}>
                            <TouchableOpacity 
                              style={[styles.qdBtn, styles.qdBtnCancel]}
                              onPress={() => setQdShowStartPicker(false)}
                            >
                              <Text style={styles.qdBtnCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                              style={[styles.qdBtn, styles.qdBtnConfirm]}
                              onPress={() => setQdShowStartPicker(false)}
                            >
                              <Text style={styles.qdBtnConfirmText}>Confirm</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </Modal>
                  )}

                  {qdShowEndPicker && (
                    <Modal visible={qdShowEndPicker} transparent animationType="fade">
                      <View style={styles.qdDatePickerModal}>
                        <TouchableOpacity 
                          style={styles.qdDatePickerBackdrop}
                          activeOpacity={1}
                          onPress={() => setQdShowEndPicker(false)}
                        />
                        <View style={styles.qdDatePickerContainer}>
                          <View style={styles.qdDatePickerHeader}>
                            <Text style={styles.qdDatePickerTitle}>Select End Date</Text>
                            <TouchableOpacity onPress={() => setQdShowEndPicker(false)}>
                              <Icon name="close" size={24} color="#111" />
                            </TouchableOpacity>
                          </View>
                          <View style={styles.qdDatePickerContent}>
                            <DateTimePicker
                              value={toDate(qdEndDate)}
                              mode="date"
                              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                              onChange={handleQdEndDateChange}
                              textColor="#111"
                              themeVariant="light"
                            />
                          </View>
                          <View style={styles.qdDatePickerFooter}>
                            <TouchableOpacity 
                              style={[styles.qdBtn, styles.qdBtnCancel]}
                              onPress={() => setQdShowEndPicker(false)}
                            >
                              <Text style={styles.qdBtnCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                              style={[styles.qdBtn, styles.qdBtnConfirm]}
                              onPress={() => setQdShowEndPicker(false)}
                            >
                              <Text style={styles.qdBtnConfirmText}>Confirm</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </Modal>
                  )}
                  </View>
                </KeyboardAvoidingView>
              </View>
            )}

            {/* VARIANTS LIST OVERLAY */}
            {variantsModalVisible && (
              <View style={styles.innerOverlay}>
                <TouchableOpacity
                  style={styles.innerOverlayBackdrop}
                  activeOpacity={1}
                  onPress={() => setVariantsModalVisible(false)}
                />
                <View style={[styles.modalCard, styles.innerOverlayCard]}>
                  <Text style={styles.modalTitle}>Variants</Text>
                  <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                    {variantsList.map((variant) => {
                      const isEditing = editingVariantId === variant.product_id;
                      return (
                        <View key={variant.product_id} style={styles.variantCard}>
                          {isEditing ? (
                            <>
                              <TextInput
                                style={styles.modalInput}
                                value={editingVariantName}
                                onChangeText={setEditingVariantName}
                                placeholder="Product Name"
                                placeholderTextColor="#9CA3AF"
                              />
                              <TextInput
                                style={styles.modalInput}
                                value={editingVariantPrice}
                                onChangeText={setEditingVariantPrice}
                                placeholder="Sale Price"
                                placeholderTextColor="#9CA3AF"
                                keyboardType="decimal-pad"
                              />
                              <TouchableOpacity
                                style={[styles.btn, styles.variantBtn]}
                                onPress={() => handleUpdateVariantLocal(variant.product_id)}
                                disabled={variantSubmitting}
                              >
                                <Text style={styles.btnText}>Update</Text>
                              </TouchableOpacity>
                            </>
                          ) : (
                            <View style={styles.variantRow}>
                              <View style={styles.variantInfo}>
                                <Text style={styles.variantName}>{formatVariantName(variant.productName)}</Text>
                                <Text style={styles.variantPrice}>${Number(variant.salePrice || 0).toFixed(2)}</Text>
                              </View>
                              <TouchableOpacity onPress={() => startEditVariant(variant)}>
                                <Icon name="edit" size={20} color="#333" />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                    {variantsList.length === 0 && (
                      <Text style={styles.emptyVariantsText}>No variants available.</Text>
                    )}
                  </ScrollView>
                  <View style={styles.modalBtnRow}>
                    <TouchableOpacity
                      style={[styles.btn, styles.modalCancelBtn]}
                      onPress={() => setVariantsModalVisible(false)}
                    >
                      <Text style={styles.btnText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={scannerVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setScannerVisible(false)}
      >
        {hasCameraPermission ? (
          <View style={{ flex: 1 }}>
            <Camera
              style={styles.camera}
              cameraType={CameraType.Back}
              scanBarcode
              onReadCode={onReadCode}
            />
            <View style={styles.controls}>
              <TouchableOpacity style={styles.controlBtn} onPress={() => setScannerVisible(false)}>
                <Text style={styles.controlText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.permissionDenied}>
            <Text style={{ color: 'red' }}>Camera permission denied. Please allow access in settings.</Text>
            <TouchableOpacity style={[styles.controlBtn, { marginTop: 16 }]} onPress={() => setScannerVisible(false)}>
              <Text style={styles.controlText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </>
  );
});

export default ProductModal;

const styles = StyleSheet.create({
  mainModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  mainModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  mainModalCard: {
    width: '92%',
    maxWidth: 560,
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    zIndex: 1,
    overflow: 'hidden',
  },
  mainModalCloseBtn: {
    alignSelf: 'flex-end',
    padding: 4,
    zIndex: 2,
  },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  image: { width: '100%', height: 200, borderRadius: 12, resizeMode: 'contain' },
  imagePlaceholder: { backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center' },

  row: { flexDirection: 'row', gap: 12 },
  rowGap: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnPrimary: { backgroundColor: THEME.primary },
  btnAccent: { backgroundColor: THEME.secondary },
  btnSuccess: { backgroundColor: '#16A34A' },
  btnArchive: { backgroundColor: '#D9534F' },
  btnTeal: { backgroundColor: '#1B9C85' },
  btnDanger: { backgroundColor: '#D9534F' },

  smallBtn: { backgroundColor: THEME.secondary, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  smallBtnText: { color: '#fff', fontWeight: '700' },
  ghost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  ghostText: { color: '#333', fontWeight: '700' },

  inputFlex: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: '#333',
    backgroundColor: '#fff',
  },
  inputCol: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: '#333'
  },
  fieldCol: { flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 6 },
  inputWrapper: { position: 'relative' },
  inlineHint: { fontSize: 11, marginBottom: 6, fontWeight: '600' },
  readonlyField: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  readonlyText: { fontSize: 14, fontWeight: '600' },

  pickerCol: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 10
  },

  fakePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  fakePickerText: { color: '#333', flex: 1, paddingRight: 8 },

  selectBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  selectLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    marginBottom: 4,
  },
  selectValue: {
    color: '#111',
    fontSize: 13,
    fontWeight: '600',
  },

  vendorBox: { flex: 1, position: 'relative', zIndex: 20, },
  vendorDropdown: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    zIndex: 9999,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  vendorItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee'
  },
  vendorText: { color: '#111', fontWeight: '600' },
  vendorSub: { color: '#666', fontSize: 12, marginTop: 2 },
  selectedVendorNote: { fontSize: 12, color: '#2c1e70', marginTop: 6 },

  optionModalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: '75%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: 14,
  },
  categoryOptionModalCard: {
    maxWidth: 420,
    maxHeight: '58%',
  },
  optionModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 10,
  },
  optionList: {
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    paddingVertical: 10,
  },
  optionLabel: {
    flex: 1,
    color: '#111',
    fontWeight: '600',
    paddingRight: 10,
  },

  calcBtn: {
    backgroundColor: THEME.secondary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-end',
    marginBottom: 1,
  },
  calcBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  camera: { flex: 1 },
  controls: {
    position: 'absolute',
    bottom: 30,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10
  },
  controlBtn: {
    backgroundColor: '#000000AA',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  controlText: { color: '#fff', fontWeight: '700' },
  permissionDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },

  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  qtyBtn: { backgroundColor: '#2c1e70', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  qtyText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  qtyValue: { marginHorizontal: 10, fontSize: 16, fontWeight: 'bold', color: '#000' },

  subTitle: { marginTop: 14, marginBottom: 8, fontWeight: '700', color: '#111', fontSize: 13 },
  switchGrid: { flexDirection: 'row', gap: 10, marginTop: 12 },
  switchCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fafafa',
  },
  switchLabel: { color: '#111', fontWeight: '600', fontSize: 12 },

  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 10 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: '#111',
    marginBottom: 10,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  dateInputLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  dateInputText: { marginTop: 4, fontSize: 13, color: '#111', fontWeight: '600' },
  dateInputPlaceholder: { marginTop: 4, fontSize: 13, color: '#9CA3AF' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn: { backgroundColor: '#D9534F' },

  variantBtn: { backgroundColor: THEME.secondary },
  variantToggleBtn: {
    backgroundColor: '#1B9C85',
    paddingVertical: 0,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  variantToggleText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  variantCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  variantRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  variantInfo: { flex: 1, paddingRight: 10 },
  variantName: { fontSize: 14, fontWeight: '700', color: '#111' },
  variantPrice: { marginTop: 4, fontSize: 12, color: '#319241', fontWeight: '700' },
  emptyVariantsText: { color: '#6B7280', textAlign: 'center', paddingVertical: 8 },

  innerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    elevation: 50,
  },
  innerOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  innerOverlayCard: {
    zIndex: 1000,
    elevation: 60,
  },
  qdKeyboardAvoidWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  variantKeyboardAvoidWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  vendorChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  vendorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#319241',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#27a337',
  },
  vendorChipText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
    maxWidth: 150,
  },
  vendorChipRemove: {
    padding: 2,
  },
  vendorListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  vendorListName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
  },
  vendorListId: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  selectedVendorLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111',
    marginTop: 12,
    marginBottom: 8,
  },
  selectedVendorsList: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  selectedVendorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  selectedVendorName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#111',
  },

optionDoneBtn: {
  flex: 0,
  width: '100%',
},
qdDateInput: {
  borderWidth: 1,
  borderColor: '#E5E7EB',
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 12,
  backgroundColor: '#F9FAFB',
  marginBottom: 12,
},
qdDateInputHeader: { 
  flexDirection: 'row', 
  alignItems: 'center', 
  gap: 6, 
  marginBottom: 6 
},
qdDateInputLabel: { 
  fontSize: 11, 
  color: '#6B7280', 
  fontWeight: '700' 
},
qdDateInputText: { 
  fontSize: 14, 
  color: '#111', 
  fontWeight: '700' 
},
qdDateInputPlaceholder: { 
  fontSize: 14, 
  color: '#9CA3AF', 
  fontWeight: '500' 
},
qdDatePickerModal: {
  flex: 1,
  justifyContent: 'flex-end',
  backgroundColor: 'rgba(0,0,0,0.5)',
},
qdDatePickerBackdrop: {
  flex: 1,
},
qdDatePickerContainer: {
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
qdDatePickerHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingHorizontal: 16,
  paddingVertical: 14,
  borderBottomWidth: 1,
  borderBottomColor: '#E5E7EB',
},
qdDatePickerTitle: {
  fontSize: 16,
  fontWeight: '700',
  color: '#111',
},
qdDatePickerContent: {
  paddingVertical: 20,
  alignItems: 'center',
},
qdDatePickerFooter: {
  flexDirection: 'row',
  gap: 12,
  paddingHorizontal: 16,
  paddingVertical: 14,
  borderTopWidth: 1,
  borderTopColor: '#E5E7EB',
},
qdModalBtnRow: {
  flexDirection: 'row',
  gap: 12,
  marginTop: 12,
},
qdBtn: {
  flex: 1,
  paddingVertical: 12,
  borderRadius: 10,
  alignItems: 'center',
  justifyContent: 'center',
},
qdBtnCancel: {
  backgroundColor: '#F3F4F6',
  borderWidth: 1,
  borderColor: '#E5E7EB',
},
qdBtnConfirm: {
  backgroundColor: '#319241',
},
qdBtnCancelText: {
  color: '#666',
  fontWeight: '700',
  fontSize: 14,
},
qdBtnConfirmText: {
  color: '#fff',
  fontWeight: '700',
  fontSize: 14,
},
});