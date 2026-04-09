import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Image,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import AppHeader from '../components/AppHeader';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import reportbg from '../assets/images/report-bg.png';
import CreateCategoryModal from './CreateCategoryModal';
const STORE_URL_KEY = 'storeurl';
const ACCESS_TOKEN_KEY = 'access_token';

export default function CategoryListScreen() {
  const navigation = useNavigation();
  const [storeUrl, setStoreUrl] = useState('');
  const [token, setToken] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState([]);
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState(''); // NEW

  const [modalVisible, setModalVisible] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [originalCat, setOriginalCat] = useState(null);

  const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

  useEffect(() => {
    (async () => {
      try {
        const s = await AsyncStorage.getItem(STORE_URL_KEY);
        const t = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
        if (!s || !t) {
          Alert.alert('Missing config', 'store_url or access_token not found in AsyncStorage.');
          return;
        }
        setStoreUrl(s);
        setToken(t);
      } catch {
        Alert.alert('Error', 'Failed to read credentials.');
      }
    })();
  }, []);

  const fetchCategories = useCallback(async () => {
    if (!storeUrl || !token) return;
    try {
      const url = `${storeUrl}/pos/app/categories`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json', access_token: token },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setCategories(Array.isArray(json?.categories) ? json.categories : []);
    } catch (err) {
      Alert.alert('Fetch error', String(err?.message || err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeUrl, token]);

  useEffect(() => {
    if (storeUrl && token) fetchCategories();
  }, [storeUrl, token, fetchCategories]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCategories();
  };

  // ---- SORT + FILTER (alphabetic order) ----
  const filteredSortedCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = categories.filter((c) => {
      const name = (c?.categoryName || '').toLowerCase();
      return !q || name.includes(q);
    });
    return list.sort((a, b) => {
      const an = (a?.categoryName || '').toLowerCase();
      const bn = (b?.categoryName || '').toLowerCase();
      return an.localeCompare(bn, undefined, { sensitivity: 'base' });
    });
  }, [categories, searchQuery]);

  // ---- Permissions / pickers (unchanged) ----
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
    const result = await request(perm);
    if (result === RESULTS.GRANTED) return true;
    if (Platform.OS === 'android') {
      const legacy = await request(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
      return legacy === RESULTS.GRANTED;
    }
    return false;
  };
  const pickFromLibrary = async (fieldKey) => {
    const ok = await requestGalleryPerm();
    if (!ok) return Alert.alert('Permission', 'Gallery permission denied.');
    const res = await launchImageLibrary({ mediaType: 'photo', includeBase64: true, selectionLimit: 1, quality: 0.8 });
    if (res?.didCancel) return;
    const asset = res?.assets?.[0];
    if (!asset?.base64) return Alert.alert('Error', 'Could not read image.');
    setEditCat((prev) => ({ ...prev, [fieldKey]: asset.base64 }));
  };
  const captureFromCamera = async (fieldKey) => {
    const ok = await requestCameraPerm();
    if (!ok) return Alert.alert('Permission', 'Camera permission denied.');
    const res = await launchCamera({ mediaType: 'photo', includeBase64: true, quality: 0.8, saveToPhotos: false });
    if (res?.didCancel) return;
    const asset = res?.assets?.[0];
    if (!asset?.base64) return Alert.alert('Error', 'Could not capture image.');
    setEditCat((prev) => ({ ...prev, [fieldKey]: asset.base64 }));
  };

  const openModal = (item) => {
    const normalized = {
      id: item.id,
      categoryName: item.categoryName ?? '',
      categoryMargin: String(item.categoryMargin ?? 0),
      categoryMarkup: String(item.categoryMarkup ?? 0),
      categoryPP: String(item.categoryPP ?? item.categoryPp ?? item.categoryProfitPercentage ?? 0),
      topList: !!item.topList,
      image: item.image ?? null,
      topIcon: item.topIcon ?? null,
      topBanner: item.topBanner ?? null,
      topBannerBottom: item.topBannerBottom ?? null,
    };
    setEditCat(normalized);
    setOriginalCat(normalized);
    setModalVisible(true);
      console.log("categ iutem:",item);
  };

  const isPositive = (v) => Number(v || 0) > 0;
  const handlePricingInput = (field, value) => {
    const nextValue = value ?? '0';
    setEditCat((prev) => {
      if (!prev) return prev;
      if (field === 'categoryMargin') {
        return {
          ...prev,
          categoryMargin: nextValue,
          ...(isPositive(nextValue) ? { categoryMarkup: '0', categoryPP: '0' } : {}),
        };
      }
      if (field === 'categoryMarkup') {
        return {
          ...prev,
          categoryMarkup: nextValue,
          ...(isPositive(nextValue) ? { categoryMargin: '0', categoryPP: '0' } : {}),
        };
      }
      return {
        ...prev,
        categoryPP: nextValue,
        ...(isPositive(nextValue) ? { categoryMargin: '0', categoryMarkup: '0' } : {}),
      };
    });
  };


  const closeModal = () => {
    setModalVisible(false);
    setEditCat(null);
    setOriginalCat(null);
  };

  const handleUpdateChanges = async () => {
    if (!editCat?.id) return;
    try {
      const url = `${storeUrl}/pos/app/category/update/${editCat.id}`;
      const body = {};

      const toNum = (v) => Number(v || 0);
      if ((editCat.categoryName ?? '') !== (originalCat?.categoryName ?? '')) {
        body.categoryName = editCat.categoryName;
      }
      if (toNum(editCat.categoryMargin) !== toNum(originalCat?.categoryMargin)) {
        body.categoryMargin = toNum(editCat.categoryMargin);
      }
      if (toNum(editCat.categoryMarkup) !== toNum(originalCat?.categoryMarkup)) {
        body.categoryMarkup = toNum(editCat.categoryMarkup);
      }
      if (toNum(editCat.categoryPP) !== toNum(originalCat?.categoryPP)) {
        body.categoryPP = toNum(editCat.categoryPP);
      }
      if (toNum(editCat.categoryMargin) > 0) {
        body.categoryMarkup = 0;
        body.categoryPP = 0;
      } else if (toNum(editCat.categoryMarkup) > 0) {
        body.categoryMargin = 0;
        body.categoryPP = 0;
      } else if (toNum(editCat.categoryPP) > 0) {
        body.categoryMargin = 0;
        body.categoryMarkup = 0;
      }
      if (!!editCat.topList !== !!originalCat?.topList) {
        body.topList = !!editCat.topList;
      }
      if ((editCat.image || null) !== (originalCat?.image || null)) {
        body.image = editCat.image || null;
      }
      if ((editCat.topIcon || null) !== (originalCat?.topIcon || null)) {
        body.topIcon = editCat.topIcon || null;
      }
      if ((editCat.topBanner || null) !== (originalCat?.topBanner || null)) {
        body.topBanner = editCat.topBanner || null;
      }
      if ((editCat.topBannerBottom || null) !== (originalCat?.topBannerBottom || null)) {
        body.topBannerBottom = editCat.topBannerBottom || null;
      }

      if (!Object.keys(body).length) {
        Alert.alert('No changes', 'There is nothing to update.');
        return;
      }

      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', access_token: token },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      Alert.alert('Success', 'Category updated successfully.');
      fetchCategories();
      closeModal();
    } catch (err) {
      Alert.alert('Update error', String(err?.message || err));
    }
  };

  const asDataUri = (b64) => (b64 ? `data:image/*;base64,${b64}` : null);

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.item} onPress={() => openModal(item)} activeOpacity={0.85}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle} numberOfLines={1}>{item.categoryName || '—'}</Text>
        <Text style={styles.itemSub}>ID: {item.id}{item.parentId ? ` • Parent: ${item.parentId}` : ''}</Text>
      </View>
      <Text style={styles.itemLink}>Edit</Text>
    </TouchableOpacity>
  );

  return (
    <ImageBackground source={getImageSource(reportbg)} style={styles.screen} resizeMode="cover">
      <View style={styles.backdrop} />
      <AppHeader Title="CATEGORY LIST" backgroundType="image" backgroundValue={reportbg} />

      <View style={styles.container}>
        {/* Search Box */}
        <View style={styles.searchWrap}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search categories..."
            placeholderTextColor="#9CA3AF"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Loading categories…</Text>
          </View>
        ) : (
          <FlatList
            data={filteredSortedCategories}
            keyExtractor={(it) => String(it.id)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshing={refreshing}
            onRefresh={onRefresh}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>No categories found.</Text>
              </View>
            }
          />
        )}
  
      </View>
          <View
                pointerEvents="box-none"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 70,
                }}
              >
                <TouchableOpacity
                  onPress={() => setShowCreate(true)}
                  style={{
                    alignSelf: "flex-end",
                    marginRight: 16,
                    marginBottom: 12 + insets.bottom,
                    backgroundColor: "#319241",
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 30,
                    elevation: 6,
                    shadowColor: "#000",
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                    zIndex: 9999,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Create Category +</Text>
                </TouchableOpacity>
              </View>

 <CreateCategoryModal
  visible={showCreate}
  onClose={() => setShowCreate(false)}
  onCreated={() => {
   fetchCategories();
  }}
/>
      {/* Responsive, scrollable modal (from previous message) */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalWrap}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKeyboard}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Update Category</Text>
                  <Text style={styles.modalSub}>ID: {editCat?.id}</Text>
                </View>
                <TouchableOpacity style={styles.closeBtn} onPress={closeModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.closeX}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
                <View style={styles.sectionCard}>
                <Text style={styles.label}>Category Name</Text>
                <TextInput
                  value={editCat?.categoryName ?? ''}
                  onChangeText={(v) => setEditCat((p) => ({ ...p, categoryName: v }))}
                  placeholder="Enter category name"
                  style={styles.input}
                  returnKeyType="done"
                />
                </View>

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Pricing Controls</Text>
                  <View style={styles.gridRow}>
                    <View style={styles.gridCol}>
                      <Text style={styles.label}>Add Margin</Text>
                      <TextInput
                        value={String(editCat?.categoryMargin ?? '0')}
                        onChangeText={(v) => handlePricingInput('categoryMargin', v)}
                        placeholder="0"
                        keyboardType="decimal-pad"
                        style={styles.input}
                        returnKeyType="done"
                      />
                    </View>
                    <View style={styles.gridCol}>
                      <Text style={styles.label}>Add Markup</Text>
                      <TextInput
                        value={String(editCat?.categoryMarkup ?? '0')}
                        onChangeText={(v) => handlePricingInput('categoryMarkup', v)}
                        placeholder="0"
                        keyboardType="decimal-pad"
                        style={styles.input}
                        returnKeyType="done"
                      />
                    </View>
                  </View>
                  <View style={styles.gridRow}>
                    <View style={styles.gridCol}>
                      <Text style={styles.label}>Add Profit Percentage</Text>
                      <TextInput
                        value={String(editCat?.categoryPP ?? '0')}
                        onChangeText={(v) => handlePricingInput('categoryPP', v)}
                        placeholder="0"
                        keyboardType="decimal-pad"
                        style={styles.input}
                        returnKeyType="done"
                      />
                    </View>
                  </View>
                </View>

                {/* <View style={styles.rowBetween}>
                  <Text style={styles.label}>Top List</Text>
                  <TouchableOpacity
                    style={[styles.pillSwitch, editCat?.topList ? styles.pillOn : styles.pillOff]}
                    onPress={() => setEditCat((p) => ({ ...p, topList: !p.topList }))}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.pillText}>{editCat?.topList ? 'ON' : 'OFF'}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.btnPrimary} onPress={() => updateField('topList')}>
                  <Text style={styles.btnText}>Update Top List</Text>
                </TouchableOpacity> */}

                {[
                  { key: 'image', title: 'Image' },
                  // { key: 'topIcon', title: 'Top Icon' },
                  // { key: 'topBanner', title: 'Top Banner' },
                  // { key: 'topBannerBottom', title: 'Top Banner Bottom' },
                ].map(({ key, title }) => {
                  const base64 = editCat?.[key];
                  const preview = asDataUri(base64);
                  return (
                    <View key={key} style={styles.mediaBlock}>
                      <Text style={styles.sectionTitle}>{title}</Text>
                      {preview ? (
                        <Image source={{ uri: preview }} style={styles.preview} resizeMode="cover" />
                      ) : (
                        <View style={[styles.preview, styles.previewEmpty]}>
                          <Text style={styles.previewText}>No Image</Text>
                        </View>
                      )}

                      <View style={styles.rowBetween}>
                        <TouchableOpacity style={styles.btnOutline} onPress={() => pickFromLibrary(key)}>
                          <Text style={styles.btnOutlineText}>Gallery</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.btnOutline} onPress={() => captureFromCamera(key)}>
                          <Text style={styles.btnOutlineText}>Camera</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.btnGhost} onPress={() => setEditCat((p) => ({ ...p, [key]: null }))}>
                          <Text style={styles.btnGhostText}>Clear</Text>
                        </TouchableOpacity>
                      </View>

                    </View>
                  );
                })}
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity style={[styles.btnSecondary, styles.btnDanger]} onPress={closeModal}>
                  <Text style={styles.btnLightText}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnPrimaryFooter} onPress={handleUpdateChanges}>
                  <Text style={styles.btnLightText}>Update</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>


    </ImageBackground>
  );
}

