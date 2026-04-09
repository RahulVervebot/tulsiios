// src/screens/SalePrintScreen.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import AppHeader from '../components/AppHeader';
import reportbg from '../assets/images/report-bg.png';

const THEME = {
  primary: '#319241',
  secondary: '#319241',
  price: '#27ae60',
  text: '#111',
  muted: '#6b7280',
  border: '#e5e7eb',
  bg: '#f9fafb',
};

const BOX_OPTIONS = ['1', '2', '4', '6', '8'];

export default function SalePrintScreen() {
  const [storeUrl, setStoreUrl] = useState('');
  const [token, setToken] = useState('');

  const [camGranted, setCamGranted] = useState(false);
  const [isScannerOpen, setScannerOpen] = useState(false);
  const [currentBoxKey, setCurrentBoxKey] = useState(null);
  const isHandlingScanRef = useRef(false);

  const [printBox, setPrintBox] = useState({
    logo: '',
    number_of_prints: '1',
    number_of_boxes: '1',
    duplicate_boxes: false,
    highlightHeading: '',
    highlightHeading_style: {
      color: 'black',
      fontStyle: 'italic',
    },
  });

  const [imageBase64, setImageBase64] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [boxData, setBoxData] = useState({});
  const [selectedBoxes, setSelectedBoxes] = useState([]);
  const [isLoading, setLoading] = useState(false);
  const [isLoadingBarcode, setLoadingBarcode] = useState(false);

  useEffect(() => {
    (async () => {
      const [su, tk, savedIp, savedLogo] = await Promise.all([
        AsyncStorage.getItem('storeurl'),
        AsyncStorage.getItem('access_token'),
        AsyncStorage.getItem('IP_Address'),
        AsyncStorage.getItem('printBoxLogo'),
      ]);
      if (su) setStoreUrl(su);
      if (tk) setToken(tk);
      if (savedIp) setIpAddress(savedIp.replace(/\/generate-pdf$/i, ''));
      if (savedLogo) setImageBase64(savedLogo);
    })();
  }, []);

  useEffect(() => {
    const ask = async () => {
      const perm = Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;
      let status = await check(perm);
      if (status === RESULTS.DENIED || status === RESULTS.LIMITED) {
        status = await request(perm);
      }
      setCamGranted(status === RESULTS.GRANTED);
    };
    ask();
  }, []);

  useEffect(() => {
    const boxes = [];
    const boxesData = {};
    for (let i = 0; i < parseInt(printBox.number_of_boxes, 10); i += 1) {
      boxes.push(i);
      boxesData[`box${i + 1}`] = {
        title_1: '',
        title_2: '',
        price: '',
        quantity: '',
        barcode: '',
        title_1_style: { color: 'black', fontStyle: 'italic' },
        title_2_style: { color: 'black', fontStyle: 'italic' },
        price_style: { color: 'black', fontStyle: 'italic' },
        quantity_style: { color: 'black', fontStyle: 'italic' },
      };
    }
    setSelectedBoxes(boxes);
    setBoxData(boxesData);
  }, [printBox.number_of_boxes]);

  const handlePickLogo = async (fromCamera) => {
    const fn = fromCamera ? launchCamera : launchImageLibrary;
    const res = await fn({
      mediaType: 'photo',
      includeBase64: true,
      quality: 0.8,
    });
    if (res?.didCancel) return;
    const asset = res?.assets?.[0];
    if (!asset?.base64) {
      Alert.alert('Image', 'Unable to read the selected image.');
      return;
    }
    const encoded = encodeURIComponent(asset.base64);
    setImageBase64(encoded);
    await AsyncStorage.setItem('printBoxLogo', encoded);
  };

  const handleBarcodeScanned = (scannedData) => {
    setScannerOpen(false);
    if (!currentBoxKey) {
      Alert.alert('Error', 'No box selected for scanning.');
      return;
    }
    setBoxData((prev) => ({
      ...prev,
      [currentBoxKey]: {
        ...prev[currentBoxKey],
        barcode: scannedData,
      },
    }));
    handleIndividualBarcodeSearch(currentBoxKey, scannedData);
  };

const handleIndividualBarcodeSearch = async (boxKey, scannedData) => {
  const barcodeValue = String(scannedData || boxData?.[boxKey]?.barcode || '').trim();

  if (!barcodeValue) {
    Alert.alert('Error', 'Please enter a valid barcode to search.');
    return;
  }

  if (!storeUrl || !token) {
    Alert.alert('Error', 'Missing store URL or access token.');
    return;
  }

  const searchProduct = async (query) => {
    const res = await fetch(
      `${storeUrl}/pos/app/product/search?query=${encodeURIComponent(query)}`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          access_token: token,
        },
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to fetch product (${res.status}): ${text || 'No details'}`);
    }

    const json = await res.json();
    return Array.isArray(json?.products) ? json.products : [];
  };

  setLoadingBarcode(true);

  try {
    const attempts = [];
    const tried = new Set();

    // 1. original barcode
    attempts.push(barcodeValue);

    // 2. if starts with 0, remove first zero
    if (barcodeValue.startsWith('0') && barcodeValue.length > 1) {
      attempts.push(barcodeValue.slice(1));
    }

    // 3. remove last digit
    if (barcodeValue.length > 1) {
      attempts.push(barcodeValue.slice(0, -1));
    }

    // 4. remove first and last digit
    if (barcodeValue.length > 2) {
      attempts.push(barcodeValue.slice(1, -1));
    }

    let item = null;
    let matchedBarcode = barcodeValue;

    for (const attempt of attempts) {
      const cleaned = String(attempt || '').trim();
      if (!cleaned || tried.has(cleaned)) continue;

      tried.add(cleaned);

      const list = await searchProduct(cleaned);
      if (list.length > 0) {
        item = list[0];
        matchedBarcode = cleaned;
        break;
      }
    }

    if (!item) {
      Alert.alert('Not found', 'No product matched this barcode.');
      return;
    }

    setBoxData((prev) => ({
      ...prev,
      [boxKey]: {
        ...prev[boxKey],
        title_1: item.productName || item.name || 'No Name',
        price: String(item.price ?? item.salePrice ?? item.list_price ?? ''),
        quantity: item.productSize || item.size || '',
        barcode: item.barcode || matchedBarcode,
      },
    }));
  } catch (error) {
    console.error('Barcode search error:', error?.message);
    Alert.alert('Error', 'Failed to fetch barcode data. Please try again.');
  } finally {
    setLoadingBarcode(false);
  }
};

  const payload = useMemo(() => {
    return {
      ...printBox,
      logo: imageBase64,
      box: Object.values(boxData),
    };
  }, [boxData, imageBase64, printBox]);

  const checkIPAndPrint = async () => {
    try {
      setLoading(true);
      const stored = await AsyncStorage.getItem('IP_Address');
      const trimmed = (ipAddress || '').trim();
      const base = trimmed || stored;

      if (!base) {
        setLoading(false);
        Alert.alert('IP Required', 'Please add a printer IP first.');
        return;
      }

      const url = /\/generate-pdf$/i.test(base) ? base : `${base}/generate-pdf`;
      console.log("url:",url);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      console.log("text:",text);
      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        json = null;
      }

      if (json?.operation === 'success') {
        Alert.alert('Success', 'Print job sent.');
      } else {
        Alert.alert('Error', 'Print request failed.');
      }
    } catch (error) {
      console.error('Print error:', error?.message);
      Alert.alert('Error', 'Something went wrong while printing.');
    } finally {
      setLoading(false);
    }
  };

  const saveIp = async () => {
    const trimmed = (ipAddress || '').trim();
    if (!trimmed) {
      Alert.alert('IP Required', 'Please type an IP address.');
      return;
    }
    const normalized = /\/generate-pdf$/i.test(trimmed) ? trimmed : `${trimmed}/generate-pdf`;
    await AsyncStorage.setItem('IP_Address', normalized);
    Alert.alert('Saved', 'Printer IP saved.');
  };

  const renderBox = (index) => {
    const key = `box${index + 1}`;
    const data = boxData[key] || {};

    return (
      <View key={key} style={styles.card}>
        <Text style={styles.cardTitle}>Box {index + 1}</Text>

        <View style={styles.row}>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={data.barcode || ''}
              onChangeText={(text) =>
                setBoxData((prev) => ({
                  ...prev,
                  [key]: { ...prev[key], barcode: text },
                }))
              }
              placeholder="Type or scan barcode"
              placeholderTextColor={THEME.muted}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.cameraBtn}
              onPress={() => {
                setCurrentBoxKey(key);
                setScannerOpen(true);
              }}
            >
              <Text style={styles.cameraBtnText}>Scan</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.searchBtn}
            onPress={() => handleIndividualBarcodeSearch(key)}
          >
            <Text style={styles.searchBtnText}>
              {isLoadingBarcode ? 'Loading...' : 'Search'}
            </Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          value={data.title_1 || ''}
          onChangeText={(text) =>
            setBoxData((prev) => ({
              ...prev,
              [key]: { ...prev[key], title_1: text },
            }))
          }
          placeholder="Product title"
          placeholderTextColor={THEME.muted}
        />

        <TextInput
          style={styles.input}
          value={data.price || ''}
          onChangeText={(text) =>
            setBoxData((prev) => ({
              ...prev,
              [key]: { ...prev[key], price: text },
            }))
          }
          placeholder="Price"
          placeholderTextColor={THEME.muted}
          keyboardType="numeric"
        />

        <TextInput
          style={styles.input}
          value={data.quantity || ''}
          onChangeText={(text) =>
            setBoxData((prev) => ({
              ...prev,
              [key]: { ...prev[key], quantity: text },
            }))
          }
          placeholder="Size"
          placeholderTextColor={THEME.muted}
        />
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ImageBackground source={reportbg} style={styles.screen} resizeMode="cover">
        <AppHeader Title="SALE PRINT" backgroundType="image" backgroundValue={reportbg} />

        <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
          <View style={styles.logoBlock}>
            <View style={styles.logoPreview}>
              {imageBase64 ? (
                <Image
                  source={{ uri: `data:image/png;base64,${decodeURIComponent(imageBase64)}` }}
                  style={styles.logoImg}
                  resizeMode="contain"
                />
              ) : (
                <Text style={styles.logoPlaceholder}>Your Logo</Text>
              )}
            </View>

            <View style={styles.logoActions}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => handlePickLogo(true)}>
                <Text style={styles.secondaryBtnText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => handlePickLogo(false)}>
                <Text style={styles.secondaryBtnText}>Gallery</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.ipRow}>
            <TextInput
              style={styles.ipInput}
              value={ipAddress}
              onChangeText={setIpAddress}
              placeholder="Printer IP (e.g. http://192.168.1.12:5500)"
              placeholderTextColor={THEME.muted}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={saveIp}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.optionsRow}>
            <Text style={styles.label}>Boxes</Text>
            <View style={styles.pillRow}>
              {BOX_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.pill,
                    printBox.number_of_boxes === opt && styles.pillActive,
                  ]}
                  onPress={() =>
                    setPrintBox((prev) => ({
                      ...prev,
                      number_of_boxes: opt,
                      number_of_prints: '1',
                    }))
                  }
                >
                  <Text
                    style={[
                      styles.pillText,
                      printBox.number_of_boxes === opt && styles.pillTextActive,
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.optionsRow}>
            <Text style={styles.label}>Duplicate boxes</Text>
            <Switch
              value={printBox.duplicate_boxes}
              onValueChange={(val) =>
                setPrintBox((prev) => ({ ...prev, duplicate_boxes: val }))
              }
              trackColor={{ false: '#d1d5db', true: THEME.secondary }}
              thumbColor="#fff"
            />
          </View>

          <TextInput
            style={styles.input}
            value={printBox.highlightHeading}
            onChangeText={(text) => setPrintBox((prev) => ({ ...prev, highlightHeading: text }))}
            placeholder="Heading (optional)"
            placeholderTextColor={THEME.muted}
          />

          {selectedBoxes.map((boxIndex) =>
            printBox.duplicate_boxes && boxIndex > 0 ? null : renderBox(boxIndex)
          )}

          <TextInput
            style={styles.input}
            value={printBox.number_of_prints}
            onChangeText={(text) =>
              setPrintBox((prev) => ({ ...prev, number_of_prints: text }))
            }
            placeholder="Number of prints"
            placeholderTextColor={THEME.muted}
            keyboardType="numeric"
          />

          {isLoading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="large" color={THEME.secondary} />
              <Text style={styles.loadingText}>Sending print job...</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.printBtn} onPress={checkIPAndPrint}>
              <Text style={styles.printBtnText}>Print</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {isScannerOpen && camGranted && (
          <Modal transparent animationType="slide" visible onRequestClose={() => setScannerOpen(false)}>
            <View style={styles.scannerWrap}>
              <Camera
                style={{ flex: 1 }}
                cameraType={CameraType.Back}
                scanBarcode
                onReadCode={(e) => {
                  if (isHandlingScanRef.current) return;
                  const value = e?.nativeEvent?.codeStringValue;
                  const codeType = e?.nativeEvent?.codeType;
                  if (!value) return;
                  if (codeType === 'QR_CODE') return;
                  if (!codeType && /^(https?:\/\/|www\.)/i.test(value)) return;
                  isHandlingScanRef.current = true;
                  handleBarcodeScanned(value);
                  setTimeout(() => {
                    isHandlingScanRef.current = false;
                  }, 600);
                }}
              />
              <TouchableOpacity
                onPress={() => setScannerOpen(false)}
                style={styles.closeScannerBtn}
              >
                <Text style={styles.closeScannerText}>Close</Text>
              </TouchableOpacity>
            </View>
          </Modal>
        )}
      </ImageBackground>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  container: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },

  logoBlock: { alignItems: 'center', marginBottom: 18 },
  logoPreview: {
    width: 140,
    height: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: { width: '90%', height: '90%' },
  logoPlaceholder: { color: THEME.muted, fontWeight: '600' },
  logoActions: { flexDirection: 'row', gap: 12, marginTop: 10 },

  ipRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 12 },
  ipInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: THEME.text,
  },

  saveBtn: {
    backgroundColor: THEME.secondary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  saveBtnText: { color: '#fff', fontWeight: '700' },

  optionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  label: { color: THEME.text, fontWeight: '600' },

  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  pill: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  pillActive: { borderColor: THEME.primary, backgroundColor: '#eef2ff' },
  pillText: { color: THEME.muted, fontWeight: '600' },
  pillTextActive: { color: THEME.primary },

  card: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 12,
  },
  cardTitle: { fontWeight: '700', color: THEME.primary, marginBottom: 8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: THEME.text,
    marginBottom: 8,
  },
  cameraBtn: {
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  cameraBtnText: { color: THEME.primary, fontWeight: '700' },

  searchBtn: {
    backgroundColor: THEME.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  searchBtnText: { color: '#fff', fontWeight: '700' },

  secondaryBtn: {
    backgroundColor: '#fff',
    borderColor: THEME.border,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  secondaryBtnText: { color: THEME.primary, fontWeight: '700' },

  loadingBlock: { alignItems: 'center', marginTop: 8 },
  loadingText: { color: THEME.muted, marginTop: 8 },

  printBtn: {
    backgroundColor: THEME.secondary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  printBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  scannerWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  closeScannerBtn: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: THEME.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  closeScannerText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
