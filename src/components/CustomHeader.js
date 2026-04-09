// components/CustomHeader.js
import React,{useEffect,useState} from 'react';
import { View, StyleSheet, ImageBackground, TouchableOpacity, Image, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Profile from "../assets/icons/Profile.svg";
import Setting from "../assets/icons/Profile.svg";
import TulsiLogo from '../assets/images/Tulsi.svg';
import TulsiWhiteLogo from '../assets/icons/Tulsi_Icon_white.svg';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

const CustomHeader = ({
  Title, 
  backgroundType = "color", 
  backgroundValue = "#fff", 
  children
}) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = width < 420;
  const isTablet = width >= 768;
  const styles = getStyles({ isCompact, isTablet });
  const [user_name, setUserName] = useState('');
  const [user_email, setUserEmail] = useState('');
  const [user_role, setUserRole] = useState('');

  useEffect(() => {
    const checkLogin = async () => {
      try {
        const userName = await AsyncStorage.getItem('userName');
        const userEmail = await AsyncStorage.getItem('userEmail');
        const userRole = await AsyncStorage.getItem('userRole');

        setUserEmail(userEmail);
        setUserName(userName);
        setUserRole(userRole);
      } catch (e) {
        navigation.replace('Login');
      }
    };
    checkLogin();
  }, []);


  const renderBackground = () => {
    if (backgroundType === "image") {
      return (
        <ImageBackground
          source={getImageSource(backgroundValue)}
          style={[
            styles.headerContainer,
            isCompact && styles.headerContainerCompact,
            { paddingTop: (isCompact ? styles.headerContainerCompact.paddingTop : styles.headerContainer.paddingTop) + insets.top },
          ]}
          resizeMode="cover"
        >
          {renderContent()}
          {children}
        </ImageBackground>
      );
    }
    return (
      <View
        style={[
          styles.headerContainer,
          { backgroundColor: backgroundValue },
          isCompact && styles.headerContainerCompact,
          { paddingTop: (isCompact ? styles.headerContainerCompact.paddingTop : styles.headerContainer.paddingTop) + insets.top },
        ]}>
        {renderContent()}
        {children}
      </View>
    );
  };

const renderContent = () => {
  return (
  
    <View style={[styles.content, isCompact && styles.contentCompact]}>
      {/* Left */}
    
      <View style={[styles.logo, isCompact && styles.logoCompact]}>
        <TulsiWhiteLogo width={styles.rowIcon.width} height={styles.rowIcon.height} />
        <View style={styles.logoTextWrap}>
          <Text style={styles.headerUser}>Hello,</Text>
          <Text style={styles.headerName} numberOfLines={1} ellipsizeMode="tail">
            {user_name ? user_name.split(' ')[0] : ''}
          </Text>
        </View>
      </View>
      {/* Center (absolute) */}
      <View style={styles.titleOverlay} pointerEvents="none">
        <Text
          style={styles.headerTitle}
          numberOfLines={isCompact ? 2 : 1}
          ellipsizeMode="tail"
        >
          {Title}
        </Text>
      </View>

      {/* Right */}
      <TouchableOpacity style={styles.profileBtn} onPress={() => navigation.navigate('Profile')}>
        <Profile width={36} height={36} />
      </TouchableOpacity>
    </View>
  );
};


  return <View>{renderBackground()}</View>;
};

const getStyles = ({ isCompact, isTablet }) => {
  const horizontalPadding = isTablet ? 28 : isCompact ? 16 : 22;
  const verticalPadding = isTablet ? 24 : isCompact ? 14 : 14;
  const iconSize = isTablet ? 42 : isCompact ? 30 : 36;
  const titleSize = isTablet ? 22 : isCompact ? 16 : 18;
  const nameSize = isTablet ? 18 : isCompact ? 14 : 16;
  const userSize = isTablet ? 13 : isCompact ? 11 : 12;
  const titleTopPad = isTablet ? 36 : 14;

  return StyleSheet.create({
    logo: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
    },
    logoCompact: {
      flex: 1,
      marginRight: 12,
    },
    logoTextWrap: {
      flexShrink: 1,
      maxWidth: '85%',
    },
    headerContainer: {
      paddingHorizontal: horizontalPadding,
      paddingVertical: verticalPadding,
      paddingTop: isTablet ? 10 : isCompact ? 10 : 10,
    },
    headerContainerCompact: {
      paddingHorizontal: horizontalPadding,
      paddingVertical: verticalPadding,
      paddingTop: isTablet ? 18 : isCompact ? 5 : 5,
    },
    content: {
      position: 'relative',
      minHeight: isTablet ? 56 : 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: titleTopPad,
    },
    contentCompact: {
      paddingTop: 4,
      minHeight: 0,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowIcon: { width: iconSize, height: iconSize },
    profileBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: iconSize,
      minHeight: iconSize,
    },

    // ⬇️ Absolute centered title
    titleOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingTop: titleTopPad,
    },
    headerTitle: {
      fontSize: titleSize,
      fontWeight: '700',
      color: '#fff',
      paddingHorizontal: isTablet ? 140 : 90,
      textAlign: 'center',
    },
    headerUser: {
      fontSize: userSize,
      fontWeight: '400',
      color: '#fff',
      paddingHorizontal: 10,
    },
    headerName: {
      fontSize: nameSize,
      fontWeight: '700',
      color: '#fff',
      paddingHorizontal: 10,
      textTransform: 'capitalize',
    },
  });
};


export default CustomHeader;
