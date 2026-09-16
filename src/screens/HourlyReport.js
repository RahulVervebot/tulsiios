import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View, Text, ScrollView, StyleSheet, useColorScheme,
  TouchableOpacity, Modal, Platform, ImageBackground, Switch, Alert, ActivityIndicator,
} from "react-native";
import { BarChart, Grid, XAxis, YAxis } from "react-native-svg-charts";
import { G, Text as SvgText } from "react-native-svg";
import DateTimePicker from "@react-native-community/datetimepicker";
import { IconButton } from "react-native-paper";
import Svg, { Path } from "react-native-svg";
import AppHeader from "../components/AppHeader";
import reportbg from "../assets/images/headbg.png";
import { HourlyReport } from "../functions/reports/pos_reports"
import { exportHourlyReportToExcel } from "../functions/reports/exportReportsExcel";

function DownloadIcon({ color = "#2e7d32" }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M12 3v10m0 0l-4-4m4 4l4-4M5 19h14"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function CalendarIcon({ color = "#2e7d32" }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// Fixed width per hour slot so bars stay wide/tappable regardless of screen size;
// the chart scrolls horizontally to fit all 24 hours.

const BAR_WIDTH = 64;

// Business-hour ordering: 6 AM -> 5 AM (next day)

const BUSINESS_START_HOUR = 6;

// Parses a backend x-axis label into an hour-of-day integer (0-23).
// Accepts "6 AM" / "6AM" / "12 PM" / "18:00" / "18" / "6" style labels.

function parseHourFromLabel(label) {
  if (label == null) return null;
  const str = String(label).trim();

  const ampmMatch = str.match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])$/);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10) % 12;
    if (/pm/i.test(ampmMatch[3])) hour += 12;
    return hour;
  }

  const colonMatch = str.match(/^(\d{1,2}):(\d{2})/);
  if (colonMatch) {
    return parseInt(colonMatch[1], 10) % 24;
  }

  const numMatch = str.match(/^(\d{1,2})$/);
  if (numMatch) {
    return parseInt(numMatch[1], 10) % 24;
  }

  return null;
}

// Reorders labels/series so the sequence starts at 6 AM and wraps to end at 5 AM next day.

// Falls back to the original order if hours can't be reliably parsed.

function reorderToBusinessDay(labels, seriesList) {
  if (!labels || labels.length === 0) {
    return { labels: labels || [], seriesList };
  }

  const hours = labels.map(parseHourFromLabel);
  if (hours.some((h) => h === null) || new Set(hours).size !== hours.length) {
    return { labels, seriesList };
  }

  const order = hours
    .map((hour, index) => ({ hour, index }))
    .sort((a, b) => {
      const rankA = (a.hour - BUSINESS_START_HOUR + 24) % 24;
      const rankB = (b.hour - BUSINESS_START_HOUR + 24) % 24;
      return rankA - rankB;
    })
    .map((entry) => entry.index);

  const reorderedLabels = order.map((i) => labels[i]);
  const reorderedSeriesList = seriesList.map((series) => order.map((i) => series[i]));

  return { labels: reorderedLabels, seriesList: reorderedSeriesList };
}

function formatMoney(value) {
  const num = Number(value) || 0;
  return `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatBarValue(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : Math.round(value).toLocaleString();
}

// Compacts an hour label ("6 AM" / "06:00" / "18") down to "6a" / "6p" style
// so the x-axis stays readable at the bar spacing needed for 24 hourly bars.

function formatCompactHourLabel(label) {
  const hour = parseHourFromLabel(label);
  if (hour === null) return String(label);
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${period}`;
}

// Renders a value label centered above each bar (or each grouped bar).
// `series` is passed explicitly (not read from the injected `data` prop) because
// react-native-svg-charts injects grouped data as [{data, svg}, ...] in grouped mode
// vs a flat number array in single-series mode.

function BarValueLabels({ x, y, bandwidth, series, color = "#111827", groupIndex = 0, groupCount = 1 }) {
  if (!x || !y || !series) return null;
  const barWidth = bandwidth / groupCount;

  return (
    <G>
      {series.map((value, index) => {
        if (value == null || Number.isNaN(value)) return null;
        const cx = x(index) + barWidth * groupIndex + barWidth / 2;
        const cy = y(value) - 6;
        return (
          <SvgText
            key={index}
            x={cx}
            y={cy}
            fontSize={10}
            fontWeight="700"
            fill={color}
            textAnchor="middle"
          >
            {formatBarValue(value)}
          </SvgText>
        );
      })}
    </G>
  );
}

