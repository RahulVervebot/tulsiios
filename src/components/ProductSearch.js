// src/components/ProductSearch.js
import React, { useState, useRef, useEffect, useContext } from "react";
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Dimensions,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { Camera, CameraType } from "react-native-camera-kit";
import { check, request, PERMISSIONS, RESULTS } from "react-native-permissions";
import { CartContext } from "../context/CartContext";
import { PrintContext } from "../context/PrintContext";
import ProductModal from "./ProductModal";
import VariantModal from "./VariantModal";
import VariantProductModal from "./VariantProductModal";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PLACEHOLDER = "#9AA3AF";
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function ProductSearch() {
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState([]);
  const [areResultsVariants, setAreResultsVariants] = useState(false);
  const typingTimeout = useRef(null);

  const { addToCart } = useContext(CartContext);
  const { addToPrint } = useContext(PrintContext);

  const [scannerVisible, setScannerVisible] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const cameraRef = useRef(null);
  const isHandlingScanRef = useRef(false);
  const [torchOn, setTorchOn] = useState(false);
  const [access_token, setAccessToken] = useState("");
  const [storeURL, setStoreurl] = useState("");

  const [searchBoxLayout, setSearchBoxLayout] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const searchRowRef = useRef(null);
  const sheetRef = useRef(null);
  const variantModalRef = useRef(null);
  const variantProductModalRef = useRef(null);

  useEffect(() => {
    (async () => {
      let result;
      const storeulr = await AsyncStorage.getItem("storeurl");
      const token = await AsyncStorage.getItem("access_token");

      setAccessToken(token || "");
      setStoreurl(storeulr || "");

      if (Platform.OS === "ios") {
        result = await request(PERMISSIONS.IOS.CAMERA);
      } else {
        result = await request(PERMISSIONS.ANDROID.CAMERA);
      }
      setHasCameraPermission(result === RESULTS.GRANTED);
    })();
  }, []);

  const measureSearchBox = () => {
    requestAnimationFrame(() => {
      searchRowRef.current?.measureInWindow((x, y, width, height) => {
        setSearchBoxLayout({ x, y, width, height });
      });
    });
  };

  const handleSearch = (text) => {
    setSearchText(text);

    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    if (!text || text.trim().length === 0) {
      setResults([]);
      setAreResultsVariants(false);
      return;
    }

    typingTimeout.current = setTimeout(async () => {
      if (text.trim().length >= 3) {
        try {
          // Get fresh tokens from AsyncStorage
          const token = await AsyncStorage.getItem("access_token");
          const url = await AsyncStorage.getItem("storeurl");
          
          if (!token || !url) {
            console.error("❌ Missing token or URL");
            Alert.alert("Error", "Please login again");
            return;
          }

          measureSearchBox();
          
          console.log("🔍 Search URL:", `${url}/pos/app/product/search?query=${text}`);
          console.log("🔑 Token:", token ? "Present" : "Missing");

          const res = await fetch(
            `${url}/pos/app/product/search?query=${encodeURIComponent(text)}`,
            {
              method: "GET",
              headers: {
                accept: "application/json",
                access_token: token,
                credentials: 'omit',
               Cookie: 'session_id',
              },
            }
          );

          console.log("📡 Response status:", res.status);

          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            console.error("❌ Response error:", txt);
            throw new Error(`Failed to fetch products (${res.status}): ${txt || "No details"}`);
          }
          const json = await res.json();
          
          // Check if first product has variants array
          let list = [];
          let isVariantList = false;
          if (Array.isArray(json?.products) && json.products.length > 0) {
            const firstProduct = json.products[0];
            if (Array.isArray(firstProduct?.variants) && firstProduct.variants.length > 0) {
              // Show variants instead of the parent product
              list = firstProduct.variants;
              isVariantList = true;
            } else {
              // Show regular products
              list = json.products;
              isVariantList = false;
            }
          }
          
          console.log("📦 Products/Variants found:", list.length, "| IsVariants:", isVariantList);
          setResults(list);
          setAreResultsVariants(isVariantList);
        } catch (err) {
          console.error("❌ Search error:", err?.message);
          setResults([]);
          setAreResultsVariants(false);
        }
      } else {
        setResults([]);
        setAreResultsVariants(false);
      }
    }, 500);
  };

