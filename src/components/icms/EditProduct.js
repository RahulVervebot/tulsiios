import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Animated,
  TextInput,
  Easing,
  TouchableWithoutFeedback,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_ENDPOINTS from '../../../icms_config/api';

function EditProduct({ visible, item, InvoiceDate, InvNumber, vendorName, onClose, onSave }) {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(false);
  const [editedItem, setEditedItem] = useState(item);
  const [qtyText, setQtyText] = useState('');
  const [unitPriceText, setUnitPriceText] = useState('');
  const [extendedPriceText, setExtendedPriceText] = useState('');
  const isStockUpdated = item?.isStockUpdated === true || item?.isStockUpdated === 'true';
  
  const parseNum = (v) => {
    const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const to2 = (v) => Number(v).toFixed(2);
   
  const handleLinkedNumericChange = (field, text) => {
    // Update text state
    if (field === 'qty') setQtyText(text);
    if (field === 'unitPrice') setUnitPriceText(text);
    if (field === 'extendedPrice') setExtendedPriceText(text);
    const newcost = Number((parseNum(field === 'unitPrice' ? text : unitPriceText) / editedItem.pieces).toFixed(2));
    console.log("new cost:", newcost,"cost",unitPriceText,"pieces:",editedItem.pieces);
    const next = {
      qty: parseNum(field === 'qty' ? text : qtyText),
      unitPrice: parseNum(field === 'unitPrice' ? text : unitPriceText),
      extendedPrice: parseNum(field === 'extendedPrice' ? text : extendedPriceText),
      cp: newcost
    };

    if (field === 'qty') {
      if (next.qty != null && next.unitPrice != null) {
        next.extendedPrice = Number(to2(next.qty * next.unitPrice));
        setExtendedPriceText(to2(next.extendedPrice));
      } else if (next.qty != null && next.qty !== 0 && next.extendedPrice != null) {
        next.unitPrice = Number(to2(next.extendedPrice / next.qty));
        setUnitPriceText(to2(next.unitPrice));
      }
    } else if (field === 'unitPrice') {
      if (next.qty != null && next.unitPrice != null) {
        next.extendedPrice = Number(to2(next.qty * next.unitPrice));
        setExtendedPriceText(to2(next.extendedPrice));
      } else if (next.unitPrice != null && next.unitPrice !== 0 && next.extendedPrice != null) {
        next.qty = Number(to2(next.extendedPrice / next.unitPrice));
        setQtyText(to2(next.qty));
      }
    } else if (field === 'extendedPrice') {
      if (next.qty != null && next.qty !== 0 && next.extendedPrice != null) {
        next.unitPrice = Number(to2(next.extendedPrice / next.qty));
        setUnitPriceText(to2(next.unitPrice));
      } else if (next.unitPrice != null && next.unitPrice !== 0 && next.extendedPrice != null) {
        next.qty = Number(to2(next.extendedPrice / next.unitPrice));
        setQtyText(to2(next.qty));
      }
    }

    // Update local state
    setEditedItem({
      ...editedItem,
      qty: next.qty ?? 0,
      unitPrice: next.unitPrice ?? 0,
      cp: next.cp ?? 0,
      extendedPrice: next.extendedPrice ?? 0,
    });
  };

  useEffect(() => {
    // Initialize editedItem when modal becomes visible or item changes
    if (visible && item) {
      setEditedItem(item);
      setQtyText(String(item?.qty ?? ''));
      setUnitPriceText(String(item?.unitPrice ?? ''));
      setExtendedPriceText(String(item?.extendedPrice ?? ''));
    }
  }, [visible, item]);

  useEffect(() => {
    const anim = Animated.timing(slideAnim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 300 : 250,
      easing: visible ? Easing.out(Easing.ease) : Easing.in(Easing.ease),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [visible, slideAnim]);

  if (!editedItem) return null;

  const handleUpdateInvoice = async () => {
    setLoading(true);
    const bodydata = {
    InvoiceName: vendorName,
    InvoiceDate,
    InvoiceNo: InvNumber,
    ItemNo: editedItem.itemNo,
    InvoiceQty: editedItem.qty,
    InvoiceCaseCost: editedItem.unitPrice,
    InvoiceExtendedPrice: editedItem.extendedPrice,
    InvoiceDescription: editedItem.description,
    InvoiceItemNo: editedItem.itemNo,
    ProductId: editedItem.ProductId,
    };
   console.log("edited items:", editedItem);
    try {
      const token = await AsyncStorage.getItem('access_token');
      const icms_store = await AsyncStorage.getItem('icms_store');
      console.log("store token",token,"store name",icms_store)
       const app_url = await AsyncStorage.getItem('storeurl');
       console.log("check body:",bodydata);
       const res = await fetch(API_ENDPOINTS.UPDATE_INVOICE, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'access_token': token ?? '',
          'mode': 'MOBILE',
          'store': icms_store ?? '',
            'app_url': app_url ?? '',
        },
        body: JSON.stringify(bodydata),
      });

      const data = await res.json().catch(() => ({}));
      console.log('API response: body', bodydata);
          console.log('API response:', data);
      if (!res.ok) {
        console.warn('Update failed:', data);
        Alert.alert('Save Failed', data?.message || 'Unable to update item.');
        return false;
      }
      Alert.alert(data?.message || 'Save Failed');
      return true;
    } catch (err) {
      console.error('Error updating invoice:', err);
      Alert.alert('Save Failed', 'Unable to update item.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const onPressSave = async () => {
    // If you also want to persist local edits upstream:
    const ok = await handleUpdateInvoice();
    if (!ok) return;
    onSave?.(editedItem, true);
    onClose?.();
  };

  const handleNumericDone = () => {
    // Dismiss keyboard
    if (this?.input?.blur) {
      this.input.blur();
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.sheet,
                  {
                    transform: [
                      {
                        translateY: slideAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [40, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <ScrollView
                  scrollEnabled={true}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.scrollContent}
                >
                  <Text style={styles.titleText}>
                    Edit Product
                  </Text>

                  <Text style={styles.labelText}>Description:</Text>
                  <TextInput
                    value={editedItem?.description || ''}
                    onChangeText={(text) => {
                      setEditedItem({ ...editedItem, description: text });
                    }}
                    returnKeyType="next"
                    placeholder="Description"
                    style={styles.input}
                    placeholderTextColor="#6b7280"
                  />
                  {!isStockUpdated && (
                    <>
                      <Text style={styles.labelText}>Qty Shipped:</Text>
                      <TextInput
                        value={qtyText}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                        onChangeText={(text) => handleLinkedNumericChange('qty', text)}
                        onSubmitEditing={() => {}}
                        placeholder="Qty Shipped"
                        style={styles.input}
                        placeholderTextColor="#6b7280"
                      />
                    </>
                  )}
                  <Text style={styles.labelText}>Case Cost:</Text>
                  <TextInput
                    value={unitPriceText}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onChangeText={(text) => handleLinkedNumericChange('unitPrice', text)}
                    onSubmitEditing={() => {}}
                    placeholder="Unit Price"
                    style={styles.input}
                    placeholderTextColor="#6b7280"
                  />

                  <Text style={styles.labelText}>Extended Price:</Text>
                  <TextInput
                    value={extendedPriceText}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onChangeText={(text) => handleLinkedNumericChange('extendedPrice', text)}
                    onSubmitEditing={() => {}}
                    placeholder="Extended Price"
                    style={styles.inputLast}
                    placeholderTextColor="#6b7280"
                  />

                  {/* Save button with loading indicator */}
                  <TouchableOpacity
                    onPress={onPressSave}
                    disabled={loading}
                    style={[
                      styles.primaryButton,
                      loading && styles.primaryButtonDisabled,
                    ]}
                  >
                    {loading ? (
                      <ActivityIndicator />
                    ) : (
                      <Text style={styles.primaryButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>

                  <View style={styles.buttonSpacer} />

                  <TouchableOpacity
                    onPress={onClose}
                    disabled={loading}
                    style={[styles.cancelButton, loading && styles.cancelButtonDisabled]}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
              </ScrollView>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = {
  keyboardAvoid: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbe3ea',
    maxHeight: '90%',
  },
  scrollContent: {
    padding: 16,
  },
  titleText: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 10,
    color: '#111',
  },
  labelText: {
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 5,
    color: '#1f1f1f',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginBottom: 8,
    backgroundColor: '#fff',
    color: '#1f1f1f',
  },
  inputLast: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginBottom: 12,
    backgroundColor: '#fff',
    color: '#1f1f1f',
  },
  primaryButton: {
    backgroundColor: '#319241',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  // primaryButtonDisabled: {
  //   backgroundColor: '#9e9e9e',
  // },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  buttonSpacer: { height: 8 },
  cancelButton: {
    backgroundColor: '#e53935',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonDisabled: {
    opacity: 0.6,
  },
  cancelButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
};

export default React.memo(EditProduct);
