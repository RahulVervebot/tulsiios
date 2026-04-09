import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getTopCategories, capitalizeWords } from '../functions/product-function';

const countFromCategory = (c) =>
  c?.totalAvailableInPOSProducts ??
  '00';

export default function CategoriesRow() {
  const navigation = useNavigation();
  const [allCats, setAllCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bottomBanner, setBottomBanner] = useState('');
  const [search, setSearch] = useState('');

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      const cats = await getTopCategories();
      const bb = await AsyncStorage.getItem('bottombanner');
      setBottomBanner(bb || '');
      setAllCats(Array.isArray(cats) ? cats : []);
    } catch (e) {
      console.log('Failed to fetch categories:', e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Run when component mounts
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Run every time screen is focused
  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [loadCategories])
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const sorted = [...allCats].sort((a, b) =>
      String(a?.category || a?.categoryName || '').localeCompare(
        String(b?.category || b?.categoryName || '')
      )
    );
    if (!term) return sorted;
    return sorted.filter((c) =>
      String(c?.category || c?.categoryName || '')
        .toLowerCase()
        .includes(term)
    );
  }, [allCats, search]);

  const goToCategory = useCallback(
    (cat) => {
      navigation.navigate('CategoryProducts', {
        id: String(cat._id),
        category: cat.category,
        backgroundUri: cat.topbannerbottom || bottomBanner,
      });
    },
    [navigation, bottomBanner]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={{ color: '#666', marginTop: 6 }}>Loading categories…</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Categories</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search"
          placeholderTextColor="#9CA3AF"
          style={styles.searchInput}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item._id || item.category)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => goToCategory(item)}
          >
            <Text style={styles.cardTitle} numberOfLines={1}>
              {capitalizeWords(item.category)}
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{String(countFromCategory(item))}</Text>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ color: '#666' }}>No categories found.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#E9FDEB',
    borderRadius: 20,
    padding: 14,
    
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
  searchInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: '#111',
    minWidth: 120,
  },
  listContent: { gap: 10, paddingBottom: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#222' },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E9FDEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#000', fontWeight: '800', fontSize: 14 },
  center: { justifyContent: 'center', alignItems: 'center', paddingVertical: 16 },
});
