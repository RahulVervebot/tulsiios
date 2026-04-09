import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { Camera, CameraType } from 'react-native-camera-kit';
import AppHeader from './AppHeader';
import reportbg from '../assets/images/report-bg.png';
import { getArchivedProducts, unarchiveProduct } from '../functions/product-function';

const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

export default function ArchivedProductList() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState([]);
  const [serverCount, setServerCount] = useState(0);
  const [query, setQuery] = useState('');

  const [scannerVisible, setScannerVisible] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [scanLock, setScanLock] = useState(false);
  const [unarchivingId, setUnarchivingId] = useState(null);

  const requestCameraPerm = async () => {
    const perm = Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;
    const result = await request(perm);
    return result === RESULTS.GRANTED;
  };

  const openScanner = async () => {
    const ok = await requestCameraPerm();
    if (!ok) {
      Alert.alert('Camera Permission', 'Enable camera access in settings to scan.');
      return;
    }
    setHasCameraPermission(true);
    setScanLock(false);
    setScannerVisible(true);
  };

  const onReadCode = useCallback((event) => {
    if (scanLock) return;
    const value = event?.nativeEvent?.codeStringValue || event?.codeStringValue || '';
    if (!value) return;
    setScanLock(true);
    setQuery(value);
    setScannerVisible(false);
    setTimeout(() => setScanLock(false), 800);
  }, [scanLock]);

  const fetchData = useCallback(async () => {
    try {
      const data = await getArchivedProducts();
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setServerCount(Number(data?.count ?? 0));
    } catch (e) {
      Alert.alert('Fetch error', String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = String(r?.product_name || '').toLowerCase();
      const barcode = String(r?.barcode || '').toLowerCase();
      return name.includes(q) || barcode.includes(q);
    });
  }, [rows, query]);

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle} numberOfLines={1}>{item?.product_name || '-'}</Text>
        <Text style={styles.itemSub}>Barcode: {item?.barcode || '-'}</Text>
        <Text style={styles.itemSub}>Category: {item?.category || '-'}</Text>
      </View>
      <View style={styles.rightCol}>
        <View style={styles.priceWrap}>
          <Text style={styles.priceText}>${Number(item?.list_price || 0).toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.unarchiveBtn, unarchivingId === item?.id && { opacity: 0.6 }]}
          disabled={unarchivingId === item?.id}
          onPress={() => handleUnarchive(item)}
        >
          {unarchivingId === item?.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.unarchiveBtnText}>Restore</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const doUnarchive = async (item) => {
    const pid = Number(item?.id);
    if (!Number.isFinite(pid) || pid <= 0) {
      Alert.alert('Error', 'Invalid product id.');
      return;
    }
    try {
      setUnarchivingId(pid);
      await unarchiveProduct(pid);
      Alert.alert('Success', 'Product restored successfully.');
      setRows((prev) => prev.filter((r) => Number(r?.id) !== pid));
      setServerCount((prev) => Math.max(0, Number(prev || 0) - 1));
    } catch (e) {
      Alert.alert('Error', String(e?.message || e));
    } finally {
      setUnarchivingId(null);
    }
  };

  const handleUnarchive = (item) => {
    Alert.alert(
      'Restore Product',
      'Are you sure you want to restore this product?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: () => doUnarchive(item) },
      ]
    );
  };

  return (
    <ImageBackground source={getImageSource(reportbg)} style={styles.screen} resizeMode="cover">
      <AppHeader Title="DELETED PRODUCTS" backgroundType="image" backgroundValue={reportbg} />

      <View style={styles.container}>
        <View style={styles.searchRow}>
          <Text style={styles.totalPill}>Total: {serverCount || rows.length}</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by product name or barcode"
            placeholderTextColor="#9CA3AF"
            style={styles.searchInput}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
            <Text style={styles.scanBtnText}>Scan</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Loading deleted products...</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item, idx) => String(item?.id ?? idx)}
            renderItem={renderItem}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>No deleted products found.</Text>
              </View>
            }
          />
        )}
      </View>

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
          <View style={[styles.center, { padding: 24 }]}>
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
  container: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  totalPill: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
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
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: '#1f1f1f',
  },
  scanBtn: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scanBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  itemTitle: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 15,
  },
  itemSub: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  priceWrap: {
    marginLeft: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: 8,
    marginLeft: 8,
  },
  priceText: {
    color: '#166534',
    fontWeight: '700',
    fontSize: 12,
  },
  unarchiveBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  unarchiveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 8, color: '#6b7280' },
  emptyText: { color: '#6b7280' },
  scannerControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
  },
  scannerBtn: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  scannerBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
});
