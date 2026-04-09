import React, { useEffect, useMemo, useState } from 'react';
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
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';

const THEME = { primary: '#2C1E70', secondary: '#319241' };
const STORE_URL_KEY = 'storeurl';
const ACCESS_TOKEN_KEY = 'access_token';

export default function CreateCategoryModal({ visible, onClose, onCreated }) {
  const [storeUrl, setStoreUrl] = useState('');
  const [token, setToken] = useState('');

  const [name, setName] = useState('');
  const [categoryMargin, setCategoryMargin] = useState('0');
  const [categoryMarkup, setCategoryMarkup] = useState('0');
  const [categoryPP, setCategoryPP] = useState('0');
  const [topList, setTopList] = useState(false);
  const [image, setImage] = useState(null); // base64
  const [topIcon, setTopIcon] = useState(null);
  const [topBanner, setTopBanner] = useState(null);
  const [topBannerBottom, setTopBannerBottom] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await AsyncStorage.getItem(STORE_URL_KEY);
        const t = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
        if (!s || !t) {
          Alert.alert('Missing config', 'store_url or access_token not found.');
          return;
        }
        setStoreUrl(s);
        setToken(t);
      } catch (e) {
        Alert.alert('Error', 'Failed to load credentials.');
      }
    })();
  }, []);

  // ---------- permissions ----------
  const requestCameraPerm = async () => {
    const perm = Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;
    const result = await request(perm);
    return result === RESULTS.GRANTED;
  };
  const requestGalleryPerm = async () => {
    const perm =
      Platform.OS === 'ios'
        ? PERMISSIONS.IOS.PHOTO_LIBRARY
        : PERMISSIONS.ANDROID.READ_MEDIA_IMAGES;
    let result = await request(perm);
    if (result === RESULTS.GRANTED) return true;
    if (Platform.OS === 'android') {
      result = await request(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
      return result === RESULTS.GRANTED;
    }
    return false;
  };

  // ---------- image helpers ----------
  const asDataUri = (b64) => (b64 ? `data:image/*;base64,${b64}` : null);

  const pickFromLibrary = async (setter) => {
    const ok = await requestGalleryPerm();
    if (!ok) return Alert.alert('Permission', 'Gallery permission denied.');
    const res = await launchImageLibrary({
      mediaType: 'photo',
      includeBase64: true,
      quality: 0.8,
      selectionLimit: 1,
      maxWidth: 1280,
      maxHeight: 1280,
    });
    if (res?.didCancel) return;
    const asset = res?.assets?.[0];
    if (!asset?.base64) return Alert.alert('Image', 'Could not read image.');
    setter(asset.base64);
  };

  const captureFromCamera = async (setter) => {
    const ok = await requestCameraPerm();
    if (!ok) return Alert.alert('Permission', 'Camera permission denied.');
    const res = await launchCamera({
      mediaType: 'photo',
      includeBase64: true,
      quality: 0.8,
      saveToPhotos: false,
      maxWidth: 1280,
      maxHeight: 1280,
    });
    if (res?.didCancel) return;
    const asset = res?.assets?.[0];
    if (!asset?.base64) return Alert.alert('Camera', 'Could not capture image.');
    setter(asset.base64);
  };

  // ---------- form ----------
  const validate = () => {
    if (!name.trim()) return 'Please enter category name.';
    return null;
  };

  const isPositive = (v) => Number(v || 0) > 0;
  const handlePricingInput = (field, value) => {
    const nextValue = value ?? '0';
    if (field === 'categoryMargin') {
      setCategoryMargin(nextValue);
      if (isPositive(nextValue)) {
        setCategoryMarkup('0');
        setCategoryPP('0');
      }
      return;
    }
    if (field === 'categoryMarkup') {
      setCategoryMarkup(nextValue);
      if (isPositive(nextValue)) {
        setCategoryMargin('0');
        setCategoryPP('0');
      }
      return;
    }
    setCategoryPP(nextValue);
    if (isPositive(nextValue)) {
      setCategoryMargin('0');
      setCategoryMarkup('0');
    }
  };

  const resetForm = () => {
    setName('');
    setCategoryMargin('0');
    setCategoryMarkup('0');
    setCategoryPP('0');
    setTopList(false);
    setImage(null);
    setTopIcon(null);
    setTopBanner(null);
    setTopBannerBottom(null);
  };

  const handleCreate = async () => {
    const err = validate();
    if (err) return Alert.alert('Missing info', err);
    if (!storeUrl || !token) return Alert.alert('Error', 'Missing store URL or token.');

    try {
      setSubmitting(true);
      const url = `${storeUrl}/pos/app/category/create`;
      // Send only fields needed; backend treats missing as optional
      const body = {
        name: name.trim(),
        categoryMargin: Number(categoryMargin || 0),
        categoryMarkup: Number(categoryMarkup || 0),
        categoryPP: Number(categoryPP || 0),
        ...(image != null ? { image } : {}),
        ...(typeof topList === 'boolean' ? { topList } : {}),
        ...(topIcon != null ? { topIcon } : {}),
        ...(topBanner != null ? { topBanner } : {}),
        ...(topBannerBottom != null ? { topBannerBottom } : {}),
      };
      if (Number(body.categoryMargin) > 0) {
        body.categoryMarkup = 0;
        body.categoryPP = 0;
      } else if (Number(body.categoryMarkup) > 0) {
        body.categoryMargin = 0;
        body.categoryPP = 0;
      } else if (Number(body.categoryPP) > 0) {
        body.categoryMargin = 0;
        body.categoryMarkup = 0;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: token,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));
      console.log("categories resoonse",json);
      if (!res.ok) {
        throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
      }

      Alert.alert('Success', 'Category created successfully.');
      onCreated?.(json?.category || { id: json?.id, ...body });
      resetForm();
      onClose?.();
    } catch (e) {
      console.log("error:",e);
      Alert.alert('Error', e?.message || 'Failed to create category.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.mainModalRoot}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          style={styles.centered}
        >
          <View style={styles.sheet}>
          <Text style={styles.title}>Create Category</Text>

          <ScrollView
            style={{ maxHeight: '80%' }}
            contentContainerStyle={{ paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {/* Name */}
            <TextInput
              style={styles.input}
              placeholder="Category Name *"
              placeholderTextColor="#6B7280"
              value={name}
              onChangeText={setName}
            />

            <View style={styles.row}>
              <View style={styles.halfCol}>
                <Text style={styles.label}>Add Margin</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Add Margin"
                  placeholderTextColor="#6B7280"
                  keyboardType="decimal-pad"
                  value={categoryMargin}
                  onChangeText={(v) => handlePricingInput('categoryMargin', v)}
                />
              </View>
              <View style={styles.halfCol}>
                <Text style={styles.label}>Add Markup</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Add Markup"
                  placeholderTextColor="#6B7280"
                  keyboardType="decimal-pad"
                  value={categoryMarkup}
                  onChangeText={(v) => handlePricingInput('categoryMarkup', v)}
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.halfCol}>
                <Text style={styles.label}>Profit Percentage</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Profit Percentage"
                  placeholderTextColor="#6B7280"
                  keyboardType="decimal-pad"
                  value={categoryPP}
                  onChangeText={(v) => handlePricingInput('categoryPP', v)}
                />
              </View>
              <View style={styles.halfCol} />
            </View>

            {/* Top List toggle */}
            {/* <View style={styles.rowBetween}>
              <Text style={styles.label}>Top List</Text>
              <TouchableOpacity
                style={[styles.pill, topList ? styles.pillOn : styles.pillOff]}
                onPress={() => setTopList((v) => !v)}
                activeOpacity={0.9}
              >
                <Text style={styles.pillText}>{topList ? 'ON' : 'OFF'}</Text>
              </TouchableOpacity>
            </View> */}

            {/* Image fields */}
            {[
              { key: 'image', title: 'Image', value: image, set: setImage },
              // { key: 'topIcon', title: 'Top Icon', value: topIcon, set: setTopIcon },
              // { key: 'topBanner', title: 'Top Banner', value: topBanner, set: setTopBanner },
              // { key: 'topBannerBottom', title: 'Top Banner Bottom', value: topBannerBottom, set: setTopBannerBottom },
            ].map(({ key, title, value, set }) => {
              const preview = asDataUri(value);
              return (
                <View key={key} style={styles.mediaBlock}>
                  <Text style={styles.subTitle}>{title} (optional)</Text>

                  {preview ? (
                    <Image source={{ uri: preview }} style={styles.preview} resizeMode="cover" />
                  ) : (
                    <View style={[styles.preview, styles.previewEmpty]}>
                      <Text style={{ color: '#999' }}>No Image</Text>
                    </View>
                  )}

                  <View style={styles.row}>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.ghost]}
                      onPress={() => pickFromLibrary(set)}
                    >
                      <Text style={styles.ghostText}>Gallery</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.smallBtn} onPress={() => captureFromCamera(set)}>
                      <Text style={styles.smallBtnText}>Camera</Text>
                    </TouchableOpacity>
                    {value != null && (
                      <TouchableOpacity
                        style={[styles.smallBtn, styles.btnDanger]}
                        onPress={() => set(null)}
                      >
                        <Text style={styles.smallBtnText}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Actions */}
          <View style={styles.rowRight}>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={[styles.btnText, styles.btnGhostText]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, submitting && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator /> : <Text style={styles.btnText}>Create</Text>}
            </TouchableOpacity>
          </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

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
  title: { fontSize: 18, fontWeight: '700', color: THEME.primary, marginBottom: 10 },
  subTitle: { marginTop: 12, marginBottom: 6, fontWeight: '700', color: '#333' },
  label: { fontWeight: '700', color: '#333' },

  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 12, color: '#111', marginTop: 10, backgroundColor: '#fff',
  },

  row: { flexDirection: 'row', gap: 10, marginTop: 6, alignItems: 'center' },
  halfCol: { flex: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },

  pill: { minWidth: 70, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  pillOn: { backgroundColor: THEME.primary },
  pillOff: { backgroundColor: '#e5e7eb' },
  pillText: { color: '#fff', fontWeight: '800' },

  preview: { width: '100%', height: 150, borderRadius: 8, marginTop: 10, backgroundColor: '#f4f4f4' },
  previewEmpty: { alignItems: 'center', justifyContent: 'center' },

  smallBtn: { backgroundColor: THEME.secondary, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  smallBtnText: { color: '#fff', fontWeight: '700' },
  ghost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  ghostText: { color: '#333', fontWeight: '700' },
  btnDanger: { backgroundColor: '#E53935' },

  rowRight: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  btn: { backgroundColor: THEME.secondary, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  btnGhostText: { color: '#333' },
});
