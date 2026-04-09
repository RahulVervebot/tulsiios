#!/bin/bash

# Script to strip bitcode from frameworks
# This is specifically for OneSignal and other frameworks that may contain bitcode

echo "🔧 Stripping bitcode from frameworks..."

FRAMEWORKS_DIR="${BUILT_PRODUCTS_DIR}/${FRAMEWORKS_FOLDER_PATH}"

if [ -d "$FRAMEWORKS_DIR" ]; then
    for FRAMEWORK in "$FRAMEWORKS_DIR"/*.framework; do
        if [ -d "$FRAMEWORK" ]; then
            FRAMEWORK_NAME=$(basename "$FRAMEWORK" .framework)
            FRAMEWORK_EXECUTABLE="${FRAMEWORK}/${FRAMEWORK_NAME}"
            
            if [ -f "$FRAMEWORK_EXECUTABLE" ]; then
                echo "Processing: $FRAMEWORK_NAME"
                
                # Check if framework contains bitcode
                if xcrun bitcode_strip -r "$FRAMEWORK_EXECUTABLE" -o "$FRAMEWORK_EXECUTABLE" 2>/dev/null; then
                    echo "✅ Stripped bitcode from $FRAMEWORK_NAME"
                else
                    echo "ℹ️  No bitcode found in $FRAMEWORK_NAME"
                fi
            fi
        fi
    done
else
    echo "⚠️  Frameworks directory not found: $FRAMEWORKS_DIR"
fi

echo "✅ Bitcode stripping complete!"
