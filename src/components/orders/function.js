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

export async function getPosOrders(params = {}, { useFilter = false } = {}) {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }
  const {
    order_id,
    min_amount,
    max_amount,
    start_date,
    end_date,
    auth_code,
    card_number,
    page = 1,
    limit = 10,
  } = params;

  const qs = new URLSearchParams(
    Object.entries({
      order_id,
      min_amount,
      max_amount,
      start_date,
      end_date,
      auth_code,
      card_number,
      page,
      limit,
    })
      .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
      .reduce((acc, [k, v]) => {
        acc[k] = String(v);
        return acc;
      }, {})
  ).toString();
  const endpoint = useFilter ? '/pos/app/orders/filter' : '/pos/app/get/pos/orders';
  const res = await fetch(`${apiBase}${endpoint}?${qs}`, {
    method: 'GET',
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch orders (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  return {
    orders: Array.isArray(json?.orders) ? json.orders : [],
    pagination: json?.pagination || null,
  };
}

export async function getOrderPreview(orderId) {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }
  if (!orderId) {
    throw new Error('Missing order_id');
  }

  const qs = new URLSearchParams({ order_id: String(orderId) }).toString();
  const res = await fetch(`${apiBase}/pos/app/get/pos/order/preview?${qs}`, {
    method: 'GET',
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch order preview (${res.status}): ${text || 'No details'}`);
  }
  return res.json();
}

export async function printOrderReport(orderIds, regId) {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }

  const res = await fetch(`${apiBase}/pos/app/print/order/report`, {
    method: 'POST',
    headers: buildHeaders(token, { includeContentType: true }),
    body: JSON.stringify({
      order_ids: Array.isArray(orderIds) ? orderIds : [orderIds],
      reg_id: regId,
    }),
  });
  const json = await res.json().catch(() => ({}));
  console.log("print json:",json);
  if (!res.ok) {
    const msg = json?.message || json?.error?.message || 'Failed to print';
    throw new Error(msg);
  }
  return json;
}

export async function getMobileBillingReg() {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }

  const res = await fetch(`${apiBase}/api/get/mobile_billing/reg`, {
    method: 'GET',
    headers: buildHeaders(token),
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch mobile billing reg (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

export async function openMobileBillingSession(regId, userId) {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }

  if (!regId || !userId) {
    throw new Error('Missing regId or userId');
  }

  const qs = new URLSearchParams({
    reg_id: String(regId),
    user_id: String(userId),
  }).toString();

  const res = await fetch(`${apiBase}/api/mobile_billing/open/session?${qs}`, {
    method: 'POST',
    headers: buildHeaders(token),
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to open mobile billing session (${res.status}): ${text || 'No details'}`);
  }

  return res.json();
}

export async function getPartnerDetails(phone) {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }

  if (!phone) {
    throw new Error('Missing phone number');
  }

  const qs = new URLSearchParams({
    phone: String(phone),
  }).toString();

  const res = await fetch(`${apiBase}/get/partner/details?${qs}`, {
    method: 'GET',
    headers: buildHeaders(token),
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch partner details (${res.status}): ${text || 'No details'}`);
  }

  return res.json();
}

export async function getPaymentMethods(regId) {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }

  if (!regId) {
    throw new Error('Missing regId');
  }

  const qs = new URLSearchParams({
    reg_id: String(regId),
  }).toString();

  const res = await fetch(`${apiBase}/pos/app/reg/payment/method?${qs}`, {
    method: 'GET',
    headers: buildHeaders(token),
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch payment methods (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

export async function getNextSequence(sessionId) {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }

  if (!sessionId) {
    throw new Error('Missing session_id');
  }

  const res = await fetch(`${apiBase}/api/mobile_billing/next/sequence`, {
    method: 'POST',
    headers: buildHeaders(token, { includeContentType: true }),
    body: JSON.stringify({
      session_id: sessionId,
    }),
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to get next sequence (${res.status}): ${text || 'No details'}`);
  }

  return res.json();
}

