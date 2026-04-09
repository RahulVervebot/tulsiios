import React, {useState, useEffect} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { Camera, CameraType } from 'react-native-camera-kit';
import API_ENDPOINTS, { initICMSBase } from '../../../icms_config/api';
import CreateProductModal from '../CreateProductModal';

const LinkProductModal =  ({
  visible,
  onClose,
  onSelect,
  linkingItem,
  invoice,
}) => {

  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkingLoading, setLinkingLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scannerFlowActive, setScannerFlowActive] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [createProductVisible, setCreateProductVisible] = useState(false);
  const [createProductFlowActive, setCreateProductFlowActive] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [createPrefill, setCreatePrefill] = useState(null);

  // const vender = await AsyncStorage.getItem('vendor');
  const day = invoice?.SavedDate;
  const InvNumber = invoice?.SavedInvoiceNo;
  const vendorName = invoice?.InvoiceName;
  const [storedVendor, setStoredVendor] = useState(null);

  useEffect(() => {
    const loadVendor = async () => {
      try {
        const value = await AsyncStorage.getItem('vendor');


        if (value) {
          setStoredVendor(JSON.parse(value));
        }
      } catch (err) {
        console.error('Error loading vendor:', err);
      }
    };
    loadVendor();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const perm = Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;
        const result = await request(perm);
        setHasCameraPermission(result === RESULTS.GRANTED);
      } catch {
        setHasCameraPermission(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!scannerFlowActive) {
      return;
    }

    const timer = setTimeout(() => {
      setScannerVisible(true);
    }, 250);

    return () => clearTimeout(timer);
  }, [scannerFlowActive]);

  useEffect(() => {
    if (searchTerm.length < 2) {
      setProducts([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
       const token = await   AsyncStorage.getItem('access_token');
       const icms_store = await AsyncStorage.getItem('icms_store');
       console.log("AsyncStorage:",token);
        const queryValue = String(searchTerm ?? '').trim();
        const bodyPayload = {
          query: [queryValue],
        };
        console.log("queryValue:",bodyPayload);
        const res = await fetch(API_ENDPOINTS.FINDPRODUCTFROMHICKSVILL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'access_token': token,
          'mode': 'MOBILE',
          'store': icms_store
          },
          body: JSON.stringify(bodyPayload),
        });

        const data = await res.json();
        console.log('API response:', data);
        const matchedProducts =
          data?.matchedProducts ||
          data?.products ||
          data?.results ||
          [];
        setProducts(Array.isArray(matchedProducts) ? matchedProducts : []);
      } catch (err) {
        console.error('Error fetching products:', err);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchTerm]);

const linkProduct = async (item, qty) => {
  const safeString = (val, fallback = '') =>
    val === undefined || val === null ? fallback : String(val);
  const safeBoolString = (val, fallback = 'false') =>
    val === undefined || val === null ? fallback : String(!!val);

  const data = {
    invoiceName: safeString(vendorName),
    value: {
      Item: safeString(linkingItem?.itemNo),
      POS: safeString(item?.name),
      Barcode: safeString(item?.upc),
      PosSKU: safeString(item?.sku, '0'),
      isReviewed: safeBoolString(linkingItem?.isReviewed, 'true'),
      Description: safeString(item?.description || item?.name || linkingItem?.description),
      Size: safeString(item?.size || linkingItem?.size),
      Department: safeString(item?.department || linkingItem?.department),
      SellerCost: safeString(item?.cost),
      SellingPrice: safeString(item?.price),
      Quantity: safeString(qty, '0'),
      Price: safeString(item?.salePrice ?? item?.price),
      LinkingCorrect: safeBoolString(linkingItem?.LinkingCorrect, 'true'),
      LinkByBarcode: safeBoolString(linkingItem?.LinkByBarcode, 'false'),
      LinkByName: safeBoolString(linkingItem?.LinkByName, 'false'),
      InvoiceName: safeString(vendorName),
      InvoiceDate: safeString(day),
      InvoiceNo: safeString(InvNumber),
      ProductId: safeString(linkingItem?.ProductId),
      DefaultLinking: Boolean(linkingItem?.DefaultLinking ?? true),
      StockSpliting: Boolean(linkingItem?.StockSpliting ?? true),
    },
  };

  console.log("Sending data:", data);

  try {
      const icms_store = await AsyncStorage.getItem('icms_store');
    await initICMSBase();
    const token = await AsyncStorage.getItem('access_token');
    const app_url = await AsyncStorage.getItem('storeurl');
    console.log("API header:", token);
    const res = await fetch(API_ENDPOINTS.PRODUCTLINKING, {
  
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'access_token': token ?? '',
        'mode': 'MOBILE',
        'app_url': app_url ?? '',
        store: icms_store,
        vendordetails: storedVendor ? JSON.stringify(storedVendor) : '',
      },
      body: JSON.stringify(data) // ✅ Must be stringified
    });

    const result = await res.json(); // ✅ Read API response
    console.log("API Response:", result);
      console.log("res",res)

    if (!res.ok) {
      throw new Error(result.error || 'Failed to link product');
    }
  
    // Maybe close modal or show success
    alert('Product linked successfully!');
    return true;
  } catch (err) {
    console.error("Error linking product:", err);
    alert(`Error: ${err.message}`);
    return false;
  }
};

  const onReadCode = (event) => {
    const value = event?.nativeEvent?.codeStringValue;
    if (value) {
      setSearchTerm(String(value));
      setScannedBarcode(String(value));
      setSelectedProduct(null);
    }
    setScannerVisible(false);
    setScannerFlowActive(false);
  };

  const openScanner = () => {
    setScannerFlowActive(true);
  };

  const closeScanner = () => {
    setScannerVisible(false);
    setScannerFlowActive(false);
  };

  const extractCreatedProductForLinking = (payload) => {
    // Log the payload to see what we're receiving
    console.log('📦 extractCreatedProductForLinking payload:', JSON.stringify(payload, null, 2));
    
    // CreateProductModal sends either API response (data) OR request body (body)
    // Try multiple possible structures to find the actual form values
    let source = {};
    
    // Check if it's the direct body (has the form fields directly)
    if (payload?.name !== undefined || payload?.barcode !== undefined) {
      source = payload;
      console.log('📦 Using payload directly (request body)');
    }
    // Check if it's nested in result
    else if (payload?.result && (payload.result.name !== undefined || payload.result.barcode !== undefined)) {
      source = payload.result;
      console.log('📦 Using payload.result');
    }
    // Check if it's in data
    else if (payload?.data && (payload.data.name !== undefined || payload.data.barcode !== undefined)) {
      source = payload.data;
      console.log('📦 Using payload.data');
    }
    // Check if it's in data.result
    else if (payload?.data?.result && (payload.data.result.name !== undefined || payload.data.result.barcode !== undefined)) {
      source = payload.data.result;
      console.log('📦 Using payload.data.result');
    }
    // Last resort: try to find any object with form fields
    else {
      source = payload?.result || payload?.data?.result || payload?.data || payload || {};
      console.log('📦 Using fallback structure');
    }
    
    console.log('📦 Extracted source:', JSON.stringify(source, null, 2));
    
    // Helper: Get first defined value (checks undefined/null, but empty strings are valid)
    const getFirstDefined = (...values) => {
      for (const val of values) {
        if (val !== undefined && val !== null) {
          return String(val).trim();
        }
      }
      return '';
    };
    
    // Extract actual form values from the created product - these are what the user entered
    const linkedName = getFirstDefined(
      source?.name,                      // User entered name in CreateProductModal
      linkingItem?.description           // Fallback to invoice item description
    );
    
    const linkedBarcode = getFirstDefined(
      source?.barcode,                   // User entered barcode in CreateProductModal
      source?.upc,
      source?.product_barcode,
      scannedBarcode,                    // Scanned barcode
      searchTerm,                        // Search term
      linkingItem?.barcode               // Fallback to invoice item barcode
    );
    
    const linkedSize = getFirstDefined(
      source?.size,                      // User entered size in CreateProductModal
      source?.Size,
      linkingItem?.size                  // Fallback to invoice item size
    );
    
    // Department: CreateProductModal uses categ_id (category ID)
    const linkedDepartment = getFirstDefined(
      source?.categ_id,                  // User selected category in CreateProductModal
      source?.department,
      source?.department_name,
      linkingItem?.department            // Fallback to invoice item department
    );
    
    // Cost: standard_price is the unit cost field in CreateProductModal
    const linkedUnitCost = getFirstDefined(
      source?.standard_price,            // User entered cost in CreateProductModal
      source?.cost,
      linkingItem?.unitPrice             // Fallback to invoice item cost
    );
    
    // Price: list_price is the selling price field in CreateProductModal
    const linkedPrice = getFirstDefined(
      source?.list_price,                // User entered price in CreateProductModal
      source?.price,
      source?.salePrice,
      linkingItem?.extendedPrice         // Fallback to invoice item price
    );
    
    // Unit in case: user enters this in CreateProductModal
    const linkedUnitInCase = getFirstDefined(
      source?.unit_in_case,              // User entered unit in case in CreateProductModal
      source?.units_in_case,
      source?.unitc,
      linkingItem?.qty,                  // Fallback to invoice item qty
      '0'
    );

    // SKU: generated or entered by user
    const linkedSku = getFirstDefined(
      source?.sku,
      source?.default_code,
      source?.product_code,
      '0'
    );

    const extractedProduct = {
      name: linkedName,
      upc: linkedBarcode,
      sku: linkedSku,
      description: linkedName,          // Use the same name as description
      size: linkedSize,
      department: linkedDepartment,
      cost: linkedUnitCost,
      price: linkedPrice,
      salePrice: linkedPrice,
      unitInCase: linkedUnitInCase || '0',
    };

    console.log('✅ Extracted product for linking:', JSON.stringify(extractedProduct, null, 2));
    console.log('🔍 Field-by-field comparison:');
    console.log('  Name: source.name =', source?.name, '| extracted =', linkedName);
    console.log('  Barcode: source.barcode =', source?.barcode, '| extracted =', linkedBarcode);
    console.log('  Size: source.size =', source?.size, '| extracted =', linkedSize);
    console.log('  Cost: source.standard_price =', source?.standard_price, '| extracted =', linkedUnitCost);
    console.log('  Price: source.list_price =', source?.list_price, '| extracted =', linkedPrice);
    console.log('  UnitInCase: source.unit_in_case =', source?.unit_in_case, '| extracted =', linkedUnitInCase);
    console.log('  Department: source.categ_id =', source?.categ_id, '| extracted =', linkedDepartment);

    return extractedProduct;
  };

  const handleCreatedProduct = async (createdPayload) => {
    const createdItem = extractCreatedProductForLinking(createdPayload);
    const ok = await linkProduct(createdItem, createdItem.unitInCase);
    if (!ok) return;
    setCreateProductFlowActive(false);
    setCreateProductVisible(false);
    setSelectedProduct(null);
    setQuantity('');
    onSelect?.(createdItem);
    onClose?.();
  };

  return (
    <>
      <Modal
        visible={visible && !scannerFlowActive && !createProductFlowActive}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
          <View style={styles.modalCard}>
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          style={styles.modalBody}
        >
        <View style={styles.modalHeaderRow}>
          <Text style={styles.header}>Link Product</Text>
          <TouchableOpacity style={styles.closeIconBtn} onPress={onClose}>
            <Text style={styles.closeIconText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.linkingSummaryCard}>
          <Text style={styles.summaryTitle}>Invoice Row Details</Text>
          
          <View style={styles.descriptionCell}>
            <Text style={styles.summaryLabel}>Description</Text>
            <Text style={styles.descriptionValue} numberOfLines={1}>
              {linkingItem?.description || '-'}
            </Text>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>Item No</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {linkingItem?.itemNo || '-'}
              </Text>
            </View>
             <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>Case Cost</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {isNaN(parseFloat(linkingItem?.unitPrice)) ? (linkingItem?.unitPrice || '-') : parseFloat(linkingItem?.unitPrice).toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>Extended Price</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {isNaN(parseFloat(linkingItem?.extendedPrice)) ? (linkingItem?.extendedPrice || '-') : parseFloat(linkingItem?.extendedPrice).toFixed(2)}
              </Text>
            </View>
              <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>Qty</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {linkingItem?.qty ?? '-'}
              </Text>
          
            </View>
          </View>
        </View>

        {!selectedProduct ? (
          // 🔍 Search & list view
          <>
            <Text style={styles.sectionHeader}>Search Product</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.searchInput, styles.searchInputFlex]}
                placeholder="Type product name or barcode"
                value={searchTerm}
                onChangeText={setSearchTerm}
                placeholderTextColor="#6b7280"
              />
              <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
                <Icon name="camera-alt" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            {loading && <ActivityIndicator size="small" color="#000" />}
            <FlatList
              data={products}
              style={styles.resultsList}
              contentContainerStyle={styles.resultsContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item, idx) =>
                (item.upc || item.sku || idx).toString()
              }
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.resultItem}
                  onPress={() => setSelectedProduct(item)}>
                  <Text style={styles.productName}>{item.name}</Text>
                  <Text style={styles.productBarcode}>{item.upc}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                !loading && searchTerm.length >= 2 ? (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.noResult}>No products found</Text>
                    <TouchableOpacity
                      style={styles.createNewBtn}
                      onPress={() => {
                        // Only use searchTerm as barcode if it's numeric (real barcode) or was scanned
                        const isNumericBarcode = /^[\d\s\-]+$/.test(String(searchTerm).trim());
                        const barcodeValue = scannedBarcode 
                          ? String(scannedBarcode).trim()
                          : isNumericBarcode 
                            ? String(searchTerm).trim()
                            : String(linkingItem?.barcode ?? '').trim();
                        
                        setCreatePrefill({
                          name: String(linkingItem?.description ?? '').trim(),
                          size: String(linkingItem?.size ?? '').trim(),
                          barcode: barcodeValue,
                          case_cost: String(linkingItem?.unitPrice ?? '').trim(),
                          vendor_name: String(vendorName ?? '').trim(),
                        });
                        setCreateProductFlowActive(true);
                        setCreateProductVisible(true);
                      }}
                    >
                      <Text style={styles.createNewBtnText}>Create New Product</Text>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
            />
          </>
        ) : (
          // 📦 Product detail + quantity view
          <ScrollView
            style={styles.selectedScroll}
            contentContainerStyle={styles.selectedContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionHeader}>Product Details</Text>
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>Name:</Text>
              <Text style={styles.detailValue}>{selectedProduct.name}</Text>

              <Text style={styles.detailLabel}>UPC:</Text>
              <Text style={styles.detailValue}>{selectedProduct.upc}</Text>

              <Text style={styles.detailLabel}>Department:</Text>
              <Text style={styles.detailValue}>
                {selectedProduct.department}
              </Text>

              <Text style={styles.detailLabel}>Size:</Text>
              <Text style={styles.detailValue}>{selectedProduct.size}</Text>

              <Text style={styles.detailLabel}>Cost:</Text>
              <Text style={styles.detailValue}>${selectedProduct.cost}</Text>

              <Text style={styles.detailLabel}>Price:</Text>
              <Text style={styles.detailValue}>${selectedProduct.price}</Text>
            </View>

            <Text style={[styles.detailLabel, {marginTop: 20}]}>
              Enter Unit in Case*
            </Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Unit in case"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
              placeholderTextColor="#6b7280"
            />

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                ((!quantity || quantity === '0') || linkingLoading) && styles.confirmBtnDisabled
              ]}
              disabled={!quantity || quantity === '0' || linkingLoading}
              onPress={async () => {
                // Validate quantity
                if (!quantity || quantity.trim() === '' || quantity === '0') {
                  alert('Please enter a valid Unit in Case (must be greater than 0)');
                  return;
                }
                setLinkingLoading(true);
                try {
                  const ok = await linkProduct(selectedProduct, quantity);
                  if (!ok) return;
                  onSelect(selectedProduct);
                  setSelectedProduct(null);
                  setQuantity('');
                  onClose();
                } finally {
                  setLinkingLoading(false);
                }
              }}>
              {linkingLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmText}>Confirm Link</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setSelectedProduct(null)}>
              <Text style={styles.closeText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
        </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>
      <CreateProductModal
        visible={createProductVisible}
        onClose={() => { setCreateProductFlowActive(false); setCreateProductVisible(false); }}
        onCreated={handleCreatedProduct}
        initialValues={createPrefill}
      />

      <Modal visible={scannerVisible} animationType="slide" onRequestClose={closeScanner}>
        {hasCameraPermission ? (
          <View style={{ flex: 1 }}>
            <Camera style={styles.camera} cameraType={CameraType.Back} scanBarcode onReadCode={onReadCode} />
            <View style={styles.controls}>
              <TouchableOpacity style={styles.controlBtn} onPress={closeScanner}>
                <Text style={styles.controlText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.permissionDenied}>
            <Text style={{ color: 'red' }}>Camera permission denied. Please allow access in settings.</Text>
            <TouchableOpacity style={styles.controlBtn} onPress={closeScanner}>
              <Text style={styles.controlText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </>
  );
};

export default LinkProductModal;

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '96%',
    maxWidth: 700,
    height: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbe3ea',
    padding: 14,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  modalBody: { flex: 1 },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  header: {fontSize: 18, fontWeight: '800', color: '#111'},
  closeIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d6dee8',
  },
  closeIconText: { color: '#475569', fontSize: 14, fontWeight: '800' },
  linkingSummaryCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  descriptionCell: {
    width: '100%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  descriptionValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  summaryCell: {
    width: '48%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  sectionHeader: {fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#111'},
  searchInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#fff',
    color: '#1f1f1f',
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  searchInputFlex: { flex: 1, marginBottom: 0 },
  scanBtn: {
    backgroundColor: '#319241',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsList: {
    flex: 1,
    minHeight: 180,
  },
  resultsContent: {
    paddingBottom: 10,
    flexGrow: 1,
  },
  selectedScroll: {
    flex: 1,
  },
  selectedContent: {
    paddingBottom: 12,
  },
  detailCard: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 10,
},
detailLabel: {
  fontWeight: 'bold',
  fontSize: 14,
  marginTop: 6,
  color: '#1f1f1f',
},
detailValue: {
  fontSize: 14,
  marginBottom: 4,
  color: '#1f1f1f',
},

  resultItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  productName: {fontSize: 16, color: '#1f1f1f'},
  productBarcode: {fontSize: 12, color: '#666'},
  noResult: {textAlign: 'center', color: '#666', marginTop: 20},
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  createNewBtn: {
    marginTop: 10,
    backgroundColor: '#319241',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  createNewBtnText: { color: '#fff', fontWeight: '700' },
  confirmBtn: {
    backgroundColor: '#5cb85c',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  confirmBtnDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  confirmText: {textAlign: 'center', color: '#fff', fontWeight: 'bold'},
  closeBtn: {
    backgroundColor: '#d9534f',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  closeText: {textAlign: 'center', color: '#fff', fontWeight: 'bold'},
  camera: { flex: 1 },
  controls: { position: 'absolute', bottom: 30, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  controlBtn: { backgroundColor: '#000000AA', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  controlText: { color: '#fff', fontWeight: '700' },
  permissionDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
});
