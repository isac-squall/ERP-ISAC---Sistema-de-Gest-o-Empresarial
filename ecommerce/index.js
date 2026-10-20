const crypto = require('crypto');

const PLATAFORMAS = ['generico', 'woocommerce', 'shopify', 'nuvemshop', 'vtex', 'mercadolivre'];
const STATUS_PEDIDO = ['pago', 'cancelado', 'pendente'];

function fail(msg, status) {
  const err = new Error(msg);
  err.status = status || 400;
  throw err;
}

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function arredMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizarPlataforma(v) {
  const t = String(v || 'generico')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
  if (t === 'woo' || t === 'woocommerce') return 'woocommerce';
  if (t === 'shopify') return 'shopify';
  if (t === 'nuvemshop' || t === 'nuvem' || t === 'tiendanube') return 'nuvemshop';
  if (t === 'vtex') return 'vtex';
  if (t === 'mercadolivre' || t === 'mercado livre' || t === 'mercadolibre' || t === 'ml' || t === 'meli') return 'mercadolivre';
  return 'generico';
}

function normalizarForma(forma) {
  const s = String(forma || '').trim();
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('pix')) return 'PIX';
  if (t.includes('dinheir') || t.includes('cash')) return 'Dinheiro';
  if (t.includes('debit')) return 'Cartão Débito';
  if (t.includes('credit') || t.includes('cartao') || t.includes('card')) return 'Cartão Crédito';
  if (t.includes('fiado') || t.includes('credi') || t.includes('boleto')) return 'Fiado';
  if (s) return s.slice(0, 40);
  return 'PIX';
}

