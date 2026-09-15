const API = {
  async request(url, options = {}) {
    let res;
    try {
      res = await fetch(`/api${url}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch {
      throw new Error('Não foi possível conectar ao servidor');
    }
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; }
    catch { throw new Error(res.ok ? 'Resposta inválida do servidor' : 'Erro na requisição'); }
    if (!res.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  },

  login: (email, senha) => API.request('/auth/login', { method: 'POST', body: { email, senha } }),
  dashboard: () => API.request('/dashboard'),
  charts: (periodo) => API.request(`/dashboard/charts?periodo=${periodo || 'semana'}`),
  notificacoes: () => API.request('/notificacoes'),
  config: {
    get: () => API.request('/config'),
    save: (d) => API.request('/config', { method: 'PUT', body: d })
  },

  clientes: {
    list: (p) => API.request(`/clientes?${new URLSearchParams(p)}`),
    all: () => API.request('/clientes/all'),
    get: (id) => API.request(`/clientes/${id}`),
    create: (d) => API.request('/clientes', { method: 'POST', body: d }),
    update: (id, d) => API.request(`/clientes/${id}`, { method: 'PUT', body: d }),
    delete: (id) => API.request(`/clientes/${id}`, { method: 'DELETE' })
  },

  fornecedores: {
    list: (p) => API.request(`/fornecedores?${new URLSearchParams(p)}`),
    all: () => API.request('/fornecedores/all'),
    get: (id) => API.request(`/fornecedores/${id}`),
    create: (d) => API.request('/fornecedores', { method: 'POST', body: d }),
    update: (id, d) => API.request(`/fornecedores/${id}`, { method: 'PUT', body: d }),
    delete: (id) => API.request(`/fornecedores/${id}`, { method: 'DELETE' })
  },

  produtos: {
    list: (p) => API.request(`/produtos?${new URLSearchParams(p)}`),
    all: () => API.request('/produtos/all'),
    get: (id) => API.request(`/produtos/${id}`),
    byCodigo: (codigo) => API.request(`/produtos/codigo/${encodeURIComponent(codigo)}`),
    create: (d) => API.request('/produtos', { method: 'POST', body: d }),
    update: (id, d) => API.request(`/produtos/${id}`, { method: 'PUT', body: d }),
    delete: (id) => API.request(`/produtos/${id}`, { method: 'DELETE' }),
    estoque: (id, d) => API.request(`/produtos/${id}/estoque`, { method: 'POST', body: d }),
    movimentos: (id) => API.request(`/produtos/${id}/estoque`),
    promocoes: (id) => API.request(`/produtos/${id}/promocoes`),
    addPromocao: (id, d) => API.request(`/produtos/${id}/promocoes`, { method: 'POST', body: d })
  },
  promocoes: {
    list: () => API.request('/promocoes'),
    update: (id, d) => API.request(`/promocoes/${id}`, { method: 'PUT', body: d }),
    delete: (id) => API.request(`/promocoes/${id}`, { method: 'DELETE' })
  },

  ordensServico: {
    stats: () => API.request('/ordens-servico/stats'),
    list: (p) => API.request(`/ordens-servico?${new URLSearchParams(p)}`),
    get: (id) => API.request(`/ordens-servico/${id}`),
    create: (d) => API.request('/ordens-servico', { method: 'POST', body: d }),
    update: (id, d) => API.request(`/ordens-servico/${id}`, { method: 'PUT', body: d }),
    delete: (id) => API.request(`/ordens-servico/${id}`, { method: 'DELETE' })
  },

  usuarios: {
    list: (p) => API.request(`/usuarios?${new URLSearchParams(p)}`),
    get: (id) => API.request(`/usuarios/${id}`),
    create: (d) => API.request('/usuarios', { method: 'POST', body: d }),
    update: (id, d) => API.request(`/usuarios/${id}`, { method: 'PUT', body: d }),
    delete: (id) => API.request(`/usuarios/${id}`, { method: 'DELETE' })
  },

  caixa: {
    status: () => API.request('/caixa/status'),
    abrir: (d) => API.request('/caixa/abrir', { method: 'POST', body: d }),
    fechar: () => API.request('/caixa/fechar', { method: 'POST' }),
    historico: () => API.request('/caixa/historico'),
    movimentos: (p) => API.request(`/caixa/movimentos?${new URLSearchParams(p || {})}`),
    movimento: (id) => API.request(`/caixa/movimentos/${id}`),
    createMovimento: (d) => API.request('/caixa/movimentos', { method: 'POST', body: d }),
    updateMovimento: (id, d) => API.request(`/caixa/movimentos/${id}`, { method: 'PUT', body: d }),
    deleteMovimento: (id) => API.request(`/caixa/movimentos/${id}`, { method: 'DELETE' })
  },

  vendas: {
    list: (p) => API.request(`/vendas?${new URLSearchParams(p)}`),
    get: (id) => API.request(`/vendas/${id}`),
    create: (d) => API.request('/vendas', { method: 'POST', body: d }),
    cancelar: (id) => API.request(`/vendas/${id}/cancelar`, { method: 'POST' })
  },

  financeiro: {
    list: (p) => API.request(`/financeiro?${new URLSearchParams(p)}`),
    get: (id) => API.request(`/financeiro/${id}`),
    stats: () => API.request('/financeiro/stats'),
    create: (d) => API.request('/financeiro', { method: 'POST', body: d }),
    update: (id, d) => API.request(`/financeiro/${id}`, { method: 'PUT', body: d }),
    delete: (id) => API.request(`/financeiro/${id}`, { method: 'DELETE' })
  },

  relatorio: () => API.request('/relatorio')
};

function formatCurrency(v) {
  return 'R$' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDate(d) {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d) ? null : d;
  const raw = String(d).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  const dt = new Date(raw);
  return isNaN(dt) ? null : dt;
}

function formatDate(d) {
  const dt = parseDate(d);
  if (!dt) return d || '-';
  return dt.toLocaleDateString('pt-BR');
}

function formatDateTime(d) {
  const dt = parseDate(d);
  if (!dt) return d || '-';
  return dt.toLocaleString('pt-BR');
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function toInputDate(d) {
  if (!d) return '';
  return String(d).slice(0, 10);
}

function statusClass(status) {
  const map = {
    'Aberta': 'aberta', 'Em andamento': 'andamento',
    'Pronta para entrega': 'pronta', 'Entregue': 'entregue',
    'Cancelada': 'cancelada', 'Pendente': 'pendente',
    'Pago': 'pago', 'Concluída': 'pago'
  };
  return map[status] || 'aberta';
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), 3000);
}

function openModal(title, body, footer) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-footer').innerHTML = footer || '';
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

function renderPagination(container, page, totalPages, total, limit, onChange) {
  container.innerHTML = `
    <div class="pagination">
      <div class="pagination-left">
        <span>Exibir</span>
        <select id="page-limit">${[15, 30, 50].map(n => `<option value="${n}" ${n == limit ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </div>
      <div class="pagination-info">Página ${page}/${totalPages} | ${total} registros</div>
      <div class="pagination-btns">
        <button id="page-prev" ${page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
        <button id="page-next" ${page >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
      </div>
    </div>`;
  container.querySelector('#page-limit').onchange = (e) => onChange(1, +e.target.value);
  container.querySelector('#page-prev').onclick = () => onChange(page - 1, limit);
  container.querySelector('#page-next').onclick = () => onChange(page + 1, limit);
}

function renderTableToolbar(search, totalLabel, btnLabel, onSearch, onNew) {
  return `
    <div class="toolbar">
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Pesquisar..." value="${search || ''}" id="table-search">
      </div>
      <span class="toolbar-info">${totalLabel}</span>
      <div class="toolbar-spacer"></div>
      ${btnLabel ? `<button class="btn btn-primary" id="table-new"><i class="fas fa-plus"></i> ${btnLabel}</button>` : ''}
    </div>`;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
