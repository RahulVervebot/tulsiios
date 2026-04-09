// OneSignalService.js

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import OneSignal from 'react-native-onesignal';

const ONE_SIGNAL_APP_ID = '53886d23-f2ee-43f6-99ac-9c3ac95cdb9d';

/*
  IMPORTANT:
  - Do NOT keep your REST API key in mobile app code in production.
  - Notification send API should ideally be called from your backend.
  - Below key is only shown because you asked for full file structure.
*/
const ONE_SIGNAL_REST_API_KEY = 'os_v2_app_koeg2i7s5zb7ngnmtq5msxg3txg74u6xm6le6v5emqj7dmuesh3xdqw4ojrcuocj3mzxx2fzz3pt5gvanyuyjlohbjw4besyvli6ley';

let isInitialized = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeStoreUrl = (value) => String(value || '').trim().toLowerCase();

export const initializeOneSignal = async () => {
  try {
    if (isInitialized) {
      console.log('ℹ️ OneSignal already initialized');
      return true;
    }
const onesignalid = await AsyncStorage.getItem('onesignalid');
    console.log('\n🚀 ===== INITIALIZING ONESIGNAL =====');

    OneSignal.setAppId(onesignalid || '');

    // Optional debug logs
    if (OneSignal.setLogLevel) {
      OneSignal.setLogLevel(6, 0);
    }

    // iOS permission listener
    if (OneSignal.onOSPermissionChanged) {
      OneSignal.onOSPermissionChanged((event) => {
        console.log('📱 Permission changed:', event);
      });
    }

    // Subscription listener
    if (OneSignal.onOSSubscriptionChanged) {
      OneSignal.onOSSubscriptionChanged((event) => {
        console.log('📱 Subscription changed:', event);
      });
    }

    // Ask permission on iOS
    if (Platform.OS === 'ios' && OneSignal.promptForPushNotificationsWithUserResponse) {
      await new Promise((resolve) => {
        OneSignal.promptForPushNotificationsWithUserResponse((accepted) => {
          console.log('🔔 Push permission accepted:', accepted);
          resolve(accepted);
        });
      });
    }

    // Give SDK/APNs time to finish registration
    await wait(4000);

    const state = await OneSignal.getDeviceState?.();
    console.log('✅ OneSignal initialized');
    console.log('📱 Device state after init:', {
      subscribed: state?.subscribed,
      hasNotificationPermission: state?.hasNotificationPermission,
      pushToken: state?.pushToken,
      userId: state?.userId,
    });

    isInitialized = true;
    console.log('🚀 ===== ONESIGNAL INIT COMPLETE =====\n');
    return true;
  } catch (error) {
    console.log('❌ initializeOneSignal error:', error?.message || error);
    return false;
  }
};

export const getOneSignalSubscriptionStatus = async () => {
  try {
    const state = await OneSignal.getDeviceState?.();

    const result = {
      subscribed: !!state?.subscribed,
      hasPermission: !!state?.hasNotificationPermission,
      pushToken: state?.pushToken || null,
      userId: state?.userId || null,
    };

    console.log('📱 OneSignal status:', result);
    return result;
  } catch (error) {
    console.log('❌ getOneSignalSubscriptionStatus error:', error?.message || error);
    return {
      subscribed: false,
      hasPermission: false,
      pushToken: null,
      userId: null,
    };
  }
};

export const canReceivePush = async () => {
  const state = await getOneSignalSubscriptionStatus();
  return !!(
    state.subscribed &&
    state.hasPermission &&
    state.pushToken &&
    state.userId
  );
};

