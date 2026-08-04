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
    FirebaseApp.configure()
    OneSignal.setLogLevel(.LL_ERROR, visualLevel: .LL_ERROR)
    OneSignal.initWithLaunchOptions(launchOptions)
    OneSignal.setAppId("53886d23-f2ee-43f6-99ac-9c3ac95cdb9d")
    OneSignal.promptForPushNotifications(userResponse: { accepted in
      print("OneSignal: User accepted push notification: \(accepted)")
    })

    UNUserNotificationCenter.current().delegate = self

    voipRegistry = PKPushRegistry(queue: DispatchQueue.main)
    voipRegistry?.delegate = self
    voipRegistry?.desiredPushTypes = [.voIP]

    factory.startReactNative(withModuleName: "PIMS", in: window, launchOptions: launchOptions)
    return true
  }

  // MARK: - UNUserNotificationCenterDelegate

  func userNotificationCenter(_ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    if #available(iOS 14.0, *) {
      completionHandler([.banner, .list, .sound])
    } else {
      completionHandler([.alert, .sound])
    }
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void) {
    completionHandler()
  }

  // MARK: - PKPushRegistryDelegate

  func pushRegistry(_ registry: PKPushRegistry,
                    didUpdate pushCredentials: PKPushCredentials,
                    for type: PKPushType) {
    RNVoipPushNotificationManager.didUpdate(pushCredentials, forType: type.rawValue)
  }

  func pushRegistry(_ registry: PKPushRegistry,
                    didReceiveIncomingPushWith payload: PKPushPayload,
                    for type: PKPushType,
                    completion: @escaping () -> Void) {
    let dict        = payload.dictionaryPayload as NSDictionary
    let callId      = dict["callId"]      as? String ?? NSUUID().uuidString
    let callerName  = dict["callerName"]  as? String ?? "Unknown Caller"
    let callerEmail = dict["callerEmail"] as? String ?? ""
    let callType    = dict["callType"]    as? String ?? "voice"
    let hasVideo    = callType == "video"

    // Store call info BEFORE reportNewIncomingCall so it's available when user accepts.
    // accepted starts false — only set true when user actually taps Accept in CallKit.
    PendingCallModule.storePendingVoipCall(callId: callId, callType: callType)

    // iOS 13+ requires reportNewIncomingCall synchronously in the PushKit handler.
    RNCallKeep.reportNewIncomingCall(
      callId,
      handle: callerEmail.isEmpty ? callerName : callerEmail,
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

    // App already in foreground — in-app overlay handles ringing, clear stored call
    // so checkLogin() doesn't try to navigate (user accepts via overlay normally).
    if UIApplication.shared.applicationState == .active {
      RNCallKeep.endCall(withUUID: callId, reason: 2) // 2 = CXCallEndedReasonRemoteEnded
      PendingCallModule.clearPendingVoipCall()
    }

    RNVoipPushNotificationManager.didReceiveIncomingPush(with: payload, forType: type.rawValue)
    completion()
  }

  func pushRegistry(_ registry: PKPushRegistry,
 didInvalidatePushTokenFor type: PKPushType) {}
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
override func sourceURL(for bridge: RCTBridge) -> URL? { self.bundleURL() }
  override func bundleURL() -> URL? {
#if DEBUG
    URL(string: "http://192.168.68.113:8081/index.bundle?platform=ios&dev=true&minify=false")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}