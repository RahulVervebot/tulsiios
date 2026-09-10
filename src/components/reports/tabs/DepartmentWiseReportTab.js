import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Dimensions,
  ActivityIndicator
} from "react-native";
import {
  SectionCard,
  DonutPie,
  LegendList,
  currency,
  safeNumber,
  sumBy,
  PALETTE,
} from "../shared/ReportUI";

function DeptTable({ rows }) {
  const count = Array.isArray(rows) ? rows.length : 0;

  const renderHeader = () => (
    <View style={styles.tableHeaderRow}>
      <Text style={[styles.th, styles.colName]}>NAME</Text>
      <Text style={[styles.th, styles.colSale]}>SALE AMOUNT</Text>
      <Text style={[styles.th, styles.colCost]}>COST</Text>
      <Text style={[styles.th, styles.colQty]}>QTY</Text>
    </View>
  );

  const renderItem = ({ item, index }) => {
    const sale = safeNumber(item?.sale_amount);
    const cost = safeNumber(item?.cost);
    const qty = safeNumber(item?.qty);

    return (
      <View style={[styles.tr, index % 2 === 1 && styles.trAlt]}>
        <Text style={[styles.td, styles.colName]} numberOfLines={1}>
          {item?.name || "-"}
        </Text>
        <Text style={[styles.td, styles.colSale]} numberOfLines={1}>
          $ {currency(sale)}
        </Text>
        <Text style={[styles.td, styles.colCost]} numberOfLines={1}>
          $ {currency(cost)}
        </Text>
        <Text style={[styles.td, styles.colQty]} numberOfLines={1}>
          {qty}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.tableWrap}>
      <View style={styles.tableTitleRow}>
        <Text style={styles.tableTitle}>Department Sales</Text>
        <Text style={styles.tableCount}>({count})</Text>
      </View>

      {/* Horizontal scroll keeps columns aligned on small screens */}
      <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={false}>
        <View style={{ minWidth: 820, flex: 1 }}>
          {renderHeader()}
          <FlatList
            data={rows || []}
            keyExtractor={(item, idx) => `${item?.name || "dept"}-${idx}`}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            scrollEnabled={false} // parent handles vertical scroll
          />
        </View>
      </ScrollView>
    </View>
  );
}

export default function DepartmentWiseReportTab({ data,loading }) {
    if (loading) {
    return (
      <View style={{ paddingVertical: 40, alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8, color: '#666' }}>Loading…</Text>
      </View>
    );
  }
  const screenW = Dimensions.get("window").width;
  const screenH = Dimensions.get("window").height;
  const donutSize = Math.min(Math.max(screenW - 48, 260), screenW >= 768 ? 520 : 420);
  const donutHeight = Math.min(Math.max(Math.floor(screenH * 0.42), 240), screenW >= 768 ? 420 : 360);

  const { rows, totalSale, totalCost, series, legendItems, hasData } = useMemo(() => {
    const rows = Array.isArray(data?.departmentSales)
      ? data.departmentSales
      : Array.isArray(data)
      ? data
      : [];

    const totalSale = sumBy(rows, (x) => safeNumber(x?.sale_amount));
    const totalCost = sumBy(rows, (x) => safeNumber(x?.cost));

    const series = [
      { key: "Total Sales", value: totalSale, color: PALETTE[0] },
      { key: "Total Cost", value: totalCost, color: PALETTE[1] },
    ];
    const legendItems = series.map((s) => ({ key: s.key, value: s.value, color: s.color }));
    const hasData = rows.length > 0;

    return { rows, totalSale, totalCost, series, legendItems, hasData };
  }, [data]);

  return (
    <View style={{ gap: 12 }}>
      {/* Totals + Pie */}
      <SectionCard title="Overview">
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Sales</Text>
            <Text style={styles.statValue}>$ {currency(totalSale)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Cost</Text>
            <Text style={styles.statValue}>$ {currency(totalCost)}</Text>
          </View>
        </View>

        {hasData ? (
          <>
            <View style={{ height: 10 }} />
            <DonutPie
              series={series}
              width={donutSize}
              height={donutHeight}
              innerRatio={0.56}
              labelMinAngle={8}
            />
            <View style={{ height: 10 }} />
            <LegendList items={legendItems} />
          </>
        ) : (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <Text style={{ color: "#666", fontSize: 13, fontStyle: "italic" }}>
              No department data for this range.
            </Text>
          </View>
        )}
      </SectionCard>

      {/* Table */}
      <SectionCard title="Department Details">
        <DeptTable rows={rows} />
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  // summary
  statsRow: { flexDirection: "row", gap: 12 },
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
  colSale: { flexBasis: 160, width: 160, textAlign: "right", paddingRight: 8 },
  colCost: { flexBasis: 160, width: 160, textAlign: "right", paddingRight: 8 },
  colQty: { flexBasis: 120, width: 120, textAlign: "right", paddingRight: 8 },
});
