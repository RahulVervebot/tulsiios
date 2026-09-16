import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, StyleSheet, useColorScheme,
  TouchableOpacity, Modal, Platform, ImageBackground, Switch, Dimensions, Alert,
} from "react-native";
import { BarChart, Grid, XAxis, YAxis } from "react-native-svg-charts";
import DateTimePicker from "@react-native-community/datetimepicker";
import { IconButton } from "react-native-paper";
import AppHeader from "../components/AppHeader";
import reportbg from "../assets/images/headbg.png";
import { HourlyReport } from "../functions/reports/pos_reports"

const screenWidth = Dimensions.get("window").width;

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
        const labels = res1.data[0].x;
        const dataset1 = res1.data[0].y.map((v) => parseFloat(v));
        const datasets = [{ data: dataset1, svg: { fill: "rgba(0, 0, 139, 1)" }, label: "Primary Date" }];

        if (compareSales) {
          const cr = buildDayRange(compareDate);
          const res2 = await HourlyReport(cr.start, cr.end);
          if (typeof res2 === "string") {
            setNoDataMessage(res2);
            setHourlyData({ labels: [], datasets: [] });
            return;
          }
          if (res2?.data?.length > 0) {
            const dataset2 = res2.data[0].y.map((v) => parseFloat(v));
            datasets.push({ data: dataset2, svg: { fill: "rgba(255, 99, 132, 0.8)" }, label: "Comparison Date" });
          } else {
            setNoDataMessage("No Data Available To Show");
            setHourlyData({ labels: [], datasets: [] });
            return;
          }
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
        <TouchableOpacity onPress={openPrimary} style={styles.cardHeaderButton}>
          <Text style={styles.cardHeaderText}>Select Date{compareSales ? "s" : ""}</Text>
        </TouchableOpacity>
        <View style={styles.datetimeselector}>
        <TouchableOpacity onPress={openPrimary}>
     
            <View style={styles.dateshow}>
              <Text>Primary</Text>
              <Text style={[styles.dateBadge, { color: "#00008B" }]}>{fmtDateBadge(reportDate)}</Text>
            </View>
    
          
            </TouchableOpacity>
                <TouchableOpacity onPress={openCompare}>
                    {compareSales && (
              <View style={styles.dateshow}>
                <Text>Comparison</Text>
                <Text style={[styles.dateBadge, { color: "#FF69B4" }]}>{fmtDateBadge(compareDate)}</Text>
              </View>
            )}
            </TouchableOpacity>
          </View>
        <View style={styles.compareRow}>
          <View style={styles.compareTextWrap}>
            <Text style={styles.compareHeading}>Comparison</Text>
            <Text style={styles.compareSub}>Activate to compare sales</Text>
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
            thumbColor={compareSales ? "#ffffff" : "#f4f4f5"}
          />
        </View>

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.primaryBtn} onPress={fetchData}>
            <Text style={styles.primaryBtnText}>Get Sales</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chart Panel */}
      <View style={styles.panelInner}>
        <Text style={styles.title}>{chartTitle}</Text>

        {hourlyData.datasets.length > 0 ? (
          <ScrollView horizontal>
            <View style={{ height: 480, flexDirection: "row", paddingHorizontal: 10, paddingBottom: 24 }}>
              <YAxis
                style={{ paddingBottom: 110 }}
                data={hourlyData.datasets[0].data}
                contentInset={{ top: 20, bottom: 20 }}
                svg={{ fontSize: 10, fill: "black" }}
                formatLabel={(value) => `$${value}`}
              />
              <ScrollView horizontal>
                <View style={{ flex: 1, marginLeft: 10, width: screenWidth * 2 }}>
                  <BarChart
                    style={{ flex: 1 }}
                    data={hourlyData.datasets}
                    yAccessor={({ item }) => item}
                    contentInset={{ top: 40, bottom: 20 }}
                    yMin={0}
                    gridMin={0}
                    svg={{ fill: "rgba(134, 65, 244, 0.8)" }}
                    spacingInner={0.3}
                  >
                    <Grid />
                  </BarChart>

                  {hourlyData.datasets.length > 0 && (
                    <XAxis
                      style={{ marginHorizontal: -10, height: 24, marginTop: 8 }}
                      data={hourlyData.datasets[0].data}
                      formatLabel={(value, index) => `$${hourlyData.datasets[0].data[index].toFixed(2)}`}
                      contentInset={{ left: 30, right: 30 }}
                      svg={{ fontSize: 10, fill: "#00008B" }}
                    />
                  )}
                  {hourlyData.datasets.length > 1 && (
                    <XAxis
                      style={{ marginHorizontal: -10, height: 24, marginTop: 8 }}
                      data={hourlyData.datasets[1].data}
                      formatLabel={(value, index) => `$${hourlyData.datasets[1].data[index].toFixed(2)}`}
                      contentInset={{ left: 30, right: 30 }}
                      svg={{ fontSize: 10, fill: "#FF69B4" }}
                    />
                  )}
                  <XAxis
                    style={{ marginHorizontal: -10, height: 28, marginTop: 8 }}
                    data={hourlyData.labels}
                    formatLabel={(value, index) => hourlyData.labels[index]}
                    contentInset={{ left: 30, right: 30 }}
                    svg={{ fontSize: 11, fill: "black" }}
                  />
                </View>
              </ScrollView>
            </View>
          </ScrollView>
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
                  textColor={colorScheme === "dark" ? "white" : "black"}
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
                  textColor={colorScheme === "dark" ? "white" : "black"}
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
    margin: 20, backgroundColor: "#fff", borderRadius: 8,
    ...Platform.select({
      android: { elevation: 1 },
      ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
    }),
  },
  cardHeaderButton: { padding: 12, alignItems: "center", borderBottomColor: "#D9D9D9", borderBottomWidth: 2 },
  cardHeaderText: { color: "#2e7d32", fontWeight: "700" },

  datetimeselector: { flexDirection: "row", marginTop: 12, alignSelf: "center" },
  dateshow: { marginHorizontal: 6 },
  dateBadge: {
    padding: 10, alignItems: "center", borderColor: "#D9D9D9", borderWidth: 2,
    marginVertical: 10, marginRight: 5, borderRadius: 8,
  },

  compareRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, paddingHorizontal: 16, gap: 8 },
  compareTextWrap: { flex: 1 },
  compareHeading: { fontSize: 14, fontWeight: "700", color: "#1f1f1f" },
  compareSub: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  compareLabel: { fontSize: 16 },
  editCompareBtn: { marginLeft: "auto", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: "#D9D9D9" },
  editCompareText: { fontSize: 12, color: "#333" },
  btnRow: { padding: 12 },
  primaryBtn: {
    backgroundColor: "#2e7d32",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },

  panelInner: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.85)", borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingVertical: 12, paddingHorizontal: 12,
    ...Platform.select({
      android: { elevation: 1 },
      ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
    }),
  },
  title: { color: "#f58b40", fontSize: 21, fontWeight: "bold", margin: 10 },
  noData: { fontSize: 18, color: "red", marginTop: 20 },

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