export default function ReportsByHours({ navigation }) {
  React.useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const colorScheme = useColorScheme();
  const [hourlyData, setHourlyData] = useState({ labels: [], datasets: [] });
  const [chartTitle, setChartTitle] = useState("");
  const [xAxisTitle, setXAxisTitle] = useState("");
  const [yAxisTitle, setYAxisTitle] = useState("");
  const [noDataMessage, setNoDataMessage] = useState("");
  const [downloading, setDownloading] = useState(false);

  const [reportDate, setReportDate] = useState(() => {
    const d = new Date(); d.setHours(0,0,0,0); return d;
  });

  const [compareSales, setCompareSales] = useState(false);

  const [compareDate, setCompareDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(0,0,0,0); return d;
  });

  // Picker visibility (fix: close properly on selection)
  const [pickerVisible, setPickerVisible] = useState(false);   // wraps iOS inline pickers
  const [showPrimaryPicker, setShowPrimaryPicker] = useState(false);
  const [showComparePicker, setShowComparePicker] = useState(false);

  // temp dates used inside modal (iOS flow)
  const [tempPrimary, setTempPrimary] = useState(reportDate);
  const [tempCompare, setTempCompare] = useState(compareDate);

  const fmtDateBadge = (d) =>
    `${("0" + (d.getMonth() + 1)).slice(-2)}/${("0" + d.getDate()).slice(-2)}/${d.getFullYear()}`;

  const fmtDateFull = (d) =>
    d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  const buildDayRange = (d) => {
    const y = d.getFullYear();
    const m = ("0" + (d.getMonth() + 1)).slice(-2);
    const day = ("0" + d.getDate()).slice(-2);
    return { start: `${y}-${m}-${day} 00:00:00`, end: `${y}-${m}-${day} 23:59:59` };
  };

  const openPrimary = () => {
    if (Platform.OS === "android") {
      // Android: show dialog and close immediately after selection
      setShowPrimaryPicker(true);
    } else {
      // iOS: open our modal with inline pickers
      setTempPrimary(new Date(reportDate));
      setTempCompare(new Date(compareDate));
      setPickerVisible(true);
      setShowPrimaryPicker(true);
      setShowComparePicker(compareSales);
    }
  };

  const openCompare = () => {
    if (!compareSales) return;
    if (Platform.OS === "android") {
      setShowComparePicker(true);
    } else {
      setTempPrimary(new Date(reportDate));
      setTempCompare(new Date(compareDate));
      setPickerVisible(true);
      setShowPrimaryPicker(false);
      setShowComparePicker(true);
    }
  };

  const closeAllPickers = () => {
    setPickerVisible(false);
    setShowPrimaryPicker(false);
    setShowComparePicker(false);
  };

  // ANDROID handlers: close after pick
  const onAndroidPrimaryChange = (event, date) => {
    if (event.type === "set" && date) setReportDate(new Date(date));
    setShowPrimaryPicker(false); // <-- close after either set or dismiss
  };
  const onAndroidCompareChange = (event, date) => {
    if (event.type === "set" && date) setCompareDate(new Date(date));
    setShowComparePicker(false);
  };

  // iOS Apply/Cancel
  const onApplyDates = () => {
    setReportDate(new Date(tempPrimary));
    if (compareSales) setCompareDate(new Date(tempCompare));
    closeAllPickers();
  };
  const onCancelDates = () => closeAllPickers();

  // FETCH (moved to pos_report.js, formatting stays here)
  const fetchData = async () => {
    try {
      const { start, end } = buildDayRange(reportDate);
      const res1 = await HourlyReport(start, end);

      if (typeof res1 === "string") {
        setNoDataMessage(res1);
        setHourlyData({ labels: [], datasets: [] });
        return;
      }

      if (res1?.data?.length > 0) {
        const rawLabels = res1.data[0].x;
        const dataset1 = res1.data[0].y.map((v) => parseFloat(v));
        const seriesList = [dataset1];

        let dataset2 = null;
        if (compareSales) {
          const cr = buildDayRange(compareDate);
          const res2 = await HourlyReport(cr.start, cr.end);
          if (typeof res2 === "string") {
            setNoDataMessage(res2);
            setHourlyData({ labels: [], datasets: [] });
            return;
          }
          if (res2?.data?.length > 0) {
            dataset2 = res2.data[0].y.map((v) => parseFloat(v));
            seriesList.push(dataset2);
          } else {
            setNoDataMessage("No Data Available To Show");
            setHourlyData({ labels: [], datasets: [] });
            return;
          }
        }

        const { labels, seriesList: orderedSeriesList } = reorderToBusinessDay(rawLabels, seriesList);

        const datasets = [{ data: orderedSeriesList[0], svg: { fill: "#0A3B91" }, label: "Primary Date" }];
        if (compareSales && orderedSeriesList[1]) {
          datasets.push({ data: orderedSeriesList[1], svg: { fill: "#E84A8A" }, label: "Comparison Date" });
        }

        setHourlyData({ labels, datasets });
        setChartTitle(res1.layout?.title || "Hourly Sales");
        setXAxisTitle(res1.layout?.xaxis?.title || "");
        setYAxisTitle(res1.layout?.yaxis?.title || "");
        setNoDataMessage("");
      } else {
        setNoDataMessage("No Data Available To Show");
        setHourlyData({ labels: [], datasets: [] });
      }
    } catch (e) {
      console.log("Error fetching data:", e.message);
      setNoDataMessage(`Error fetching data: ${e.message}`);
      setHourlyData({ labels: [], datasets: [] });
      Alert.alert("Error", "Error fetching data. Please try again.");
    }
  };

  useEffect(() => {
    fetchData();
  }, [reportDate, compareSales, compareDate]);

  const getImageSource = (val) => (typeof val === "number" ? val : { uri: val });
  const primarySeries = hourlyData.datasets?.[0]?.data || [];
  const comparisonSeries = hourlyData.datasets?.[1]?.data || [];
  const hasComparison = compareSales && comparisonSeries.length > 0;
  const mergedSeries = useMemo(() => {
    return hasComparison ? [...primarySeries, ...comparisonSeries] : primarySeries;
  }, [hasComparison, primarySeries, comparisonSeries]);

  const barGroupCount = hasComparison ? 2 : 1;
  const chartData = hasComparison ? hourlyData.datasets : primarySeries;

  const handleDownloadReport = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await exportHourlyReportToExcel({
        labels: hourlyData.labels || [],
        primarySeries,
        comparisonSeries: hasComparison ? comparisonSeries : undefined,
        primaryLabel: `Sale (${fmtDateBadge(reportDate)})`,
        comparisonLabel: hasComparison ? `Sale (${fmtDateBadge(compareDate)})` : undefined,
        fileName: hasComparison
          ? `Hourly_Sales_Report_${fmtDateBadge(reportDate).replace(/\//g, '-')}_vs_${fmtDateBadge(compareDate).replace(/\//g, '-')}.xlsx`
          : `Hourly_Sales_Report_${fmtDateBadge(reportDate).replace(/\//g, '-')}.xlsx`,
      });
    } catch (e) {
      console.warn('Hourly report export failed:', e);
      Alert.alert('Export failed', 'Could not generate the Excel file. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ImageBackground source={getImageSource(reportbg)} style={styles.screen} resizeMode="cover">
      <AppHeader
        Title="HOURLY SALES REPORT"
        backgroundType="image"
        backgroundValue={reportbg}
        LeftComponent={<IconButton icon="arrow-left" size={24} onPress={() => navigation.goBack()} />}
      />

      {/* Date Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardHeaderText}>Report Period</Text>
        </View>

        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.dateTile} onPress={openPrimary} activeOpacity={0.7}>
            <View style={styles.dateTileTop}>
              <View style={[styles.dateDot, { backgroundColor: "#0A3B91" }]} />
              <Text style={styles.dateTileLabel}>Primary</Text>
            </View>
            <View style={styles.dateTileValueRow}>
              <CalendarIcon color="#0A3B91" />
              <Text style={[styles.dateTileValue, { color: "#0A3B91" }]}>{fmtDateBadge(reportDate)}</Text>
            </View>
          </TouchableOpacity>

          {compareSales && (
            <TouchableOpacity style={styles.dateTile} onPress={openCompare} activeOpacity={0.7}>
              <View style={styles.dateTileTop}>
                <View style={[styles.dateDot, { backgroundColor: "#E84A8A" }]} />
                <Text style={styles.dateTileLabel}>Comparison</Text>
              </View>
              <View style={styles.dateTileValueRow}>
                <CalendarIcon color="#E84A8A" />
                <Text style={[styles.dateTileValue, { color: "#E84A8A" }]}>{fmtDateBadge(compareDate)}</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.compareRow}>
          <View style={styles.compareTextWrap}>
            <Text style={styles.compareHeading}>Compare sales</Text>
            <Text style={styles.compareSub}>See two dates side by side</Text>
          </View>
          <Switch
            value={compareSales}
            onValueChange={(v) => {
              setCompareSales(v);
              if (Platform.OS === "ios") {
                // If already inside modal, show/hide compare picker inline
                if (pickerVisible) setShowComparePicker(v);
              }
            }}
            ios_backgroundColor="#d1d5db"
            trackColor={{ false: "#d1d5db", true: "#2e7d32" }}
            thumbColor={"#ffffff"}
          />
        </View>

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.primaryBtn} onPress={fetchData} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Get Sales</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chart Panel */}
      <View style={styles.panelInner}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{chartTitle}</Text>
          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={handleDownloadReport}
            disabled={downloading}
            activeOpacity={0.75}
          >
            {downloading ? (
              <ActivityIndicator size="small" color="#2e7d32" />
            ) : (
              <DownloadIcon />
            )}
          </TouchableOpacity>
        </View>

        {hourlyData.datasets.length > 0 ? (
          <>
            <View style={styles.swipeHint}>
              <Text style={styles.swipeHintArrow}>‹</Text>
              <Text style={styles.swipeHintText}>Swipe to see all hours</Text>
              <Text style={styles.swipeHintArrow}>›</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ height: 320, flexDirection: "row", paddingHorizontal: 10, paddingBottom: 24 }}>
                <YAxis
                  style={{ paddingBottom: 30 }}
                  data={mergedSeries}
                  contentInset={{ top: 36, bottom: 10 }}
                  svg={{ fontSize: 10, fill: "#6b7280" }}
                  formatLabel={(value) => formatMoney(value)}
                  numberOfTicks={5}
                />
                <View style={{ flex: 1, marginLeft: 10, width: BAR_WIDTH * hourlyData.labels.length, gap: 8 }}>
                  <View style={styles.legendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: "#0A3B91" }]} />
                      <Text style={styles.legendText}>Primary</Text>
                    </View>
                    {hasComparison && (
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: "#E84A8A" }]} />
                        <Text style={styles.legendText}>Comparison</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ height: 240 }}>
                    <BarChart
                      style={{ flex: 1 }}
                      data={chartData}
                      yAccessor={({ item }) => item}
                      contentInset={{ top: 36, bottom: 10 }}
                      yMin={0}
                      gridMin={0}
                      spacingInner={hasComparison ? 0.18 : 0.25}
                      spacingOuter={0.2}
                      svg={{ fill: "#0A3B91" }}
                    >
                      <Grid svg={{ stroke: "#E5E7EB", strokeWidth: 1 }} />
                      <BarValueLabels series={primarySeries} color="#0A3B91" groupIndex={0} groupCount={barGroupCount} />
                      {hasComparison && (
                        <BarValueLabels series={comparisonSeries} color="#E84A8A" groupIndex={1} groupCount={barGroupCount} />
                      )}
                    </BarChart>
                  </View>

                  <XAxis
                    style={{ height: 30, marginTop: 4 }}
                    data={hourlyData.labels}
                    formatLabel={(_value, index) => formatCompactHourLabel(hourlyData.labels[index])}
                    contentInset={{ left: BAR_WIDTH / 2, right: BAR_WIDTH / 2 }}
                    svg={{ fontSize: 10, fill: "#374151", fontWeight: "700" }}
                  />
                </View>
              </View>
            </ScrollView>
          </>
        ) : (
          <Text style={styles.noData}>{noDataMessage}</Text>
        )}
      </View>

      {/* ANDROID pickers (native dialogs) */}
      {showPrimaryPicker && Platform.OS === "android" && (
        <DateTimePicker
          value={reportDate}
          mode="date"
          display="default"
          onChange={onAndroidPrimaryChange} // closes itself
        />
      )}
      {showComparePicker && Platform.OS === "android" && (
        <DateTimePicker
          value={compareDate}
          mode="date"
          display="default"
          onChange={onAndroidCompareChange} // closes itself
        />
      )}

      {/* iOS modal with inline pickers */}
      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={onCancelDates}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Date{compareSales ? "s" : ""}</Text>

            {showPrimaryPicker && (
              <>
                <Text style={styles.modalLabel}>Primary Date</Text>
                <DateTimePicker
                  value={tempPrimary}
                  mode="date"
                  display="spinner"
                  onChange={(e, d) => d && setTempPrimary(d)}
                  textColor="#000000"
                  themeVariant="light"
                  style={{ alignSelf: 'stretch' }}
                />
              </>
            )}

            {compareSales && showComparePicker && (
              <>
                <Text style={[styles.modalLabel, { marginTop: 8 }]}>Comparison Date</Text>
                <DateTimePicker
                  value={tempCompare}
                  mode="date"
                  display="spinner"
                  onChange={(e, d) => d && setTempCompare(d)}
                  textColor="#000000"
                  themeVariant="light"
                  style={{ alignSelf: 'stretch' }}
                />
              </>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity onPress={onCancelDates} style={styles.modalBtnSecondary}>
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onApplyDates} style={styles.modalBtnPrimary}>
                <Text style={styles.modalBtnPrimaryText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  card: {
    margin: 16, backgroundColor: "#fff", borderRadius: 16, paddingBottom: 4,
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    }),
  },
  cardHeader: {
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12,
    borderBottomColor: "#F0F1F3", borderBottomWidth: 1,
  },
  cardHeaderText: { color: "#111827", fontWeight: "700", fontSize: 15, letterSpacing: 0.2 },

  dateRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 14 },
  dateTile: {
    flex: 1,
    backgroundColor: "#F7F8FA",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#EEF0F3",
  },
  dateTileTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  dateDot: { width: 8, height: 8, borderRadius: 4 },
  dateTileLabel: { fontSize: 12, color: "#6b7280", fontWeight: "600" },
  dateTileValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateTileValue: { fontSize: 15, fontWeight: "700" },

  divider: { height: 1, backgroundColor: "#F0F1F3", marginTop: 14, marginHorizontal: 16 },

  compareRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  compareTextWrap: { flex: 1 },
  compareHeading: { fontSize: 14, fontWeight: "700", color: "#1f1f1f" },
  compareSub: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  btnRow: { paddingHorizontal: 16, paddingBottom: 16 },
  primaryBtn: {
    backgroundColor: "#2e7d32",
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
    ...Platform.select({
      android: { elevation: 1 },
      ios: { shadowColor: "#2e7d32", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
    }),
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  panelInner: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.85)", borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingVertical: 12, paddingHorizontal: 12,
    ...Platform.select({
      android: { elevation: 1 },
      ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
    }),
  },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 10 },
  title: { color: "#f58b40", fontSize: 21, fontWeight: "bold", marginVertical: 10, flexShrink: 1 },
  downloadBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F5E9",
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },
  noData: { fontSize: 18, color: "red", marginTop: 20 },
  swipeHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 10,
    marginBottom: 6,
    paddingVertical: 5,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    alignSelf: "center",
    paddingHorizontal: 14,
  },
  swipeHintArrow: { fontSize: 14, color: "#9CA3AF", fontWeight: "700" },
  swipeHintText: { fontSize: 11, color: "#6b7280", fontWeight: "600" },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: -2, marginLeft: 2 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: "#374151", fontWeight: "700" },
  // Modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6, color: "#111" },
  modalLabel: { fontSize: 12, fontWeight: "600", color: "#666", marginBottom: 4 },
  modalBtnRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12 },
  modalBtnSecondary: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: "#D9D9D9" },
  modalBtnSecondaryText: { color: "#333", fontWeight: "600" },
  modalBtnPrimary: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, backgroundColor: "#2e7d32" },
  modalBtnPrimaryText: { color: "#fff", fontWeight: "700" },
});