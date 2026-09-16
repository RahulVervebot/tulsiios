import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ImageBackground,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AppHeader from '../../components/AppHeader';
import reportbg from '../../assets/images/headbg.png';
import API_ENDPOINTS, { initICMSBase, setICMSBase } from '../../../icms_config/api';
const PANEL_RADIUS = 28;
export default function ICMS_VendorList() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const navigation = useNavigation();
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredVendors, setFilteredVendors] = useState([]);
  const [vendorList, setVendorList] = useState([]);

  // Fetch vendor list every time screen comes into focus
  useFocusEffect(

    useCallback(() => {
      console.log('Fetching vendor list:', API_ENDPOINTS.VENDORS);
initICMSBase();
      fetch(API_ENDPOINTS.GETINVOICELIST)
        .then(res => 
          console.log(res) &&
          res.json())
        .then(data => {
          const cleanedData = data.filter(
            item => item && typeof item.value === 'string',
          );
          const sortedData = cleanedData.sort((a, b) => {
            if (a.number_of_newInvoice < b.number_of_newInvoice) return 1;
            if (a.number_of_newInvoice > b.number_of_newInvoice) return -1;
            return 0;
          });
          console.log("vendor data:",res);
          setVendorList(sortedData);
          setFilteredVendors(sortedData);
        })
        .catch(error => {
          console.error('Error fetching invoice list:', error);
        });
    }, []),
  );
  const getImageSource = val => (typeof val === 'number' ? val : { uri: val });

  const handleVendorSearch = text => {
    setSearchTerm(text);

    let results = [...vendorList];
    if (text.trim() !== '') {
      results = results.filter(vendor =>
        vendor.value.toLowerCase().includes(text.toLowerCase()),
      );
    }

    // Sort so vendors with new invoices are on top
    results.sort((a, b) => {
      if (a.number_of_newInvoice < b.number_of_newInvoice) return 1;
      if (a.number_of_newInvoice > b.number_of_newInvoice) return -1;
      return 0;
    });

    setFilteredVendors(results);
  };

  return (
    <ImageBackground
      source={getImageSource(reportbg)}
      style={styles.screen}
      resizeMode="cover"
    >
      <AppHeader
        Title="Vendor List"
        backgroundType="image"
        backgroundValue={reportbg}
      ></AppHeader>
      <View style={styles.panelInner}>
        <TextInput
          value={searchTerm}
          onChangeText={handleVendorSearch}
          placeholder="Search Vendor..."
          style={{
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 8,
            padding: 10,
            marginBottom: 10,
          }}
        />

        <FlatList
          data={filteredVendors}
          keyExtractor={item => item.slug}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('InvoiceList', { vendor: item })
              }
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 12,
                borderBottomWidth: 1,
                borderColor: '#eee',
              }}
            >
              <Text style={{ fontSize: 16 }}>{item.value.toUpperCase()}</Text>
              {console.log(item.slug)}
              {item.number_of_newInvoice > 0 && (
                <View
                  style={{
                    backgroundColor: 'red',
                    borderRadius: 12,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 12 }}>
                    {item.number_of_newInvoice} New
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={() => (
            <Text style={{ textAlign: 'center', color: '#888', marginTop: 20 }}>
              No vendors found
            </Text>
          )}
        />
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  panelInner: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.85)', // helps separate items from bg image
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,

    ...Platform.select({
      android: { elevation: 1 },
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
});
