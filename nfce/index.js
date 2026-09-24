const db = require('../database');
const { carregarPfx, infoPfx } = require('./certificado');
const { montarChave, montarXml, qrcodeUrl, dhIso, onlyDigits } = require('./xml');
const { endpoints } = require('./uf');
const sefaz = require('./sefaz');

const SECRET_KEYS = ['nfce_certificado_pfx', 'nfce_certificado_senha', 'nfce_csc_token'];

function loadConfig() {
  return Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor]));
}

function sanitizar(cfg) {
  const out = { ...cfg };
  out.nfce_certificado_pfx = cfg.nfce_certificado_pfx ? '1' : '';
  out.nfce_certificado_senha = cfg.nfce_certificado_senha ? '1' : '';
  out.nfce_csc_token = cfg.nfce_csc_token ? '1' : '';
  out.nfce_pronta = pronta(cfg).ok ? '1' : '0';
  out.nfce_pronta_erros = pronta(cfg).erros.join('; ');
  return out;
}

function pronta(cfg) {
  const erros = [];
  if (cfg.nfce_habilitada !== '1') erros.push('NFC-e desabilitada');
  if (onlyDigits(cfg.nfce_cnpj).length !== 14) erros.push('CNPJ do emitente invalido');
  if (!String(cfg.nfce_razao_social || '').trim()) erros.push('Razao social obrigatoria');
  if (!String(cfg.nfce_ie || '').trim()) erros.push('Inscricao estadual obrigatoria');
  if (!String(cfg.nfce_logradouro || '').trim()) erros.push('Endereco do emitente incompleto');
  if (!onlyDigits(cfg.nfce_codigo_municipio)) erros.push('Codigo do municipio (IBGE) obrigatorio');
  if (!onlyDigits(cfg.nfce_csc_id) || !String(cfg.nfce_csc_token || '').trim()) erros.push('CSC (ID + token) obrigatorio');
  if (!cfg.nfce_certificado_pfx) erros.push('Certificado A1 (.pfx) obrigatorio');
  if (!cfg.nfce_certificado_senha) erros.push('Senha do certificado A1 obrigatoria');
  return { ok: erros.length === 0, erros };
}

function proximoNumero(cfg) {
  const serie = Number(cfg.nfce_serie || 1);
  const atual = Number(cfg.nfce_numero_atual || 0);
  return { serie, numero: atual + 1 };
}

function bumpNumero(numero) {
  db.prepare("INSERT INTO config (chave, valor) VALUES ('nfce_numero_atual', ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor")
    .run(String(numero));
}

function itensDaVenda(vendaId) {
  return db.prepare(`
    SELECT vi.*, COALESCE(p.nome, vi.descricao) as produto_nome, p.codigo, p.ncm, p.cfop, p.unidade, p.origem
    FROM venda_itens vi
    LEFT JOIN produtos p ON vi.produto_id = p.id
    WHERE vi.venda_id = ?
  `).all(vendaId);
}

function nfceDaVenda(vendaId) {
  return db.prepare('SELECT * FROM nfce WHERE venda_id = ? ORDER BY id DESC LIMIT 1').get(vendaId);
}

function simularAutorizacao(chave) {
  const nProt = String(Date.now()).slice(-15);
  return {
    autorizado: true,
    simulacao: true,
    cStat: '100',
    motivo: 'Autorizado o uso da NF-e (simulacao local — ative certificado A1 e desmarque simulacao para transmitir a SEFAZ)',
    protocolo: nProt,
    dhRecbto: dhIso(new Date()),
    xml: `<retEnviNFe><cStat>100</cStat><xMotivo>Autorizado (simulacao)</xMotivo><infProt><nProt>${nProt}</nProt><chNFe>${chave}</chNFe></infProt></retEnviNFe>`
  };
}

