function fail(msg, status) {
  const err = new Error(msg);
  err.status = status || 400;
  throw err;
}

const MODELOS = { nfe: '55', nfse: 'NFS-e', nfce: '65' };
const STATUS = ['Rascunho', 'Autorizada', 'Cancelada', 'Rejeitada'];
const PAGINAS = ['nfe', 'nfse'];

function arredMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function normalizarModelo(modelo) {
  const s = String(modelo || '').trim().toLowerCase();
  if (s === '55' || s === 'nfe' || s === 'nf-e') return '55';
  if (s === 'nfse' || s === 'nfs-e' || s === 'nfs') return 'NFS-e';
  if (s === '65' || s === 'nfce' || s === 'nfc-e') return '65';
  return '55';
}

function normalizarStatus(status) {
  const s = String(status || '').trim();
  if (STATUS.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('autoriz')) return 'Autorizada';
  if (t.includes('cancel')) return 'Cancelada';
  if (t.includes('rejeit')) return 'Rejeitada';
  return 'Rascunho';
}

function classeStatus(status) {
  const s = normalizarStatus(status);
  if (s === 'Autorizada') return 'compra-recebido';
  if (s === 'Cancelada') return 'compra-recusado';
  if (s === 'Rejeitada') return 'compra-aguardando';
  return 'aberta';
}

function cfopPadrao(ufEmit, ufDest, tipo) {
  const e = String(ufEmit || '').toUpperCase();
  const d = String(ufDest || e).toUpperCase();
  if (String(tipo) === 'servico' || String(tipo) === 'NFS-e') return '5933';
  return e && d && e !== d ? '6102' : '5102';
}

function aliquotaSimples(crt) {
  const n = Number(crt) || 1;
  if (n === 1) return 0;
  if (n === 2) return 0;
  return 0;
}

function calcularImpostos({ itens, crt, ufEmit, ufDest, modelo }) {
  const lista = Array.isArray(itens) ? itens : [];
  let base = 0;
  const detalhe = [];
  const mod = normalizarModelo(modelo);
  for (const it of lista) {
    const qtd = Number(it.quantidade) || 0;
    const preco = Number(it.preco_unitario != null ? it.preco_unitario : it.preco) || 0;
    const sub = arredMoney(qtd * preco);
    base = arredMoney(base + sub);
    detalhe.push({
      descricao: String(it.descricao || it.nome || 'Item').slice(0, 120),
      ncm: String(it.ncm || '00000000').replace(/\D/g, '').padStart(8, '0').slice(0, 8),
      cfop: String(it.cfop || cfopPadrao(ufEmit, ufDest, mod === 'NFS-e' ? 'servico' : 'produto')),
      quantidade: qtd,
      preco_unitario: arredMoney(preco),
      subtotal: sub
    });
  }
  const aliq = aliquotaSimples(crt);
  const imposto = arredMoney(base * (aliq / 100));
  return {
    modelo: mod,
    total_produtos: base,
    total_servicos: mod === 'NFS-e' ? base : 0,
    base_calculo: base,
    aliquota: aliq,
    valor_imposto: imposto,
    total_nota: base,
    itens: detalhe,
    crt: Number(crt) || 1,
    observacao: Number(crt) === 1
      ? 'Documento emitido por ME ou EPP optante pelo Simples Nacional.'
      : ''
  };
}

function validarDestinatario(body, modelo) {
  const nome = String(body.destinatario_nome || body.cliente_nome || '').trim();
  if (!nome) fail('Destinatario obrigatorio');
  const doc = onlyDigits(body.destinatario_doc || body.cpf_cnpj);
  const mod = normalizarModelo(modelo);
  if (mod === '55' && doc.length !== 11 && doc.length !== 14) {
    fail('NF-e exige CPF ou CNPJ do destinatario');
  }
  return {
    destinatario_nome: nome.slice(0, 120),
    destinatario_doc: doc,
    destinatario_ie: String(body.destinatario_ie || '').trim().slice(0, 20),
    destinatario_endereco: String(body.destinatario_endereco || body.endereco || '').trim().slice(0, 160),
    destinatario_cidade: String(body.destinatario_cidade || body.cidade || '').trim().slice(0, 60),
    destinatario_uf: String(body.destinatario_uf || body.estado || '').trim().toUpperCase().slice(0, 2),
    destinatario_cep: onlyDigits(body.destinatario_cep || body.cep).slice(0, 8)
  };
}

