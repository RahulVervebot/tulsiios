import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Platform, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

const InvoiceRow = ({ item, index, categoryMetaByDept = {}, isExpanded, selectedIds, onToggleSelect, onEdit, onLinkProduct, onConfirmAiLinking, onRemoveLinkedItem, onToggle, onPriceUpdate, loadingConfirmAiId, loadingUnlinkId,isicmsstore }) => {
    const [activePrevKey, setActivePrevKey] = useState(null);
    const { width, fontScale } = useWindowDimensions();
    const isTablet = width >= 768;
    if (!item) return null;
    let Invqty;
    if (item.qty == '0' && item.extendedPrice === '0.00') {
      return null;
    }
    if (!item.qty) {
      Invqty = (Number(item.extendedPrice) / Number(item.unitPrice)).toFixed(0);
    }
// console.log("items for row invoice:",item);
    // responsive sizes
    const base = isTablet ? 14 : 12.6;
    const labelSize = Math.max(11, base - 1 / fontScale);
    const valueSize = Math.max(12, base / fontScale);
    const cellSize = Math.max(12, base / fontScale);

    const isSelected = selectedIds.has(item.ProductId);
    const barcodeValue = String(item.barcode ?? '').trim();
    const hasBarcode = barcodeValue.length > 0;
    const sourceValue = String(item.source ?? '').trim().toLowerCase();
    const isCentral = sourceValue && sourceValue !== isicmsstore?.toLowerCase();
    const isicmsdata = sourceValue ===  isicmsstore?.toLowerCase();
    const isStockUpdated = item?.isStockUpdated === true || item?.isStockUpdated === 'true';
    const isEven = typeof index === 'number' ? index % 2 === 0 : true;
    const baseBg = isStockUpdated
      ? '#DCFCE7'
      : !hasBarcode
      ? '#ff0000'
      : isEven
      ? '#FAFAFA'
      : '#FFFFFF';
    const rowBg = isSelected ? '#DFF7E0' : baseBg;
    const textColor = '#21262E';
    const isBaseUnlinked = baseBg.toLowerCase() === '#ff0000';
    const isBaseCentral = baseBg.toLowerCase() === '#ffecec';
    const hideUnlinkButton = isBaseUnlinked || !isicmsdata || isStockUpdated;
    const showCheckbox = hasBarcode && !isCentral && !isStockUpdated;
    const deptKey = String(item?.department ?? '').trim().toLowerCase();
    const pricingMeta = categoryMetaByDept?.[deptKey] || { margin: 0, markup: 0, pp: 0 };
    const margin = Number(pricingMeta?.margin ?? 0);
    const markup = Number(pricingMeta?.markup ?? 0);
    const pp = Number(pricingMeta?.pp ?? 0);
    const cpNum = Number(item?.cp ?? 0);
    const appliedRate = margin !== 0 ? margin : (markup !== 0 ? markup : (pp !== 0 ? pp : 0));
    const roundToNearestLimitedDecimal = (value) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return null;
      const endings = [0.29, 0.49, 0.79, 0.89, 0.99];
      const base = Math.floor(num);
      const candidates = [];
      for (let d = base - 1; d <= base + 1; d += 1) {
        endings.forEach((end) => {
          const candidate = d + end;
          if (candidate > 0) candidates.push(candidate);
        });
      }
      if (!candidates.length) return Number(num.toFixed(2));
      let best = candidates[0];
      let bestDiff = Math.abs(num - best);
      for (let i = 1; i < candidates.length; i += 1) {
        const c = candidates[i];
        const diff = Math.abs(num - c);
        if (diff < bestDiff || (diff === bestDiff && c < best)) {
          best = c;
          bestDiff = diff;
        }
      }
      return Number(best.toFixed(2));
    };
    const newcost = Number((item.unitPrice / item.pieces).toFixed(2));
    const newSellingPrice =
       appliedRate !== 0
        ? roundToNearestLimitedDecimal(newcost + (newcost * appliedRate) / 100)
        : (item?.sellingPrice != null ? String(item.sellingPrice) : '-');

    // Update parent with new selling price
    React.useEffect(() => {
      if (onPriceUpdate && newSellingPrice !== '-') {
        const itemId = item?.ProductId ?? item?.itemNo;
        onPriceUpdate(itemId, newSellingPrice);
      }
    }, [newSellingPrice, item?.ProductId, item?.itemNo, onPriceUpdate]);

    const to2 = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return Number(n.toFixed(2));
    };
    const getDeltaMeta = (current, previous, key) => {
      const c = to2(current);
      const p = to2(previous);
      if (c === null || p === null || c === p || p === 0) return null;
      const increased = c > p; // prev < current => up(red), prev > current => down(green)
      return {
        arrow: increased ? '↑' : '↓',
        color: increased ? '#DC2626' : '#16A34A', // increase red, decrease green
        prevText: Number(p).toFixed(2),
        key,
      };
    };
    const piecesDelta = getDeltaMeta(item?.pieces, item?.previousPieces, 'pieces');
    const cpDelta = getDeltaMeta(item?.cp, item?.previousUnitCost, 'cp');
    const extDelta = getDeltaMeta(item?.extendedPrice, item?.previousExtendedPrice, 'extendedPrice');
    const qtyDelta = getDeltaMeta(item?.qty, item?.previousQty, 'qty');

    

    const renderValueWithDelta = (label, value, delta) => (
      <View style={styles.deltaWrap}>
        <Text
          style={[styles.deltaMainValue, { fontSize: valueSize }]}
          numberOfLines={label === 'Description' || label === 'POS Description' ? 0 : 1}
        >
          {value}
        </Text>
        {delta ? (
          <TouchableOpacity
            onPressIn={() => setActivePrevKey(delta.key)}
            onLongPress={() => setActivePrevKey(delta.key)}
            onPressOut={() => setActivePrevKey(null)}
            delayLongPress={120}
            onPress={(e) => e?.stopPropagation?.()}
            style={styles.deltaBadge}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.85}
          >
            <Text style={[styles.deltaArrow, { color: delta.color }]}>{delta.arrow}</Text>
            {activePrevKey === delta.key && (
              <View style={styles.prevHint}>
                <Text style={styles.prevHintText}>Prev: {delta.prevText}</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );
    const renderCompactValueWithDelta = (value, delta) => (
      <View style={styles.compactDeltaWrap}>
        <Text style={[styles.cell, styles.compactDeltaValue, { fontSize: cellSize, color: textColor }]} numberOfLines={1}>
          {value}
        </Text>
        {delta ? (
          <TouchableOpacity
            onPressIn={() => setActivePrevKey(`compact-${delta.key}`)}
            onLongPress={() => setActivePrevKey(`compact-${delta.key}`)}
            onPressOut={() => setActivePrevKey(null)}
            delayLongPress={120}
            onPress={(e) => e?.stopPropagation?.()}
            style={styles.compactDeltaBadge}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.85}
          >
            <Text style={[styles.compactDeltaArrow, { color: delta.color }]}>{delta.arrow}</Text>
            {activePrevKey === `compact-${delta.key}` && (
              <View style={styles.compactPrevHint}>
                <Text style={styles.prevHintText}>Prev: {delta.prevText}</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );

    return (
      <TouchableOpacity
        onPress={onToggle}
        style={[
          styles.card,
          { backgroundColor: rowBg },
      
          Platform.select({
          ios: styles.shadowIOS,
          android: styles.shadowAndroid,
          }),
        ]}
        activeOpacity={0.75}
      >
        {/* Row cells */}
        <View
          style={[styles.row]}
        >
          {showCheckbox ? (
            <TouchableOpacity
              style={styles.checkboxWrap}
              onPress={() => onToggleSelect && onToggleSelect(item.ProductId)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                {isSelected && <Text style={styles.checkboxTick}>✓</Text>}
              </View>
            </TouchableOpacity>
          ) : isCentral ? (
            <View style={styles.checkboxWrap}>
              <View style={styles.aiBadge}>
                <Icon name="smart-toy" size={12} color="#7C2D12" />
              </View>
            </View>
          ) : (
            <View style={styles.checkboxSpacer} />
          )}

          <Text style={[styles.cell, { flex: 0.8, fontSize: cellSize, color: textColor }]} numberOfLines={1}>
            {typeof index === 'number' ? index + 1 : '-'}
          </Text>

 

          <Text
            style={[styles.cell, { flex: 2.8, fontSize: cellSize, color: textColor }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.itemNo || '-'}
          </Text>

          <Text style={[styles.cell, { flex: 0.8, textAlign: 'left', fontSize: cellSize, color: textColor }]}>
            {item.pieces}
          </Text>

          <Text style={[styles.cell, { flex: 0.8, textAlign: 'left', fontSize: cellSize, color: textColor }]} numberOfLines={1}>
            {item.unitPrice}
          </Text>

          {renderCompactValueWithDelta(`${item.cp}`, cpDelta)}
        </View>

        {/* Expanded section */}
        {isExpanded && (
          <View style={styles.expanded}>
            {[
              ['POS Description', item.posName],
              ['(Inv) itemNo', item.itemNo], 
              ['(Inv) Description', item.description],
              ['(Inv) Qty Shipped', item.qty],
              ['POS Barcode', item.barcode ?? 0], 
              ['POS Department', item.department ?? 0],
              ['Unit in Case', `${item.pieces ?? 0}`],       
              ['Unit Cost', `$${(Number(newcost ?? 0))}`],
              // ['Unit Price', `$${item.sellingPrice ?? 0}`],
              ...(margin !== 0 ? [['Category Margin', `${margin}%`]] : []),
              ...(margin === 0 && markup !== 0 ? [['Category Markup', `${markup}%`]] : []),
              ...(margin === 0 && markup === 0 && pp !== 0 ? [['Category Profit Percentage', `${pp}%`]] : []),
              ...(margin !== 0 || markup !== 0 || pp !== 0 ? [['New Unit Price', `$${newSellingPrice}`]] : []),
              ['(Inv) Case Cost', `$${item.unitPrice}`],
              ['(Inv) Extended Price', `${item.extendedPrice}`],
            ].map(([label, value], idx, arr) => (
              <View key={idx} style={[styles.expandedRow, idx === arr.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={[styles.expandedLabel, { fontSize: labelSize }]}>{label}:</Text>
                {label === 'Unit in Case'
                  ? renderValueWithDelta(label, value, piecesDelta)
                  : label === 'Unit Cost'
                  ? renderValueWithDelta(label, value, cpDelta)
                  : label === '(Inv) Qty Shipped'
                 ? renderValueWithDelta(label, value, qtyDelta)
                  : label === '(Inv) Extended Price'
                  ? renderValueWithDelta(label, value, extDelta)
                  : (
                    <Text
                      style={[styles.expandedValue, { fontSize: valueSize }]}
                      numberOfLines={label === 'Description' || label === 'POS Description' ? 0 : 1}
                    >
                      {value}
                    </Text>
                  )}
              </View>
            ))}

            {/* Action buttons */}
            <View style={styles.buttonContainer}>
        
        
             
      

              {!isStockUpdated && (
                <>
                   <TouchableOpacity
                  onPress={() => onEdit(item)}
                  activeOpacity={0.9}
                  style={[styles.actionBtn, styles.editBtn]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.actionText}>✎ Edit</Text>
                </TouchableOpacity>
                </>
              )}
              {isCentral && !isStockUpdated &&(
                <>
                <TouchableOpacity
                  onPress={() => onLinkProduct(item)}
                  activeOpacity={0.9}
                  style={[styles.actionBtn, styles.linkBtn]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.actionText}>
                    {hasBarcode ? '🔗 Change Linked Product' : '🔗 Link Product'}
                  </Text>
                </TouchableOpacity>
                  <TouchableOpacity
                  onPress={() => onConfirmAiLinking && onConfirmAiLinking(item)}
                  activeOpacity={0.9}
                  disabled={loadingConfirmAiId === item.ProductId}
                  style={[
                    styles.actionBtn,
                    styles.confirmAiBtn,
                    loadingConfirmAiId === item.ProductId && styles.actionBtnDisabled
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {loadingConfirmAiId === item.ProductId ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.actionText}>Confirm Ai Linking</Text>
                  )}
                </TouchableOpacity>
                </>
              )}
  {!hasBarcode &&(
                <>
                <TouchableOpacity
                  onPress={() => onLinkProduct(item)}
                  activeOpacity={0.9}
                  style={[styles.actionBtn, styles.linkBtn]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.actionText}>
                    {hasBarcode ? '🔗 Change Linked Product' : '🔗 Link Product'}
                  </Text>
                </TouchableOpacity>

                </>
              )}
              {!hideUnlinkButton && (
                <TouchableOpacity
                  onPress={() => onRemoveLinkedItem && onRemoveLinkedItem(item)}
                  activeOpacity={0.9}
                  disabled={loadingUnlinkId === item.ProductId}
                  style={[
                    styles.actionBtn,
                    styles.removeLinkBtn,
                    loadingUnlinkId === item.ProductId && styles.actionBtnDisabled
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {loadingUnlinkId === item.ProductId ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.actionText}>Unlink</Text>
                  )}
                </TouchableOpacity>
              )}

            </View>
          </View>
        )}
      </TouchableOpacity>
    );
};

export default InvoiceRow;

const styles = StyleSheet.create({
  card: {
    marginVertical: 4,
    borderRadius: 10,
    overflow: 'visible',
    backgroundColor: '#fff',
  },
  shadowIOS: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
  },
  shadowAndroid: {
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  checkboxWrap: { width: 28, marginRight: 0 },
  checkboxSpacer: { width: 28, marginRight: 0 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  aiBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxTick: { color: '#fff', fontSize: 12, fontWeight: '800' },
  cell: {
    fontSize: 12.6,
    color: '#21262E',
  },
  expanded: {
    backgroundColor: '#F3F9FF',
    padding: 12,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
  },
  expandedRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderColor: '#D7DFEA',
    alignItems: 'flex-start',
  },
  expandedLabel: {
    flex: 1,
    fontWeight: '700',
    color: '#334155',
  },
  expandedValue: {
    flex: 2,
    color: '#0B1324',
    lineHeight: 18,
  },
  deltaWrap: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  deltaMainValue: {
    color: '#0B1324',
    lineHeight: 18,
    flexShrink: 1,
    paddingRight: 6,
  },
  deltaBadge: {
    position: 'relative',
    paddingHorizontal: 2,
    marginLeft: 4,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deltaArrow: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },
  prevHint: {
    position: 'absolute',
    top: -8,
    right: 16,
    backgroundColor: '#111827',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    zIndex: 100,
    elevation: 8,
    minWidth: 90,
  },
  prevHintText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  compactDeltaWrap: {
    flex: 0.8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  compactDeltaValue: {
    flexShrink: 1,
    textAlign: 'left',
  },
  compactDeltaArrow: {
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  compactDeltaBadge: {
    position: 'relative',
    marginLeft: 4,
    minWidth: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactPrevHint: {
    position: 'absolute',
    top: -10,
    right: 14,
    backgroundColor: '#111827',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    zIndex: 100,
    elevation: 8,
    minWidth: 90,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 36,
  },
  actionBtnDisabled: {
    opacity: 0.7,
  },
  editBtn: {
    backgroundColor: '#10B981', // teal
    borderColor: '#0EA371',
  },
  linkBtn: {
    backgroundColor: '#6366F1', // indigo
    borderColor: '#5457D6',
  },
  removeLinkBtn: {
    backgroundColor: '#EF4444',
    borderColor: '#DC2626',
  },
  confirmAiBtn: {
    backgroundColor: '#0EA5E9',
    borderColor: '#0284C7',
  },
  actionText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  selectedRowOuter: {
    // subtle outer highlight for selected rows
    borderColor: '#B7F0C0',
    borderWidth: 1,
  },

  // legacy (kept in case referenced elsewhere)
  selectedRow: {
    backgroundColor: '#d0f0c0',
  },
  rowContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
  },
});