async function emitir(vendaId, { forcar } = {}) {
  const cfg = loadConfig();
  const venda = db.prepare(`
    SELECT v.*, c.nome as cliente_nome, c.cpf_cnpj, c.endereco, c.cidade, c.estado
    FROM vendas v LEFT JOIN clientes c ON v.cliente_id = c.id WHERE v.id = ?
  `).get(vendaId);
  if (!venda) throw new Error('Venda nao encontrada');
  if (venda.status === 'Cancelada') throw new Error('Nao e possivel emitir NFC-e de venda cancelada');

  const existente = nfceDaVenda(vendaId);
  if (existente && existente.status === 'autorizada' && !forcar) return existente;
  if (existente && existente.status === 'cancelada' && !forcar) {
    throw new Error('NFC-e desta venda ja foi cancelada');
  }

  if (cfg.nfce_habilitada !== '1') throw new Error('Habilite a NFC-e em Configuracoes');
  const check = pronta(cfg);
  const usarSimulacao = cfg.nfce_simulacao === '1';
  if (!usarSimulacao && !check.ok) throw new Error(check.erros[0]);

  const itens = itensDaVenda(vendaId);
  if (!itens.length) throw new Error('Venda sem itens');

  const { serie, numero } = proximoNumero(cfg);
  const dhEmi = new Date();
  const cNF = String(Math.floor(Math.random() * 99999999));
  const chave = montarChave({
    uf: cfg.nfce_uf,
    cnpj: cfg.nfce_cnpj || '00000000000000',
    serie,
    numero,
    tpEmis: '1',
    cNF,
    dhEmi
  });
  const ep = endpoints(cfg.nfce_uf, cfg.nfce_ambiente);

  let cert = null;
  if (!usarSimulacao) {
    cert = carregarPfx(cfg.nfce_certificado_pfx, cfg.nfce_certificado_senha);
  }

  const xmlNFe = montarXml({
    cfg,
    venda,
    itens,
    cliente: { nome: venda.cliente_nome, cpf_cnpj: venda.cpf_cnpj },
    chave,
    numero,
    cNF,
    dhEmi,
    cert
  });

  const qr = qrcodeUrl(cfg, chave, cfg.nfce_ambiente === 'producao' ? '1' : '2', ep);

  let retorno;
  if (usarSimulacao) {
    retorno = simularAutorizacao(chave);
  } else {
    retorno = await sefaz.autorizar(xmlNFe, cfg, cert);
  }

  const status = retorno.autorizado ? 'autorizada' : 'rejeitada';
  bumpNumero(numero);

  const insert = db.prepare(`
    INSERT INTO nfce (venda_id, chave, numero, serie, ambiente, status, protocolo, cstat, motivo, xml, xml_retorno, qrcode, url_consulta, dh_emi, dh_autorizacao)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const info = insert.run(
    vendaId, chave, numero, serie,
    cfg.nfce_ambiente || 'homologacao',
    status,
    retorno.protocolo || null,
    retorno.cStat || null,
    retorno.motivo || null,
    xmlNFe,
    retorno.xml || null,
    qr,
    ep.consultaChave || null,
    dhIso(dhEmi),
    retorno.dhRecbto || null
  );
  db.prepare('UPDATE vendas SET nfce_id = ? WHERE id = ?').run(info.lastInsertRowid, vendaId);
  return db.prepare('SELECT * FROM nfce WHERE id = ?').get(info.lastInsertRowid);
}

function registrarErro(vendaId, mensagem) {
  const cfg = loadConfig();
  const { serie, numero } = proximoNumero(cfg);
  bumpNumero(numero);
  const info = db.prepare(`
    INSERT INTO nfce (venda_id, numero, serie, ambiente, status, motivo)
    VALUES (?,?,?,?,?,?)
  `).run(vendaId, numero, serie, cfg.nfce_ambiente || 'homologacao', 'erro', mensagem);
  db.prepare('UPDATE vendas SET nfce_id = ? WHERE id = ?').run(info.lastInsertRowid, vendaId);
  return db.prepare('SELECT * FROM nfce WHERE id = ?').get(info.lastInsertRowid);
}

async function emitirSeConfigurado(vendaId) {
  const cfg = loadConfig();
  if (cfg.nfce_habilitada !== '1') return null;
  if (cfg.nfce_emitir_automatico !== '1') return null;
  try {
    return await emitir(vendaId);
  } catch (err) {
    return registrarErro(vendaId, err.message);
  }
}

async function emitirAposVenda(vendaId, flag) {
  if (flag === false || flag === 0 || flag === '0') return null;
  if (flag === true || flag === 1 || flag === '1') {
    try {
      return await emitir(vendaId);
    } catch (err) {
      return registrarErro(vendaId, err.message);
    }
  }
  return emitirSeConfigurado(vendaId);
}

async function cancelarNfce(vendaId, justificativa) {
  const cfg = loadConfig();
  const nota = nfceDaVenda(vendaId);
  if (!nota) throw new Error('Venda sem NFC-e');
  if (nota.status === 'cancelada') return nota;
  if (nota.status !== 'autorizada') throw new Error('Somente NFC-e autorizada pode ser cancelada');
  const just = String(justificativa || '').trim();
  if (just.length < 15) throw new Error('Justificativa de cancelamento deve ter no minimo 15 caracteres');

  if (cfg.nfce_simulacao === '1' || !pronta(cfg).ok) {
    db.prepare("UPDATE nfce SET status='cancelada', motivo=? WHERE id=?").run('Cancelada em simulacao: ' + just, nota.id);
    return db.prepare('SELECT * FROM nfce WHERE id = ?').get(nota.id);
  }
  const cert = carregarPfx(cfg.nfce_certificado_pfx, cfg.nfce_certificado_senha);
  const ret = await sefaz.cancelar(nota.chave, nota.protocolo, just, cfg, cert);
  if (!ret.cancelado) throw new Error(ret.motivo || 'SEFAZ rejeitou o cancelamento');
  db.prepare("UPDATE nfce SET status='cancelada', motivo=?, xml_retorno=? WHERE id=?")
    .run(ret.motivo, ret.xml, nota.id);
  return db.prepare('SELECT * FROM nfce WHERE id = ?').get(nota.id);
}

function resumoPublico(nota) {
  if (!nota) return null;
  return {
    id: nota.id,
    venda_id: nota.venda_id,
    chave: nota.chave,
    numero: nota.numero,
    serie: nota.serie,
    ambiente: nota.ambiente,
    status: nota.status,
    protocolo: nota.protocolo,
    cstat: nota.cstat,
    motivo: nota.motivo,
    qrcode: nota.qrcode,
    url_consulta: nota.url_consulta,
    dh_emi: nota.dh_emi,
    dh_autorizacao: nota.dh_autorizacao,
    simulacao: String(nota.motivo || '').toLowerCase().includes('simulacao')
  };
}

function danfeData(vendaId) {
  const cfg = loadConfig();
  const venda = db.prepare(`
    SELECT v.*, c.nome as cliente_nome, c.cpf_cnpj, u.nome as usuario_nome
    FROM vendas v
    LEFT JOIN clientes c ON v.cliente_id = c.id
    LEFT JOIN usuarios u ON v.usuario_id = u.id
    WHERE v.id = ?
  `).get(vendaId);
  if (!venda) return null;
  const itens = itensDaVenda(vendaId);
  const nota = nfceDaVenda(vendaId);
  return { venda, itens, nota: resumoPublico(nota), emitente: sanitizar(cfg), cupom: cfg };
}

module.exports = {
  SECRET_KEYS,
  loadConfig,
  sanitizar,
  pronta,
  infoPfx,
  emitir,
  emitirSeConfigurado,
  emitirAposVenda,
  cancelarNfce,
  nfceDaVenda,
  resumoPublico,
  danfeData
};
