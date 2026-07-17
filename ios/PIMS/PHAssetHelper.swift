import Foundation
import Photos

@objc(PHAssetHelper)
class PHAssetHelper: NSObject {

  // Returns the original filename (e.g. "rahul_profile.jpg") for a given
  // PHAsset local identifier, which react-native-image-picker exposes as asset.id.
  @objc func getFilename(
    _ localIdentifier: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let fetchResult = PHAsset.fetchAssets(
      withLocalIdentifiers: [localIdentifier],
      options: nil
    )
    guard let asset = fetchResult.firstObject else {
      resolve(nil)
      return
    }
    // "filename" is an undocumented but stable PHAsset KVC key used by Photos.app itself.
    let filename = asset.value(forKey: "filename") as? String
    resolve(filename)
  }
}
