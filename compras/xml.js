function fail(msg, status) {
  const err = new Error(msg);
  err.status = status || 400;
  throw err;
}

const STATUS = ['Pendente', 'Conferida', 'Entrada', 'Cancelada'];

function arredMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function arredQtd(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function decodeXml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripNs(xml) {
  return String(xml || '')
    .replace(/<\?xml[^?]*\?>/i, '')
    .replace(/<\/?[\w.-]+:/g, (m) => m.replace(/[\w.-]+:/, ''));
}

function firstTag(xml, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  const m = String(xml || '').match(re);
  return m ? decodeXml(m[1].trim()) : '';
}

function allTags(xml, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(String(xml || '')))) out.push(m[1]);
  return out;
}

function attr(xml, tag, name) {
  const re = new RegExp(`<${tag}[^>]*\\s${name}="([^"]+)"`, 'i');
  const m = String(xml || '').match(re);
  return m ? m[1] : '';
}

function num(v) {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function normalizarStatus(status) {
  const s = String(status || '').trim();
  if (STATUS.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('entrada') || t.includes('receb')) return 'Entrada';
  if (t.includes('cancel')) return 'Cancelada';
  if (t.includes('confer')) return 'Conferida';
  return 'Pendente';
}

function cfopEntrada(cfop, mesmaUf) {
  const d = String(cfop || '').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
  if (!d || d === '0000') return mesmaUf ? '1102' : '2102';
  const first = d[0];
  if (first === '5') return '1' + d.slice(1);
  if (first === '6') return '2' + d.slice(1);
  if (first === '1' || first === '2' || first === '3') return d;
  return mesmaUf ? '1102' : '2102';
}

function eanValido(ean) {
  const s = String(ean || '').replace(/\D/g, '');
  if (!s || s.length < 8) return '';
  if (/^0+$/.test(s)) return '';
  return s;
}

function parseDet(detXml, idx) {
  const prod = firstTag(detXml, 'prod') || detXml;
  const imposto = firstTag(detXml, 'imposto') || detXml;
  const ean = eanValido(firstTag(prod, 'cEAN') || firstTag(prod, 'cEANTrib'));
  const qtd = num(firstTag(prod, 'qCom') || firstTag(prod, 'qTrib') || 1);
  const preco = num(firstTag(prod, 'vUnCom') || firstTag(prod, 'vUnTrib'));
  const subtotal = arredMoney(num(firstTag(prod, 'vProd')) || qtd * preco);
  return {
    n_item: Number(attr(detXml, 'det', 'nItem')) || (idx + 1),
    codigo_fornecedor: String(firstTag(prod, 'cProd') || '').slice(0, 60),
    ean,
    descricao: String(firstTag(prod, 'xProd') || `Item ${idx + 1}`).slice(0, 200),
    ncm: String(firstTag(prod, 'NCM') || '00000000').replace(/\D/g, '').padStart(8, '0').slice(0, 8),
    cfop: String(firstTag(prod, 'CFOP') || '').replace(/\D/g, '').slice(0, 4),
    unidade: String(firstTag(prod, 'uCom') || firstTag(prod, 'uTrib') || 'UN').slice(0, 6).toUpperCase(),
    quantidade: arredQtd(qtd || 1),
    preco_unitario: arredMoney(preco),
    subtotal,
    icms: arredMoney(num(firstTag(imposto, 'vICMS'))),
    ipi: arredMoney(num(firstTag(imposto, 'vIPI'))),
    pis: arredMoney(num(firstTag(imposto, 'vPIS'))),
    cofins: arredMoney(num(firstTag(imposto, 'vCOFINS')))
  };
}

function parseXml(raw) {
  const xml = stripNs(raw);
  if (!xml || xml.length < 40) fail('XML invalido ou vazio');
  const inf = firstTag(xml, 'infNFe') || xml;
  if (!/<ide>/i.test(inf) && !/<emit>/i.test(inf)) fail('Arquivo nao parece uma NF-e (infNFe ausente)');
  const idAttr = attr(xml, 'infNFe', 'Id') || attr(inf, 'infNFe', 'Id') || '';
  let chave = idAttr.replace(/^NFe/i, '').replace(/\D/g, '');
  if (chave.length !== 44) chave = firstTag(xml, 'chNFe').replace(/\D/g, '');
  if (chave.length !== 44) fail('Chave de acesso da NF-e nao encontrada (44 digitos)');
  const ide = firstTag(inf, 'ide') || inf;
  const emit = firstTag(inf, 'emit') || inf;
  const dest = firstTag(inf, 'dest') || inf;
  const total = firstTag(inf, 'total') || inf;
  const modelo = String(firstTag(ide, 'mod') || '55');
  if (modelo !== '55' && modelo !== '65') fail('Somente NF-e modelo 55 (ou NFC-e 65) pode ser importada como entrada');
  const dets = allTags(inf, 'det');
  if (!dets.length) fail('NF-e sem itens');
  const itens = dets.map((d, i) => parseDet(d, i));
  const emitCnpj = onlyDigits(firstTag(emit, 'CNPJ') || firstTag(emit, 'CPF'));
  const destCnpj = onlyDigits(firstTag(dest, 'CNPJ') || firstTag(dest, 'CPF'));
  const emitUf = String(firstTag(firstTag(emit, 'enderEmit') || emit, 'UF') || '').toUpperCase().slice(0, 2);
  const destUf = String(firstTag(firstTag(dest, 'enderDest') || dest, 'UF') || '').toUpperCase().slice(0, 2);
  const mesmaUf = !emitUf || !destUf || emitUf === destUf;
  for (const it of itens) it.cfop_entrada = cfopEntrada(it.cfop, mesmaUf);
  const dh = firstTag(ide, 'dhEmi') || firstTag(ide, 'dEmi');
  const dataEmissao = dh ? String(dh).slice(0, 10) : '';
  const valor = arredMoney(num(firstTag(total, 'vNF')) || itens.reduce((s, it) => s + it.subtotal, 0));
  return {
    chave,
    numero: Number(firstTag(ide, 'nNF')) || 0,
    serie: Number(firstTag(ide, 'serie')) || 1,
    modelo,
    natureza: String(firstTag(ide, 'natOp') || 'Compra').slice(0, 60),
    data_emissao: dataEmissao,
    emit_cnpj: emitCnpj,
    emit_nome: String(firstTag(emit, 'xNome') || firstTag(emit, 'xFant') || 'Fornecedor').slice(0, 120),
    emit_ie: String(firstTag(emit, 'IE') || '').slice(0, 20),
    emit_uf: emitUf,
    emit_endereco: String(firstTag(firstTag(emit, 'enderEmit') || emit, 'xLgr') || '').slice(0, 160),
    emit_cidade: String(firstTag(firstTag(emit, 'enderEmit') || emit, 'xMun') || '').slice(0, 60),
    dest_cnpj: destCnpj,
    dest_nome: String(firstTag(dest, 'xNome') || '').slice(0, 120),
    valor,
    itens,
    xml: String(raw)
  };
}

function aplicarFator(item, fator) {
  const f = Number(fator);
  const fat = Number.isFinite(f) && f > 0 ? arredQtd(f) : 1;
  const qtdXml = arredQtd(item.quantidade);
  const qtdEstoque = arredQtd(qtdXml * fat);
  const sub = arredMoney(item.subtotal);
  const custo = qtdEstoque > 0 ? arredMoney(sub / qtdEstoque) : arredMoney(item.preco_unitario);
  return {
    fator: fat,
    quantidade_estoque: qtdEstoque,
    preco_custo: custo
  };
}

function precoComMargem(custo, margem) {
  const c = arredMoney(custo);
  const m = Number(margem);
  if (!Number.isFinite(m) || m <= 0) return c;
  return arredMoney(c * (1 + m / 100));
}

function sugerirMatch(item, { depara, porEan, porCodigo, porNome }) {
  const cod = String(item.codigo_fornecedor || '').trim();
  const ean = eanValido(item.ean);
  if (cod && depara && depara[cod]) {
    const m = depara[cod];
    return { produto_id: m.produto_id, fator: Number(m.fator) || 1, origem: 'depara', criar_produto: 0 };
  }
  if (ean && porEan && porEan[ean]) {
    return { produto_id: porEan[ean].id, fator: 1, origem: 'ean', criar_produto: 0 };
  }
  if (cod && porCodigo && porCodigo[cod]) {
    return { produto_id: porCodigo[cod].id, fator: 1, origem: 'codigo', criar_produto: 0 };
  }
  const nome = String(item.descricao || '').trim().toLowerCase();
  if (nome && porNome && porNome[nome]) {
    return { produto_id: porNome[nome].id, fator: 1, origem: 'nome', criar_produto: 0 };
  }
  return { produto_id: null, fator: 1, origem: 'novo', criar_produto: 1 };
}

function montarItensPreview(nota, mapas) {
  return (nota.itens || []).map((it) => {
    const sug = sugerirMatch(it, mapas);
    const conv = aplicarFator(it, sug.fator);
    return {
      ...it,
      produto_id: sug.produto_id,
      origem_match: sug.origem,
      criar_produto: sug.criar_produto,
      fator: conv.fator,
      quantidade_estoque: conv.quantidade_estoque,
      preco_custo: conv.preco_custo,
      margem: 0,
      preco_venda: conv.preco_custo
    };
  });
}

function xmlDemoSefaz({ cnpjDest, razaoDest, emitCnpj, emitNome, chaveBase }) {
  const dest = onlyDigits(cnpjDest).padStart(14, '0');
  const emit = onlyDigits(emitCnpj || '11222333000181').padStart(14, '0');
  const chave = String(chaveBase || '').replace(/\D/g, '').padStart(44, '0').slice(0, 44);
  const hoje = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const dh = `${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}T10:00:00-03:00`;
  const nNF = Number(chave.slice(25, 34)) || 1;
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe${chave}">
      <ide>
        <cUF>24</cUF>
        <mod>55</mod>
        <serie>1</serie>
        <nNF>${nNF}</nNF>
        <dhEmi>${dh}</dhEmi>
        <natOp>Venda de mercadoria</natOp>
        <tpNF>1</tpNF>
      </ide>
      <emit>
        <CNPJ>${emit}</CNPJ>
        <xNome>${emitNome || 'Distribuidora Demo LTDA'}</xNome>
        <IE>123456789</IE>
        <enderEmit><UF>RN</UF><xMun>Natal</xMun><xLgr>Av Fornecedor</xLgr></enderEmit>
      </emit>
      <dest>
        <CNPJ>${dest}</CNPJ>
        <xNome>${razaoDest || 'ERP ISAC'}</xNome>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>CX-COCA-12</cProd>
          <cEAN>7894900011517</cEAN>
          <xProd>COCA-COLA 2L CX 12UN</xProd>
          <NCM>22021000</NCM>
          <CFOP>5102</CFOP>
          <uCom>CX</uCom>
          <qCom>2.0000</qCom>
          <vUnCom>48.00</vUnCom>
          <vProd>96.00</vProd>
        </prod>
        <imposto>
          <ICMS><ICMS00><vICMS>0.00</vICMS></ICMS00></ICMS>
          <PIS><PISAliq><vPIS>0.00</vPIS></PISAliq></PIS>
          <COFINS><COFINSAliq><vCOFINS>0.00</vCOFINS></COFINSAliq></COFINS>
        </imposto>
      </det>
      <det nItem="2">
        <prod>
          <cProd>AGUA-500</cProd>
          <cEAN>7891000100103</cEAN>
          <xProd>AGUA MINERAL 500ML</xProd>
          <NCM>22011000</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>24.0000</qCom>
          <vUnCom>1.10</vUnCom>
          <vProd>26.40</vProd>
        </prod>
        <imposto>
          <ICMS><ICMS00><vICMS>0.00</vICMS></ICMS00></ICMS>
        </imposto>
      </det>
      <total><ICMSTot><vNF>122.40</vNF></ICMSTot></total>
    </infNFe>
  </NFe>
  <protNFe><infProt><chNFe>${chave}</chNFe><nProt>242000000000001</nProt></infProt></protNFe>
</nfeProc>`;
}

function chaveDemo(seq) {
  const n = String(Number(seq) || 1).padStart(9, '0');
  const raw = '24' + '2610' + '11222333000181' + '55' + '001' + n + '1' + '12345678';
  let soma = 0;
  let peso = 2;
  for (let i = raw.length - 1; i >= 0; i--) {
    soma += Number(raw[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto === 0 || resto === 1 ? 0 : 11 - resto;
  return raw + String(dv);
}

module.exports = {
  STATUS,
  arredMoney,
  arredQtd,
  onlyDigits,
  parseXml,
  aplicarFator,
  precoComMargem,
  sugerirMatch,
  montarItensPreview,
  cfopEntrada,
  eanValido,
  xmlDemoSefaz,
  chaveDemo,
  normalizarStatus
};
