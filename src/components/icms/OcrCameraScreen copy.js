import React, { useRef, useState, useEffect } from 'react';
// import API_ENDPOINTS from '../../../icms_config/api';
import API_ENDPOINTS, { initICMSBase, setICMSBase } from '../../../icms_config/api';
import {
  useNavigation,
} from '@react-navigation/native';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
  Platform,
  ImageBackground,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CameraType } from 'react-native-camera-kit';
import { launchImageLibrary } from 'react-native-image-picker';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import SearchTableComponent from './SearchORCTable';
import SaveInvoiceModal from './SaveInvoiceModal';
import OCRPreviewComponent from './OCRPreviewComponent';
import reportbg from '../../assets/images/report-bg.png';
import tulsiBg from '../../assets/images/bg-tulsi-2.jpeg';
import AppHeader from '../AppHeader';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
const COLORS = {
  bg: '#ffffff',
  card: '#f7f9fc',
  border: '#e6e8ef',
  primary: '#319241',
  success: '#319241',
  danger: '#D9534F',
  accent: '#319241',
  text: '#111',
  sub: '#777',
};
const GREEN_LIGHT = '#e6f6ec';
const GREEN_DARK = '#256f3a';
const GREY_LIGHT = '#eef1f4';
const GREY_DARK = '#5b6675';

const OcrScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const getImageSource = val => (typeof val === 'number' ? val : { uri: val });
  const wasCameraOpenRef = React.useRef(false);
  const cameraRef = useRef(null);
  const previewTimeoutRef = useRef(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [snapPreview, setSnapPreview] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [saveInvoiceVisible, setSaveInvoiceVisible] = useState(false);
  const [invoiceList, setInvoiceList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerate, setIsGenerate] = useState(false);
  const [isResponseImg, setIsResponseImg] = useState(false);
  const [vendorModalVisible, setVendorModalVisible] = useState(false);
  // Vendor dropdown related
  const [selectedValue, setSelectedValue] = useState('');
  const [selectedDatabaseName, setSelectedDatabaseName] = useState('');
  const [selectedVendorSlug, setSelectedVendorSlug] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  // Captured/selected images
  const [snappedImages, setSnappedImages] = useState([]); // [{uri, base64}]
  const [uploadedFilenames, setUploadedFilenames] = useState([]);
  const [uploadedImageURLs, setUploadedImageURLs] = useState([]);
  // OCR + table
  const [allocrJsons, setOcrJsons] = useState([]);
  const [tableData, setTableData] = useState([]);
  // Camera visibility
  const [showCamera, setShowCamera] = useState(false);
  // URLs
  const [ocrurl, setOcrUrl] = useState(null);
  const { width: windowWidth } = useWindowDimensions();
  const isNarrow = windowWidth < 420;
  // Dedup vendors by "value" and keep first occuitemrrence
  const uniqueVendors = React.useMemo(() => {
    const map = new Map();
    (invoiceList || []).forEach(it => {
      if (it && typeof it.value === 'string' && !map.has(it.value)) {
        map.set(it.value, it);
      }
    });
    // Optional: keep alphabetical
    return Array.from(map.values()).sort((a, b) =>
      a.value.localeCompare(b.value),
    );
  }, [invoiceList]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [vendorSearchLoading, setVendorSearchLoading] = useState(false);
  const [vendorSearchTouched, setVendorSearchTouched] = useState(false);
  const [access_token, setAccessToken] = useState('');
  const vendorSearchRequestRef = useRef(0);
  const [buttonLoading, setButtonLoading] = useState({
    selectInvoice: false,
    generate: false,
    clear: false,
    snap: false,
    gallery: false,
  });
  const [step, setStep] = useState(1);
  useEffect(() => {
    (async () => {
      const getAllAsynce = async () => {
        initICMSBase();
        const token = await AsyncStorage.getItem('access_token');
        setAccessToken(token);
      }
      getAllAsynce();
    })();
  }, [])

  // Cleanup preview timeout when camera closes
  useEffect(() => {
    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = null;
      }
    };
  }, []);

  // detectInvoiceMismatch

