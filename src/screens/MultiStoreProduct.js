import React, { useState,useEffect,useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { 
  View, 
  StyleSheet, 
  FlatList, 
  ActivityIndicator, 
  Text, 
  SafeAreaView,
  useColorScheme,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  ImageBackground
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import reportbg from '../assets/images/report-bg.png';
import { Searchbar, Card, Chip, Title, Paragraph, List, Button, TextInput } from 'react-native-paper';
import { searchMultiStoreProducts, notifyMultiStoreProduct } from '../functions/product-function';
import AppHeader from '../components/AppHeader';
const MultiStoreProduct = ({ navigation }) => {

  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState('');
  const [notifyingBarcode, setNotifyingBarcode] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const colorScheme = useColorScheme();
  const [storeName, setStoreName] = useState('');
  const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });
  
  useFocusEffect(
  useCallback(() => {
    const fetchStoreName = async () => {
      const storename = await AsyncStorage.getItem('storeName');
      setStoreName(storename || 'Store');
    };

    fetchStoreName();
  }, [])
);

  const handleSearch = async (query) => {
    setSearchQuery(query);
    setError('');
    // Clear results if query is less than 3 characters
    if (query.trim().length < 3) {
      setProducts([]);
      setTotalCount(0);
      return;
    }

    try {
      setLoading(true);
      const response = await searchMultiStoreProducts(query);
     console.log('Search response:', response);
      if (response?.status === 'success' && Array.isArray(response?.data)) {
   
        setProducts(response.data);
        setTotalCount(response.count || response.data.length);
      } else {
        setProducts([]);
        setTotalCount(0);
        setError('No products found');
      }
    } catch (err) {
      console.error('Error searching products:', err);
      setError(err.message || 'Failed to search products');
      setProducts([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleNotify = (product) => {
    setSelectedProduct(product);
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
    setModalVisible(true);
  };

  const handleSubmitNotification = async () => {
    if (!customerName.trim()) {
      Alert.alert('Error', 'Please enter customer name');
      return;
    }
    if (!customerPhone.trim()) {
      Alert.alert('Error', 'Please enter customer phone');
      return;
    }

    try {
      console.log('Submitting notification with data:',storeName)
      setNotifyingBarcode(selectedProduct.barcode);
      const response = await notifyMultiStoreProduct({
        product_name: selectedProduct.product_name,
        barcode: selectedProduct.barcode,
        department: selectedProduct.department,
        size: selectedProduct.size,
        stores: selectedProduct.stores,
        store_requested: storeName,
        customer_name: customerName,
        customer_phone: customerPhone,
        notes: notes
      });
      
      if (response?.result?.status === 'success') {
        setModalVisible(false);
        Alert.alert('Success', 'Notification sent successfully to all stores');
      } else {
        Alert.alert('Error', response.result?.message || 'Failed to send notification');
        console.error('Notification error response:', response|| response);
      }
    } catch (err) {
      console.error('Error sending notification:', err);
      Alert.alert('Error', err.message || 'Failed to send notification');
    } finally {
      setNotifyingBarcode(null);
    }
  };

  const renderProductCard = ({ item }) => (
    <Card style={styles.card} mode="elevated">
      <Card.Content>
        <View style={styles.cardHeader}>
          <Title style={styles.productName} numberOfLines={2}>
            {item.product_name}
          </Title>
          {/* {item.department && (
            <Chip 
              mode="outlined" 
              style={styles.departmentChip}
              textStyle={styles.chipText}
            >
              {item.department}
            </Chip>
          )} */}
            <Button 
          mode="contained" 
          onPress={() => handleNotify(item)}
          style={styles.notifyButton}
          labelStyle={styles.notifyButtonLabel}
          icon="bell"
          loading={notifyingBarcode === item.barcode}
          disabled={notifyingBarcode === item.barcode}
        >
          Notify
        </Button>
        </View>
        {item.department && (
        <View style={styles.barcodeContainer}>

          <Text style={styles.label}>Barcode:</Text>
          <Text style={styles.barcodeText}>
            {item.barcode || 'N/A'}
          </Text>
           
        </View>
         )}
          <View style={styles.barcodeContainer}>
          <Text style={styles.label}>Department:</Text>
          <Text style={styles.barcodeText}>
            {item.department || 'N/A'}
          </Text>
        </View>

        {item.size && (
          <View style={styles.sizeContainer}>
            <Text style={styles.label}>Size:</Text>
            <Text style={styles.sizeText}>
              {item.size}
            </Text>
          </View>
        )}

        {item.stores && item.stores.length > 0 && (
          <View style={styles.storesContainer}>
            <Text style={styles.storesLabel}>
              Available in {item.stores.length} store{item.stores.length > 1 ? 's' : ''}:
            </Text>
            <View style={styles.storesList}>
              {item.stores.map((store, index) => (
                <View key={index} style={styles.storeItem}>
                  <List.Icon icon="check-circle" color="#4CAF50" style={styles.checkIcon} />
                  <Text style={styles.storeText}>{store}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Card.Content>
     
    </Card>
  );

  const renderEmptyComponent = () => {
    if (loading) return null;

    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, styles.errorText]}>{error}</Text>
        </View>
      );
    }

    if (searchQuery.length < 3) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText]}>
            Enter at least 3 characters to search
          </Text>
        </View>
      );
    }

    if (products.length === 0 && searchQuery.length >= 3) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText]}>
            No products found
          </Text>
        </View>
      );
    }
    return null;
  };

  return (
      <>
      <AppHeader
        Title={"Multi-Store Products"}
        backgroundType="image" backgroundValue={reportbg}>
      </AppHeader>
      {/* Notification Form Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Send Notification</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              {selectedProduct && (
                <View style={styles.productInfo}>
                  <Text style={styles.productInfoTitle}>Product: {selectedProduct.product_name}</Text>
                  <Text style={styles.productInfoSubtitle}>Barcode: {selectedProduct.barcode}</Text>
                </View>
              )}

              <TextInput
                label="Customer Name *"
                value={customerName}
                onChangeText={setCustomerName}
                style={styles.input}
                mode="outlined"
                placeholder="Enter customer name"
              />

              <TextInput
                label="Customer Phone *"
                value={customerPhone}
                onChangeText={setCustomerPhone}
                style={styles.input}
                mode="outlined"
                placeholder="Enter customer phone"
                keyboardType="phone-pad"
              />

              <TextInput
                label="Notes"
                value={notes}
                onChangeText={setNotes}
                style={styles.input}
                mode="outlined"
                placeholder="Enter notes (optional)"
                multiline
                numberOfLines={4}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <Button 
                mode="outlined" 
                onPress={() => setModalVisible(false)}
                style={styles.cancelButton}
                disabled={notifyingBarcode !== null}
              >
                Cancel
              </Button>
              <Button 
                mode="contained" 
                onPress={handleSubmitNotification}
                style={styles.submitButton}
                loading={notifyingBarcode !== null}
                disabled={notifyingBarcode !== null}
              >
                Submit
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <Searchbar
            placeholder="Search products (min 3 characters)"
            onChangeText={handleSearch}
            value={searchQuery}
            style={styles.searchbar}
            autoCapitalize="none"
            autoCorrect={false}
          />
     
        </View>
  
             <Button
            mode="contained"
            onPress={() => navigation.navigate('ProductRequests')}
            style={styles.requestsButton}
            icon="inbox"
          >
           REQUESTS
          </Button>
              {totalCount > 0 && (
          <Text style={[styles.resultCount]}>
            {totalCount} product{totalCount > 1 ? 's' : ''} found
          </Text>
        )}
      </View>

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#319241" />
          <Text style={[styles.loadingText]}>
            Searching...
          </Text>
        </View>
      ) : (
        <FlatList
          data={products}
          renderItem={renderProductCard}
          keyExtractor={(item, index) => `${item.barcode}-${index}`}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={renderEmptyComponent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </>
  );

};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D9EBE1',
  },

  containerDark: {
    backgroundColor: '#f5f5f5',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#D9EBE1',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchbar: {
    flex: 1,
    elevation: 0,
    backgroundColor: '#f0f0f0',
  },
  requestsButton: {
    backgroundColor: '#319241',
    borderRadius: 8,
    minWidth: 48,
  },
  resultCount: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  listContainer: {
    padding: 16,
   backgroundColor: '#D9EBE1',
    
  },
  card: {
    marginBottom: 16,
    elevation: 3,
    backgroundColor: '#ffffff',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  productName: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 8,
    color: '#333',
  },
  departmentChip: {
    height: 30,
    backgroundColor: '#1976d2',
  },
  chipText: {
    fontSize: 12,
    color: '#ffffff',
  },
  barcodeContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'center',
  },
  sizeContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    marginRight: 8,
  },
  barcodeText: {
    fontSize: 15,
    color: '#000000',
    fontFamily: 'monospace',
    fontWeight: '600',
    backgroundColor: '#f8f8f8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  sizeText: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
  },
  textDark: {
    color: '#fff',
  },
  storesContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  storesLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  storesList: {
    marginTop: 4,
  },
  storeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingLeft: 4,
  },
  checkIcon: {
    margin: 0,
    marginLeft: 0,
    marginRight: 8,
  },
  storeText: {
    fontSize: 14,
    color: '#000000',
    flex: 1,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  errorText: {
    color: '#d32f2f',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  cardActions: {
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  notifyButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  notifyButtonLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#007AFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    fontSize: 24,
    color: 'white',
    fontWeight: 'bold',
  },
  modalContent: {
    padding: 16,
  },
  productInfo: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  productInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  productInfoSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  input: {
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#007AFF',
  },
});

export default MultiStoreProduct;