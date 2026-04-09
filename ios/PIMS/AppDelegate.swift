import UIKit
import FirebaseCore
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import UserNotifications
import OneSignal

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

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
    // Suppress verbose logging - only show errors
    OneSignal.setLogLevel(.LL_ERROR, visualLevel: .LL_ERROR)
    OneSignal.initWithLaunchOptions(launchOptions)
    OneSignal.setAppId("53886d23-f2ee-43f6-99ac-9c3ac95cdb9d")
    
    // Request push notification permission
    OneSignal.promptForPushNotifications(userResponse: { accepted in
      print("OneSignal: User accepted push notification: \(accepted)")
    })
    
    // Set notification center delegate
    UNUserNotificationCenter.current().delegate = self

    factory.startReactNative(
      withModuleName: "PIMS",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    // Show notification while app is in foreground
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
    // OneSignal will handle the notification automatically
    completionHandler()
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
