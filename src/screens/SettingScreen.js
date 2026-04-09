import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  useWindowDimensions,
  Platform,
  TouchableOpacity,
  LayoutAnimation,
  UIManager,
  Switch,
  Alert,
  ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import AppHeader from '../components/AppHeader';

import reportbg from '../assets/images/report-bg.png';
import HourlyReport from '../assets/icons/Hourly-Reports.png';
import SaleSummaryReport from '../assets/icons/Sales-Summary-Report.png';
import TopCustumerList from '../assets/icons/Top-Customers-List.png';

const PANEL_RADIUS = 28;

// Enable layout animation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function SettingScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const styles = getStyles(isTablet);
  const navigation = useNavigation();

  const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

  // Current logged-in role
  const [currentRole, setCurrentRole] = useState('customer');

  // Accordions
  const [expanded, setExpanded] = useState({ user: true, icms: false, pos: false });

  // === NEW PERMISSIONS MODEL (by setting) ===
  // Each setting has:
  //  - adminOnly: when true, only Administrator is enabled; non-admin roles disabled+false
  //  - roles: per-role allow
  const [userPerms, setUserPerms] = useState({
    createUser: {
      adminOnly: true,
      roles: { administrator: true, manager: false, cashier: false, customer: false },
    },
    updateUser: {
      adminOnly: true,
      roles: { administrator: true, manager: false, cashier: false, customer: false },
    },
  });

  useEffect(() => {
    (async () => {
      const role = (await AsyncStorage.getItem('userRole')) || 'customer';
      setCurrentRole(role);
    })();
  }, []);

  const isAdmin = useMemo(() => currentRole?.toLowerCase() === 'administrator', [currentRole]);
  // If you want *only admins* to edit permission assignments, lock UI for others:
  const lockAllEdits = useMemo(() => !isAdmin, [isAdmin]);

  const toggleAccordion = (key) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Helpers to update state cleanly
  const setAdminOnly = (settingKey, value) => {
    setUserPerms((prev) => {
      const next = { ...prev };
      const roles = { ...next[settingKey].roles };

      // If adminOnly -> force non-admin roles to false, admin true
      if (value) {
        roles.administrator = true;
        roles.manager = false;
        roles.cashier = false;
        roles.customer = false;
      }
      next[settingKey] = { ...next[settingKey], adminOnly: value, roles };
      return next;
    });
  };

  const toggleRole = (settingKey, roleKey, value) => {
    setUserPerms((prev) => {
      const next = { ...prev };
      next[settingKey] = {
        ...next[settingKey],
        roles: { ...next[settingKey].roles, [roleKey]: value },
      };
      return next;
    });
  };

  const SettingSection = ({ settingKey, title }) => {
    const s = userPerms[settingKey];
    const roles = s.roles;

    // When adminOnly, non-admins disabled (and set false by setter above)
    const roleRow = (roleKey, label) => {
      const disabled =
        lockAllEdits || (s.adminOnly && roleKey !== 'administrator'); // lock when AdminOnly ON
      const value = !!roles[roleKey];
      return (
        <View style={styles.switchRow} key={roleKey}>
          <Text style={[styles.switchLabel, disabled && { opacity: 0.5 }]}>{label}</Text>
          <Switch
            value={value}
            disabled={disabled}
            onValueChange={(v) => toggleRole(settingKey, roleKey, v)}
          />
        </View>
      );
    };

    const onUpdate = () => {
      // console out only this setting’s final state
      // You can replace with API call.
      /* Example payload:
         {
           setting: "createUser",
           adminOnly: true/false,
           roles: { administrator: true, manager: false, cashier: false, customer: false }
         }
      */
      console.log('UPDATED PERMISSION:', {
        setting: settingKey,
        adminOnly: s.adminOnly,
        roles: { ...s.roles },
      });
      Alert.alert('Success', `${title} permissions updated.`);
    };

    return (
      <View style={styles.settingCard}>
        <View style={styles.settingHeader}>
          <Text style={styles.settingTitle}>{title}</Text>
        </View>

        {/* Master switch */}
        <View style={styles.switchRow}>
          <Text style={[styles.switchLabel, lockAllEdits && { opacity: 0.5 }]}>
            Restrict to Administrator only
          </Text>
          <Switch
            value={s.adminOnly}
            disabled={lockAllEdits}
            onValueChange={(v) => setAdminOnly(settingKey, v)}
          />
        </View>

        {/* Role switches */}
        <View style={styles.rolesWrap}>
          {roleRow('administrator', 'Administrator')}
          {roleRow('manager', 'Manager')}
          {roleRow('cashier', 'Cashier')}
          {roleRow('customer', 'Customer')}
        </View>

        {/* Per-setting Update button */}
        <TouchableOpacity
          style={[styles.updateBtn, lockAllEdits && { opacity: 0.6 }]}
          disabled={lockAllEdits}
          onPress={onUpdate}
          activeOpacity={0.85}
        >
          <Text style={styles.updateBtnText}>Update</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const RowHeader = ({ icon, label, onPress, expanded }) => (
    <TouchableOpacity style={styles.rowHeader} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.rowHeaderLeft}>
        <Image source={icon} style={styles.rowIcon} resizeMode="contain" />
        <Text style={styles.rowTitle}>{label}</Text>
      </View>
      <Text style={styles.chevron}>{expanded ? '−' : '+'}</Text>
    </TouchableOpacity>
  );

  return (
    <ImageBackground source={getImageSource(reportbg)} style={styles.screen} resizeMode="cover">
      <View style={styles.backdrop} />
      <AppHeader Title="SETTING" backgroundType="image" backgroundValue={reportbg} />

      <ScrollView
  style={styles.panelInner}
  contentContainerStyle={{ paddingBottom: 20 }}
  showsVerticalScrollIndicator={false}
>
        {/* USER SETTING (Accordion) */}
        <View style={styles.accordionCard}>
          <RowHeader
            icon={SaleSummaryReport}
            label="User Setting"
            expanded={expanded.user}
            onPress={() => toggleAccordion('user')}
          />
          {expanded.user && (
            <View style={styles.accordionBody}>
              <Text style={styles.sectionHint}>
                Current Role: <Text style={styles.hintBold}>{currentRole}</Text>{' '}
                {isAdmin ? '(can edit)' : '(view only)'}
              </Text>

              <SettingSection settingKey="createUser" title="Create User" />
              <SettingSection settingKey="updateUser" title="Update User" />
            </View>
          )}
        </View>

        {/* ICMS SETTING (placeholder) */}
        <View style={styles.accordionCard}>
          <RowHeader
            icon={HourlyReport}
            label="tulsiAI Setting"
            expanded={expanded.icms}
            onPress={() => toggleAccordion('icms')}
          />
          {expanded.icms && (
            <View style={styles.accordionBody}>
              <Text style={styles.placeholder}>(Will Add tulsiAI configuration toggles here Soon)</Text>
            </View>
          )}
        </View>

        {/* POS SETTING (placeholder) */}
        <View style={styles.accordionCard}>
          <RowHeader
            icon={TopCustumerList}
            label="POS Setting"
            expanded={expanded.pos}
            onPress={() => toggleAccordion('pos')}
          />
          {expanded.pos && (
            <View style={styles.accordionBody}>
              <Text style={styles.placeholder}>(Will Add POS configuration toggles here Soon)</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

const COLORS = {
  baseBG: 'rgba(255,255,255,0.9)',
  stroke: 'rgba(0,0,0,0.08)',
  sub: '#6B7280',
  text: '#111827',
  primary: '#2C1E70',
  roleBG: '#319241',
  roleText: '#5B4500',
  update: '#2a8a4f',
};

const getStyles = (isTablet) =>
  StyleSheet.create({
    screen: { flex: 1 },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.25)',
    },

    panelInner: {
      flex: 1,
      backgroundColor: COLORS.baseBG,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingVertical: isTablet ? 14 : 10,
      paddingHorizontal: isTablet ? 16 : 12,
      ...Platform.select({
        android: { elevation: 2 },
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: -2 },
        },
      }),
      gap: 12,
    },

    accordionCard: {
      backgroundColor: '#fff',
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.stroke,
      overflow: 'hidden',
    },
    rowHeader: {
      paddingVertical: isTablet ? 16 : 14,
      paddingHorizontal: isTablet ? 14 : 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowIcon: { width: isTablet ? 32 : 26, height: isTablet ? 32 : 26 },
    rowTitle: {
      fontSize: isTablet ? 20 : 16,
      fontWeight: '700',
      color: COLORS.text,
      letterSpacing: 0.2,
    },
    chevron: { fontSize: 24, color: COLORS.sub, paddingHorizontal: 6 },

    accordionBody: {
      paddingHorizontal: isTablet ? 14 : 12,
      paddingBottom: isTablet ? 14 : 12,
      gap: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: COLORS.stroke,
    },
    sectionHint: {
      color: COLORS.sub,
      marginTop: 2,
      marginBottom: 8,
      fontSize: isTablet ? 14 : 13,
    },
    hintBold: { color: COLORS.text, fontWeight: '700' },

    // Setting section
    settingCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.stroke,
      borderRadius: 12,
      padding: 12,
      backgroundColor: 'rgba(250,250,250,0.95)',
    },
    settingHeader: {
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    settingTitle: {
      fontSize: isTablet ? 18 : 16,
      fontWeight: '800',
      color: COLORS.text,
      letterSpacing: 0.2,
    },

    rolesWrap: { marginTop: 4 },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    switchLabel: { fontSize: isTablet ? 15 : 14, color: COLORS.text },

    updateBtn: {
      marginTop: 10,
      backgroundColor: COLORS.update,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
    },
    updateBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    placeholder: { color: COLORS.sub, fontSize: 14, paddingVertical: 8 },
  });
