const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const db = require('../database');

const SECRET = 'ERP-ISAC-LICENCA-2026-SCRUNDAI';
const MASTER_PIN = process.env.ERP_LICENCA_MASTER || 'ISAC-LICENCA';
const TRIAL_DIAS = 30;
const PREFIX = 'ERPISAC';

function cfgGet(chave) {
  return db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave)?.valor || '';
}

function cfgSet(chave, valor) {
  db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor')
    .run(chave, String(valor ?? ''));
}

function agora() {
  return new Date();
}

function isoDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function ymd(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function parseYmd(s) {
  const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59);
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
}

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 2500, windowsHide: true }).trim();
  } catch {
    return '';
  }
}

function pickLine(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !/^(serialnumber|uuid|serial number)$/i.test(l))
    .find(Boolean) || '';
}

function hardwareLinux() {
  const bios = readText('/sys/class/dmi/id/board_serial')
    || readText('/sys/class/dmi/id/product_serial')
    || readText('/sys/class/dmi/id/chassis_serial');
  const uuid = readText('/sys/class/dmi/id/product_uuid')
    || readText('/etc/machine-id');
  let disco = '';
  for (const dev of ['sda', 'nvme0n1', 'vda', 'xvda', 'hda']) {
    disco = readText(`/sys/class/block/${dev}/device/serial`)
      || readText(`/sys/block/${dev}/device/serial`);
    if (disco) break;
  }
  if (!disco) disco = pickLine(sh('lsblk', ['-ndo', 'SERIAL'])) || readText('/etc/machine-id');
  return { bios, uuid, disco };
}

function hardwareWindows() {
  const bios = pickLine(sh('wmic', ['bios', 'get', 'serialnumber']))
    || pickLine(sh('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_BIOS).SerialNumber']));
  const uuid = pickLine(sh('wmic', ['csproduct', 'get', 'uuid']))
    || pickLine(sh('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_ComputerSystemProduct).UUID']));
  const disco = pickLine(sh('wmic', ['diskdrive', 'get', 'serialnumber']))
    || pickLine(sh('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_DiskDrive | Select-Object -First 1).SerialNumber']));
  return { bios, uuid, disco };
}

