// components/reports/tabs/TaxReportTab.jsx
import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  ActivityIndicator
} from "react-native";
import {
  SectionCard,
  currency,
  safeNumber,
  sumBy,
} from "../shared/ReportUI";

function TaxTable({ rows }) {
  const count = Array.isArray(rows) ? rows.length : 0;

  const renderHeader = () => (
    <View style={styles.tableHeaderRow}>
      <Text style={[styles.th, styles.colName]}>NAME</Text>
      <Text style={[styles.th, styles.colTax]}>TAX AMOUNT</Text>
      <Text style={[styles.th, styles.colBase]}>BASE AMOUNT</Text>
    </View>
  );

  const renderItem = ({ item, index }) => {
    const tax = safeNumber(item?.tax_amount);
    const base = safeNumber(item?.base_amount);
    return (
      <View style={[styles.tr, index % 2 === 1 && styles.trAlt]}>
        <Text style={[styles.td, styles.colName]} numberOfLines={1}>
          {item?.name || "-"}
        </Text>
        <Text style={[styles.td, styles.colTax]} numberOfLines={1}>
          $ {currency(tax)}
        </Text>
        <Text style={[styles.td, styles.colBase]} numberOfLines={1}>
          $ {currency(base)}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.tableWrap}>
      <View style={styles.tableTitleRow}>
        <Text style={styles.tableTitle}>Taxes</Text>
        <Text style={styles.tableCount}>({count})</Text>
      </View>

      {/* Horizontal scroll for small screens; fixed widths keep header aligned */}
      <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={false}>
        <View style={{ minWidth: 720, flex: 1 }}>
          {renderHeader()}
          <FlatList
            data={rows || []}
            keyExtractor={(item, idx) => `${item?.name || "tax"}-${idx}`}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            scrollEnabled={false} // let parent handle vertical scroll
          />
        </View>
      </ScrollView>
    </View>
  );
}

export default function TaxReportTab({ data,loading }) {
      if (loading) {
        return (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" />
            <Text style={{ marginTop: 8, color: '#666' }}>Loading…</Text>
          </View>
        );
      }
  const { rows, totalTax, totalBase, hasData } = useMemo(() => {
    // Accept either the raw object { result:[...] } or an array
    const rows = Array.isArray(data?.result)
      ? data.result
      : Array.isArray(data)
      ? data
      : [];

    const totalTax = sumBy(rows, (x) => safeNumber(x?.tax_amount));
    const totalBase = sumBy(rows, (x) => safeNumber(x?.base_amount));
    const hasData = rows.length > 0;

    return { rows, totalTax, totalBase, hasData };
  }, [data]);

  return (
    <View style={{ gap: 12 }}>
      <SectionCard title="Tax Summary">
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Tax</Text>
            <Text style={styles.statValue}>$ {currency(totalTax)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Base</Text>
            <Text style={styles.statValue}>$ {currency(totalBase)}</Text>
          </View>
        </View>
      </SectionCard>

      <SectionCard title="Tax Details">
        {hasData ? (
          <TaxTable rows={rows} />
        ) : (
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <Text style={{ color: "#666", fontSize: 13, fontStyle: "italic" }}>
              No tax data for this range.
            </Text>
          </View>
        )}
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  // summary stats
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#d7f2df",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statLabel: { fontSize: 12, color: "#555", marginBottom: 4, fontWeight: "700" },
  statValue: { fontSize: 16, color: "#111", fontWeight: "800" },

  // table shell
  tableWrap: {
    backgroundColor: "#fff",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EEE",
  },
  tableTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#fff",
    gap: 6,
  },
  tableTitle: { fontSize: 14, fontWeight: "800", color: "#111" },
  tableCount: { fontSize: 12, color: "#666", fontWeight: "700" },

  // header
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#FAFAFA",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  th: { fontSize: 12, fontWeight: "800", color: "#333" },

  // rows
  tr: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FFF",
  },
  trAlt: { backgroundColor: "#FCFCFC" },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: "#EFEFEF" },
  td: { fontSize: 12, color: "#222" },

  // fixed column widths (align header & rows; enable horizontal scroll)
  colName: { flexBasis: 380, width: 380, paddingRight: 8 },
  colTax: { flexBasis: 160, width: 160, textAlign: "right", paddingRight: 8 },
  colBase: { flexBasis: 160, width: 160, textAlign: "right", paddingRight: 8 },
});
