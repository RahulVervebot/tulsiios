// src/components/PrintOptions.js
import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Platform,
  PermissionsAndroid,
  Linking,
  KeyboardAvoidingView,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ZSDKModule from '../../ZSDKModule';
// --- Android BT permissions ---
// Hard-stop: never navigate to Settings from here
async function ensureBtScanReady() {
  if (Platform.OS !== 'android') return true;

  const P = PermissionsAndroid.PERMISSIONS;
  const wants = Platform.Version >= 31 ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT] : [P.ACCESS_FINE_LOCATION, P.ACCESS_COARSE_LOCATION].filter(Boolean);

  // 1) Check
  const checks = await Promise.all(wants.map(p => PermissionsAndroid.check(p)));
  if (checks.every(Boolean)) return true;

  // 2) Request (no settings redirect here)
  const res = await PermissionsAndroid.requestMultiple(wants);
  const granted = wants.every(p => res[p] === PermissionsAndroid.RESULTS.GRANTED);
  if (granted) return true;

  // 3) If blocked or denied — just tell the user and return false (no navigation)
  Alert.alert(
    'Bluetooth permission required',
    'Please enable Bluetooth permissions in your phone settings to use Bluetooth printing.'
  );
  return false;
}


// --- Helpers: product data shaping for label payloads ---
function toExportList(items) {
  // Keep same fields your USB endpoint expects
  const keep = ['name', 'list_price', 'barcode', 'size'];
  return items
    .map((it) => {
      // Map your current context item shape -> expected shape
      const name =
        it.name ??
        it.productName ??
        it.product_name ??
        it.title ??
        '';
      const list_price_num =
        typeof it.list_price === 'number'
          ? it.list_price
          : typeof it.price === 'number'
          ? it.price
          : typeof it.salePrice === 'number'
          ? it.salePrice
          : Number(it.list_price || it.price || it.salePrice || 0);
      const barcode =
        it.barcode ??
        it.product_barcode ??
        it.upc ??
        it.code ??
        it.ean13 ??
        '';
      const size = (it.size ?? it.Size) ? String(it.size ?? it.Size) : '';

      return {
        name,
        list_price: list_price_num, // raw number; server can format
        barcode,
        size,
      };
    })
    .map(o => {
      // JSON to excel flow had `$ ` formatting; keep raw for USB endpoint
      const filtered = {};
      keep.forEach(k => (filtered[k] = o[k]));
      return filtered;
    });
}

// ZPL helpers (from your old code, slightly compact)
function limitTo60Characters(str) {
  if (!str) return '';
  return str.length <= 60 ? str : str.slice(0, 60) + '...';
}

function wrapTextByWords(text, maxLength, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxLength) cur += ' ' + w;
    else { lines.push(cur); cur = w; if (lines.length >= maxLines) break; }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.slice(0, maxLines);
}

