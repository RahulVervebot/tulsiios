// components/reports/shared/ReportUI.js
import React, { useMemo } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import Svg, { Path, Text as SvgText } from "react-native-svg";

export const PALETTE = [
  "#2e7d32","#00D97E","#22B8CF","#8C54FF","#2C7BE5",
  "#E63757","#FF7A59","#5E72E4","#11CDEF","#2DCE89",
];

export const currency = (n) => {
  const v = typeof n === "number" && isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
export const safeNumber = (v, def = 0) => (typeof v === "number" && isFinite(v) ? v : def);
export const sumBy = (arr, pick) =>
  Array.isArray(arr) ? arr.reduce((s, x) => s + safeNumber(pick(x)), 0) : 0;

export function SectionCard({ title, children, right }) {
  return (
    <View style={styles.card}>
      {!!title && (
        <View style={[styles.cardHeader, right && styles.cardHeaderRow]}>
          <Text style={styles.cardTitle}>{title}</Text>
          {right}
        </View>
      )}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

// ---- Donut Pie (reusable) ----
const polarToCartesian = (cx, cy, r, angleDeg) => {
  const rad = (Math.PI / 180) * angleDeg;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};
const donutSlicePath = (cx, cy, rOuter, rInner, startAngle, endAngle) => {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, endAngle);
  const p3 = polarToCartesian(cx, cy, rInner, endAngle);
  const p4 = polarToCartesian(cx, cy, rInner, startAngle);
  return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y} Z`;
};

export function DonutPie({
  series = [],    // [{ key, value, color }]
  width = 320,
  height = 320,
  innerRatio = 0.56,
  labelMinAngle = 8,
}) {
  const cx = width / 2;
  const cy = height / 2;
  const rOuter = Math.min(cx, cy) - 6;
  const rInner = rOuter * innerRatio;

  const total = useMemo(() => {
    const t = series.reduce((s, v) => s + safeNumber(v.value), 0);
    return t <= 0 ? 1 : t;
  }, [series]);

  const slices = useMemo(() => {
    let acc = -90;
    return series.map((s) => {
      const angle = (safeNumber(s.value) / total) * 360;
      const start = acc;
      const end = acc + angle;
      acc = end;
      const mid = (start + end) / 2;
      const rLabel = rInner + (rOuter - rInner) * 0.5;
      const { x, y } = polarToCartesian(cx, cy, rLabel, mid);
      return { ...s, start, end, angle, labelX: x, labelY: y };
    });
  }, [series, total, cx, cy, rInner, rOuter]);

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={width} height={height}>
        {slices.map((s, i) => (
          <Path key={`${s.key}-${i}`} d={donutSlicePath(cx, cy, rOuter, rInner, s.start, s.end)} fill={s.color} />
        ))}
        {slices.map((s, i) => {
          if (!isFinite(s.angle) || s.angle < labelMinAngle) return null;
          return (
            <SvgText
              key={`lbl-${s.key}-${i}`}
              x={s.labelX}
              y={s.labelY}
              fontSize="11"
              fontWeight="700"
              textAnchor="middle"
              alignmentBaseline="middle"
              fill="#111"
            >
              {/* {currency(s.value)} */}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

export function LegendList({ items }) {
  return (
    <View style={styles.legendCol}>
      {items.map((it, i) => (
        <View style={styles.legendRow} key={`${it.key}-${i}`}>
          <View style={[styles.legendSwatch, { backgroundColor: it.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.legendName}>{it.key}</Text>
            {typeof it.count === "number" && <Text style={styles.legendMeta}>Count: {it.count}</Text>}
          </View>
          <Text style={styles.legendAmount}>$ {currency(it.value)}</Text>
        </View>
      ))}
    </View>
  );
}

export function SummaryRow({ title, amount, count }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryTitle}>{title}</Text>
      <View style={styles.summaryRight}>
        <Text style={styles.summaryAmt}>$ {currency(amount)}</Text>
        <Text style={styles.summaryCnt}>Count: {count}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // cards
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    ...Platform.select({
      android: { elevation: 1 },
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
  cardHeader: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#111" },
  cardBody: { paddingHorizontal: 14, paddingVertical: 10 },

  // legend
  legendCol: { gap: 10 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendName: { fontSize: 13, fontWeight: "700", color: "#111" },
  legendMeta: { fontSize: 12, color: "#555" },
  legendAmount: { fontSize: 13, fontWeight: "700", color: "#111" },

  // summary
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#d7f2df",
  },
  summaryTitle: { fontSize: 14, fontWeight: "800", color: "#111", flex: 1 },
  summaryRight: { alignItems: "flex-end" },
  summaryAmt: { fontSize: 13, fontWeight: "700", color: "#111" },
  summaryCnt: { fontSize: 12, color: "#555" },
});
