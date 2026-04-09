// components/ReportHeader.js
import React from 'react';
import { View, StyleSheet, ImageBackground, TouchableOpacity, Text } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

const AppHeader = ({
  Title, 
  backgroundType = "color", 
  backgroundValue = "#fff", 
  children
}) => {

  const navigation = useNavigation();
  const renderBackground = () => {
    if (backgroundType === "image") {
      return (
        <ImageBackground
          source={getImageSource(backgroundValue)}
          style={styles.headerContainer}
          resizeMode="cover"
        >
          <View style={styles.headerBar}>
            {renderContent()}
          </View>
          {children}
        </ImageBackground>
      );
    } 
    return (
      <View style={[styles.headerContainer, { backgroundColor: backgroundValue }]}>
        <View style={styles.headerBar}>
          {renderContent()}
        </View>
        {children}
      </View>
    );
  };

const renderContent = () => (
  <View style={styles.content}>
    <TouchableOpacity
      style={styles.leftWrapper}
      activeOpacity={0.7}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 24 }}
      onPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('Tabs');
        }
      }}
    >
      <View style={styles.leftIcon}>
        <Ionicons name="arrow-back-outline" size={24} color="#fff" />
      </View>
    </TouchableOpacity>

    <View style={styles.titleWrap}>
      <Text
        style={styles.headerTitle}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {Title}
      </Text>
    </View>

    <View style={styles.rightSpacer} />
  </View>
);


  return <View>{renderBackground()}</View>;
};

const styles = StyleSheet.create({
  logo: { flexDirection: 'row' },
  headerContainer: {
    paddingHorizontal: 14,
    paddingTop: 32,
    paddingBottom: 8,
  },
  headerBar: {
    minHeight: 64,
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowIcon: { width: 36, height: 36 },
  leftWrapper: {
    width: 64,
    height: 48,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  leftIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightSpacer: { width: 64, height: 48 },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 22,
    textTransform: 'uppercase',
  },

  headerUser: { fontSize: 12, fontWeight: '400', color: '#000', paddingHorizontal: 10 },
  headerName: { fontSize: 16, fontWeight: '700', color: '#000', paddingHorizontal: 10 },
});


export default AppHeader;