function normalizarEvento(status) {
  const t = String(status || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
  if (['cancelled', 'canceled', 'refunded', 'cancelado', 'estornado', 'devolvido', 'invalid'].includes(t)) return 'cancelado';
  if (['pending', 'on-hold', 'waiting', 'pendente', 'aguardando', 'payment_required', 'payment_in_process'].includes(t)) return 'pendente';
  if (['paid', 'pago', 'processing', 'completed', 'invoiced', 'faturado', 'autorizado', 'approved', 'confirmed'].includes(t)) return 'pago';
  return 'pago';
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (!ba.length || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function hmacSha256(secret, raw, encoding) {
  return crypto.createHmac('sha256', String(secret || '')).update(raw || '').digest(encoding || 'base64');
}

function verificarAssinatura({ plataforma, secret, rawBody, headers }) {
  const p = normalizarPlataforma(plataforma);
  const h = headers || {};
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  if (p === 'woocommerce') {
    const sig = h['x-wc-webhook-signature'] || h['x-woocommerce-signature'] || '';
    if (!secret) fail('Segredo WooCommerce nao configurado', 401);
    const esperado = hmacSha256(secret, raw, 'base64');
    if (!timingSafeEqual(esperado, sig)) fail('Assinatura WooCommerce invalida', 401);
    return true;
  }
  if (p === 'shopify') {
    const sig = h['x-shopify-hmac-sha256'] || '';
    if (!secret) fail('Segredo Shopify nao configurado', 401);
    const esperado = hmacSha256(secret, raw, 'base64');
    if (!timingSafeEqual(esperado, sig)) fail('Assinatura Shopify invalida', 401);
    return true;
  }
  if (p === 'nuvemshop') {
    const token = h['x-linkedstore-token'] || h['x-nuvemshop-token'] || h.authorization || '';
    if (!secret) fail('Token Nuvemshop nao configurado', 401);
    const limpo = String(token).replace(/^Bearer\s+/i, '');
    if (!timingSafeEqual(secret, limpo)) fail('Token Nuvemshop invalido', 401);
    return true;
  }
  if (p === 'vtex') {
    const key = h['x-vtex-api-appkey'] || '';
    const tok = h['x-vtex-api-apptoken'] || '';
    if (!secret) fail('AppToken VTEX nao configurado', 401);
    if (!timingSafeEqual(secret, tok) && !timingSafeEqual(secret, key)) fail('Credencial VTEX invalida', 401);
    return true;
  }
  if (p === 'mercadolivre') {
    if (!secret) fail('Token Mercado Livre nao configurado', 401);
    const bearer = String(h.authorization || '').replace(/^Bearer\s+/i, '');
    const sig = String(h['x-signature'] || '');
    if (bearer && timingSafeEqual(secret, bearer)) return true;
    if (sig) {
      const ts = (sig.match(/ts=([^,]+)/) || [])[1] || '';
      const v1 = (sig.match(/v1=([^,]+)/) || [])[1] || '';
      const requestId = h['x-request-id'] || h['x-requestid'] || '';
      const manifest = `id:${requestId};request-id:${requestId};ts:${ts};`;
      const esperado = crypto.createHmac('sha256', String(secret)).update(manifest).digest('hex');
      if (v1 && timingSafeEqual(esperado, v1)) return true;
    }
    if (timingSafeEqual(secret, bearer)) return true;
    fail('Assinatura Mercado Livre invalida', 401);
  }
  return false;
}

function itemBase(it) {
  const codigo = String(it.codigo || it.sku || it.ean || it.barcode || '').trim();
  const quantidade = Number(it.quantidade != null ? it.quantidade : it.quantity) || 0;
  const preco = Number(it.preco_unitario != null ? it.preco_unitario : (it.price != null ? it.price : it.sellingPrice));
  return {
    codigo,
    produto_id: it.produto_id ? Number(it.produto_id) : null,
    descricao: String(it.descricao || it.nome || it.name || '').trim().slice(0, 200),
    quantidade,
    preco_unitario: arredMoney(preco)
  };
}

function parsePedidoGenerico(body) {
  const src = body || {};
  const cliente = src.cliente || src.customer || src.billing || {};
  const itensIn = src.itens || src.items || src.line_items || src.products || [];
  const nome = String(cliente.nome || [cliente.first_name, cliente.last_name].filter(Boolean).join(' ') || src.cliente_nome || '').trim();
  return {
    external_id: String(src.external_id || src.id || src.order_id || src.orderId || '').trim(),
    status: normalizarEvento(src.status || src.financial_status || src.payment_status || src.evento),
    forma_pagamento: normalizarForma(src.forma_pagamento || src.payment_method || src.gateway || src.paymentMethod),
    desconto: arredMoney(src.desconto || src.discount || 0),
    cliente: {
      nome: nome || 'Cliente loja',
      cpf_cnpj: String(cliente.cpf_cnpj || cliente.cpf || cliente.cnpj || cliente.document || '').trim(),
      telefone: String(cliente.telefone || cliente.phone || '').trim(),
      email: String(cliente.email || '').trim(),
      endereco: String(cliente.endereco || cliente.address_1 || cliente.address || '').trim(),
      cidade: String(cliente.cidade || cliente.city || '').trim(),
      estado: String(cliente.estado || cliente.state || '').trim()
    },
    itens: (Array.isArray(itensIn) ? itensIn : []).map(itemBase)
  };
}

function parseWoo(body) {
  const src = body || {};
  const billing = src.billing || {};
  return parsePedidoGenerico({
    external_id: src.id,
    status: src.status,
    forma_pagamento: src.payment_method_title || src.payment_method,
    desconto: src.discount_total,
    cliente: {
      nome: [billing.first_name, billing.last_name].filter(Boolean).join(' '),
      cpf_cnpj: billing.cpf || billing.cnpj || billing.persontype,
      telefone: billing.phone,
      email: billing.email,
      endereco: billing.address_1,
      cidade: billing.city,
      estado: billing.state
    },
    itens: (src.line_items || []).map(it => ({
      sku: it.sku,
      nome: it.name,
      quantity: it.quantity,
      price: it.price
    }))
  });
}

function parseShopify(body) {
  const src = body || {};
  const c = src.customer || src.billing_address || {};
  return parsePedidoGenerico({
    external_id: src.id || src.order_number,
    status: src.cancelled_at ? 'cancelado' : src.financial_status,
    forma_pagamento: src.gateway || src.payment_gateway_names,
    desconto: src.total_discounts,
    cliente: {
      nome: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.name,
      telefone: c.phone,
      email: src.email || c.email,
      endereco: (src.billing_address || {}).address1,
      cidade: (src.billing_address || {}).city,
      estado: (src.billing_address || {}).province_code
    },
    itens: (src.line_items || []).map(it => ({
      sku: it.sku,
      nome: it.title || it.name,
      quantity: it.quantity,
      price: it.price
    }))
  });
}

function parseNuvemshop(body) {
  const src = body || {};
  const c = src.customer || {};
  const addr = (c.default_address || src.billing_address || {});
  return parsePedidoGenerico({
    external_id: src.id,
    status: src.payment_status || src.status,
    forma_pagamento: (src.payment_details && src.payment_details.method) || src.gateway,
    cliente: {
      nome: c.name,
      cpf_cnpj: c.identification || c.cpf,
      telefone: c.phone,
      email: c.email,
      endereco: addr.address,
      cidade: addr.city,
      estado: addr.province
    },
    itens: (src.products || src.line_items || []).map(it => ({
      sku: it.sku,
      nome: it.name,
      quantity: it.quantity,
      price: it.price
    }))
  });
}

function parseVtex(body) {
  const src = body || {};
  const c = src.clientProfileData || {};
  const addr = src.shippingData && src.shippingData.address ? src.shippingData.address : {};
  const pago = /invoiced|payment-approved|ready-for-handling|handling/i.test(String(src.status || ''));
  const cancel = /cancel/i.test(String(src.status || ''));
  return parsePedidoGenerico({
    external_id: src.orderId || src.orderId || src.id,
    status: cancel ? 'cancelado' : (pago ? 'pago' : src.status),
    forma_pagamento: ((src.paymentData || {}).transactions || [])
      .flatMap(t => t.payments || []).map(p => p.paymentSystemName).join(' ') || 'PIX',
    cliente: {
      nome: [c.firstName, c.lastName].filter(Boolean).join(' '),
      cpf_cnpj: c.document,
      telefone: c.phone,
      email: c.email,
      endereco: addr.street,
      cidade: addr.city,
      estado: addr.state
    },
    itens: (src.items || []).map(it => {
      const n = Number(it.sellingPrice != null ? it.sellingPrice : it.price) || 0;
      const preco = Number.isInteger(n) && n >= 100 ? n / 100 : n;
      return {
        sku: it.ean || it.refId || it.id,
        nome: it.name,
        quantity: it.quantity,
        price: preco
      };
    })
  });
}

function parseMercadoLivre(body) {
  const src = body || {};
  const order = src.order || src;
  const buyer = order.buyer || {};
  const billing = buyer.billing_info || {};
  const payments = order.payments || [];
  const pay = payments.find(p => String(p.status || '').toLowerCase() === 'approved') || payments[0] || {};
  const payType = String(pay.payment_type || pay.payment_method_id || order.payments?.[0]?.payment_type || '');
  const items = (order.order_items || order.items || []).map(it => {
    const item = it.item || it;
    return {
      sku: item.seller_sku || item.seller_custom_field || it.seller_sku || item.id,
      nome: item.title || item.name,
      quantity: it.quantity || item.quantity,
      price: it.unit_price != null ? it.unit_price : item.price
    };
  });
  const nome = [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || buyer.nickname || 'Cliente Mercado Livre';
  let status = order.status;
  if (!status && src.topic && /order/i.test(String(src.topic))) status = 'paid';
  const phone = typeof buyer.phone === 'object'
    ? [buyer.phone.area_code, buyer.phone.number].filter(Boolean).join('')
    : (buyer.phone || '');
  return parsePedidoGenerico({
    external_id: order.id || src.id || (String(src.resource || '').match(/orders\/(\d+)/) || [])[1],
    status,
    forma_pagamento: payType,
    cliente: {
      nome,
      cpf_cnpj: billing.doc_number || billing.identification || '',
      telefone: phone,
      email: buyer.email || '',
      endereco: '',
      cidade: '',
      estado: ''
    },
    itens: items
  });
}

function notificacaoMercadoLivre(body) {
  const src = body || {};
  const resource = String(src.resource || '');
  const m = resource.match(/orders\/(\d+)/i);
  if (m) return m[1];
  if (src.topic && /order/i.test(String(src.topic)) && src.resource) {
    const n = String(src.resource).replace(/^\//, '').split('/').pop();
    if (/^\d+$/.test(n)) return n;
  }
  if (src.id && /^\d+$/.test(String(src.id)) && !(src.order_items || src.items)) return String(src.id);
  return '';
}

async function buscarPedidoMercadoLivre(token, orderId) {
  if (!token) fail('Token Mercado Livre nao configurado', 401);
  if (!orderId) fail('Pedido Mercado Livre sem id');
  const url = `https://api.mercadolibre.com/orders/${encodeURIComponent(orderId)}`;
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    fail('Falha ao consultar Mercado Livre: ' + (e.message || 'rede'));
  }
  if (res.status === 401 || res.status === 403) fail('Token Mercado Livre invalido ou expirado', 401);
  if (!res.ok) fail(`Mercado Livre recusou o pedido ${orderId} (${res.status})`);
  return res.json();
}

async function enriquecerPedidoMercadoLivre(token, body) {
  const src = body || {};
  if (Array.isArray(src.order_items) && src.order_items.length) return src;
  if (Array.isArray(src.items) && src.items.length && src.buyer) return src;
  if (src.order && (src.order.order_items || src.order.items)) return src.order;
  const orderId = notificacaoMercadoLivre(src);
  if (!orderId) return src;
  return buscarPedidoMercadoLivre(token, orderId);
}

function parsePedido(plataforma, body) {
  const p = normalizarPlataforma(plataforma);
  if (p === 'woocommerce') return parseWoo(body);
  if (p === 'shopify') return parseShopify(body);
  if (p === 'nuvemshop') return parseNuvemshop(body);
  if (p === 'vtex') return parseVtex(body);
  if (p === 'mercadolivre') return parseMercadoLivre(body);
  return parsePedidoGenerico(body);
}

function validarPedido(pedido) {
  if (!pedido.external_id) fail('external_id do pedido e obrigatorio');
  if (!Array.isArray(pedido.itens) || !pedido.itens.length) fail('Pedido sem itens');
  for (const it of pedido.itens) {
    if (!it.codigo && !it.produto_id) fail('Item sem codigo/SKU');
    if (!Number.isFinite(it.quantidade) || it.quantidade <= 0) fail('Quantidade invalida');
    if (!Number.isFinite(it.preco_unitario) || it.preco_unitario < 0) fail('Preco unitario invalido');
  }
  return pedido;
}

function gerarToken() {
  const raw = crypto.randomBytes(24).toString('hex');
  const token = `erp_live_${raw}`;
  return {
    token,
    prefixo: token.slice(0, 16),
    hash: crypto.createHash('sha256').update(token).digest('hex')
  };
}

function mascarar(v) {
  const s = String(v || '');
  if (!s) return '';
  if (s.length <= 6) return '******';
  return `${s.slice(0, 3)}******${s.slice(-2)}`;
}

function upsertCliente(db, dados) {
  const d = dados || {};
  const nome = String(d.nome || '').trim() || 'Cliente loja';
  const cpf = String(d.cpf_cnpj || '').trim();
  const tel = String(d.telefone || '').trim();
  const email = String(d.email || '').trim();
  let row = null;
  if (cpf) row = db.prepare('SELECT * FROM clientes WHERE cpf_cnpj = ? AND ativo = 1').get(cpf);
  if (!row && tel) row = db.prepare('SELECT * FROM clientes WHERE telefone = ? AND ativo = 1').get(tel);
  if (!row && email) {
    row = db.prepare('SELECT * FROM clientes WHERE lower(email) = lower(?) AND ativo = 1').get(email);
  }
  if (row) {
    db.prepare(`UPDATE clientes SET
      nome = COALESCE(NULLIF(?, ''), nome),
      cpf_cnpj = COALESCE(NULLIF(?, ''), cpf_cnpj),
      telefone = COALESCE(NULLIF(?, ''), telefone),
      email = COALESCE(NULLIF(?, ''), email),
      endereco = COALESCE(NULLIF(?, ''), endereco),
      cidade = COALESCE(NULLIF(?, ''), cidade),
      estado = COALESCE(NULLIF(?, ''), estado)
      WHERE id = ?`).run(nome, cpf, tel, email, d.endereco || '', d.cidade || '', d.estado || '', row.id);
    return row.id;
  }
  const ins = db.prepare(`INSERT INTO clientes (nome, cpf_cnpj, telefone, email, endereco, cidade, estado)
    VALUES (?,?,?,?,?,?,?)`).run(nome, cpf || null, tel || null, email || null, d.endereco || null, d.cidade || null, d.estado || null);
  return ins.lastInsertRowid;
}

function resolverItens(db, itens) {
  const out = [];
  for (const it of itens) {
    let prod = null;
    if (it.produto_id) {
      prod = db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(it.produto_id);
    }
    if (!prod && it.codigo) {
      prod = db.prepare('SELECT * FROM produtos WHERE ativo = 1 AND codigo = ?').get(it.codigo);
      if (!prod) {
        prod = db.prepare('SELECT * FROM produtos WHERE ativo = 1 AND sku_ecommerce = ?').get(it.codigo);
      }
    }
    if (!prod) fail(`Produto nao encontrado: ${it.codigo || it.produto_id}`);
    const qtd = Number(it.quantidade) || 0;
    const preco = it.preco_unitario != null ? arredMoney(it.preco_unitario) : arredMoney(prod.preco);
    out.push({
      produto_id: prod.id,
      descricao: it.descricao || prod.nome,
      quantidade: qtd,
      preco_unitario: preco,
      preco_custo: Number(prod.preco_custo) || 0
    });
  }
  return out;
}

module.exports = {
  PLATAFORMAS,
  STATUS_PEDIDO,
  onlyDigits,
  arredMoney,
  normalizarPlataforma,
  normalizarForma,
  normalizarEvento,
  timingSafeEqual,
  hmacSha256,
  verificarAssinatura,
  parsePedidoGenerico,
  parseWoo,
  parseShopify,
  parseNuvemshop,
  parseVtex,
  parseMercadoLivre,
  notificacaoMercadoLivre,
  buscarPedidoMercadoLivre,
  enriquecerPedidoMercadoLivre,
  parsePedido,
  validarPedido,
  gerarToken,
  mascarar,
  upsertCliente,
  resolverItens
};
