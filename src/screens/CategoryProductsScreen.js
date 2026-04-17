// src/screens/CategoryProductsScreen.js
// src/screens/CategoryProductsScreen.js
import React, { useState, useEffect } from "react";
import { View, StyleSheet, ImageBackground, TouchableOpacity, Text } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import CategoryProductList from "../components/CategoryProductList";
import ProductSearch from "../components/ProductSearch";
import reportbg from '../assets/images/report-bg.png';
import AppHeader from "../components/AppHeader"; 
import {capitalizeWords} from '../functions/product-function';
import CreateProductModal from "../components/CreateProductModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
export default function CategoryProductsScreen({ route }) {
  const { id, category, backgroundUri } = route.params || {};
  const insets = useSafeAreaInsets();
  const [showCreate, setShowCreate] = useState(false);
  const [listReloadKey, setListReloadKey] = useState(0);
  const [isProductEditPermission, setIsProductEditPermission] = useState(false);

  useEffect(() => {
    const loadPermission = async () => {
      try {
        const editPerm = await AsyncStorage.getItem('is_product_edit_permission_in_app');
        setIsProductEditPermission(editPerm === 'true');
      } catch (error) {
        console.log('Error loading product edit permission:', error);
      }
    };
    loadPermission();
  }, []);
  const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

  return (
    <ImageBackground source={getImageSource(reportbg)} style={styles.screen} resizeMode="cover">
      <AppHeader
        Title={category == 'latest' ? 'Latest Products' : capitalizeWords(String(category || ""))}
        backgroundType="image" backgroundValue={reportbg}>
        <View style={styles.searchbar}>
          <ProductSearch />
        </View>
      </AppHeader>
      <View style={styles.container}>
        <CategoryProductList
          key={`cat-list-${String(id || '')}-${listReloadKey}`}
          id={id}
          category={category}
          backgroundUri={backgroundUri}
        />
      </View>

      {isProductEditPermission && (
        <TouchableOpacity
          onPress={() => setShowCreate(true)}
          activeOpacity={0.85}
          style={[styles.createFab, { bottom: 16 + insets.bottom }]}
        >
          <Text style={styles.createFabText}>+</Text>
        </TouchableOpacity>
      )}

      {isProductEditPermission && (
        <CreateProductModal
          visible={showCreate}
          onClose={() => setShowCreate(false)}
          initialCategoryId={id}
          onCreated={() => {
            setShowCreate(false);
            setListReloadKey((k) => k + 1);
          }}
        />
      )}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: { flex: 1 },
  searchbar: { marginHorizontal: 25, overflow: 'visible', zIndex: 9999, elevation: 9999},
  createFab: {
    position: "absolute",
    right: 16,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#319241",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  createFabText: {
    color: "#fff",
    fontSize: 30,
    lineHeight: 32,
    fontWeight: "700",
    marginTop: -2,
  },
});
