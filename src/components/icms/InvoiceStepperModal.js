import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  FlatList,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_ENDPOINTS, { initICMSBase } from '../../../icms_config/api';
import LinkProductModal from './LinkProduct';
import EditProduct from './EditProduct';

const extractRows = (payload, fallback = {}) => {
  if (Array.isArray(payload?.InvoiceData)) return payload.InvoiceData;
  if (Array.isArray(payload?.tableData)) return payload.tableData;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload) && Array.isArray(payload?.[0]?.InvoiceData)) return payload[0].InvoiceData;
  if (Array.isArray(payload) && Array.isArray(payload?.[0]?.tableData)) return payload[0].tableData;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(fallback?.InvoiceData)) return fallback.InvoiceData;
  return [];
};

export default function InvoiceStepperModal({
  visible,
  onClose,
  invoiceItem,
  onCompleted,
  vendorDatabaseName,
}) {
  const [step, setStep] = useState(1);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState([]);
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [linkingItem, setLinkingItem] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);
  const [icmsStore, setIcmsStore] = useState('');
  const [loadingConfirmId, setLoadingConfirmId] = useState(null);

  const invoiceNo = invoiceItem?.SavedInvoiceNo || '';
  const invoiceName = invoiceItem?.InvoiceName || '';
  const savedDate = invoiceItem?.SavedDate || '';
  const userEmail = invoiceItem?.UserDetailInfo?.InvoiceUpdatedby || '';

  const hasCompleted =
    Number(invoiceItem?.StepGuider?.currentStep || 0) === 4 &&
    invoiceItem?.StepGuider?.isCompleted === true;
  const stepMeta = [
    { id: 1, label: 'Fix Unknown' },
    { id: 2, label: 'Review & Edit' },
    { id: 3, label: 'Update POS' },
  ];

  const fetchInvoiceRows = async () => {
    if (!invoiceNo || !invoiceName || !savedDate) return;
    setLoadingRows(true);
    try {
      await initICMSBase();
      const token = await AsyncStorage.getItem('access_token');
      const icms_store = await AsyncStorage.getItem('icms_store');
      const storeurl = await AsyncStorage.getItem('storeurl');
      const res = await fetch(API_ENDPOINTS.GETINVOICEDATA, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          store: icms_store ?? '',
          access_token: token ?? '',
          app_url: storeurl ?? '',
          mode: 'MOBILE',
        },
        body: JSON.stringify({
          invoiceNo,
          invoiceName,
          date: savedDate,
        }),
      });
      const json = await res.json().catch(() => null);
      console.log("fetched invoice rows:", json);
      if (!res.ok) return;
      const parsedRows = extractRows(json, invoiceItem);
      if (Array.isArray(parsedRows)) setRows(parsedRows);
    } catch {
      // keep fallback rows
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    if (!visible || !invoiceItem) return;
    const curr = Number(invoiceItem?.StepGuider?.currentStep || 1);
    setStep(curr >= 3 ? 3 : (curr > 0 ? curr : 1));
    setRows(extractRows(invoiceItem, invoiceItem));
  }, [visible, invoiceItem]);

  useEffect(() => {
    if (!visible) return;
    fetchInvoiceRows();
    // Load icms_store for filtering
    AsyncStorage.getItem('icms_store').then(store => setIcmsStore(store || ''));
  }, [visible, invoiceNo, invoiceName, savedDate]);

  const unlinkedRows = useMemo(
    () => (rows || []).filter((r) => String(r?.barcode ?? '').trim().length === 0),
    [rows],
  );

  const linkedRows = useMemo(
    () => (rows || []).filter((r) => {
      const hasBarcode = String(r?.barcode ?? '').trim().length > 0;
      if (!hasBarcode) return false;
      
      // If source field exists, only show if source != icms_store
      if (r?.source) {
        return String(r.source).trim() !== String(icmsStore).trim();
      }
      
      // If no source field, show the product
      return true;
    }),
    [rows, icmsStore],
  );

  const postStepper = async (payload) => {
    await initICMSBase();
    const token = await AsyncStorage.getItem('access_token');
    const icms_store = await AsyncStorage.getItem('icms_store');
    const storeurl = await AsyncStorage.getItem('storeurl');
    const res = await fetch(API_ENDPOINTS.STEPPER_COUNT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        store: icms_store ?? '',
        access_token: token ?? '',
        app_url: storeurl ?? '',
        mode: 'MOBILE',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(t || `Stepper API failed (${res.status})`);
    }
  };

  const fetchVendorDbName = async () => {
    const token = await AsyncStorage.getItem('access_token');
    const icms_store = await AsyncStorage.getItem('icms_store');
    const storeurl = await AsyncStorage.getItem('storeurl');
    const res = await fetch(API_ENDPOINTS.SEARCHVENDOR, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: token ?? '',
        mode: 'MOBILE',
        app_url: storeurl ?? '',
        store: icms_store ?? '',
      },
      body: JSON.stringify({ q: invoiceName }),
    });
    const json = await res.json().catch(() => ({}));
    const found =
      Array.isArray(json?.results) && json.results.length
        ? json.results.find((v) => String(v?.value || '').toLowerCase() === String(invoiceName || '').toLowerCase()) || json.results[0]
        : null;
    return found?.databaseName || vendorDatabaseName || '';
  };

  const handleConfirmAiLinking = async (rowItem) => {
    if (!rowItem) {
      Alert.alert('Error', 'Row data missing.');
      return;
    }
    
    try {
      setLoadingConfirmId(rowItem?.ProductId || rowItem?.itemNo);
      await initICMSBase();
      const token = await AsyncStorage.getItem('access_token');
      const icms_store = await AsyncStorage.getItem('icms_store');
      const storeurl = await AsyncStorage.getItem('storeurl');
      const invoiceDb = await fetchVendorDbName();
      
      const payload = {
        invoiceName: invoiceDb || vendorDatabaseName || '',
        items: [rowItem],
      };
      
      console.log('Confirm AI Linking payload:', payload);
      
      const res = await fetch(API_ENDPOINTS.SingleLinking, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          access_token: token ?? '',
          mode: 'MOBILE',
          store: icms_store ?? '',
          app_url: storeurl ?? '',
        },
        body: JSON.stringify(payload),
      });
      
      const raw = await res.text().catch(() => '');
      let json = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = {};
      }
      
      console.log('Confirm AI linking response:', raw);
      
      if (!res.ok) {
        const msg = json?.message || json?.error?.message || raw || 'Failed to confirm AI linking';
        throw new Error(msg);
      }
      
      Alert.alert('Success', json?.message || 'AI linking confirmed successfully.');
      // Refresh invoice data to update the list
      await fetchInvoiceRows();
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to confirm AI linking');
    } finally {
      setLoadingConfirmId(null);
    }
  };

  const runQuantitySpCostUpdate = async () => {
    await initICMSBase();
    const token = await AsyncStorage.getItem('access_token');
    const icms_store = await AsyncStorage.getItem('icms_store');
     const app_url = await AsyncStorage.getItem('storeurl');
    const email = userEmail || (await AsyncStorage.getItem('userEmail')) || '';
    const invoiceDb = await fetchVendorDbName();
    
    // Filter: only linked rows where source equals icms_store (or no source field)
    const linkedRows = (rows || []).filter((r) => {
      const hasBarcode = String(r?.barcode ?? '').trim().length > 0;
      if (!hasBarcode) return false;
      
      // If source exists, only include if it matches icms_store
      if (r?.source) {
        return String(r.source).trim() === String(icms_store).trim();
      }
      
      // If no source field, include the product
      return true;
    });
    
    const body = {
      invoiceName,
      invoiceSavedDate: savedDate,
      invoiceNo,
      invoice: invoiceDb,
      tableData: linkedRows,
      email,
    };

    const res = await fetch(API_ENDPOINTS.QUANTITY_SP_COSTUPDATE, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        store: icms_store ?? '',
        pos_access_token: token ?? '',
        pos_api: `${app_url}/api/v1` ?? '',
        mode: 'MOBILE',
       app_url: app_url ?? '',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(t || `Quantity/Price update failed (${res.status})`);
    }
    console.log("quantity udpate in pos:",res);

  };

  const goStep2 = async () => {
    setContinueLoading(true);
    setRunning(true);
    try {
      await postStepper({
        invoiceInfo: { invoiceNo, invoiceName, savedDate },
        nextStep: 2,
        isCompleted: false,
        marginvalue: 0,
        IsMargin: false,
      });
      setStep(2);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Step 2 update failed');
    } finally {
      setContinueLoading(false);
      setRunning(false);
    }
  };

  const goStep3 = async () => {
    setContinueLoading(true);
    setRunning(true);
    try {
      await postStepper({
        invoiceInfo: { invoiceNo, invoiceName, savedDate },
        nextStep: 3,
        isCompleted: false,
        marginvalue: 0,
        IsMargin: false,
      });
      setStep(3);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Step 3 update failed');
    } finally {
      setContinueLoading(false);
      setRunning(false);
    }
  };

  const finishStepper = async () => {
    setContinueLoading(true);
    setRunning(true);
    try {
      await runQuantitySpCostUpdate();
      await postStepper({
        invoiceInfo: { invoiceNo, invoiceName, savedDate },
        nextStep: 4,
        isCompleted: true,
        marginvalue: '0',
        IsMargin: false,
      });
      onCompleted?.();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to finish stepper');
    } finally {
      setContinueLoading(false);
      setRunning(false);
    }
  };

  if (!visible || !invoiceItem || hasCompleted) return null;

  return (
    <>
      <Modal
        visible={visible && !linkModalVisible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
          <View style={styles.card}>

            <View style={styles.headerRow}>
              <Text style={styles.title}>Invoice Stepper</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.close}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.invoiceMetaBar}>
              <Text style={styles.metaText} numberOfLines={1}>Invoice No: <Text style={styles.metaStrong}>{invoiceNo || '-'}</Text></Text>
              <Text style={styles.metaText} numberOfLines={1}>Vendor: <Text style={styles.metaStrong}>{invoiceName || '-'}</Text></Text>
              <Text style={styles.metaText} numberOfLines={1}>Invoice Date: <Text style={styles.metaStrong}>{savedDate || '-'}</Text></Text>
            </View>

            <View style={styles.stepRow}>
              {stepMeta.map((s, idx) => (
                <View key={s.id} style={styles.stepItem}>
                  <View style={[styles.stepDot, step >= s.id && styles.stepDotActive]}>
                    <Text style={[styles.stepDotText, step >= s.id && styles.stepDotTextActive]}>{s.id}</Text>
                  </View>
                  {idx < stepMeta.length - 1 && (
                    <View style={[styles.stepConnector, step > s.id && styles.stepConnectorActive]} />
                  )}
                  <Text style={[styles.stepLabel, step >= s.id && styles.stepLabelActive]} numberOfLines={2}>
                    {s.label}
                  </Text>
                </View>
              ))}
            </View>

            {running || loadingRows ? (
              <View style={styles.center}>
                <ActivityIndicator size="small" color="#319241" />
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {step === 1 && (
                  <View>
                    <Text style={styles.stepHeading}>Step 1: Link Unlinked Barcode Rows</Text>
                    {unlinkedRows.length === 0 ? (
                      <View style={styles.successCard}>
                        <Text style={styles.successText}>✓ All products are linked</Text>
                        <Text style={styles.successSubText}>Ready to proceed to the next step</Text>
                      </View>
                    ) : (
                      unlinkedRows.map((row, idx) => (
                        <View key={`unlinked_${row?.itemNo || ''}_${row?.description || ''}_${idx}`} style={styles.rowCard}>
                          <Text style={styles.rowTitle}>{row?.description || '-'}</Text>
                          <Text style={styles.rowSub}>Item: {row?.itemNo || '-'}</Text>
                          <TouchableOpacity
                            style={styles.linkBtn}
                            onPress={() => {
                              setLinkingItem(row);
                              setLinkModalVisible(true);
                            }}
                          >
                            <Text style={styles.linkBtnText}>Link Product</Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </View>
                )}

                {step === 2 && (
                  <View>
                    <Text style={styles.stepHeading}>Step 2: Review & Link AI Linked Products</Text>
                    <FlatList
                      data={linkedRows || []}
                      keyExtractor={(item, idx) => `linked_${item?.ProductId || ''}_${item?.barcode || ''}_${item?.itemNo || ''}_${idx}`}
                      renderItem={({ item }) => (
                        <View style={styles.previewRow}>
                          <Text style={styles.previewMain} numberOfLines={1}>{item?.description || '-'}</Text>
                            <Text style={styles.previewSub}>Barcode: {item?.barcode || '-'}</Text>
                          <Text style={styles.previewSub}>Item: {item?.itemNo || '-'} • Qty: {item?.qty || '-'} • Cost: {item?.unitPrice || '-'}</Text>
                          <View style={styles.step2BtnRow}>
                            <TouchableOpacity
                              style={[styles.confirmLinkBtn, loadingConfirmId === (item?.ProductId || item?.itemNo) && styles.confirmLinkBtnDisabled]}
                              onPress={() => handleConfirmAiLinking(item)}
                              disabled={loadingConfirmId === (item?.ProductId || item?.itemNo)}
                            >
                              {loadingConfirmId === (item?.ProductId || item?.itemNo) ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Text style={styles.confirmLinkBtnText}>Confirm Linking</Text>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.editBtn}
                              onPress={() => {
                                setLinkingItem(item);
                                setLinkModalVisible(true);
                              }}
                            >
                              <Text style={styles.linkBtnText}>Link Product</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                      scrollEnabled={false}
                      ListEmptyComponent={<Text style={styles.muted}>No linked products to review.</Text>}
                    />
                  </View>
                )}

                {step === 3 && (
                  <View>
                    <Text style={styles.stepHeading}>Step 3: Review All Updated Products</Text>
                    <FlatList
                      data={rows || []}
                      keyExtractor={(item, idx) => `all_${item?.ProductId || ''}_${item?.barcode || ''}_${item?.itemNo || ''}_${idx}`}
                      renderItem={({ item }) => {
                        const hasBarcode = String(item?.barcode ?? '').trim().length > 0;
                        const isAiLinked = item?.source && String(item.source).trim() !== String(icmsStore).trim();
                        
                        return (
                          <View style={[styles.previewRow, !hasBarcode && styles.previewRowNotLinked]}>
                            {isAiLinked && (
                              <View style={styles.aiBadge}>
                                <Text style={styles.aiBadgeText}>🤖</Text>
                              </View>
                            )}
                            <Text style={styles.previewMain} numberOfLines={1}>{item?.description || '-'}</Text>
                            <Text style={styles.previewSub}>Barcode: {item?.barcode || 'Not Linked'}</Text>
                            <Text style={styles.previewSub}>Item: {item?.itemNo || '-'} • Qty: {item?.qty || '-'} • Cost: {item?.unitPrice || '-'}</Text>
                          </View>
                        );
                      }}
                      scrollEnabled={false}
                      ListEmptyComponent={<Text style={styles.muted}>No products to display.</Text>}
                    />
                    <View style={styles.helpCard}>
                      <Text style={styles.helpText}>
                        Review all products above. Tap Finish to update quantity, selling price and cost in POS and complete the stepper.
                      </Text>
                    </View>
                  </View>
                )}
              </ScrollView>
            )}

            <View style={styles.actionRow}>
              {step === 1 && !loadingRows && (
                <TouchableOpacity 
                  style={styles.nextBtnFull} 
                  onPress={goStep2} 
                  disabled={running || continueLoading}
                >
                  {continueLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.nextText}>Continue</Text>
                  )}
                </TouchableOpacity>
              )}
              {step === 2 && (
                <>
                  <TouchableOpacity 
                    style={styles.backBtn} 
                    onPress={() => setStep(1)} 
                    disabled={running || continueLoading}
                  >
                    <Text style={styles.backText}>← Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.nextBtn} 
                    onPress={goStep3} 
                    disabled={running || continueLoading}
                  >
                    {continueLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.nextText}>Continue</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
              {step === 3 && (
                <>
                  <TouchableOpacity 
                    style={styles.backBtn} 
                    onPress={() => setStep(2)} 
                    disabled={running || continueLoading}
                  >
                    <Text style={styles.backText}>← Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.nextBtn} 
                    onPress={finishStepper} 
                    disabled={running || continueLoading}
                  >
                    {continueLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.nextText}>Finish</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
   <EditProduct
        visible={editModalVisible}
        item={selectedItem}
        InvoiceDate={savedDate}
        InvNumber={invoiceNo}
        vendorName={invoiceName}
        onClose={() => {
          setEditModalVisible(false);
          setSelectedItem(null);
        }}
        onSave={(updatedItem) => {
          setRows((prev) =>
            (prev || []).map((it) => {
              if (it?.ProductId && updatedItem?.ProductId) {
                return String(it.ProductId) === String(updatedItem.ProductId) ? updatedItem : it;
              }
              if (it?.itemNo && updatedItem?.itemNo) {
                return String(it.itemNo) === String(updatedItem.itemNo) ? updatedItem : it;
              }
              return it;
            }),
          );
          setEditModalVisible(false);
          setSelectedItem(null);
        }}
      />
          </View>
        </View>
      </Modal>

      {linkModalVisible && (
        <LinkProductModal
          visible={linkModalVisible}
          onClose={() => {
            setLinkModalVisible(false);
            setLinkingItem(null);
          }}
          onSelect={async () => {
            setLinkModalVisible(false);
            setLinkingItem(null);
            await fetchInvoiceRows();
          }}
          linkingItem={linkingItem}
          invoice={invoiceItem}
        />
      )}

    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbe3ea',
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  close: { fontSize: 20, color: '#475569', fontWeight: '700' },
  invoiceMetaBar: {
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: '#f1f8f3',
    borderWidth: 1,
    borderColor: '#d7efde',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
  },
  metaText: { fontSize: 12, color: '#334155' },
  metaStrong: { color: '#166534', fontWeight: '700' },
  stepRow: {
    marginTop: 4,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepItem: { flex: 1, alignItems: 'center', position: 'relative' },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepDotActive: {
    backgroundColor: '#319241',
  },
  stepDotText: { color: '#475569', fontWeight: '700' },
  stepDotTextActive: { color: '#fff' },
  stepConnector: {
    position: 'absolute',
    top: 14,
    right: '-50%',
    width: '100%',
    height: 2,
    backgroundColor: '#d1d5db',
    zIndex: 1,
  },
  stepConnectorActive: {
    backgroundColor: '#319241',
  },
  stepLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 4,
    minHeight: 30,
  },
  stepLabelActive: { color: '#166534' },
  stepHeading: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  muted: { color: '#64748b', fontSize: 13, marginBottom: 8 },
  rowCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
  },
  rowTitle: { fontSize: 13, color: '#111827', fontWeight: '700' },
  rowSub: { fontSize: 12, color: '#64748b', marginTop: 2, marginBottom: 8 },
  linkBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  linkBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  fieldRow: { marginTop: 6 },
  label: { fontSize: 12, color: '#475569', fontWeight: '700', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#dbe3ea',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: '#111827',
    backgroundColor: '#fff',
  },
  taskCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 10,
  },
  taskCardActive: {
    borderColor: '#7fc391',
    backgroundColor: '#edf9f0',
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  taskCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#319241',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '700',
    overflow: 'hidden',
  },
  taskTitle: {
    fontSize: 16,
    color: '#1f2937',
    fontWeight: '700',
  },
  helpCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#d7efde',
    borderRadius: 10,
    backgroundColor: '#f5fbf7',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  helpText: {
    color: '#166534',
    fontSize: 13,
    lineHeight: 20,
  },
  previewRow: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
    position: 'relative',
  },
  previewRowNotLinked: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  aiBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 10,
  },
  aiBadgeText: {
    fontSize: 14,
  },
  previewMain: { fontSize: 13, color: '#111827', fontWeight: '700' },
  previewSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  editBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#319241',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  editBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  step2BtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  confirmLinkBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#0F766E',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  confirmLinkBtnDisabled: {
    opacity: 0.6,
  },
  confirmLinkBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  actionRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  skipBtn: {
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  skipText: { color: '#334155', fontWeight: '700' },
  backBtn: {
    backgroundColor: '#64748b',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  backText: { 
    color: '#fff', 
    fontWeight: '700',
    fontSize: 14,
  },
  nextBtn: {
    backgroundColor: '#319241',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    flex: 1,
  },
  nextBtnFull: {
    backgroundColor: '#319241',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    flex: 1,
  },
  nextText: { color: '#fff', fontWeight: '700' },
  center: { paddingVertical: 24, alignItems: 'center', justifyContent: 'center' },
  successCard: {
    backgroundColor: '#edf9f0',
    borderWidth: 1,
    borderColor: '#7fc391',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  successText: {
    fontSize: 14,
    color: '#166534',
    fontWeight: '700',
    marginBottom: 4,
  },
  successSubText: {
    fontSize: 12,
    color: '#64748b',
  },
});
