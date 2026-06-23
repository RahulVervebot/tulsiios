import React, { useMemo, useState, useContext, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput, ScrollView, ImageBackground, ActivityIndicator, Modal } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '@env';
import { CartContext } from '../context/CartContext';
import reportbg from '../assets/images/report-bg.png';
import AppHeader from '../components/AppHeader';
import { getPartnerDetails, getPaymentMethods, getNextSequence, validateOrder, getProductQuantityDiscounts, getMixMatchDiscounts, redeemLoyaltyPoints, createCustomer } from '../components/orders/function';

const TAX_RATE = 0;

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

  // Mix-match discounts
  const [mixMatchDiscounts, setMixMatchDiscounts] = useState([]);
  const [selectedFreeProducts, setSelectedFreeProducts] = useState({}); // { groupId: [{ productId, qty, name }] }
  const [showFreeProductModal, setShowFreeProductModal] = useState(false);
  const [currentOffer, setCurrentOffer] = useState(null);
  const [modalSelections, setModalSelections] = useState({});
  const [skippedOffers, setSkippedOffers] = useState([]); // Track which offers user has skipped

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

  // Fetch mix-match discounts when cart changes
  useEffect(() => {
    const fetchMixMatchDiscounts = async () => {
      if (!cart || cart.length === 0) {
        setMixMatchDiscounts([]);
        return;
      }

      const productIds = cart
        .map(item => item.product_id)
        .filter(id => id != null);

      if (productIds.length === 0) {
        setMixMatchDiscounts([]);
        return;
      }

      try {
        const response = await getMixMatchDiscounts(productIds);
        if (response?.success && response.data) {
          setMixMatchDiscounts(response.data);
          console.log('Mix-match discounts fetched:', response.data);
        }
      } catch (error) {
        console.error('Error fetching mix-match discounts:', error);
        // Don't show alert, just log
      }
    };

    fetchMixMatchDiscounts();
  }, [cart]);

  // Automatically show modal when mix-match offers are available
  useEffect(() => {
    console.log('Auto-show effect triggered:', { 
      hasDiscounts: mixMatchDiscounts?.length > 0, 
      modalOpen: showFreeProductModal,
      cartLength: cart?.length 
    });

    if (mixMatchDiscounts && mixMatchDiscounts.length > 0 && !showFreeProductModal) {
      // Check if any offer qualifies
      const firstQualifyingOffer = mixMatchDiscounts.find(discount => {
        const qualifyingQty = (discount.product_ids || []).reduce((sum, productId) => {
          const cartItem = cart.find(item => item.product_id === productId);
          return sum + (cartItem ? Number(cartItem.qty || 0) : 0);
        }, 0);
        
        const qualifies = qualifyingQty >= (discount.no_of_products_to_buy || 0) && discount.offer_type === 'free_product';
        console.log('Checking offer:', { 
          group_id: discount.group_id, 
          qualifyingQty, 
          required: discount.no_of_products_to_buy,
          qualifies 
        });
        
        return qualifies;
      });

      if (firstQualifyingOffer) {
        // Check if user hasn't made a selection or skipped this offer yet
        const hasSelection = selectedFreeProducts[firstQualifyingOffer.group_id]?.length > 0;
        const hasSkipped = skippedOffers.includes(firstQualifyingOffer.group_id);
        
        console.log('Qualifying offer found:', { 
          group_id: firstQualifyingOffer.group_id,
          hasSelection,
          hasSkipped 
        });

        if (!hasSelection && !hasSkipped) {
          console.log('Auto-opening modal for offer:', firstQualifyingOffer);
          setTimeout(() => {
            openFreeProductModal(firstQualifyingOffer);
          }, 500); // Small delay to ensure UI is ready
        }
      } else {
        console.log('No qualifying offers found');
      }
    }
  }, [mixMatchDiscounts, cart, selectedFreeProducts, skippedOffers]);

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

  const { subtotal, tax, total, loyaltyDiscount, quantityDiscountTotal, cartWithDiscounts, availableOffers = [] } = useMemo(() => {
    const currentDate = new Date();
    let totalQtyDiscount = 0;

    // Process mix-match discounts to add selected free products
    let cartWithFreeProducts = [...cart];
    let offersAvailable = [];
    
    if (mixMatchDiscounts && mixMatchDiscounts.length > 0) {
      mixMatchDiscounts.forEach(discount => {
        const {
          group_id,
          group_name,
          offer_type,
          no_of_products_to_buy,
          product_ids,
          product_names,
          no_of_free_products,
          free_products_ids,
          free_products_names,
        } = discount;

        // Count how many qualifying products are in the cart
        let qualifyingQty = 0;
        product_ids.forEach(productId => {
          const cartItem = cart.find(item => item.product_id === productId);
          if (cartItem) {
            qualifyingQty += Number(cartItem.qty || 0);
          }
        });

        // Check if the customer qualifies for free products
        if (qualifyingQty >= no_of_products_to_buy && offer_type === 'free_product') {
          const completeSets = Math.floor(qualifyingQty / no_of_products_to_buy);
          const totalFreeItems = completeSets * no_of_free_products;
          
          // Check if user has made selections for this group
          const selectedForGroup = selectedFreeProducts[group_id] || [];
          const selectedTotal = selectedForGroup.reduce((sum, item) => sum + item.qty, 0);
          
          offersAvailable.push({
            group_id,
            group_name,
            totalFreeItems,
            selectedTotal,
            free_products_ids,
            free_products_names,
            hasSelection: selectedTotal > 0,
          });

          // Add selected free products to cart
          selectedForGroup.forEach(selection => {
            cartWithFreeProducts.push({
              product_id: selection.productId,
              productName: selection.name,
              name: selection.name,
              qty: selection.qty,
              price: 0,
              salePrice: 0,
              isMixMatchFree: true,
              mixMatchGroupId: group_id,
              mixMatchGroupName: group_name,
            });
          });
        }
      });
    }

    // Create cart with applied discounts
    const updatedCart = cartWithFreeProducts.map(item => {
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
      availableOffers,
    };
  }, [cart, loyaltyAmount, quantityDiscounts, mixMatchDiscounts, selectedFreeProducts]);

  const keyExtractor = useCallback((it, idx) => String(it.product_id ?? it._id ?? it.productId ?? idx), []);

  // Open free product selection modal
  const openFreeProductModal = (offer) => {
    if (!offer) {
      console.error('No offer data provided to openFreeProductModal');
      return;
    }

    console.log('Opening modal with offer data:', offer);

    // Calculate qualifying products
    const qualifyingQty = (offer.product_ids || []).reduce((sum, productId) => {
      const cartItem = cart.find(item => item.product_id === productId);
      return sum + (cartItem ? Number(cartItem.qty || 0) : 0);
    }, 0);

    const completeSets = Math.floor(qualifyingQty / (offer.no_of_products_to_buy || 1));
    const totalFreeItems = completeSets * (offer.no_of_free_products || 0);

    console.log('Calculated:', { qualifyingQty, completeSets, totalFreeItems });

    setCurrentOffer({
      ...offer,
      totalFreeItems,
      completeSets,
    });

    // Initialize modal selections from saved selections
    const savedSelections = selectedFreeProducts[offer.group_id] || [];
    const initialSelections = {};
    savedSelections.forEach(selection => {
      initialSelections[selection.productId] = selection.qty;
    });
    setModalSelections(initialSelections);
    setShowFreeProductModal(true);
    console.log('Modal state set to true');
  };

  // Update quantity in modal
  const updateModalSelection = (productId, productName, change) => {
    setModalSelections(prev => {
      const currentQty = prev[productId] || 0;
      const newQty = Math.max(0, currentQty + change);

      // Calculate total selected
      const totalSelected = Object.values({ ...prev, [productId]: newQty }).reduce((sum, qty) => sum + qty, 0);

      // Check if within limit
      if (totalSelected > currentOffer.totalFreeItems) {
        Alert.alert('Limit Reached', `You can select up to ${currentOffer.totalFreeItems} free items.`);
        return prev;
      }

      if (newQty === 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }

      return { ...prev, [productId]: newQty };
    });
  };

  // Confirm free product selection
  const confirmFreeProductSelection = () => {
    const selections = Object.entries(modalSelections).map(([productId, qty]) => {
      const index = currentOffer.free_products_ids.indexOf(Number(productId));
      const name = currentOffer.free_products_names[index] || `Product ${productId}`;
      return {
        productId: Number(productId),
        qty,
        name,
      };
    });

    setSelectedFreeProducts(prev => ({
      ...prev,
      [currentOffer.group_id]: selections,
    }));

    setShowFreeProductModal(false);
    setModalSelections({});
    setCurrentOffer(null);
  };

  // Skip free product selection
  const skipFreeProductSelection = () => {
    if (currentOffer) {
      setSkippedOffers(prev => [...prev, currentOffer.group_id]);
    }
    setShowFreeProductModal(false);
    setModalSelections({});
    setCurrentOffer(null);
  };

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
      cartItems: cartWithDiscounts,
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
    const isFreeProduct = item.isMixMatchFree;
    
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
          {isFreeProduct && (
            <Text style={styles.freeBadge}>
              🎁 FREE - {item.mixMatchGroupName}
            </Text>
          )}
        </View>
        <Text style={styles.qty}>x{qty}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          {showDiscount && (
            <Text style={styles.originalPrice}>${item.originalTotal.toFixed(2)}</Text>
          )}
          <Text style={[styles.price, (showDiscount || isFreeProduct) && { color: '#28a745', fontWeight: '700' }]}>
            {isFreeProduct ? 'FREE' : `$${lineTotal}`}
          </Text>
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
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
            </View>
          </View>

          {/* Mix-Match Offers */}
          {availableOffers && availableOffers.length > 0 && (
            <View style={styles.offersSection}>
              <Text style={styles.offersTitle}>🎁 Special Offers Available!</Text>
              {availableOffers.map(offer => {
                const offerData = mixMatchDiscounts.find(d => d.group_id === offer.group_id);
                if (!offerData) return null;
                
                return (
                  <View key={offer.group_id} style={styles.offerCard}>
                    <View style={styles.offerHeader}>
                      <Text style={styles.offerName}>{offer.group_name}</Text>
                      <Text style={styles.offerBadge}>
                        {offer.selectedTotal}/{offer.totalFreeItems} selected
                      </Text>
                    </View>
                    <Text style={styles.offerDescription}>
                      You can select up to {offer.totalFreeItems} free items!
                    </Text>
                    <TouchableOpacity
                      style={styles.selectFreeBtn}
                      onPress={() => {
                        console.log('Opening modal with offer:', offerData);
                        openFreeProductModal(offerData);
                      }}
                    >
                      <Text style={styles.selectFreeBtnText}>
                        {offer.hasSelection ? 'Change Selection' : 'Select Free Products'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

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

      {/* Free Product Selection Modal */}
      <Modal
        visible={showFreeProductModal}
        animationType="slide"
        transparent={true}
        onRequestClose={skipFreeProductSelection}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {currentOffer?.group_name || 'Select Free Products'}
              </Text>
              <TouchableOpacity onPress={skipFreeProductSelection}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Select up to {currentOffer?.totalFreeItems || 0} free items
            </Text>

            <View style={styles.modalProgress}>
              <Text style={styles.modalProgressText}>
                Selected: {Object.values(modalSelections).reduce((sum, qty) => sum + qty, 0)} / {currentOffer?.totalFreeItems || 0}
              </Text>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      width: `${Math.min(100, (Object.values(modalSelections).reduce((sum, qty) => sum + qty, 0) / (currentOffer?.totalFreeItems || 1)) * 100)}%` 
                    }
                  ]} 
                />
              </View>
            </View>

            <ScrollView style={styles.modalScroll}>
              {currentOffer?.free_products_ids.map((productId, index) => {
                const productName = currentOffer.free_products_names[index] || `Product ${productId}`;
                const qty = modalSelections[productId] || 0;

                return (
                  <View key={productId} style={styles.freeProductItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.freeProductName}>{productName}</Text>
                      <Text style={styles.freeProductId}>ID: {productId}</Text>
                    </View>
                    <View style={styles.quantityControls}>
                      <TouchableOpacity
                        style={[styles.qtyBtn, qty === 0 && styles.qtyBtnDisabled]}
                        onPress={() => updateModalSelection(productId, productName, -1)}
                        disabled={qty === 0}
                      >
                        <Text style={styles.qtyBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.qtyDisplay}>{qty}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => updateModalSelection(productId, productName, 1)}
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={skipFreeProductSelection}
              >
                <Text style={styles.modalCancelText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={confirmFreeProductSelection}
              >
                <Text style={styles.modalConfirmText}>
                  {Object.values(modalSelections).reduce((sum, qty) => sum + qty, 0) === 0 ? 'Skip' : 'Confirm Selection'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  freeBadge: { fontSize: 11, color: '#ff6b35', fontWeight: '700', marginTop: 4, backgroundColor: '#fff5f2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
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

  // Offers section styles
  offersSection: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fff9f0',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ff6b35',
  },
  offersTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ff6b35',
    marginBottom: 12,
  },
  offerCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ffd9cc',
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  offerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    flex: 1,
  },
  offerBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  offerDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
  },
  selectFreeBtn: {
    backgroundColor: '#ff6b35',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  selectFreeBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.primary,
    flex: 1,
  },
  modalClose: {
    fontSize: 24,
    color: '#999',
    fontWeight: '600',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  modalProgress: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  modalProgressText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.secondary,
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: THEME.secondary,
    borderRadius: 4,
  },
  modalScroll: {
    maxHeight: 400,
    paddingHorizontal: 20,
  },
  freeProductItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  freeProductName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  freeProductId: {
    fontSize: 11,
    color: '#999',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: {
    backgroundColor: '#ccc',
  },
  qtyBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  qtyDisplay: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    minWidth: 30,
    textAlign: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 15,
  },
  modalConfirmBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: THEME.secondary,
    alignItems: 'center',
  },
  modalConfirmBtnDisabled: {
    backgroundColor: '#ccc',
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});