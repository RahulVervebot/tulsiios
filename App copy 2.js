import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Platform,
  Alert
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { initializeOneSignal, debugOneSignalStatus, forceEnablePushNotifications, saveUserCallProfile } from './src/config/OneSignalConfig';
import IncomingCallOverlay from './src/components/IncomingCallOverlay';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import Dashboard from './src/screens/Dashboard';
import CategoryProductsScreen from './src/screens/CategoryProductsScreen';
import SignupScreen from './src/screens/SignupScreen';
import ReportScreen from './src/screens/ReportScreen';
import UserScreen from './src/screens/UserScreen';
import CartScreen from './src/screens/CartScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import Chat from './src/components/Chat';
import CategoryListScreen from './src/components/CategoryListScreen';
import SaleSummaryReport from './src/screens/SalesSummaryReport';
import PrintScreen from './src/screens/PrintScreen';
import AppProviders from './src/context/AppProviders';
import OcrScreen from './src/components/icms/OcrCameraScreen';
import AddNewVendorInvoice from './src/components/icms/AddNewVendorInvoice';
import SettingScreen from './src/screens/SettingScreen';
import POSScreen from './src/screens/POSScreen';
import ICMSScreen from './src/screens/ICMSScreen';
import ICMS_invoice from './src/screens/icms/ICMS_invoice.js';
import ICMS_VendorList from './src/screens/icms/ICMS_VendorList.js';
import InvoiceDetails from './src/screens/icms/InvoiceDetails.js';
import RedProductsScreen from './src/screens/icms/RedProductsScreen';
import PendingInvoices from './src/components/icms/PendingInvoices';
import PendingNewInvoices from './src/components/icms/pending_new_invoices';
import ReportsByHours from './src/screens/HourlyReport.js';
import TopSellingCategoriesReport from './src/screens/TopSellingCategoriesReport.js';
import TopSellingProductsReportScreen from './src/screens/TopSellingProductsReport.js';
import TopSellingCustomerReport from './src/screens/TopSellingCustomerReport.js';
import SessionReports from './src/components/reports/SessionReports.js';
import OrdersScreen from './src/components/orders/order.js';
import MixMatchFreeProductScreen from './src/screens/promotions/mixmatchFreeProduct.js';
import MixMatchQuantityBasedOfferScreen from './src/screens/promotions/mixmatchquantity_based_offer.js';
import QuantityDiscountScreen from './src/screens/promotions/QuantityDiscount';
import SalePrintScreen from './src/screens/SalePrintScreen';
import ArchivedProductList from './src/components/ArchivedProductList';
import HomeIcon from './src/assets/icons/HomeIcon.svg';
import ProductIcon from './src/assets/icons/Products_icon.svg';
import ProductScreen from './src/screens/ProductScreen.js';
import CartIcon from './src/assets/icons/inventory_1.svg';
import POSIcon from './src/assets/icons/payment_2.svg';
import ReportIcon from './src/assets/icons/Reportsicon.svg'; 
import UserList from './src/screens/UserList.js';
import OrderHold from './src/screens/OrderHold.js';
import MultiVendor from './src/screens/icms/MultiVendor.js';
import { getPosAuthStatus } from './src/functions/users/function.js';
import MultiStoreProduct from './src/screens/MultiStoreProduct.js';
import ProductRequests from './src/screens/ProductRequests.js';
import SupportScreen from './src/screens/SupportScreen.js';
import VideoCallScreen from './src/screens/VideoCallScreen.js';
import VoiceCallScreen from './src/screens/VoiceCallScreen.js';
import ChatScreen from './src/screens/ChatScreen.js';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();

// ---------- Custom Drawer with Logout ----------
function CustomDrawerContent(props) {
  const { navigation } = props;
  const handleLogout = async () => {
    try {
      await GoogleSignin.signOut();
    } catch (e) {
      console.log('Google signout error:', e);
    }
    await AsyncStorage.removeItem('userId');
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <DrawerItemList {...props} />
      </View>
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </DrawerContentScrollView>
  ); 
}

