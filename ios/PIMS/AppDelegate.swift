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

    // Enable camera in background/PiP — requires com.apple.developer.avfoundation.multitasking-camera-access entitlement
    WebRTCModuleOptions.sharedInstance().enableMultitaskingCameraAccess = true

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
    let appState    = UIApplication.shared.applicationState

    print("[VoIP] ▶ push received callId=\(callId) callType=\(callType) appState=\(appState.rawValue)")

    if appState == .active {
      // App is foregrounded — the Firestore listener in IncomingCallOverlay handles
      // ringing entirely. Skip CallKit so no native screen appears and no _onEnd fires.
      print("[VoIP] app active — skipping CallKit, handing to RNVoip")
      RNVoipPushNotificationManager.didReceiveIncomingPush(with: payload, forType: type.rawValue)
      completion()
      return
    }

    // App is backgrounded or killed — show native CallKit incoming call screen.
    // Must call setup before reportNewIncomingCall so CXProvider is initialized.
    // When app is killed, JS never runs so initCallKeep() in JS hasn't run yet.
    print("[VoIP] app background/killed — calling RNCallKeep.setup + reportNewIncomingCall")
    RNCallKeep.setup(["appName": "Tulsi", "supportsVideo": true])
    PendingCallModule.storePendingVoipCall(callId: callId, callType: callType)
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
      withCompletionHandler: {
        print("[VoIP] reportNewIncomingCall completion called")
        // PushKit requires completion() to be called after CXProvider is notified.
        completion()
      }
    )
    print("[VoIP] reportNewIncomingCall dispatched")
    RNVoipPushNotificationManager.didReceiveIncomingPush(with: payload, forType: type.rawValue)
  }

  func pushRegistry(_ registry: PKPushRegistry,
 didInvalidatePushTokenFor type: PKPushType) {}
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
override func sourceURL(for bridge: RCTBridge) -> URL? { self.bundleURL() }
  override func bundleURL() -> URL? {
#if DEBUG
    URL(string: "http://192.168.68.114:8081/index.bundle?platform=ios&dev=true&minify=false")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}