function buildZplForItems(items) {
  let all = '';
  for (const elem of items) {
    const rawName = limitTo60Characters((elem.name || '').replace(/"/g, '^FH^FD22^FH^'));
    const nameLen = rawName.length;

    const sizeValue = elem.size && elem.size !== 'false' ? String(elem.size).slice(0, 8) : '';
    let priceNum =
      typeof elem.list_price === 'number'
        ? elem.list_price
        : Number((elem.list_price || '').toString().replace(/[^0-9.]/g, '') || 0);
    const priceStr = '$ ' + priceNum.toFixed(2);

    let finalName = '';
    if (nameLen > 50) finalName = wrapTextByWords(rawName, 50, 2).join('\n');
    else if (nameLen > 26) finalName = wrapTextByWords(rawName, 26, 2).join('\n');
    else finalName = wrapTextByWords(rawName, 26, 2).join('\n');

    const barcode = elem.barcode || '';
    if (!barcode) {
      // You can skip or render a blank barcode box; here we skip the item
      continue;
    }

    all += `
^XA
^FO5,20
^A0,30,40
^FB550,2,2,C
^FD${finalName}^FS
^FO60,80
^FB480,1,0,C
^BY1.7,1,5
^BCN,30,N,N,N
^FD${barcode}^FS
^FO20,145
^A0,50,60
^FB250,1,0,C
^FD${sizeValue}^FS
^FO133,160
^A0,60,60
^FB550,2,0,C
^FD${priceStr}^FS
^XZ`;
  }
  return all;
}

export default function PrintOptions({
  items = [],
  onClear,           // optional: callback to clear list after success
  containerStyle,    // optional style override
}) {
const [qty, setQty] = useState(1);  
  const [showIpModal, setShowIpModal] = useState(false);
  const [ipAddress, setIpAddress] = useState('');
  const [btPrinters, setBtPrinters] = useState([]);
  const [btScanning, setBtScanning] = useState(false);
  const [usbPrinting, setUsbPrinting] = useState(false);
  const btScanActiveRef = useRef(false);
  const btScanTimeoutRef = useRef(null);
  const scrollRef = useRef(null);
const incQty = () => setQty((n) => Math.min((Number(n) || 1) + 1, 9999));
const decQty = () => setQty((n) => Math.max((Number(n) || 1) - 1, 1));

  const exportList = useMemo(() => toExportList(items), [items]);

  // Load saved IP address on mount
  React.useEffect(() => {
    const loadSavedIP = async () => {
      try {
        const savedIP = await AsyncStorage.getItem('IP_Address');
        if (savedIP) {
          setIpAddress(savedIP);
        }
      } catch (error) {
        console.error('Failed to load saved IP:', error);
      }
    };
    loadSavedIP();
  }, []);

  const handleQtyChange = (txt) => {
    if (txt === '' || /^\d+$/.test(txt)) setQty(txt);
    else Alert.alert('Error', 'Please enter a valid integer number');
  };

  const showPrinterPicker = (discoveredJson) => {
    const json = JSON.parse(discoveredJson || '[]');
    const list =
      Platform.OS === 'ios'
        ? json.map((p, i) => ({ id: i, label: `${p.friendlyName}`, mac: p.friendlyName }))
        : json.map((p, i) => ({ id: i, label: `${p.address}, ${p.friendlyName}`, mac: p.address }));
    setBtPrinters(list);
    if (!list.length) {
      Alert.alert('Printers', 'No printers found, try again.');
      return;
    }
    const buttons = list.map(pr => ({
      text: pr.label,
      onPress: () => printViaBluetooth(pr),
    }));
    buttons.push({ text: 'CANCEL', onPress: () => {} });
    Alert.alert('Printers', 'Select a Bluetooth printer', buttons, { cancelable: true });
  };

  const fetchBondedPrinters = () => {
    if (!ZSDKModule?.zsdkGetBondedBluetoothPrinters) {
      Alert.alert('Bluetooth', 'Paired device lookup is not available. Please rebuild the app.');
      return;
    }
    ZSDKModule.zsdkGetBondedBluetoothPrinters((error, bonded) => {
      if (error) {
        Alert.alert('Bluetooth', `Paired device lookup failed: ${error}`);
        return;
      }
      showPrinterPicker(bonded);
    });
  };

  const discoverPrinters = async () => {
    const ok = await ensureBtScanReady();
    if (!ok) return;

    try {
      if (!ZSDKModule?.zsdkPrinterDiscoveryBluetooth) {
        Alert.alert('Bluetooth', 'ZSDKModule is not available. Please rebuild the app.');
        return;
      }
      btScanActiveRef.current = true;
      setBtScanning(true);
      if (btScanTimeoutRef.current) {
        clearTimeout(btScanTimeoutRef.current);
      }
      btScanTimeoutRef.current = setTimeout(() => {
        if (btScanActiveRef.current) {
          btScanActiveRef.current = false;
          setBtScanning(false);
          fetchBondedPrinters();
        }
      }, 15000);

      ZSDKModule.zsdkPrinterDiscoveryBluetooth((error, discovered) => {
        btScanActiveRef.current = false;
        setBtScanning(false);
        if (btScanTimeoutRef.current) {
          clearTimeout(btScanTimeoutRef.current);
          btScanTimeoutRef.current = null;
        }
        if (error) {
          console.error('Discovery error:', error);
          Alert.alert('Bluetooth', `Discovery failed: ${error}`);
          return;
        }
        if (!discovered || discovered === '[]') {
          fetchBondedPrinters();
          return;
        }
        showPrinterPicker(discovered);
      });
    } catch (e) {
      console.error(e);
      Alert.alert('Bluetooth', 'Discovery threw an exception.');
      btScanActiveRef.current = false;
      setBtScanning(false);
      if (btScanTimeoutRef.current) {
        clearTimeout(btScanTimeoutRef.current);
        btScanTimeoutRef.current = null;
      }
    }
  };

  const printViaBluetooth = async (printer) => {
    if (!exportList.length) {
      Alert.alert('Print', 'No items to print.');
      return;
    }
    // Validate barcodes present
    const missingBarcode = exportList.some(x => !x.barcode);
    if (missingBarcode) {
      Alert.alert('Missing Barcode', 'One or more items have no barcode. Skipping those.');
    }

    const zpl = buildZplForItems(exportList);
    if (!zpl.trim()) {
      Alert.alert('Print', 'No printable labels (missing barcodes).');
      return;
    }

const times = Math.max(Number(qty) || 1, 1);
    try {
      for (let i = 0; i < times; i++) {
        const mac = printer.mac; // Android uses MAC, iOS uses friendlyName (same param in your native)
        ZSDKModule.zsdkWriteBluetooth(mac, zpl);
      }
      Alert.alert(
        'Print Successful',
        'Labels sent to Bluetooth printer.',
        [
          onClear
            ? { text: 'Clear List', onPress: () => onClear() }
            : { text: 'OK', onPress: () => {} },
        ],
        { cancelable: true }
      );
      setQty('1');
    } catch (e) {
      console.error('BT print error:', e);
      Alert.alert('Print', 'Bluetooth print failed.');
    }
  };

  const printViaUSB = async () => {
    if (!exportList.length) {
      Alert.alert('Print', 'No items to print.');
      return;
    }
    let savedIP = '';
    try {
      const ip = await AsyncStorage.getItem('IP_Address');
      savedIP = ip || '';
    } catch {}

    const url = savedIP || ipAddress;
    if (!url) {
      Alert.alert('USB Print', 'Please add a valid IP/URL first.');
      return;
    }

    const times = Math.max(parseInt(qty || '1', 10), 1);

    setUsbPrinting(true);
    let success = 0;
    for (let i = 0; i < times; i++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
          },
          body: JSON.stringify(exportList),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Optional: parse result if your endpoint returns JSON
        success++;
      } catch (e) {
        console.error('USB print error:', e);
      }
    }

    if (success === times) {
      Alert.alert(
        'Success',
        'All barcodes printed successfully!',
        [
          onClear
            ? { text: 'Clear List', onPress: () => onClear() }
            : { text: 'OK', onPress: () => {} },
        ],
        { cancelable: true }
      );
      setQty('1');
    } else if (success > 0) {
      Alert.alert('Partial Success', `${success} of ${times} prints completed.`);
    } else {
      Alert.alert('Failed', 'No prints completed. Check IP/Printer service.');
    }
    setUsbPrinting(false);
  };

  const saveIp = async () => {
    const finalIp = ipAddress.trim();

    if (!finalIp) {
      Alert.alert('IP', 'Please type IP:PORT or full URL.');
      return;
    }
    await AsyncStorage.setItem('IP_Address', finalIp);
    setIpAddress(finalIp);
    setShowIpModal(false);
    Alert.alert('Saved', 'IP saved.');
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.wrapper, containerStyle]}
      >
      <View style={styles.row}>
        <TouchableOpacity style={styles.btnUsb} onPress={printViaUSB} disabled={usbPrinting}>
          {usbPrinting ? (
            <ActivityIndicator size="small" color="#009933" />
          ) : (
            <Text style={styles.btnUsbText}>PRINT VIA USB</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnBt} onPress={discoverPrinters} disabled={btScanning}>
          {btScanning ? (
            <ActivityIndicator size="small" color="green" />
          ) : (
            <Text style={styles.btnBtText}>PRINT VIA BLUETOOTH</Text>
          )}
        </TouchableOpacity>
      </View>

   {/* Row 2: Qty controls + IP toggle */}
<View style={styles.row}>
  <View style={styles.qtyRow}>
    <TouchableOpacity style={styles.qtyBtn} onPress={decQty}>
      <Text style={styles.qtyText}>-</Text>
    </TouchableOpacity>

    <Text style={styles.qtyValue}>{qty}</Text>

    <TouchableOpacity style={styles.qtyBtn} onPress={incQty}>
      <Text style={styles.qtyText}>+</Text>
    </TouchableOpacity>
  </View>

  <TouchableOpacity
    style={styles.ipToggle}
    onPress={() => setShowIpModal(true)}
  >
    <Text style={styles.ipToggleText}>ADD IP</Text>
  </TouchableOpacity>
</View>
      </ScrollView>

      <Modal
        visible={showIpModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIpModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboard}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add Printer IP</Text>
              <View style={styles.ipRow}>
                <TextInput
                  value={ipAddress}
                  onChangeText={setIpAddress}
                        placeholder={ipAddress || "TYPE IP:PORT or http://host:port"}
                  placeholderTextColor="#adadad"
                  style={styles.ipInput}
                  keyboardType="default"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setShowIpModal(false)}>
                  <Text style={styles.modalCancelText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ipSave} onPress={saveIp}>
                  <Text style={styles.ipSaveText}>SAVE</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const THEME = {primary: '#2C1E70', secondary: '#319241'};