// ---------- Bottom Tabs ----------

function BottomTabs() {
  const insets = useSafeAreaInsets();
  const [isAllowIcms, setIsAllowIcms] = useState(false);
  useEffect(() => {
    const loadIcmsPermission = async () => {
      try {
        const storedAllowIcms = await AsyncStorage.getItem('is_allow_tulsi_ai');
        setIsAllowIcms(storedAllowIcms === 'true');
        // console.log('[ICMS Permission] Loaded:', storedAllowIcms);
      } catch (error) {
        console.log('Error loading ICMS permission:', error);
      }
    };
    loadIcmsPermission();
    
    // Set up interval to check for permission changes
    const interval = setInterval(loadIcmsPermission, 2000);
    return () => clearInterval(interval);
  }, []);

  const BAR_PAD_BOTTOM = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);
  const BAR_HEIGHT = 60 + BAR_PAD_BOTTOM;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
         headerShown: false,
         tabBarShowLabel: false,
   
        // Center the icon in each tab item
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
        },

        // Render icon + internal top strip
        tabBarIcon: ({ focused, size }) => {
          let IconComp;
          switch (route.name) {
            case 'Dashboard':   IconComp = HomeIcon; break;
            case 'ProductScreen':   IconComp = ProductIcon; break;
            case 'Report': IconComp = ReportIcon; break;
            case 'ICMSScreen':   IconComp = CartIcon; break;
            case 'POSScreen':  IconComp = POSIcon; break;
            default: return null;
          }

          return (
            <View
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden', 
              }}
            >
              <View
                // style={{
                //   position: 'absolute',
                //   top: 0, left: 0, right: 0,            // ensures consistent bar height
                //   height: 2,
                //   backgroundColor: focused ? '#319241' : 'transparent',
                // }}
              />
              <IconComp
                width={size ?? 24}
                height={size ?? 24}
                fill={focused ? '#319241' : 'gray'}
              />
            </View>
          );
        },
      })}
    >

      <Tab.Screen name="Dashboard" component={Dashboard} />
      <Tab.Screen name="ProductScreen" component={ProductScreen} />
      <Tab.Screen name="Report" component={ReportScreen} />
      <Tab.Screen name="POSScreen" component={POSScreen} />
      {isAllowIcms && <Tab.Screen name="ICMSScreen" component={ICMSScreen} />}
    </Tab.Navigator>
  );
}

// ---------- Drawer (kept same, Tabs inside) ----------

function MainDrawer() {
  return (
    <Drawer.Navigator
      initialRouteName="Tabs"
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Drawer.Screen name="Profile" component={UserScreen} />
     <Drawer.Screen name="Tabs" component={BottomTabs} />
    </Drawer.Navigator>
  );
}

// function ChatOverlay() {
//   const insets = useSafeAreaInsets();
//   return <Chat style={{ bottom: 70 + insets.bottom, right: 16 }} />;
// }

function getActiveRouteName(state) {
  if (!state || !state.routes || state.index == null) return '';
  const route = state.routes[state.index];
  if (!route) return '';
  if (route.state) return getActiveRouteName(route.state);
  return route.name || '';
}