export async function validateOrder({
  uid,
  orderName,
  amountTotal,
  amountTax,
  cartItems,
  paymentMethodId,
  sessionId,
  customerId,
  loyaltyAmount,
  sequenceNumber,
  loyalty
}) {
  const [storeUrl, baseUrl, token, userId] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
    AsyncStorage.getItem('user_id'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }
  if (!userId) {
    throw new Error('Missing user_id in AsyncStorage.');
  }

  // Transform cart items to lines format
  const lines = cartItems.map((item, index) => {
    const qty = Number(item.qty || 1);
    const priceUnit = Number(item.salePrice || 0);
    const priceSubtotal = qty * priceUnit;

    // Transform tax_ids from productTaxes array
    const taxIds = item.productTaxes && Array.isArray(item.productTaxes) && item.productTaxes.length > 0
      ? [[6, false, item.productTaxes.map(t => t.taxId)]]
      : [[6, false, [6]]]; // Default tax

    // Generate unique ID using timestamp + index
    const lineId = Date.now() + index;

    // Build full product name
    const fullProductName = item.productSize 
      ? `${item.productName} ${item.productSize}`.trim()
      : item.productName;

    return [
      0,
      0,
      {
        qty,
        price_unit: priceUnit,
        price_subtotal: priceSubtotal,
        price_subtotal_incl: priceSubtotal,
        discount: 0,
        product_id: item.product_id,
        tax_ids: taxIds,
        id: lineId,
        pack_lot_ids: [],
        description: '',
        full_product_name: fullProductName,
        price_extra: 0,
        price_manually_set: false,
        note: '',
        is_offer_product: false,
        is_buy_x_get_y_product: false,
        is_buy_x_get_y__qty_product: false,
        is_discount_product: false,
        free_product: false,
        is_discounted_product: false,
        related_product_id: false,
        related_product_ids: false,
        do_not_update: false,
        is_fix_discounted_product: false,
        is_grouped_discounted_product: false,
      },
    ];
  });

  // Build statement_ids (payment info)
  const statementIds = [
    [
      0,
      0,
      {
        name: new Date().toISOString().replace('T', ' ').replace('Z', '').slice(0, 19),
        payment_method_id: paymentMethodId,
        amount: amountTotal,
        payment_status: '',
        paymentResp: '',
        ticket: '',
        card_type: '',
        cardholder_name: '',
        transaction_id: '',
        terminal_service_id: null,
      },
    ],
  ];

  const body = {
    id: uid,
    data: {
      name: orderName,
      amount_paid: amountTotal,
      amount_total: amountTotal,
      amount_tax: amountTax,
      amount_return: 0,
      lines,
      statement_ids: statementIds,
      pos_session_id: sessionId,
      pricelist_id: 1,
      partner_id: customerId || false,
      user_id: parseInt(userId, 10),
      uid,
      sequence_number: sequenceNumber,
      creation_date: new Date().toISOString(),
      fiscal_position_id: false,
      server_id: false,
      to_invoice: false,
      to_ship: false,
      is_tipped: false,
      tip_amount: 0,
      redeemed_points: 0,
      loyalty: loyaltyAmount || 0,
      table_id: false,
      floor: false,
      floor_id: false,
      customer_count: 1,
      bookedCouponCodes: {},
      activePromoProgramIds: [],
      order_on_hold: false,
      loyalty: loyalty || 0,
    },
    to_invoice: false,
  };
console.log("validate order body:", JSON.stringify(body, null, 2));
  const res = await fetch(`${apiBase}/pos/validate/order`, {
    method: 'POST',
    headers: buildHeaders(token, { includeContentType: true }),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to validate order (${res.status}): ${text || 'No details'}`);
  }


  return res.json();
}

export async function getProductQuantityDiscounts(productIds) {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }

  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return { success: true, data: [] };
  }

  const res = await fetch(`${apiBase}/get/product/quantity/discounts`, {
    method: 'POST',
    headers: buildHeaders(token, { includeContentType: true }),
    body: JSON.stringify({
      product_ids: productIds,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to get quantity discounts (${res.status}): ${text || 'No details'}`);
  }

  const response = await res.json();
  return response?.result || { success: false, data: [] };
}

export async function redeemLoyaltyPoints(customerId, redeemAmount) {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }

  if (!customerId) {
    throw new Error('Missing customer_id');
  }

  if (!redeemAmount || redeemAmount <= 0) {
    throw new Error('Invalid redeem amount');
  }

  const qs = new URLSearchParams({
    customer_id: String(customerId),
    redeem_amount: String(redeemAmount),
  }).toString();

  const res = await fetch(`${apiBase}/redeem/loyalty?${qs}`, {
    method: 'POST',
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to redeem loyalty points (${res.status}): ${text || 'No details'}`);
  }

  return res.json();
}

export async function createCustomer(customerData) {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }

  if (!customerData.name || !customerData.phone) {
    throw new Error('Missing required customer fields: name and phone');
  }

  const res = await fetch(`${apiBase}/app/api/create/customer`, {
    method: 'POST',
    headers: buildHeaders(token, { includeContentType: true }),
    body: JSON.stringify({
      name: customerData.name,
      email: customerData.email || '',
      phone: customerData.phone,
      street: customerData.street || '',
      city: customerData.city || '',
      zip: customerData.zip || '',
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to create customer (${res.status}): ${text || 'No details'}`);
  }

  return res.json();
}
