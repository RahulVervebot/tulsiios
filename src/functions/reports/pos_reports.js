// src/function/reports/pos_reports.js
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Build generic headers for API requests
 * @param {string} token - Access token
 * @param {object} options - Additional options
 * @param {boolean} options.includeContentType - Whether to include Content-Type header
 * @returns {object} Headers object
 */

function buildHeaders(token, options = {}) {
  const headers = {
    accept: 'application/json',
    access_token: token,
    credentials: 'omit',
    Cookie: 'session_id',
  };

  if (options.includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

async function getReportAuth() {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }
  return { apiBase, token };
}

export async function SaleSummaryPaymentType(startdate, enddate) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }
console.log("token",token);
  const qs = new URLSearchParams({ startDate: startdate, endDate: enddate }).toString();

  const res = await fetch(
    `${storeUrl}/pos/app/sales-summary/payment-type-report?${qs}`,
    {
      method: 'GET',
      headers: buildHeaders(token),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch PaymentTypeReport (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  console.log('[PaymentTypeReport][raw json]:', json);

  // ✅ Normalize shapes
  let arr = [];
  if (Array.isArray(json)) {
    arr = json;
  } else if (Array.isArray(json?.payment_type)) {
    // <-- Your real payload
    arr = json.payment_type;
  } else {
    // Last-resort: pick the first array value in the object
    const firstArray = Object.values(json).find((v) => Array.isArray(v));
    if (firstArray) arr = firstArray;
  }

  console.log('[PaymentTypeReport][normalized array length]:', arr.length);
  return arr;
}

export async function SaleSummaryCashReport(startdate, enddate) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const qs = new URLSearchParams({ startDate: startdate, endDate: enddate }).toString();

  const res = await fetch(
    `${storeUrl}/pos/app/sales-summary/cash-in-cash-out-report?${qs}`,
    {
      method: 'GET',
      headers: buildHeaders(token),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch CashReport (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  console.log('[CashReport][raw json]:', json);

  // ✅ Normalize shapes
  let arr = [];
  if (Array.isArray(json)) {
    arr = json;
  } else if (Array.isArray(json?.payment_method_summaries)) {
    // <-- Your real payload
    arr = json.payment_method_summaries;
  } else {
    // Last-resort: pick the first array value in the object
    const firstArray = Object.values(json).find((v) => Array.isArray(v));
    if (firstArray) arr = firstArray;
  }

  console.log('[CashReport][normalized array length]:', arr.length);
  return arr;
}

export async function SaleSummaryRefundReport(startdate, enddate) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const qs = new URLSearchParams({ startDate: startdate, endDate: enddate }).toString();

  const res = await fetch(`${storeUrl}/pos/app/sales-summary/refund-report?${qs}`, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch RefundReport (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  console.log('[RefundReport][raw json]:', json);

  // Normalize to a stable shape
  const obj = Array.isArray(json) ? { refund_data: json } : (json && typeof json === 'object' ? json : {});

  const refund_data = Array.isArray(obj.refund_data) ? obj.refund_data : [];

  // Use server totals if valid; otherwise derive from list
  const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
  const derivedTotal = refund_data.reduce((s, r) => s + (isNum(r?.amount_total) ? r.amount_total : 0), 0);

  const total_refunds = isNum(obj.total_refunds) ? obj.total_refunds : derivedTotal;
  const total_refunds_count = isNum(obj.total_refunds_count) ? obj.total_refunds_count : refund_data.length;

  const normalized = { total_refunds, total_refunds_count, refund_data };
  console.log('[RefundReport][normalized]:', normalized);

  return normalized;
}

export async function SaleSummaryTaxReport(startdate, enddate) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const qs = new URLSearchParams({ startDate: startdate, endDate: enddate }).toString();

  const res = await fetch(
    `${storeUrl}/pos/app/sales-summary/tax-report?${qs}`,
    {
      method: 'GET',
      headers: buildHeaders(token),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch TaxReport (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  console.log('[Tax Report][raw json]:', json);

  // ✅ Normalize shapes
  let arr = [];
  if (Array.isArray(json)) {
    arr = json;
  } else if (Array.isArray(json?.result)) {
    // <-- Your real payload
    arr = json.result;
  } else {
    // Last-resort: pick the first array value in the object
    const firstArray = Object.values(json).find((v) => Array.isArray(v));
    if (firstArray) arr = firstArray;
  }

  console.log('[TaxReport][normalized array length]:', arr.length);
  return arr;
}

export async function SaleSummaryDepartmentAllianceReport(startdate, enddate) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const qs = new URLSearchParams({ startDate: startdate, endDate: enddate }).toString();

  const res = await fetch(
    `${storeUrl}/pos/app/sales-summary/department/with-alliance-report?${qs}`,
    {
      method: 'GET',
      headers: buildHeaders(token),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch Department (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  console.log('[Department Report][raw json]:', json);

  // ✅ Normalize shapes
  let arr = [];
  if (Array.isArray(json)) {
    arr = json;
  } else if (Array.isArray(json?.departmentSales)) {
    // <-- Your real payload
    arr = json.departmentSales;
  } else {
    // Last-resort: pick the first array value in the object
    const firstArray = Object.values(json).find((v) => Array.isArray(v));
    if (firstArray) arr = firstArray;
  }

  console.log('[Department Report][normalized array length]:', arr.length);
  return arr;
}

export async function HourlyReport(startDate, endDate, option = 'pos_hourly_sales', companyId = 1) {
  // Accept both 'storeUrl' and 'storeurl' just in case
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
    
  ]);
  console.log("storeUrl:",storeUrl);
console.log("start:",startDate,"end:",endDate);
  if (!storeUrl || !token) {
    throw new Error('Missing storeUrl or access_token in AsyncStorage.');
  }
console.log("token:",token);
  const qs = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    option,
    company_id: String(companyId),
  }).toString();

const fetchurl = `${storeUrl}/pos/app/hourly-sales-report?startDate=${startDate}&endDate=${endDate}&companyId=${companyId}&option=pos_hourly_sales`
console.log("fetchurl:",fetchurl);
  const res = await fetch(fetchurl, {
    method: 'GET',
    headers: buildHeaders(token),
    // redirect: 'follow',
    // credentials: 'omit',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Hourly report failed (${res.status}): ${text || 'No details'}`);
  }

  return res.json(); // return raw JSON so the screen can keep its current shape handling
}

// top selling categories report

export async function TopSellingCatgegoriesReport(startdate, enddate, numberOfCategories) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const params = { startDate: startdate, endDate: enddate };
  if (numberOfCategories !== undefined && numberOfCategories !== null && numberOfCategories !== '') {
    params.numberOfCategories = String(numberOfCategories);
  }
  const qs = new URLSearchParams(params).toString();

  const res = await fetch(
    `${storeUrl}/pos/app/top-selling/category-wise-sales?${qs}`,
    {
      method: 'GET',
      headers: buildHeaders(token),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch Categories Report (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  console.log('[Categories Report][raw json]:', json);

  // ✅ Normalize shapes
  let arr = [];
  if (Array.isArray(json)) {
    arr = json;
  } else if (Array.isArray(json?.result)) {
    // <-- Your real payload
    arr = json.result;
  } else {
    // Last-resort: pick the first array value in the object
    const firstArray = Object.values(json).find((v) => Array.isArray(v));
    if (firstArray) arr = firstArray;
  }

  console.log('[Categories Report][normalized array length]:', arr.length);
  return arr;
}

export async function OrderHoldReport(startdate, enddate) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const url = `${storeUrl}/api/pos/hold_orders?start_date=${startdate}&end_date=${enddate}`;
  console.log('fetching with url:', url);

  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Failed to fetch Order Hold Report (${res.status}): ${
        text || 'No details'
      }`
    );
  }

  const json = await res.json();
  console.log('[Order Hold Report][raw json]:', json);

  // Normalize response
  let orders = [];

  if (Array.isArray(json)) {
    orders = json;
  } else if (Array.isArray(json?.orders)) {
    orders = json.orders;
  } else if (Array.isArray(json?.result)) {
    orders = json.result;
  } else {
    const firstArray = Object.values(json || {}).find((v) => Array.isArray(v));
    if (firstArray) orders = firstArray;
  }

  const data = {
    orders,
    totalOrders: json?.totalOrders ?? orders.length,
    totalOrdersAmount: json?.totalOrdersAmount ?? 0,
  };

  console.log('[Order Hold Report][normalized data]:', data);

  return data;
}

export async function OrderPaidReport(startdate, enddate) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const url = `${storeUrl}/api/pos/paid/hold_orders?start_date=${startdate}&end_date=${enddate}`;
  console.log('fetching with url:', url);

  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Failed to fetch Order Paid Report (${res.status}): ${
        text || 'No details'
      }`
    );
  }

  const json = await res.json();
  console.log('[Order Paid Report][raw json]:', json);

  // Normalize response
  let orders = [];

  if (Array.isArray(json)) {
    orders = json;
  } else if (Array.isArray(json?.orders)) {
    orders = json.orders;
  } else if (Array.isArray(json?.result)) {
    orders = json.result;
  } else {
    const firstArray = Object.values(json || {}).find((v) => Array.isArray(v));
    if (firstArray) orders = firstArray;
  }

  const data = {
    orders,
    totalOrders: json?.totalOrders ?? orders.length,
    totalOrdersAmount: json?.totalOrdersAmount ?? 0,
  };

  console.log('[Order Hold Report][normalized data]:', data);

  return data;
}


  export async function OrderTransactions(orderId) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const url = `${storeUrl}/api/pos/hold_order/transactions?orderId=${orderId}`;
  console.log('fetching with url:', url);

  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Failed to fetch Order Hold Detail Report (${res.status}): ${
        text || 'No details'
      }`
    );
  }

  const json = await res.json();
  console.log('[Order Hold Detail Report][raw json]:', json);

  // Normalize order detail array
  let transactionsDetail = [];

  if (Array.isArray(json)) {
    transactionsDetail = json;
  } else if (Array.isArray(json?.transactions)) {
    transactionsDetail = json.transactions;
  } else if (Array.isArray(json?.result)) {
    transactionsDetail = json.result;
  } else {
    const firstArray = Object.values(json || {}).find((v) => Array.isArray(v));
    if (firstArray) transactionsDetail = firstArray;
  }

  const data = {
    orderNumber: json?.orderNumber ?? '',
    orderDate: json?.orderDate ?? '',
    totalAmount: json?.totalAmount ?? 0,
    paidAmount: json?.paidAmount ?? 0,
    paidOrderNumber: json?.paidOrderNumber ?? '',
    holdOrderId: json?.holdOrderId ?? '',
    transactionsDetail,
  };

  console.log('[Order Hold Detail Report][normalized data]:', data);

  return data;
}

export async function OrderHoldDetailReport(orderId) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const url = `${storeUrl}/api/get_order_on_hold_detail?orderId=${orderId}`;
  console.log('fetching with url:', url);

  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Failed to fetch Order Hold Detail Report (${res.status}): ${
        text || 'No details'
      }`
    );
  }

  const json = await res.json();
  console.log('[Order Hold Detail Report][raw json]:', json);

  // Normalize order detail array
  let orderDetail = [];

  if (Array.isArray(json)) {
    orderDetail = json;
  } else if (Array.isArray(json?.orderDetail)) {
    orderDetail = json.orderDetail;
  } else if (Array.isArray(json?.result)) {
    orderDetail = json.result;
  } else {
    const firstArray = Object.values(json || {}).find((v) => Array.isArray(v));
    if (firstArray) orderDetail = firstArray;
  }

  const data = {
    orderReference: json?.orderReference ?? '',
    orderDate: json?.orderDate ?? '',
    totalOrderAmount: json?.totalOrderAmount ?? 0,
    orderDetail,
  };

  console.log('[Order Hold Detail Report][normalized data]:', data);

  return data;
}


export async function OrderPaidDetailReport(orderId) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const url = `${storeUrl}/api/get_order_on_hold_detail/paid_orders?orderId=${orderId}`;
  console.log('fetching with url:', url);

  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Failed to fetch Order Paid Detail Report (${res.status}): ${
        text || 'No details'
      }`
    );
  }

  const json = await res.json();
  console.log('[Order Paid Detail Report][raw json]:', json);

  // Normalize order detail array
  let orderDetail = [];

  if (Array.isArray(json)) {
    orderDetail = json;
  } else if (Array.isArray(json?.orderDetail)) {
    orderDetail = json.orderDetail;
  } else if (Array.isArray(json?.result)) {
    orderDetail = json.result;
  } else {
    const firstArray = Object.values(json || {}).find((v) => Array.isArray(v));
    if (firstArray) orderDetail = firstArray;
  }

  const data = {
    orderReference: json?.orderReference ?? '',
    orderDate: json?.orderDate ?? '',
    totalOrderAmount: json?.totalOrderAmount ?? 0,
    orderDetail,
  };

  console.log('[Order Paid Detail Report][normalized data]:', data);

  return data;
}





// top selling products report
export async function TopSellingProductsReport(startdate, enddate, numberOfProducts) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const params = { startDate: startdate, endDate: enddate };
  if (numberOfProducts !== undefined && numberOfProducts !== null && numberOfProducts !== '') {
    params.numberOfProducts = String(numberOfProducts);
  }
  const qs = new URLSearchParams(params).toString();

  const res = await fetch(
    `${storeUrl}/pos/app/top-selling/product-wise-sales?${qs}`,
    {
      method: 'GET',
      headers: buildHeaders(token),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch Products Report (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  console.log('[Products Report][raw json]:', json);

  let arr = [];
  if (Array.isArray(json)) {
    arr = json;
  } else if (Array.isArray(json?.customers)) {
    arr = json.customers;
  } else if (Array.isArray(json?.data)) {
    arr = json.data;
  } else if (Array.isArray(json?.result)) {
    arr = json.result;
  } else {
    const firstArray = Object.values(json).find((v) => Array.isArray(v));
    if (firstArray) arr = firstArray;
  }

  console.log('[Products Report][normalized array length]:', arr.length);
  return arr;
}

// top selling customers report
export async function TopSellingCustomersReport(startdate, enddate, numberOfCustomers) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  console.log("access_token",token);
  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const params = { startDate: startdate, endDate: enddate };
  if (numberOfCustomers !== undefined && numberOfCustomers !== null && numberOfCustomers !== '') {
    params.number_of_customers = String(numberOfCustomers);
  }
  const qs = new URLSearchParams(params).toString();

  const res = await fetch(
    `${storeUrl}/pos/app/top-selling/customers?${qs}`,
    {
      method: 'GET',
      headers: buildHeaders(token),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch Customers Report (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  console.log('[Customers Report][raw json]:', json);

  let arr = [];
  if (Array.isArray(json)) {
    arr = json;
  } else if (Array.isArray(json?.data)) {
    arr = json.data;
  } else if (Array.isArray(json?.result)) {
    arr = json.result;
  } else {
    const firstArray = Object.values(json).find((v) => Array.isArray(v));
    if (firstArray) arr = firstArray;
  }

  console.log('[Customers Report][normalized array length]:', arr.length);
  return arr;
}

export async function getTodaySessions(page = 1, limit = 10) {
  const { apiBase, token } = await getReportAuth();
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
  const res = await fetch(`${apiBase}/pos/app/session/report/today`, {
    method: 'GET',
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch today sessions (${res.status}): ${text || 'No details'}`);
  }
  const json = await res.json();
  return Array.isArray(json?.sessions) ? json.sessions : [];
}

