// components/reports/tabs/PosPaymentCollectionTab.jsx
import React, { useMemo } from "react";
import { View, Dimensions, Text, ActivityIndicator, ScrollView } from "react-native";
import { LegendList, SectionCard, PALETTE, safeNumber, currency } from "../shared/ReportUI";

export default function PosPaymentCollectionTab({ data,loading }) {
  console.log("pos loading",loading);
    if (loading) {
    return (
      <View style={{ paddingVertical: 40, alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8, color: '#666' }}>Loading…</Text>
      </View>
    );
  }
  const screenW = Dimensions.get("window").width;
  const chartWidth = Math.max(screenW - 84, 220);

  const { series, legendItems, hasData, maxValue } = useMemo(() => {
    const arr = Array.isArray(data) ? data : [];
    const series = arr.map((row, idx) => ({
      key: row?.name ?? `PM-${idx + 1}`,
      value: safeNumber(row?.total_amount),
      count: safeNumber(row?.count),
      color: PALETTE[idx % PALETTE.length],
      raw: row,
    }));
    const legendItems = series.map((s) => ({ key: s.key, value: s.value, count: s.count, color: s.color }));
    const hasData = series.some((s) => s.value > 0);
    const maxValue = series.reduce((m, s) => Math.max(m, safeNumber(s.value)), 0) || 1;
    return { series, legendItems, hasData, maxValue };
  }, [data]);

  return (
    <View style={{ gap: 12 }}>
      <SectionCard title="Overview">
        {hasData ? (
          <View style={{ gap: 12 }}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={true}
              contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: 4, minWidth: '100%' }}
            >
              <View style={{ height: 220, flexDirection: "row", alignItems: "flex-end", justifyContent: series.length <= 4 ? "space-between" : "flex-start", gap: series.length > 4 ? 16 : 8, minWidth: series.length > 4 ? series.length * 80 : '100%' }}>
                {series.map((item, idx) => {
                  const barHeight = Math.max((safeNumber(item.value) / maxValue) * 160, 2);
                  const barWidth = series.length > 6 ? 60 : series.length > 4 ? 70 : Math.max((chartWidth / Math.max(series.length, 1)) - 8, 60);
                  return (
                    <View
                      key={`${item.key}-${idx}`}
                      style={{ width: barWidth, alignItems: "center", justifyContent: "flex-end" }}
                    >
                      <Text style={{ fontSize: 11, color: "#111", fontWeight: "600", marginBottom: 6 }} numberOfLines={1}>
                        ${currency(item.value)}
                      </Text>
                      <View
                        style={{
                          width: Math.min(36, Math.max(barWidth - 16, 24)),
                          height: barHeight,
                          backgroundColor: item.color,
                          borderTopLeftRadius: 6,
                          borderTopRightRadius: 6,
                        }}
                      />
                      <Text style={{ fontSize: 10, color: "#555", marginTop: 6 }}>Count: {item.count}</Text>
                      <Text
                        style={{ fontSize: 10, fontWeight: "700", color: "#111", marginTop: 2, textAlign: "center" }}
                        numberOfLines={2}
                      >
                        {item.key}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            <View style={{ height: 1, backgroundColor: "#E5E7EB" }} />
          </View>
        ) : (
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <Text style={{ color: "#666", fontSize: 13, fontStyle: "italic" }}>No data for this range.</Text>
          </View>
        )}
      </SectionCard>

      {hasData && (
        <SectionCard title="Details">
          <LegendList items={legendItems} />
        </SectionCard>
      )}
    </View>
  );
}
