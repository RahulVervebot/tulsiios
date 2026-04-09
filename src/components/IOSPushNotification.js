import { NativeModules, Platform } from 'react-native';

const { IOSLocalNotification } = NativeModules;

let hasRequestedPermission = false;
let hasNotificationPermission = false;

export async function requestIOSNotificationPermission() {
  if (Platform.OS !== 'ios' || !IOSLocalNotification) {
    return false;
  }

  if (hasRequestedPermission) {
    return hasNotificationPermission;
  }

  hasRequestedPermission = true;

  try {
    const granted = await IOSLocalNotification.requestPermission();
    hasNotificationPermission = granted === true;
    return hasNotificationPermission;
  } catch (error) {
    console.log('iOS notification permission error:', error?.message || error);
    hasNotificationPermission = false;
    return false;
  }
}

export async function showIOSPushNotification({ title, body }) {
  if (Platform.OS !== 'ios' || !IOSLocalNotification) {
    return false;
  }

  const granted = await requestIOSNotificationPermission();
  if (!granted) {
    return false;
  }

  try {
    await IOSLocalNotification.presentNotification(
      title || 'Notification',
      body || ''
    );
    return true;
  } catch (error) {
    console.log('iOS notification present error:', error?.message || error);
    return false;
  }
}