const normalize = (s) =>
    String(s || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[#:\-]/g, '');

  const toRawResponseObject = (ocrItem) => {
    const candidate =
      ocrItem?.rawResponse ??
      ocrItem?.response?.rawResponse ??
      ocrItem?.body?.rawResponse ??
      {};

    if (candidate && typeof candidate === 'object') return candidate;
    if (typeof candidate === 'string') {
      try {
        const parsed = JSON.parse(candidate);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (err) {
        return {};
      }
    }
    return {};
  };

  function detectInvoiceMismatch(queryByIndex, minConf = 70) {
    const pages = Object.entries(queryByIndex).map(([idx, r]) => ({
      index: Number(idx),
      invoiceRaw: r?.invoiceNumber || '',
      invoice: normalize(r?.invoiceNumber),
      invoiceConf: Number(r?.invoiceNumberConfidence ?? 0),
      dateISO: r?.invoiceDateISO || '',
      dateConf: Number(r?.invoiceDateConfidence ?? 0),
      total: r?.totalValue ?? null,
      totalConf: Number(r?.totalConfidence ?? 0),
      vendor: (r?.vendorNameFromInvoice || '').trim(),
      vendorConf: Number(r?.vendorNameConfidence ?? 0),
      s3Key: r?.s3Key,
    }));

    // consider only pages that have invoiceNumber with decent confidence
    const strong = pages.filter((p) => p.invoice && p.invoiceConf >= minConf);

    // Fallback: when confidence is low, still block if multiple normalized invoice numbers exist
    if (strong.length <= 1) {
      const weakDetected = pages.filter((p) => p.invoice);
      const weakSet = Array.from(new Set(weakDetected.map((p) => p.invoice)));
      if (weakSet.length > 1) {
        const majorityInvoice = weakSet
          .map((inv) => ({
            inv,
            count: weakDetected.filter((p) => p.invoice === inv).length,
          }))
          .sort((a, b) => b.count - a.count)[0]?.inv;

        const mismatchedPages = weakDetected.filter((p) => p.invoice !== majorityInvoice);
        return {
          ok: false,
          reason: 'weak_conflict',
          majorityInvoice,
          mismatchedPages,
          pages,
          usedConfidenceThreshold: minConf,
        };
      }
      return { ok: true, reason: 'not_enough_strong_pages', pages };
    }

    // Majority vote for invoice number
    const freq = {};
    for (const p of strong) freq[p.invoice] = (freq[p.invoice] || 0) + 1;

    const majorityInvoice = Object.keys(freq).sort(
      (a, b) => freq[b] - freq[a],
    )[0];

    const mismatchedPages = strong.filter((p) => p.invoice !== majorityInvoice);

    return {
      ok: mismatchedPages.length === 0,
      majorityInvoice,
      mismatchedPages,
      pages,
      usedConfidenceThreshold: minConf,
    };
  }
  const handleSearchVendor = async query => {
    const trimmedQuery = String(query || '').trim();

    if (!trimmedQuery || trimmedQuery.length < 2) {
      setSearchResults([]);
      setVendorSearchLoading(false);
      setVendorSearchTouched(false);
      return;
    }

    const requestId = ++vendorSearchRequestRef.current;
    setVendorSearchLoading(true);
    setVendorSearchTouched(true);

    try {
      console.log('Api callled', trimmedQuery);
      console.log("API_ENDPOINTS.SEARCHVENDOR", API_ENDPOINTS.SEARCHVENDOR);

      const token = await AsyncStorage.getItem('access_token');
      const icms_store = await AsyncStorage.getItem('icms_store');
      console.log("AsyncStorage:", token);
      const body = {
        "q": trimmedQuery
      };
      const res = await fetch(API_ENDPOINTS.SEARCHVENDOR, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': token,
          'mode': 'MOBILE',
          'store': icms_store
        },
        body: JSON.stringify(body),
      });

      console.log('Vendor search result:', res)
      const data = await res.json().catch(() => ({}));
      console.log("vendor data:", data);;

      if (requestId !== vendorSearchRequestRef.current) return;

      if (Array.isArray(data.results)) {
        console.log('Vendor search results:', data.results);
        setSearchResults(data.results);
      } else {
        console.warn('Unexpected vendor data format:', data);
        setSearchResults([]);
      }
    } catch (err) {
      if (requestId !== vendorSearchRequestRef.current) return;
      console.error('Vendor search error:', err);
      setSearchResults([]);
    } finally {
      if (requestId === vendorSearchRequestRef.current) {
        setVendorSearchLoading(false);
      }
    }
  };

  const debouncedSearch = React.useMemo(
    () => debounce(handleSearchVendor, 300),
    [],
  );

  const handleSelectVendor = vendor => {
    setSelectedValue(vendor.value);
    setSelectedDatabaseName(vendor.databaseName);
    setSelectedVendorSlug(vendor.slug);
    setSelectedVendor(vendor);
    console.log("vendor details: ", vendor);
    setSearchQuery(vendor.value);
    setSearchResults([]);
    setVendorSearchTouched(false);
  };

  const handleClearSearch = () => {
    vendorSearchRequestRef.current += 1;
    setSearchQuery('');
    setSearchResults([]);
    setVendorSearchLoading(false);
    setVendorSearchTouched(false);
    setSelectedValue('');
    setSelectedDatabaseName('');
    setSelectedVendorSlug('');
    setSelectedVendor(null);
  };

  const handleCreateNewVendor = () => {
    setSearchResults([]);
    setVendorSearchTouched(false);
    navigation.navigate('AddNewVendorInvoice');
  };

  const handleValueChange = itemValue => {
    setSelectedValue(itemValue);
    const found = invoiceList.find(i => i.value === itemValue);
    if (found) {
      setSelectedDatabaseName(found.databaseName);
      setSelectedVendorSlug(found.slug);
    } else {
      setSelectedDatabaseName('');
      setSelectedVendorSlug('');
    }
  };

  // ====== Camera handlers (CameraKit) ======
  const requestCameraPerm = async () => {
    const perm = Platform.select({
      ios: PERMISSIONS.IOS.CAMERA,
      android: PERMISSIONS.ANDROID.CAMERA,
    });
    if (!perm) return true;
    const result = await request(perm);
    return result === RESULTS.GRANTED;
  };

  const setBtnLoading = (key, value) => {
    setButtonLoading(prev => ({ ...prev, [key]: value }));
  };

  const handleOpenCamera = async () => {
    setBtnLoading('selectInvoice', true);
    try {
      const ok = await requestCameraPerm();
      if (!ok) {
        Alert.alert('Permission needed', 'Camera permission is required.');
        return;
      }
      setShowCamera(true);
      setIsResponseImg(true);
    } catch (error) {
      console.warn('Camera permission error:', error);
    } finally {
      setBtnLoading('selectInvoice', false);
    }
  };

  const handleCloseCamera = () => setShowCamera(false);

  const snapPhoto = async () => {
    if (!cameraRef.current) return;
    setBtnLoading('snap', true);
    try {
      const photo = await cameraRef.current.capture();
      // CameraKit returns { uri: 'file://...' }
      // If you also need base64, you can read file via RNFS (optional). For now store uri.
      setSnappedImages(prev => [...prev, { uri: photo?.uri, base64: null }]);
      
      // Show preview for 3 seconds
      setSnapPreview(photo?.uri);
      
      // Clear previous timeout if any
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
      
      // Hide preview after 3 seconds
      previewTimeoutRef.current = setTimeout(() => {
        setSnapPreview(null);
        previewTimeoutRef.current = null;
      }, 3000);
    } catch (e) {
      console.warn('Error snapping photo:', e);
    } finally {
      setBtnLoading('snap', false);
    }
  };

  // ====== Image Picker (gallery) ======
  const pickFromGallery = async () => {
    const perm = Platform.select({
      ios: PERMISSIONS.IOS.PHOTO_LIBRARY,
      android: PERMISSIONS.ANDROID.READ_MEDIA_IMAGES,
    });
    setBtnLoading('gallery', true);
    try {
      if (perm) {
        const r = await request(perm);
        if (r !== RESULTS.GRANTED && Platform.OS === 'android') {
          // Older androids
          const r2 = await request(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
          if (r2 !== RESULTS.GRANTED) {
            Alert.alert('Permission needed', 'Photos permission is required.');
            return;
          }
        } else if (r !== RESULTS.GRANTED && Platform.OS === 'ios') {
          Alert.alert('Permission needed', 'Photos permission is required.');
          return;
        }
      }

      const res = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        includeBase64: true,
        selectionLimit: 0,
      });
      if (res?.assets?.length) {
        const add = res.assets.map(a => ({
          uri: a.uri,
          base64: a.base64 || null,
        }));
        setSnappedImages(prev => [...prev, ...add]);
        setIsResponseImg(true);
        setShowCamera(false);
      }
    } catch (error) {
      console.warn('Gallery picker error:', error);
    } finally {
      setBtnLoading('gallery', false);
    }
  };

  // vendor sarrch
  function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fn(...args);
      }, delay);
    };
  }

  // ====== Upload & Generate ======
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchWithRetry = async (url, options, retries = 1, retryDelay = 700) => {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fetch(url, options);
      } catch (err) {
        lastErr = err;
        const isLast = attempt === retries;
        if (!isLast) {
          await sleep(retryDelay);
          continue;
        }
      }
    }
    throw lastErr || new Error('Network request failed');
  };

  const handleGenerate = async () => {
    if (!selectedValue) {
      Alert.alert(
        'Select Vendor',
        'Please select a vendor before generating an invoice.',
      );
      return false;
    }
    if (!selectedDatabaseName) {
      Alert.alert('Vendor missing', 'Please pick a vendor before generating.');
      return false;
    }
    if (!snappedImages.length) {
      Alert.alert('No images', 'Please capture or select at least one image.');
      return false;
    }

    setIsGenerate(true);
    setBtnLoading('generate', true);
    setShowCamera(false);
    try {
      setUploadedFilenames([]);
      setUploadedImageURLs([]);
      setOcrJsons([]);

      const newFilenames = [];
      const newImageURLs = [];
      const token = await AsyncStorage.getItem('access_token');
      const icms_store = await AsyncStorage.getItem('icms_store');
      // Upload each image
      for (let i = 0; i < snappedImages.length; i++) {
        const img = snappedImages[i];
        console.log('image uri', img.uri);
        const fileOriginalName = `${selectedDatabaseName},jpg`;
        const formData = new FormData();
        formData.append('file', {
          uri: img.uri,
          type: 'image/jpeg',
          name: fileOriginalName,
        });
        console.log('SelectedDatabaseName', fileOriginalName);
        const uploadResponse = await fetchWithRetry(API_ENDPOINTS.UPLOAD_IMAGE, {
          method: 'POST',
          headers: {
            'Content-Type': 'multipart/form-data',
            store: `${icms_store}`,
            mode: 'MOBILE',
            'access_token': token,
          }, // user-id is missing in the headers
          body: formData,
        }, 1, 700);
        console.log("upload responnes", uploadResponse)
        if (!uploadResponse.ok) {
          const t = await uploadResponse.text();
          throw new Error(`Upload failed (${uploadResponse.status}): ${t}`);
        }

        const uploadJson = await uploadResponse.json();
        console.log('uploadJson:', uploadJson);
        const filename = uploadJson?.filename;
        const imageURL = uploadJson?.message?.imageURL?.Location;
        if (filename && imageURL) {
          newFilenames.push(filename);
          newImageURLs.push(imageURL);
        } else {
          throw new Error(`Missing filename or imageURL in upload index ${i}`);
        }
      }

      setUploadedFilenames(newFilenames);
      setUploadedImageURLs(newImageURLs);


      const tempOcrs = [];
      for (let i = 0; i < newFilenames.length; i++) {
        const fname = newFilenames[i];
        const ocrResponse = await fetchWithRetry(API_ENDPOINTS.OCR_RESPONSE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'access_token': token,
            'mode': 'MOBILE',
            'store': icms_store
          },

          body: JSON.stringify({
            data: { filename: fname, vendorName: selectedDatabaseName },
          }),
        }, 1, 700);

        if (!ocrResponse.ok) {
          const t = await ocrResponse.text();
          throw new Error(`OCR API failed (${ocrResponse.status}): ${t}`);
        }
        const ocrJson = await ocrResponse.json();
        tempOcrs.push(ocrJson);
      }
      console.log("tempOcrs:", tempOcrs);

      const queryResponsesByIndexLocal = tempOcrs.reduce((acc, ocrItem, idx) => {
        acc[idx] = toRawResponseObject(ocrItem);
        return acc;
      }, {});

      
      setOcrJsons(tempOcrs);

