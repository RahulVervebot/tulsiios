import Foundation

@objc(PendingCallModule)
class PendingCallModule: NSObject {

  private static let kCallId       = "pendingVoipCallId"
  private static let kCallType     = "pendingVoipCallType"
  private static let kCallAccepted = "pendingVoipCallAccepted"

  // Called by AppDelegate PushKit handler on every incoming VoIP push.
  static func storePendingVoipCall(callId: String, callType: String) {
    UserDefaults.standard.set(callId,   forKey: kCallId)
    UserDefaults.standard.set(callType, forKey: kCallType)
    UserDefaults.standard.set(false,    forKey: kCallAccepted)
    UserDefaults.standard.synchronize()
  }

  // JS-callable clear — used by checkLogin on timeout
  @objc func clearPendingVoipCall(_ resolve: RCTPromiseResolveBlock,
                                   rejecter reject: RCTPromiseRejectBlock) {
    PendingCallModule.clearPendingVoipCallStatic()
    resolve(nil)
  }

  // Clear without consuming — called when app is foregrounded or call ends without accept.
  static func clearPendingVoipCall() { clearPendingVoipCallStatic() }
  private static func clearPendingVoipCallStatic() {
    UserDefaults.standard.removeObject(forKey: kCallId)
    UserDefaults.standard.removeObject(forKey: kCallType)
    UserDefaults.standard.removeObject(forKey: kCallAccepted)
    UserDefaults.standard.synchronize()
  }

  // Returns true if a VoIP push was received (regardless of accept status).
  // Used by checkLogin to decide whether to poll for the accept flag.
  @objc func hasPendingVoipCall(_ resolve: RCTPromiseResolveBlock,
                                 rejecter reject: RCTPromiseRejectBlock) {
    let callId = UserDefaults.standard.string(forKey: PendingCallModule.kCallId)
    resolve(callId != nil && !callId!.isEmpty)
  }

  // Called from JS _onAnswer (CallKeepConfig) to mark the user actually accepted.
  // This way getPendingAcceptedCall only returns data for accepted calls.
  @objc func markCallAccepted(_ resolve: RCTPromiseResolveBlock,
                               rejecter reject: RCTPromiseRejectBlock) {
    UserDefaults.standard.set(true, forKey: PendingCallModule.kCallAccepted)
    UserDefaults.standard.synchronize()
    resolve(nil)
  }

  // Called from App.js checkLogin — returns and clears only if user actually accepted.
  @objc func getPendingAcceptedCall(_ resolve: @escaping RCTPromiseResolveBlock,
                                     rejecter reject: RCTPromiseRejectBlock) {
    let accepted = UserDefaults.standard.bool(forKey: PendingCallModule.kCallAccepted)
    let callId   = UserDefaults.standard.string(forKey: PendingCallModule.kCallId)
    let callType = UserDefaults.standard.string(forKey: PendingCallModule.kCallType)
    if accepted, let callId = callId, !callId.isEmpty {
      PendingCallModule.clearPendingVoipCall()
      resolve(["callId": callId, "callType": callType ?? "voice"])
    } else {
      resolve(nil)
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