export const removeOneSignalTagsOnLogout = async () => {
  try {
    console.log('\n🧹 ===== REMOVING ONESIGNAL TAGS ON LOGOUT =====');

    // Check current subscription/device state
    let state = await OneSignal.getDeviceState?.();
    console.log('📱 Subscription state:', {
      subscribed: state?.subscribed,
      pushToken: state?.pushToken ? '✅' : '❌',
    });

    // Wait a bit if device is not yet subscribed
    if (!state?.subscribed || !state?.pushToken) {
      console.log('⏳ Device not subscribed — waiting up to 10s before deleting tags...');
      let waitedMs = 0;

      while ((!state?.subscribed || !state?.pushToken) && waitedMs < 10000) {
        await wait(2000);
        waitedMs += 2000;

        state = await OneSignal.getDeviceState?.();
        console.log(
          `   [${waitedMs}ms] subscribed: ${state?.subscribed}, token: ${
            state?.pushToken ? '✅' : '❌'
          }`
        );
      }
    }

    if (!state?.subscribed || !state?.pushToken) {
      console.log('⚠️ Device not subscribed — tags may not sync to server immediately. Deleting anyway...');
    }

    // Include all possible tag keys that may exist
    const tagsToRemove = [
      'storeurl',
      'userrole',
      'app_user',
      'device_type',
      'storeuserrole', // malformed/old combined tag
    ];

    // Delete from OneSignal
    OneSignal.deleteTags(tagsToRemove);
    console.log('🗑️ deleteTags called for:', tagsToRemove.join(', '));

    // Give SDK time to sync
    await wait(2000);

    // Check remaining tags
    const remainingTags = await new Promise((resolve) => {
      OneSignal.getTags((tags) => resolve(tags || {}));
    });

    const remainingTargetTags = Object.keys(remainingTags).filter((key) =>
      tagsToRemove.includes(key)
    );

    if (remainingTargetTags.length === 0) {
      console.log('✅ Target tags successfully removed from device');
    } else {
      console.log('⚠️ Some target tags are still present:', remainingTargetTags);
    }

    console.log('📋 All remaining tags on device:', JSON.stringify(remainingTags));

    if (Object.keys(remainingTags).length > 0) {
      console.log('⚠️ Other tags still exist on device:', Object.keys(remainingTags).join(', '));
    }

    console.log('🧹 ===== TAGS REMOVED =====\n');
    return true;
  } catch (error) {
    console.log('❌ removeOneSignalTagsOnLogout error:', error?.message || error);
    return false;
  }
};

export const tagDeviceWithStoreUrl = async (storeUrl, storeRole) => {
  try {
    if (!storeUrl) {
      console.log('❌ storeUrl missing');
      return false;
    }
       if (!storeRole) {
      console.log('❌ storeRole missing');
      return false;
    }

    const normalizedStoreUrl = normalizeStoreUrl(storeUrl);
   const normalizedStoreRole = normalizeStoreUrl(storeRole);
    console.log('\n🏷️ ===== TAGGING DEVICE =====');
    console.log('Original storeUrl:', storeUrl);
    console.log('Normalized storeUrl:', normalizedStoreUrl);
    console.log('Original storeRole:', normalizedStoreRole);

    const state = await OneSignal.getDeviceState?.();
    console.log('📱 State before tagging:', {
      subscribed: state?.subscribed,
      hasNotificationPermission: state?.hasNotificationPermission,
      pushToken: state?.pushToken,
      userId: state?.userId,
    });

    // Save locally
    await AsyncStorage.setItem('storeurl', normalizedStoreUrl);
   await AsyncStorage.setItem('userrole', normalizedStoreRole);
const storeuserrole = normalizedStoreUrl+normalizedStoreRole
OneSignal.sendTags({
 storeuserrole: storeuserrole,
  app_user: 'true',
  device_type: Platform.OS.toLowerCase(),
});
    // Give OneSignal some time to sync tags
    await wait(5000);
    const tags = await new Promise((resolve) => {
      OneSignal.getTags((t) => resolve(t || {}));
    });

    console.log('✅ OneSignal tags after sync:', tags);
    console.log('MATCH storeurl:', tags?.storeurl === normalizedStoreUrl);
    console.log('MATCH userrole:', tags?.userrole === normalizedStoreRole);
    console.log('✅ Tags sent successfully');
    console.log('🏷️ ===== TAGGING COMPLETE =====\n');
    return true;
  } catch (error) {
    console.log('❌ tagDeviceWithStoreUrl error:', error?.message || error);
    return false;
  }
};



