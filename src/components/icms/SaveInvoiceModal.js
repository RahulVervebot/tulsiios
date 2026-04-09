import React, { useState, useCallback, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ActivityIndicator,Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_ENDPOINTS, { initICMSBase } from '../../../icms_config/api';
import DateTimePicker from '@react-native-community/datetimepicker';
const SaveInvoiceModal = ({ isVisible, onClose,ImageURL, vendorName, defaultInvoiceNo = '', defaultInvoiceDateISO = '', tableData,cleardata,selectedVendor }) => {
  const [savedInvoiceNo, setSavedInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date());
  const [showInvoiceDatePicker, setShowInvoiceDatePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invoiceMode, setInvoiceMode] = useState('new'); // 'new' | 'existing'
   const baseurl = "https://icmsfrontend.vervebot.io";
     const [ocrurl, setOcrUrl] = useState(null);
   
       const [user_email, setUserEmail] = useState('');
  useFocusEffect(
    useCallback(() => {
      initICMSBase();
      const fetchInitialData = async () => {
        try {
          // Retrieve any needed tokens/urls (if used by fetchManageOrderReport)
             const userEmail = await AsyncStorage.getItem('userEmail');
          const temocrurl = await AsyncStorage.getItem('ocrurl');
      
          setUserEmail(userEmail || '');

          setOcrUrl(temocrurl);
        } catch (error) {
          console.error('Error fetching initial data:', error);
        }
      };
      fetchInitialData();
    }, [])
  );

  useEffect(() => {
    if (!isVisible) return;

    const invoiceNoFromOCR = String(defaultInvoiceNo || '').trim();
    const dateFromOCR = String(defaultInvoiceDateISO || '').trim();

    setSavedInvoiceNo(invoiceNoFromOCR);

    const parsed = dateFromOCR ? new Date(dateFromOCR) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) {
      setInvoiceDate(parsed);
    } else {
      setInvoiceDate(new Date());
    }
    setInvoiceMode('new');
  }, [isVisible, defaultInvoiceNo, defaultInvoiceDateISO]);
  const handleSubmit = async () => {
    if (!savedInvoiceNo.trim()) {
      Alert.alert('Missing Invoice Number', 'Please enter a valid invoice number.');
      return;
    }
    setIsSubmitting(true);
     const invdata = tableData.map((row) => ({
        qty: row.qty || '',
        itemNo: row.itemNo || '',
        description: row.description || '',
        unitPrice: row.unitPrice || '',
        extendedPrice: row.extendedPrice || '',
        pieces: row.pieces || '',
        sku: row.sku || '',
        barcode: row.barcode || '',
        posName: row.posName || '',
        department: row.department || '',
        condition: row.condition || '',
        source: row.source || ''
      }))
    const selectedDate = invoiceDate.toISOString().split('T')[0];
    const bodyPayload = {
      InvoicesImgUrls: ImageURL,
      InvoiceName: vendorName,
      InvoiceDate: selectedDate,
      InvoicePage: '',
      UserDetailInfo: {
       InvoiceUpdatedby: user_email,
       date: selectedDate,
      
      },
      InvoiceData: invdata,
      SavedDate: selectedDate,
      SavedInvoiceNo: savedInvoiceNo,
      Exist: invoiceMode === 'existing',
    };

    try {
        console.log("bodyPayload",bodyPayload);
        const token = await   AsyncStorage.getItem('access_token');
          const icms_store = await   AsyncStorage.getItem('icms_store');
         const storeurl = await AsyncStorage.getItem('storeurl');
        const vendordetails = selectedVendor;
        console.log("vendordetails",vendordetails);
        // const vendordetails = '{"value":"Chetak","slug":"chetak","jsonName":"chetak-products.json","emptyColumn":true,"databaseName":"chetakproducts"}'
        const response = await fetch(API_ENDPOINTS.SAVE_INVOICE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'store': icms_store,
         'access_token': token,
          'mode': 'MOBILE',
            'app_url': storeurl ?? '',
          vendordetails : JSON.stringify(vendordetails),
        },
        body: JSON.stringify(bodyPayload),
        });

      const data = await response.json();
      if(data.message){
        Alert.alert(data.message || 'Invoice saved successfully.');
      }
      console.log('saved response', data);
      // await handleCreateInvoice();
      cleardata?.();
      setSavedInvoiceNo('');
      setInvoiceDate(new Date());
      setInvoiceMode('new');
      onClose();
     } catch (error) {
      Alert.alert('Error', 'Failed to save invoice.');
      console.log('error', error);
    } finally {
      setIsSubmitting(false);
    }

  };

