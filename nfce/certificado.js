const forge = require('node-forge');

function pfxBuffer(valor) {
  if (!valor) return null;
  const raw = String(valor).replace(/^data:.*?;base64,/, '').replace(/\s/g, '');
  try {
    return Buffer.from(raw, 'base64');
  } catch {
    return null;
  }
}

function carregarPfx(pfxB64, senha) {
  const buf = pfxBuffer(pfxB64);
  if (!buf || !buf.length) throw new Error('Certificado A1 nao informado');
  if (!senha) throw new Error('Senha do certificado A1 nao informada');
  const asn1 = forge.asn1.fromDer(buf.toString('binary'));
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  } catch {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha);
  }
  const bagsKey = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const bagsKey2 = p12.getBags({ bagType: forge.pki.oids.keyBag });
  const bagsCert = p12.getBags({ bagType: forge.pki.oids.certBag });
  const keyBag = (bagsKey[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0]
    || (bagsKey2[forge.pki.oids.keyBag] || [])[0];
  const certBag = (bagsCert[forge.pki.oids.certBag] || []).find(b => b.cert) || (bagsCert[forge.pki.oids.certBag] || [])[0];
  if (!keyBag?.key || !certBag?.cert) throw new Error('Nao foi possivel ler chave ou certificado do PFX');
  const cert = certBag.cert;
  const key = keyBag.key;
  const validade = cert.validity.notAfter;
  const cn = (cert.subject.getField('CN') || {}).value || '';
  const now = new Date();
  if (validade && validade < now) throw new Error('Certificado A1 vencido em ' + validade.toISOString().slice(0, 10));
  return {
    cert,
    key,
    pemCert: forge.pki.certificateToPem(cert),
    pemKey: forge.pki.privateKeyToPem(key),
    x509: forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()).replace(/\r?\n/g, ''),
    nome: cn,
    validade: validade ? validade.toISOString().slice(0, 10) : '',
    pfx: buf
  };
}

function infoPfx(pfxB64, senha) {
  const c = carregarPfx(pfxB64, senha);
  return { nome: c.nome, validade: c.validade };
}

module.exports = { carregarPfx, infoPfx, pfxBuffer };
