import { Platform, Share } from 'react-native';
import RNBlobUtil from 'react-native-blob-util';
import XLSX from 'xlsx';

const safeNumber = (v, def = 0) => (typeof v === 'number' && isFinite(v) ? v : def);

// Build the { sheetName: rows[] } map from each tab's raw apiData shape.
function buildSheetsData(apiData = {}) {
  const sheets = {};

  // POS Payment Collection: array of { name, total_amount, count }
  const payment = Array.isArray(apiData['POS Payment Collection']) ? apiData['POS Payment Collection'] : [];
  sheets['POS Payment Collection'] = payment.map((row) => ({
    'Payment Method': row?.name ?? '',
    'Total Amount': safeNumber(row?.total_amount),
    Count: safeNumber(row?.count),
  }));

  // Cash In & Out: { payment_method_summaries: [{ name, amount, count, total_cash_in:[], total_cash_out:[] }] }
  const cashData = apiData['Cash In & Out'] || {};
  const cashList = Array.isArray(cashData?.payment_method_summaries)
    ? cashData.payment_method_summaries
    : Array.isArray(cashData) ? cashData : [];
  const cash = cashList.find((x) => String(x?.name || '').toLowerCase() === 'cash') || cashList[0];
  const cashInRows = Array.isArray(cash?.total_cash_in) ? cash.total_cash_in : [];
  const cashOutRows = Array.isArray(cash?.total_cash_out) ? cash.total_cash_out : [];
  sheets['Cash In'] = cashInRows.map((row) => ({
    Amount: safeNumber(row?.cash_in),
    Reason: row?.payment_ref ?? '',
    Cashier: row?.res_name ?? '',
    Date: row?.create_date ?? '',
  }));
  sheets['Cash Out'] = cashOutRows.map((row) => ({
    Amount: -Math.abs(safeNumber(row?.cash_out)),
    Reason: row?.payment_ref ?? '',
    Cashier: row?.res_name ?? '',
    Date: row?.create_date ?? '',
  }));

  // Tax Report: { result: [{ name, tax_amount, base_amount }] }
  const taxData = apiData['Tax Report'] || {};
  const taxRows = Array.isArray(taxData?.result) ? taxData.result : Array.isArray(taxData) ? taxData : [];
  sheets['Tax Report'] = taxRows.map((row) => ({
    Name: row?.name ?? '',
    'Tax Amount': safeNumber(row?.tax_amount),
    'Base Amount': safeNumber(row?.base_amount),
  }));

  // Refund Report: { total_refunds, total_refunds_count, refund_data: [{ name, amount_total }] }
  const refundData = apiData['Refund Report'] || {};
  const refundRows = Array.isArray(refundData?.refund_data) ? refundData.refund_data : [];
  sheets['Refund Report'] = refundRows.map((row) => ({
    Name: row?.name ?? '',
    Amount: safeNumber(row?.amount_total),
  }));

  // Department Wise Report: { departmentSales: [{ name, sale_amount, cost, qty }] }
  const deptData = apiData['Department Wise Report'] || {};
  const deptRows = Array.isArray(deptData?.departmentSales)
    ? deptData.departmentSales
    : Array.isArray(deptData) ? deptData : [];
  sheets['Department Wise Report'] = deptRows.map((row) => ({
    Name: row?.name ?? '',
    'Sale Amount': safeNumber(row?.sale_amount),
    Cost: safeNumber(row?.cost),
    Qty: safeNumber(row?.qty),
  }));

  return sheets;
}

// Excel sheet names must be <=31 chars and cannot contain: \ / ? * [ ]
function sanitizeSheetName(name, usedNames) {
  let clean = String(name).replace(/[\\/?*[\]]/g, '-').slice(0, 31);
  let unique = clean;
  let i = 2;
  while (usedNames.has(unique)) {
    const suffix = `-${i}`;
    unique = `${clean.slice(0, 31 - suffix.length)}${suffix}`;
    i += 1;
  }
  usedNames.add(unique);
  return unique;
}

export async function exportSalesSummaryToExcel({ apiData, fileName } = {}) {
  const sheetsData = buildSheetsData(apiData);
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set();

  Object.entries(sheetsData).forEach(([name, rows]) => {
    const worksheet = rows.length
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([['No data for this range']]);
    XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(name, usedNames));
  });

  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const finalName = fileName || `Sales_Summary_Report_${Date.now()}.xlsx`;
  const path = `${RNBlobUtil.fs.dirs.DocumentDir}/${finalName}`;

  await RNBlobUtil.fs.writeFile(path, base64, 'base64');
  await shareExcelFile(path);
  return path;
}

