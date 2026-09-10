import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  useWindowDimensions,
  Platform,
  TouchableOpacity,
} from 'react-native';
import AppHeader from '../components/AppHeader';
import reportbg from '../assets/images/report-bg.png';
import DateRangePickerModal from '../components/DateRangePickerModal';
// Reports container + tabs
import ReportTabs from '../components/reports/ReportTabs';
import PosPaymentCollectionTab from '../components/reports/tabs/PosPaymentCollectionTab';
import CashInOutTab from '../components/reports/tabs/CashInOutTab';
import RefundReportTab from '../components/reports/tabs/RefundReportTab';
import TaxReportTab from '../components/reports/tabs/TaxReportTab';
import DepartmentWiseReportTab from '../components/reports/tabs/DepartmentWiseReportTab';
// Icons for bottom selector
import TaxSVG from '../assets/icons/Tax.svg';
import DepartmentSVG from '../assets/icons/Department-wise-report.svg';
import CashinoutSVG from '../assets/icons/cash-In-out.svg';
import PosPaymentCollectionSVG from '../assets/icons/Pos-Payment-Collection.svg';
import RefundReportSVG from '../assets/icons/RefundReport.svg';
// API functions
import {
  SaleSummaryPaymentType,
  SaleSummaryCashReport,
  SaleSummaryRefundReport,
  SaleSummaryTaxReport,
  SaleSummaryDepartmentAllianceReport,
} from '../functions/reports/pos_reports';
import { exportSalesSummaryToExcel } from '../functions/reports/exportReportsExcel';
const PANEL_RADIUS = 28;
const DEFAULT_REFUND = { total_refunds: 0, total_refunds_count: 0, refund_data: [] };
export default function SaleSummaryReport() {

 const pad = (n) => String(n).padStart(2, '0');

  const fmtLocal = (d) => {
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
  };
  const fmtDateOnly = (d) => {
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    return `${y}-${m}-${day}`;
  };
  const [pickerVisible, setPickerVisible] = useState(false);
  const [paymentTypeReport, setPaymentTypeReport] = useState([]);
  const [cashInOutReport, setCashInOutReport] = useState({});
  const [refundReport, setRefundReport] = useState(DEFAULT_REFUND);
  const [taxReport, setTaxReport] = useState({});
  const [departmentReport, setDepartmentReport] = useState({});
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [cashLoading, setCashLoading] = useState(true);
  const [refundLoading, setRefundLoading] = useState(true);
  const [taxLoading, setTaxLoading] = useState(true);
  const [deptLoading, setDeptLoading] = useState(true);
  const [range, setRange] = useState(() => {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return { start, end };
  });
  // UI sizing
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const styles = getStyles(isTablet);
  // Prevent race conditions
  const reqIdRef = useRef(0);
  // Sequential fetcher

  const handleSaleSummaryReport = useCallback(async (startDate, endDate) => {
    const id = ++reqIdRef.current;
    const s = fmtLocal(startDate);
    const e = fmtLocal(endDate);
    // reset loaders
    setPaymentLoading(true);
    setCashLoading(true);
    setRefundLoading(true);
    setTaxLoading(true);
    setDeptLoading(true);
    try {
      // 1) Payment Type
      const paymentreport = await SaleSummaryPaymentType(s, e);
      if (id !== reqIdRef.current) return;
      setPaymentTypeReport(paymentreport || []);
      setPaymentLoading(false);

      // 2) Cash In/Out
      const cashreport = await SaleSummaryCashReport(s, e);
      if (id !== reqIdRef.current) return;
      setCashInOutReport(cashreport || {});
      setCashLoading(false);

      // 3) Refund
      const refundreport = await SaleSummaryRefundReport(s, e);
      if (id !== reqIdRef.current) return;
      setRefundReport(refundreport || DEFAULT_REFUND);
      setRefundLoading(false);

      // 4) Tax
      const gettaxreport = await SaleSummaryTaxReport(s, e);
      if (id !== reqIdRef.current) return;
      setTaxReport(gettaxreport || {});
      setTaxLoading(false);

      // 5) Department
      const getDepartmentreport = await SaleSummaryDepartmentAllianceReport(s, e);
      if (id !== reqIdRef.current) return;
      setDepartmentReport(getDepartmentreport || {});
      setDeptLoading(false);
    } catch (e) {
      if (id !== reqIdRef.current) return;
      console.log('error:', e?.message || e);
      // Fail safe: stop loaders and reset slices
      setPaymentTypeReport([]); setPaymentLoading(false);
      setCashInOutReport({}); setCashLoading(false);
      setRefundReport(DEFAULT_REFUND); setRefundLoading(false);
      setTaxReport({}); setTaxLoading(false);
      setDepartmentReport({}); setDeptLoading(false);
    }
  }, []);

  // Run fetcher whenever range changes
  useEffect(() => {
    handleSaleSummaryReport(range.start, range.end);
  }, [range.start, range.end, handleSaleSummaryReport]);

  const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

  const handleDownloadReport = useCallback(() => {
    return exportSalesSummaryToExcel({
      apiData: {
        'POS Payment Collection': paymentTypeReport || [],
        'Cash In & Out': cashInOutReport || {},
        'Refund Report': refundReport || DEFAULT_REFUND,
        'Tax Report': taxReport || {},
        'Department Wise Report': departmentReport || {},
      },
      fileName: `Sales_Summary_Report_${fmtDateOnly(range.start)}_to_${fmtDateOnly(range.end)}.xlsx`,
    });
  }, [paymentTypeReport, cashInOutReport, refundReport, taxReport, departmentReport, range]);

  return (
    <ImageBackground source={getImageSource(reportbg)} style={styles.screen} resizeMode="cover">
      <AppHeader Title="SALES SUMMARY REPORT" backgroundType="image" backgroundValue={reportbg} />
      {/* Date Selector Card */}
      <View style={styles.dateCard}>
        <TouchableOpacity onPress={() => setPickerVisible(true)} style={styles.dateCardHeader}>
          <View>
            <Text style={styles.dateCardHeaderText}>Select Date & Time</Text>
            <Text style={styles.dateCardSubText}>Tap to change the reporting range</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setPickerVisible(true)}>
          <View style={styles.datetimeselector}>
            <View style={styles.dateshow}>
              <Text style={styles.dateLabel}>From</Text>
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>{fmtDateOnly(range.start)}</Text>
              </View>
            </View>
            <View style={styles.dateshow}>
              <Text style={styles.dateLabel}>To</Text>
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>{fmtDateOnly(range.end)}</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        <DateRangePickerModal
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onApply={({ start, end }) => {
            setRange({ start, end });   // triggers useEffect; sequential fetch starts
            setPickerVisible(false);
          }}
          initialPreset="today"
        />
      </View>

      {/* Content Panel */}
      <View style={styles.panelInner}>
        <ReportTabs
          initialTab="POS Payment Collection"
          tabs={[
            { key: 'POS Payment Collection', component: PosPaymentCollectionTab, icon: PosPaymentCollectionSVG },
            { key: 'Cash In & Out', component: CashInOutTab, icon: CashinoutSVG },
            // { key: 'Cash Tender Details', component: CashTenderDetailsTab },
            { key: 'Tax Report', component: TaxReportTab, icon: TaxSVG },
            { key: 'Refund Report', component: RefundReportTab, icon: RefundReportSVG },
            { key: 'Department Wise Report', component: DepartmentWiseReportTab, icon: DepartmentSVG },
          ]}
          apiData={{
            'POS Payment Collection': paymentTypeReport || [],
            'Cash In & Out': cashInOutReport || {},
            'Refund Report': refundReport || DEFAULT_REFUND,
            'Tax Report': taxReport || {},
            'Department Wise Report': departmentReport || {},
          }}
          // NEW: per-tab loader map
          loadingByTab={{
            'POS Payment Collection': paymentLoading,
            'Cash In & Out': cashLoading,
            'Refund Report': refundLoading,
            'Tax Report': taxLoading,
            'Department Wise Report': deptLoading,
          }}
          onTabChange={(tab) => console.log('Active tab: ', tab)}
          onDownload={handleDownloadReport}
        />
      </View>

    </ImageBackground>
  );

}

