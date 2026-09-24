const https = require('https');
const { URL } = require('url');
const { endpoints } = require('./uf');
const { enviNFe } = require('./xml');

function soapEnvelope(xml, action) {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
    '<soap12:Body>' +
    `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/${action}">${xml}</nfeDadosMsg>` +
    '</soap12:Body></soap12:Envelope>';
}

function tag(xml, name) {
  const re = new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'i');
  const m = String(xml || '').match(re);
  return m ? m[1].trim() : '';
}

function postSoap(urlStr, body, cert, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
      },
      pfx: cert.pfx,
      passphrase: cert.passphrase || '',
      rejectUnauthorized: false,
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const xml = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          reject(new Error(`SEFAZ HTTP ${res.statusCode}: ${xml.slice(0, 240)}`));
          return;
        }
        resolve(xml);
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout ao comunicar com a SEFAZ'));
    });
    req.on('error', (err) => reject(new Error('Falha de conexao com a SEFAZ: ' + err.message)));
    req.write(body);
    req.end();
  });
}

async function autorizar(xmlNFe, cfg, cert) {
  const uf = cfg.nfce_uf || 'RN';
  const amb = cfg.nfce_ambiente === 'producao' ? 'producao' : 'homologacao';
  const ep = endpoints(uf, amb);
  const idLote = String(Date.now()).slice(-15);
  const dados = enviNFe(xmlNFe, idLote);
  const body = soapEnvelope(dados, 'NFeAutorizacao4');
  const retorno = await postSoap(ep.autorizacao, body, { pfx: cert.pfx, passphrase: cfg.nfce_certificado_senha });
  const cStat = tag(retorno, 'cStat');
  const xMotivo = tag(retorno, 'xMotivo');
  const nProt = tag(retorno, 'nProt');
  const protCStat = tag(tag(retorno, 'infProt') || retorno, 'cStat') || cStat;
  const protMotivo = tag(tag(retorno, 'infProt') || retorno, 'xMotivo') || xMotivo;
  const dhRecbto = tag(retorno, 'dhRecbto');
  const autorizado = protCStat === '100' || protCStat === '150';
  return {
    xml: retorno,
    cStat: protCStat,
    motivo: protMotivo || xMotivo || 'Sem retorno da SEFAZ',
    protocolo: nProt,
    dhRecbto,
    autorizado
  };
}

async function cancelar(chave, protocolo, justificativa, cfg, cert) {
  const uf = cfg.nfce_uf || 'RN';
  const amb = cfg.nfce_ambiente === 'producao' ? 'producao' : 'homologacao';
  const ep = endpoints(uf, amb);
  const tpAmb = amb === 'producao' ? '1' : '2';
  const dh = new Date().toISOString().replace(/\.\d+Z$/, '-03:00');
  const nSeq = '1';
  const xml =
    `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote>` +
    `<evento versao="1.00"><infEvento Id="ID110111${chave}${nSeq.padStart(2, '0')}">` +
    `<cOrgao>${require('./uf').CODIGO_UF[String(uf).toUpperCase()] || '24'}</cOrgao>` +
    `<tpAmb>${tpAmb}</tpAmb><CNPJ>${String(cfg.nfce_cnpj || '').replace(/\D/g, '').padStart(14, '0')}</CNPJ>` +
    `<chNFe>${chave}</chNFe><dhEvento>${dh}</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>${nSeq}</nSeqEvento>` +
    `<verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento>` +
    `<nProt>${protocolo}</nProt><xJust>${justificativa.slice(0, 255)}</xJust></detEvento></infEvento></evento></envEvento>`;
  const body = soapEnvelope(xml, 'NFeRecepcaoEvento4');
  const retorno = await postSoap(ep.evento, body, { pfx: cert.pfx, passphrase: cfg.nfce_certificado_senha });
  const cStat = tag(tag(retorno, 'infEvento') || retorno, 'cStat') || tag(retorno, 'cStat');
  const xMotivo = tag(tag(retorno, 'infEvento') || retorno, 'xMotivo') || tag(retorno, 'xMotivo');
  return { xml: retorno, cStat, motivo: xMotivo, cancelado: cStat === '135' || cStat === '155' };
}

module.exports = { autorizar, cancelar, tag };