// Optional helper if you have a real stable app user id
export const setExternalUserId = async (externalUserId) => {
  try {
    if (!externalUserId) {
      console.log('⚠️ setExternalUserId skipped - no externalUserId');
      return false;
    }

    if (OneSignal.setExternalUserId) {
      OneSignal.setExternalUserId(String(externalUserId));
      console.log('✅ External user id set:', externalUserId);
      return true;
    }

    console.log('⚠️ OneSignal.setExternalUserId not available');
    return false;
  } catch (error) {
    console.log('❌ setExternalUserId error:', error?.message || error);
    return false;
  }
};

export const debugOneSignalStatus = async () => {
  try {
    console.log('\n🔍 ===== ONESIGNAL DEBUG =====');

    const state = await OneSignal.getDeviceState?.();
    const localStoreUrl = await AsyncStorage.getItem('storeurl');

    console.log('📱 subscribed:', state?.subscribed);
    console.log('📱 hasNotificationPermission:', state?.hasNotificationPermission);
    console.log('📱 pushToken:', state?.pushToken || 'MISSING');
    console.log('📱 userId:', state?.userId || 'MISSING');
    console.log('🏪 local storeurl:', localStoreUrl || 'MISSING');

    if (state?.subscribed && state?.hasNotificationPermission && state?.pushToken) {
      console.log('✅ Device is ready for push');
    } else {
      console.log('❌ Device is NOT ready for push');
      if (!state?.subscribed) console.log('   - subscribed = false');
      if (!state?.hasNotificationPermission) console.log('   - permission = false');
      if (!state?.pushToken) console.log('   - pushToken missing');
      if (!state?.userId) console.log('   - userId missing');
    }

    console.log('🔍 ===== DEBUG END =====\n');
    return state;
  } catch (error) {
    console.log('❌ debugOneSignalStatus error:', error?.message || error);
    return null;
  }
};

