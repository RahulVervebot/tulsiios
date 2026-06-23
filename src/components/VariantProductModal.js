// src/components/VariantProductModal.js
import React, {
  forwardRef,
  useImperativeHandle,
  useState,
  useContext,
  useEffect,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { CartContext } from '../context/CartContext';
import { PrintContext } from '../context/PrintContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateCustomVariantProduct } from '../functions/product-function';
import DateTimePicker from '@react-native-community/datetimepicker';
import { createQuantityDiscountPromotion } from '../screens/promotions/function';

const THEME = { primary: '#319241', secondary: '#319241', price: '#27ae60' };

const VariantProductModal = forwardRef(({ onAddToCart, onAddToPrint }, ref) => {
  const [visible, setVisible] = useState(false);
  const { cart, addToCart, increaseQty, decreaseQty } = useContext(CartContext);
  const { print, addToPrint, increasePrintQty, decreasePrintQty, removeFromprint } = useContext(PrintContext);

  const [storeUrl, setStoreUrl] = useState('');
  const [token, setToken] = useState('');
  const [userRole, setUserRole] = useState('');

  const [product, setProduct] = useState(null);
  const [id, setID] = useState('');
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [barcode, setBarcode] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [qtyAvailable, setQtyAvailable] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [availablePOS, setAvailablePOS] = useState(false);
  const [isEBT, setIsEBT] = useState(false);
  const [ewic, setEwic] = useState(false);
  const [otc, setOtc] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // Quantity Discount states
  const [qdModalVisible, setQdModalVisible] = useState(false);
  const [qdSubmitting, setQdSubmitting] = useState(false);
  const [qdBuyQty, setQdBuyQty] = useState('1');
  const [qdDiscount, setQdDiscount] = useState('1');
  const [qdStartDate, setQdStartDate] = useState('');
  const [qdEndDate, setQdEndDate] = useState('');
  const [qdShowStartPicker, setQdShowStartPicker] = useState(false);
  const [qdShowEndPicker, setQdShowEndPicker] = useState(false);

  // Price Calculator states
  const [pricingMethod, setPricingMethod] = useState('margin'); // 'margin' or 'markup'
  const [pricingValue, setPricingValue] = useState('');
  const [calculatedPrice, setCalculatedPrice] = useState(null);
  const [showPriceCalculator, setShowPriceCalculator] = useState(false);

  const inputTextColor = '#111';
  const placeholderColor = '#6B7280';
  const inputBg = '#fff';
  const inputBorder = '#ddd';

  useEffect(() => {
    (async () => {
      const url = await AsyncStorage.getItem('storeurl');
      const t = await AsyncStorage.getItem('access_token');
      const role = await AsyncStorage.getItem('userRole');
      setStoreUrl(url || '');
      setToken(t || '');
      setUserRole(role || '');
    })();
  }, []);

  useImperativeHandle(ref, () => ({
    open: (p) => {
      setProduct(p || null);
      if (p) {
        console.log('Opening variant product modal for:', p);
        setID(String(p.product_id ?? p.id ?? ''));
        setName(p.productName ?? p.name ?? '');
        setSize(p.productSize ?? p.size ?? '');
        setBarcode(p.barcode || '');
        setPrice(p.salePrice != null ? String(p.salePrice) : '');
        setCost(p.costPrice != null ? String(p.costPrice) : '');
        setQtyAvailable(p.qtyAvailable != null ? String(p.qtyAvailable) : '');
        setCategoryId(p.categoryId != null ? String(p.categoryId) : '');
        setAvailablePOS(!!p.availableInPos);
        setIsEBT(!!p.isEbtProduct);
        setEwic(!!p.ewic);
        setOtc(!!p.otc);
      }
      // Reset QD modal state
      setQdModalVisible(false);
      setQdShowStartPicker(false);
      setQdShowEndPicker(false);
      setVisible(true);
    },
    close: () => {
      setVisible(false);
      setProduct(null);
      setQdModalVisible(false);
      setQdShowStartPicker(false);
      setQdShowEndPicker(false);
    },
  }));

  const handleClose = () => {
    setVisible(false);
    setProduct(null);
    setQdModalVisible(false);
    setQdShowStartPicker(false);
    setQdShowEndPicker(false);
  };

  // Date helper functions
  const formatDateOnly = (value) => {
    if (!value) return '';
    const datePart = String(value).split(' ')[0];
    return datePart || '';
  };

  const toDate = (value) => {
    const datePart = formatDateOnly(value);
    if (!datePart) return new Date();
    const [y, m, d] = datePart.split('-').map((n) => Number(n));
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d);
  };

  const handleQdStartDateChange = (_, date) => {
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    setQdStartDate(`${yyyy}-${mm}-${dd} 00:00:00`);
  };

  const handleQdEndDateChange = (_, date) => {
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    setQdEndDate(`${yyyy}-${mm}-${dd} 23:59:59`);
  };

  // Calculate new price based on pricing method
  const calculateNewPrice = () => {
    const costValue = parseFloat(cost);
    const value = parseFloat(pricingValue);

    if (!costValue || !value || value < 0) {
      Alert.alert('Invalid Input', 'Please enter valid cost and value');
      return;
    }

    let newPrice = 0;

    switch (pricingMethod) {
      case 'margin':
        // Margin: Sale Price = Cost / (1 - Margin%)
        if (value >= 100) {
          Alert.alert('Invalid Margin', 'Margin cannot be 100% or more');
          return;
        }
        newPrice = costValue / (1 - value / 100);
        break;
      
      case 'markup':
        // Markup: Sale Price = Cost * (1 + Markup%)
        newPrice = costValue * (1 + value / 100);
        break;
      
      default:
        newPrice = costValue;
    }

    setCalculatedPrice(newPrice.toFixed(2));
  };

  // Accept calculated price
  const acceptCalculatedPrice = async () => {
    if (calculatedPrice) {
      setPrice(calculatedPrice);
      // Save selected pricing method
      try {
        await AsyncStorage.setItem('pricingMethod', pricingMethod);
      } catch (error) {
        console.log('Error saving pricing method:', error);
      }
      setShowPriceCalculator(false);
      setCalculatedPrice(null);
      setPricingValue('');
    }
  };

  const openQdModal = () => {
    setQdBuyQty('1');
    setQdDiscount('1');
    setQdStartDate('');
    setQdEndDate('');
    setQdModalVisible(true);
  };

  const handleCreateQuantityDiscount = async () => {
    if (!product?.product_id && !id) {
      Alert.alert('Missing product', 'Product ID not found.');
      return;
    }
    const payload = {
      product_id: Number(product?.product_id ?? id),
      no_of_product_to_buy: Number(qdBuyQty || 0),
      discount_amount: Number(qdDiscount || 0),
      start_date: qdStartDate || null,
      end_date: qdEndDate || null,
    };
    try {
      setQdSubmitting(true);
      const res = await createQuantityDiscountPromotion(payload);
      const message = res?.message || res?.result?.message || 'Quantity discount created successfully';
      Alert.alert('Success', message);
      setQdModalVisible(false);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to create quantity discount.');
    } finally {
      setQdSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!id) {
      Alert.alert('Error', 'Missing product id.');
      return;
    }

    const priceValue = parseFloat(price);
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter a product name.');
      return;
    }
    if (!Number.isFinite(priceValue)) {
      Alert.alert('Invalid Price', 'Please enter a valid price.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
          name: name.trim(),
        list_price: priceValue,
        available_in_pos: availablePOS,
        ewic:ewic,
        is_ebt_product:isEBT,
        otc:otc,
      }
      console.log('Updating variant product with payload:', payload);
      const updateResponse = await updateCustomVariantProduct(id, {
        name: name.trim(),
        list_price: priceValue,
        available_in_pos: availablePOS,
        ewic:ewic,
        is_ebt_product:isEBT,
        otc:otc,
      });

      if (updateResponse?.result?.message) {
        Alert.alert('Success', updateResponse.result.message);
      } else if (updateResponse?.result?.error) {
        Alert.alert('Error', updateResponse.result.error);
      } else {
        Alert.alert('Success', 'Variant product updated successfully.');
      }

      // Update local product state
      const updated = {
        ...product,
        productName: name.trim(),
        salePrice: priceValue,
       availablePOS: availablePOS,
       ewic:ewic,
       isEbtProduct:isEBT,
       otc:otc,

      };
      setProduct(updated);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to update variant product.');
    } finally {
      setSubmitting(false);
    }
  };

  const onAddToCartHandler = () => {
    if (!product) return;
    addToCart(product);
    Alert.alert('Added', 'Item added to cart.');
  };

  const onAddToPrintHandler = () => {
    if (!product) return;
    addToPrint(product);
    Alert.alert('Added', 'Item added to print list.');
  };

  const inCart = Array.isArray(cart) ? cart.find((item) => item.product_id === product?.product_id) : null;
  const inPrint = Array.isArray(print) ? print.find((item) => item.product_id === product?.product_id) : null;

  const isProductEditPermission = userRole !== 'customer';
  const isProductBillingPermission = userRole !== 'customer';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Variant Product Details</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Icon name="close" size={28} color="#333" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.fieldLabel}>Product Name</Text>
            <TextInput
              style={[
                styles.input,
                { color: inputTextColor, backgroundColor: inputBg, borderColor: inputBorder },
              ]}
              placeholder="Product Name"
              placeholderTextColor={placeholderColor}
              value={name}
              onChangeText={setName}
              editable={isProductEditPermission}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>Size</Text>
            <View style={[styles.readonlyField, { borderColor: inputBorder, backgroundColor: inputBg }]}>
              <Text style={[styles.readonlyText, { color: inputTextColor }]}>
                {size || '-'}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>Barcode</Text>
            <View style={[styles.readonlyField, { borderColor: inputBorder, backgroundColor: inputBg }]}>
              <Text style={[styles.readonlyText, { color: inputTextColor }]}>
                {barcode || '-'}
              </Text>
            </View>
          </View>

          <View style={styles.rowGap}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Sale Price ($)</Text>
              <TextInput
                style={[
                  styles.inputCol,
                  { color: inputTextColor, backgroundColor: inputBg, borderColor: inputBorder },
                ]}
                placeholder="Sale Price"
                placeholderTextColor={placeholderColor}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                editable={isProductEditPermission}
              />
            </View>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Cost Price ($)</Text>
              <View style={[styles.readonlyField, { borderColor: inputBorder, backgroundColor: inputBg }]}>
                <Text style={[styles.readonlyText, { color: inputTextColor }]}>
                  {cost || '-'}
                </Text>
              </View>
            </View>
          </View>

          {/* Price Calculator Section */}
          {cost && isProductEditPermission && (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#319241',
                borderRadius: 12,
                padding: 15,
                marginTop: 15,
                backgroundColor: '#F9FAFB',
              }}>
              <TouchableOpacity
                onPress={() => setShowPriceCalculator(!showPriceCalculator)}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#319241' }}>
                  Selling Price Calculator
                </Text>
                <Text style={{ fontSize: 20, color: '#319241' }}>
                  {showPriceCalculator ? '▼' : '▶'}
                </Text>
              </TouchableOpacity>

              {showPriceCalculator && (
                <View style={{ marginTop: 15 }}>
                  <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 10 }}>
                    Calculate new Sell price based on cost
                  </Text>

                  {/* Pricing Method Selector */}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginBottom: 15,
                    }}>
                    <TouchableOpacity
                      onPress={() => setPricingMethod('margin')}
                      style={{
                        flex: 1,
                        padding: 10,
                        marginRight: 5,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: pricingMethod === 'margin' ? '#319241' : '#E5E7EB',
                        backgroundColor: pricingMethod === 'margin' ? '#E8F5E9' : '#fff',
                      }}>
                      <Text
                        style={{
                          textAlign: 'center',
                          color: pricingMethod === 'margin' ? '#319241' : '#6B7280',
                          fontWeight: pricingMethod === 'margin' ? '600' : '400',
                        }}>
                        Margin
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setPricingMethod('markup')}
                      style={{
                        flex: 1,
                        padding: 10,
                        marginLeft: 5,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: pricingMethod === 'markup' ? '#319241' : '#E5E7EB',
                        backgroundColor: pricingMethod === 'markup' ? '#E8F5E9' : '#fff',
                      }}>
                      <Text
                        style={{
                          textAlign: 'center',
                          color: pricingMethod === 'markup' ? '#319241' : '#6B7280',
                          fontWeight: pricingMethod === 'markup' ? '600' : '400',
                        }}>
                        Markup
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Input Fields */}
                  <View style={{ marginBottom: 15 }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 5, color: inputTextColor }}>
                      Cost Price: ${cost || '0.00'}
                    </Text>
                    
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginTop: 10,
                      }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', marginRight: 10, color: inputTextColor }}>
                        {pricingMethod === 'margin' ? 'Margin' : 'Markup'} %:
                      </Text>
                      <TextInput
                        keyboardType="numeric"
                        placeholder="Enter %"
                        placeholderTextColor={placeholderColor}
                        value={pricingValue}
                        onChangeText={setPricingValue}
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor: '#D1D5DB',
                          borderRadius: 8,
                          padding: 10,
                          backgroundColor: '#fff',
                          color: inputTextColor,
                        }}
                      />
                    </View>
                  </View>

                  {/* Calculate Button */}
                  <TouchableOpacity
                    onPress={calculateNewPrice}
                    style={{
                      backgroundColor: '#319241',
                      padding: 12,
                      borderRadius: 8,
                      marginBottom: 10,
                    }}>
                    <Text
                      style={{
                        color: '#fff',
                        textAlign: 'center',
                        fontWeight: '600',
                      }}>
                      Calculate Price
                    </Text>
                  </TouchableOpacity>

                  {/* Calculated Price Display */}
                  {calculatedPrice && (
                    <View
                      style={{
                        backgroundColor: '#E8F5E9',
                        padding: 15,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: '#319241',
                      }}>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: '600',
                          color: '#1B5E20',
                          textAlign: 'center',
                          marginBottom: 10,
                        }}>
                        New Sell Price: ${calculatedPrice}
                      </Text>
                      <TouchableOpacity
                        onPress={acceptCalculatedPrice}
                        style={{
                          backgroundColor: '#319241',
                          padding: 10,
                          borderRadius: 8,
                        }}>
                        <Text
                          style={{
                            color: '#fff',
                            textAlign: 'center',
                            fontWeight: '600',
                          }}>
                          Accept & Update Sell Price
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>Net QTY</Text>
            <View style={[styles.readonlyField, { borderColor: inputBorder, backgroundColor: inputBg }]}>
              <Text style={[styles.readonlyText, { color: inputTextColor }]}>
                {qtyAvailable || '-'}
              </Text>
            </View>
          </View>

          <Text style={styles.subTitle}>Settings:</Text>
          <View style={styles.switchGrid}>
            <View style={styles.switchCell}>
              <Text style={styles.switchLabel}>In POS</Text>
              <Switch
                value={availablePOS}
                onValueChange={setAvailablePOS}
                disabled={!isProductEditPermission}
              />
            </View>
            <View style={styles.switchCell}>
              <Text style={styles.switchLabel}>EBT Eligible</Text>
              <Switch value={isEBT} onValueChange={setIsEBT} disabled={!isProductEditPermission} />
            </View>
          </View>
          <View style={styles.switchGrid}>
            <View style={styles.switchCell}>
              <Text style={styles.switchLabel}>eWIC Eligible</Text>
              <Switch value={ewic} onValueChange={setEwic} disabled={!isProductEditPermission} />
            </View>
            <View style={styles.switchCell}>
              <Text style={styles.switchLabel}>OTC Product</Text>
              <Switch value={otc} onValueChange={setOtc} disabled={!isProductEditPermission} />
            </View>
          </View>

          {userRole !== 'customer' && isProductEditPermission && (
            <View style={styles.buttonSection}>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnAccent]}
                  onPress={openQdModal}
                >
                  <Text style={styles.btnText}>💰 Qty Disc</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary, { opacity: submitting ? 0.6 : 1 }]}
                  disabled={submitting}
                  onPress={handleUpdate}
                >
                  <Text style={styles.btnText}>{submitting ? '⏳ Updating…' : '✓ Update'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {isProductBillingPermission && (
            <View style={styles.buttonSection}>
              {inCart ? (
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => decreaseQty(product.product_id)}
                  >
                    <Text style={styles.qtyText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{inCart.qty}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => increaseQty(product.product_id)}
                  >
                    <Text style={styles.qtyText}>+</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: THEME.secondary }]}
                  onPress={onAddToCartHandler}
                >
                  <Text style={styles.btnText}>Add to Cart</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.buttonSection}>
            {inPrint ? (
              <TouchableOpacity
                style={[styles.btn, styles.btnDanger]}
                onPress={() => removeFromprint(product.product_id)}
              >
                <Text style={styles.btnText}>Remove from Print</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.btn, styles.btnSuccess]}
                onPress={onAddToPrintHandler}
              >
                <Text style={styles.btnText}>Add to Print List</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        {/* QTY DISCOUNT OVERLAY */}
        {qdModalVisible && (
          <View style={styles.innerOverlay}>
            <TouchableOpacity
              style={styles.innerOverlayBackdrop}
              activeOpacity={1}
              onPress={() => {
                setQdModalVisible(false);
                setQdShowStartPicker(false);
                setQdShowEndPicker(false);
              }}
            />
            <KeyboardAvoidingView
              behavior={Platform.select({ ios: 'padding', android: 'height' })}
              style={styles.qdKeyboardAvoidWrapper}
            >
              <View style={[styles.modalCard, styles.innerOverlayCard]}>
                <Text style={styles.modalTitle}>Create Quantity Discount</Text>

                <ScrollView
                  style={{ maxHeight: 320, marginBottom: 16 }}
                  contentContainerStyle={{ paddingHorizontal: 0 }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                >
                  <TextInput
                    style={styles.modalInput}
                    value={qdBuyQty}
                    onChangeText={setQdBuyQty}
                    placeholder="No. of products to buy"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={styles.modalInput}
                    value={qdDiscount}
                    onChangeText={setQdDiscount}
                    placeholder="Discount amount"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="decimal-pad"
                  />

                  <TouchableOpacity
                    style={styles.qdDateInput}
                    onPress={() => {
                      setQdShowEndPicker(false);
                      setQdShowStartPicker(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.qdDateInputHeader}>
                      <Icon name="event" size={16} color="#319241" />
                      <Text style={styles.qdDateInputLabel}>Start Date</Text>
                    </View>
                    <Text style={qdStartDate ? styles.qdDateInputText : styles.qdDateInputPlaceholder}>
                      {qdStartDate ? formatDateOnly(qdStartDate) : 'Select'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.qdDateInput}
                    onPress={() => {
                      setQdShowStartPicker(false);
                      setQdShowEndPicker(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.qdDateInputHeader}>
                      <Icon name="event" size={16} color="#D9534F" />
                      <Text style={styles.qdDateInputLabel}>End Date</Text>
                    </View>
                    <Text style={qdEndDate ? styles.qdDateInputText : styles.qdDateInputPlaceholder}>
                      {qdEndDate ? formatDateOnly(qdEndDate) : 'Select'}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>

                <View style={styles.qdModalBtnRow}>
                  <TouchableOpacity
                    style={[styles.qdBtn, styles.qdBtnCancel]}
                    onPress={() => {
                      setQdModalVisible(false);
                      setQdShowStartPicker(false);
                      setQdShowEndPicker(false);
                    }}
                  >
                    <Text style={styles.qdBtnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.qdBtn, styles.qdBtnConfirm, qdSubmitting && { opacity: 0.6 }]}
                    onPress={handleCreateQuantityDiscount}
                    disabled={qdSubmitting}
                  >
                    <Text style={styles.qdBtnConfirmText}>{qdSubmitting ? 'Saving…' : 'Create'}</Text>
                  </TouchableOpacity>
                </View>

                {qdShowStartPicker && (
                  <Modal visible={qdShowStartPicker} transparent animationType="fade">
                    <View style={styles.qdDatePickerModal}>
                      <TouchableOpacity
                        style={styles.qdDatePickerBackdrop}
                        activeOpacity={1}
                        onPress={() => setQdShowStartPicker(false)}
                      />
                      <View style={styles.qdDatePickerContainer}>
                        <View style={styles.qdDatePickerHeader}>
                          <Text style={styles.qdDatePickerTitle}>Select Start Date</Text>
                          <TouchableOpacity onPress={() => setQdShowStartPicker(false)}>
                            <Icon name="close" size={24} color="#111" />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.qdDatePickerContent}>
                          <DateTimePicker
                            value={toDate(qdStartDate)}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={handleQdStartDateChange}
                            textColor="#111"
                            themeVariant="light"
                          />
                        </View>
                        <View style={styles.qdDatePickerFooter}>
                          <TouchableOpacity
                            style={[styles.qdBtn, styles.qdBtnCancel]}
                            onPress={() => setQdShowStartPicker(false)}
                          >
                            <Text style={styles.qdBtnCancelText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.qdBtn, styles.qdBtnConfirm]}
                            onPress={() => setQdShowStartPicker(false)}
                          >
                            <Text style={styles.qdBtnConfirmText}>Confirm</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </Modal>
                )}

                {qdShowEndPicker && (
                  <Modal visible={qdShowEndPicker} transparent animationType="fade">
                    <View style={styles.qdDatePickerModal}>
                      <TouchableOpacity
                        style={styles.qdDatePickerBackdrop}
                        activeOpacity={1}
                        onPress={() => setQdShowEndPicker(false)}
                      />
                      <View style={styles.qdDatePickerContainer}>
                        <View style={styles.qdDatePickerHeader}>
                          <Text style={styles.qdDatePickerTitle}>Select End Date</Text>
                          <TouchableOpacity onPress={() => setQdShowEndPicker(false)}>
                            <Icon name="close" size={24} color="#111" />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.qdDatePickerContent}>
                          <DateTimePicker
                            value={toDate(qdEndDate)}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={handleQdEndDateChange}
                            textColor="#111"
                            themeVariant="light"
                          />
                        </View>
                        <View style={styles.qdDatePickerFooter}>
                          <TouchableOpacity
                            style={[styles.qdBtn, styles.qdBtnCancel]}
                            onPress={() => setQdShowEndPicker(false)}
                          >
                            <Text style={styles.qdBtnCancelText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.qdBtn, styles.qdBtnConfirm]}
                            onPress={() => setQdShowEndPicker(false)}
                          >
                            <Text style={styles.qdBtnConfirmText}>Confirm</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </Modal>
                )}
              </View>
            </KeyboardAvoidingView>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  closeBtn: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  readonlyField: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  readonlyText: {
    fontSize: 15,
  },
  rowGap: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  fieldCol: {
    flex: 1,
  },
  inputCol: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  subTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginTop: 8,
    marginBottom: 12,
  },
  switchGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  switchCell: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  buttonSection: {
    marginTop: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: THEME.primary,
  },
  btnAccent: {
    backgroundColor: '#F59E0B',
  },
  btnSuccess: {
    backgroundColor: '#10B981',
  },
  btnDanger: {
    backgroundColor: '#EF4444',
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 8,
  },
  qtyBtn: {
    backgroundColor: THEME.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  qtyValue: {
    marginHorizontal: 24,
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  // Quantity Discount Modal Styles
  innerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    elevation: 50,
  },
  innerOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  innerOverlayCard: {
    zIndex: 1000,
    elevation: 60,
  },
  qdKeyboardAvoidWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#F9FAFB',
  },
  qdDateInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 12,
  },
  qdDateInputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  qdDateInputLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '700',
  },
  qdDateInputText: {
    fontSize: 14,
    color: '#111',
    fontWeight: '700',
  },
  qdDateInputPlaceholder: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  qdDatePickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  qdDatePickerBackdrop: {
    flex: 1,
  },
  qdDatePickerContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 0,
    maxHeight: '70%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: -4 },
      },
      android: {
        elevation: 8,
      },
    }),
  },
  qdDatePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  qdDatePickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  qdDatePickerContent: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  qdDatePickerFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  qdModalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  qdBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qdBtnCancel: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  qdBtnConfirm: {
    backgroundColor: '#319241',
  },
  qdBtnCancelText: {
    color: '#666',
    fontWeight: '700',
    fontSize: 14,
  },
  qdBtnConfirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default VariantProductModal;
