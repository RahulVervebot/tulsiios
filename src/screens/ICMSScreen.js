import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Platform, TouchableOpacity, ImageBackground, ScrollView } from 'react-native';
import CustomHeader from '../components/CustomHeader';
import reportbg from '../assets/images/report-bg.png';
import Create_invoice from '../assets/icons/create_new_invoice.svg';
import InvoiceList from '../assets/icons/invoice_list.svg';
import ProductsIcon from '../assets/icons/red_products.svg';
import Pending_invoice from '../assets/icons/pending_invoices.svg';
import { useNavigation } from '@react-navigation/native';

const PANEL_RADIUS = 36;

export default function ICMSScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const styles = getStyles(isTablet);
  const navigation = useNavigation();
  const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

  const Row = ({ icon: IconComp, label }) => (
    <View style={styles.row}>
      <View style={styles.rowIconWrap}>
        <IconComp width={styles.rowIcon.width} height={styles.rowIcon.height} />
      </View>
      <Text style={styles.rowTitle}>{label}</Text>
      <Text style={styles.rowArrow}>{'>'}</Text>
    </View>
  );

  return (
    <ImageBackground
      source={getImageSource(reportbg)}
      style={styles.screen}
      resizeMode="cover"
    >
      <CustomHeader
        Title="TULSI AI"
        backgroundType="image"
        backgroundValue={reportbg}
      />

      <View style={styles.panel}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.panelContent}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => navigation.navigate('OcrScreen')}>
            <Row icon={Create_invoice} label="Add Invoices" />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={1} onPress={() => navigation.navigate('AddNewVendorInvoice')}>
            <Row icon={Create_invoice} label="Add New Vendor Invoice" />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={1} onPress={() => navigation.navigate('InvoiceList')}>
            <Row icon={InvoiceList} label="Invoice List" />
          </TouchableOpacity>
             <TouchableOpacity activeOpacity={1} onPress={() => navigation.navigate('MultiVendor')}>
            <Row icon={InvoiceList} label="Multi Vendor Products" />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={1} onPress={() => navigation.navigate('RedProducts')}>
            <Row icon={ProductsIcon} label="Unlinked Product" />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={1} onPress={() => navigation.navigate('PendingNewInvoices')}>
            <Row icon={Pending_invoice} label="Pending Invoices" />
          </TouchableOpacity>
        </ScrollView>
      </View>
    </ImageBackground>
  );
}


const getStyles = (isTablet) => StyleSheet.create({
  screen: {
    flex: 1,
  },
  panel: {
    flex: 1,
    backgroundColor: '#D4E7DC',
    borderTopLeftRadius: PANEL_RADIUS,
    borderTopRightRadius: PANEL_RADIUS,
    paddingTop: isTablet ? 28 : 18,
    paddingHorizontal: isTablet ? 28 : 16,
  },
  panelContent: {
    paddingBottom: isTablet ? 24 : 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isTablet ? 22 : 14,
    marginBottom: isTablet ? 20 : 14,
    paddingHorizontal: isTablet ? 22 : 16,
    paddingVertical: isTablet ? 18 : 14,
    borderRadius: 22,
    backgroundColor: '#D9EBE1',
    ...Platform.select({
      android: { elevation: 1 },
      ios: {
        shadowColor: '#9CB9A8',
        shadowOpacity: 0.15,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
      },
    }),
  },
  rowIconWrap: {
    width: isTablet ? 94 : 78,
    height: isTablet ? 94 : 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#fff',
  },
  rowIcon: {
    width: isTablet ? 62 : 52,
    height: isTablet ? 62 : 52,
  },
  rowTitle: {
    flex: 1,
    flexShrink: 1,
    fontSize: isTablet ? 24 : 16,
    fontWeight: '500',
    color: '#0C0C0C',
    letterSpacing: 0.2,
  },
  rowArrow: {
    fontSize: isTablet ? 44 : 30,
    color: '#101010',
    fontWeight: '600',
    lineHeight: isTablet ? 44 : 32,
    paddingRight: 6,
  },
});
