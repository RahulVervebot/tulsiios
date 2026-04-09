#!/bin/bash

# Script to remove alpha channel from App Icon
# Run this from the project root directory

ICON_PATH="ios/PIMS/Images.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png"

echo "Removing alpha channel from $ICON_PATH..."

# Backup original
cp "$ICON_PATH" "${ICON_PATH}.backup"

# Remove alpha channel by converting through JPEG (which doesn't support transparency)
sips -s format jpeg "$ICON_PATH" --out temp.jpg
sips -s format png temp.jpg --out "$ICON_PATH"
rm temp.jpg

echo "✅ Fixed! Original backed up to ${ICON_PATH}.backup"
