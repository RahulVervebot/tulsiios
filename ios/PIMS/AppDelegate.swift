import UIKit
import FirebaseCore
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import UserNotifications
import OneSignal
import PushKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate, PKPushRegistryDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  var voipRegistry: PKPushRegistry?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    // Initialize Firebase
    FirebaseApp.configure()

    // Initialize OneSignal for push notifications (v4.4.1 API)
    OneSignal.setLogLevel(.LL_ERROR, visualLevel: .LL_ERROR)
    OneSignal.initWithLaunchOptions(launchOptions)
    OneSignal.setAppId("53886d23-f2ee-43f6-99ac-9c3ac95cdb9d")
    OneSignal.promptForPushNotifications(userResponse: { accepted in
      print("OneSignal: User accepted push notification: \(accepted)")
    })

    // Set notification center delegate
    UNUserNotificationCenter.current().delegate = self

    // Register for VoIP push (PushKit) — needed for CallKit lock-screen calls
    voipRegistry = PKPushRegistry(queue: DispatchQueue.main)
    voipRegistry?.delegate = self
    voipRegistry?.desiredPushTypes = [.voIP]

    factory.startReactNative(
      withModuleName: "PIMS",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  // MARK: - UNUserNotificationCenterDelegate

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    if #available(iOS 14.0, *) {
      completionHandler([.banner, .list, .sound])
    } else {
      completionHandler([.alert, .sound])
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    completionHandler()
  }

  // MARK: - PKPushRegistryDelegate (VoIP push)

  func pushRegistry(_ registry: PKPushRegistry,
                    didUpdate pushCredentials: PKPushCredentials,
                    for type: PKPushType) {
    // Forward VoIP token to the JS layer via react-native-voip-push-notification
    RNVoipPushNotificationManager.didUpdate(pushCredentials, forType: type.rawValue)
  }

  func pushRegistry(_ registry: PKPushRegistry,
                    didReceiveIncomingPushWith payload: PKPushPayload,
                    for type: PKPushType,
                    completion: @escaping () -> Void) {
    let dict       = payload.dictionaryPayload as NSDictionary
    let callId     = dict["callId"]     as? String ?? NSUUID().uuidString
    let callerName = dict["callerName"] as? String ?? "Unknown Caller"
    let callerEmail = dict["callerEmail"] as? String ?? ""
    let callType   = dict["callType"]   as? String ?? "voice"
    let hasVideo   = callType == "video"

    // iOS 13+ REQUIRES reportNewIncomingCall to be called synchronously here.
    // This shows the native CallKit lock-screen call UI even when app is killed.
    RNCallKeep.reportNewIncomingCall(
      callId,
      handle: callerEmail,
      handleType: "generic",
      hasVideo: hasVideo,
      localizedCallerName: callerName,
      supportsHolding: false,
      supportsDTMF: false,
      supportsGrouping: false,
      supportsUngrouping: false,
      fromPushKit: true,
      payload: payload.dictionaryPayload,
      withCompletionHandler: nil
    )

    // Also notify the JS layer so it can track the call data
    RNVoipPushNotificationManager.didReceiveIncomingPush(with: payload, forType: type.rawValue)

    completion()
  }

  func pushRegistry(_ registry: PKPushRegistry,
                    didInvalidatePushTokenFor type: PKPushType) {
    // Token invalidated — will be refreshed on next launch
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    URL(string: "http://192.168.68.113:8081/index.bundle?platform=ios&dev=true&minify=false");
   //  RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
