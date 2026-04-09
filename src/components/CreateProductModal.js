import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Switch,
  ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUOMList, VendorList, TaxList, getTopCategories } from '../functions/product-function';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import Icon from "react-native-vector-icons/MaterialIcons";
import { check, request, PERMISSIONS, RESULTS } from "react-native-permissions";
import { Camera, CameraType } from "react-native-camera-kit";
import AsyncStorage from '@react-native-async-storage/async-storage';
 import { sendNotificationToStoreUsers,sendNotificationToAdministrators } from '../config/OneSignalConfig';

export default function CreateProductModal({
  visible,
  onClose,
  onCreated,
  initialCategoryId = '',
  initialValues = null,
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [barcode, setBarcode] = useState('');
  const [price, setPrice] = useState('');                // list_price (sale price)
  const [cost, setCost] = useState('');                  // standard_price (unit cost)
  const [casecost, setCaseCost] = useState('');          // case_cost
  const [unitc, setUnitc] = useState('');                // unit_in_case
  const [qtyavailable, setQtyAvailable] = useState('');  // qty_available

  const [inStoreLabelProduct, setInStoreLabelProduct] = useState(false);
  const [availablePOS, setAvailablePOS] = useState(true);
  const [isEBT, setIsEBT] = useState(true);
  const [ewic, setEwic] = useState(false);
  const [otc, setOtc] = useState(false);

  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedTaxIds, setSelectedTaxIds] = useState([]);
  const [selectedVendorId, setSelectedVendorId] = useState(''); // picked from search suggestions
  const [selectedUomId, setSelectedUomId] = useState('');
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [taxModalVisible, setTaxModalVisible] = useState(false);
  const [uomModalVisible, setUomModalVisible] = useState(false);

  // Vendor search
  const [searchText, setSearchText] = useState('');
  const searchDebounceRef = useRef(null);
  const [vendorList, setVendorList] = useState([]);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);

  const [scannerVisible, setScannerVisible] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const cameraRef = useRef(null);
  const isHandlingScanRef = useRef(false);

  const [imgBase64, setImgBase64] = useState('');
  const [imgMime, setImgMime] = useState('image/jpeg');

  const [allCats, setAllCats] = useState([]);
  const [taxList, setTaxList] = useState([]);
  const [uomList, setUomList] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [storeUrl, setStoreUrl] = useState('');
  const [token, setToken] = useState('');
  const hasInitializedRef = useRef(false);
  const previousVisibleRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const [s, t] = await Promise.all([
          AsyncStorage.getItem('storeurl'),
          AsyncStorage.getItem('access_token'),
        ]);
        if (!s || !t) {
          Alert.alert('Missing config', 'store_url or access_token not found.');
          return;
        }
        setStoreUrl(s);
        setToken(t);
      } catch {
        Alert.alert('Error', 'Failed to load credentials.');
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const perm = Platform.OS === "ios" ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;
      const result = await request(perm);
      setHasCameraPermission(result === RESULTS.GRANTED);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [UOMLIST, cats, taxes] = await Promise.all([
          getUOMList(),
          getTopCategories(),
          TaxList(),
        ]);
        setAllCats(Array.isArray(cats) ? cats : []);
        setTaxList(Array.isArray(taxes) ? taxes : []);
        setUomList(Array.isArray(UOMLIST) ? UOMLIST : []);
      } catch (e) {
        console.log("Failed to fetch master lists:", e?.message);
      }
    })();
  }, []);

  // Debounced vendor search
  const handleVendorSearch = (text) => {
    setSearchText(text);
    setSelectedVendorId(''); // clear previously selected id when typing
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
    setSelectedVendorId(String(vendor.id));
    setSearchText(vendor.name);
    setShowVendorDropdown(false);
  };

  const imageDataUri = useMemo(
    () => (imgBase64 ? `data:${imgMime};base64,${imgBase64}` : ''),
    [imgBase64, imgMime]
  );

  const priceNumber = useMemo(() => {
    const n = parseFloat(price);
    return Number.isFinite(n) ? n : NaN;
  }, [price]);

  const costNumber = useMemo(() => {
    const n = parseFloat(cost);
    return Number.isFinite(n) ? n : NaN;
  }, [cost]);

  const unitcNumber = useMemo(() => {
    const n = parseInt(unitc, 10);
    return Number.isFinite(n) ? n : NaN;
  }, [unitc]);

  const caseCostNumber = useMemo(() => {
    const n = parseFloat(casecost);
    return Number.isFinite(n) ? n : NaN;
  }, [casecost]);

  const qtyAvailableNumber = useMemo(() => {
    const n = parseFloat(qtyavailable);
    return Number.isFinite(n) ? n : NaN;
  }, [qtyavailable]);

  const sortedCategories = useMemo(() => (
    (Array.isArray(allCats) ? allCats : [])
      .map((cat) => ({
        id: String(cat?.id ?? cat?._id ?? ''),
        label: String(cat?.name ?? cat?.category ?? '').trim(),
      }))
      .filter((item) => item.id && item.label)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  ), [allCats]);

  useEffect(() => {
    // Track modal open/close transitions
    const isOpening = visible && !previousVisibleRef.current;
    const isClosing = !visible && previousVisibleRef.current;
    
    previousVisibleRef.current = visible;

    // Reset initialization flag when modal closes
    if (isClosing) {
      hasInitializedRef.current = false;
      return;
    }

    // Only initialize when modal first opens
    if (!isOpening) return;
    
    let cancelled = false;
    
    // Default blank form on each open
    resetForm();
    hasInitializedRef.current = true;
    
    // Set "no tax" as default
    if (noTaxId) {
      setSelectedTaxIds([noTaxId]);
    }
    if (initialCategoryId !== null && initialCategoryId !== undefined && initialCategoryId !== '') {
      setSelectedCategoryId(String(initialCategoryId));
    }
    // LinkProduct passes this explicitly; only then prefill defaults.
    if (!initialValues || typeof initialValues !== 'object') return;
    if (initialValues.name !== undefined && initialValues.name !== null) setName(String(initialValues.name));
    if (initialValues.size !== undefined && initialValues.size !== null) setSize(String(initialValues.size));
    if (initialValues.barcode !== undefined && initialValues.barcode !== null) setBarcode(String(initialValues.barcode));
    if (initialValues.case_cost !== undefined && initialValues.case_cost !== null) setCaseCost(String(initialValues.case_cost));
    const vendorNamePrefill = String(initialValues.vendor_name ?? '').trim();
    if (vendorNamePrefill) {
      setSearchText(vendorNamePrefill);
      if (vendorNamePrefill.length >= 3) {
        (async () => {
          try {
            const vendors = await VendorList(vendorNamePrefill);
            if (cancelled) return;
            const normalized = Array.isArray(vendors)
              ? vendors.map(v => ({
                  id: String(v.id ?? v.vendorId ?? v._id ?? ''),
                  name: String(v.name ?? v.vendorName ?? ''),
                }))
              : [];
            const exact = normalized.find(
              (v) => v.name.trim().toLowerCase() === vendorNamePrefill.toLowerCase()
            );
            const partial = normalized.find(
              (v) => vendorNamePrefill.toLowerCase().includes(v.name.trim().toLowerCase()) ||
                v.name.trim().toLowerCase().includes(vendorNamePrefill.toLowerCase())
            );
            const matched = exact || partial;
            if (matched) {
              setSelectedVendorId(String(matched.id));
              setSearchText(String(matched.name));
              setShowVendorDropdown(false);
            }
            setVendorList(normalized);
          } catch (err) {
            if (!cancelled) {
              console.log('Vendor prefill failed:', err?.message);
            }
          }
        })();
      }
    }
    return () => {
      cancelled = true;
    };
  }, [visible, initialCategoryId, noTaxId]);

  const sortedTaxes = useMemo(() => (
    (Array.isArray(taxList) ? taxList : [])
      .map((tax) => ({
        id: String(tax?.id ?? ''),
        label: String(tax?.name ?? '').trim(),
      }))
      .filter((item) => item.id && item.label)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  ), [taxList]);

  const sortedUom = useMemo(() => (
    (Array.isArray(uomList) ? uomList : [])
      .map((uom) => ({
        id: String(uom?.id ?? ''),
        label: String(uom?.name ?? '').trim(),
      }))
      .filter((item) => item.id && item.label)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  ), [uomList]);

  const noTaxId = useMemo(() => {
    const noTax = sortedTaxes.find((t) => t.label.toLowerCase() === 'no tax');
    return noTax?.id || '';
  }, [sortedTaxes]);

  const categorySummary = useMemo(() => {
    if (!selectedCategoryId) return 'Select Category';
    return sortedCategories.find((c) => c.id === selectedCategoryId)?.label || 'Select Category';
  }, [selectedCategoryId, sortedCategories]);

  const taxSummary = useMemo(() => {
    if (selectedTaxIds.length === 0) return 'Select Tax';
    const labels = sortedTaxes
      .filter((t) => selectedTaxIds.includes(t.id))
      .map((t) => t.label);
    return labels.join(', ');
  }, [selectedTaxIds, sortedTaxes]);

  const uomSummary = useMemo(() => {
    if (!selectedUomId) return 'Unit of Measurement';
    return sortedUom.find((u) => u.id === selectedUomId)?.label || 'Unit of Measurement';
  }, [selectedUomId, sortedUom]);

  useEffect(() => {
    if (inStoreLabelProduct) {
      setSelectedUomId('');
    }
  }, [inStoreLabelProduct]);

  const onReadCode = (event) => {
    const value = event?.nativeEvent?.codeStringValue;
    if (!value || isHandlingScanRef.current) return;
    isHandlingScanRef.current = true;
    setBarcode(value);
    setScannerVisible(false);
    setTimeout(() => {
      isHandlingScanRef.current = false;
    }, 600);
  };

  const openScanner = async () => {

    try {
      const perm = Platform.OS === "ios" ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;
      let result = await check(perm);
      console.log("camera result",result);
      if (result !== RESULTS.GRANTED) {
        result = await request(perm);
      }

      const granted = result === RESULTS.GRANTED;
      setHasCameraPermission(granted);

      if (!granted) {
        Alert.alert('Camera Permission', 'Enable camera access in settings to scan.');
        return;
      }

      setScannerVisible(true);
    } catch (error) {
      console.warn('Open scanner error:', error);
      Alert.alert('Camera', 'Unable to open scanner right now.');
    }
  };

  const validate = () => {
    if (!name.trim()) return 'Please enter product name.';
    if (!barcode.trim()) return 'Please enter barcode.';
    if (!price.trim()) return 'Please enter price.';
    if (!selectedCategoryId) return 'Please select a category.';
    if (selectedTaxIds.length === 0) return 'Please select at least one tax.';
    if (!Number.isFinite(priceNumber) || priceNumber < 0) return 'Price must be a non-negative number.';
    if (casecost && (!Number.isFinite(caseCostNumber) || caseCostNumber < 0)) return 'Case cost must be a non-negative number.';
    if (unitc && (!Number.isFinite(unitcNumber) || unitcNumber <= 0)) return 'Units in case must be a positive integer.';
    if (qtyavailable && (!Number.isFinite(qtyAvailableNumber) || qtyAvailableNumber < 0)) return 'Qty available must be non-negative.';
    return null;
  };

  const resetForm = () => {
    setName(''); setSize(''); setPrice(''); setCost('');
    setImgBase64(''); setImgMime('image/jpeg');
    setCaseCost(''); setUnitc(''); setQtyAvailable('');
    setInStoreLabelProduct(false); setAvailablePOS(true); setIsEBT(true); setEwic(false); setOtc(true);
    setSelectedCategoryId(''); setSelectedTaxIds([]); setSelectedVendorId(''); setSelectedUomId('');
    setBarcode(''); setSearchText(''); setVendorList([]); setShowVendorDropdown(false);
    setScannerVisible(false);
  };

  const toggleCategory = (categoryId) => {
    setSelectedCategoryId((prev) => (prev === categoryId ? '' : categoryId));
  };

  const toggleTax = (taxId) => {
    setSelectedTaxIds((prev) => {
      const isSelected = prev.includes(taxId);
      if (taxId === noTaxId) {
        return isSelected ? [] : [taxId];
      }
      if (isSelected) {
        return prev.filter((id) => id !== taxId);
      }
      const withoutNoTax = noTaxId ? prev.filter((id) => id !== noTaxId) : prev;
      return [...withoutNoTax, taxId];
    });
  };

  const toggleUom = (uomId) => {
    setSelectedUomId((prev) => (prev === uomId ? '' : uomId));
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

  // Calculate button: unit cost = casecost / unitc
  const calculateUnitCost = () => {
    // allow calc even if price missing
    if (!Number.isFinite(caseCostNumber) || !Number.isFinite(unitcNumber) || unitcNumber <= 0) {
      Alert.alert('Fix inputs', 'Enter valid Case Cost and Units in Case.');
      return;
    }
    const unitCost = caseCostNumber / unitcNumber;
    setCost(unitCost.toFixed(2));
  };

  const handleSubmit = async () => {
    try {
      const msg = validate();
      if (msg) {
        Alert.alert('Missing info', msg);
        return;
      }
      setSubmitting(true);

      // Build payload (list_price = price, standard_price = cost)
      const body = {
        name: name.trim(),
        barcode: barcode || undefined,
        list_price: priceNumber, // ✅ unit cost                               
        standard_price: Number.isFinite(costNumber) ? costNumber : undefined, // ✅ sale price
        detailed_type: 'product',
        categ_id: selectedCategoryId ? Number(selectedCategoryId) : undefined,
        uom_id: !inStoreLabelProduct && selectedUomId ? Number(selectedUomId) : undefined,
        vendorcode: selectedVendorId ? Number(selectedVendorId) : undefined, // from search selection
        size: size?.trim() || undefined,
        taxes_id: selectedTaxIds.map((id) => Number(id)).filter(Number.isFinite),
        is_ebt_product: !!isEBT,
        available_in_pos: !!availablePOS,
        in_store_label_product: String(!!inStoreLabelProduct),
        case_cost: Number.isFinite(caseCostNumber) ? caseCostNumber : undefined,
        unit_in_case: Number.isFinite(unitcNumber) ? unitcNumber : undefined,
        qty_available: Number.isFinite(qtyAvailableNumber) ? qtyAvailableNumber : undefined,
        image: imgBase64 || '',           // raw base64
        ewic: !!ewic,
        otc: !!otc,
      };

      const res = await fetch(`${storeUrl}/pos/app/product/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': token,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      const resultValue = data?.result;
      console.log("response store:", storeUrl);
       console.log("created body,",body);
      console.log("created data,",data);
      const embeddedErrorMessage =
        typeof resultValue === 'string' &&
        /\b4\d{2}\b.*bad request|\bbad request\b|<response .*?\[(4\d{2}|5\d{2})[^\]]*\]>/i.test(resultValue)
          ? resultValue
          : null;
      const responseMessage =
        data?.message ||
        data?.error ||
        data?.result?.message ||
        data?.data?.message ||
        embeddedErrorMessage ||
        (res.ok ? 'Product created successfully.' : 'Failed to create product');

      if (!res.ok || embeddedErrorMessage) {
        throw new Error(responseMessage);
      }

      console.log("body:", body, "res:", data);
      
      // Ensure device is subscribed before sending notification
      console.log('🔔 Checking device subscription status...');

       const notificationResult = await sendNotificationToStoreUsers('Product Created', responseMessage, name); 
  //  const notificationResult =  await sendNotificationToAdministrators(
  // 'Admin Alert',responseMessage, name);
      console.log('🔔 Notification result:', notificationResult);
         
      Alert.alert('Success', responseMessage, [
        {
          text: 'OK',
          onPress: () => {
            // Send the body (form values) so LinkProduct can extract actual user-entered data
            // Also include the API response for reference
            onCreated?.({ ...body, apiResponse: data });
            resetForm();
            onClose?.();
          },
        },
      ]);
    } catch (e) {
      console.log('Create product error:', e);
      Alert.alert('Error', e?.message || 'Failed to create product.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal visible={visible && !scannerVisible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.mainModalRoot}>
          <>
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

            <KeyboardAvoidingView
              behavior={Platform.select({ ios: 'padding', android: undefined })}
              style={styles.centered}
            >
              <View style={styles.sheet}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                contentContainerStyle={{ paddingBottom: 14 }}
              >
            <Text style={styles.title}>Create Product</Text>

            {/* Image */}
            <View style={styles.rowBetween}>
              <TouchableOpacity style={[styles.smallBtn, styles.ghost]} onPress={pickFromGallery}>
                <Text style={styles.ghostText}>Pick from Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallBtn} onPress={takePhoto}>
                <Text style={styles.smallBtnText}>Take Photo</Text>
              </TouchableOpacity>
            </View>
            {!!imgBase64 && (
              <Image
                source={{ uri: `data:${imgMime};base64,${imgBase64}` }}
                style={styles.preview}
                resizeMode="cover"
              />
            )}

            {/* Row 1: Name | Size */}
            <View style={styles.rowGap}>
              <View style={styles.inputGroupCol}>
                <Text style={styles.fieldLabel}>Name *</Text>
                <TextInput style={styles.inputCol} placeholder="Name *" placeholderTextColor={PLACEHOLDER} value={name} onChangeText={setName} />
              </View>
              <View style={styles.inputGroupCol}>
                <Text style={styles.fieldLabel}>Size</Text>
                <TextInput style={styles.inputCol} placeholder="Size (e.g., 500ml)" placeholderTextColor={PLACEHOLDER} value={size} onChangeText={setSize} />
              </View>
            </View>

            {/* Barcode (full width with scan) */}
            <Text style={styles.fieldLabel}>Barcode *</Text>
            <View style={styles.barcodeRow}>
              <TextInput
                style={[styles.inputWithRightIcon, styles.barcodeInput]}
                placeholder="Barcode"
                placeholderTextColor={PLACEHOLDER}
                value={barcode}
                onChangeText={setBarcode}
              />
              <TouchableOpacity
                style={styles.scanButton}
                onPress={openScanner}
                activeOpacity={0.85}
              >
                <Icon name="camera-alt" size={20} color="#333" />
              </TouchableOpacity>
            </View>

            {/* Row 2: Price | Unit Cost */}
            <View style={styles.rowGap}>
              <View style={styles.inputGroupCol}>
                <Text style={styles.fieldLabel}>Sale Price *</Text>
                <TextInput
                  style={styles.inputCol}
                  placeholder="Sale Price*"
                  placeholderTextColor={PLACEHOLDER}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputGroupCol}>
                <Text style={styles.fieldLabel}>Case Cost</Text>
                <TextInput
                  style={styles.inputCol}
                  placeholder="Case Cost"
                  placeholderTextColor={PLACEHOLDER}
                  value={casecost}
                  keyboardType="decimal-pad"
                  onChangeText={setCaseCost}
                />
              </View>
            </View>

            {/* Row 3: Units in Case | Unit Cost */}
            <View style={styles.rowGap}>
              <View style={styles.inputGroupCol}>
                <Text style={styles.fieldLabel}>Units in Case</Text>
                <TextInput
                  style={[styles.inputCol, { marginTop: 0 }]}
                  placeholder="Units in Case"
                  placeholderTextColor={PLACEHOLDER}
                  value={unitc}
                  keyboardType="number-pad"
                  onChangeText={setUnitc}
                />
              </View>
              <View style={styles.inputGroupCol}>
                <Text style={styles.fieldLabel}>Cost</Text>
                <TextInput
                  style={styles.inputCol}
                  placeholder="Cost"
                  placeholderTextColor={PLACEHOLDER}
                  value={cost}
                  onChangeText={setCost}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <View style={styles.calcBtnRow}>
              <TouchableOpacity style={styles.calcBtn} onPress={calculateUnitCost}>
                <Text style={styles.calcBtnText}>Calculate Unit Cost</Text>
              </TouchableOpacity>
            </View>

            {/* Row 4: Qty Available (full) */}
            <Text style={styles.fieldLabel}>Qty Available</Text>
            <TextInput
              style={styles.input}
              placeholder="Qty Available"
              placeholderTextColor={PLACEHOLDER}
              value={qtyavailable}
              onChangeText={setQtyAvailable}
              keyboardType="decimal-pad"
            />

            {/* Row 5: Category | Vendor Search | UoM */}
            <View style={[styles.rowGap, styles.rowGapRaised]}>
              <TouchableOpacity style={styles.selectBox} onPress={() => setCategoryModalVisible(true)}>
                <Text style={styles.selectLabel}>Category *</Text>
                <Text numberOfLines={2} style={styles.selectValue}>{categorySummary}</Text>
              </TouchableOpacity>

              {/* Vendor search with suggestions */}
              <View style={[styles.vendorBox]}>
                <TextInput
                  style={styles.inputFlex}
                  placeholder="Search vendor (min 3 chars)"
                  placeholderTextColor={PLACEHOLDER}
                  value={searchText}
                  onChangeText={handleVendorSearch}
                  autoCapitalize="none"
                />
                {showVendorDropdown && vendorList.length > 0 && (
                  <View style={styles.vendorDropdown}>
                    <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 180 }}>
                      {vendorList.slice(0, 20).map(v => (
                        <TouchableOpacity key={v.id} style={styles.vendorItem} onPress={() => pickVendor(v)}>
                          <Text numberOfLines={1} style={styles.vendorText}>{v.name}</Text>
                          <Text style={styles.vendorSub}>ID: {v.id}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
                {!!selectedVendorId && (
                  <Text style={styles.selectedVendorNote}>Selected Vendor ID: {selectedVendorId}</Text>
                )}
              </View>


            </View>

            {/* Row 6: Tax */}
            <View style={styles.rowGap}>
              <TouchableOpacity style={styles.selectBox} onPress={() => setTaxModalVisible(true)}>
                <Text style={styles.selectLabel}>Tax *</Text>
                <Text numberOfLines={2} style={styles.selectValue}>{taxSummary}</Text>
              </TouchableOpacity>
              {!inStoreLabelProduct ? (
                <TouchableOpacity style={styles.selectBox} onPress={() => setUomModalVisible(true)}>
                  <Text style={styles.selectLabel}>UoM</Text>
                  <Text numberOfLines={2} style={styles.selectValue}>{uomSummary}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.selectBoxHidden} />
              )}

            </View>

            {/* Row 7: Switches */}
            <Text style={styles.subTitle}>Options</Text>
            <View style={styles.switchGrid}>
              <View style={styles.switchCell}>
                <Text style={styles.switchLabel}>POS</Text>
                <Switch value={availablePOS} onValueChange={setAvailablePOS} />
              </View>
              <View style={styles.switchCell}>
                <Text style={styles.switchLabel}>In Store</Text>
                <Switch value={inStoreLabelProduct} onValueChange={setInStoreLabelProduct} />
              </View>
              <View style={styles.switchCell}>
                <Text style={styles.switchLabel}>EBT</Text>
                <Switch value={isEBT} onValueChange={setIsEBT} />
              </View>
            </View>
            <View style={styles.switchGrid}>
              <View style={styles.switchCell}>
                <Text style={styles.switchLabel}>EWIC</Text>
                <Switch value={ewic} onValueChange={setEwic} />
              </View>
              <View style={styles.switchCell}>
                <Text style={styles.switchLabel}>OTC</Text>
                <Switch value={otc} onValueChange={setOtc} />
              </View>
              <View style={[styles.switchCell, { opacity: 0 }]} />
            </View>

            {/* Actions */}
            <View style={styles.rowRight}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose} disabled={submitting}>
                <Text style={[styles.btnText, styles.btnGhostText]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator /> : <Text style={styles.btnText}>Create</Text>}
              </TouchableOpacity>
            </View>
              </ScrollView>
              </View>
            </KeyboardAvoidingView>

            {categoryModalVisible && (
              <View style={styles.optionModalRoot}>
                <TouchableOpacity style={styles.optionModalBackdrop} activeOpacity={1} onPress={() => setCategoryModalVisible(false)} />
                <View style={styles.optionModalCard}>
                  <Text style={styles.optionModalTitle}>Select Category</Text>
                  <ScrollView style={styles.optionList}>
                    {sortedCategories.map((item) => (
                      <TouchableOpacity key={item.id} style={styles.optionRow} onPress={() => toggleCategory(item.id)}>
                        <Text style={styles.optionLabel}>{item.label}</Text>
                        <Switch value={selectedCategoryId === item.id} onValueChange={() => toggleCategory(item.id)} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity style={styles.btn} onPress={() => setCategoryModalVisible(false)}>
                    <Text style={styles.btnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {taxModalVisible && (
              <View style={styles.optionModalRoot}>
                <TouchableOpacity style={styles.optionModalBackdrop} activeOpacity={1} onPress={() => setTaxModalVisible(false)} />
                <View style={styles.optionModalCard}>
                  <Text style={styles.optionModalTitle}>Select Tax</Text>
                  <ScrollView style={styles.optionList}>
                    {sortedTaxes.map((item) => (
                      <TouchableOpacity key={item.id} style={styles.optionRow} onPress={() => toggleTax(item.id)}>
                        <Text style={styles.optionLabel}>{item.label}</Text>
                        <Switch value={selectedTaxIds.includes(item.id)} onValueChange={() => toggleTax(item.id)} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity style={styles.btn} onPress={() => setTaxModalVisible(false)}>
                    <Text style={styles.btnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {uomModalVisible && (
              <View style={styles.optionModalRoot}>
                <TouchableOpacity style={styles.optionModalBackdrop} activeOpacity={1} onPress={() => setUomModalVisible(false)} />
                <View style={styles.optionModalCard}>
                  <Text style={styles.optionModalTitle}>Unit of Measurement</Text>
                  <ScrollView style={styles.optionList}>
                    {sortedUom.map((item) => (
                      <TouchableOpacity key={item.id} style={styles.optionRow} onPress={() => toggleUom(item.id)}>
                        <Text style={styles.optionLabel}>{item.label}</Text>
                        <Switch value={selectedUomId === item.id} onValueChange={() => toggleUom(item.id)} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity style={styles.btn} onPress={() => setUomModalVisible(false)}>
                    <Text style={styles.btnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </>
        </View>
      </Modal>

      <Modal
        visible={visible && scannerVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => setScannerVisible(false)}
      >
        {hasCameraPermission ? (
          <View style={styles.scannerRoot}>
            <Camera
              ref={cameraRef}
              style={styles.camera}
              cameraType={CameraType.Back}
              scanBarcode
              onReadCode={onReadCode}
            />
            <View pointerEvents="none" style={styles.scannerFrameWrap}>
              <View style={styles.scannerFrame} />
            </View>
            <TouchableOpacity
              style={[styles.closeScannerBtn, { top: Math.max(insets.top, 16) + 8 }]}
              onPress={() => setScannerVisible(false)}
              activeOpacity={0.85}
            >
              <Icon name="close" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.scannerFooter}>
              <Text style={styles.scannerHint}>Align the barcode inside the frame</Text>
            </View>
          </View>
        ) : (
          <View style={styles.permissionDenied}>
            <Text style={styles.permissionDeniedText}>
              Camera permission denied. Please allow access in settings.
            </Text>
            <TouchableOpacity
              style={[styles.closePermissionBtn, { marginTop: 16 }]}
              onPress={() => setScannerVisible(false)}
            >
              <Text style={styles.closePermissionText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>

    </>
  );

}

const THEME = { primary: '#2C1E70', secondary: '#319241' };
const PLACEHOLDER = '#9AA3AF';

const styles = StyleSheet.create({
  mainModalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000077',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '92%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: "#000", marginBottom: 10 },
  subTitle: { marginTop: 12, marginBottom: 6, fontWeight: '700', color: '#111' },

  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 12, color: '#333', marginTop: 10
  },

  inputFlex: {
    flex: 1,
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 12, color: '#333', backgroundColor: '#fff'
  },

  preview: { width: '100%', height: 150, borderRadius: 8, marginTop: 10, backgroundColor: '#f4f4f4' },

  row: { flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'center' },

  rowRight: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },

  smallBtn: { backgroundColor: THEME.secondary, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },

  smallBtnText: { color: '#fff', fontWeight: '700' },

  ghost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },

  ghostText: { color: '#333', fontWeight: '700' },

  calcBtnRow: {
    marginTop: 8,
    alignItems: 'flex-end',
  },

  calcBtn: {
    backgroundColor: THEME.secondary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 170,
    alignItems: 'center',
  },
  
  calcBtnText: { color: '#fff', fontWeight: '700' },

  btn: { backgroundColor: THEME.secondary, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  btnGhostText: { color: '#333' },

  scannerRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerFrameWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerFrame: {
    width: 260,
    height: 180,
    borderWidth: 2,
    borderColor: '#A3E635',
    borderRadius: 18,
    backgroundColor: 'transparent',
  },
  closeScannerBtn: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  scannerFooter: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 32,
    alignItems: 'center',
    zIndex: 2,
  },
  scannerHint: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputWrapper: { position: 'relative', marginTop: 10 },
  inputWithRightIcon: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingVertical: 10, paddingLeft: 12, paddingRight: 12, color: '#333', backgroundColor: '#fff',
  },
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  barcodeInput: {
    flex: 1,
  },
  scanButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerWrapper: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginTop: 10, overflow: 'hidden',
  },
  permissionDenied: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#000',
  },
  permissionDeniedText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
  },
  closePermissionBtn: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  closePermissionText: {
    color: '#111',
    fontWeight: '700',
  },

  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  rowGap: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  rowGapRaised: {
    zIndex: 15,
  },
  inputGroupCol: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  inputCol: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: '#333',
    backgroundColor: '#fff'
  },
  pickerCol: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff'
  },
  selectBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff'
  },
  selectBoxHidden: {
    flex: 1,
  },
  selectLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    marginBottom: 4,
  },
  selectValue: {
    color: '#111',
    fontSize: 14,
  },
  colWithButton: {
    flex: 1,
    flexDirection: 'column',
    gap: 8,
  },
  switchGrid: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 10,
  },

  switchCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },

  switchLabel: { color: '#111', fontWeight: '600' },

  // Vendor search UI
  vendorBox: {
    flex: 1,
    position: 'relative',
    zIndex: 20,
  },
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
  vendorItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  vendorText: { color: '#111', fontWeight: '600' },
  vendorSub: { color: '#666', fontSize: 12, marginTop: 2 },
  selectedVendorNote: { fontSize: 12, color: '#2c1e70', marginTop: 6 },
  optionModalRoot: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 20,
    elevation: 20,
  },
  optionModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000077',
  },
  optionModalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: '75%',
    padding: 14,
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
});