const getStyles = (isTablet) =>
  StyleSheet.create({
    screen: { flex: 1 },

    dateCard: {
      marginHorizontal: 18,
      marginTop: 18,
      marginBottom: 8,
      backgroundColor: '#fff',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#E6E6E6',
      padding: 14,
      ...Platform.select({
        android: { elevation: 2 },
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
        },
      }),
    },
    dateCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: 10,
      borderBottomColor: '#ECECEC',
      borderBottomWidth: 1,
    },
    dateCardHeaderText: { color: '#1B5E20', fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },
    dateCardSubText: { color: '#6B7280', fontSize: 12, marginTop: 4 },
    datetimeselector: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 14,
      justifyContent: 'space-between',
    },
    dateshow: { flex: 1, gap: 6 },
    dateLabel: { color: '#4B5563', fontWeight: '600', fontSize: 12 },
    dateBadge: {
      backgroundColor: '#F8FAFC',
      borderColor: '#DDE3EA',
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    dateBadgeText: {
      color: '#111827',
      fontWeight: '700',
      fontSize: 14,
      letterSpacing: 0.2,
    },

    // Panel
    panelInner: {
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.85)',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingVertical: isTablet ? 14 : 10,
      paddingHorizontal: isTablet ? 16 : 12,
      ...Platform.select({
        android: { elevation: 1 },
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
        },
      }),
    },

    // (kept for parity)
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: isTablet ? 16 : 12, gap: isTablet ? 14 : 10 },
    rowFirst: { paddingTop: isTablet ? 16 : 8 },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.12)' },
    rowIcon: { width: isTablet ? 36 : 28, height: isTablet ? 36 : 28 },
    rowTitle: { flexShrink: 1, fontSize: isTablet ? 20 : 16, fontWeight: '600', color: '#111', letterSpacing: 0.2 },
});