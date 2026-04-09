// src/components/ProductList.js
import React, { useEffect, useState, useContext, useRef, useMemo } from 'react';
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CartContext } from '../context/CartContext';
import { PrintContext } from '../context/PrintContext';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { archiveProduct, getCategoryProducts, getLatestProducts } from '../functions/product-function';
import ProductModal from './ProductModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PrinterIcon from '../assets/icons/Printericon.svg'; 
import CartIcon from "../assets/icons/Carticon.svg"

export default function CategoryProductList({ id, category, showFloatingCart = false }) {
  const navigation = useNavigation();
  const [products, setProducts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [archivingId, setArchivingId] = useState(null);
  const [userrole, setUserRole] = useState('');
  const { cart, addToCart, increaseQty, decreaseQty } = useContext(CartContext);
  const { print, addToPrint, increasePrintQty, decreasePrintQty, removeFromprint } = useContext(PrintContext);
  const sheetRef = useRef(null);

  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const COLS = isTablet ? 3 : 2;
  const GAP = isTablet ? 14 : 10;
  const H_PADDING = 12;
  const FLOATING_BOTTOM = isTablet ? 28 : 20;

  const CARD_WIDTH = useMemo(() => {
    const inner = width - H_PADDING * 2 - GAP * (COLS - 1);
    return Math.floor(inner / COLS);
  }, [width, COLS]);

  useEffect(() => {
    fetchProducts();
  }, [id]);

  const fetchProducts = async () => {
    try {
      const userRole = await AsyncStorage.getItem('userRole');
      setUserRole(userRole);
      setRefreshing(true);

      const data =
        category === 'latest'
          ? await getLatestProducts()
          : await getCategoryProducts(id);

      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log(`Failed to fetch products:`, err?.message);
      setProducts([]);
    } finally {
      setRefreshing(false);
    }
  };

  const openDetails = (item) => sheetRef.current?.open(item);

  const handleArchiveProduct = (item) => {
    const productId = Number(item?.product_id);

    Alert.alert(
      'Delete Product',
      `Do you want to delete ${item?.productName || 'this product'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setArchivingId(productId);
              await archiveProduct(productId);

              setProducts((prev) =>
                prev.filter((p) => Number(p?.product_id) !== productId)
              );

              Alert.alert('Success', 'Product deleted successfully.');
            } catch (error) {
              Alert.alert('Error', error?.message || 'Failed to delete.');
            } finally {
              setArchivingId(null);
            }
          },
        },
      ]
    );
  };

  const renderProduct = ({ item }) => {
    const inCart = cart.find((p) => p.product_id === item.product_id);
    const inPrint = print.find((p) => p.product_id === item.product_id);

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => openDetails(item)}
        style={{ width: CARD_WIDTH }}
      >
        <View style={[styles.productCard, { height: CARD_WIDTH }]}>
          
          {/* Delete Button */}
          <TouchableOpacity
            style={[
              styles.archiveIconBtn,
              archivingId === Number(item?.product_id) && styles.archiveIconBtnDisabled,
            ]}
            disabled={archivingId === Number(item?.product_id)}
            onPress={() => handleArchiveProduct(item)}
          >
            <Icon name="delete" size={18} color="#fff" />
          </TouchableOpacity>

          <View style={styles.cardInner}>

            {!!item.productImage && (
              <Image
                source={{ uri: `data:image/webp;base64,${item.productImage}` }}
                style={styles.productImage}
              />
            )}

            <Text style={styles.productName} numberOfLines={1}>
              {item.productName}
            </Text>

            <View style={styles.bottomRow}>
              <View style={styles.priceWrap}>
                <Text style={styles.price}>
                  ₹{Number(item.salePrice || 0).toFixed(2)}
                </Text>
                {!!item.productSize && (
                  <Text style={styles.sizeText}>
                    {item.productSize}
                  </Text>
                )}
              </View>

              <View>
                {userrole === 'customer' ? (
                  inCart ? (
                    <View style={styles.qtyRow}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => decreaseQty(item.product_id)}
                      >
                        <Text style={styles.qtyText}>-</Text>
                      </TouchableOpacity>

                      <Text style={styles.qtyValue}>{inCart.qty}</Text>

                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => increaseQty(item.product_id)}
                      >
                        <Text style={styles.qtyText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => addToCart(item)}>
                      <CartIcon width={28} height={28} fill="#f57200" />
                    </TouchableOpacity>
                  )
                ) : inPrint ? (
                  <TouchableOpacity
                    style={styles.removePrintBtn}
                    onPress={() => removeFromprint(item.product_id)}
                  >
                    <Icon name="delete" size={20} color="#fff" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => addToPrint(item)}>
                    <PrinterIcon width={28} height={28} fill="#16A34A" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#E9FDEB' }}>
      <FlatList
        key={COLS}
        data={products}
        keyExtractor={(item) => String(item.product_id)}
        renderItem={renderProduct}
        numColumns={COLS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{
          paddingHorizontal: H_PADDING,
          paddingTop: 10,
          paddingBottom: showFloatingCart ? FLOATING_BOTTOM + 80 : 16,
          rowGap: GAP,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={fetchProducts} />
        }
        showsVerticalScrollIndicator={false}
      />

      {showFloatingCart && cart.length > 0 && (
        <TouchableOpacity
          style={[styles.floatingCart, { bottom: FLOATING_BOTTOM, right: 20 }]}
          onPress={() => navigation.navigate('Cart')}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            🛒 {cart.length}
          </Text>
        </TouchableOpacity>
      )}

      <ProductModal
        ref={sheetRef}
        onAddToCart={(p) => addToCart(p)}
        onAddToPrint={(p) => addToPrint(p)}
        onUpdated={fetchProducts}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },

  archiveIconBtn: {
    position: 'absolute',
    right: 8,
    top: 8,
    zIndex: 3,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D9534F',
    alignItems: 'center',
    justifyContent: 'center',
  },

  archiveIconBtnDisabled: {
    opacity: 0.6,
  },

  cardInner: {
    flex: 1,
    justifyContent: 'space-between',
  },

  productImage: {
    width: '100%',
    height: '60%',
    borderRadius: 8,
    resizeMode: 'cover',
  },

  productName: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    color: '#000',
  },

  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 6,
  },

  priceWrap: {
    flex: 1,
  },

  price: {
    color: 'green',
    fontSize: 14,
    fontWeight: '700',
  },

  sizeText: {
    fontSize: 12,
    color: '#555',
  },

  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  qtyBtn: {
    backgroundColor: '#2c1e70',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },

  qtyText: {
    color: '#fff',
    fontWeight: 'bold',
  },

  qtyValue: {
    marginHorizontal: 6,
    fontWeight: 'bold',
  },

  removePrintBtn: {
    backgroundColor: '#D9534F',
    padding: 6,
    borderRadius: 6,
  },

  floatingCart: {
    position: 'absolute',
    backgroundColor: '#2c1e70',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 30,
    elevation: 6,
  },
});