const COLORS = {
  overlay: 'rgba(0,0,0,0.25)',
  card: 'rgba(255,255,255,0.92)',
  stroke: 'rgba(0,0,0,0.08)',
  text: '#111827',
  sub: '#6B7280',
  primary: '#319241',
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.overlay },
  container: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 12,
  },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.stroke,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    paddingVertical: 0,
  },
  clearBtn: { marginLeft: 8 },
  clearText: { fontSize: 16, color: COLORS.sub },

  center: { alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
  loadingText: { marginTop: 8, color: COLORS.sub },
  emptyText: { color: COLORS.sub },

  item: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.stroke,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  itemSub: { fontSize: 12, color: COLORS.sub, marginTop: 2 },
  itemLink: { color: COLORS.primary, fontWeight: '700' },

  // Modal (scrollable & responsive)
  modalWrap: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 20,
  },
  modalKeyboard: {
    width: '100%',
    maxWidth: 640,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    maxHeight: '95%',
    borderWidth: 1,
    borderColor: '#dbe3ea',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dbe3ea',
  },
  closeX: { fontSize: 18, color: '#6B7280', lineHeight: 20 },
  modalScroll: { maxHeight: '100%' },
  modalFooter: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.stroke,
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexDirection: 'row',
    gap: 10,
  },

  modalTitle: { fontSize: 19, fontWeight: '800', color: COLORS.text },
  modalSub: { fontSize: 12, color: COLORS.sub, marginTop: 2 },

  sectionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e4e9f1',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 6,
  },
  label: { fontSize: 13, color: COLORS.text, fontWeight: '700', marginTop: 6, marginBottom: 6 },
  input: {
    backgroundColor: '#F9FBFD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderWidth: 1,
    borderColor: '#d8e1eb',
    color: COLORS.text,
  },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gridCol: {
    flex: 1,
  },

  pillSwitch: { minWidth: 70, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, marginTop:10 },
  pillOn: { backgroundColor: "#22C063" },
  pillOff: { backgroundColor: '#e5e7eb' },
  pillText: { color: '#fff', fontWeight: '800' },

  mediaBlock: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e4e9f1',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
  },
  preview: { width: '100%', height: 150, borderRadius: 10, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.stroke },
  previewEmpty: { alignItems: 'center', justifyContent: 'center' },
  previewText: { color: COLORS.sub },

  btnPrimary: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  btnText: { color: '#fff', fontWeight: '800' },
  btnOutline: { marginTop: 8, borderWidth: 1, borderColor: COLORS.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#fff' },
  btnOutlineText: { color: COLORS.primary, fontWeight: '800' },
  btnGhost: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 14 },
  btnGhostText: { color: COLORS.sub, fontWeight: '700' },
  btnSecondary: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  btnDanger: {
    backgroundColor: '#DC2626',
  },
  btnPrimaryFooter: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  btnLightText: { color: '#fff', fontWeight: '800', letterSpacing: 0.3 },
});
