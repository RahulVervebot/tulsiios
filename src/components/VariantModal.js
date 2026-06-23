// src/components/VariantModal.js
import React, { useState, forwardRef, useImperativeHandle } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Pressable,
} from "react-native";

import Icon from "react-native-vector-icons/MaterialIcons";

const VariantModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [variants, setVariants] = useState([]);
  const [parentProduct, setParentProduct] = useState(null);
  const [onSelectCallback, setOnSelectCallback] = useState(null);

  useImperativeHandle(ref, () => ({
    open: (variantList, parent, callback) => {
      setVariants(Array.isArray(variantList) ? variantList : []);
      setParentProduct(parent || null);
      setOnSelectCallback(() => callback);
      setVisible(true);
    },
    close: () => {
      setVisible(false);
      setVariants([]);
      setParentProduct(null);
      setOnSelectCallback(null);
    },
  }));

  const handleSelect = (item, isParent = false) => {
    setVisible(false);
    if (onSelectCallback) {
      onSelectCallback(item, isParent);
    }
    setVariants([]);
    setParentProduct(null);
    setOnSelectCallback(null);
  };

  const handleClose = () => {
    setVisible(false);
    setVariants([]);
    setParentProduct(null);
    setOnSelectCallback(null);
  };

  const renderItem = ({ item }) => {
    const isParent = item?.isParentProduct === true;
    
    return (
      <TouchableOpacity
        style={styles.variantItem}
        activeOpacity={0.7}
        onPress={() => handleSelect(item, isParent)}
      >
        <View style={styles.variantContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.variantName} numberOfLines={2}>
              {item?.productName || "Product"}
            </Text>
            {isParent && (
              <View style={styles.parentBadge}>
                <Text style={styles.parentBadgeText}>Parent</Text>
              </View>
            )}
          </View>
          <Text style={styles.variantPrice}>₹{Number(item?.salePrice || 0).toFixed(2)}</Text>
        </View>
        <Icon name="chevron-right" size={24} color="#666" />
      </TouchableOpacity>
    );
  };

  // Combine parent product with variants
  const displayItems = React.useMemo(() => {
    const items = [];
    if (parentProduct) {
      items.push({ ...parentProduct, isParentProduct: true });
    }
    items.push(...variants);
    return items;
  }, [parentProduct, variants]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <View />
      </Pressable>

      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Product Variant</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Icon name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={displayItems}
            keyExtractor={(item, index) => 
              item?.isParentProduct 
                ? `parent-${item?.product_id || index}` 
                : String(item?.product_id || index)
            }
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );

});

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "100%",
    maxWidth: 500,
    maxHeight: "70%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
  },
  closeBtn: {
    padding: 4,
  },
  listContent: {
    paddingVertical: 8,
  },
  variantItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  variantContent: {
    flex: 1,
    marginRight: 12,
  },
  variantName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
    marginBottom: 4,
  },
  variantPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: "#16A34A",
  },
  parentBadge: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  parentBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
});

export default VariantModal;