const styles = StyleSheet.create({
  keyboardContainer: {
    width: '100%',
  },
  wrapper: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  btnUsb: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderColor: '#009933',
    borderWidth: 0.5,
    alignItems: 'center',
  },
  btnUsbText: { color: '#009933', fontSize: 15, fontWeight: '600' },
  btnBt: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderColor: 'green',
    borderWidth: 0.5,
    alignItems: 'center',
  },
  btnBtText: { color: 'green', fontSize: 15, fontWeight: '600' },
  qtyInput: {
    flex: 1,
    padding: 10,
    backgroundColor: '#fff',
    borderColor: '#038c7f',
    borderWidth: 0.5,
    borderRadius: 50,
    textAlign: 'center',
  },
  ipToggle: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderColor: THEME.secondary,
    borderWidth: 0.5,
    alignItems: 'center',
  },
  ipToggleText: { color: THEME.secondary, fontSize: 15, fontWeight: '600' },
  ipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ipInput: {
    flex: 1,
    borderColor: '#adadad',
    borderWidth: 1,
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 16,
  },
  ipSave: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#038c7f',
    borderRadius: 10,
  },
  ipSaveText: { color: '#fff', fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 16,
  },
  modalKeyboard: {
    width: '100%',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  modalTitle: {
    color: '#1F2937',
    fontWeight: '700',
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#9CA3AF',
    backgroundColor: '#fff',
  },
  modalCancelText: {
    color: '#4B5563',
    fontWeight: '600',
  },
  qtyRow: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#fff',
  borderColor: '#038c7f',
  borderWidth: 0.5,
  borderRadius: 50,
  paddingVertical: 6,
  paddingHorizontal: 10,
  minWidth: 140,
  justifyContent: 'space-between',
},
qtyBtn: {
  backgroundColor: '#9CA3AF',
  paddingVertical: 6,
  paddingHorizontal: 12,
  borderRadius: 5,
},
qtyText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
qtyValue: { marginHorizontal: 12, fontSize: 16, fontWeight: 'bold',color:"#000" },

});
