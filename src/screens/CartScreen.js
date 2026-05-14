// src/screens/CartScreen.js
import React, { useEffect, useContext, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet,ImageBackground } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { CartContext } from '../context/CartContext';
import AppHeader from '../components/AppHeader';
import reportbg from '../assets/images/report-bg.png';
import { getMobileBillingReg, openMobileBillingSession } from '../components/orders/function';
const THEME = { primary: '#2C1E70', secondary: '#319241', price: '#27ae60' };

export default function CartScreen() {
  const navigation = useNavigation();
  const { cart, increaseQty, decreaseQty, removeFromCart, setCart } = useContext(CartContext);
  const [sessionData, setSessionData] = useState({
    sessionId: null,
    sessionName: null,
    sessionState: null,
    regId: null,
  });
  const [sessionLoaded, setSessionLoaded] = useState(false);
    const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });
  
  useEffect(() => {
    (async () => {
      const storedCart = await AsyncStorage.getItem('cart');
      setCart(storedCart ? JSON.parse(storedCart) : []);
    })();
  }, [setCart]);

  useEffect(() => {
    const initializeBillingSession = async () => {
      try {
        // Get mobile billing registration
        const regResponse = await getMobileBillingReg();
        if (regResponse && regResponse.length > 0) {
          const regId = regResponse[0].id;
          
          // Get user_id from AsyncStorage
          const userId = await AsyncStorage.getItem('user_id');
          if (!userId) {
            console.error('User ID not found in AsyncStorage');
            return;
          }

          // Open session with reg_id and user_id
          const sessionResponse = await openMobileBillingSession(regId, userId);
          console.log('Session response:', sessionResponse);
          if (sessionResponse && sessionResponse.data) {
            setSessionData({
              sessionId: sessionResponse.data.session_id,
              sessionName: sessionResponse.data.session_name,
              sessionState: sessionResponse.data.state,
              regId: regId,
            });
            setSessionLoaded(true);
          }
        }
      } catch (error) {
        console.error('Error initializing billing session:', error);
      }
    };

    initializeBillingSession();
  }, []);

  const getSubtotal = () =>
    cart.reduce((sum, item) => sum + Number(item.salePrice || item.price) * Number(item.qty || 1), 0);

  const getTotal = () => (getSubtotal()).toFixed(2);

  const renderItem = ({ item }) => {
    const itemTotal = (Number(item.salePrice || item.price) * Number(item.qty || 1)).toFixed(2);
    
    return (
      <View style={styles.cartItem}>
        {/* Top Row: Name and Unit Price */}
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={2}>{item.productName || item.name}</Text>
          <Text style={styles.price}>${Number(item.salePrice || item.price).toFixed(2)}</Text>
        </View>

        {/* Middle Row: Item Total */}
        <View style={styles.middleRow}>
          <Text style={styles.itemTotal}>Item Total: ${itemTotal}</Text>
        </View>

        {/* Bottom Row: Quantity Controls and Remove Button */}
        <View style={styles.bottomRow}>
          <View style={styles.qtyRow}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => decreaseQty(item.product_id || item._id)}>
              <Text style={styles.qtyText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{item.qty}</Text>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => increaseQty(item.product_id || item._id)}>
              <Text style={styles.qtyText}>+</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.removeBtn} onPress={() => removeFromCart(item.product_id || item._id)}>
            <Text style={styles.removeBtnText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
  <ImageBackground
              source={getImageSource(reportbg)}
              style={styles.screen}
              resizeMode="cover"
            >
      <AppHeader  Title="CART"
      backgroundType="image" backgroundValue={reportbg} hideCartIcon={true}>

      </AppHeader>
    <View style={styles.container}>
      <FlatList
        data={cart}
        keyExtractor={(item) => String(item.product_id || item._id)}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.empty}>Your cart is empty</Text>}
      />

      {cart.length > 0 && !sessionLoaded && (
        <View style={styles.footer}>
          <Text style={styles.loadingText}>Loading session...</Text>
        </View>
      )}

      {cart.length > 0 && sessionLoaded && (
        <View style={styles.footer}>
          <Text style={styles.total}>Total: ${getTotal()}</Text>
          <TouchableOpacity
            style={styles.checkoutBtn}
            onPress={() => navigation.navigate('Checkout', {
              cart,
              sessionId: sessionData.sessionId,
              sessionName: sessionData.sessionName,
              sessionState: sessionData.sessionState,
              regId: sessionData.regId,
            })}
          >
            <Text style={styles.checkoutText}>Checkout</Text>
          </TouchableOpacity>
        </View>
      )}
 
    </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screen:{
    flex: 1
  },
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  cartItem: { 
    padding: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: '#eee',
    backgroundColor: '#fff'
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  middleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 4
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.price
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  name: { 
    fontWeight: '600', 
    fontSize: 15, 
    color: THEME.primary,
    flex: 1,
    marginRight: 10
  },
  price: { 
    fontWeight: 'bold', 
    color: THEME.price,
    fontSize: 16
  },
  empty: { textAlign: 'center', marginTop: 50, fontSize: 16, color: '#888' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  total: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: THEME.primary },
  loadingText: { textAlign: 'center', fontSize: 16, color: THEME.primary, fontWeight: '600' },
  checkoutBtn: { backgroundColor: THEME.secondary, padding: 12, borderRadius: 8, alignItems: 'center' },
  qtyRow: { flexDirection: 'row', alignItems: 'center' },
  qtyBtn: { backgroundColor: '#2c1e70', padding: 8, borderRadius: 5, minWidth: 32, alignItems: 'center' },
  qtyText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  qtyValue: { marginHorizontal: 12, fontSize: 16, fontWeight: 'bold', minWidth: 25, textAlign: 'center',color: "#000" },
  removeBtn: {
    backgroundColor: '#319241', 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 5
  },
  removeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  checkoutText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});