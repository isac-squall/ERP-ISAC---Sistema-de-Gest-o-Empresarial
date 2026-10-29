function crc16(text) {
  let crc = 0xFFFF;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(id, value) {
  const v = String(value ?? '');
  if (v.length > 99) throw new Error('Campo PIX excede 99 caracteres');
  return id + String(v.length).padStart(2, '0') + v;
}

function semAcento(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function ehTelefone(s, digits) {
  if (s.startsWith('+') || s.includes('(')) return digits.length >= 10 && digits.length <= 13;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return true;
  return digits.length === 10 || digits.length === 12 || digits.length === 13;
}

function normalizarChave(chave) {
  const s = String(chave || '').trim();
  if (!s) throw new Error('Informe a chave PIX');
  if (s.includes('@')) return s.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return s.toLowerCase();
  }
  const digits = s.replace(/\D/g, '');
  if (ehTelefone(s, digits)) {
    const n = digits.startsWith('55') ? digits : '55' + digits;
    return '+' + n;
  }
  if (digits.length === 11) return digits;
  if (digits.length === 14) return digits;
  return s;
}

function detectarTipo(chave) {
  const s = String(chave || '').trim();
  if (!s) return '';
  if (s.includes('@')) return 'E-mail';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return 'Aleatoria';
  const digits = s.replace(/\D/g, '');
  if (ehTelefone(s, digits) || s.startsWith('+')) return 'Celular';
  if (digits.length === 11) return 'CPF';
  if (digits.length === 14) return 'CNPJ';
  return 'Chave';
}

function mascarar(chave) {
  const s = String(chave || '').trim();
  if (!s) return '';
  if (s.includes('@')) {
    const [u, d] = s.split('@');
    const user = u.slice(0, 1) + '***';
    return user + '@' + (d || '');
  }
  const digits = s.replace(/\D/g, '');
  if (digits.length === 11) return `***.***.***-${digits.slice(-2)}`;
  if (digits.length === 14) return `**.***.***/****-${digits.slice(-2)}`;
  if (s.startsWith('+') || (digits.length >= 10 && digits.length <= 13)) {
    return `+${digits.slice(0, 4)}****${digits.slice(-2)}`;
  }
  if (s.length <= 4) return s;
  return '*'.repeat(Math.min(12, s.length - 4)) + s.slice(-4);
}

function montarPayload({ chave, nome, cidade, valor, txid, descricao }) {
  const key = normalizarChave(chave);
  const rec = semAcento(nome || 'LOJA').slice(0, 25) || 'LOJA';
  const city = semAcento(cidade || 'CIDADE').slice(0, 15) || 'CIDADE';
  const gui = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  const info = descricao ? gui + tlv('02', String(descricao).slice(0, 50)) : gui;
  let p = tlv('00', '01') + tlv('26', info) + tlv('52', '0000') + tlv('53', '986');
  if (valor != null && valor !== '') {
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0) throw new Error('Valor PIX invalido');
    p += tlv('54', n.toFixed(2));
  }
  p += tlv('58', 'BR') + tlv('59', rec) + tlv('60', city);
  const tx = String(txid || '***').replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***';
  p += tlv('62', tlv('05', tx));
  p += '6304';
  p += crc16(p);
  return p;
}

module.exports = {
  crc16, tlv, semAcento, normalizarChave, detectarTipo, mascarar, montarPayload
};
