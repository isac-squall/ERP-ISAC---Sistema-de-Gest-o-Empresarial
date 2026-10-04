const db = require('../database');
const backupMod = require('../backup');

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function cfgMap() {
  return Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor]));
}

function parsePeriodo(query) {
  const periodo = query.periodo || 'mes';
  let from = query.de;
  let to = query.ate;
  if (!from || !to) {
    to = db.prepare("SELECT date('now','localtime') as d").get().d;
    if (periodo === 'hoje') from = to;
    else if (periodo === '7dias') from = db.prepare("SELECT date('now','localtime','-6 days') as d").get().d;
    else if (periodo === '30dias') from = db.prepare("SELECT date('now','localtime','-29 days') as d").get().d;
    else if (periodo === 'ano') from = db.prepare("SELECT date('now','localtime','start of year') as d").get().d;
    else from = db.prepare("SELECT date('now','localtime','start of month') as d").get().d;
  }
  return { from, to, periodo };
}

function parseMes(query) {
  const raw = String(query.mes || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const from = `${m[1]}-${m[2]}-01`;
    const to = db.prepare("SELECT date(?, 'start of month', '+1 month', '-1 day') as d").get(from).d;
    return { from, to, mes: `${m[1]}-${m[2]}` };
  }
  const hoje = db.prepare("SELECT date('now','localtime') as d").get().d;
  const from = db.prepare("SELECT date('now','localtime','start of month') as d").get().d;
  return { from, to: hoje, mes: String(from).slice(0, 7) };
}

function nfeBaseQuery() {
  return `SELECT n.id, n.venda_id, n.chave, n.numero, n.serie, n.ambiente, n.status,
    n.protocolo, n.cstat, n.motivo, n.dh_emi, n.dh_autorizacao, n.criado_em,
    CASE WHEN n.xml IS NULL OR n.xml = '' THEN 0 ELSE 1 END as tem_xml,
    v.total as venda_total, v.status as venda_status, v.forma_pagamento,
    v.criado_em as venda_em, c.nome as cliente_nome, c.cpf_cnpj as cliente_doc
    FROM nfce n
    LEFT JOIN vendas v ON v.id = n.venda_id
    LEFT JOIN clientes c ON v.cliente_id = c.id
    WHERE 1=1`;
}

function nfeFiltros(query) {
  const { from, to, periodo } = parsePeriodo(query);
  const params = [];
  let sql = '';
  sql += ' AND date(COALESCE(n.dh_emi, n.criado_em)) >= date(?) AND date(COALESCE(n.dh_emi, n.criado_em)) <= date(?)';
  params.push(from, to);
  if (query.status) {
    sql += ' AND n.status = ?';
    params.push(query.status);
  }
  if (query.search) {
    const s = `%${query.search}%`;
    sql += ' AND (CAST(n.numero AS TEXT) LIKE ? OR n.chave LIKE ? OR c.nome LIKE ? OR CAST(n.venda_id AS TEXT) LIKE ?)';
    params.push(s, s, s, s);
  }
  return { sql, params, from, to, periodo };
}

function listarNfe(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 15));
  const { sql, params, from, to, periodo } = nfeFiltros(query);
  const where = nfeBaseQuery() + sql;
  const countQ = where.replace(/SELECT n\.id[\s\S]*?FROM nfce n/, 'SELECT COUNT(*) as total FROM nfce n');
  const total = db.prepare(countQ).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${where} ORDER BY n.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const resumo = db.prepare(`
    SELECT COUNT(*) as qtd,
      SUM(CASE WHEN n.status = 'autorizada' THEN 1 ELSE 0 END) as autorizadas,
      SUM(CASE WHEN n.status = 'cancelada' THEN 1 ELSE 0 END) as canceladas,
      SUM(CASE WHEN n.xml IS NOT NULL AND n.xml != '' THEN 1 ELSE 0 END) as com_xml,
      COALESCE(SUM(v.total),0) as valor
    FROM nfce n
    LEFT JOIN vendas v ON v.id = n.venda_id
    LEFT JOIN clientes c ON v.cliente_id = c.id
    WHERE 1=1 ${sql}
  `).get(...params);
  return {
    data, total, page, limit, totalPages: Math.ceil(total / limit) || 1,
    de: from, ate: to, periodo,
    resumo: {
      qtd: resumo?.qtd || 0,
      autorizadas: resumo?.autorizadas || 0,
      canceladas: resumo?.canceladas || 0,
      com_xml: resumo?.com_xml || 0,
      valor: resumo?.valor || 0
    }
  };
}

