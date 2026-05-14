// components/ReportHeader.js
import React, { useContext } from 'react';
import { View, StyleSheet, ImageBackground, TouchableOpacity, Text } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { CartContext } from '../context/CartContext';
import { PrintContext } from '../context/PrintContext';
import CartIcon from '../assets/icons/cart.svg';
import PrinterIcon from '../assets/icons/Printericon.svg';
const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

const AppHeader = ({
  Title, 
  backgroundType = "color", 
  backgroundValue = "#fff", 
  hideCartIcon = false,
  hidePrintIcon = false,
  children
}) => {

  const navigation = useNavigation();
  const { cart } = useContext(CartContext);
  const { print } = useContext(PrintContext);
  
  const cartItemCount = cart.reduce((sum, item) => sum + (item.qty || 0), 0);
  const printItemCount = print.reduce((sum, item) => sum + (item.qty || 0), 0);
  
  const renderBackground = () => {
    if (backgroundType === "image") {
      return (
        <ImageBackground
          source={getImageSource(backgroundValue)}
          style={styles.headerContainer}
          resizeMode="cover"
        >
          <View style={styles.headerBar}>
            {renderContent()}
          </View>
          {children}
        </ImageBackground>
      );
    } 
    return (
      <View style={[styles.headerContainer, { backgroundColor: backgroundValue }]}>
        <View style={styles.headerBar}>
          {renderContent()}
        </View>
        {children}
      </View>
    );
  };

const renderContent = () => (
  <View style={styles.content}>
    <TouchableOpacity
      style={styles.leftWrapper}
      activeOpacity={0.7}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 24 }}
      onPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('Tabs');
        }
      }}
    >
      <View style={styles.leftIcon}>
        <Ionicons name="arrow-back-outline" size={24} color="#fff" />
      </View>
    </TouchableOpacity>

    <View style={styles.titleWrap}>
      <Text
        style={styles.headerTitle}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {Title}
      </Text>
    </View>

    <View style={styles.rightButtons}>
      {!hideCartIcon && (
        <TouchableOpacity
          style={styles.rightIcon}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => navigation.navigate('Cart')}
        >
          <CartIcon width={24} height={24} fill="#fff" />
          {cartItemCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>
                {cartItemCount > 99 ? '99+' : cartItemCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}
        {!hidePrintIcon && (
      <TouchableOpacity
        style={styles.rightIcon}
        activeOpacity={0.7}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        onPress={() => navigation.navigate('PrintScreen')}
      >
        <PrinterIcon width={24} height={24} fill="#fff" />
        {printItemCount > 0 && (
          <View style={styles.printBadge}>
            <Text style={styles.printBadgeText}>
              {printItemCount > 99 ? '99+' : printItemCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
        )}
    </View>
  </View>
);


  return <View>{renderBackground()}</View>;
};

const styles = StyleSheet.create({
  logo: { flexDirection: 'row' },
  headerContainer: {
    paddingHorizontal: 14,
    paddingTop: 32,
    paddingBottom: 8,
  },
  headerBar: {
    minHeight: 64,
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowIcon: { width: 36, height: 36 },
  leftWrapper: {
    width: 64,
    height: 48,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  leftIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rightIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#16A34A',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  printBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#16A34A',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  printBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 22,
    textTransform: 'uppercase',
  },

  headerUser: { fontSize: 12, fontWeight: '400', color: '#000', paddingHorizontal: 10 },
  headerName: { fontSize: 16, fontWeight: '700', color: '#000', paddingHorizontal: 10 },
});


export default AppHeader;