export default function App() {
  const [chatOpen, setChatOpen] = useState(false);
  const [isAllowTulsiChatSupport, setIsAllowTulsiChatSupport] = useState(false);

  const [initialRoute, setInitialRoute] = useState(null);
  const [activeRouteName, setActiveRouteName] = useState('');
  const navigationRef = useRef(null);
  const CHAT_HIDDEN_ROUTES = new Set(['Login', 'CategoryListScreen', 'CategoryProducts', 'ProductScreen']);
  function ChatOverlay() {
    const insets = useSafeAreaInsets();

    return (
      <Chat
        buttonStyle={{ bottom: 76 + insets.bottom }}
        isOpen={chatOpen}
        setIsOpen={setChatOpen}
        hideFab={false}
      />
    );
  }

  useEffect(() => {
    console.log('[ChatOverlay] activeRouteName:', activeRouteName, 'hidden:', CHAT_HIDDEN_ROUTES.has(activeRouteName));
  }, [activeRouteName]);
  
  useEffect(() => {
    const loadChatPermission = async () => {
      try {
        const storedAllowChat = await AsyncStorage.getItem('is_allow_tulsi_chat_support');
        setIsAllowTulsiChatSupport(storedAllowChat === 'true');
        console.log('[Chat Permission] Loaded:', storedAllowChat);
      } catch (error) {
        console.log('Error loading chat permission:', error);
      }
    };
    
    // Reload permission when navigating to logged-in screens
    if (activeRouteName && activeRouteName !== 'Login') {
      loadChatPermission();
    }
  }, [activeRouteName]);

  // Periodic auth check every 5 seconds
  useEffect(() => {
    const checkAuthStatus = async () => {
      // Only check if user is logged in (not on Login screen)
      if (activeRouteName === 'Login' || !activeRouteName) {
        return;
      }

      try {
        const result = await getPosAuthStatus();
        if (result?.message === 'OK') {
          console.log('Auth status: OK');
        }
      } catch (error) {
        console.log('Auth check error:', error?.message);
        // Check if it's a 401 error
        if (error?.status === 401) {
          console.log('Unauthorized - navigating to Login');
          Alert.alert('Session Expired', 'Your session has expired. Please log in again.');
          // Clear stored credentials
          await AsyncStorage.removeItem('access_token');
          await AsyncStorage.removeItem('userId');
          // Navigate to login
          if (navigationRef.current) {
            navigationRef.current.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          }
        }
      }
    };

    // Run immediately on mount
    checkAuthStatus();

    // Set up interval to run every 60 seconds
    const interval = setInterval(checkAuthStatus, 60000); 

    return () => clearInterval(interval);
  }, [activeRouteName]);
  
  useEffect(() => {
    const checkLogin = async () => {
      try {
        const access_token = await AsyncStorage.getItem('access_token');
        setInitialRoute(access_token ? 'MainDrawer' : 'Login');
      } catch (e) {
        setInitialRoute('Login');
      }
    };
    checkLogin();
  }, []);

  // Handle notification tap when app is killed or backgrounded
  useEffect(() => {
    const OneSignal = require('react-native-onesignal').default || require('react-native-onesignal');
    if (OneSignal?.setNotificationOpenedHandler) {
      OneSignal.setNotificationOpenedHandler(async (event) => {
        const data = event?.notification?.additionalData;
        const actionId = event?.action?.actionId;

        // User tapped Decline button directly on the notification — reject without opening app
        if (actionId === 'decline_call' && data?.callDocId) {
          try {
            const firestore = require('@react-native-firebase/firestore').default;
            await firestore().collection('calls').doc(data.callDocId).update({ status: 'rejected' });
          } catch (_) {}
          return;
        }

        // User tapped Accept button or the notification body → open call screen
        if (data?.type === 'incoming_call') {
          const screen = data.callType === 'video' ? 'VideoCallScreen' : 'VoiceCallScreen';
          const tryNavigate = () => {
            if (!navigationRef.current?.isReady?.()) {
              setTimeout(tryNavigate, 300);
              return;
            }
            // Only navigate if user is logged in
            AsyncStorage.getItem('access_token').then((token) => {
              if (!token) return;
              navigationRef.current.navigate(screen, {
                incomingCallId: data.callDocId,
              });
            });
          };
          tryNavigate();
        }

        // User tapped an invoice-saved notification → open pending invoices list
        if (data?.type === 'invoice_saved') {
          const tryNavigate = () => {
            if (!navigationRef.current?.isReady?.()) {
              setTimeout(tryNavigate, 300);
              return;
            }
            AsyncStorage.getItem('access_token').then((token) => {
              if (!token) return;
              navigationRef.current.navigate('PendingNewInvoices');
            });
          };
          tryNavigate();
        }

        // User tapped a chat message notification → open that chat
        if (data?.type === 'chat_message' && data?.chatId) {
          const tryNavigate = () => {
            if (!navigationRef.current?.isReady?.()) {
              setTimeout(tryNavigate, 300);
              return;
            }
            AsyncStorage.getItem('access_token').then((token) => {
              if (!token) return;
              navigationRef.current.navigate('ChatScreen', {
                chatId:   data.chatId,
                chatName: data.chatName || 'Chat',
                chatType: data.chatType || 'direct',
              });
            });
          };
          tryNavigate();
        }
      });
    }
  }, []);

  useEffect(() => {
    const setupOneSignal = async () => {
      try {
        console.log('\n🚀 ===== APP STARTING - INITIALIZING ONESIGNAL =====');
        
        if (initializeOneSignal && typeof initializeOneSignal === 'function') {
          console.log('📱 Calling initializeOneSignal()...');
          await initializeOneSignal();
          console.log('✅ initializeOneSignal() completed');
        }
        
        // Wait a moment for initialization to fully settle
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('\n📊 Checking OneSignal permission status after init...');
        if (debugOneSignalStatus && typeof debugOneSignalStatus === 'function') {
          await debugOneSignalStatus();
        }

        // Check if device is subscribed - if not, try to force enable
        try {
          const OneSignal = require('react-native-onesignal');
          if (OneSignal && OneSignal.getDeviceState) {
            const deviceState = await OneSignal.getDeviceState();
            if (deviceState && !deviceState.subscribed && deviceState.hasNotificationPermission) {
              console.log('\n⚠️ Device has permission but not subscribed - attempting to fix...\n');
              if (forceEnablePushNotifications && typeof forceEnablePushNotifications === 'function') {
                await forceEnablePushNotifications();
              }
            }
          }
        } catch (e) {
          // Silent fail - not critical
        }

        // Re-save call profile now that OneSignal is fully initialized.
        // Login may have called saveUserCallProfile before the player ID was ready.
        const email = await AsyncStorage.getItem('userEmail');
        const name = await AsyncStorage.getItem('userName');
        if (email) {
          saveUserCallProfile(email, name || email).catch(() => {});
        }

        console.log('\n✅ OneSignal setup complete - App ready for notifications\n');
      } catch (error) {
        console.log('⚠️ OneSignal setup warning (non-fatal):', error?.message);
        // Don't crash app if OneSignal has issues
      }
    };
    setupOneSignal();
  }, []);

  if (!initialRoute) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <AppProviders>
      <SafeAreaProvider>
        <NavigationContainer
          ref={navigationRef}
          onReady={() => {
            const rootState = navigationRef.current?.getRootState?.();
            const current = getActiveRouteName(rootState);
            console.log('[Navigation] onReady route:', current, 'state:', JSON.stringify(rootState));
            if (current) setActiveRouteName(current);
          }}
          onStateChange={(state) => {
            const current = getActiveRouteName(state);
            console.log('[Navigation] onStateChange route:', current);
            setActiveRouteName(current);
          }}
        >
        <View style={{ flex: 1 }}>
          <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Cart" component={CartScreen} />
       <Stack.Screen name="Checkout" component={CheckoutScreen} />    
      <Stack.Screen name="SaleSummaryReport" component={SaleSummaryReport} />     
      <Stack.Screen name="ReportsByHours" component={ReportsByHours} />   
   <Stack.Screen name="TopSellingCategoriesReport" component={TopSellingCategoriesReport} /> 
<Stack.Screen name="OrderHold" component={OrderHold} /> 
<Stack.Screen name="TopSellingProductsReportScreen" component={TopSellingProductsReportScreen} /> 
<Stack.Screen name="TopSellingCustomerReport" component={TopSellingCustomerReport} /> 
<Stack.Screen name="SessionReports" component={SessionReports} /> 
<Stack.Screen name="OrdersScreen" component={OrdersScreen} /> 
 <Stack.Screen name="OcrScreen" component={OcrScreen} />     
  <Stack.Screen name="AddNewVendorInvoice" component={AddNewVendorInvoice} />
   <Stack.Screen name="SettingScreen" component={SettingScreen} />    
     <Stack.Screen name="CategoryListScreen" component={CategoryListScreen} />  
     <Stack.Screen name="PrintScreen" component={PrintScreen} /> 
     <Stack.Screen name="SalePrintScreen" component={SalePrintScreen} />
     <Stack.Screen name="ArchivedProductList" component={ArchivedProductList} />
    <Stack.Screen name="MixMatchFreeProductScreen" component={MixMatchFreeProductScreen} />
    <Stack.Screen name="MixMatchQuantityBasedOfferScreen" component={MixMatchQuantityBasedOfferScreen} />
    <Stack.Screen name="QuantityDiscountScreen" component={QuantityDiscountScreen} />
    <Stack.Screen name="UserList" component={UserList} />
     <Stack.Screen name="SupportScreen" component={SupportScreen} />
      <Stack.Screen name="VideoCallScreen" component={VideoCallScreen} />
      <Stack.Screen name="VoiceCallScreen" component={VoiceCallScreen} />
      <Stack.Screen name="ChatScreen" component={ChatScreen} options={{ headerShown: false }} />

     
      <Stack.Screen name="SignupScreen" component={SignupScreen} />


      
          <Stack.Screen name="MainDrawer" component={MainDrawer} />
      <Stack.Screen
        name="CategoryProducts"
        component={CategoryProductsScreen}
        options={({ route }) => ({
          title: route?.params?.category || "Category",
        })}
      />
     <Stack.Screen
            name="InvoiceDetails"
            component={InvoiceDetails}
            options={{ title: 'InvoiceDetails' }}
          />
          <Stack.Screen
            name="VendorList"
            component={ICMS_VendorList}
            options={{ title: 'Vendorlist' }}
          />
          <Stack.Screen
            name="InvoiceList"
            component={ICMS_invoice}
            options={{
              title: 'Product Information',
              headerStyle: {
                backgroundColor: '#3478F5',
              },
              headerTintColor: '#fff',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          />
  <Stack.Screen
            name="MultiVendor"
            component={MultiVendor}
            options={{
              title: 'Multi Vendor Products',
              headerStyle: {
                backgroundColor: '#3478F5',
              },
              headerTintColor: '#fff',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          />

  <Stack.Screen
            name="MultiStoreProduct"
            component={MultiStoreProduct}
            options={{
              title: 'Multi Store Products',
              headerStyle: {
                backgroundColor: '#3478F5',
              },
              headerTintColor: '#fff',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          />

           <Stack.Screen
            name="ProductRequests"
            component={ProductRequests}
            options={{
              title: 'Product Requests',
              headerStyle: {
                backgroundColor: '#3478F5',
              },
              headerTintColor: '#fff',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
           />

          <Stack.Screen
            name="RedProducts"
            component={RedProductsScreen}
            options={{ title: 'Unlinked Products' }}
          />
          <Stack.Screen
            name="PedingInvoices"
            component={PendingInvoices}
            options={{ title: 'Pending Invoices' }}
          />
          <Stack.Screen
            name="PendingNewInvoices"
            component={PendingNewInvoices}
            options={{ title: 'Pending New Invoices' }}
          />
          </Stack.Navigator>

          {!CHAT_HIDDEN_ROUTES.has(activeRouteName) && isAllowTulsiChatSupport && <ChatOverlay />}
          {initialRoute === 'MainDrawer' || activeRouteName !== 'Login'
            ? <IncomingCallOverlay navigationRef={navigationRef} />
            : null}
        </View>
        </NavigationContainer>
      </SafeAreaProvider>
    </AppProviders>
  );

}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // Header
  headerWrap: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#2c1e70' },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  // Category pills
  catPill: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 10,
  },
  catText: { color: '#2c1e70', fontWeight: '500' },
  // Drawer logout
  logoutBtn: {
    padding: 15,
    backgroundColor: '#f44',
    margin: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});