function zipXmlNfe(query) {
  const { sql, params, from, to } = nfeFiltros(query);
  const rows = db.prepare(`
    SELECT n.id, n.chave, n.numero, n.serie, n.xml, n.status
    FROM nfce n
    LEFT JOIN vendas v ON v.id = n.venda_id
    LEFT JOIN clientes c ON v.cliente_id = c.id
    WHERE n.xml IS NOT NULL AND n.xml != '' ${sql}
    ORDER BY n.numero, n.id
  `).all(...params);
  if (!rows.length) {
    const err = new Error('Nenhum XML encontrado no periodo');
    err.status = 404;
    throw err;
  }
  const files = rows.map((r) => ({
    name: `NFCe-${r.chave || `${r.serie || 1}-${r.numero || r.id}`}.xml`,
    data: Buffer.from(r.xml, 'utf8')
  }));
  const buf = backupMod.zipStore(files);
  const nome = `NFCe-XMLs-${String(from).replace(/-/g, '')}-${String(to).replace(/-/g, '')}.zip`;
  return { buf, nome, qtd: rows.length };
}

function listarCompras(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 15));
  const { from, to, periodo } = parsePeriodo(query);
  const params = [from, to];
  let where = `WHERE f.tipo = 'Despesa'
    AND date(COALESCE(f.data_pagamento, f.data_vencimento, f.criado_em)) >= date(?)
    AND date(COALESCE(f.data_pagamento, f.data_vencimento, f.criado_em)) <= date(?)`;
  if (query.search) {
    where += ' AND (f.descricao LIKE ? OR f.categoria LIKE ? OR fo.nome LIKE ?)';
    const s = `%${query.search}%`;
    params.push(s, s, s);
  }
  const base = `FROM financeiro f LEFT JOIN fornecedores fo ON f.fornecedor_id = fo.id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) as total ${base}`).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`
    SELECT f.*, fo.nome as fornecedor_nome, fo.cnpj as fornecedor_cnpj
    ${base}
    ORDER BY COALESCE(f.data_pagamento, f.data_vencimento, f.criado_em) DESC, f.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  const resumo = db.prepare(`
    SELECT COUNT(*) as qtd,
      COALESCE(SUM(f.valor),0) as total,
      COALESCE(SUM(CASE WHEN f.status = 'Pago' THEN f.valor ELSE 0 END),0) as pago,
      COALESCE(SUM(CASE WHEN f.status = 'Pendente' THEN f.valor ELSE 0 END),0) as pendente
    ${base}
  `).get(...params);
  const porFornecedor = db.prepare(`
    SELECT COALESCE(fo.nome, 'Sem fornecedor') as fornecedor, COUNT(*) as qtd, COALESCE(SUM(f.valor),0) as total
    ${base}
    GROUP BY fornecedor ORDER BY total DESC LIMIT 8
  `).all(...params);
  const porCategoria = db.prepare(`
    SELECT COALESCE(NULLIF(f.categoria,''), 'Sem categoria') as categoria, COUNT(*) as qtd, COALESCE(SUM(f.valor),0) as total
    ${base}
    GROUP BY categoria ORDER BY total DESC LIMIT 8
  `).all(...params);
  return {
    data, total, page, limit, totalPages: Math.ceil(total / limit) || 1,
    de: from, ate: to, periodo,
    resumo: {
      qtd: resumo?.qtd || 0,
      total: resumo?.total || 0,
      pago: resumo?.pago || 0,
      pendente: resumo?.pendente || 0
    },
    porFornecedor, porCategoria
  };
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function comprasCsv(query) {
  const r = listarCompras({ ...query, page: 1, limit: 10000 });
  const lines = [['ID', 'Descricao', 'Fornecedor', 'CNPJ', 'Categoria', 'Valor', 'Vencimento', 'Pagamento', 'Status'].join(';')];
  for (const f of r.data) {
    lines.push([
      f.id, csvEscape(f.descricao), csvEscape(f.fornecedor_nome), csvEscape(f.fornecedor_cnpj),
      csvEscape(f.categoria), Number(f.valor || 0).toFixed(2).replace('.', ','),
      f.data_vencimento || '', f.data_pagamento || '', f.status || ''
    ].join(';'));
  }
  lines.push('');
  lines.push(`Total;${r.resumo.qtd} lancamentos;Pago;${Number(r.resumo.pago).toFixed(2).replace('.', ',')};Pendente;${Number(r.resumo.pendente).toFixed(2).replace('.', ',')};Geral;${Number(r.resumo.total).toFixed(2).replace('.', ',')}`);
  const nome = `compras-${String(r.de).replace(/-/g, '')}-${String(r.ate).replace(/-/g, '')}.csv`;
  return { texto: '\ufeff' + lines.join('\r\n'), nome, de: r.de, ate: r.ate };
}

function montarExtrato(query) {
  const { from, to, periodo } = parsePeriodo(query);
  const cfg = cfgMap();
  const empresa = cfg.empresa_nome || cfg.nfce_nome_fantasia || cfg.cupom_titulo || 'ERP ISAC';
  const vendas = db.prepare(`
    SELECT v.id, v.total, v.desconto, v.forma_pagamento, v.status, v.criado_em, c.nome as cliente_nome
    FROM vendas v LEFT JOIN clientes c ON v.cliente_id = c.id
    WHERE date(v.criado_em) >= date(?) AND date(v.criado_em) <= date(?)
    ORDER BY v.criado_em, v.id
  `).all(from, to);
  const caixa = db.prepare(`
    SELECT c.id, c.tipo, c.descricao, c.valor, c.forma_pagamento, c.criado_em, u.nome as usuario_nome
    FROM caixa c LEFT JOIN usuarios u ON c.usuario_id = u.id
    WHERE date(c.criado_em) >= date(?) AND date(c.criado_em) <= date(?)
    ORDER BY c.criado_em, c.id
  `).all(from, to);
  const financeiro = db.prepare(`
    SELECT f.id, f.tipo, f.categoria, f.descricao, f.valor, f.status, f.data_vencimento, f.data_pagamento,
      c.nome as cliente_nome, fo.nome as fornecedor_nome
    FROM financeiro f
    LEFT JOIN clientes c ON f.cliente_id = c.id
    LEFT JOIN fornecedores fo ON f.fornecedor_id = fo.id
    WHERE date(COALESCE(f.data_pagamento, f.data_vencimento, f.criado_em)) >= date(?)
      AND date(COALESCE(f.data_pagamento, f.data_vencimento, f.criado_em)) <= date(?)
    ORDER BY COALESCE(f.data_pagamento, f.data_vencimento, f.criado_em), f.id
  `).all(from, to);
  const vendasOk = vendas.filter(v => v.status !== 'Cancelada');
  const receitaVendas = vendasOk.reduce((s, v) => s + Number(v.total || 0), 0);
  const caixaIn = caixa.filter(m => ['Entrada', 'Abertura', 'Venda realizada'].includes(m.tipo) || /venda/i.test(m.tipo || ''))
    .reduce((s, m) => s + Number(m.valor || 0), 0);
  const caixaOut = caixa.filter(m => m.tipo === 'Saída' || m.tipo === 'Sangria')
    .reduce((s, m) => s + Number(m.valor || 0), 0);
  const recFin = financeiro.filter(f => f.tipo === 'Receita').reduce((s, f) => s + Number(f.valor || 0), 0);
  const despFin = financeiro.filter(f => f.tipo === 'Despesa').reduce((s, f) => s + Number(f.valor || 0), 0);
  return {
    empresa, de: from, ate: to, periodo,
    vendas, caixa, financeiro,
    resumo: {
      vendas_qtd: vendasOk.length,
      vendas_total: receitaVendas,
      caixa_entradas: caixaIn,
      caixa_saidas: caixaOut,
      financeiro_receitas: recFin,
      financeiro_despesas: despFin,
      saldo: receitaVendas + recFin - despFin
    }
  };
}

function moneyBr(v) {
  return Number(v || 0).toFixed(2).replace('.', ',');
}

function extratoTxt(query) {
  const e = montarExtrato(query);
  const L = [];
  L.push('EXTRATO CONTABIL - ERP ISAC');
  L.push(`Empresa: ${e.empresa}`);
  L.push(`Periodo: ${e.de} a ${e.ate}`);
  L.push(''.padEnd(72, '='));
  L.push('');
  L.push('VENDAS');
  L.push(['ID', 'Data', 'Cliente', 'Pagamento', 'Status', 'Total'].map((h, i) => padRight(h, [6, 20, 24, 16, 12, 12][i])).join(''));
  for (const v of e.vendas) {
    L.push([
      padRight(v.id, 6),
      padRight(v.criado_em || '', 20),
      padRight(v.cliente_nome || 'Avulso', 24),
      padRight(v.forma_pagamento || '-', 16),
      padRight(v.status || '', 12),
      padLeft(moneyBr(v.total), 12)
    ].join(''));
  }
  L.push(`Total vendas ativas: ${e.resumo.vendas_qtd}  ${moneyBr(e.resumo.vendas_total)}`);
  L.push('');
  L.push('CAIXA');
  for (const m of e.caixa) {
    L.push(`${m.criado_em || ''}  ${padRight(m.tipo, 16)} ${padRight(m.descricao || '', 32)} ${padLeft(moneyBr(m.valor), 12)}`);
  }
  L.push(`Entradas ${moneyBr(e.resumo.caixa_entradas)}  Saidas ${moneyBr(e.resumo.caixa_saidas)}`);
  L.push('');
  L.push('FINANCEIRO');
  for (const f of e.financeiro) {
    const quem = f.tipo === 'Despesa' ? (f.fornecedor_nome || '') : (f.cliente_nome || '');
    L.push(`${f.tipo}  ${padRight(f.descricao || '', 28)} ${padRight(quem, 20)} ${padLeft(moneyBr(f.valor), 12)}  ${f.status || ''}`);
  }
  L.push(`Receitas ${moneyBr(e.resumo.financeiro_receitas)}  Despesas ${moneyBr(e.resumo.financeiro_despesas)}`);
  L.push('');
  L.push(''.padEnd(72, '='));
  L.push(`SALDO DO PERIODO: ${moneyBr(e.resumo.saldo)}`);
  const nome = `extrato-${String(e.de).replace(/-/g, '')}-${String(e.ate).replace(/-/g, '')}.txt`;
  return { texto: L.join('\r\n'), nome, extra: e };
}

function extratoCsv(query) {
  const e = montarExtrato(query);
  const lines = ['Tipo;ID;Data;Descricao;Pessoa;Pagamento;Status;Valor'];
  for (const v of e.vendas) {
    lines.push(['Venda', v.id, v.criado_em || '', csvEscape('Venda'), csvEscape(v.cliente_nome), csvEscape(v.forma_pagamento), csvEscape(v.status), moneyBr(v.total)].join(';'));
  }
  for (const m of e.caixa) {
    lines.push(['Caixa', m.id, m.criado_em || '', csvEscape(m.descricao), csvEscape(m.usuario_nome), csvEscape(m.forma_pagamento), csvEscape(m.tipo), moneyBr(m.valor)].join(';'));
  }
  for (const f of e.financeiro) {
    const quem = f.tipo === 'Despesa' ? f.fornecedor_nome : f.cliente_nome;
    lines.push(['Financeiro', f.id, f.data_pagamento || f.data_vencimento || '', csvEscape(f.descricao), csvEscape(quem), csvEscape(f.categoria), csvEscape(`${f.tipo}/${f.status}`), moneyBr(f.valor)].join(';'));
  }
  const nome = `extrato-${String(e.de).replace(/-/g, '')}-${String(e.ate).replace(/-/g, '')}.csv`;
  return { texto: '\ufeff' + lines.join('\r\n'), nome, extra: e };
}

function padRight(v, n) {
  const s = String(v ?? '');
  return (s + ' '.repeat(Math.max(0, n))).slice(0, n);
}

function padLeft(v, n) {
  const s = String(v ?? '');
  return (' '.repeat(Math.max(0, n - s.length)) + s).slice(-n);
}

function campoSped(v) {
  return String(v ?? '').replace(/\|/g, ' ').replace(/\r?\n/g, ' ').trim();
}

function spedSit(status) {
  if (status === 'cancelada') return '02';
  if (status === 'autorizada') return '00';
  if (status === 'rejeitada' || status === 'erro') return '05';
  return '08';
}

function gerarSped(query) {
  const { from, to, mes } = parseMes(query);
  const cfg = cfgMap();
  const notas = db.prepare(`
    SELECT n.*, v.total as venda_total, v.desconto, v.status as venda_status, v.forma_pagamento,
      c.nome as cliente_nome, c.cpf_cnpj as cliente_doc
    FROM nfce n
    LEFT JOIN vendas v ON v.id = n.venda_id
    LEFT JOIN clientes c ON v.cliente_id = c.id
    WHERE date(COALESCE(n.dh_emi, n.criado_em)) >= date(?)
      AND date(COALESCE(n.dh_emi, n.criado_em)) <= date(?)
    ORDER BY n.numero, n.id
  `).all(from, to);
  const itensPorVenda = new Map();
  for (const n of notas) {
    if (!n.venda_id) continue;
    const itens = db.prepare(`
      SELECT vi.*, COALESCE(p.nome, vi.descricao) as produto_nome, p.codigo, p.ncm, p.cfop, p.unidade
      FROM venda_itens vi LEFT JOIN produtos p ON vi.produto_id = p.id
      WHERE vi.venda_id = ?
    `).all(n.venda_id);
    itensPorVenda.set(n.venda_id, itens);
  }
  const dtIni = String(from).replace(/-/g, '');
  const dtFim = String(to).replace(/-/g, '');
  const cnpj = onlyDigits(cfg.empresa_cnpj || cfg.nfce_cnpj);
  const ie = onlyDigits(cfg.nfce_ie);
  const razao = campoSped(cfg.nfce_razao_social || cfg.empresa_nome || cfg.nfce_nome_fantasia || 'ERP ISAC');
  const uf = campoSped(cfg.nfce_uf || cfg.empresa_estado || 'RN');
  const mun = onlyDigits(cfg.nfce_codigo_municipio) || '2410306';
  const fantasia = campoSped(cfg.empresa_nome || cfg.nfce_nome_fantasia || razao);
  const cep = onlyDigits(cfg.nfce_cep || '');
  const end = campoSped(cfg.nfce_logradouro || cfg.empresa_endereco || '');
  const num = campoSped(cfg.nfce_numero || 'S/N');
  const bairro = campoSped(cfg.nfce_bairro || '');
  const fone = onlyDigits(cfg.empresa_telefone || cfg.nfce_telefone);
  const email = campoSped(cfg.empresa_email || '');
  const produtos = [];
  const seenProd = new Set();
  for (const itens of itensPorVenda.values()) {
    for (const it of itens) {
      const cod = String(it.codigo || it.produto_id || it.produto_nome || it.id);
      if (seenProd.has(cod)) continue;
      seenProd.add(cod);
      produtos.push(it);
    }
  }

  const linhas = [];
  const push = (arr) => linhas.push('|' + arr.map(campoSped).join('|') + '|');

  push(['0000', '017', '0', '0', dtIni, dtFim, razao, cnpj, uf, ie, mun, '', '', 'A', '1']);
  push(['0001', '0']);
  push(['0005', fantasia, cep, end, num, '', bairro, fone, '', email]);
  push(['0100', campoSped(cfg.empresa_nome || 'Contador'), '', cnpj, '', '', '', '', '', '', '', '', '', '', '']);
  if (produtos.length) {
    push(['0190', 'UN', 'UNIDADE']);
    for (const p of produtos) {
      push(['0200', String(p.codigo || p.produto_id || p.id), campoSped(p.produto_nome).slice(0, 60), '', p.ncm || '00000000', '', p.unidade || 'UN', '00', '', '', '']);
    }
  }
  push(['0990', '0']);

  push(['C001', notas.length ? '0' : '1']);
  let c170 = 0;
  for (const n of notas) {
    const dt = String(n.dh_emi || n.criado_em || '').slice(0, 10).replace(/-/g, '');
    const vl = Number(n.venda_total || 0).toFixed(2);
    push([
      'C100', '1', '0', '', '65', spedSit(n.status), String(n.serie || 1), String(n.numero || ''),
      n.chave || '', dt, dt, vl, '0', '0', vl, '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0'
    ]);
    const itens = itensPorVenda.get(n.venda_id) || [];
    itens.forEach((it, idx) => {
      push([
        'C170', String(idx + 1), String(it.codigo || it.produto_id || ''), campoSped(it.produto_nome).slice(0, 60),
        Number(it.quantidade || 0).toFixed(3), it.unidade || 'UN', Number(it.subtotal || 0).toFixed(2),
        '0', it.cfop || '5102', '000', Number(it.subtotal || 0).toFixed(2)
      ]);
      c170 += 1;
    });
  }
  push(['C990', '0']);
  push(['H001', '1']);
  push(['H990', '2']);
  push(['9001', '0']);

  const counts = {};
  for (const line of linhas) {
    const reg = line.split('|')[1];
    if (reg) counts[reg] = (counts[reg] || 0) + 1;
  }
  const regs = Object.keys(counts).sort();
  for (const reg of regs) push(['9900', reg, counts[reg]]);
  push(['9900', '9900', String(regs.length + 3)]);
  push(['9900', '9990', '1']);
  push(['9900', '9999', '1']);
  push(['9990', '0']);
  push(['9999', '0']);

  function setBloco(reg, n) {
    const idx = linhas.findIndex(l => l.startsWith(`|${reg}|`));
    if (idx < 0) return;
    const parts = linhas[idx].split('|');
    parts[2] = String(n);
    linhas[idx] = parts.join('|');
  }
  setBloco('0990', linhas.filter(l => (l.split('|')[1] || '').startsWith('0')).length);
  setBloco('C990', linhas.filter(l => (l.split('|')[1] || '').startsWith('C')).length);
  setBloco('H990', linhas.filter(l => (l.split('|')[1] || '').startsWith('H')).length);
  setBloco('9990', linhas.filter(l => {
    const r = l.split('|')[1] || '';
    return r === '9001' || r === '9900' || r === '9990';
  }).length);
  setBloco('9999', linhas.length);

  const texto = linhas.join('\r\n') + '\r\n';
  const nome = `sped-fiscal-${mes.replace('-', '')}.txt`;
  const valor = notas.filter(n => n.status === 'autorizada').reduce((s, n) => s + Number(n.venda_total || 0), 0);
  return {
    texto, nome, mes, de: from, ate: to,
    resumo: {
      empresa: nomeEmpresa(cfg),
      cnpj,
      ie,
      qtd: notas.length,
      autorizadas: notas.filter(n => n.status === 'autorizada').length,
      canceladas: notas.filter(n => n.status === 'cancelada').length,
      valor,
      itens: c170,
      registros: linhas.length
    }
  };
}

function nomeEmpresa(cfg) {
  return cfg.nfce_razao_social || cfg.empresa_nome || cfg.nfce_nome_fantasia || cfg.cupom_titulo || 'ERP ISAC';
}

function spedPreview(query) {
  const g = gerarSped(query);
  return { mes: g.mes, de: g.de, ate: g.ate, resumo: g.resumo, nome: g.nome };
}

module.exports = {
  parsePeriodo,
  listarNfe,
  zipXmlNfe,
  listarCompras,
  comprasCsv,
  montarExtrato,
  extratoTxt,
  extratoCsv,
  gerarSped,
  spedPreview
};
