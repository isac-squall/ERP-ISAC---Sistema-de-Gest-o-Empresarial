const Database = require('better-sqlite3');
const path = require('path');

const dataDir = process.env.ERP_DATA_DIR || __dirname;
const db = new Database(path.join(dataDir, 'erp.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    cargo TEXT DEFAULT 'Administrador',
    celular TEXT,
    data_nascimento TEXT,
    cpf TEXT,
    tipo_pessoa TEXT DEFAULT 'PF',
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS perfis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE NOT NULL,
    descricao TEXT,
    permissoes TEXT DEFAULT '[]'
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
    preco_custo REAL DEFAULT 0,
    foto TEXT,
    estoque INTEGER DEFAULT 0,
    estoque_minimo INTEGER DEFAULT 0,
    categoria TEXT,
    fornecedor_id INTEGER,
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
  );

  CREATE TABLE IF NOT EXISTS promocoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    descricao TEXT,
    tipo TEXT DEFAULT 'percentual',
    valor REAL DEFAULT 0,
    data_inicio TEXT,
    data_fim TEXT,
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
  );

  CREATE TABLE IF NOT EXISTS estoque_movimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    estoque_anterior INTEGER,
    estoque_novo INTEGER,
    observacao TEXT,
    usuario_id INTEGER,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
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
    descricao TEXT,
    quantidade INTEGER DEFAULT 1,
    preco_unitario REAL DEFAULT 0,
    subtotal REAL DEFAULT 0,
    FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
  );

  CREATE TABLE IF NOT EXISTS orcamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    cliente_nome TEXT,
    itens TEXT,
    subtotal REAL DEFAULT 0,
    desconto REAL DEFAULT 0,
    total REAL DEFAULT 0,
    status TEXT DEFAULT 'Aberto',
    observacao TEXT,
    usuario_id INTEGER,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
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
ensureColumn('produtos', 'preco_custo', 'REAL DEFAULT 0');
ensureColumn('produtos', 'foto', 'TEXT');
ensureColumn('caixa', 'cliente_nome', 'TEXT');
ensureColumn('caixa', 'desconto', 'REAL DEFAULT 0');
ensureColumn('caixa', 'desconto_percent', 'REAL DEFAULT 0');
ensureColumn('caixa', 'venda_id', 'INTEGER');
ensureColumn('venda_itens', 'descricao', 'TEXT');
ensureColumn('venda_itens', 'os_id', 'INTEGER');
ensureColumn('usuarios', 'celular', 'TEXT');
ensureColumn('usuarios', 'data_nascimento', 'TEXT');
ensureColumn('usuarios', 'cpf', 'TEXT');
ensureColumn('usuarios', 'tipo_pessoa', "TEXT DEFAULT 'PF'");

const PAGINAS_TODAS = [
  'dashboard', 'vendas', 'caixa', 'financeiro', 'clientes', 'produtos',
  'ordens-servico', 'usuarios', 'fornecedores', 'historico-vendas',
  'relatorio', 'configuracoes', 'manual'
];
const PERFIS_PADRAO = [
  {
    nome: 'Administrador',
    descricao: 'Acesso total ao sistema',
    permissoes: PAGINAS_TODAS
  },
  {
    nome: 'Gerente',
    descricao: 'Gestao operacional sem usuarios e configuracoes',
    permissoes: [
      'dashboard', 'vendas', 'caixa', 'financeiro', 'clientes', 'produtos',
      'ordens-servico', 'fornecedores', 'historico-vendas', 'relatorio', 'manual'
    ]
  },
  {
    nome: 'Vendedor',
    descricao: 'Vendas, clientes, produtos e ordens de servico',
    permissoes: [
      'dashboard', 'vendas', 'clientes', 'produtos', 'ordens-servico',
      'historico-vendas', 'manual'
    ]
  },
  {
    nome: 'Caixa',
    descricao: 'PDV, caixa e atendimento',
    permissoes: ['dashboard', 'vendas', 'caixa', 'clientes', 'historico-vendas', 'manual']
  }
];
const insertPerfil = db.prepare('INSERT OR IGNORE INTO perfis (nome, descricao, permissoes) VALUES (?,?,?)');
for (const p of PERFIS_PADRAO) {
  insertPerfil.run(p.nome, p.descricao, JSON.stringify(p.permissoes));
}
db.prepare("UPDATE usuarios SET cargo = 'Caixa' WHERE cargo IN ('Operador','Funcionario')").run();

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

