#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PHAssetHelper, NSObject)

RCT_EXTERN_METHOD(
  getFilename:(NSString *)localIdentifier
  resolve:(RCTPromiseResolveBlock)resolve
  reject:(RCTPromiseRejectBlock)reject
)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
