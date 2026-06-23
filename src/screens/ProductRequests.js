import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { 
  View, 
  StyleSheet, 
  FlatList, 
  ActivityIndicator, 
  Text, 
  SafeAreaView,
  TouchableOpacity,
  RefreshControl,
  Alert
} from 'react-native';
import { Card, Chip, Title, List, Button } from 'react-native-paper';
import { getProductNotificationList, updateProductNotification } from '../functions/product-function';
import AsyncStorage from '@react-native-async-storage/async-storage';
const ProductRequests = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState('myrequest');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [storeName, setStoreName] = useState('');
  const [acceptingId, setAcceptingId] = useState(null);

  // useEffect(() => {
  //   const fetchStoreName = async () => {
  //     const storename = await AsyncStorage.getItem('storeName');
  //     setStoreName(storename || 'Store');
  //     fetchProductRequests();
  //   };
  //   fetchStoreName();
  // }, []);


useFocusEffect(
  useCallback(() => {
    let isActive = true;

    const loadScreenData = async () => {
      try {
        const storename = await AsyncStorage.getItem('storeName');
        console.log('Loaded store name:', storename);
        const latestStoreName = storename || 'Store';

        if (isActive) {
          setStoreName(latestStoreName);
        }

        await fetchProductRequests();
      } catch (error) {
        console.log('Error loading store name:', error);
      }
    };

    loadScreenData();

    return () => {
      isActive = false;
    };
  }, [])
);

  const fetchProductRequests = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await getProductNotificationList();
      console.log('Product Notification Response:', response);
      if (response?.status === 'success' && Array.isArray(response?.data)) {
        setData(response.data);
      } else {
        setData([]);
        setError('No requests found');
      }
    } catch (err) {
      console.error('Error fetching product requests:', err);
      setError(err.message || 'Failed to fetch product requests');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProductRequests();
    setRefreshing(false);
  }, []);

  const handleAcceptRequest = (item) => {
    Alert.alert(
      'Accept Request',
      'Is this product available in your store?',
      [
        {
          text: 'No',
          style: 'cancel'
        },
        {
          text: 'Yes',
          onPress: () => RequestAccepted(item)
        }
      ]
    );
  };

  const RequestAccepted = async (item) => {
    try {
      setAcceptingId(item.id);
      const response = await updateProductNotification({
        id: item.id,
        status: 'accepted',
        store_accepted: [storeName]
      });

      if (response?.result?.status === 'success') {
        Alert.alert('Success', 'Request accepted successfully');
        await fetchProductRequests();
      } else {
        console.error('Error accepting request:', response);
        Alert.alert('Error', response?.message || 'Failed to accept request');
      }
    } catch (err) {
      console.error('Error accepting request:', err);
      Alert.alert('Error', err.message || 'Failed to accept request');
    } finally {
      setAcceptingId(null);
    }
  };

  const isStoreMatching = (item) => {
    if (!storeName || !item.stores || !Array.isArray(item.stores)) {
      return false;
    }
    return item.stores.some(store => store === storeName);
  };

  const filteredData = data.filter(item => {
    const storeMatches = isStoreMatching(item);
    
    if (activeTab === 'myrequest') {
      return !storeMatches && item.status !== 'accepted' && item.store_requested === storeName;
    } else if (activeTab === 'requested') {
      return storeMatches;
    } else if (activeTab === 'approved') {
      return !storeMatches && item.status === 'accepted';
    }
    return false;
  }).sort((a, b) => {
    // In incoming tab, show 'requested' status first
    if (activeTab === 'requested') {
      if (a.status === 'requested' && b.status !== 'requested') return -1;
      if (a.status !== 'requested' && b.status === 'requested') return 1;
    }
    return 0;
  });

  const renderRequestCard = ({ item }) => (
    <Card style={styles.card} mode="elevated">
      <Card.Content>
        <View style={styles.cardHeader}>
          <Title style={styles.productName} numberOfLines={2}>
            {item.product_name}
          </Title>
          <Chip 
            mode="outlined" 
            style={[
              styles.statusChip, 
              item.status === 'accepted' ? styles.acceptedChip : styles.requestedChip
            ]}
            textStyle={styles.chipText}
          >
            {item.status === 'accepted' ? 'Approved' : 'Requested'}
          </Chip>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Barcode:</Text>
          <Text style={styles.barcodeText}>{item.barcode || 'N/A'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Department:</Text>
          <Text style={styles.valueText}>{item.department || 'N/A'}</Text>
        </View>

        {item.size !== 'N/A' && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Size:</Text>
            <Text style={styles.valueText}>{item.size}</Text>
          </View>
        )}

        <View style={styles.customerSection}>
          <Text style={styles.sectionTitle}>Customer Details</Text>
          <View style={styles.customerInfo}>
            <List.Icon icon="account" color="#007AFF" style={styles.icon} />
            <Text style={styles.customerText}>{item.customer_name}</Text>
          </View>
          <View style={styles.customerInfo}>
            <List.Icon icon="phone" color="#007AFF" style={styles.icon} />
            <Text style={styles.customerText}>{item.customer_phone}</Text>
          </View>
        </View>
     { activeTab === 'requested' && (
           <View style={styles.notesSection}>
            <Text style={styles.sectionTitle}>Requested Store</Text>
            <Text style={styles.notesText}>{item.store_requested}</Text>
          </View>
        )}
        
        {item.notes && (
          <View style={styles.notesSection}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notesText}>{item.notes}</Text>
          </View>
        )}

        {item.stores && item.stores.length > 0 && (
          <View style={styles.storesSection}>
            <Text style={styles.sectionTitle}>
              Notified Stores ({item.stores.length})
            </Text>
            <View style={styles.storesList}>
              {item.stores.map((store, index) => (
                <View key={index} style={styles.storeItem}>
                  <List.Icon icon="store" color="#4CAF50" style={styles.storeIcon} />
                  <Text style={styles.storeText}>{store}</Text>
                </View>
              ))}
            </View>
          </View>
        )}



        {item.store_accepted && (
          <View style={styles.acceptedBadge}>
            <List.Icon icon="check-circle" color="#4CAF50" style={styles.icon} />
            <Text style={styles.acceptedText}>Store {item.store_accepted} Accepted</Text>
          </View>
        )}
      </Card.Content>
      
      {activeTab === 'requested' && item.status === 'requested' &&  (
        <Card.Actions style={styles.cardActions}>
          <Button 
            mode="contained" 
            onPress={() => handleAcceptRequest(item)}
            style={styles.acceptButton}
            loading={acceptingId === item.id}
            disabled={acceptingId === item.id}
            icon="check"
          >
            Accept
          </Button>
        </Card.Actions>
      )}
    </Card>
  );

  const renderEmptyComponent = () => {
    if (loading) return null;
    
    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, styles.errorText]}>{error}</Text>
          <Button 
            mode="contained" 
            onPress={fetchProductRequests}
            style={styles.retryButton}
          >
            Retry
          </Button>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <List.Icon icon="inbox" color="#ccc" size={64} />
        <Text style={styles.emptyText}>
          No {activeTab === 'myrequest' ? 'requests' : activeTab === 'requested' ? 'store requests' : 'approved'} products
        
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'myrequest' && styles.activeTab
          ]}
          onPress={() => setActiveTab('myrequest')}
        >
          <Text style={[
            styles.tabText,
            activeTab === 'myrequest' && styles.activeTabText
          ]}>
            My Request
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'requested' && styles.activeTab
          ]}
          onPress={() => setActiveTab('requested')}
        >
          <Text style={[
            styles.tabText,
            activeTab === 'requested' && styles.activeTabText
          ]}>
            Store Request
          </Text>
          {data.filter(item => isStoreMatching(item) && item.status === 'requested').length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {data.filter(item => isStoreMatching(item) && item.status === 'requested').length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'approved' && styles.activeTab
          ]}
          onPress={() => setActiveTab('approved')}
        >
          <Text style={[
            styles.tabText,
            activeTab === 'approved' && styles.activeTabText
          ]}>
            Approved
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          renderItem={renderRequestCard}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={renderEmptyComponent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#007AFF']}
            />
          }
        />
      )}
    </SafeAreaView>
  );

};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#007AFF',
  },
  tabIcon: {
    margin: 0,
    marginRight: 0,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 6,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  listContainer: {
    padding: 16,
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
  statusChip: {
    height: 30,
  },
  requestedChip: {
    backgroundColor: '#FFA726',
    borderColor: '#FFA726',
  },
  acceptedChip: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  chipText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  infoRow: {
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
    fontSize: 14,
    color: '#000000',
    fontFamily: 'monospace',
    fontWeight: '600',
    backgroundColor: '#f8f8f8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  valueText: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
  },
  customerSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  icon: {
    margin: 0,
    marginRight: 8,
  },
  customerText: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
  },
  notesSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  notesText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  storesSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  storesList: {
    marginTop: 4,
  },
  storeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  storeIcon: {
    margin: 0,
    marginRight: 8,
  },
  storeText: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
  },
  acceptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  acceptedText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  cardActions: {
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
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
    marginTop: 16,
  },
  errorText: {
    color: '#d32f2f',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#007AFF',
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
});

export default ProductRequests;
