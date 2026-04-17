import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  useWindowDimensions,
  Platform,
  TouchableOpacity,
  ScrollView,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CustomHeader from '../components/CustomHeader';
import reportbg from '../assets/images/report-bg.png';
import HourlyReport from '../assets/icons/Hourly-Reports.png';
import PromotionsIcon from '../assets/icons/Promotions.svg';
import TopCustumerList from '../assets/icons/Top-Customers-List.png';
import ProductPrint from '../assets/icons/product_print.svg'
import CreateCategoryModal from '../components/CreateCategoryModal';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import SaslePrint from '../assets/icons/sale_print.svg'
import MixMatch from '../assets/icons/mix_match.svg';
import QuantityDiscount from '../assets/icons/quantity_discount.svg';
import CreateProductModal from '../components/CreateProductModal';
import CreateProduct from '../assets/icons/create_product.svg';
import CreateCategory from '../assets/icons/create_category.svg'
import CategoryList from '../assets/icons/category_list.svg';
const PANEL_RADIUS = 28;

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function POSScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const styles = getStyles(isTablet);
  const navigation = useNavigation();
  const [showProductCreate, setShowProductCreate] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [isPromotionAccessible, setIsPromotionAccessible] = useState(false);
  const [isProductEditPermission, setIsProductEditPermission] = useState(false);
  const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

  const [expanded, setExpanded] = useState({
    promo: false,
    print: false,
    category: false,
  });

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const [promotionPerm, productPerm] = await AsyncStorage.multiGet([
          'is_promotion_accessible',
          'is_product_edit_permission_in_app'
        ]);
        setIsPromotionAccessible(promotionPerm[1] === 'true');
        setIsProductEditPermission(productPerm[1] === 'true');

      } catch (error) {
        console.log('Error loading POS permissions:', error);
      }
    };
    loadPermissions();
    
    // Poll for permission changes
    const interval = setInterval(loadPermissions, 2000);
    return () => clearInterval(interval);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const loadPermissions = async () => {
        try {
          const [promotionPerm, productPerm] = await AsyncStorage.multiGet([
            'is_promotion_accessible',
            'is_product_edit_permission_in_app'
          ]);
          setIsPromotionAccessible(promotionPerm[1] === 'true');
          setIsProductEditPermission(productPerm[1] === 'true');
          console.log('[POS Focus] Promotion:', promotionPerm[1], 'Product Edit:', productPerm[1]);
        } catch (error) {
          console.log('Error loading POS permissions on focus:', error);
        }
      };
      loadPermissions();
    }, [])
  );

  const toggle = (key) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const Row = ({ icon, label, isFirst, isLast, onPress, right, isChild }) => (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      style={[
        styles.row,
        isFirst && styles.rowFirst,
        isChild && styles.rowChild,
        !isLast && styles.rowDivider,
        { justifyContent: 'space-between' },
      ]}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.rowIconWrap, isChild && styles.rowIconWrapChild]}>
          {typeof icon === 'function' ? (
            React.createElement(icon, {
              width: isChild ? styles.rowIconChild.width : styles.rowIcon.width,
              height: isChild ? styles.rowIconChild.height : styles.rowIcon.height,
            })
          ) : (
            <Image source={icon} style={[styles.rowIcon, isChild && styles.rowIconChild]} resizeMode="contain" />
          )}
        </View>
        <Text style={[styles.rowTitle, isChild && styles.rowTitleChild]}>{label}</Text>
      </View>
      {right}
    </TouchableOpacity>
  );

  return (
    <ImageBackground source={getImageSource(reportbg)} style={styles.screen} resizeMode="cover">
      <CustomHeader Title="POS" backgroundType="image" backgroundValue={reportbg} />

      <View style={styles.panelInner}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.panelContent}
        >
          {/* PROMOTIONS (Accordion) */}
          {isPromotionAccessible && (
            <>
              <Row
                icon={PromotionsIcon}
                label="Promotions"
                isFirst
                onPress={() => toggle('promo')}
                right={<Text style={styles.toggleText}>{expanded.promo ? '−' : '+'}</Text>}
              />
              {expanded.promo && (
                <View>
                  <Row
                    icon={MixMatch}
                    label="Mix Match Free Product"
                    isChild
                    onPress={() => navigation.navigate('MixMatchFreeProductScreen')}
                    right={null}
                  />
                  <Row
                    icon={QuantityDiscount}
                    label="Mix Match Quantity Based Product"
                    isChild
                    onPress={() => navigation.navigate('MixMatchQuantityBasedOfferScreen')}
                    right={null}
                  />
                  <Row
                    icon={QuantityDiscount}
                    label="Quantity Discount"
                    isChild
                    isLast
                    onPress={() => navigation.navigate('QuantityDiscountScreen')}
                    right={null}
                  />
                </View>
              )}
            </>
          )}

          {/* PRINT (Accordion) */}
          <Row
            icon={HourlyReport}
            label="Print"
            onPress={() => toggle('print')}
            right={<Text style={styles.toggleText}>{expanded.print ? '−' : '+'}</Text>}
          />
          {expanded.print && (
            <View>
              <Row
                icon={ProductPrint}
                label="Product Print"
                isChild
                onPress={() => navigation.navigate('PrintScreen')}
                right={null}
              />
              <Row
                icon={SaslePrint}
                label="Sale Print"
                isChild
                isLast
                onPress={() => navigation.navigate('SalePrintScreen')}
                right={null}
              />
            </View>
          )}

          {/* PRODUCT CATEGORIES (Accordion) */}
          {isProductEditPermission && (
            <>
              <Row
                icon={TopCustumerList}
                label="Product Managment"
                onPress={() => toggle('category')}
                right={<Text style={styles.toggleText}>{expanded.category ? '−' : '+'}</Text>}
              />
              {expanded.category && (
                <View>
                  <Row
                    icon={CreateProduct}
                    label="Create Product"
                    isChild
                    right={null}
                    onPress={() => setShowProductCreate(true)}
                  />
                  <Row
                    icon={CreateCategory}
                    label="Create Category"
                    isChild
                    right={null}
                    onPress={() => setShowCreate(true)}
                  />
                  <Row
                    icon={CategoryList}
                    label="Category List"
                    isChild
                    onPress={() => navigation.navigate('CategoryListScreen')}
                    right={null}
                  />
                  <Row
                    icon={CategoryList}
                    label="Deleted Product List"
                    isChild
                    isLast
                    onPress={() => navigation.navigate('ArchivedProductList')}
                    right={null}
                  />
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
<CreateCategoryModal
  visible={showCreate}
  onClose={() => setShowCreate(false)}
  onCreated={() => {
    setShowCreate(false);
  }}
/>
  <CreateProductModal
        visible={showProductCreate}
        onClose={() => setShowProductCreate(false)}
        onCreated={() => {
          setShowProductCreate(false);
        }}
      />
    </ImageBackground>
  );
}

const getStyles = (isTablet) =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    // Header
    headerTitle: {
      fontSize: isTablet ? 24 : 20,
      fontWeight: '700',
      color: '#000',
      paddingBottom: 10,
    },
    headerUnderline: {
      alignSelf: 'center',
      width: isTablet ? 160 : 120,
      height: StyleSheet.hairlineWidth,
      backgroundColor: 'rgba(0,0,0,0.15)',
      borderRadius: 2,
      marginTop: 2,
    },

    // Panel
    panel: {
      flex: 1,
      paddingTop: isTablet ? 24 : 16,
      paddingHorizontal: isTablet ? 28 : 16,
      backgroundColor: '#fff',
      borderTopLeftRadius: PANEL_RADIUS,
      borderTopRightRadius: PANEL_RADIUS,
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
      paddingVertical: isTablet ? 16 : 12,
      marginBottom: isTablet ? 16 : 10,
      paddingHorizontal: isTablet ? 18 : 14,
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
    rowChild: {
      marginLeft: isTablet ? 18 : 12,
      paddingVertical: isTablet ? 12 : 10,
    },
    rowFirst: {
      paddingTop: isTablet ? 16 : 12,
    },
    rowDivider: {
      borderBottomWidth: 0,
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: isTablet ? 14 : 10,
    },
    rowIcon: {
      width: isTablet ? 40 : 32,
      height: isTablet ? 40 : 32,
    },
    rowIconWrap: {
      width: isTablet ? 68 : 56,
      height: isTablet ? 68 : 56,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fff',
    },
    rowIconWrapChild: {
      width: isTablet ? 56 : 48,
      height: isTablet ? 56 : 48,
    },
    rowIconChild: {
      width: isTablet ? 30 : 24,
      height: isTablet ? 30 : 24,
    },
    rowTitle: {
      flexShrink: 1,
      fontSize: isTablet ? 20 : 16,
      fontWeight: '600',
      color: '#111',
      letterSpacing: 0.2,
    },
    rowTitleChild: {
      fontSize: isTablet ? 16 : 13,
      fontWeight: '500',
      color: '#1f2937',
      letterSpacing: 0.1,
    },
    toggleText: {
      fontSize: isTablet ? 26 : 22,
      color: '#000',
      fontWeight: '500',
      lineHeight: isTablet ? 28 : 24,
      paddingHorizontal: 6,
    },
  });