// detuct mismatch
console.log("queryResponsesByIndexLocal:",queryResponsesByIndexLocal);
const mismatch = detectInvoiceMismatch(queryResponsesByIndexLocal, 70);
      console.log("mismatch", mismatch, "queryResponsesByIndexLocal", queryResponsesByIndexLocal)
      if (!mismatch.ok) {
        const message =
          `Different invoices detected.\n\n` +
          `Expected invoice: ${mismatch.majorityInvoice}\n\n` +
          `Mismatched pages:\n` +
          mismatch.mismatchedPages
            .map(
              (p) =>
                `• Page ${p.index + 1}: "${p.invoiceRaw}" (confidence ${p.invoiceConf})`,
            )
            .join('\n') +
          `\n\nPlease remove the wrong page(s) and scan again.`;

        console.log("deduct mismatch:", message);
        Alert.alert('Invoice Mismatch', message, [
          {
            text: 'OK',
            onPress: () => setStep(2),
          },
        ]);
        return false;
      }
    



      await generateInvoice(tempOcrs);
      return true;
    } catch (e) {
      console.error('Upload/OCR failed:', e);
      Alert.alert('Error', e.message);
      setIsResponseImg(false);
      setStep(2);
      return false;
    } finally {
      setBtnLoading('generate', false);
      setIsGenerate(false);
    }
  };

  const generateInvoice = async allOcrJson => {
    const combinedBodies = allOcrJson.map(o => o.body);
    const bodyPayload = {
      InvoiceName: selectedVendorSlug,
      ocrdata: combinedBodies,
    };
    const token = await AsyncStorage.getItem('access_token');
    const icms_store = await AsyncStorage.getItem('icms_store');
    const response = await fetch(API_ENDPOINTS.SETPRODUCTINTABLEFROMOCR, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        store: `${icms_store}`,
        'access_token': token,
        'mode': 'MOBILE',
      },
      body: JSON.stringify(bodyPayload),
    });
    console.log("bodyPayload:",bodyPayload);

    if (!response.ok) {
      const t = await response.text();
      throw new Error(`Request failed: ${response.status} - ${t}`);
    }
    const responseData = await response.json();
    console.log("responseData vendor:", responseData);
    setTableData(responseData);
    setIsResponseImg(false);
  };

  const handleRemoveItem = index => {
    const updated = [...tableData];
    updated.splice(index, 1);
    setTableData(updated);
  };

  const removeSnappedImage = index => {
    setSnappedImages(prev => {
      const next = prev.filter((_, idx) => idx !== index);
      if (!next.length) {
        setIsResponseImg(false);
      }
      return next;
    });
  };

  const clearAll = () => {
    setShowCamera(false);
    setSnappedImages([]);
    setOcrJsons([]);
    setTableData([]);
    setUploadedFilenames([]);
    setUploadedImageURLs([]);
    handleClearSearch();
    setIsGenerate(false);
    setIsResponseImg(false);
    setStep(1);
  };

  const handleClearAll = () => {
    setBtnLoading('clear', true);
    clearAll();
    setBtnLoading('clear', false);
  };

  const hasTableData = tableData.length > 0;
  const defaultInvoiceMeta = React.useMemo(() => {
    const rawList = (allocrJsons || [])
      .map((ocr) =>
        ocr?.rawResponse ??
        ocr?.response?.rawResponse ??
        ocr?.body?.rawResponse ??
        {},
      )
      .map((raw) => {
        if (raw && typeof raw === 'object') return raw;
        if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
          } catch (err) {
            return {};
          }
        }
        return {};
      });

    const firstInvoiceNo = rawList.find((r) => r?.invoiceNumber)?.invoiceNumber || '';
    const firstInvoiceDate = rawList.find((r) => r?.invoiceDateISO)?.invoiceDateISO || '';
    return {
      invoiceNumber: String(firstInvoiceNo || '').trim(),
      invoiceDateISO: String(firstInvoiceDate || '').trim(),
    };
  }, [allocrJsons]);

  const ButtonWithLoader = ({
    label,
    onPress,
    loading = false,
    style,
    disabled = false,
    textStyle,
  }) => (
    <TouchableOpacity
      style={[
        styles.btn,
        style,
        (disabled || loading) && styles.btnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={[styles.btnText, textStyle]}>{label}</Text>
      )}
    </TouchableOpacity>
  );

  const openModal = image => {
    setSelectedImage(image);
    setModalVisible(true);
  };
  const closeModal = () => {
    setModalVisible(false);
    setSelectedImage(null);
  };

  const handleStepOneNext = () => {
    if (!selectedValue || !selectedDatabaseName || !selectedVendorSlug) {
      Alert.alert('Select Vendor', 'Please search and select a vendor first.');
      return;
    }
    setStep(2);
  };

  const handleStepTwoNext = async () => {
    if (!snappedImages.length) {
      Alert.alert('No images', 'Please capture or select at least one image.');
      return;
    }
    setStep(3);
    await sleep(200);
    await handleGenerate();
  };

  const stepItems = [
    { id: 1, label: 'Search Vendor' },
    { id: 2, label: 'Upload Invoice' },
    { id: 3, label: 'Review & Save' },
  ];

  const activeStepTitle =
    step === 1 ? 'Step 1: Search Vendor' : step === 2 ? 'Step 2: Upload Invoice' : 'Step 3: Generate Invoice';
  const shouldShowVendorDropdown =
    searchQuery.trim().length >= 2 &&
    (vendorSearchLoading || vendorSearchTouched || searchResults.length > 0);

  return (
    <ImageBackground
      source={getImageSource(tulsiBg)}
      style={styles.screen}
      resizeMode="cover"
    >
      <AppHeader
        Title="ADD NEW INVOICE"
        backgroundType="image"
        backgroundValue={reportbg}
      ></AppHeader>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.stepperCard}>
          <View style={styles.stepperRow}>
            {stepItems.map((item, index) => {
              const isActive = step === item.id;
              const isDone = step > item.id;
              return (
                <React.Fragment key={item.id}>
                  <View style={styles.stepperItem}>
                    <View
                      style={[
                        styles.stepDot,
                        isActive && styles.stepDotActive,
                        isDone && styles.stepDotDone,
                      ]}
                    >
                      <Text style={[styles.stepDotText, (isActive || isDone) && styles.stepDotTextActive]}>
                        {isDone ? '✓' : item.id}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.stepLabel,
                        isActive && styles.stepLabelActive,
                        isDone && styles.stepLabelDone,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </View>
                  {index < stepItems.length - 1 && (
                    <View style={[styles.stepConnector, step > item.id && styles.stepConnectorDone]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        </View>

        <View style={styles.controlCard}>
          {step === 1 && (
            <View style={styles.searchWrap}>
              <View style={styles.searchRow}>
                <View style={styles.searchInputWrapper}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search Vendor..."
                    placeholderTextColor="#aaa"
                    value={searchQuery}
                    onChangeText={text => {
                      setSearchQuery(text);
                      debouncedSearch(text);
                    }}
                  />
                  {!!searchQuery && (
                    <TouchableOpacity
                      style={styles.clearSearchBtn}
                      onPress={handleClearSearch}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.clearSearchText}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {shouldShowVendorDropdown && (
                <View style={styles.dropdownContainer}>
                  <ScrollView
                    style={styles.dropdown}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                  >
                    {vendorSearchLoading ? (
                      <View style={styles.dropdownLoader}>
                        <ActivityIndicator size="small" color={COLORS.primary} />
                        <Text style={styles.dropdownStatusText}>Searching vendors...</Text>
                      </View>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((vendor, index) => (
                        <TouchableOpacity
                          key={vendor.slug || index}
                          style={[
                            styles.dropdownItem,
                            index % 2 === 0
                              ? styles.dropdownItemEven
                              : styles.dropdownItemOdd,
                          ]}
                          onPress={() => handleSelectVendor(vendor)}
                        >
                          <Text style={styles.dropdownText}>{vendor.value}</Text>
                        </TouchableOpacity>
                      ))
                    ) : (
                      <View style={styles.dropdownEmptyState}>
                        <Text style={styles.dropdownStatusText}>No vendor found</Text>
                        <TouchableOpacity
                          style={styles.createVendorBtn}
                          onPress={handleCreateNewVendor}
                        >
                          <Text style={styles.createVendorBtnText}>Create New Vendor</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </ScrollView>
                </View>
              )}

              <View style={[styles.stepBtnRow, isNarrow && styles.stepBtnRowStack]}>
                <TouchableOpacity
                  style={[styles.stepBtn, isNarrow && styles.stepBtnFull, styles.stepBtnPrimary]}
                  onPress={handleStepOneNext}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.stepBtnText}>Next</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {step === 2 && (
            <>
              <View style={[styles.stepBtnRow, isNarrow && styles.stepBtnRowStack]}>
                <TouchableOpacity
                  style={[styles.stepBtn, isNarrow && styles.stepBtnFull, styles.stepBtnLight]}
                  onPress={() => setStep(1)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.stepBtnLightText}>Back</Text>
                </TouchableOpacity>
                <ButtonWithLoader
                  label={showCamera ? 'Camera Active' : 'Upload Invoice'}
                  onPress={handleOpenCamera}
                  loading={buttonLoading.selectInvoice}
                  style={[styles.stepBtn, isNarrow && styles.stepBtnFull, styles.btnLightselectInvoice]}
                  textStyle={styles.btnLightText}
                />
                <TouchableOpacity
                  style={[styles.stepBtn, isNarrow && styles.stepBtnFull, styles.stepBtnPrimary]}
                  onPress={handleStepTwoNext}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.stepBtnText}>Next</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.stepBtnRow}>
              </View>
            </>
          )}

          {step === 3 && (
            <View style={[styles.stepBtnRow, isNarrow && styles.stepBtnRowStack]}>
              {(isGenerate || buttonLoading.generate) ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="small" color="#319241" />
                  <Text style={styles.loadingText}>Generating invoice data...</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row' }}>
                  <ButtonWithLoader
                    label="Save"
                    onPress={() => setSaveInvoiceVisible(s => !s)}
                    style={[styles.stepBtn, isNarrow && styles.stepBtnFull, styles.btnPrimary]}
                    loading={false}
                    disabled={!hasTableData}
                  />
                  <ButtonWithLoader
                    label="Clear"
                    onPress={handleClearAll}
                    loading={buttonLoading.clear}
                    style={[styles.stepBtn, isNarrow && styles.stepBtnFull, styles.btnDanger]}
                  />
                </View>
              )}
            </View>
          )}
        </View>


        {/* Snapped / Selected Images Row OR OCR Preview */}

        {step >= 2 && hasTableData && uploadedFilenames.length > 0 && uploadedImageURLs.length > 0 ? (
          <View style={styles.previewCard}>
            <ScrollView
              horizontal
              style={styles.imageRow}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.previewScroll}
            >
              <OCRPreviewComponent
                filenames={uploadedFilenames}
                vendorName={selectedDatabaseName}
                imageURIs={uploadedImageURLs}
                tableData={tableData}
                ocrurl={ocrurl}
              />
            </ScrollView>
          </View>
        ) : step >= 2 && snappedImages.length > 0 ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Selected Images ({snappedImages.length})</Text>
            <ScrollView
              horizontal
              style={styles.imageRow}
              showsHorizontalScrollIndicator={false}
            >
              {snappedImages.map((item, index) => (
                <View key={`${item.uri}-${index}`} style={styles.thumbWrap}>
                  {step !== 3 && (
                    <View style={styles.thumbActions}>
                      <TouchableOpacity
                        style={styles.thumbClose}
                        onPress={() => removeSnappedImage(index)}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      >
                        <Text style={styles.thumbCloseText}>x</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <TouchableOpacity onPress={() => openModal(item.uri)}>
                    <Image source={{ uri: item.uri }} style={styles.thumb} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Full Image View */}
        <Modal visible={modalVisible} transparent animationType="fade">
          <View style={styles.modalBg}>
            <TouchableOpacity
              style={styles.modalCloseArea}
              onPress={closeModal}
            />
            <Image
              source={{ uri: selectedImage }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          </View>
        </Modal>

        {step === 3 && (
          <SearchTableComponent
            tableData={tableData}
            setTableData={setTableData}
            onRemoveRow={handleRemoveItem}
            onAddManual={() =>
              setTableData(prev => [
                ...prev,
                {
                  itemNo: '',
                  description: '',
                  qty: '',
                  unitPrice: '',
                  extendedPrice: '',
                  barcode: '',
                  manuallyAdded: true,
                  condition: 'normal',
                },
              ])
            }
          />
        )}
      </ScrollView>

      {/* Camera Fullscreen */}
      {showCamera && (
        <View style={styles.cameraSheet}>
          <Camera
            ref={cameraRef}
            style={styles.cameraPreview}
            cameraType={CameraType.Back}
            zoomMode="on"
          />
          <View style={[styles.cameraControls, isNarrow && styles.cameraControlsNarrow]}>
            <ButtonWithLoader
              label="Snap Photo"
              onPress={snapPhoto}
              loading={buttonLoading.snap}
              style={[styles.cameraActionBtn, styles.btnGrey]}
              textStyle={styles.btnGreyText}
            />
            <ButtonWithLoader
              label="From Gallery"
              onPress={pickFromGallery}
              loading={buttonLoading.gallery}
              style={[styles.cameraActionBtn, styles.btnLight]}
              textStyle={styles.btnLightText}
            />
            <TouchableOpacity
              style={[
                styles.btn,
                styles.cameraActionBtn,
                styles.btnDanger,
              ]}
              onPress={handleCloseCamera}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.btnText}>Close</Text>
            </TouchableOpacity>
          </View>
          
          {/* Snap Preview - shows for 3 seconds after capture */}
          {snapPreview && (
            <View style={styles.snapPreviewContainer}>
              <Image
                source={{ uri: snapPreview }}
                style={styles.snapPreviewImage}
              />
              <Text style={styles.snapPreviewText}>✓ Picture captured</Text>
            </View>
          )}
        </View>
      )}

      {/* Save modal */}
      {tableData.length > 0 && (
        <SaveInvoiceModal
          isVisible={saveInvoiceVisible}
          onClose={() => { setSaveInvoiceVisible(false); }}
          ImageURL={uploadedImageURLs}
          vendorName={selectedVendorSlug}
          defaultInvoiceNo={defaultInvoiceMeta.invoiceNumber}
          defaultInvoiceDateISO={defaultInvoiceMeta.invoiceDateISO}
          tableData={tableData}
          cleardata={clearAll}
          selectedVendor={selectedVendor}
        />
      )}
    </ImageBackground>
  );
};

export default OcrScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 16 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 14,
  },
  stepperCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#d8e9dd',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginHorizontal: 10,
    marginTop: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperItem: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#bfd7c6',
    backgroundColor: '#f1f8f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    borderColor: '#2f8f43',
    backgroundColor: '#2f8f43',
  },
  stepDotDone: {
    borderColor: '#2f8f43',
    backgroundColor: '#e7f5eb',
  },
  stepDotText: {
    color: '#63806b',
    fontSize: 13,
    fontWeight: '700',
  },
  stepDotTextActive: {
    color: '#fff',
  },
  stepLabel: {
    fontSize: 11,
    color: '#6e7f74',
    fontWeight: '600',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: '#1f6d31',
    fontWeight: '700',
  },
  stepLabelDone: {
    color: '#2f8f43',
  },
  stepConnector: {
    height: 2,
    flex: 0.8,
    backgroundColor: '#d6e6da',
    marginHorizontal: 2,
    marginBottom: 20,
  },
  stepConnectorDone: {
    backgroundColor: '#73ba84',
  },
  controlCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#d8e9dd',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 10,
    marginBottom: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 7,
    elevation: 3,
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#173a23',
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 4,
  },
  stepSub: {
    fontSize: 12,
    color: '#64748B',
    paddingHorizontal: 10,
    paddingTop: 4,
  },
  stepBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 8,
    paddingBottom: 8,
    marginTop: 6,
    alignItems: 'stretch',
  },
  stepBtnRowStack: {
    flexDirection: 'column',
  },
  stepBtn: {
    flex: 1,
    minWidth: 120,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnFull: {
    width: '100%',
    minWidth: '100%',
    flexBasis: '100%',
    flexGrow: 0,
  },
  stepBtnPrimary: {
    backgroundColor: '#2f8f43',
    width: '40%',
  },
  stepBtnLight: {
    backgroundColor: GREEN_LIGHT,
  },
  stepBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  stepBtnLightText: {
    color: GREEN_DARK,
    fontWeight: '700',
    fontSize: 14,
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },

  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  btn: {
    flexGrow: 1,
    minHeight: 48,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnWide: {
    minWidth: "22%",
  },
  btnNarrow: {
    flexBasis: "48%",
    minWidth: "48%",
  },
  btnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  btnPrimary: {
    backgroundColor: '#2f8f43',
  },
  btnLight: {
    backgroundColor: '#eef6f0',
  },
   btnLightselectInvoice: {
    backgroundColor: '#eef6f0',
  },

  
  btnLightText: {
    color: GREEN_DARK,
  },
  btnGrey: {
    backgroundColor: GREY_LIGHT,
  },
  btnGreyText: {
    color: GREY_DARK,
  },
  btnAccent: {
    backgroundColor: COLORS.primary,
  },
  btnSuccess: {
    backgroundColor: COLORS.primary,
  },
  btnDanger: {
    backgroundColor: '#cf4d47',
  },


  previewCard: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: '#d8e9dd',
    borderRadius: 14,
    marginHorizontal: 10,
    marginBottom: 12,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#173a23',
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  imageRow: {
    minHeight: 120,
    maxHeight: 200,
    marginHorizontal: 8,
    marginVertical: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#f8fcf9',
    borderRadius: 12,
  },
  previewScroll: {
    alignItems: 'center',
  },
  thumbWrap: {
    marginHorizontal: 6,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingBottom: 6,
    width: 110,
  },
  thumbActions: {
    alignItems: 'flex-end',
    padding: 6,
  },
  thumbClose: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1f1f1f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbCloseText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '700',
  },
  thumb: {
    width: 96,
    height: 96,
    backgroundColor: '#f1f1f1',
  },

  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  fullImage: { width: '90%', height: '80%', borderRadius: 10 },

  cameraSheet: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
  },
  cameraPreview: {
    flex: 1,
  },
  cameraControls: {
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    borderTopWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    gap: 10,
  },
  cameraControlsNarrow: {
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  cameraActionBtn: {
    flexBasis: 0,
    minWidth: 110,
  },
  snapPreviewContainer: {
    position: 'absolute',
    bottom: 90,
    left: 12,
    backgroundColor: '#000000DD',
    borderRadius: 12,
    overflow: 'hidden',
    padding: 8,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  snapPreviewImage: {
    width: 100,
    height: 120,
    borderRadius: 8,
  },
  snapPreviewText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  screen: {
    flex: 1,
  },
  fakeInput: {
    flexDirection: 'row',
  },
  label: {
    fontSize: 12,
    color: COLORS.sub,
    marginBottom: 6,
    fontWeight: '600',
  },

  pickerContainer: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: '#fff',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  picker: {
    width: '100%',
  },

  pickerWrap: {
    margin: 10,
  },
  label: {
    fontSize: 12,
    color: COLORS.sub,
    marginBottom: 6,
    fontWeight: '600',
  },
  fakeInput: {
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  inputPlaceholder: {
    color: '#9aa0a6',
    fontWeight: '500',
  },
  caret: {
    fontSize: 16,
    color: COLORS.sub,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalBackdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    backgroundColor: '#fff',
  },
  modalLabel: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.sub,
  },
  modalDateText: {
    color: COLORS.text,
    fontSize: 14,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modalActionBtn: {
    flex: 1,
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  clearLink: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  optionRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionRowActive: {
    backgroundColor: '#f0f5ff',
  },
  optionText: {
    color: COLORS.text,
    fontSize: 14,
    flexShrink: 1,
    paddingRight: 10,
  },
  optionTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  tick: { fontSize: 16, color: COLORS.primary },

  btnRowInline: {
    flexDirection: "row",
    flexWrap: "wrap", // allows wrapping if small screen
    justifyContent: "space-between",
    gap: 10, // spacing between buttons
    marginTop: 10,
  },
  searchWrap: {
    position: 'relative',
    width: '100%',
    padding: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInputWrapper: {
    position: 'relative',
    flex: 1,
    justifyContent: 'center',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#fff',
    color: COLORS.text,
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 14,
    padding: 4,
    borderRadius: 12,
    backgroundColor: GREEN_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearSearchText: {
    fontSize: 16,
    fontWeight: '700',
    color: GREEN_DARK,
    marginTop: -2,
  },
  dropdownContainer: {
    position: 'absolute',
    top: 55,
    width: '100%',
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
    maxHeight: 220,
    zIndex: 100,
    marginLeft: 10,
    borderRadius: 10
  },
  dropdown: {
    paddingVertical: 4,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  dropdownItemEven: {
    backgroundColor: '#ffffff', // white
  },
  dropdownItemOdd: {
    backgroundColor: '#eef8f2', // light green shade
  },
  dropdownText: {
    fontSize: 15,
    color: '#333',
  },
  dropdownLoader: {
    paddingVertical: 18,
    paddingHorizontal: 15,
    alignItems: 'center',
    gap: 10,
  },
  dropdownEmptyState: {
    paddingVertical: 16,
    paddingHorizontal: 15,
    gap: 10,
  },
  dropdownStatusText: {
    fontSize: 14,
    color: '#52606d',
    textAlign: 'center',
    fontWeight: '600',
  },
  createVendorBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  createVendorBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

});