function payloadNota(body) {
  const modelo = normalizarModelo(body.modelo);
  const dest = validarDestinatario(body, modelo);
  const itens = Array.isArray(body.itens) ? body.itens : [];
  if (!itens.length) fail('Informe ao menos um item');
  const calc = calcularImpostos({
    itens,
    crt: body.crt,
    ufEmit: body.uf_emit,
    ufDest: dest.destinatario_uf,
    modelo
  });
  const vendaId = body.venda_id ? Number(body.venda_id) : null;
  const osId = body.os_id ? Number(body.os_id) : null;
  const contratoId = body.contrato_id ? Number(body.contrato_id) : null;
  return {
    modelo,
    natureza: String(body.natureza || (modelo === 'NFS-e' ? 'Prestacao de servicos' : 'Venda de mercadoria')).slice(0, 60),
    serie: Math.max(1, Number(body.serie) || 1),
    venda_id: Number.isInteger(vendaId) && vendaId > 0 ? vendaId : null,
    os_id: Number.isInteger(osId) && osId > 0 ? osId : null,
    contrato_id: Number.isInteger(contratoId) && contratoId > 0 ? contratoId : null,
    cliente_id: body.cliente_id ? Number(body.cliente_id) : null,
    ...dest,
    total: calc.total_nota,
    xml: '',
    status: 'Rascunho',
    calc
  };
}

