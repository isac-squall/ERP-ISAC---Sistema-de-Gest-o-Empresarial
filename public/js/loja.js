const CART_KEY = 'erp_loja_cart';
let estado = { empresa: {}, produtos: [], categorias: [], cat: '', q: '', cart: [] };

function money(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function loadCart() {
  try { estado.cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]') || []; }
  catch { estado.cart = []; }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(estado.cart));
  renderCartCount();
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function boot() {
  loadCart();
  const params = new URLSearchParams(location.search);
  estado.q = params.get('q') || '';
  estado.cat = params.get('cat') || '';
  document.getElementById('loja-q').value = estado.q;
  await carregar();
  bind();
}

async function carregar() {
  const qs = new URLSearchParams();
  if (estado.q) qs.set('search', estado.q);
  if (estado.cat) qs.set('categoria', estado.cat);
  const res = await fetch('/api/loja?' + qs.toString());
  const data = await res.json();
  estado.empresa = data.empresa || {};
  estado.produtos = data.produtos || [];
  estado.categorias = data.categorias || [];
  pintarCabecalho();
  pintarCats();
  pintarGrid();
  renderCartCount();
}

function pintarCabecalho() {
  const e = estado.empresa;
  document.title = (e.nome || 'Loja') + ' - catalogo';
  document.getElementById('loja-nome').textContent = e.nome || 'Loja';
  document.getElementById('loja-hero-title').textContent = e.nome || 'Nossos produtos';
  const local = [e.cidade, e.estado].filter(Boolean).join(' / ');
  document.getElementById('loja-local').textContent = local;
  const logo = document.getElementById('loja-logo');
  const ph = document.getElementById('loja-logo-ph');
  if (e.logo) {
    logo.src = e.logo;
    logo.classList.remove('hidden');
    ph.classList.add('hidden');
  }
  const wa = document.getElementById('loja-wa-float');
  if (e.whatsapp) {
    wa.href = 'https://wa.me/' + e.whatsapp;
    wa.classList.remove('hidden');
    document.getElementById('loja-wa-hint').textContent = 'O pedido abre no WhatsApp da loja';
  } else {
    document.getElementById('loja-wa-hint').textContent = 'Cadastre o WhatsApp da loja em Configuracoes';
  }
  const partes = [e.endereco, local, e.telefone].filter(Boolean);
  document.getElementById('loja-footer').textContent = partes.join(' · ');
}

function pintarCats() {
  const nav = document.getElementById('loja-cats');
  const all = ['', ...estado.categorias];
  nav.innerHTML = all.map(c =>
    `<button type="button" data-cat="${escapeHtml(c)}" class="${estado.cat === c ? 'active' : ''}">${c ? escapeHtml(c) : 'Todos'}</button>`
  ).join('');
  nav.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => { estado.cat = btn.dataset.cat || ''; carregar(); };
  });
}

