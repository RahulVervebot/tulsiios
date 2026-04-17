import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Image,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_ENDPOINTS, { initICMSBase, setICMSBase } from '../../../icms_config/api';


const OCRPreviewComponent = ({
  filenames,
  vendorName,
  imageURIs,
  tableData,
  ocrurl,
  highlightedImages,
  setHighlightedImages,
  lastFetchedPreviewRef, // Parent's ref - persists across remounts
}) => {

  const [selectedImage, setSelectedImage] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const isFetchingRef = useRef(false);
  // lastFetchedFilesRef removed - now using parent's lastFetchedPreviewRef
  
  // Create stable key based on actual content, not array reference
  const filesKey = useMemo(() => {
    return JSON.stringify({
      filenames,
      vendorName,
      imageURIs
    });
  }, [JSON.stringify(filenames), vendorName, JSON.stringify(imageURIs)]);
  
  useEffect(() => {
    console.log('🔍 useEffect triggered');
    console.log('  📊 highlightedImages:', highlightedImages);
    console.log('  📊 highlightedImages.length:', highlightedImages?.length);
    console.log('  📊 filesKey:', filesKey);
    
    // Only fetch if we don't have highlighted images yet
    if (highlightedImages && highlightedImages.length > 0) {
      console.log('✅ Using cached OCR preview data');
      return;
    }
    
    console.log('  ❌ No cached data found, checking other conditions...');

    // Don't fetch if already loading (synchronous check using ref)
    if (isFetchingRef.current) {
      console.log('⏳ API call already in progress, skipping... isFetchingRef:', isFetchingRef.current);
      return;
    }

    // Don't fetch if state shows we're loading
    if (isLoadingPreview) {
      console.log('⏳ Still loading from previous request, skipping...');
      return;
    }
    
    // If we've already successfully fetched for this exact key, skip
    // Using parent's ref - persists across component remounts!
    if (lastFetchedPreviewRef.current === filesKey) {
      console.log('✅ Already fetched for this data (from parent cache), skipping...');
      return;
    }
    
    console.log('📁 Checks passed - isFetchingRef:', isFetchingRef.current, 'lastFetched:', lastFetchedPreviewRef.current);
    console.log('🔄 Fetching OCR preview data...');
    
    // Mark as fetching immediately to prevent duplicate calls
    isFetchingRef.current = true;
    lastFetchedPreviewRef.current = filesKey;
    setIsLoadingPreview(true);

    const generatePreview = async () => {
      initICMSBase();
      //   const imageURLs = imageURIs.map((uri) => uri);
 
      // const missingDataList = tableData.map((row) => row.description);
      const missingDataList = tableData.map(row =>
        `${row.itemNo || ''} ${row.description || ''} ${row.unitPrice || ''} ${
          row.extendedPrice || ''
        }`.trim(),
      );

      const payload = {
        data: {
          filename: filenames,
          vendorName: vendorName,
          imageURLs: imageURIs,
          missingDataList: missingDataList,
        },
      };
   
      try {
       console.log('🔄 Fetching OCR preview data...', payload);
        setPreviewError('');
        const token = await AsyncStorage.getItem('access_token');
         const icms_store = await AsyncStorage.getItem('icms_store');
         const storeurl = await AsyncStorage.getItem('storeurl');
        const response = await fetch(API_ENDPOINTS.PREVIEW_OCR, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
         'store': icms_store,
        'access_token': token,
        'app_url': storeurl ?? '',
        'mode': 'MOBILE',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('OCR Preview API Error:', errorText);
          Alert.alert('Error', 'Failed to fetch OCR preview.');
          setIsLoadingPreview(false);
          isFetchingRef.current = false;
          return;
        }

        const previewResult = await response.json();
        setHighlightedImages(previewResult.highlightedImages || []);
        console.log('🟢 OCR Preview Response',previewResult.highlightedImages[0]);
      } catch (error) {
        console.error('OCR Preview Failed:', error);
        Alert.alert('Error', error.message);
        setPreviewError('Unable to prepare preview');
      } finally {
        setIsLoadingPreview(false);
        isFetchingRef.current = false;
      }
    };

    generatePreview();
  }, [filesKey]); // Use stable memoized key instead of array references
  const openModal = image => {
    setSelectedImage(image);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedImage(null);
  };

  const handleDismissPreview = index => {
    setHighlightedImages(prev => prev.filter((_, idx) => idx !== index));
  };
  return (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        {isLoadingPreview ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#319241" />
            <Text style={styles.infoText}>Preparing highlighted areas...</Text>
          </View>
        ) : highlightedImages.length > 0 ? (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={true}
            contentContainerStyle={styles.previewRow}
          >
            {highlightedImages.map((img, index) => (
              <View key={index} style={styles.previewTile}>
                <View style={styles.previewTileHeader}>
                  <TouchableOpacity
                    style={styles.previewClose}
                    onPress={() => handleDismissPreview(index)}
                    hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
                  >
                    <Text style={styles.previewCloseText}>×</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => openModal(img.base64Image)}
                  activeOpacity={0.85}
                >
                  <Image
                    source={{ uri: img.base64Image }}
                    style={styles.previewImage}
                    resizeMode="cover"
                  />
                  <Text style={styles.previewLabel}>Page {index + 1}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.infoText}>
            {previewError || 'Preview will appear once OCR is complete.'}
          </Text>
        )}
      </View>
      {/* Modal to preview selected image */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalBackground}>
          <TouchableOpacity style={styles.closeArea} onPress={closeModal} />
          <TouchableOpacity style={styles.modalCloseBtn} onPress={closeModal}>
            <Text style={styles.modalCloseBtnText}>Close</Text>
          </TouchableOpacity>
          <Image
            source={{ uri: selectedImage }}
            style={styles.fullImage}
            resizeMode="contain"
          />
        </View>
      </Modal>
    </View>
  );
};

export default OCRPreviewComponent;

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 800,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e4ef',
    alignSelf: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e4ef',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e1e1e',
  },
  cardBody: {
    minHeight: 120,
    justifyContent: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    gap: 12,
  },
  infoText: {
    color: '#4c4c4c',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  previewTile: {
    width: 140,
    borderRadius: 12,
    backgroundColor: '#f9fbff',
    borderWidth: 1,
    borderColor: '#dfe6fb',
    overflow: 'hidden',
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  previewTileHeader: {
    alignItems: 'flex-end',
    padding: 6,
  },
  previewImage: {
    width: '100%',
    height: 140,
  },
  previewLabel: {
    paddingTop: 6,
    paddingBottom: 2,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: '#2C62FF',
  },
  previewClose: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCloseText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '700',
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 44,
    right: 16,
    zIndex: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modalCloseBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  fullImage: {
    width: '90%',
    height: '80%',
    borderRadius: 10,
  },
});