function chaveAcesso({ cuf, aamm, cnpj, modelo, serie, numero, tipoEmi, cnf }) {
  const raw = [
    String(cuf || '24').padStart(2, '0'),
    String(aamm || '').padStart(4, '0'),
    onlyDigits(cnpj).padStart(14, '0'),
    String(modelo === 'NFS-e' ? '99' : modelo).padStart(2, '0'),
    String(serie || 1).padStart(3, '0'),
    String(numero || 1).padStart(9, '0'),
    String(tipoEmi || 1),
    String(cnf || 1).padStart(8, '0')
  ].join('');
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

function xmlNfeSimulado(nota, cfg) {
  const chave = nota.chave || '';
  const dest = onlyDigits(nota.destinatario_doc);
  const itens = (nota.calc && nota.calc.itens) || [];
  const dets = itens.map((it, i) => `
    <det nItem="${i + 1}">
      <prod>
        <cProd>${i + 1}</cProd>
        <xProd>${escXml(it.descricao)}</xProd>
        <NCM>${it.ncm}</NCM>
        <CFOP>${it.cfop}</CFOP>
        <qCom>${it.quantidade}</qCom>
        <vUnCom>${it.preco_unitario.toFixed(2)}</vUnCom>
        <vProd>${it.subtotal.toFixed(2)}</vProd>
      </prod>
    </det>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="NFe${chave}">
    <ide>
      <cUF>${cfg.cuf || '24'}</cUF>
      <mod>${nota.modelo === 'NFS-e' ? '99' : nota.modelo}</mod>
      <serie>${nota.serie}</serie>
      <nNF>${nota.numero}</nNF>
      <natOp>${escXml(nota.natureza)}</natOp>
      <tpAmb>${cfg.ambiente === 'producao' ? 1 : 2}</tpAmb>
    </ide>
    <emit>
      <CNPJ>${onlyDigits(cfg.cnpj).padStart(14, '0')}</CNPJ>
      <xNome>${escXml(cfg.razao || 'Emitente')}</xNome>
      <IE>${escXml(cfg.ie || '')}</IE>
    </emit>
    <dest>
      ${dest.length === 14 ? `<CNPJ>${dest}</CNPJ>` : `<CPF>${dest.padStart(11, '0')}</CPF>`}
      <xNome>${escXml(nota.destinatario_nome)}</xNome>
    </dest>
    ${dets}
    <total><ICMSTot><vNF>${Number(nota.total || 0).toFixed(2)}</vNF></ICMSTot></total>
  </infNFe>
</NFe>`;
}

function xmlNfseSimulado(nota, cfg) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFSe>
  <InfNfse>
    <Numero>${nota.numero}</Numero>
    <CodigoVerificacao>${nota.protocolo || ''}</CodigoVerificacao>
    <Prestador>
      <Cnpj>${onlyDigits(cfg.cnpj).padStart(14, '0')}</Cnpj>
      <RazaoSocial>${escXml(cfg.razao || 'Prestador')}</RazaoSocial>
    </Prestador>
    <Tomador>
      <Documento>${onlyDigits(nota.destinatario_doc)}</Documento>
      <RazaoSocial>${escXml(nota.destinatario_nome)}</RazaoSocial>
    </Tomador>
    <Servico>
      <Discriminacao>${escXml(nota.natureza)}</Discriminacao>
      <ValorServicos>${Number(nota.total || 0).toFixed(2)}</ValorServicos>
    </Servico>
  </InfNfse>
</NFSe>`;
}

function escXml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  }[c]));
}

function simularAutorizacao(nota, cfg) {
  const agora = new Date();
  const aamm = `${String(agora.getFullYear()).slice(2)}${String(agora.getMonth() + 1).padStart(2, '0')}`;
  const cnf = String(Date.now()).slice(-8);
  const chave = chaveAcesso({
    cuf: cfg.cuf || '24',
    aamm,
    cnpj: cfg.cnpj,
    modelo: nota.modelo,
    serie: nota.serie,
    numero: nota.numero,
    cnf
  });
  const protocolo = String(Date.now()).slice(-15);
  const xml = nota.modelo === 'NFS-e'
    ? xmlNfseSimulado({ ...nota, chave, protocolo }, cfg)
    : xmlNfeSimulado({ ...nota, chave, protocolo }, cfg);
  return {
    autorizado: true,
    simulacao: true,
    status: 'Autorizada',
    chave,
    protocolo,
    xml,
    cstat: '100',
    motivo: nota.modelo === 'NFS-e'
      ? 'NFS-e autorizada em simulacao local (sem prefeitura)'
      : 'NF-e autorizada em simulacao local (sem SEFAZ)'
  };
}

function transicaoStatus(de, para) {
  const d = normalizarStatus(de);
  const p = normalizarStatus(para);
  if (d === p) return p;
  if (d === 'Cancelada') fail('Nota cancelada nao muda de status');
  if (d === 'Autorizada' && p !== 'Cancelada') fail('Nota autorizada so cancela');
  if (d === 'Rascunho' && (p === 'Autorizada' || p === 'Rejeitada')) return p;
  if (d === 'Rejeitada' && p === 'Rascunho') return p;
  fail(`Nao e possivel ir de ${d} para ${p}`);
}

function resumirNotas(rows) {
  const r = { total: 0, autorizadas: 0, rascunhos: 0, canceladas: 0, valor: 0 };
  for (const n of rows || []) {
    r.total += 1;
    const s = normalizarStatus(n.status);
    if (s === 'Autorizada') {
      r.autorizadas += 1;
      r.valor = arredMoney(r.valor + (Number(n.total) || 0));
    } else if (s === 'Rascunho') r.rascunhos += 1;
    else if (s === 'Cancelada') r.canceladas += 1;
  }
  return r;
}

module.exports = {
  PAGINAS,
  MODELOS,
  STATUS,
  fail,
  arredMoney,
  onlyDigits,
  normalizarModelo,
  normalizarStatus,
  classeStatus,
  cfopPadrao,
  calcularImpostos,
  validarDestinatario,
  payloadNota,
  chaveAcesso,
  xmlNfeSimulado,
  xmlNfseSimulado,
  simularAutorizacao,
  transicaoStatus,
  resumirNotas
};
