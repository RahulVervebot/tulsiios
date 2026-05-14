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
  const [onSelectCallback, setOnSelectCallback] = useState(null);

  useImperativeHandle(ref, () => ({
    open: (variantList, callback) => {
      setVariants(Array.isArray(variantList) ? variantList : []);
      setOnSelectCallback(() => callback);
      setVisible(true);
    },
    close: () => {
      setVisible(false);
      setVariants([]);
      setOnSelectCallback(null);
    },
  }));

  const handleSelect = (item) => {
    setVisible(false);
    if (onSelectCallback) {
      onSelectCallback(item);
    }
    setVariants([]);
    setOnSelectCallback(null);
  };

  const handleClose = () => {
    setVisible(false);
    setVariants([]);
    setOnSelectCallback(null);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.variantItem}
      activeOpacity={0.7}
      onPress={() => handleSelect(item)}
    >
      <View style={styles.variantContent}>
        <Text style={styles.variantName} numberOfLines={2}>
          {item?.productName || "Product"}
        </Text>
        <Text style={styles.variantPrice}>₹{Number(item?.salePrice || 0).toFixed(2)}</Text>
      </View>
      <Icon name="chevron-right" size={24} color="#666" />
    </TouchableOpacity>
  );

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
            data={variants}
            keyExtractor={(item, index) => String(item?.product_id || index)}
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
});

export default VariantModal;