const legadoVendas = db.prepare("SELECT id, descricao FROM caixa WHERE tipo = 'Entrada' AND descricao LIKE 'Venda #%'").all();
if (legadoVendas.length) {
  const updateLegado = db.prepare(`UPDATE caixa SET tipo = 'Venda realizada', descricao = 'Venda',
    venda_id = ?, cliente_nome = ?, desconto = ?, desconto_percent = ? WHERE id = ?`);
  for (const row of legadoVendas) {
    const vendaId = parseInt((String(row.descricao).match(/Venda #(\d+)/) || [])[1], 10) || null;
    const venda = vendaId
      ? db.prepare(`SELECT v.desconto, c.nome AS cliente_nome FROM vendas v
          LEFT JOIN clientes c ON v.cliente_id = c.id WHERE v.id = ?`).get(vendaId)
      : null;
    const desconto = venda?.desconto || 0;
    const base = db.prepare('SELECT COALESCE(SUM(subtotal),0) AS subtotal FROM venda_itens WHERE venda_id = ?').get(vendaId)?.subtotal || 0;
    const percent = base > 0 ? (desconto / base) * 100 : 0;
    updateLegado.run(vendaId, venda?.cliente_nome || 'Visitante', desconto, percent, row.id);
  }
}

const statusAberto = db.prepare('SELECT * FROM caixa_status WHERE id = 1').get();
if (statusAberto?.aberto === 1 && statusAberto.aberto_em) {
  const abertura = db.prepare("SELECT id FROM caixa WHERE tipo = 'Abertura' AND criado_em >= ?").get(statusAberto.aberto_em);
  if (!abertura) {
    const n = db.prepare("SELECT COUNT(*) AS c FROM caixa WHERE tipo = 'Abertura'").get().c + 1;
    db.prepare(`INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, cliente_nome, usuario_id)
      VALUES ('Abertura', ?, ?, NULL, 'Saldo inicial', ?)`)
      .run(`Abertura de caixa ${String(n).padStart(2, '0')}`, statusAberto.valor_inicial || 0, statusAberto.usuario_id || null);
  }
}

const produtoExemplo = db.prepare('SELECT id FROM produtos LIMIT 1').get();
if (!produtoExemplo) {
  db.prepare(`INSERT INTO produtos (nome, codigo, descricao, preco, preco_custo, estoque, estoque_minimo, categoria)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('COCA-COLA', '7894900011517', 'Refrigerante 2L', 8, 5, 98, 5, 'Bebidas');
}

const insertOSDemo = db.prepare(`INSERT INTO ordens_servico (status, cliente_id, equipamento, solicitacao, valor_previsto)
  VALUES (?,?,?,?,?)`);
const clientesDemo = db.prepare('SELECT id FROM clientes ORDER BY id LIMIT 2').all();
if (!db.prepare("SELECT id FROM ordens_servico WHERE equipamento LIKE '%notebook%' COLLATE NOCASE").get()) {
  insertOSDemo.run('Pronta para entrega', clientesDemo[0]?.id || null, 'Notebook Dell Inspiron', 'Troca de tela e formatacao', 350);
}
if (!db.prepare("SELECT id FROM ordens_servico WHERE equipamento LIKE '%celular%' COLLATE NOCASE").get()) {
  insertOSDemo.run('Pronta para entrega', clientesDemo[1]?.id || null, 'Celular Samsung Galaxy', 'Troca de bateria', 180);
}

module.exports = db;