const handleCreateInvoice = async () => {
  if (!savedInvoiceNo.trim()) {
    Alert.alert('Missing Invoice Number', 'Please enter a valid invoice number.');
    return;
  }

  const invoiceNo = savedInvoiceNo.trim();
  const invoiceSavedDate = invoiceDate.toISOString().split('T')[0];

  // keep as a JSON string if your backend expects it in a header
       const vendordetails = selectedVendor;
//  const vendordetails = '{"value":"Chetak","slug":"chetak","jsonName":"chetak-products.json","emptyColumn":true,"databaseName":"chetakproducts"}';

  // ✅ Correct payload shape for CREATE_INVOICE
  const bodyPayload = {
    InvoiceName: vendorName,
    invoiceSavedDate,
    invoiceNo,
    tableData: tableData.map((row, idx) => ({
      qty: row.qty || '',
      itemNo: row.itemNo || '',
      description: row.description || '',
      unitPrice: row.unitPrice || '',
      extendedPrice: row.extendedPrice || '',
      pieces: row.pieces || '',
      sku: row.sku || '',
      barcode: row.barcode || '',
      posName: row.posName || '',
      department: row.department || '',
      condition: row.condition || '',
      // New field:
      ProductId: `${invoiceNo}-${idx}-${invoiceSavedDate}`, // use idx+1 if you prefer 1-based
    })),
    email: 'tusharvervebot@gmail.com',
  };

  try {
    console.log('Create_bodyPayload', bodyPayload);
    const token = await AsyncStorage.getItem('access_token');
  const icms_store = await AsyncStorage.getItem('icms_store');
  const storeurl = await AsyncStorage.getItem('storeurl');
    const vendorlist =  JSON.stringify(vendordetails)
    const response = await fetch(API_ENDPOINTS.CREATE_INVOICE, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'store': icms_store,
        'access_token': token ?? '',
        'mode': 'MOBILE',
          'app_url': storeurl ?? '',
       vendordetails: JSON.stringify(vendordetails),
      },
      body: JSON.stringify(bodyPayload),
    });

    // Read the body ONCE as text
    const raw = await response.text();

    // If not ok, surface server message (often plain text like "Already exists")
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${raw || 'No response body'}`);
    }

    // Try to parse JSON (server might return plain text)
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      console.warn('Non-JSON response from CREATE_INVOICE:', raw);
      // optional: wrap plain text so you still have something structured
      data = { message: raw };
    }

    console.log('created response', data);
    Alert.alert('Success', 'Invoice created successfully.');
    // cleardata();
  } catch (error) {
    console.log('create error', error);
    Alert.alert('Error', error.message || 'Failed to create invoice.');
  }
};

    return (
    <Modal visible={isVisible} transparent animationType="fade">
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modeToggleWrap}>
            <TouchableOpacity
              style={[
                styles.modeToggleBtn,
                invoiceMode === 'new' && styles.modeToggleBtnActive,
              ]}
              onPress={() => setInvoiceMode('new')}
              disabled={isSubmitting}
            >
              <Text
                style={[
                  styles.modeToggleText,
                  invoiceMode === 'new' && styles.modeToggleTextActive,
                ]}
              >
                New
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeToggleBtn,
                invoiceMode === 'existing' && styles.modeToggleBtnActive,
              ]}
              onPress={() => setInvoiceMode('existing')}
              disabled={isSubmitting}
            >
              <Text
                style={[
                  styles.modeToggleText,
                  invoiceMode === 'existing' && styles.modeToggleTextActive,
                ]}
              >
                Existing
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.title}>Enter Invoice Number</Text>
          <TextInput
            style={styles.input}
            value={savedInvoiceNo}
            onChangeText={setSavedInvoiceNo}
            placeholder="Enter invoice number"
            placeholderTextColor="#aaa"
          />
          <Text style={styles.label}>Invoice Date</Text>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowInvoiceDatePicker(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.dateText}>{invoiceDate.toISOString().split('T')[0]}</Text>
          </TouchableOpacity>

          {Platform.OS === 'ios' && (
            <Modal
              visible={showInvoiceDatePicker}
              transparent
              animationType="fade"
              onRequestClose={() => setShowInvoiceDatePicker(false)}
            >
              <TouchableOpacity
                style={styles.datePickerOverlay}
                activeOpacity={1}
                onPress={() => setShowInvoiceDatePicker(false)}
              />
              <View style={styles.datePickerCard}>
                <DateTimePicker
                  value={invoiceDate}
                  mode="date"
                  display="inline"
                  themeVariant="light"
                  accentColor="#2f8f43"
                  textColor="#111111"
                  onChange={(_e, d) => { if (d) setInvoiceDate(d); }}
                />
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: '#2f8f43', marginHorizontal: 16, marginBottom: 14, flex: 0 }]}
                  onPress={() => setShowInvoiceDatePicker(false)}
                >
                  <Text style={styles.buttonText}>Done</Text>
                </TouchableOpacity>
              </View>
            </Modal>
          )}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={[styles.button,{backgroundColor: '#2f8f43'}, isSubmitting && styles.disabledButton]} onPress={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Submit</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.cancelButton, isSubmitting && styles.disabledButton]} onPress={onClose} disabled={isSubmitting}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {Platform.OS === 'android' && showInvoiceDatePicker && (
        <DateTimePicker
          value={invoiceDate}
          mode="date"
          display="default"
          onChange={(_e, d) => {
            setShowInvoiceDatePicker(false);
            if (d) setInvoiceDate(d);
          }}
        />
      )}
    </Modal>
  );
};

export default SaveInvoiceModal;

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Dark overlay background
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modeToggleWrap: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#f3f5f7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d6dbe1',
    padding: 4,
    marginBottom: 12,
  },
  modeToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeToggleBtnActive: {
    backgroundColor: '#319241',
  },
  modeToggleText: {
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '700',
  },
  modeToggleTextActive: {
    color: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginBottom: 12,
    color: '#333',
  },
  label: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  dateText: {
    fontSize: 16,
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    flex: 1,
    backgroundColor: '#007BFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#FF4D4D',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.7,
  },
  datePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  datePickerCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 10,
  },
});
