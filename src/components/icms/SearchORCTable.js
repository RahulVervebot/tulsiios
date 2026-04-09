// src/screens/SearchORCTable.js
import React, { useEffect, useRef, useState } from 'react';
import {
  View, TextInput, StyleSheet, ScrollView, Text, TouchableOpacity, Modal, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import RBSheet from 'react-native-raw-bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COLORS = {
  bg: '#ffffff',
  card: '#f7f9fc',
  border: '#e6e8ef',
  primary: '#319241',
  danger: '#D9534F',
  text: '#111',
  sub: '#666',
};
const GREEN_LIGHT = '#e6f6ec';
const GREEN_DARK = '#256f3a';
const STORE_URL_KEY = 'storeurl';
const ACCESS_TOKEN_KEY = 'access_token';

const parseNumberValue = (value) => {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const cleaned = s.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : '';
};
const formatMoney = (n) => Number(n).toFixed(2);
const formatQty = (n) => {
  const fixed = Number(n).toFixed(3);
  return fixed.replace(/\.?0+$/, '');
};

// Helper function to detect if a value is unexpected (null or 10x outlier)
const isUnexpectedValue = (value, allValues, field) => {
  const numValue = parseNumberValue(value);
  
  // Check if null/empty
  if (numValue === '' || numValue == null) {
    return true;
  }
  
  // Get all valid numbers from the dataset
  const validNumbers = allValues
    .map(item => parseNumberValue(item[field]))
    .filter(v => v !== '' && v != null && Number.isFinite(Number(v)))
    .map(Number);
  
  if (validNumbers.length === 0) {
    return false;
  }
  
  // Calculate median
  const sorted = [...validNumbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 
    ? (sorted[mid - 1] + sorted[mid]) / 2 
    : sorted[mid];
  
  // Check if value is 10x the median
  const numVal = Number(numValue);
  return numVal > median * 10;
};

const SearchTableComponent = ({ tableData, setTableData, onRemoveRow, onAddManual }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredData, setFilteredData] = useState(tableData);
  const [storeUrl, setStoreUrl] = useState('');
  const [token, setToken] = useState('');
  const [categories, setCategories] = useState([]);

  // Bottom sheets
  const listSheetRef = useRef(null);
  const [editModalVisible, setEditModalVisible] = useState(false);

  // Row editor state
  const [editIndex, setEditIndex] = useState(null);
  const [draft, setDraft] = useState({
    itemNo: '',
    posName: '',
    department: '',
    barcode: '',
    cp: '',
    sellingPrice: '',
    newSellingPrice: '',
    categoryMargin: '0',
    categoryMarkup: '0',
    description: '',
    qty: '',
    unitPrice: '',
    extendedPrice: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const s = await AsyncStorage.getItem(STORE_URL_KEY);
        const t = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
        setStoreUrl(s || '');
        setToken(t || '');
      } catch {
        setStoreUrl('');
        setToken('');
      }
    })();
  }, []);

  useEffect(() => {
    const fetchCategories = async () => {
      if (!storeUrl || !token) return;
      try {
        const url = `${storeUrl}/pos/app/categories`;
        const res = await fetch(url, {
          method: 'GET',
          headers: { accept: 'application/json', access_token: token },
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => ({}));
        setCategories(Array.isArray(json?.categories) ? json.categories : []);
      } catch {
        setCategories([]);
      }
    };
    fetchCategories();
  }, [storeUrl, token]);

  const getCategoryPricing = (department, cpValue, currentSellingPrice) => {
    const dep = String(department ?? '').trim().toLowerCase();
    const matched = (categories || []).find(
      (cat) => String(cat?.categoryName ?? '').trim().toLowerCase() === dep
    );

    const marginNum = Number(matched?.categoryMargin ?? 0);
    const markupNum = Number(matched?.categoryMarkup ?? 0);
    const cpNum = parseNumberValue(cpValue);
    const appliedRate = marginNum !== 0 ? marginNum : (markupNum !== 0 ? markupNum : 0);

    const computedSellingPrice =
      cpNum !== '' && appliedRate !== 0
        ? (Number(cpNum) + (Number(cpNum) * Number(appliedRate)) / 100).toFixed(2)
        : String(currentSellingPrice ?? '');

    return {
      categoryMargin: String(Number.isFinite(marginNum) ? marginNum : 0),
      categoryMarkup: String(Number.isFinite(markupNum) ? markupNum : 0),
      newSellingPrice: computedSellingPrice,
    };
  };

  useEffect(() => {
    if (!editModalVisible) return;
    setDraft((prev) => {
      const pricing = getCategoryPricing(prev.department, prev.cp, prev.sellingPrice);
      if (
        String(prev.categoryMargin ?? '0') === String(pricing.categoryMargin ?? '0') &&
        String(prev.categoryMarkup ?? '0') === String(pricing.categoryMarkup ?? '0') &&
        String(prev.newSellingPrice ?? '') === String(pricing.newSellingPrice ?? '')
      ) {
        return prev;
      }
      return {
        ...prev,
        categoryMargin: String(pricing.categoryMargin ?? '0'),
        categoryMarkup: String(pricing.categoryMarkup ?? '0'),
        newSellingPrice: String(pricing.newSellingPrice ?? ''),
      };
    });
  }, [categories, editModalVisible]);

  useEffect(() => {
    setFilteredData(tableData);
  }, [tableData]);

  const onSearch = (query) => {
    setSearchQuery(query);
    if (!query) {
      setFilteredData(tableData);
      return;
    }
    const q = query.toLowerCase();
    const filtered = tableData.filter((item) =>
      (item.itemNo || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      (item.barcode || '').toLowerCase().includes(q)
    );
    setFilteredData(filtered);
  };

  const openEditorForIndex = (idx) => {
    setEditIndex(idx);
    const row = tableData[idx] || {};
    const pricing = getCategoryPricing(row.department, row.cp, row.sellingPrice);
    setDraft({
      itemNo: row.itemNo || '',
      posName: row.posName || '',
      department: row.department || '',
      barcode: row.barcode || '',
      cp: String(row.cp ?? ''),
      sellingPrice: String(row.sellingPrice ?? ''),
      newSellingPrice: String(pricing.newSellingPrice ?? ''),
      categoryMargin: String(pricing.categoryMargin ?? '0'),
      categoryMarkup: String(pricing.categoryMarkup ?? '0'),
      description: row.description || '',
      qty: String(row.qty ?? ''),
      unitPrice: String(row.unitPrice ?? ''),
      extendedPrice: String(row.extendedPrice ?? ''),
    });
    setEditModalVisible(true);
  };

  const openEditorForNew = () => {
    setEditIndex(tableData.length); // new index (to be appended)
    setDraft({
      itemNo: '',
      posName: '',
      department: '',
      barcode: '',
      cp: '',
      sellingPrice: '',
      newSellingPrice: '',
      categoryMargin: '0',
      categoryMarkup: '0',
      description: '',
      qty: '',
      unitPrice: '',
      extendedPrice: '',
    });
    setEditModalVisible(true);
  };

  const saveDraft = () => {
    const isEditMode = editIndex != null && editIndex < tableData.length;
    if (!isEditMode) {
      const requiredFields = [
        String(draft.description ?? '').trim(),
        String(draft.qty ?? '').trim(),
        String(draft.unitPrice ?? '').trim(),
        String(draft.extendedPrice ?? '').trim(),
      ];
      const hasMissing = requiredFields.some((val) => val.length === 0);
      if (hasMissing) {
        Alert.alert('Required fields', 'Description, Qty, Case Cost and Extended Price are required.');
        return;
      }
    }

    const qtyNum = parseNumberValue(draft.qty);
    const priceNum = parseNumberValue(draft.unitPrice);
    const enteredExtended = parseNumberValue(draft.extendedPrice);
    const computedExtended = qtyNum !== '' && priceNum !== '' ? Number(qtyNum) * Number(priceNum) : '';
    const finalExtended = enteredExtended !== '' ? enteredExtended : computedExtended;

    const newRow = {
      itemNo: draft.itemNo,
      posName: draft.posName,
      department: draft.department,
      barcode: draft.barcode,
      cp: draft.cp,
      sellingPrice: draft.sellingPrice,
      newSellingPrice: draft.newSellingPrice,
      categoryMargin: draft.categoryMargin,
      categoryMarkup: draft.categoryMarkup,
      description: draft.description,
      qty: qtyNum,
      unitPrice: priceNum,
      extendedPrice: finalExtended !== '' ? Number(finalExtended).toFixed(2) : '',
      manuallyAdded: true,
      condition: 'normal',
    };

    setTableData(prev => {
      const next = [...prev];
      if (editIndex != null && editIndex < prev.length) {
        next[editIndex] = { ...prev[editIndex], ...newRow, manuallyAdded: true };
      } else {
        next.push(newRow);
      }
      return next;
    });
    setEditModalVisible(false);
  };

  const removeRow = (idx) => onRemoveRow ? onRemoveRow(idx) : setTableData(prev => prev.filter((_, i) => i !== idx));
  const handleQtyCaseExtendedChange = (field, value) => {
    setDraft((prev) => {
      const next = { ...prev, [field]: value };
      const qty = parseNumberValue(next.qty);
      const unit = parseNumberValue(next.unitPrice);
      const ext = parseNumberValue(next.extendedPrice);

      if (field === 'qty') {
        if (qty !== '' && unit !== '') {
          next.extendedPrice = formatMoney(Number(qty) * Number(unit));
        } else if (qty !== '' && ext !== '' && Number(qty) !== 0) {
          next.unitPrice = formatMoney(Number(ext) / Number(qty));
        }
        return next;
      }

      if (field === 'unitPrice') {
        if (qty !== '' && unit !== '') {
          next.extendedPrice = formatMoney(Number(qty) * Number(unit));
        } else if (unit !== '' && ext !== '' && Number(unit) !== 0) {
          next.qty = formatQty(Number(ext) / Number(unit));
        }
        return next;
      }

      if (field === 'extendedPrice') {
        if (qty !== '' && ext !== '' && Number(qty) !== 0) {
          next.unitPrice = formatMoney(Number(ext) / Number(qty));
        } else if (unit !== '' && ext !== '' && Number(unit) !== 0) {
          next.qty = formatQty(Number(ext) / Number(unit));
        }
      }
      return next;
    });
  };

  // Header tap: open list sheet
  const onHeaderTap = () => {
    listSheetRef.current?.open();
  };

  // From list picker: choose a row to edit
  const pickRowFromList = (idx) => {
    listSheetRef.current?.close();
    setTimeout(() => openEditorForIndex(idx), 120);
  };
  const isEditMode = editIndex != null && editIndex < tableData.length;

  return (
    <View style={styles.container}>
      {/* Search + Add Manual */}
      <View style={styles.topBar}>
        <View style={styles.totalWrap}>
          <Text style={styles.totalText}>Total: {tableData.length}</Text>
        </View>
        <TextInput
          style={styles.searchBox}
          placeholder="Search by ItemNo, Barcode, or Description..."
          value={searchQuery}
          onChangeText={onSearch}
          placeholderTextColor={COLORS.sub}
        />
         {filteredData.length === 0 ? (
          <></>
         ) : (
        <TouchableOpacity style={[styles.btn, styles.btnLight]} onPress={openEditorForNew}>
          <Text style={[styles.btnText, styles.btnLightText]}>Add Manually</Text>
         </TouchableOpacity>
          )
         }
        
      </View>

      {/* Header */}
        {filteredData.length === 0 ? (
          <></>
         ) : (
      <View style={styles.tableHeader}>
        <TouchableOpacity style={[styles.tableHeaderCell, { flex: 1 }]} onPress={onHeaderTap}>
          <Text style={styles.headerText}>ItemNo ⌄</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tableHeaderCell, { flex: 2 }]} onPress={onHeaderTap}>
          <Text style={styles.headerText}>Desc ⌄</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tableHeaderCell, { flex: 1 }]} onPress={onHeaderTap}>
          <Text style={styles.headerText}>Qty ⌄</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tableHeaderCell, { flex: 1 }]} onPress={onHeaderTap}>
          <Text style={styles.headerText}>Case Cost ⌄</Text>
        </TouchableOpacity>
        <View style={[styles.tableHeaderCell, { width: 44 }]}>
          <Text style={styles.headerText}>🗑</Text>
        </View>
      </View>
         )}

      {/* Body */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
      >
        {filteredData.length === 0 ? (
          <Text style={styles.infoText}>No data available.</Text>
        ) : (
          filteredData.map((item, idx) => {
            // Map filtered idx back to actual idx so edits remove correct row
            const realIndex = tableData.indexOf(item);
            return (
              <View key={`${item.itemNo}-${idx}`} style={styles.tableRow}>
                <TouchableOpacity style={[styles.tableCell, { flex: 1 }]} onPress={() => openEditorForIndex(realIndex)}>
                  <Text numberOfLines={1} style={styles.cellText}>{item.itemNo}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.tableCell, { flex: 2 }]} onPress={() => openEditorForIndex(realIndex)}>
                  <Text numberOfLines={1} style={styles.cellText}>{item.description}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.tableCell, { flex: 1 }]} onPress={() => openEditorForIndex(realIndex)}>
                  <Text numberOfLines={1} style={[
                    styles.cellText,
                    isUnexpectedValue(item.qty, tableData, 'qty') && { color: COLORS.danger }
                  ]}>{String(item.qty ?? '')}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.tableCell, { flex: 1 }]} onPress={() => openEditorForIndex(realIndex)}>
                  <Text numberOfLines={1} style={[
                    styles.cellText,
                    isUnexpectedValue(item.unitPrice, tableData, 'unitPrice') && { color: COLORS.danger }
                  ]}>{String(item.unitPrice ?? '')}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.tableCell, { width: 44 }]} onPress={() => removeRow(realIndex)}>
                  <Text style={[styles.cellText, { color: COLORS.danger }]}>❌</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* === Bottom Sheet: Full List Picker === */}
      <RBSheet
        ref={listSheetRef}
        height={520}
        openDuration={180}
        closeOnDragDown
        customStyles={{
          container: styles.sheetContainer,
          draggableIcon: { backgroundColor: '#ccc' },
        }}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>All Items</Text>
        </View>
        <ScrollView style={{ maxHeight: 440 }}>
          {tableData.map((row, i) => (
            <TouchableOpacity key={`pick-${i}`} style={styles.pickRow} onPress={() => pickRowFromList(i)}>
              <Text style={styles.pickMain} numberOfLines={1}>{row.itemNo} — {row.description}</Text>
              <Text style={styles.pickSub}>Qty: {row.qty ?? ''} | Unit: {row.unitPrice ?? ''}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </RBSheet>

      {/* === Modal: Row Editor === */}
      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setEditModalVisible(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
            style={styles.modalKeyboardWrap}
          >
            <View style={styles.modalCard}>
              <ScrollView
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{isEditMode ? 'Edit Row' : 'Add Row'}</Text>
              </View>

              {isEditMode && (
                <View style={styles.formRow}>
                  <Text style={styles.groupTitle}>Read Only Details</Text>
                  <View style={styles.readonlyGrid}>
                    <View style={styles.readonlyCard}>
                      <Text style={styles.readonlyLabel}>ItemNo</Text>
                      <Text style={styles.readonlyValue}>{draft.itemNo || '-'}</Text>
                    </View>
                    <View style={styles.readonlyCard}>
                      <Text style={styles.readonlyLabel}>POS Name</Text>
                      <Text style={styles.readonlyValue}>{String(draft.posName ?? '-') || '-'}</Text>
                    </View>
                    <View style={styles.readonlyCard}>
                      <Text style={styles.readonlyLabel}>Department</Text>
                      <Text style={styles.readonlyValue}>{String(draft.department ?? '-') || '-'}</Text>
                    </View>
                    <View style={styles.readonlyCard}>
                      <Text style={styles.readonlyLabel}>Barcode</Text>
                      <Text style={styles.readonlyValue}>{String(draft.barcode ?? '-') || '-'}</Text>
                    </View>
                    <View style={styles.readonlyCard}>
                      <Text style={styles.readonlyLabel}>Cost Price</Text>
                      <Text style={styles.readonlyValue}>{String(draft.cp ?? '-') || '-'}</Text>
                    </View>
                    <View style={styles.readonlyCard}>
                      <Text style={styles.readonlyLabel}>Selling Price</Text>
                      <Text style={styles.readonlyValue}>{String(draft.sellingPrice ?? '-') || '-'}</Text>
                    </View>
                    <View style={styles.readonlyCard}>
                      <Text style={styles.readonlyLabel}>New Selling Price</Text>
                      <Text style={styles.readonlyValue}>{String(draft.newSellingPrice ?? '-') || '-'}</Text>
                    </View>
                  </View>
                  {(Number(draft.categoryMargin || 0) !== 0 || Number(draft.categoryMarkup || 0) !== 0) && (
                    <View style={styles.readonlyMetaWrap}>
                      {Number(draft.categoryMargin || 0) !== 0 && (
                        <View style={styles.metaBadge}>
                          <Text style={styles.metaBadgeText}>Margin: {draft.categoryMargin}%</Text>
                        </View>
                      )}
                      {Number(draft.categoryMarkup || 0) !== 0 && (
                        <View style={styles.metaBadge}>
                          <Text style={styles.metaBadgeText}>Markup: {draft.categoryMarkup}%</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}

              <View style={styles.formRow}>
                <Text style={styles.groupTitle}>Editable Fields</Text>
                {!isEditMode && (
                  <>
                    <Text style={styles.label}>Item No</Text>
                    <TextInput
                      style={styles.input}
                      value={draft.itemNo}
                      onChangeText={(t) => setDraft(prev => ({ ...prev, itemNo: t }))}
                      placeholder="Enter item number"
                      placeholderTextColor={COLORS.sub}
                    />
                  </>
                )}
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, { height: 72 }]}
                  value={draft.description}
                  onChangeText={(t) => setDraft(prev => ({ ...prev, description: t }))}
                  placeholder="Enter description"
                  placeholderTextColor={COLORS.sub}
                  multiline
                />
              </View>

              <View style={[styles.formRow, { flexDirection: 'row', gap: 12 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[
                    styles.label,
                    isEditMode && isUnexpectedValue(draft.qty, tableData, 'qty') && { color: COLORS.danger }
                  ]}>Qty {isEditMode && isUnexpectedValue(draft.qty, tableData, 'qty') && '⚠️'}</Text>
                  <TextInput
                    style={[
                      styles.input,
                      isEditMode && isUnexpectedValue(draft.qty, tableData, 'qty') && { borderColor: COLORS.danger, color: COLORS.danger }
                    ]}
                    keyboardType="numeric"
                    value={String(draft.qty ?? '')}
                    onChangeText={(t) => handleQtyCaseExtendedChange('qty', t)}
                    placeholder="0"
                    placeholderTextColor={COLORS.sub}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[
                    styles.label,
                    isEditMode && isUnexpectedValue(draft.unitPrice, tableData, 'unitPrice') && { color: COLORS.danger }
                  ]}>Case Cost {isEditMode && isUnexpectedValue(draft.unitPrice, tableData, 'unitPrice') && '⚠️'}</Text>
                  <TextInput
                    style={[
                      styles.input,
                      isEditMode && isUnexpectedValue(draft.unitPrice, tableData, 'unitPrice') && { borderColor: COLORS.danger, color: COLORS.danger }
                    ]}
                    keyboardType="decimal-pad"
                    value={String(draft.unitPrice ?? '')}
                    onChangeText={(t) => handleQtyCaseExtendedChange('unitPrice', t)}
                    placeholder="0.00"
                    placeholderTextColor={COLORS.sub}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <Text style={[
                  styles.label,
                  isEditMode && isUnexpectedValue(draft.extendedPrice, tableData, 'extendedPrice') && { color: COLORS.danger }
                ]}>Extended Price {isEditMode && isUnexpectedValue(draft.extendedPrice, tableData, 'extendedPrice') && '⚠️'}</Text>
                <TextInput
                  style={[
                    styles.input,
                    isEditMode && isUnexpectedValue(draft.extendedPrice, tableData, 'extendedPrice') && { borderColor: COLORS.danger, color: COLORS.danger }
                  ]}
                  keyboardType="decimal-pad"
                  value={String(draft.extendedPrice ?? '')}
                  onChangeText={(t) => handleQtyCaseExtendedChange('extendedPrice', t)}
                  placeholder="0.00"
                  placeholderTextColor={COLORS.sub}
                />
              </View>

              <View style={styles.sheetActions}>
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={saveDraft}>
                  <Text style={styles.btnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={() => setEditModalVisible(false)}>
                  <Text style={styles.btnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
};

export default SearchTableComponent;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderColor: COLORS.border,
    marginTop: 10
  },
  topBar: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  totalWrap: {
    backgroundColor: GREEN_LIGHT,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cfe9d8',
    paddingHorizontal: 10,
    height: 40,
    justifyContent: 'center',
  },
  totalText: {
    color: GREEN_DARK,
    fontWeight: '700',
    fontSize: 12,
  },
  searchBox: {
    flex: 1,
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    color: COLORS.text,
  },
  btn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '700' },
  btnPrimary: { backgroundColor: COLORS.primary },
  btnLight: { backgroundColor: GREEN_LIGHT },
  btnLightText: { color: GREEN_DARK },
  btnDanger: { backgroundColor: COLORS.danger },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#eef8f2',
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    marginTop: 4,
  },
  tableHeaderCell: { alignItems: 'center', justifyContent: 'center' },
  headerText: { fontWeight: '700', color: COLORS.text, fontSize: 13 },

  scroll: { marginTop: 6, flex: 1 },
  scrollContent: { flexGrow: 1 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  tableCell: { paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 13, color: COLORS.text },

  infoText: { padding: 10, fontStyle: 'italic', color: COLORS.sub },

  // Sheets
  sheetContainer: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    backgroundColor: COLORS.bg,
  },
  sheetHeader: { padding: 12, borderBottomWidth: 1, borderColor: COLORS.border },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },

  pickRow: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: COLORS.border },
  pickMain: { fontSize: 14, color: COLORS.text },
  pickSub: { fontSize: 12, color: COLORS.sub, marginTop: 4 },

  formRow: { paddingHorizontal: 12, paddingVertical: 8 },
  groupTitle: { fontSize: 13, fontWeight: '700', color: '#1f2937', marginBottom: 8 },
  label: { fontSize: 12, color: COLORS.sub, marginBottom: 6 },
  input: {
    height: 40,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    color: COLORS.text,
  },
  inputReadonly: {
    backgroundColor: '#f4f6f8',
    color: '#6b7280',
  },
  readonlyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  readonlyCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#dfe4ea',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    paddingHorizontal: 9,
  },
  readonlyLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '700',
    marginBottom: 3,
  },
  readonlyValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '700',
  },
  readonlyMetaWrap: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaBadge: {
    backgroundColor: '#eef8f2',
    borderWidth: 1,
    borderColor: '#cfe9d8',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  metaBadgeText: {
    color: '#256f3a',
    fontSize: 12,
    fontWeight: '700',
  },
  sheetActions: {
    padding: 12, flexDirection: 'row', gap: 12, justifyContent: 'flex-end',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalKeyboardWrap: {
    width: '100%',
    maxWidth: 560,
  },
  modalCard: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalScrollContent: {
    paddingBottom: 12,
  },
});