const runQueryWithBarcode = async (barcode) => {
  if (isHandlingScanRef.current) return;
  isHandlingScanRef.current = true;

  setScannerVisible(false);

  const searchProduct = async (query) => {
    const res = await fetch(
      `${storeURL}/pos/app/product/search?query=${encodeURIComponent(query)}`,
      {
        method: "GET",
        headers: {
          access_token: access_token,
          accept: "application/json",
          credentials: 'omit',
          Cookie: 'session_id',
        },
      }
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Failed to fetch products (${res.status}): ${txt || "No details"}`);
    }

    const json = await res.json();
    console.log("🔍 Barcode search response:", json);
    
    return json;
  };

  try {
    const originalBarcode = String(barcode || "").trim();
    if (!originalBarcode) {
      Alert.alert("Not found", "Invalid barcode.");
      return;
    }

    const attempts = [];
    const tried = new Set();

    // 1. original barcode
    attempts.push(originalBarcode);

    // 2. if starts with 0, remove first zero
    if (originalBarcode.startsWith("0") && originalBarcode.length > 1) {
      attempts.push(originalBarcode.slice(1));
    }

    // 3. remove last digit
    if (originalBarcode.length > 1) {
      attempts.push(originalBarcode.slice(0, -1));
    }

    // 4. remove first and last digit
    if (originalBarcode.length > 2) {
      attempts.push(originalBarcode.slice(1, -1));
    }

    let foundList = [];
    let matchedBarcode = originalBarcode;
    let hasVariants = false;

    for (const attempt of attempts) {
      const cleaned = String(attempt || "").trim();
      if (!cleaned || tried.has(cleaned)) continue;

      tried.add(cleaned);

      const result = await searchProduct(cleaned);
      
      // Check if products array exists and has items
      if (Array.isArray(result?.products) && result.products.length > 0) {
        const firstProduct = result.products[0];
        
        // Check if first product has variants array
        if (Array.isArray(firstProduct?.variants) && firstProduct.variants.length > 0) {
          foundList = firstProduct.variants;
          hasVariants = true;
        } else {
          foundList = result.products;
          hasVariants = false;
        }
        
        matchedBarcode = cleaned;
        break;
      }
    }

    if (foundList.length === 0) {
      Alert.alert("Not found", "No product matched this barcode.");
    } else if (hasVariants || foundList.length > 1) {
      // Show variant selection modal if variants exist or multiple products found
      setResults([]);
      setSearchText(matchedBarcode);
      setTimeout(() => {
        variantModalRef.current?.open(foundList, (selectedProduct) => {
          // Open VariantProductModal for variant products
          variantProductModalRef.current?.open(selectedProduct);
        });
      }, 180);
    } else {
      // Single product found - check if it's a variant and open appropriate modal
      setResults([]);
      setSearchText(matchedBarcode);
      setTimeout(() => {
        if (hasVariants) {
          variantProductModalRef.current?.open(foundList[0]);
        } else {
          sheetRef.current?.open(foundList[0]);
        }
      }, 180);
    }
  } catch (err) {
    console.error("❌ Barcode search error:", err?.message);
    Alert.alert("Error", "Could not fetch product for this barcode.");
  } finally {
    setTimeout(() => {
      isHandlingScanRef.current = false;
    }, 600);
  }
};

  const onReadCode = (event) => {
    const value = event?.nativeEvent?.codeStringValue;
    if (value) runQueryWithBarcode(value);
  };

  const openScanner = async () => {
    try {
      const perm =
        Platform.OS === "ios" ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;

      let result = await check(perm);
      if (result !== RESULTS.GRANTED) {
        result = await request(perm);
      }

      const granted = result === RESULTS.GRANTED;
      setHasCameraPermission(granted);

      if (!granted) {
        Alert.alert(
          "Camera Permission",
          "Camera access is required to scan barcodes. Please enable it in settings."
        );
        return;
      }

      setScannerVisible(true);
    } catch (error) {
      console.warn("Open scanner error:", error);
      Alert.alert("Camera", "Unable to open scanner right now.");
    }
  };

  const takePicture = async () => {
    try {
      if (!cameraRef.current) return;
      const photo = await cameraRef.current.capture();
      Alert.alert("Photo captured", photo?.uri || "No URI");
    } catch (e) {
      console.error("❌ capture error:", e?.message);
    }
  };

  const onAddToCart = (product) => {
    if (!product) return;
    addToCart(product);
    Alert.alert("Added", "Item added to cart.");
  };

  const onAddToPrint = (product) => {
    if (!product) return;
    addToPrint(product);
    Alert.alert("Added", "Item added to print list.");
  };

  const openSheetFor = (item) => {
    setResults([]);
    // Check if the current results are from variants array
    if (areResultsVariants) {
      variantProductModalRef.current?.open(item);
    } else {
      sheetRef.current?.open(item);
    }
  };

  const showDropdown = results.length > 0 && searchText.trim().length >= 3;

  const dropdownTop = searchBoxLayout.y + searchBoxLayout.height + 6;
  const dropdownLeft = searchBoxLayout.x;
  const dropdownWidth = searchBoxLayout.width || SCREEN_WIDTH - 32;
  const dropdownMaxHeight = Math.min(260, SCREEN_HEIGHT - dropdownTop - 20);

  return (
    <View style={styles.container}>
      <View
        ref={searchRowRef}
        style={styles.searchRow}
        onLayout={measureSearchBox}
      >
        <TextInput
          style={styles.input}
          placeholder="Search by name, barcode, or category..."
          placeholderTextColor={PLACEHOLDER}
          value={searchText}
          onChangeText={handleSearch}
          onFocus={measureSearchBox}
        />
        <TouchableOpacity onPress={openScanner}>
          <Icon name="camera-alt" size={28} color="#333" />
        </TouchableOpacity>
      </View>

      {/* Search result overlay in Modal */}
      <Modal
        visible={showDropdown}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setResults([])}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setResults([])}>
          <View />
        </Pressable>

        <View
          style={[
            styles.resultsOverlay,
            {
              top: dropdownTop,
              left: dropdownLeft,
              width: dropdownWidth,
              maxHeight: dropdownMaxHeight,
            },
          ]}
        >
          <ScrollView
            style={{ maxHeight: dropdownMaxHeight }}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {results.map((item, idx) => (
              <TouchableOpacity
                key={item?._id || item?.product_id || String(idx)}
                activeOpacity={0.8}
                onPress={() => openSheetFor(item)}
              >
                <View style={styles.resultItem}>
                  <View style={styles.resultTitleRow}>
                    <Text style={styles.resultTitle} numberOfLines={1}>
                      {item?.productName}
                    </Text>
                    <Text style={styles.resultPrice}>₹{Number(item?.salePrice || 0).toFixed(2)}</Text>
                  </View>
                  <Text style={styles.resultMeta} numberOfLines={1}>
                    {item?.category}
                    {item?.barcode ? ` • ${item.barcode}` : ""}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Scanner Modal */}
      <Modal
        visible={scannerVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
      >
        {hasCameraPermission ? (
          <View style={styles.scannerRoot}>
            <Camera
              ref={cameraRef}
              style={styles.camera}
              cameraType={CameraType.Back}
              scanBarcode
              onReadCode={onReadCode}
              flashMode={torchOn ? "on" : "off"}
            />

            <View pointerEvents="none" style={styles.scannerFrameWrap}>
              <View style={styles.scannerFrame} />
            </View>

            <View style={styles.controls}>
              <TouchableOpacity
                style={[styles.controlBtn, { marginRight: 10 }]}
                onPress={() => setTorchOn((t) => !t)}
              >
                <Text style={styles.controlText}>
                  {torchOn ? "Torch Off" : "Torch On"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.controlBtn, { marginRight: 10 }]}
                onPress={takePicture}
              >
                <Text style={styles.controlText}>Capture</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.controlBtn}
                onPress={() => setScannerVisible(false)}
              >
                <Text style={styles.controlText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.permissionDenied}>
            <Text style={{ color: "red" }}>
              Camera permission denied. Please allow access in settings.
            </Text>
            <TouchableOpacity
              style={[styles.controlBtn, { marginTop: 16 }]}
              onPress={() => setScannerVisible(false)}
            >
              <Text style={styles.controlText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>

      <ProductModal
        ref={sheetRef}
        onAddToCart={(p) => onAddToCart(p)}
        onAddToPrint={(p) => onAddToPrint(p)}
      />

      <VariantModal ref={variantModalRef} />
      
      <VariantProductModal
        ref={variantProductModalRef}
        onAddToCart={(p) => onAddToCart(p)}
        onAddToPrint={(p) => onAddToPrint(p)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 16,
    paddingBottom: 16,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    minHeight: 48,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    color: "#111",
  },

  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },
  resultsOverlay: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 20,
    zIndex: 9999,
    overflow: "hidden",
  },
  resultItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
    backgroundColor: "#fff",
  },
  resultTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  resultTitle: {
    fontWeight: "600",
    color: "#111",
    flex: 1,
    marginRight: 8,
  },
  resultPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#16A34A",
  },
  resultMeta: {
    color: "#666",
    marginTop: 2,
  },

  scannerRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
    backgroundColor: "#000",
  },
  scannerFrameWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  scannerFrame: {
    width: 260,
    height: 180,
    borderWidth: 2,
    borderColor: "#A3E635",
    borderRadius: 18,
    backgroundColor: "transparent",
  },
  controls: {
    position: "absolute",
    bottom: 30,
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  controlBtn: {
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  controlText: {
    color: "#fff",
    fontWeight: "600",
  },
  permissionDenied: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
});