export const sendNotificationToStoreUsers = async (

  title = 'Product Created',
  message = 'Product created successfully',
  productName = ''
) => {
  try {

    console.log('\n📢 ===== SEND STORE FILTER NOTIFICATION =====');

    const storeUrl = await AsyncStorage.getItem('storeurl');
        const userRole = await AsyncStorage.getItem('userRole');
    if (!storeUrl) {
      console.log('❌ No storeurl found in AsyncStorage');
      return false;
    }
    if(!userRole){
      console.log('❌ No userRole found in AsyncStorage');
      return false;
    }
    const normalizedUserRole = String(userRole || '').trim().toLowerCase();

    const normalizedStoreUrl = normalizeStoreUrl(storeUrl);

    const state = await OneSignal.getDeviceState?.();
   const storeuserrole = normalizedStoreUrl+normalizedUserRole

   const tags = await new Promise((resolve) => {
      OneSignal.getTags((t) => resolve(t || {}));
    });

    console.log('✅ OneSignal tags after sync:', tags);

      const onesignalid = await AsyncStorage.getItem('onesignalid');
    console.log('📱 Current device state before send:', {
      subscribed: state?.isSubscribed,
      hasNotificationPermission: state?.hasNotificationPermission,
      pushToken: state?.pushToken,
      userId: state?.userId,
    });

    if (!state?.isSubscribed || !state?.hasNotificationPermission || !state?.pushToken) {
      console.log('❌ Current device is not fully subscribed');
      console.log('   Fix notification permission / token / subscription first');
      return false;
    }

    const payload = {
      app_id: onesignalid,
      filters: [
        {
          field: 'tag',
          key: 'storeuserrole',
          relation: '=',
          value: storeuserrole,
        }
      ],
      headings: {
        en: title || 'Product Created',
      },
      contents: {
        en: message || `${productName || 'Product'} created successfully`,
      },
      priority: 10,
      ios_badgeType: 'Increase',
      ios_badgeCount: 1,
    };

    console.log('📤 Sending filter notification with payload:', JSON.stringify(payload, null, 2));
    const one_signal_rest_key = await AsyncStorage.getItem('onesignalkey');
    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${one_signal_rest_key}`,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log('📡 Filter send status:', response.status);
    console.log('📄 Filter send response:', responseText);

    let data = {};
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      console.log('⚠️ Response JSON parse failed');
    }

    if (response.ok && data.id) {
      console.log('✅ Store filtered notification sent successfully');
      console.log('📢 ===== SEND COMPLETE =====\n');
      return true;
    }

    if (data?.errors?.length) {
      console.log('❌ OneSignal error:', data.errors[0]);
    }

    console.log('❌ Store filtered notification failed');
    console.log('📢 ===== SEND FAILED =====\n');
    return false;
  } catch (error) {
    console.log('❌ sendNotificationToStoreUsers error:', error?.message || error);
    return false;
  }
};


export const forceEnablePushNotifications = async () => {
  try {
    let OneSignal = null;
    try {
      OneSignal = require('react-native-onesignal');
    } catch (e) {
      console.log('⚠️ OneSignal SDK not available');
      return false;
    }

    console.log('\n🔧 ═══════════════════════════════════════');
    console.log('🔧 FORCE ENABLING PUSH NOTIFICATIONS');
    console.log('🔧 ═══════════════════════════════════════');
    
    // Check current state
    let currentState = null;
    if (OneSignal.getDeviceState) {
      currentState = await OneSignal.getDeviceState();
      if (currentState) {
        console.log('\n📱 Before:');
        console.log('   Subscribed:', currentState.subscribed);
        console.log('   Has Permission:', currentState.hasNotificationPermission);
        console.log('   Push Token:', currentState.pushToken || 'NOT SET');
      }
    }
    
    // Force enable push
    console.log('\n🔄 Forcing push notification enable...');
    if (OneSignal.enablePush) {
      OneSignal.enablePush();
      console.log('✅ Called enablePush()');
    }
    
    // Also try setting external user ID to force sync
    const deviceId = await getOneSignalPlayerId();
    if (OneSignal.setExternalUserId) {
      OneSignal.setExternalUserId(deviceId);
      console.log('✅ Set external user ID:', deviceId);
    }
    
    // Wait for it to process
    console.log('\n⏳ Waiting 3 seconds for OneSignal to process...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check state again
    if (OneSignal.getDeviceState) {
      const updatedState = await OneSignal.getDeviceState();
      if (updatedState) {
        console.log('\n📱 After:');
        console.log('   Subscribed:', updatedState.subscribed ? '✅ YES' : '❌ NO');
        console.log('   Has Permission:', updatedState.hasNotificationPermission ? '✅ YES' : '❌ NO');
        console.log('   Push Token:', updatedState.pushToken || 'NOT SET');
        
        if (updatedState.subscribed) {
          console.log('\n✅ SUCCESS! Device is now SUBSCRIBED!');
        } else {
          console.log('\n⚠️ Still not subscribed - checking iOS permission...');
          
          // Request permission prompt again
          if (OneSignal.promptForPushNotificationsWithUserResponse) {
            console.log('📱 Requesting permission prompt again...');
            await new Promise((resolve) => {
              OneSignal.promptForPushNotificationsWithUserResponse((granted) => {
                console.log('📱 Permission response:', granted);
                resolve(granted);
              });
            });
            
            // Wait and check again
            await new Promise(resolve => setTimeout(resolve, 2000));
            const finalState = await OneSignal.getDeviceState();
            if (finalState) {
              console.log('\n📱 Final state:');
              console.log('   Subscribed:', finalState.subscribed ? '✅ YES' : '❌ NO');
              console.log('   Has Permission:', finalState.hasNotificationPermission ? '✅ YES' : '❌ NO');
            }
          }
        }
      }
    }
    
    console.log('🔧 ═══════════════════════════════════════\n');
    return true;
  } catch (error) {
    console.log('⚠️ Error enabling push:', error?.message);
    return false;
  }
};