export async function getYesterdaySessions(page = 1, limit = 10) {
  const { apiBase, token } = await getReportAuth();
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
  const res = await fetch(`${apiBase}/pos/app/session/report/yesterday`, {
    method: 'GET',
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch yesterday sessions (${res.status}): ${text || 'No details'}`);
  }
  const json = await res.json();
  return Array.isArray(json?.sessions) ? json.sessions : [];
}

export async function getCustomDateSessions(fromDate, toDate, page = 1, limit = 10) {
  if (!fromDate || !toDate) return [];
  const { apiBase, token } = await getReportAuth();
  const qs = new URLSearchParams({
    from_date: fromDate,
    to_date: toDate,
    page: String(page),
    limit: String(limit),
  }).toString();
  const res = await fetch(`${apiBase}/api/pos/app/custom-date-sessions?${qs}`, {
    method: 'POST',
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch custom date sessions (${res.status}): ${text || 'No details'}`);
  }
  const json = await res.json();
  return Array.isArray(json?.sessions) ? json.sessions : [];
}

export async function getSessionZReportPreview(sessionId) {
  if (!sessionId) throw new Error('Missing session_id');
  const { apiBase, token } = await getReportAuth();
  const qs = new URLSearchParams({ session_id: String(sessionId) }).toString();
  console.log("check id first:",qs);
  const res = await fetch(`${apiBase}/pos/app/session/z-report/preview?${qs}`, {
    method: 'GET',
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch session report (${res.status}): ${text || 'No details'}`);
  }
  return res.json();
}

export async function getRegisterList() {
  const { apiBase, token } = await getReportAuth();
  const res = await fetch(`${apiBase}/api/pos/app/get-register-list`, {
    method: 'GET',
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch registers (${res.status}): ${text || 'No details'}`);
  }
  const json = await res.json();
  return Array.isArray(json?.registers) ? json.registers : [];
}

export async function printSessionReport(sessionIds, regId) {
  const { apiBase, token } = await getReportAuth();
  const res = await fetch(`${apiBase}/pos/app/print/session/report`, {
    method: 'POST',
    headers: buildHeaders(token, { includeContentType: true }),
    body: JSON.stringify({
      session_ids: Array.isArray(sessionIds) ? sessionIds : [sessionIds],
      reg_id: regId,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.message || json?.error?.message || 'Failed to print';
    throw new Error(msg);
  }
  return json;
}