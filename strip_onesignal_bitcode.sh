#!/bin/bash

echo "🔧 Stripping bitcode from OneSignal frameworks..."

cd ios/Pods || exit 1

# List of OneSignal frameworks to process
FRAMEWORKS=(
    "OneSignalXCFramework/OneSignalFramework/OneSignal.xcframework/ios-arm64/OneSignal.framework/OneSignal"
    "OneSignalXCFramework/OneSignalFramework/OneSignalCore.xcframework/ios-arm64/OneSignalCore.framework/OneSignalCore"
    "OneSignalXCFramework/OneSignalFramework/OneSignalExtension.xcframework/ios-arm64/OneSignalExtension.framework/OneSignalExtension"
    "OneSignalXCFramework/OneSignalFramework/OneSignalOutcomes.xcframework/ios-arm64/OneSignalOutcomes.framework/OneSignalOutcomes"
)

for FRAMEWORK_PATH in "${FRAMEWORKS[@]}"; do
    if [ -f "$FRAMEWORK_PATH" ]; then
        FRAMEWORK_NAME=$(basename "$FRAMEWORK_PATH")
        echo "Processing: $FRAMEWORK_NAME"
        
        # Backup original
        cp "$FRAMEWORK_PATH" "${FRAMEWORK_PATH}.backup"
        
        # Strip bitcode - remove all bitcode sections
        xcrun bitcode_strip -r "$FRAMEWORK_PATH" -o "$FRAMEWORK_PATH"
        
        if [ $? -eq 0 ]; then
            echo "✅ Successfully stripped bitcode from $FRAMEWORK_NAME"
        else
            echo "⚠️  Failed to strip bitcode from $FRAMEWORK_NAME - restoring backup"
            mv "${FRAMEWORK_PATH}.backup" "$FRAMEWORK_PATH"
        fi
    else
        echo "⚠️  Framework not found: $FRAMEWORK_PATH"
        echo "   Searching for alternative path..."
        
        # Try to find the framework
        FOUND=$(find . -name "$FRAMEWORK_NAME" -type f 2>/dev/null | head -n 1)
        if [ -n "$FOUND" ]; then
            echo "   Found at: $FOUND"
            cp "$FOUND" "${FOUND}.backup"
            xcrun bitcode_strip -r "$FOUND" -o "$FOUND"
            if [ $? -eq 0 ]; then
                echo "✅ Successfully stripped bitcode from $FOUND"
            fi
        fi
    fi
done

echo ""
echo "🔍 Verifying bitcode removal..."
echo ""

# Verify bitcode was removed
for FRAMEWORK_PATH in "${FRAMEWORKS[@]}"; do
    FRAMEWORK_NAME=$(basename "$FRAMEWORK_PATH")
    FOUND=$(find . -name "$FRAMEWORK_NAME" -type f 2>/dev/null | head -n 1)
    
    if [ -n "$FOUND" ]; then
        # Check if bitcode is present
        if otool -l "$FOUND" | grep -q "__LLVM"; then
            echo "⚠️  $FRAMEWORK_NAME still contains bitcode"
        else
            echo "✅ $FRAMEWORK_NAME - bitcode removed"
        fi
    fi
done

echo ""
echo "✅ Done! Now clean build and archive again."
echo "   Run: cd ios && xcodebuild clean -workspace PIMS.xcworkspace -scheme PIMS"
