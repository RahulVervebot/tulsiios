import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
  Platform,
  ImageBackground,
  PanResponder,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import API_ENDPOINTS, { initICMSBase } from '../../../icms_config/api';
import tulsiBg from '../../assets/images/bg-tulsi-2.jpeg';
import reportbg from '../../assets/images/report-bg.png';
import invoiceSavedGif from '../../assets/images/invoice_saved_pending_list.gif';
import invoiceView from '../../assets/images/View_Invoice.gif';
import invoiceView from '../../assets/images/View_Invoice.gif';
import invoiceSaving from '../../assets/images/Saving.gif';
import invoiceClose from '../../assets/images/Close_screen.gif';
import AppHeader from '../AppHeader';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Camera, CameraType } from 'react-native-camera-kit';
import { launchImageLibrary } from 'react-native-image-picker';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { sendNotificationToStoreUsers } from '../../config/OneSignalConfig';

const COLORS = {
  bg: '#ffffff',
  card: '#f7f9fc',
  border: '#e6e8ef',
  primary: '#319241',
  danger: '#D9534F',
  text: '#111',
};

const THUMB_WIDTH = 112;

const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

function moveItem(arr, from, to) {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) {
    return arr;
  }
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const AddNewVendorInvoice = () => {
  const navigation = useNavigation();
  const cameraRef = useRef(null);
  const snapSliderRef = useRef(null);
  const [step, setStep] = useState(1);
  const [newVendorInput, setNewVendorInput] = useState('');
  const [newVendor, setNewVendor] = useState('');
  const [snappedImages, setSnappedImages] = useState([]); // [{id, uri, base64}]
  const [showCamera, setShowCamera] = useState(false);
  const [buttonLoading, setButtonLoading] = useState({
    snap: false,
    gallery: false,
    upload: false,
    save: false,
  });
  const [saveInvoiceNo, setSaveInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date());
  const [showInvoiceDatePicker, setShowInvoiceDatePicker] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [savePopupVisible, setSavePopupVisible] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const setBtnLoading = (key, value) => {
    setButtonLoading((prev) => ({ ...prev, [key]: value }));
  };

  const requestCameraPerm = async () => {
    const perm = Platform.select({
      ios: PERMISSIONS.IOS.CAMERA,
      android: PERMISSIONS.ANDROID.CAMERA,
    });
    if (!perm) return true;
    const result = await request(perm);
    return result === RESULTS.GRANTED;
  };

  const handleOpenCamera = async () => {
    const ok = await requestCameraPerm();
    if (!ok) {
      Alert.alert('Permission needed', 'Camera permission is required.');
      return;
    }
    setShowCamera(true);
  };

  const pickFromGallery = async () => {
    const perm = Platform.select({
      ios: PERMISSIONS.IOS.PHOTO_LIBRARY,
      android: PERMISSIONS.ANDROID.READ_MEDIA_IMAGES,
    });

    setBtnLoading('gallery', true);
    try {
      if (perm) {
        const r = await request(perm);
        if (r !== RESULTS.GRANTED && Platform.OS === 'android') {
          const r2 = await request(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
          if (r2 !== RESULTS.GRANTED) {
            Alert.alert('Permission needed', 'Photos permission is required.');
            return;
          }
        } else if (r !== RESULTS.GRANTED && Platform.OS === 'ios') {
          Alert.alert('Permission needed', 'Photos permission is required.');
          return;
        }
      }

      const res = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        includeBase64: true,
        selectionLimit: 0,
      });

      if (res?.assets?.length) {
        const add = res.assets.map((a, idx) => ({
          id: `${Date.now()}-${idx}`,
          uri: a.uri,
          base64: a.base64 || null,
        }));
        setSnappedImages((prev) => [...prev, ...add]);
      }
    } catch (error) {
      console.warn('Gallery picker error:', error);
    } finally {
      setBtnLoading('gallery', false);
    }
  };

  const snapPhoto = async () => {
    if (!cameraRef.current) return;
    setBtnLoading('snap', true);
    try {
      const photo = await cameraRef.current.capture();
      setSnappedImages((prev) => [
        ...prev,
        { id: `${Date.now()}-${prev.length}`, uri: photo?.uri, base64: null },
      ]);
    } catch (e) {
      console.warn('Error snapping photo:', e);
    } finally {
      setBtnLoading('snap', false);
    }
  };

  const removeSnappedImage = (index) => {
    setSnappedImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const clearAll = () => {
    setStep(1);
    setNewVendor('');
    setNewVendorInput('');
    setSnappedImages([]);
    setSaveInvoiceNo('');
    setInvoiceDate(new Date());
    setShowInvoiceDatePicker(false);
    setShowCamera(false);
  };

  const getNormalizedVendorFileName = (value) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  const handleStepOneNext = () => {
    const trimmed = newVendorInput.trim();
    if (!trimmed) {
      Alert.alert('Missing Vendor', 'Please enter a vendor name.');
      return;
    }
    setNewVendor(trimmed);
    setStep(2);
  };

  const handleStepTwoNext = () => {
    if (!snappedImages.length) {
      Alert.alert('No images', 'Please upload at least one invoice image.');
      return;
    }
    setStep(3);
  };

  const reorderByDrag = (fromIndex, dx) => {
    const shift = Math.round(dx / THUMB_WIDTH);
    const toIndex = Math.max(0, Math.min(snappedImages.length - 1, fromIndex + shift));
    if (toIndex !== fromIndex) {
      setSnappedImages((prev) => moveItem(prev, fromIndex, toIndex));
    }
  };

  const createDragResponder = (index) => {
    let startX = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gestureState) => Math.abs(gestureState.dx) > 8,
      onPanResponderGrant: () => {
        startX = 0;
      },
      onPanResponderMove: (_evt, gestureState) => {
        startX = gestureState.dx;
      },
      onPanResponderRelease: () => {
        reorderByDrag(index, startX);
      },
    });
  };

  const saveNewVendorInvoice = async () => {
    if (!newVendor.trim()) {
      Alert.alert('Missing Vendor', 'Please add a vendor name.');
      return;
    }
    if (!saveInvoiceNo.trim()) {
      Alert.alert('Missing Invoice Number', 'Please enter a valid invoice number.');
      return;
    }
    if (!snappedImages.length) {
      Alert.alert('No images', 'Please upload at least one invoice image.');
      return;
    }

    setBtnLoading('save', true);
    setSaveSuccess(false);
    setSavePopupVisible(true);
    try {
      await initICMSBase();
      const token = await AsyncStorage.getItem('access_token');
      const icms_store = await AsyncStorage.getItem('icms_store');
      const storeurl = await AsyncStorage.getItem('storeurl');
      const uploadedImageURLs = [];
      for (let i = 0; i < snappedImages.length; i++) {
        const img = snappedImages[i];
        const normalizedVendorName = getNormalizedVendorFileName(newVendor);
        const fileOriginalName = `${normalizedVendorName || 'vendor'},jpg`;
        console.log("fileOriginalName:",fileOriginalName);
        const formData = new FormData();
        formData.append('file', {
          uri: img.uri,
          type: 'image/jpeg',
          name: fileOriginalName,
        });

        const uploadResponse = await fetch(API_ENDPOINTS.UPLOAD_IMAGE, {
          method: 'POST',
          headers: {
            'Content-Type': 'multipart/form-data',
            store: `${icms_store}`,
            mode: 'MOBILE',
            access_token: token,
            app_url: storeurl ?? '',
          },
          body: formData,
        });

        if (!uploadResponse.ok) {
          const t = await uploadResponse.text();
          throw new Error(`Upload failed (${uploadResponse.status}): ${t}`);
        }

        const uploadJson = await uploadResponse.json();
        console.log("upload response new vendor:",uploadJson);
        const imageURL = uploadJson?.message?.imageURL?.Location;
        if (imageURL) {
          uploadedImageURLs.push(imageURL);
        } else {
          throw new Error(`Missing imageURL in upload index ${i}`);
        }
      }

      const userEmail = await AsyncStorage.getItem('userEmail');
      const savedDate = invoiceDate.toISOString().split('T')[0];
      const storePayload = {
        UserInvoiceName: getNormalizedVendorFileName(newVendor),
        status: 'REQUESTED',
        SavedDate: savedDate,
        SavedInvoiceNo: saveInvoiceNo.trim(),
        InvoicesImgUrls: uploadedImageURLs,
        MobileIcmsUserEmail: userEmail || '',
        IcmsUserEmail: '',
      };

      const storeResponse = await fetch(API_ENDPOINTS.ROWINOVICE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: token,
          mode: 'MOBILE',
          store: icms_store,
          app_url: storeurl ?? '',
        },
        body: JSON.stringify(storePayload),
      });
     console.log("store payload:",storePayload);
      if (!storeResponse.ok) {
        const t = await storeResponse.text();
        throw new Error(`Store invoice failed (${storeResponse.status}): ${t}`);
      }

      console.log("row response:",storeResponse);
      setSaveSuccess(true);

      sendNotificationToStoreUsers(
        'Invoice Saved',
        'Invoice saved successfully, please visit pending invoice list to check.',
        '',
        { type: 'invoice_saved' }
      ).catch((notifyErr) => console.warn('Invoice saved notification failed:', notifyErr));
    } catch (e) {
      console.error('Upload/store failed:', e);
      setSavePopupVisible(false);
      Alert.alert('Error', e.message || 'Failed to save invoice');
    } finally {
      setBtnLoading('save', false);
    }
  };

  const handleConfirmUpload = async () => {
    await saveNewVendorInvoice();
  };

  const handleViewPendingInvoices = () => {
    setSavePopupVisible(false);
    setSaveSuccess(false);
    clearAll();
    navigation.navigate('PendingNewInvoices');
  };

  const stepTitle = useMemo(() => {
    if (step === 1) return 'Step 1: Add New Vendor';
    if (step === 2) return 'Step 2: Upload Invoice Images';
    return 'Step 3: Invoice Details & Save';
  }, [step]);
  const stepItems = [
    { id: 1, label: 'Add Vendor' },
    { id: 2, label: 'Upload Invoice' },
    { id: 3, label: 'Save Details' },
  ];

  return (
    <ImageBackground source={getImageSource(tulsiBg)} style={styles.screen} resizeMode="cover">
      <AppHeader Title="ADD NEW VENDOR INVOICE" backgroundType="image" backgroundValue={reportbg} />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.stepperCard}>
          <View style={styles.stepperRow}>
            {stepItems.map((item, index) => {
              const isActive = step === item.id;
              const isDone = step > item.id;
              return (
                <React.Fragment key={item.id}>
                  <View style={styles.stepperItem}>
                    <View style={[styles.stepDot, isActive && styles.stepDotActive, isDone && styles.stepDotDone]}>
                      <Text style={[styles.stepDotText, (isActive || isDone) && styles.stepDotTextActive]}>
                        {isDone ? '✓' : item.id}
                      </Text>
                    </View>
                    <Text style={[styles.stepLabel, isActive && styles.stepLabelActive, isDone && styles.stepLabelDone]}>
                      {item.label}
                    </Text>
                  </View>
                  {index < stepItems.length - 1 && (
                    <View style={[styles.stepConnector, step > item.id && styles.stepConnectorDone]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        </View>

        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>{stepTitle}</Text>

          {step === 1 && (
            <View style={styles.sectionWrap}>
              <TextInput
                style={styles.input}
                value={newVendorInput}
                onChangeText={setNewVendorInput}
                placeholder="Enter new vendor name"
                placeholderTextColor="#9aa0a6"
              />
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleStepOneNext}>
                <Text style={styles.btnText}>Next</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 2 && (
            <View style={styles.sectionWrap}>
              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.btn, styles.btnLight]} onPress={handleOpenCamera}>
                  <Text style={[styles.btnText, styles.btnLightText]}>{showCamera ? 'Camera Active' : 'Upload Invoice'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnLight]}
                  onPress={pickFromGallery}
                  disabled={buttonLoading.gallery}
                >
                  {buttonLoading.gallery ? (
                    <ActivityIndicator size="small" color="#256f3a" />
                  ) : (
                    <Text style={[styles.btnText, styles.btnLightText]}>From Gallery</Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.helperText}>Drag thumbnail left/right to reorder upload sequence.</Text>
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>Selected Images ({snappedImages.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
                  {snappedImages.map((item, index) => {
                    const pan = createDragResponder(index);
                    return (
                      <View key={item.id || `${item.uri}-${index}`} style={styles.thumbWrap} {...pan.panHandlers}>
                        <TouchableOpacity style={styles.thumbClose} onPress={() => removeSnappedImage(index)}>
                          <Text style={styles.thumbCloseText}>x</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setSelectedImage(item.uri); setModalVisible(true); }}>
                          <Image source={{ uri: item.uri }} style={styles.thumb} />
                        </TouchableOpacity>
                        <Text style={styles.orderBadge}>#{index + 1}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={clearAll}>
                  <Text style={styles.btnText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleStepTwoNext}>
                  <Text style={styles.btnText}>Next</Text>
                </TouchableOpacity>
              </View>

            </View>
          )}

          {step === 3 && (
            <View style={styles.sectionWrap}>
              <Text style={styles.inputLabel}>Vendor</Text>
              <View style={styles.readonlyBox}>
                <Text style={styles.readonlyText}>{newVendor || '-'}</Text>
              </View>

              <Text style={styles.inputLabel}>Invoice Number</Text>
              <TextInput
                style={styles.input}
                value={saveInvoiceNo}
                onChangeText={setSaveInvoiceNo}
                placeholder="Enter invoice number"
                placeholderTextColor="#9aa0a6"
              />

              <Text style={styles.inputLabel}>Invoice Date</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowInvoiceDatePicker(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.readonlyText}>{invoiceDate.toISOString().split('T')[0]}</Text>
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
                      style={[styles.btn, styles.btnPrimary, { marginHorizontal: 16, marginBottom: 14 }]}
                      onPress={() => setShowInvoiceDatePicker(false)}
                    >
                      <Text style={styles.btnText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </Modal>
              )}

              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.btn, styles.btnLight]} onPress={() => setStep(2)}>
                  <Text style={[styles.btnText, styles.btnLightText]}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={handleConfirmUpload}
                  disabled={buttonLoading.save}
                >
                  <Text style={styles.btnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <TouchableOpacity style={styles.modalCloseArea} onPress={() => setModalVisible(false)} />
          <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setModalVisible(false)}>
            <Text style={styles.previewCloseText}>Close</Text>
          </TouchableOpacity>
          <Image source={{ uri: selectedImage }} style={styles.fullImage} resizeMode="contain" />
        </View>
      </Modal>

      <Modal visible={savePopupVisible} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.saveModalOverlay}>
          <View style={[styles.saveModalBox, saveSuccess && styles.saveModalBoxSuccess]}>
            {!saveSuccess ? (
              <Image source={invoiceSavedGif} style={styles.saveModalGifFull} resizeMode="contain" />
            ) : (
              <TouchableOpacity
                style={styles.saveModalSuccessBtn}
                onPress={handleViewPendingInvoices}
                activeOpacity={0.85}
              >
                <Text style={styles.saveModalSuccessBtnText}>View Pending Invoices</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

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

      {showCamera && (
        <View style={styles.cameraSheet}>
          <Camera ref={cameraRef} style={styles.cameraPreview} cameraType={CameraType.Back} zoomMode="on" />
          <View style={styles.cameraControls}>
            <TouchableOpacity style={[styles.btn, styles.btnLight]} onPress={snapPhoto} disabled={buttonLoading.snap}>
              {buttonLoading.snap ? (
                <ActivityIndicator size="small" color="#256f3a" />
              ) : (
                <Text style={[styles.btnText, styles.btnLightText]}>Snap Photo</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={() => setShowCamera(false)}>
              <Text style={styles.btnText}>Close</Text>
            </TouchableOpacity>
          </View>
          {snappedImages.length > 0 && (
            <View style={styles.snapPreviewContainer}>
              <Text style={styles.snapPreviewCount}>
                {snappedImages.length} photo{snappedImages.length > 1 ? 's' : ''} captured
              </Text>
              <ScrollView
                ref={snapSliderRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                onContentSizeChange={() => snapSliderRef.current?.scrollToEnd({ animated: true })}
                contentContainerStyle={styles.snapPreviewList}
              >
                {snappedImages.map((item, index) => (
                  <View key={item.id || `${item.uri}-${index}`} style={styles.snapPreviewItem}>
                    <Image source={{ uri: item.uri }} style={styles.snapPreviewImage} />
                    <TouchableOpacity style={styles.snapPreviewRemove} onPress={() => removeSnappedImage(index)}>
                      <Text style={styles.thumbCloseText}>x</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </ImageBackground>
  );

};

export default AddNewVendorInvoice;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: {
    paddingBottom: 24,
  },
  stepperCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#d8e9dd',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginHorizontal: 10,
    marginTop: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperItem: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#bfd7c6',
    backgroundColor: '#f1f8f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    borderColor: '#2f8f43',
    backgroundColor: '#2f8f43',
  },
  stepDotDone: {
    borderColor: '#2f8f43',
    backgroundColor: '#e7f5eb',
  },
  stepDotText: {
    color: '#63806b',
    fontSize: 13,
    fontWeight: '700',
  },
  stepDotTextActive: {
    color: '#fff',
  },
  stepLabel: {
    fontSize: 11,
    color: '#6e7f74',
    fontWeight: '600',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: '#1f6d31',
    fontWeight: '700',
  },
  stepLabelDone: {
    color: '#2f8f43',
  },
  stepConnector: {
    height: 2,
    flex: 0.8,
    backgroundColor: '#d6e6da',
    marginHorizontal: 2,
    marginBottom: 20,
  },
  stepConnectorDone: {
    backgroundColor: '#73ba84',
  },
  stepCard: {
    marginHorizontal: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#d8e9dd',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 7,
    elevation: 3,
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#173a23',
  },
  stepSub: {
    marginTop: 4,
    marginBottom: 12,
    color: '#5f6f66',
    fontSize: 12,
  },
  sectionWrap: {
    marginTop: 12,
    gap: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d4e2d9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fcfffd',
    color: COLORS.text,
  },
  readonlyBox: {
    borderWidth: 1,
    borderColor: '#d4e2d9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#f7fbf8',
  },
  readonlyText: {
    color: COLORS.text,
    fontSize: 14,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  btn: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  btnPrimary: {
    backgroundColor: '#2f8f43',
  },
  btnLight: {
    backgroundColor: '#eef6f0',
  },
  btnLightText: {
    color: '#256f3a',
  },
  btnDanger: {
    backgroundColor: '#cf4d47',
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
  },
  helperText: {
    fontSize: 12,
    color: '#64748B',
  },
  previewCard: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: '#d8e9dd',
    borderRadius: 14,
    marginTop: 2,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#173a23',
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  imageRow: {
    minHeight: 130,
    borderRadius: 12,
    backgroundColor: '#f8fcf9',
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginHorizontal: 8,
    marginBottom: 8,
  },
  thumbWrap: {
    width: 100,
    marginRight: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    paddingBottom: 6,
    alignItems: 'center',
  },
  thumb: {
    width: 86,
    height: 86,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  thumbClose: {
    alignSelf: 'flex-end',
    marginTop: 4,
    marginRight: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbCloseText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  orderBadge: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  previewCloseBtn: {
    position: 'absolute',
    top: 44,
    right: 18,
    zIndex: 3,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewCloseText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  fullImage: { width: '90%', height: '80%', borderRadius: 10 },
  saveModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  saveModalBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  saveModalBoxSuccess: {
    backgroundColor: '#ffffff',
  },
  saveModalGifFull: {
    width: '100%',
    height: '100%',
  },
  saveModalSuccessBtn: {
    alignSelf: 'stretch',
    marginHorizontal: 24,
    backgroundColor: '#2f8f43',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveModalSuccessBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  cameraSheet: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
  },
  cameraPreview: {
    flex: 1,
  },
  cameraControls: {
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#f7f9fc',
  },
  snapPreviewContainer: {
    position: 'absolute',
    bottom: 88,
    left: 0,
    right: 0,
    backgroundColor: '#000000CC',
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  snapPreviewCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  snapPreviewList: {
    gap: 10,
  },
  snapPreviewItem: {
    position: 'relative',
  },
  snapPreviewImage: {
    width: 72,
    height: 92,
    borderRadius: 8,
  },
  snapPreviewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
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