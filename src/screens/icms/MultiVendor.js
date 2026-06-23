
import React, { useState, useEffect } from "react";
import { View, StyleSheet, ImageBackground, ScrollView, Text, FlatList } from "react-native";

import AsyncStorage from '@react-native-async-storage/async-storage';

import ProductSearchVendor from "../../components/ProductSearchVendor";

import reportbg from '../../assets/images/report-bg.png';

import AppHeader from "../../components/AppHeader"; 

import {capitalizeWords} from '../../functions/product-function';

import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function MultiVendor({ route }) {
  
  const { id, category, backgroundUri } = route.params || {};
  const insets = useSafeAreaInsets();
  const [showCreate, setShowCreate] = useState(false);
  const [listReloadKey, setListReloadKey] = useState(0);
  const [isProductEditPermission, setIsProductEditPermission] = useState(false);
  const [VendorData, setVendorData] = useState({
    onVendorSearchResults: handleVendorSearchResults
  });

  const [vendorResults, setVendorResults] = useState([]);
  const [selectedBarcode, setSelectedBarcode] = useState("");
  function handleVendorSearchResults(results, barcode) {
    console.log("✅ Vendor results received:", results);
    console.log("📦 Barcode:", barcode);
    setVendorResults(results);
    setSelectedBarcode(barcode);
  }
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

  const renderVendorItem = ({ item }) => (
    <View style={styles.vendorItem}>
      <View style={styles.vendorRow}>
        <View style={styles.vendorLabelContainer}>
          <Text style={styles.vendorLabel}>Vendor:</Text>
          <Text style={styles.vendorValue}>{item.Vendor || "N/A"}</Text>
        </View>
      </View>

      <View style={styles.infoGrid}>
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>Item</Text>
          <Text style={styles.infoValue}>{item.item || "N/A"}</Text>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>Cost</Text>
          <Text style={styles.infoValue}>₹{Number(item.Latest_Unit_Cost || 0).toFixed(2)}</Text>
        </View>
      </View>

      <View style={styles.detailsContainer}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Description:</Text>
          <Text style={styles.detailValue}>{item.Description || "N/A"}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Department:</Text>
          <Text style={styles.detailValue}>{item.Department || "N/A"}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Invoice #:</Text>
          <Text style={styles.detailValue}>{item.Invoice_Number || "N/A"}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Invoice Date:</Text>
          <Text style={styles.detailValue}>{item.Invoice_Date || "N/A"}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <ImageBackground source={getImageSource(reportbg)} style={styles.screen} resizeMode="cover">
      <AppHeader
        Title={category == 'latest' ? 'Latest Products' : capitalizeWords(String(category || ""))}
        backgroundType="image" backgroundValue={reportbg}>
        <View style={styles.searchbar}>
          <ProductSearchVendor
            VendorData={VendorData}
          />
        </View>
      </AppHeader>

      <View style={styles.container}>
        {vendorResults.length > 0 && (
          <View style={styles.resultsContainer}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>Vendor Results</Text>
              <Text style={styles.barcodeInfo}>Barcode: {selectedBarcode}</Text>
            </View>
            <FlatList
              data={vendorResults}
              renderItem={renderVendorItem}
              keyExtractor={(item, index) => `${item.Vendor}-${item.Barcode}-${index}`}
              scrollEnabled={true}
              contentContainerStyle={styles.listContent}
            />
          </View>
        )}
        {vendorResults.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Search for a product by barcode to see vendor options</Text>
          </View>
        )}
      </View>
    </ImageBackground>
  );
}
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: { 
    flex: 1, 
    backgroundColor: "#e6f6ec"
  },
  searchbar: { 
    marginHorizontal: 25, 
    overflow: 'visible', 
    zIndex: 9999, 
    elevation: 9999
  },
  resultsContainer: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
  },
  resultsHeader: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: "#319241",
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginBottom: 4,
  },
  barcodeInfo: {
    fontSize: 12,
    color: "#666",
    fontWeight: "500",
  },
  listContent: {
    paddingBottom: 16,
  },
  vendorItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: "#319241",
  },
  vendorRow: {
    marginBottom: 12,
  },
  vendorLabelContainer: {
    backgroundColor: "#f0fdf4",
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#319241",
  },
  vendorLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  vendorValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#319241",
    marginTop: 4,
  },
  infoGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  infoBox: {
    flex: 1,
    backgroundColor: "#f9fafb",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  infoLabel: {
    fontSize: 11,
    color: "#999",
    fontWeight: "600",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111",
  },
  detailsContainer: {
    gap: 8,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 6,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    width: 110,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: "500",
    color: "#111",
    flex: 1,
    textAlign: "right",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    fontWeight: "500",
  },
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