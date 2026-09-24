const crypto = require('crypto');
const forge = require('node-forge');
const { CODIGO_UF } = require('./uf');

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function pad(v, n) {
  return String(v ?? '').replace(/\D/g, '').padStart(n, '0').slice(-n);
}

function xmlEscape(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(v) {
  return (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);
}

function dvChave(chave43) {
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;
  let p = 0;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * pesos[p];
    p = (p + 1) % pesos.length;
  }
  const resto = soma % 11;
  const dv = resto === 0 || resto === 1 ? 0 : 11 - resto;
  return String(dv);
}

function montarChave({ uf, cnpj, serie, numero, tpEmis, cNF, dhEmi }) {
  const cUF = CODIGO_UF[String(uf || 'RN').toUpperCase()] || '24';
  const d = dhEmi instanceof Date ? dhEmi : new Date(dhEmi || Date.now());
  const aamm = String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1, 2);
  const corpo = cUF + aamm + pad(onlyDigits(cnpj), 14) + '65' + pad(serie, 3) + pad(numero, 9) + String(tpEmis || '1') + pad(cNF, 8);
  return corpo + dvChave(corpo);
}

function tMed(forma) {
  const f = String(forma || '').toLowerCase();
  if (f.includes('dinheiro')) return '01';
  if (f.includes('crédito') || f.includes('credito')) return '03';
  if (f.includes('débito') || f.includes('debito')) return '04';
  if (f.includes('pix')) return '17';
  if (f.includes('vale') || f.includes('refeição') || f.includes('refeicao')) return '10';
  return '99';
}

