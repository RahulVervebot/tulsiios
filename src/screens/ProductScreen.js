import React, { useEffect, useMemo, useState, useContext, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Image,
} from "react-native";
import CustomHeader from "../components/CustomHeader";
import ProductSearch from "../components/ProductSearch";
import ProductList from "../components/ProductList";
import CreateProductModal from "../components/CreateProductModal";
import { getTopCategories, looksLikeSvg, capitalizeWords } from "../functions/product-function";
import CategoriesRow from "../components/CategoriesRow";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CartContext } from "../context/CartContext";
import { PrintContext } from "../context/PrintContext";
import { SvgUri } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import PrinterIcon from '../assets/icons/Printericon.svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Tab button supporting SVG or raster icon

function TabButton({ label, iconUri, active, onPress, activeColor, inactiveColor = "#fff" }) {
  const iconSize = 20;
  const tint = active ? activeColor : inactiveColor;
  const isSvg = looksLikeSvg(iconUri || "");
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      {iconUri ? (
        isSvg ? (
          <SvgUri uri={iconUri} width={iconSize} height={iconSize} fill={tint} />
        ) : (
          <Image source={{ uri: iconUri }} style={{ width: iconSize, height: iconSize, tintColor: tint }} />
        )
      ) : null}
      <Text style={[styles.tabText, { color: tint }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ProductScreen() {
  const HEADER_FALLBACK = "#ffffff";
  const navigation = useNavigation();
  const [headerBg, setHeaderBg] = useState({ type: "color", value: HEADER_FALLBACK });
  const [showCreate, setShowCreate] = useState(false);
  const [isProductEditPermission, setIsProductEditPermission] = useState(false);
  // Loader state
  const [showScreen, setShowScreen] = useState(false);
  const [showdefaulttopbanner, setShowDefaultTopBanner] = useState('');
    const [showdefaultbottombanner, setShowDefaultBottomBanner] = useState('');
  const insets = useSafeAreaInsets();
  const tabBarOffset = 84 + insets.bottom;
  const { cart } = useContext(CartContext);
  const { print } = useContext(PrintContext);
  
  const [address, setAdress] = useState("123 mg road");

  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState("");
 const [activeTabID, setActiveTabID] = useState("");
  
  const activeIconColor = "#fff";

  // Home pull-to-refresh state
  const [homeRefreshing, setHomeRefreshing] = useState(false);

  // Key to remount ProductList (so its useEffect runs even if category stays the same)
  const [listReloadKey, setListReloadKey] = useState(0);

  useEffect(() => {
    const loadHeader = async () => {
      try {
        const topBanner = await AsyncStorage.getItem('topabanner');

        if (topBanner) {
          setHeaderBg({ type: 'image', value: topBanner });
        } else {
          setHeaderBg({ type: 'color', value: HEADER_FALLBACK });
        }
      } catch (e) {
        setHeaderBg({ type: 'color', value: HEADER_FALLBACK });
      }
    };
    loadHeader();
  }, []);

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

  // Initial categories load (and hiding the loader video when done)
// replace your current useEffect body with this safer version
useEffect(() => {
  (async () => {
    try {
      setShowScreen(true);

      const [allRaw, bottomurl, topurl] = await Promise.all([
        getTopCategories().catch(() => null),
        AsyncStorage.getItem('bottombanner').catch(() => ''),
        AsyncStorage.getItem('topabanner').catch(() => ''),
      ]);
      setShowDefaultBottomBanner(bottomurl || '');
      setShowDefaultTopBanner(topurl || '');
      // Ensure we always work with an array
      const all = Array.isArray(allRaw) ? allRaw : [];
      const allCat = all.find(
        (c) => ((c?.category ?? '') + '').toLowerCase() === 'latest'
      );

      const others = all.filter(
        (c) => c?.toplist && ((c?.category ?? '') + '').toLowerCase() !== 'latest'
      );

      // Avoid .push and concat safely
      const ordered = (allCat ? [allCat] : []).concat(others || []);

      const normalized = ordered.map((c) => ({
        _id: c?._id ?? String(Math.random()),
        value: c?.category ?? '',
        label: capitalizeWords(String(c?.category ?? '')),
        // keep null if missing so we can guard at render
        topicon: c?.topicon ?? null,
        topbanner: c?.topbanner ?? null,
        topbannerbottom: c?.topBannerBottom ?? null,
      }));

      setTabs(normalized);

      if (normalized.length > 0) {
        // make sure previously active still exists, else pick first
        setActiveTab((prev) =>
          prev && normalized.some((t) => t.value === prev) ? prev : normalized[0].value
        );
        setActiveTabID((prev) =>
          prev && normalized.some((t) => t._id === prev) ? prev : normalized[0]._id
        );
      } else {
        setActiveTab('');
        setActiveTabID('');
      }
    } catch (e) {
      console.log('Failed to load categories:', e?.message);
      setTabs([]);
      setActiveTab('');
      setActiveTabID('');
    } finally {
      setShowScreen(false);
    }
  })();
}, []);

  const currentTab = useMemo(() => tabs.find((t) => t.value === activeTab), [tabs, activeTab]);

  // Home pull-to-refresh handler:
  // 1) Show top spinner
  // 2) Remount ProductList via key so it re-fetches (no changes to ProductList needed)
  const onHomeRefresh = useCallback(async () => {
    try {
      setHomeRefreshing(true);
      // Small tick to ensure remount & re-run of ProductList useEffect
      setListReloadKey((k) => k + 1);
      // Optional tiny delay so spinner is visible even if fetch is very fast
      await new Promise((r) => setTimeout(r, 350));
    } finally {
      setHomeRefreshing(false);
    }
  }, []);

  return (
    <SafeAreaView
      edges={["left", "right"]}
      style={{
        flex: 1,
        backgroundColor: headerBg.type === "color" ? headerBg.value : "#319241",
      }}
    >
      <StatusBar
        backgroundColor={headerBg.type === "color" ? headerBg.value : "transparent"}
        barStyle={headerBg.type === "image" ? "light-content" : "dark-content"}
        translucent={headerBg.type === "image"}
      />

      <CustomHeader backgroundType={headerBg.type} backgroundValue={headerBg.value}>
  <View style={{ overflow: 'visible', zIndex: 999, elevation: 9999 }}>
  <ProductSearch />
</View>

      </CustomHeader>

      <View style={styles.content}>
        <View style={styles.listArea}>
          <CategoriesRow />
         </View>

        {/* ✅ Global floating cart overlay */}
        {cart.length > 0 && (
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            <TouchableOpacity
              onPress={() => navigation.navigate("Cart")}
              style={{
                alignSelf: "flex-end",
                marginRight: 16,
                marginBottom: tabBarOffset,
                backgroundColor: "#2c1e70",
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
              <Text style={{ color: "#fff", fontWeight: "700" }}>🛒 {cart.length}</Text>
            </TouchableOpacity>
          </View>
        )}

         {/* ✅ Global floating Print overlay */}
        {print.length > 0 && (
         
                  
            <TouchableOpacity
              onPress={() => navigation.navigate("PrintScreen")}
               activeOpacity={0.85}
           style={[styles.createPrint, { bottom: 16 + insets.bottom }]}
            >
            <PrinterIcon width={20} height={20} fill={"#fff"}/>
             <Text style={{ color: "#fff", fontWeight: "700" }}> {print.length}</Text>
            </TouchableOpacity>
     
        )}

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
          onCreated={() => {
            setShowCreate(false);
            setListReloadKey((k) => k + 1);
          }}
        />
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loaderWrap: {
    flex: 1,
    backgroundColor: "black",
  },
  video: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "transparent",
    paddingVertical: 8,
  },
  tab: {
    backgroundColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: "#ffffff33",
  },
  tabText: {
    fontWeight: "800",
    fontSize: 14,
    color: "#fff"
  },
  content: { flex: 1, },
  listArea: {
    flex: 1,
    backgroundColor: "#E9FDEB",
    borderTopRightRadius: 18,
    borderTopLeftRadius: 18,
    paddingBottom: 12,
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
   createPrint: {
    flexDirection: "row",
    position: "absolute",
    left: 16,
    width: 54,
    height: 40,
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