export async function exportHourlyReportToExcel({ labels, primarySeries, comparisonSeries, primaryLabel, comparisonLabel, fileName } = {}) {
  const hasComparison = Array.isArray(comparisonSeries) && comparisonSeries.length > 0;
  const rows = (labels || []).map((label, idx) => {
    const row = {
      Hour: label,
      [primaryLabel || 'Primary Sale']: safeNumber(primarySeries?.[idx]),
    };
    if (hasComparison) {
      row[comparisonLabel || 'Comparison Sale'] = safeNumber(comparisonSeries?.[idx]);
    }
    return row;
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = rows.length
    ? XLSX.utils.json_to_sheet(rows)
    : XLSX.utils.aoa_to_sheet([['No data for this range']]);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Hourly Sales Report');

  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const finalName = fileName || `Hourly_Sales_Report_${Date.now()}.xlsx`;
  const path = `${RNBlobUtil.fs.dirs.DocumentDir}/${finalName}`;

  await RNBlobUtil.fs.writeFile(path, base64, 'base64');
  await shareExcelFile(path);
  return path;
}

export async function exportTopSellingCustomersToExcel({ rows, totalSales, dateRangeLabel, fileName } = {}) {
  const list = Array.isArray(rows) ? rows : [];

  const dataRows = list.map((row) => ({
    'Customer Name': row?.name ?? '',
    Phone: row?.phone ?? '',
    'Sale Amount': safeNumber(row?.saleAmount),
  }));

  dataRows.push({ 'Customer Name': '', Phone: '', 'Sale Amount': '' });
  dataRows.push({ 'Customer Name': 'Total Sale', Phone: '', 'Sale Amount': safeNumber(totalSales) });
  dataRows.push({ 'Customer Name': 'Date', Phone: '', 'Sale Amount': dateRangeLabel ?? '' });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(dataRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Top Selling Customers');

  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const finalName = fileName || `Top_Selling_Customers_${Date.now()}.xlsx`;
  const path = `${RNBlobUtil.fs.dirs.DocumentDir}/${finalName}`;

  await RNBlobUtil.fs.writeFile(path, base64, 'base64');
  await shareExcelFile(path);
  return path;
}

export async function exportTopSellingCategoriesToExcel({ rows, totals, dateRangeLabel, fileName } = {}) {
  const list = Array.isArray(rows) ? rows : [];

  const dataRows = list.map((row) => ({
    Name: row?.name ?? '',
    'Sale Amount': safeNumber(row?.sale_amount),
    Cost: safeNumber(row?.cost),
    Qty: safeNumber(row?.qty),
    'Tax Amount': safeNumber(row?.tax_amount),
    'Partner Count': safeNumber(row?.partner_count),
    'GMP %': safeNumber(row?.gmp),
  }));

  dataRows.push({ Name: '' });
  dataRows.push({ Name: 'Total Sale', 'Sale Amount': safeNumber(totals?.totalSale) });
  dataRows.push({ Name: 'Total Cost', 'Sale Amount': safeNumber(totals?.totalCost) });
  dataRows.push({ Name: 'Total Qty', 'Sale Amount': safeNumber(totals?.totalQty) });
  dataRows.push({ Name: 'Total Tax', 'Sale Amount': safeNumber(totals?.totalTax) });
  dataRows.push({ Name: 'Total Partners', 'Sale Amount': safeNumber(totals?.totalPartners) });
  dataRows.push({ Name: 'Date', 'Sale Amount': dateRangeLabel ?? '' });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(dataRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Top Selling Categories');

  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const finalName = fileName || `Top_Selling_Categories_${Date.now()}.xlsx`;
  const path = `${RNBlobUtil.fs.dirs.DocumentDir}/${finalName}`;

  await RNBlobUtil.fs.writeFile(path, base64, 'base64');
  await shareExcelFile(path);
  return path;
}

export async function exportTopSellingProductsToExcel({ rows, totals, dateRangeLabel, fileName } = {}) {
  const list = Array.isArray(rows) ? rows : [];

  const dataRows = list.map((row) => ({
    Product: row?.product_name ?? '',
    Barcode: row?.barcode ?? '',
    Category: row?.category ?? '',
    Supplier: row?.supplier ?? '',
    Quantity: safeNumber(row?.quantity),
    'Sales Price': safeNumber(row?.sales_price),
    'Sales Amount': safeNumber(row?.sales_amount),
    Tax: safeNumber(row?.tax),
    'Unit Cost': safeNumber(row?.unit_cost),
    'Total Cost': safeNumber(row?.total_cost),
    'Gross Profit': safeNumber(row?.gross_profit),
    'GMP %': safeNumber(row?.gmp),
    'Order Date': row?.order_date ?? '',
    'Last Sold Date': row?.last_sold_date ?? '',
  }));

  dataRows.push({ Product: '' });
  dataRows.push({ Product: 'Total Sale', 'Sales Amount': safeNumber(totals?.totalSales) });
  dataRows.push({ Product: 'Total Cost', 'Sales Amount': safeNumber(totals?.totalCost) });
  dataRows.push({ Product: 'Total Qty', 'Sales Amount': safeNumber(totals?.totalQty) });
  dataRows.push({ Product: 'Total Tax', 'Sales Amount': safeNumber(totals?.totalTax) });
  dataRows.push({ Product: 'Total Gross Profit', 'Sales Amount': safeNumber(totals?.totalGrossProfit) });
  dataRows.push({ Product: 'Date', 'Sales Amount': dateRangeLabel ?? '' });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(dataRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Top Selling Products');

  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const finalName = fileName || `Top_Selling_Products_${Date.now()}.xlsx`;
  const path = `${RNBlobUtil.fs.dirs.DocumentDir}/${finalName}`;

  await RNBlobUtil.fs.writeFile(path, base64, 'base64');
  await shareExcelFile(path);
  return path;
}

async function shareExcelFile(path) {
  const fileUrl = path.startsWith('file://') ? path : `file://${path}`;
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  if (Platform.OS === 'ios') {
    await Share.share({ url: fileUrl, message: 'Sales Summary Report' }).catch((error) => {
      if (error?.message !== 'User did not share') {
        console.warn('Share failed:', error);
      }
    });
  } else {
    if (RNBlobUtil.android?.actionViewIntent) {
      await RNBlobUtil.android.actionViewIntent(path, mime);
    } else {
      await Share.share({ url: fileUrl, message: 'Sales Summary Report' });
    }
  }
}