function dhIso(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const hh = pad(Math.floor(Math.abs(off) / 60), 2);
  const mm = pad(Math.abs(off) % 60, 2);
  const p = (n) => pad(n, 2);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${hh}:${mm}`;
}

function digestSha1B64(xml) {
  return crypto.createHash('sha1').update(xml, 'utf8').digest('base64');
}

function assinarInfNFe(infXml, cert) {
  const digest = digestSha1B64(infXml);
  const signedInfo =
    '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">' +
    '<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>' +
    '<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>' +
    '<Reference URI="#' + infXml.match(/Id="([^"]+)"/)[1] + '">' +
    '<Transforms>' +
    '<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>' +
    '<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform>' +
    '</Transforms>' +
    '<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod>' +
    '<DigestValue>' + digest + '</DigestValue>' +
    '</Reference></SignedInfo>';
  const md = forge.md.sha1.create();
  md.update(signedInfo, 'utf8');
  const signatureValue = forge.util.encode64(cert.key.sign(md));
  return (
    '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">' +
    signedInfo.replace(' xmlns="http://www.w3.org/2000/09/xmldsig#"', '') +
    '<SignatureValue>' + signatureValue + '</SignatureValue>' +
    '<KeyInfo><X509Data><X509Certificate>' + cert.x509 + '</X509Certificate></X509Data></KeyInfo>' +
    '</Signature>'
  );
}

function hashQr(params, csc) {
  return crypto.createHash('sha1').update(params + csc, 'utf8').digest('hex').toUpperCase();
}

function qrcodeUrl(cfg, chave, tpAmb, endpoints) {
  const idCsc = pad(onlyDigits(cfg.nfce_csc_id), 6) || onlyDigits(cfg.nfce_csc_id);
  const token = String(cfg.nfce_csc_token || '');
  const base = String(paramsConcat(chave, tpAmb, idCsc));
  const hash = hashQr(base, token);
  const urlBase = endpoints.qr || 'http://www.svrs.rs.gov.br/nfce/qrcode';
  const sep = urlBase.includes('?') ? '&' : '?';
  return `${urlBase}${sep}p=${chave}|2|${tpAmb}|${idCsc}|${hash}`;
}

function paramsConcat(chave, tpAmb, idCsc) {
  return `${chave}|2|${tpAmb}|${idCsc}`;
}

function xmlInfAdic(cfg, ambiente) {
  if (ambiente !== '1') return '<infAdic><infCpl>NFC-e EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL</infCpl></infAdic>';
  const rodape = String(cfg.cupom_rodape || '').replace(/\n/g, ' ').trim();
  if (!rodape) return '';
  return `<infAdic><infCpl>${xmlEscape(rodape.slice(0, 5000))}</infCpl></infAdic>`;
}

function xmlDest(cliente, ambiente) {
  if (ambiente !== '1') {
    return '<dest><CNPJ>99999999000191</CNPJ><xNome>NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL</xNome><indIEDest>9</indIEDest></dest>';
  }
  const doc = onlyDigits(cliente?.cpf_cnpj);
  if (!doc) return '';
  if (doc.length === 14) return `<dest><CNPJ>${doc}</CNPJ><xNome>${xmlEscape((cliente.nome || 'CONSUMIDOR').slice(0, 60))}</xNome><indIEDest>9</indIEDest></dest>`;
  if (doc.length === 11) return `<dest><CPF>${doc}</CPF><xNome>${xmlEscape((cliente.nome || 'CONSUMIDOR').slice(0, 60))}</xNome><indIEDest>9</indIEDest></dest>`;
  return '';
}

function xmlImposto(item, crt) {
  const origem = String(item.origem || '0').slice(0, 1);
  if (String(crt) === '1') {
    return '<imposto><ICMS><ICMSSN102><orig>' + origem + '</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS><PIS><PISNT><CST>49</CST></PISNT></PIS><COFINS><COFINSNT><CST>49</CST></COFINSNT></COFINS></imposto>';
  }
  return '<imposto><ICMS><ICMS00><orig>' + origem + '</orig><CST>00</CST><modBC>0</modBC><vBC>' + money(item.subtotal) +
    '</vBC><pICMS>0.00</pICMS><vICMS>0.00</vICMS></ICMS00></ICMS><PIS><PISAliq><CST>01</CST><vBC>' + money(item.subtotal) +
    '</vBC><pPIS>0.00</pPIS><vPIS>0.00</vPIS></PISAliq></PIS><COFINS><COFINSAliq><CST>01</CST><vBC>' + money(item.subtotal) +
    '</vBC><pCOFINS>0.00</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSAliq></COFINS></imposto>';
}

function xmlItem(item, n, crt) {
  const nome = xmlEscape((item.produto_nome || item.descricao || 'ITEM').slice(0, 120));
  const qtd = money(item.quantidade);
  const vu = money(item.preco_unitario);
  const v = money(item.subtotal);
  const ncm = pad(onlyDigits(item.ncm) || '00000000', 8);
  const cfop = pad(onlyDigits(item.cfop) || '5102', 4);
  const ucom = xmlEscape((item.unidade || 'UN').slice(0, 6) || 'UN');
  const cProd = xmlEscape(String(item.codigo || item.produto_id || n).slice(0, 60));
  const cEan = onlyDigits(item.codigo);
  const ean = cEan.length === 8 || cEan.length === 12 || cEan.length === 13 || cEan.length === 14 ? cEan : 'SEM GTIN';
  return `<det nItem="${n}"><prod><cProd>${cProd}</cProd><cEAN>${ean}</cEAN><xProd>${nome}</xProd><NCM>${ncm}</NCM><CFOP>${cfop}</CFOP><uCom>${ucom}</uCom><qCom>${qtd}</qCom><vUnCom>${vu}</vUnCom><vProd>${v}</vProd><cEANTrib>${ean}</cEANTrib><uTrib>${ucom}</uTrib><qTrib>${qtd}</qTrib><vUnTrib>${vu}</vUnTrib><indTot>1</indTot></prod>${xmlImposto(item, crt)}</det>`;
}

function xmlPag(venda) {
  const tPag = tMed(venda.forma_pagamento);
  const vPag = money(venda.total);
  let extra = '';
  if (tPag === '01' && Number(venda.troco) > 0) extra = `<vTroco>${money(venda.troco)}</vTroco>`;
  return `<pag><detPag><indPag>0</indPag><tPag>${tPag}</tPag><vPag>${vPag}</vPag></detPag>${extra}</pag>`;
}

function montarXml({ cfg, venda, itens, cliente, chave, numero, cNF, dhEmi, cert }) {
  const uf = String(cfg.nfce_uf || 'RN').toUpperCase();
  const cUF = CODIGO_UF[uf] || '24';
  const cnpj = pad(onlyDigits(cfg.nfce_cnpj), 14);
  const serie = Number(cfg.nfce_serie || 1);
  const tpAmb = cfg.nfce_ambiente === 'producao' ? '1' : '2';
  const crt = String(cfg.nfce_crt || '1');
  const dh = dhIso(dhEmi);
  const vNF = money(venda.total);
  const vDesc = money(venda.desconto);
  const vProd = money(itens.reduce((s, i) => s + Number(i.subtotal || 0), 0));
  const id = 'NFe' + chave;
  const inf =
    `<infNFe Id="${id}" versao="4.00">` +
    '<ide>' +
    `<cUF>${cUF}</cUF>` +
    `<cNF>${pad(cNF, 8)}</cNF>` +
    '<natOp>VENDA</natOp>' +
    '<mod>65</mod>' +
    `<serie>${serie}</serie>` +
    `<nNF>${Number(numero)}</nNF>` +
    `<dhEmi>${dh}</dhEmi>` +
    '<tpNF>1</tpNF>' +
    '<idDest>1</idDest>' +
    `<cMunFG>${pad(onlyDigits(cfg.nfce_codigo_municipio) || '2410306', 7)}</cMunFG>` +
    '<tpImp>4</tpImp>' +
    '<tpEmis>1</tpEmis>' +
    `<cDV>${chave.slice(-1)}</cDV>` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    '<finNFe>1</finNFe>' +
    '<indFinal>1</indFinal>' +
    '<indPres>1</indPres>' +
    '<procEmi>0</procEmi>' +
    '<verProc>ERP-ISAC 1.0</verProc>' +
    '</ide>' +
    '<emit>' +
    `<CNPJ>${cnpj}</CNPJ>` +
    `<xNome>${xmlEscape((cfg.nfce_razao_social || cfg.nfce_nome_fantasia || 'EMPRESA').slice(0, 60))}</xNome>` +
    (cfg.nfce_nome_fantasia ? `<xFant>${xmlEscape(String(cfg.nfce_nome_fantasia).slice(0, 60))}</xFant>` : '') +
    '<enderEmit>' +
    `<xLgr>${xmlEscape(cfg.nfce_logradouro || 'RUA')}</xLgr>` +
    `<nro>${xmlEscape(cfg.nfce_numero || 'S/N')}</nro>` +
    `<xBairro>${xmlEscape(cfg.nfce_bairro || 'CENTRO')}</xBairro>` +
    `<cMun>${pad(onlyDigits(cfg.nfce_codigo_municipio) || '2410306', 7)}</cMun>` +
    `<xMun>${xmlEscape(cfg.nfce_municipio || 'SERRINHA')}</xMun>` +
    `<UF>${uf}</UF>` +
    `<CEP>${pad(onlyDigits(cfg.nfce_cep), 8)}</CEP>` +
    `<cPais>1058</cPais><xPais>BRASIL</xPais>` +
    (onlyDigits(cfg.nfce_telefone) ? `<fone>${onlyDigits(cfg.nfce_telefone)}</fone>` : '') +
    '</enderEmit>' +
    `<IE>${onlyDigits(cfg.nfce_ie) || 'ISENTO'}</IE>` +
    `<CRT>${crt}</CRT>` +
    '</emit>' +
    xmlDest(cliente, tpAmb) +
    itens.map((it, i) => xmlItem(it, i + 1, crt)).join('') +
    '<total><ICMSTot>' +
    `<vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP>` +
    `<vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet>` +
    `<vProd>${vProd}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>${vDesc}</vDesc>` +
    `<vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS>` +
    `<vOutro>0.00</vOutro><vNF>${vNF}</vNF></ICMSTot></total>` +
    '<transp><modFrete>9</modFrete></transp>' +
    xmlPag(venda) +
    xmlInfAdic(cfg, tpAmb) +
    '</infNFe>';

  let nfe = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">${inf}</NFe>`;
  if (cert) {
    const signature = assinarInfNFe(inf, cert);
    nfe = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">${inf}${signature}</NFe>`;
  }
  return nfe;
}

function enviNFe(xmlNFe, idLote) {
  return `<?xml version="1.0" encoding="UTF-8"?><enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><idLote>${idLote}</idLote><indSinc>1</indSinc>${xmlNFe}</enviNFe>`;
}

module.exports = {
  onlyDigits, pad, money, montarChave, montarXml, enviNFe, qrcodeUrl, dhIso, tMed, xmlEscape, digestSha1B64
};