function pintarGrid() {
  const grid = document.getElementById('loja-grid');
  const empty = document.getElementById('loja-empty');
  if (!estado.produtos.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = estado.produtos.map(p => {
    const foto = p.foto
      ? `<img src="${escapeHtml(p.foto)}" alt="">`
      : '<i class="fas fa-box-open"></i>';
    const promo = p.promocao ? `<span class="promo">PROMO</span>` : '';
    const preco = p.promocao && p.preco_original
      ? `<span class="preco"><s>${money(p.preco_original)}</s>${money(p.preco)}</span>`
      : `<span class="preco">${money(p.preco)}</span>`;
    return `<article class="loja-card">
      <div class="loja-card-foto">${foto}</div>
      <div class="loja-card-body">
        ${p.categoria ? `<span class="loja-card-cat">${escapeHtml(p.categoria)}</span>` : ''}
        <h3>${escapeHtml(p.nome)} ${promo}</h3>
        ${preco}
        <button type="button" class="loja-add" data-id="${p.id}">Adicionar</button>
      </div>
    </article>`;
  }).join('');
  grid.querySelectorAll('.loja-add').forEach(btn => {
    btn.onclick = () => addItem(+btn.dataset.id);
  });
}

function addItem(id) {
  const p = estado.produtos.find(x => x.id === id);
  if (!p) return;
  const row = estado.cart.find(x => x.id === id);
  if (row) row.qtd += 1;
  else estado.cart.push({ id: p.id, nome: p.nome, preco: p.preco, qtd: 1 });
  saveCart();
  abrirDrawer();
  pintarCarrinho();
}

function renderCartCount() {
  const n = estado.cart.reduce((s, i) => s + i.qtd, 0);
  const el = document.getElementById('loja-cart-count');
  el.textContent = n;
  el.classList.toggle('hidden', !n);
}

function totalCart() {
  return estado.cart.reduce((s, i) => s + i.qtd * i.preco, 0);
}

function pintarCarrinho() {
  const box = document.getElementById('loja-cart-items');
  if (!estado.cart.length) {
    box.innerHTML = '<p class="loja-pedido-hint">Carrinho vazio</p>';
  } else {
    box.innerHTML = estado.cart.map((i, idx) => `
      <div class="loja-item">
        <div>
          <strong>${escapeHtml(i.nome)}</strong><br>
          <small>${money(i.preco)} · ${money(i.preco * i.qtd)}</small>
        </div>
        <div class="loja-qty">
          <button type="button" data-i="${idx}" data-d="-1">-</button>
          <span>${i.qtd}</span>
          <button type="button" data-i="${idx}" data-d="1">+</button>
        </div>
      </div>`).join('');
    box.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        const i = estado.cart[+btn.dataset.i];
        if (!i) return;
        i.qtd += Number(btn.dataset.d);
        if (i.qtd <= 0) estado.cart.splice(+btn.dataset.i, 1);
        saveCart();
        pintarCarrinho();
      };
    });
  }
  document.getElementById('loja-cart-total').textContent = money(totalCart());
}

function abrirDrawer() {
  document.getElementById('loja-drawer').classList.add('open');
  pintarCarrinho();
}
function fecharDrawer() {
  document.getElementById('loja-drawer').classList.remove('open');
}

function bind() {
  let t;
  document.getElementById('loja-q').oninput = (e) => {
    clearTimeout(t);
    t = setTimeout(() => { estado.q = e.target.value.trim(); carregar(); }, 280);
  };
  document.getElementById('loja-cart-open').onclick = abrirDrawer;
  document.getElementById('loja-drawer-close').onclick = fecharDrawer;
  document.getElementById('loja-drawer-x').onclick = fecharDrawer;
  document.getElementById('loja-pedido').onsubmit = (e) => {
    e.preventDefault();
    enviarWhatsapp();
  };
}

function enviarWhatsapp() {
  const wa = estado.empresa.whatsapp;
  if (!wa) {
    alert('A loja ainda nao cadastrou o WhatsApp em Configuracoes.');
    return;
  }
  if (!estado.cart.length) {
    alert('Adicione itens ao pedido.');
    return;
  }
  const nome = document.getElementById('loja-cli-nome').value.trim();
  const fone = document.getElementById('loja-cli-fone').value.trim();
  const obs = document.getElementById('loja-cli-obs').value.trim();
  const linhas = [
    '*Pedido - ' + (estado.empresa.nome || 'Loja') + '*',
    'Nome: ' + nome,
    'WhatsApp: ' + fone,
    '',
    '*Itens*'
  ];
  estado.cart.forEach(i => {
    linhas.push(i.qtd + 'x ' + i.nome + ' - ' + money(i.preco * i.qtd));
  });
  linhas.push('', '*Total: ' + money(totalCart()) + '*');
  if (obs) linhas.push('', 'Obs: ' + obs);
  const url = 'https://wa.me/' + wa + '?text=' + encodeURIComponent(linhas.join('\n'));
  window.open(url, '_blank');
}

boot().catch(() => {
  document.getElementById('loja-empty').textContent = 'Nao foi possivel carregar a loja';
  document.getElementById('loja-empty').classList.remove('hidden');
});
