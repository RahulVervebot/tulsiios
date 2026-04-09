import Foundation
import React
import UserNotifications

@objc(IOSLocalNotification)
class IOSLocalNotification: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc(requestPermission:rejecter:)
  func requestPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
      if let error = error {
        reject("notification_permission_error", error.localizedDescription, error)
        return
      }
      resolve(granted)
    }
  }

  @objc(presentNotification:body:resolver:rejecter:)
  func presentNotification(
    _ title: String,
    body: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default

    let request = UNNotificationRequest(
      identifier: UUID().uuidString,
      content: content,
      trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
    )

    UNUserNotificationCenter.current().add(request) { error in
      if let error = error {
        reject("notification_present_error", error.localizedDescription, error)
        return
      }
      resolve(true)
    }
  }
}
