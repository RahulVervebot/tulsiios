import React from 'react';
import { View, Text, StyleSheet, ImageBackground, Image, useWindowDimensions, Platform, TouchableOpacity, ScrollView } from 'react-native';
import CustomHeader from '../components/CustomHeader';
import reportbg from '../assets/images/report-bg.png';
import HourlyReport from '../assets/icons/Hourly-Reports.png';
import SaleSummaryReport from '../assets/icons/Sales-Summary-Report.png';
import TopCustumerList from '../assets/icons/Top-Customers-List.png';
import TopSellingProducts from '../assets/icons/Top-Selling-Products.png'
import TopSellingCategories from '../assets/icons/Top-Selling-Categories.png'
import SessionReports from '../assets/icons/Session-report.png'
import Orders from '../assets/icons/Orders.png'
import { useNavigation } from '@react-navigation/native';
const PANEL_RADIUS = 28;

export default function ReportScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const styles = getStyles(isTablet);
  const navigation = useNavigation();
  const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

  const Row = ({ icon, label }) => (
    <View style={styles.row}>
      <View style={styles.rowIconWrap}>
        <Image source={icon} style={styles.rowIcon} resizeMode="contain" />
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
      <CustomHeader Title="REPORTS"
        backgroundType="image" backgroundValue={reportbg}>
      </CustomHeader>
      <View style={styles.panelInner}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.panelContent}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => navigation.navigate('SaleSummaryReport')}
          >
            <Row icon={SaleSummaryReport} label="Sales Summary Reports" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => navigation.navigate('OrdersScreen')}
          >
            <Row icon={Orders} label="Orders" />
          </TouchableOpacity>
              <TouchableOpacity
            activeOpacity={1}
            onPress={() => navigation.navigate('OrderHold')}
          >
            <Row icon={Orders} label="Credit Sale Report" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => navigation.navigate('ReportsByHours')}
          >
            <Row icon={HourlyReport} label="Hourly Reports" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => navigation.navigate('TopSellingCustomerReport')}
          >
            <Row icon={TopCustumerList} label="Top Customer List" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => navigation.navigate('TopSellingProductsReportScreen')}
          >
            <Row icon={TopSellingProducts} label="Top Selling Products" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => navigation.navigate('TopSellingCategoriesReport')}
          >
            <Row icon={TopSellingCategories} label="Top Selling Categories" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => navigation.navigate('SessionReports')}
          >
            <Row icon={SessionReports} label="Sessions Report" />
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
  // Header
  headerTitle: {
    fontSize: isTablet ? 24 : 20,
    fontWeight: '700',
    color: '#000',
    paddingBottom: 10
  },
  headerUnderline: {
    alignSelf: 'center',
    width: isTablet ? 160 : 120,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 2,
    marginTop: 2,
  },

  // Panel (the image background area)
  panel: {
    flex: 1,
    paddingTop: isTablet ? 24 : 16,
    paddingHorizontal: isTablet ? 28 : 16,
    backgroundColor: '#fff',
    borderTopLeftRadius: PANEL_RADIUS,
    borderTopRightRadius: PANEL_RADIUS,

    // nice subtle card feel against the header background
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: -2 },
      },
    }),
  },
  panelImage: {
    borderTopLeftRadius: PANEL_RADIUS,
    borderTopRightRadius: PANEL_RADIUS,
  },
  panelInner: {
    flex: 1,
    backgroundColor: '#D4E7DC',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingVertical: isTablet ? 18 : 12,
    paddingHorizontal: isTablet ? 18 : 12,

    ...Platform.select({
      android: { elevation: 0 },
      ios: {
        shadowOpacity: 0,
      },
    }),
  },
  panelContent: {
    paddingBottom: isTablet ? 26 : 16,
  },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isTablet ? 22 : 14,
    marginBottom: isTablet ? 16 : 10,
    paddingHorizontal: isTablet ? 18 : 14,
    paddingVertical: isTablet ? 16 : 12,
    borderRadius: 18,
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
    width: isTablet ? 68 : 56,
    height: isTablet ? 68 : 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  rowIcon: {
    width: isTablet ? 40 : 32,
    height: isTablet ? 40 : 32,
  },
  rowTitle: {
    flex: 1,
    flexShrink: 1,
    fontSize: isTablet ? 20 : 16,
    fontWeight: '600',
    color: '#111',
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
