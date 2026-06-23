import React, { useMemo, useState, useContext, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput, ScrollView,ImageBackground, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '@env';
import { CartContext } from '../context/CartContext';
import reportbg from '../assets/images/report-bg.png';
import AppHeader from '../components/AppHeader';
import { getPartnerDetails, getPaymentMethods, getNextSequence, validateOrder, getProductQuantityDiscounts, redeemLoyaltyPoints, createCustomer } from '../components/orders/function';

const TAX_RATE = 0.18;

export default function CheckoutScreen() {

  const route = useRoute();
  const navigation = useNavigation();
  const { clearCart } = useContext(CartContext) || { clearCart: async () => {} };
  const cart = route.params?.cart ?? [];

  const regId = route.params?.regId;
  const sessionId = route.params?.sessionId;

  const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

  // Payment methods
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);

  // Order sequence
  const [orderName, setOrderName] = useState(null);
  const [uid, setUid] = useState(null);
  const [sequenceNumber, setSequenceNumber] = useState(null);

  // Customer fields
  const [customerId, setCustomerId] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loyaltyPoints, setLoyaltyPoints] = useState(null);
  const [loyaltyAmount, setLoyaltyAmount] = useState(null);

  // Address fields
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');

  // Quantity discounts
  const [quantityDiscounts, setQuantityDiscounts] = useState([]);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);

  // Fetch next sequence on mount
  useEffect(() => {
    const fetchNextSequence = async () => {
      if (!sessionId) {
        console.error('No sessionId provided');
        return;
      }

      try {
        const response = await getNextSequence(sessionId);
        if (response?.result?.success && response.result.data) {
          const data = response.result.data;
          if (data.order_name) setOrderName(data.order_name);
          if (data.uid) setUid(data.uid);
          if (data.sequence_number) setSequenceNumber(data.sequence_number);
          console.log('Next sequence fetched:', data);
        }
      } catch (error) {
        console.error('Error fetching next sequence:', error);
        // Don't show alert for this, just log it
      }
    };

    fetchNextSequence();
  }, [sessionId]);

  // Fetch payment methods
  useEffect(() => {
    const fetchPaymentMethods = async () => {
      if (!regId) {
        console.error('No regId provided');
        return;
      }

      setLoadingPaymentMethods(true);
      try {
        console.log('Fetching payment methods for regId:', regId);
        const methods = await getPaymentMethods(regId);
        setPaymentMethods(methods);
        // Set default to first payment method
        if (methods.length > 0) {
          setPaymentMethod(methods[0].id);
        }

      } catch (error) {
        console.error('Error fetching payment methods:', error);
        Alert.alert('Error', 'Failed to load payment methods');
      } finally {
        setLoadingPaymentMethods(false);
      }
    };

    fetchPaymentMethods();
  }, [regId]);

  // Fetch quantity discounts when cart changes
  useEffect(() => {
    const fetchQuantityDiscounts = async () => {
      if (!cart || cart.length === 0) {
        setQuantityDiscounts([]);
        return;
      }

      const productIds = cart
        .map(item => item.product_id)
        .filter(id => id != null);

      if (productIds.length === 0) {
        setQuantityDiscounts([]);
        return;
      }

      setLoadingDiscounts(true);
      try {
        const response = await getProductQuantityDiscounts(productIds);
        if (response?.success && response.data) {
          setQuantityDiscounts(response.data);
        }
      } catch (error) {
        console.error('Error fetching quantity discounts:', error);
        // Don't show alert, just log
      } finally {
        setLoadingDiscounts(false);
      }
    };

    fetchQuantityDiscounts();
  }, [cart]);

  const fetchCustomerDetails = async () => {
    if (!phone || phone.trim().length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number');
      return;
    }

    setLoadingCustomer(true);
    try {
      const response = await getPartnerDetails(phone.trim());

      if (response.success && response.data) {
        const data = response.data;
        // Set customer ID
        if (data.id) setCustomerId(data.id);
        // Set name if not null
        if (data.name) setCustomerName(data.name);
        // Set contact details if not null
        if (data.contact?.email) setEmail(data.contact.email);
        // Set address details if not null
        if (data.address?.street) setStreet(data.address.street);
        if (data.address?.city) setCity(data.address.city);
        if (data.address?.zip) setPostalCode(data.address.zip);
        // Set loyalty points
        if (data.loyalty) {
          setLoyaltyPoints(data.loyalty.points);
          setLoyaltyAmount(data.loyalty.amount);
        }
        Alert.alert('Success', 'Customer details loaded successfully');
      }
    } catch (error) {
      console.error('Error fetching customer details:', error);
      Alert.alert('Error', 'Failed to fetch customer details');
    } finally {
      setLoadingCustomer(false);
    }
  };

  const { subtotal, tax, total, loyaltyDiscount, quantityDiscountTotal, cartWithDiscounts } = useMemo(() => {
    const currentDate = new Date();
    let totalQtyDiscount = 0;

    // Create cart with applied discounts
    const updatedCart = cart.map(item => {
      const productId = item.product_id;
      const qty = Number(item.qty || 1);
      const originalPrice = Number(item.salePrice || item.price || 0);
      const originalTotal = originalPrice * qty;

      // Find discount for this product
      const productDiscount = quantityDiscounts.find(d => d.product_id === productId);
      
      if (productDiscount && productDiscount.discounts && productDiscount.discounts.length > 0) {
        // Find applicable discount
        const applicableDiscount = productDiscount.discounts.find(disc => {
          const requiredQty = Number(disc.number_of_products_to_buy || 0);
          const discountAmount = Number(disc.discount_amount || 0);
          const startDate = disc.start_date ? new Date(disc.start_date) : null;
          const endDate = disc.end_date ? new Date(disc.end_date) : null;

          // Check if quantity matches
          if (qty < requiredQty) return false;

          // Check if date is valid
          if (startDate && currentDate < startDate) return false;
          if (endDate && currentDate > endDate) return false;

          return true;
        });

        if (applicableDiscount) {
          const requiredQty = Number(applicableDiscount.number_of_products_to_buy || 0);
          const discountAmount = Number(applicableDiscount.discount_amount || 0);
          
          // Calculate how many complete sets can be purchased
          const completeSets = Math.floor(qty / requiredQty);
          const remainingItems = qty % requiredQty;
          
          // Calculate discounted total: (sets * discountAmount) + (remaining * originalPrice)
          const discountedTotal = (completeSets * discountAmount) + (remainingItems * originalPrice);
          const discount = originalTotal - discountedTotal;
          totalQtyDiscount += discount;

          return {
            ...item,
            hasQuantityDiscount: true,
            originalTotal,
            discountedTotal,
            quantityDiscountAmount: discount,
            requiredQty,
            completeSets,
            remainingItems,
          };
        }
      }

      return {
        ...item,
        hasQuantityDiscount: false,
        originalTotal,
      };
    });

    const sub = updatedCart.reduce((sum, item) => {
      return sum + (item.hasQuantityDiscount ? item.discountedTotal : item.originalTotal);
    }, 0);

    const loyaltyDis = loyaltyAmount ? Math.floor(loyaltyAmount) : 0;
    const afterDiscount = sub - loyaltyDis;
    const t = +(afterDiscount * TAX_RATE).toFixed(2);
    const tot = +(afterDiscount + t).toFixed(2);
    
    return { 
      subtotal: +sub.toFixed(2), 
      tax: t, 
      total: tot, 
      loyaltyDiscount: loyaltyDis,
      quantityDiscountTotal: +totalQtyDiscount.toFixed(2),
      cartWithDiscounts: updatedCart,
    };
  }, [cart, loyaltyAmount, quantityDiscounts]);

  const keyExtractor = useCallback((it, idx) => String(it.product_id ?? it._id ?? it.productId ?? idx), []);

  const validate = () => {
    if (!cart.length) return 'Cart is empty.';
    if (!uid || !orderName || !sequenceNumber) return 'Order sequence not loaded. Please wait or try again.';
    if (!sessionId) return 'Session not found.';
    if (!customerName?.trim()) return 'Please enter customer name.';
    if (!phone?.trim()) return 'Please enter phone.';
    if (email?.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) return 'Please enter a valid email.';
    if (!street?.trim() || !city?.trim() || !postalCode?.trim()) {
      return 'Please complete the shipping address.';
    }
    if (!paymentMethod) return 'Please select a payment method.';
    return null;
  };

 const onConfirm = async () => {
  try {
    const msg = validate();
    if (msg) {
      Alert.alert('Missing Info', msg);
      return;
    }

    setSubmitting(true);

    // Call validate order API with all required parameters
    const response = await validateOrder({
      uid,
      orderName,
      amountTotal: total,
      amountTax: tax,
      cartItems: cart,
      paymentMethodId: paymentMethod,
      sessionId,
      customerId,
      loyaltyAmount: loyaltyDiscount,
      sequenceNumber,
      loyalty:total
    });

    console.log('Order validated successfully:', response);

    // Only proceed if order validation was successful
    if (response?.result?.code == 200) {
     
      // Create new customer if no customerId exists
      if (!customerId) {
        try {
          const customerResponse = await createCustomer({
            name: customerName,
            email: email,
            phone: phone,
            street: street,
            city: city,
            zip: postalCode,
          });
          console.log('New customer created successfully:', customerResponse);
        } catch (customerError) {
          console.error('Failed to create customer:', customerError);
          // Don't fail the entire order if customer creation fails
        }
      }

      // Redeem loyalty points if applicable
      if (loyaltyDiscount > 0 && customerId) {
        try {
          await redeemLoyaltyPoints(customerId, loyaltyDiscount);
          console.log('Loyalty points redeemed successfully');
        } catch (loyaltyError) {
          console.error('Failed to redeem loyalty points:', loyaltyError);
          // Don't fail the entire order if loyalty redemption fails
        }
      }

      // Clear cart only after successful order
      await AsyncStorage.setItem('cart', JSON.stringify([]));
      if (clearCart) await clearCart();

     Alert.alert(
        'Success',
        response?.result?.message || "Order placed successfully",
        [
          { text: 'OK', onPress: () => navigation.navigate('MainDrawer') },
        ]
      );
     
    } else {
      throw new Error('Order validation failed');
    }
  } catch (e) {
    Alert.alert('Error', e.message);
    console.log('error:', e);
  } finally {
    setSubmitting(false);
  }
};

  const renderItem = ({ item }) => {
    const qty = Number(item.qty || 1);
    const lineTotal = item.hasQuantityDiscount 
      ? item.discountedTotal.toFixed(2) 
      : item.originalTotal.toFixed(2);
    const showDiscount = item.hasQuantityDiscount && item.quantityDiscountAmount > 0;
    
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.productName || item.name}</Text>
          {(item.productSize || item.size) ? <Text style={styles.meta}>Size: {item.productSize || item.size}</Text> : null}
          {item.category ? <Text style={styles.meta}>Cat: {item.category}</Text> : null}
          {showDiscount && (
            <Text style={styles.discountBadge}>
              QTY Discount: {item.completeSets}×(Buy {item.requiredQty})
              {item.remainingItems > 0 && ` + ${item.remainingItems} regular`} • Save ${item.quantityDiscountAmount.toFixed(2)}
            </Text>
          )}
        </View>
        <Text style={styles.qty}>x{qty}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          {showDiscount && (
            <Text style={styles.originalPrice}>${item.originalTotal.toFixed(2)}</Text>
          )}
          <Text style={[styles.price, showDiscount && { color: '#28a745', fontWeight: '700' }]}>${lineTotal}</Text>
        </View>
      </View>
    );
  };

  return (
   <>
      <AppHeader  Title="CHECKOUT"
      backgroundType="image" backgroundValue={reportbg} hideCartIcon={true}>
      </AppHeader>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          <Text style={styles.title}>Review & Pay</Text>

          <FlatList
            data={cartWithDiscounts}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            scrollEnabled={false}
          />

          {/* Summary (UI only) */}
          <View style={styles.summary}>
            {quantityDiscountTotal > 0 && (
              <View style={styles.rowJustify}>
                <Text style={styles.discountLabel}>Quantity Discount Applied</Text>
                <Text style={styles.discountValue}>-${quantityDiscountTotal.toFixed(2)}</Text>
              </View>
            )}
            <View style={styles.rowJustify}>
              <Text style={styles.label}>Subtotal</Text>
              <Text style={styles.value}>${subtotal.toFixed(2)}</Text>
            </View>
            {loyaltyDiscount > 0 && (
              <View style={styles.rowJustify}>
                <Text style={styles.discountLabel}>Loyalty Discount</Text>
                <Text style={styles.discountValue}>-${loyaltyDiscount.toFixed(2)}</Text>
              </View>
            )}
            <View style={styles.rowJustify}>
              <Text style={styles.label}>Tax (18%)</Text>
              <Text style={styles.value}>${tax.toFixed(2)}</Text>
            </View>
            <View style={styles.rowJustify}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
            </View>
          </View>

          {/* Customer Details */}
          <Text style={styles.sectionTitle}>Customer Details</Text>

          {/* Phone Number with Fetch Button */}
          <View style={styles.phoneContainer}>
            <TextInput
              style={[styles.input, styles.phoneInput]}
              placeholder="Phone Number"
              placeholderTextColor="#333"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <TouchableOpacity 
              style={styles.fetchBtn} 
              onPress={fetchCustomerDetails}
              disabled={loadingCustomer}
            >
              {loadingCustomer ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.fetchBtnText}>Enter</Text>
              )}
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Customer Name"
            placeholderTextColor="#333"
            value={customerName}
            onChangeText={setCustomerName}
          />

          <TextInput
            style={styles.input}
            placeholder="Email (optional)"
            placeholderTextColor="#333"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          {/* Loyalty Points Display */}
          {loyaltyPoints !== null && (
            <View style={styles.loyaltyContainer}>
              <Text style={styles.loyaltyLabel}>Loyalty Points:</Text>
              <Text style={styles.loyaltyValue}>{loyaltyPoints.toFixed(2)} points</Text>
              {loyaltyAmount !== null && (
                <Text style={styles.loyaltyAmount}>(${loyaltyAmount.toFixed(2)})</Text>
              )}
            </View>
          )}

          {/* Address */}
          <Text style={styles.sectionTitle}>Shipping Address</Text>
          <TextInput style={styles.input} placeholder="Street" placeholderTextColor="#333" value={street} onChangeText={setStreet} />
          <TextInput style={styles.input} placeholder="City" placeholderTextColor="#333" value={city} onChangeText={setCity} />
          <TextInput
            style={styles.input}
            placeholder="Postal Code"
            placeholderTextColor="#333"
            value={postalCode}
            onChangeText={setPostalCode}
            keyboardType="number-pad"
          />
          {/* Payment */}
          <View style={styles.payment}>
            <Text style={styles.payTitle}>Payment Method</Text>
            {loadingPaymentMethods ? (
              <ActivityIndicator size="small" color={THEME.secondary} style={{ marginTop: 10 }} />
            ) : (
              <View style={styles.payRow}>
                {paymentMethods.map((method) => (
                  <TouchableOpacity
                    key={method.id}
                    style={[styles.payBtn, paymentMethod === method.id && styles.payBtnActive]}
                    onPress={() => setPaymentMethod(method.id)}
                  >
                    <Text style={[styles.payText, paymentMethod === method.id && styles.payTextActive]}>
                      {method.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

          </View>
          {/* Confirm */}
          <TouchableOpacity
            disabled={submitting}
            style={[styles.confirmBtn, submitting && { opacity: 0.6 }]}
            onPress={onConfirm}
          >
            <Text style={styles.confirmText}>{submitting ? 'Placing Order…' : 'Confirm & Pay'}</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </>
  );
}

const THEME = { primary: '#2C1E70', secondary: '#319241', price: '#27ae60' };

const styles = StyleSheet.create({
    screen:{
    flex: 1
  },
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', color: THEME.primary, marginBottom: 12 },
  sectionTitle: { marginTop: 18, fontSize: 16, fontWeight: '700', color: '#333' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  rowJustify: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  sep: { height: 1, backgroundColor: '#eee' },
  name: { fontSize: 15, fontWeight: '600', color: '#333' },
  meta: { fontSize: 12, color: '#777' },
  discountBadge: { fontSize: 11, color: '#28a745', fontWeight: '600', marginTop: 4 },
  originalPrice: { fontSize: 12, color: '#999', textDecorationLine: 'line-through', marginBottom: 2 },
  qty: { width: 40, textAlign: 'center', color: '#333' },
  price: { width: 80, textAlign: 'right', fontWeight: '600', color: THEME.price },
  summary: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 },
  label: { color: '#444' },
  value: { color: '#444', fontWeight: '600' },
  discountLabel: { color: THEME.secondary, fontWeight: '600' },
  discountValue: { color: THEME.secondary, fontWeight: '700' },
  totalLabel: { fontSize: 16, fontWeight: '700', color: THEME.primary },
  totalValue: { fontSize: 16, fontWeight: '700', color: THEME.primary },
  payment: { marginTop: 16 },
  payTitle: { fontWeight: '700', color: '#333', marginBottom: 8 },
  payRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  payBtn: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, marginBottom: 10 },
  payBtnActive: { borderColor: THEME.secondary, backgroundColor: '#fff2e8' },
  payText: { color: '#333', fontWeight: '600', fontSize: 13 },
  payTextActive: { color: THEME.secondary },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
    color: '#333',
  },
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  phoneInput: {
    flex: 1,
    marginTop: 0,
  },
  fetchBtn: {
    backgroundColor: THEME.secondary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fetchBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  loyaltyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#b0d4f1',
  },
  loyaltyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  loyaltyValue: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.secondary,
  },
  loyaltyAmount: {
    fontSize: 13,
    color: '#666',
    marginLeft: 4,
  },

  confirmBtn: { marginTop: 18, backgroundColor: THEME.secondary, padding: 14, borderRadius: 10, alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});