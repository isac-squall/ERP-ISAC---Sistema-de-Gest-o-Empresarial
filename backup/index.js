const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Database = require('better-sqlite3');
const db = require('../database');

const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'erp.db');
const BACKUP_DIR = path.join(ROOT, 'backups');
const APP_VERSION = require('../package.json').version || '1.0.0';
const RELEASES_URL = 'https://api.github.com/repos/isac-squall/ERP-ISAC---Sistema-de-Gest-o-Empresarial/releases/latest';

function cfgGet(chave) {
  return db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave)?.valor || '';
}

function cfgSet(chave, valor) {
  db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor')
    .run(chave, String(valor ?? ''));
}

function agora() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function ensureTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipo TEXT DEFAULT 'completo',
      arquivo TEXT NOT NULL,
      tamanho INTEGER DEFAULT 0,
      criado_em TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
}

function crc32(buf) {
  let c = 0xffffffff;
  const t = crc32.table || (crc32.table = (() => {
    const tab = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let x = n;
      for (let k = 0; k < 8; k++) x = (x & 1) ? (0xedb88320 ^ (x >>> 1)) : (x >>> 1);
      tab[n] = x >>> 0;
    }
    return tab;
  })());
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    const crc = crc32(data);
    const localHead = Buffer.alloc(30);
    localHead.writeUInt32LE(0x04034b50, 0);
    localHead.writeUInt16LE(20, 4);
    localHead.writeUInt16LE(0, 6);
    localHead.writeUInt16LE(0, 8);
    localHead.writeUInt16LE(0, 10);
    localHead.writeUInt16LE(0, 12);
    localHead.writeUInt32LE(crc, 14);
    localHead.writeUInt32LE(data.length, 18);
    localHead.writeUInt32LE(data.length, 22);
    localHead.writeUInt16LE(name.length, 26);
    localHead.writeUInt16LE(0, 28);
    const localBuf = Buffer.concat([localHead, name, data]);
    local.push(localBuf);
    const cent = Buffer.alloc(46);
    cent.writeUInt32LE(0x02014b50, 0);
    cent.writeUInt16LE(20, 4);
    cent.writeUInt16LE(20, 6);
    cent.writeUInt32LE(crc, 16);
    cent.writeUInt32LE(data.length, 20);
    cent.writeUInt32LE(data.length, 24);
    cent.writeUInt16LE(name.length, 28);
    cent.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cent, name]));
    offset += localBuf.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuf, end]);
}

function unzipBuffers(buf) {
  const files = {};
  let i = 0;
  const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  while (i + 30 <= data.length) {
    const sig = data.readUInt32LE(i);
    if (sig !== 0x04034b50) break;
    const method = data.readUInt16LE(i + 8);
    const flags = data.readUInt16LE(i + 6);
    let comp = data.readUInt32LE(i + 18);
    const nlen = data.readUInt16LE(i + 26);
    const elen = data.readUInt16LE(i + 28);
    const name = data.slice(i + 30, i + 30 + nlen).toString('utf8');
    let start = i + 30 + nlen + elen;
    if (flags & 0x08) {
      const packedGuess = data.slice(start);
      const next = packedGuess.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      const localNext = packedGuess.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 4);
      const cut = [next, localNext].filter(n => n >= 0).sort((a, b) => a - b)[0];
      comp = cut != null ? cut : packedGuess.length;
    }
    const packed = data.slice(start, start + comp);
    let out = packed;
    if (method === 8) out = zlib.inflateRawSync(packed);
    files[name.replace(/\\/g, '/')] = out;
    i = start + packed.length;
  }
  return files;
}

function isSqlite(buf) {
  return Buffer.isBuffer(buf) && buf.length > 16 && buf.slice(0, 16).toString('utf8') === 'SQLite format 3\0';
}

async function snapshotDb() {
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
  const tmp = path.join(ROOT, `.erp-backup-${Date.now()}.db`);
  if (typeof db.backup === 'function') {
    await db.backup(tmp);
  } else {
    fs.copyFileSync(DB_PATH, tmp);
  }
  const data = fs.readFileSync(tmp);
  try { fs.unlinkSync(tmp); } catch {}
  return data;
}

function pathOf(arquivo) {
  const base = path.basename(String(arquivo || ''));
  if (!base || base !== String(arquivo) && path.basename(arquivo) !== base) {
    throw new Error('Arquivo de backup invalido');
  }
  return path.join(BACKUP_DIR, base);
}

