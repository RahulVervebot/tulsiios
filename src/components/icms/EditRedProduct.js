import React, { useEffect, useRef, useState } from 'react';
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
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_ENDPOINTS, { initICMSBase } from '../../../icms_config/api';

const toString = (val, fallback = '') =>
  val === undefined || val === null ? fallback : String(val);
const toArray = val => (Array.isArray(val) ? val : []);

const buildUpdatePayload = item => {
  const barcode = toString(item?.Barcode ?? item?.barcode).trim();
  const hasBarcode = Boolean(barcode);

  return {
    updateFields: [
      {
        itemNumber: toString(
          item?.Item ?? item?.itemNumber ?? item?.ItemNo ?? item?.itemNo,
        ),
        description: toString(item?.Description ?? item?.description),
        Quantity: toString(item?.Quantity ?? item?.quantity ?? item?.Qty),
        price: toString(item?.price ?? item?.Price ?? item?.unitPrice),
        extendedPrice: toString(item?.extendedPrice ?? item?.ExtendedPrice),
        DefaultLinking: true,
        sku: toString(item?.sku ?? item?.SKU),
        Barcode: barcode,
        category: toString(item?.category ?? item?.Category),
        POS: toString(item?.POS ?? item?.PosName),
        PosSKU: toString(item?.PosSKU ?? item?.posSku),
        isReviewed: hasBarcode,
        Size: toString(item?.Size ?? item?.size),
        Department: toString(item?.Department ?? item?.department),
        SellingPrice: toString(item?.SellingPrice ?? item?.sellingPrice),
        SellerCost: toString(item?.SellerCost ?? item?.sellerCost),
        Details: toString(item?.Details ?? item?.details),
        LinkingCorrect: hasBarcode,
        productVerified: toString(item?.productVerified ?? ''),
        productVerifiedBy: toString(item?.productVerifiedBy ?? ''),
        productVerifiedDate: toString(item?.productVerifiedDate ?? ''),
        AlignItems: toArray(item?.AlignItems ?? item?.alignItems),
        Variants: toArray(item?.Variants ?? item?.variants),
        StockSpliting: true,
        StockSplitingPercentage: toString(
          item?.StockSplitingPercentage ?? item?.stockSplitingPercentage ?? '',
        ),
        linkingIsReceviedFromPOS: hasBarcode,
        dbNameConn: toString(
          item?.dbNameConn ?? item?.databaseName ?? item?.dbName ?? '',
        ),
        productAddedDate: toString(item?.productAddedDate ?? item?.createdAt ?? ''),
      },
    ],
  };
};

function EditRedProduct({ visible, item, onClose, onSave }) {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    description: '',
    quantity: '',
    size: '',
    barcode: '',
    department: '',
  });

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

  useEffect(() => {
    if (!item) return;
    setForm({
      description: toString(item?.Description ?? item?.description),
      quantity: toString(item?.Quantity ?? item?.quantity ?? item?.Qty),
      size: toString(item?.Size ?? item?.size ?? item?.Size),
      barcode: toString(item?.Barcode ?? item?.barcode),
      department: toString(item?.Department ?? item?.department),
      // price: toString(item?.price ?? item?.Price ?? item?.unitPrice),
      // extendedPrice: toString(item?.extendedPrice ?? item?.ExtendedPrice),
    });
  }, [item, visible]);

  if (!item) return null;

  const handleUpdate = async updatedItem => {
    setLoading(true);
    try {
      await initICMSBase();
      const token = await AsyncStorage.getItem('access_token');
      const icms_store = await AsyncStorage.getItem('icms_store');
      const res = await fetch(API_ENDPOINTS.UPDATE_RED_PRODUCTS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: token ?? '',
          mode: 'MOBILE',
          store: icms_store ?? '',
        },
        body: JSON.stringify(buildUpdatePayload(updatedItem)),
      });
console.log("updatedItem", JSON.stringify(buildUpdatePayload(updatedItem)));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('Update red products failed:', data);
        Alert.alert('Save Failed', data?.message || 'Unable to update item.');
        return false;
      }
      Alert.alert('Item Saved Successfully');
      return true;
    } catch (err) {
      console.error('Error updating red product:', err);
      Alert.alert('Save Failed', 'Unable to update item.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const onPressSave = async () => {
    const updatedItem = {
      ...item,
      Description: form.description,
      description: form.description,
      Quantity: form.quantity,
      quantity: form.quantity,
      Size: form.size,
      size: form.size,
      Barcode: form.barcode,
      barcode: form.barcode,
      Department: form.department,
      department: form.department,
    };
    const ok = await handleUpdate(updatedItem);
    if (!ok) return;
    onSave?.(updatedItem);
    onClose?.();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
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
                        outputRange: [300, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text
                style={styles.titleText}
              >
                Edit Red Product
              </Text>

              <Text
                style={styles.labelText}
              >
                Description:
              </Text>
              <TextInput
                value={form.description}
                onChangeText={text =>
                  setForm(prev => ({ ...prev, description: text }))
                }
                placeholder="Description"
                style={styles.input}
                placeholderTextColor="#6b7280"
              />

              <Text
                style={styles.labelText}
              >
                Quantity:
              </Text>
              <TextInput
                value={form.quantity}
                keyboardType="numeric"
                onChangeText={text =>
                  setForm(prev => ({ ...prev, quantity: text }))
                }
                placeholder="Quantity"
                style={styles.input}
                placeholderTextColor="#6b7280"
              />

              {/* <Text
                style={styles.labelText}
              >
                Price:
              </Text>
              <TextInput
                value={form.price}
                keyboardType="numeric"
                onChangeText={text =>
                  setForm(prev => ({ ...prev, price: text }))
                }
                placeholder="Price"
                style={styles.input}
                placeholderTextColor="#6b7280"
              /> */}

              <Text
                style={styles.labelText}
              >
                Size:
              </Text>
              <TextInput
                value={form.size}
                keyboardType="numeric"
                onChangeText={text =>
                  setForm(prev => ({ ...prev, size: text }))
                }
                placeholder="Size"
                style={styles.input}
                placeholderTextColor="#6b7280"
              />

              <Text
                style={styles.labelText}
              >
                Barcode:
              </Text>
              <TextInput
                value={form.barcode}
                keyboardType="numeric"
                onChangeText={text =>
                  setForm(prev => ({ ...prev, barcode: text }))
                }
                placeholder="Barcode"
                style={styles.input}
                placeholderTextColor="#6b7280"
              />

              <Text
                style={styles.labelText}
              >
                Department:
              </Text>
              <TextInput
                value={form.department}
                onChangeText={text =>
                  setForm(prev => ({ ...prev, department: text }))
                }
                placeholder="Department"
                style={styles.inputLast}
                placeholderTextColor="#6b7280"
              />

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
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
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
    backgroundColor: '#007bff',
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
});

export default React.memo(EditRedProduct);