function limparId(v) {
  return String(v || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

let hwCache = null;

function hardware() {
  if (hwCache) return hwCache;
  const raw = process.platform === 'win32' ? hardwareWindows() : hardwareLinux();
  let bios = limparId(raw.bios);
  let uuid = limparId(raw.uuid);
  let disco = limparId(raw.disco);
  if (!bios || bios === 'NONE' || bios === 'TO BE FILLED BY O.E.M.') bios = limparId(os.hostname());
  if (!uuid) uuid = limparId(readText('/etc/machine-id') || os.hostname());
  if (!disco) disco = limparId(os.arch() + '-' + os.hostname());
  hwCache = { bios, uuid, disco };
  return hwCache;
}

function hwHash(ids) {
  const h = crypto.createHash('sha256')
    .update(`${ids.bios}|${ids.uuid}|${ids.disco}|${SECRET}`)
    .digest('hex')
    .toUpperCase();
  return h;
}

function hmac(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('hex').slice(0, 8).toUpperCase();
}

function timingSafe(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function formatarTempo(ms) {
  if (ms <= 0) return '0d 0h 0min';
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / (60 * 24));
  const h = Math.floor((totalMin % (60 * 24)) / 60);
  const m = totalMin % 60;
  return `${d}d ${h}h ${m}min`;
}

function garantirTrial() {
  if (!cfgGet('licenca_trial_inicio')) cfgSet('licenca_trial_inicio', agora().toISOString());
}

function trialFim() {
  garantirTrial();
  const ini = new Date(cfgGet('licenca_trial_inicio'));
  const fim = new Date(ini.getTime());
  fim.setDate(fim.getDate() + TRIAL_DIAS);
  return fim;
}

function parseChave(chave) {
  const raw = String(chave || '').trim().toUpperCase().replace(/\s+/g, '');
  const m = raw.match(/^ERPISAC-(\d{8})-([A-Z0-9]{4})-([A-Z0-9]{8})$/);
  if (!m) return null;
  return { bruto: raw, expiraYmd: m[1], hw4: m[2], sig: m[3], expira: parseYmd(m[1]) };
}

function emitirChave(ids, dias) {
  const n = Math.max(1, Math.min(3660, Number(dias) || 30));
  const exp = agora();
  exp.setDate(exp.getDate() + n);
  const expiraYmd = ymd(exp);
  const hash = hwHash(ids);
  const hw4 = hash.slice(0, 4);
  const sig = hmac(`${expiraYmd}:${hash}`);
  return `${PREFIX}-${expiraYmd}-${hw4}-${sig}`;
}

function emitirMaster(dias) {
  const n = Math.max(1, Math.min(3660, Number(dias) || 30));
  const exp = agora();
  exp.setDate(exp.getDate() + n);
  const expiraYmd = ymd(exp);
  const sig = hmac(`MASTER:${expiraYmd}`);
  return `${PREFIX}-${expiraYmd}-MAST-${sig}`;
}

function validarChave(chave, ids) {
  const p = parseChave(chave);
  if (!p || !p.expira) return { ok: false, motivo: 'Chave invalida' };
  if (p.expira.getTime() < agora().getTime()) return { ok: false, motivo: 'Chave vencida', parsed: p };
  if (p.hw4 === 'MAST') {
    const sig = hmac(`MASTER:${p.expiraYmd}`);
    if (!timingSafe(sig, p.sig)) return { ok: false, motivo: 'Chave invalida' };
    return { ok: true, master: true, parsed: p };
  }
  const hash = hwHash(ids);
  if (hash.slice(0, 4) !== p.hw4) return { ok: false, motivo: 'Chave de outra maquina', parsed: p };
  const sig = hmac(`${p.expiraYmd}:${hash}`);
  if (!timingSafe(sig, p.sig)) return { ok: false, motivo: 'Chave invalida' };
  return { ok: true, master: false, parsed: p };
}

function status() {
  garantirTrial();
  const ids = hardware();
  const chave = cfgGet('licenca_chave');
  const trialEnd = trialFim();
  const now = agora();
  let modo = 'teste';
  let autorizada = false;
  let bloqueada = false;
  let expiraEm = trialEnd;
  let motivo = '';

  if (chave) {
    const v = validarChave(chave, ids);
    if (v.ok) {
      modo = 'ativado';
      autorizada = true;
      expiraEm = v.parsed.expira;
      if (expiraEm.getTime() < now.getTime()) {
        modo = 'vencido';
        autorizada = false;
        bloqueada = true;
        motivo = 'Mensalidade vencida. Ative uma nova chave para continuar.';
      }
    } else if (v.parsed && v.parsed.expira && v.parsed.expira.getTime() < now.getTime()) {
      modo = 'vencido';
      bloqueada = true;
      expiraEm = v.parsed.expira;
      motivo = 'Mensalidade vencida. Ative uma nova chave para continuar.';
    } else if (v.motivo === 'Chave de outra maquina') {
      modo = 'outra-maquina';
      bloqueada = trialEnd.getTime() < now.getTime();
      motivo = 'Chave nao pertence a esta maquina.';
    } else {
      modo = trialEnd.getTime() >= now.getTime() ? 'teste' : 'bloqueado';
      bloqueada = modo === 'bloqueado';
      motivo = v.motivo || 'Chave invalida';
    }
  } else if (trialEnd.getTime() < now.getTime()) {
    modo = 'bloqueado';
    bloqueada = true;
    expiraEm = trialEnd;
    motivo = 'Periodo de teste encerrado. Ative a licenca da mensalidade para continuar.';
  } else {
    modo = 'teste';
    autorizada = false;
    expiraEm = trialEnd;
  }

  const restanteMs = Math.max(0, expiraEm.getTime() - now.getTime());
  return {
    modo,
    status_label: modo === 'ativado' ? 'Ativado' : modo === 'teste' ? 'Teste' : modo === 'vencido' ? 'Vencido' : 'Bloqueado',
    maquina_label: autorizada ? 'Autorizada' : 'Nao autorizada',
    autorizada,
    bloqueada,
    motivo,
    tempo: formatarTempo(restanteMs),
    restante_ms: restanteMs,
    expira_em: expiraEm.toISOString(),
    trial_inicio: cfgGet('licenca_trial_inicio'),
    trial_fim: trialEnd.toISOString(),
    ativada_em: cfgGet('licenca_ativada_em') || '',
    bios: ids.bios,
    uuid: ids.uuid,
    disco: ids.disco,
    hostname: os.hostname(),
    plataforma: process.platform
  };
}

function publico() {
  const s = status();
  return {
    modo: s.modo,
    status_label: s.status_label,
    maquina_label: s.maquina_label,
    autorizada: s.autorizada,
    bloqueada: s.bloqueada,
    motivo: s.motivo,
    tempo: s.tempo,
    restante_ms: s.restante_ms,
    expira_em: s.expira_em,
    bios: s.bios,
    uuid: s.uuid,
    disco: s.disco
  };
}

function ativar(chave) {
  const ids = hardware();
  const v = validarChave(chave, ids);
  if (!v.ok) {
    const err = new Error(v.motivo || 'Chave invalida');
    err.status = 400;
    throw err;
  }
  cfgSet('licenca_chave', v.parsed.bruto);
  cfgSet('licenca_expira', isoDate(v.parsed.expira));
  cfgSet('licenca_hw', hwHash(ids));
  cfgSet('licenca_ativada_em', agora().toISOString());
  return publico();
}

function gerar({ master, bios, uuid, disco, dias, tipo } = {}) {
  if (!timingSafe(String(master || ''), MASTER_PIN)) {
    const err = new Error('Senha mestre invalida');
    err.status = 401;
    throw err;
  }
  const n = Number(dias) || 30;
  if (tipo === 'master') return { chave: emitirMaster(n), dias: n, tipo: 'master' };
  const ids = {
    bios: limparId(bios) || hardware().bios,
    uuid: limparId(uuid) || hardware().uuid,
    disco: limparId(disco) || hardware().disco
  };
  return { chave: emitirChave(ids, n), dias: n, tipo: 'maquina', ...ids };
}

function rotaLivre(req) {
  const p = req.path || '';
  if (req.method === 'GET' && (p === '/api/licenca' || p === '/empresa' || p === '/api/empresa')) return true;
  if (p.startsWith('/api/licenca')) return true;
  if (p === '/api/auth/login') return true;
  return false;
}

module.exports = {
  hardware,
  status,
  publico,
  ativar,
  gerar,
  rotaLivre,
  TRIAL_DIAS,
  MASTER_PIN: undefined
};
