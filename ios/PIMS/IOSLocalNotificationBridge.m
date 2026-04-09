#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(IOSLocalNotification, NSObject)

RCT_EXTERN_METHOD(
  requestPermission:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  presentNotification:(NSString *)title
  body:(NSString *)body
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