function obter(id) {
  ensureTable();
  const row = db.prepare('SELECT * FROM backups WHERE id = ?').get(id);
  if (!row) return null;
  const full = pathOf(row.arquivo);
  if (!fs.existsSync(full)) return { ...row, existe: false, path: full };
  return { ...row, existe: true, path: full, mime: row.tipo === 'banco' ? 'application/x-sqlite3' : 'application/zip' };
}

function syncFromDisk() {
  ensureDir();
  ensureTable();
  const rows = db.prepare('SELECT * FROM backups').all();
  const del = db.prepare('DELETE FROM backups WHERE id = ?');
  for (const row of rows) {
    const full = path.join(BACKUP_DIR, path.basename(row.arquivo));
    if (!fs.existsSync(full)) del.run(row.id);
  }
}

function listar({ search = '', page = 1, limit = 15 } = {}) {
  syncFromDisk();
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.max(1, parseInt(limit, 10) || 15);
  const params = [];
  let where = '';
  if (search) {
    where = ' WHERE nome LIKE ? OR tipo LIKE ?';
    const s = `%${search}%`;
    params.push(s, s);
  }
  const total = db.prepare(`SELECT COUNT(*) as total FROM backups${where}`).get(...params)?.total || 0;
  const data = db.prepare(`SELECT id, nome, tipo, arquivo, tamanho, criado_em FROM backups${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, l, (p - 1) * l);
  return { data, total, page: p, limit: l, totalPages: Math.ceil(total / l) || 1 };
}

async function criar(tipo) {
  ensureDir();
  ensureTable();
  const kind = tipo === 'banco' ? 'banco' : 'completo';
  const dump = await snapshotDb();
  const criado = agora();
  let nome;
  let body;
  if (kind === 'banco') {
    nome = `erp-isac-banco-${stamp()}.db`;
    body = dump;
  } else {
    nome = `erp-isac-completo-${stamp()}.zip`;
    const manifest = Buffer.from(JSON.stringify({
      app: 'ERP ISAC',
      versao: APP_VERSION,
      tipo: 'completo',
      criado_em: criado,
      arquivo: 'erp.db'
    }, null, 2));
    body = zipStore([
      { name: 'erp.db', data: dump },
      { name: 'manifest.json', data: manifest }
    ]);
  }
  const arquivo = nome;
  fs.writeFileSync(path.join(BACKUP_DIR, arquivo), body);
  const info = db.prepare('INSERT INTO backups (nome, tipo, arquivo, tamanho, criado_em) VALUES (?,?,?,?,?)')
    .run(nome, kind, arquivo, body.length, criado);
  cfgSet('backup_ultimo_em', criado);
  cfgSet('backup_ultimo_tipo', kind);
  return {
    id: Number(info.lastInsertRowid),
    nome,
    tipo: kind,
    arquivo,
    tamanho: body.length,
    criado_em: criado
  };
}

function extrairDb(buf, nomeArquivo) {
  const name = String(nomeArquivo || '').toLowerCase();
  if (isSqlite(buf)) return buf;
  const zip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  if (zip || name.endsWith('.zip')) {
    const files = unzipBuffers(buf);
    const dbFile = files['erp.db']
      || Object.entries(files).find(([k]) => k.toLowerCase().endsWith('.db'))?.[1];
    if (!dbFile) throw new Error('ZIP sem arquivo erp.db');
    if (!isSqlite(dbFile)) throw new Error('Arquivo do ZIP nao e um banco SQLite');
    return dbFile;
  }
  throw new Error('Envie um arquivo .zip ou .db');
}

async function restaurar(buf, nomeArquivo) {
  const dump = extrairDb(buf, nomeArquivo);
  const tmp = path.join(ROOT, `.erp-restore-${Date.now()}.db`);
  fs.writeFileSync(tmp, dump);
  let src;
  try {
    src = new Database(tmp, { fileMustExist: true });
    src.pragma('quick_check');
    if (typeof src.backup === 'function') {
      await src.backup(DB_PATH);
    } else {
      try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
      fs.copyFileSync(tmp, DB_PATH);
    }
    src.close();
    src = null;
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
    ensureTable();
    cfgSet('backup_restaurado_em', agora());
  } finally {
    try { if (src) src.close(); } catch {}
    try { fs.unlinkSync(tmp); } catch {}
  }
}

async function restaurarPorId(id) {
  const item = obter(id);
  if (!item) throw new Error('Backup nao encontrado');
  if (!item.existe) throw new Error('Arquivo do backup nao esta no disco');
  const buf = fs.readFileSync(item.path);
  await restaurar(buf, item.nome);
  return item;
}

function excluir(id) {
  const item = obter(id);
  if (!item) throw new Error('Backup nao encontrado');
  const full = item.path;
  if (fs.existsSync(full)) {
    const dest = path.join(BACKUP_DIR, `.removed-${Date.now()}-${path.basename(full)}`);
    try { fs.renameSync(full, dest); } catch {
      fs.writeFileSync(full, Buffer.alloc(0));
    }
  }
  db.prepare('DELETE FROM backups WHERE id = ?').run(id);
}

function status() {
  ensureTable();
  const ultimo = cfgGet('backup_ultimo_em');
  const restaurado = cfgGet('backup_restaurado_em');
  const verificada = cfgGet('app_versao_verificada_em');
  const instalada = cfgGet('app_versao_instalada');
  const qtd = db.prepare('SELECT COUNT(*) as c FROM backups').get()?.c || 0;
  return {
    protegido: true,
    quantidade: qtd,
    ultimo_backup: ultimo || '',
    ultimo_tipo: cfgGet('backup_ultimo_tipo') || '',
    restaurado_em: restaurado || '',
    versao: APP_VERSION,
    versao_instalada: instalada || '',
    versao_verificada_em: verificada || '',
    mensagem: cfgGet('app_versao_mensagem') || ''
  };
}

function parseVer(v) {
  return String(v || '0').replace(/^v/i, '').split(/[^\d]+/).map(n => parseInt(n, 10) || 0);
}

function versaoMaior(a, b) {
  const x = parseVer(a);
  const y = parseVer(b);
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) {
    if ((x[i] || 0) > (y[i] || 0)) return true;
    if ((x[i] || 0) < (y[i] || 0)) return false;
  }
  return false;
}

function verificarAtualizacao() {
  const quando = agora();
  cfgSet('app_versao_verificada_em', quando);
  const guardar = (r) => {
    cfgSet('app_versao_mensagem', r.mensagem || '');
    if (r.recente) cfgSet('app_versao_recente', r.recente);
    return r;
  };
  return new Promise((resolve) => {
    const url = new URL(RELEASES_URL);
    const lib = url.protocol === 'https:' ? require('https') : require('http');
    const req = lib.get({
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: { 'User-Agent': 'ERP-ISAC', Accept: 'application/vnd.github+json' },
      timeout: 8000
    }, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; if (raw.length > 2e6) res.destroy(); });
      res.on('end', () => {
        if (res.statusCode === 404) {
          return resolve(guardar({
            atual: APP_VERSION,
            recente: APP_VERSION,
            tem_nova: false,
            mensagem: 'O aplicativo ja esta na versao mais recente.',
            verificado_em: quando
          }));
        }
        if (res.statusCode !== 200) {
          return resolve(guardar({
            atual: APP_VERSION,
            recente: APP_VERSION,
            tem_nova: false,
            mensagem: 'Nao foi possivel consultar atualizacoes agora.',
            verificado_em: quando
          }));
        }
        try {
          const data = JSON.parse(raw);
          const tag = data.tag_name || data.name || APP_VERSION;
          const tem = versaoMaior(tag, APP_VERSION);
          resolve(guardar({
            atual: APP_VERSION,
            recente: String(tag).replace(/^v/i, ''),
            tem_nova: tem,
            url: data.html_url || '',
            mensagem: tem
              ? `Nova versao ${tag} disponivel.`
              : 'O aplicativo ja esta na versao mais recente.',
            verificado_em: quando
          }));
        } catch {
          resolve(guardar({
            atual: APP_VERSION,
            recente: APP_VERSION,
            tem_nova: false,
            mensagem: 'Nao foi possivel consultar atualizacoes agora.',
            verificado_em: quando
          }));
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(guardar({
      atual: APP_VERSION, recente: APP_VERSION, tem_nova: false,
      mensagem: 'Tempo esgotado ao buscar atualizacoes.', verificado_em: quando
    })); });
    req.on('error', () => resolve(guardar({
      atual: APP_VERSION, recente: APP_VERSION, tem_nova: false,
      mensagem: 'Nao foi possivel consultar atualizacoes agora.', verificado_em: quando
    })));
  });
}

ensureDir();
ensureTable();

module.exports = {
  criar, restaurar, restaurarPorId, excluir, listar, obter, status, verificarAtualizacao, APP_VERSION, BACKUP_DIR
};
