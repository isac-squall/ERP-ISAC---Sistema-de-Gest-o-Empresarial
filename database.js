const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'erp.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    cargo TEXT DEFAULT 'Administrador',
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cpf_cnpj TEXT,
    telefone TEXT,
    email TEXT,
    endereco TEXT,
    cidade TEXT,
    estado TEXT,
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS fornecedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cnpj TEXT,
    telefone TEXT,
    email TEXT,
    endereco TEXT,
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    codigo TEXT,
    descricao TEXT,
    preco REAL DEFAULT 0,
    estoque INTEGER DEFAULT 0,
    estoque_minimo INTEGER DEFAULT 0,
    categoria TEXT,
    fornecedor_id INTEGER,
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
  );

  CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT DEFAULT 'Aberta',
    cliente_id INTEGER,
    equipamento TEXT,
    solicitacao TEXT,
    valor_previsto REAL DEFAULT 0,
    data_prevista TEXT,
    data_final TEXT,
    data_entrega TEXT,
    observacoes TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  );

  CREATE TABLE IF NOT EXISTS caixa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    descricao TEXT,
    valor REAL NOT NULL,
    forma_pagamento TEXT,
    usuario_id INTEGER,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS caixa_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    aberto INTEGER DEFAULT 0,
    valor_inicial REAL DEFAULT 0,
    aberto_em TEXT,
    fechado_em TEXT,
    usuario_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    total REAL DEFAULT 0,
    desconto REAL DEFAULT 0,
    forma_pagamento TEXT,
    status TEXT DEFAULT 'Concluída',
    usuario_id INTEGER,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS venda_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER NOT NULL,
    produto_id INTEGER,
    quantidade INTEGER DEFAULT 1,
    preco_unitario REAL DEFAULT 0,
    subtotal REAL DEFAULT 0,
    FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
  );

  CREATE TABLE IF NOT EXISTS financeiro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    categoria TEXT,
    descricao TEXT,
    valor REAL NOT NULL,
    data_vencimento TEXT,
    data_pagamento TEXT,
    status TEXT DEFAULT 'Pendente',
    cliente_id INTEGER,
    fornecedor_id INTEGER,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
  );

  CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT
  );
`);

function ensureColumn(table, column, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}

ensureColumn('vendas', 'valor_recebido', 'REAL DEFAULT 0');
ensureColumn('vendas', 'troco', 'REAL DEFAULT 0');
ensureColumn('vendas', 'parcelas', 'INTEGER DEFAULT 1');
ensureColumn('vendas', 'taxa_cartao', 'REAL DEFAULT 0');

const defaults = {
  cupom_titulo: 'Scrundai Software',
  cupom_cabecalho: 'Rua jose correia de andrade SERRINHA /RN\n(84) 99871-3472',
  cupom_rodape: 'Obrigado pela preferência\nSempre volte!',
  perguntar_quantidade: '1',
  taxa_credito: '0',
  taxa_debito: '0'
};
const insertConfig = db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)');
for (const [chave, valor] of Object.entries(defaults)) {
  insertConfig.run(chave, valor);
}

const adminExists = db.prepare('SELECT id FROM usuarios WHERE email = ?').get('admin@erpisac.com');
if (!adminExists) {
  db.prepare('INSERT INTO usuarios (nome, email, senha, cargo) VALUES (?, ?, ?, ?)').run(
    'Administrador', 'admin@erpisac.com', 'admin123', 'Administrador'
  );
}

const caixaStatus = db.prepare('SELECT id FROM caixa_status WHERE id = 1').get();
if (!caixaStatus) {
  db.prepare('INSERT INTO caixa_status (id, aberto) VALUES (1, 0)').run();
}

const produtoExemplo = db.prepare('SELECT id FROM produtos LIMIT 1').get();
if (!produtoExemplo) {
  db.prepare(`INSERT INTO produtos (nome, codigo, descricao, preco, estoque, estoque_minimo, categoria)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run('COCA-COLA', '7894900011517', 'Refrigerante 2L', 8, 50, 5, 'Bebidas');
}

module.exports = db;
