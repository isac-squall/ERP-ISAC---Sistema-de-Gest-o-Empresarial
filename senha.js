const crypto = require('crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
const PREFIXO = 'scrypt';

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(senha), salt, SCRYPT.keylen, SCRYPT).toString('hex');
  return `${PREFIXO}$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${hash}`;
}

function comparaSegura(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  const ha = crypto.createHash('sha256').update(ba).digest();
  const hb = crypto.createHash('sha256').update(bb).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verificarSenha(senha, armazenada) {
  const stored = String(armazenada || '');
  if (!stored) return false;
  if (stored.startsWith(`${PREFIXO}$`)) {
    const partes = stored.split('$');
    if (partes.length !== 6) return false;
    const [, n, r, p, salt, hash] = partes;
    try {
      const calc = crypto.scryptSync(String(senha), salt, Buffer.from(hash, 'hex').length, {
        N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem
      });
      return crypto.timingSafeEqual(calc, Buffer.from(hash, 'hex'));
    } catch {
      return false;
    }
  }
  return comparaSegura(senha, stored);
}

function precisaAtualizar(armazenada) {
  return !String(armazenada || '').startsWith(`${PREFIXO}$`);
}

module.exports = { hashSenha, verificarSenha, precisaAtualizar };
