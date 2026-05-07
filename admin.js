// ==========================================
// CONFIGURAÇÃO DO FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyBmIo1X0u1SVICd0m1npIv8oFAxMgnhsGE",
  authDomain: "brugnerastore.firebaseapp.com",
  projectId: "brugnerastore",
  storageBucket: "brugnerastore.firebasestorage.app",
  messagingSenderId: "681004488105",
  appId: "1:681004488105:web:530cb3f50e0980a19420b8"
};

// Iniciar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ESTADOS GLOBAIS
let products = [];
let orders = [];
let pdvCart = [];
let editingId = null;
let currentAiType = 'legenda';
let stockLog = JSON.parse(localStorage.getItem('lumina_stocklog') || '[]'); // Mantendo histórico manual local por enquanto

// ==========================================
// ESCUTAR BANCO DE DADOS EM TEMPO REAL
// ==========================================
db.collection("products").onSnapshot((snapshot) => {
  products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderProdTable();
  renderPDVGrid();
  renderEstoque();
  updateAiSelect();
  calculateDashboard();
});

db.collection("orders").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
  orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderOrders();
  calculateDashboard();
});

// ==========================================
// NAVEGAÇÃO
// ==========================================
function showPage(name, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('active');
  el.classList.add('active');
  const titles = {dashboard:'Dashboard', pdv:'Frente de Caixa (PDV)', pedidos:'Gestão de Pedidos', produtos:'Produtos', estoque:'Controle de Estoque', ia:'Gerador de Marketing IA'};
  document.getElementById('pageTitle').textContent = titles[name] || name;
}

// UPLOAD DE IMAGEM
document.getElementById('fImgFile').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      let scaleSize = 500 / img.width;
      if (scaleSize > 1) scaleSize = 1;
      canvas.width = img.width * scaleSize;
      canvas.height = img.height * scaleSize;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      document.getElementById('fImgBase64').value = dataUrl;
      document.getElementById('imgPreview').src = dataUrl;
      document.getElementById('imgPreview').style.display = 'block';
    }
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// ==========================================
// PRODUTOS
// ==========================================
function renderProdTable() {
  const search = document.getElementById('prodSearch').value.toLowerCase();
  const cat = document.getElementById('prodCatFilter').value;
  const tbody = document.getElementById('prodTableBody');
  
  const filtered = products.filter(p => (!search || p.name.toLowerCase().includes(search)) && (!cat || p.category === cat));

  if(filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text2)">Nenhum produto encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td><img src="${p.img || ''}" style="width:40px;height:50px;object-fit:cover;border-radius:4px;"></td>
      <td><strong>${p.name}</strong><br><small style="color:var(--text2)">${p.category}</small></td>
      <td style="color:var(--text2)">R$ ${(p.cost||0).toFixed(2).replace('.',',')}</td>
      <td>R$ ${(p.price||0).toFixed(2).replace('.',',')}</td>
      <td style="color:${p.stock<=3?'var(--rose)':'var(--green)'}"><b>${p.stock}</b> un.</td>
      <td><span class="status-badge pago">Ativo</span></td>
      <td style="display:flex;gap:6px;padding:14px 16px">
        <button class="btn btn-outline btn-sm" onclick="editProduct('${p.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">Excluir</button>
      </td>
    </tr>
  `).join('');
}

function filterProdTable() { renderProdTable(); }

function openProductForm(id = null) {
  editingId = id;
  const p = id ? products.find(x => x.id === id) : null;
  document.getElementById('prodModalTitle').textContent = p ? 'Editar Produto' : 'Novo Produto';
  document.getElementById('fNome').value = p?.name || '';
  document.getElementById('fCat').value = p?.category || 'vestidos';
  document.getElementById('fCusto').value = p?.cost || '';
  document.getElementById('fPreco').value = p?.price || '';
  document.getElementById('fEstoque').value = p?.stock || '';
  document.getElementById('fTamanhos').value = p?.sizes?.join(',') || 'P,M,G';
  document.getElementById('fDesc').value = p?.desc || '';
  
  // Resgatar os checkboxes se for edição
  document.getElementById('fChanSite').checked = p ? (p.channelSite !== false) : true;
  document.getElementById('fChanShopee').checked = p ? (p.channelShopee === true) : false;

  document.getElementById('fImgFile').value = '';
  document.getElementById('fImgBase64').value = p?.img || '';
  document.getElementById('imgPreview').src = p?.img || '';
  document.getElementById('imgPreview').style.display = p?.img ? 'block' : 'none';

  document.getElementById('prodModal').classList.add('show');
}

function closeProdModal() { document.getElementById('prodModal').classList.remove('show'); }

async function saveProduct() {
  const name = document.getElementById('fNome').value.trim();
  if(!name) return alert("Nome é obrigatório.");
  
  const data = {
    name,
    category: document.getElementById('fCat').value,
    cost: parseFloat(document.getElementById('fCusto').value) || 0,
    price: parseFloat(document.getElementById('fPreco').value) || 0,
    stock: parseInt(document.getElementById('fEstoque').value) || 0,
    sizes: document.getElementById('fTamanhos').value.split(',').map(s=>s.trim()),
    desc: document.getElementById('fDesc').value,
    img: document.getElementById('fImgBase64').value,
    channelSite: document.getElementById('fChanSite').checked,
    channelShopee: document.getElementById('fChanShopee').checked,
    channelPdv: true, // Sempre true pois é loja física
    active: true
  };

  try {
    document.getElementById('btnSalvarProd').textContent = "Salvando...";
    if(editingId) {
      await db.collection("products").doc(editingId).update(data);
    } else {
      await db.collection("products").add(data);
      // Log manual se tiver estoque inicial
      if(data.stock > 0) {
        stockLog.unshift({date:new Date().toLocaleDateString('pt-BR'), product:name, type:'entrada', qty:data.stock, user:'Admin'});
        localStorage.setItem('lumina_stocklog', JSON.stringify(stockLog));
      }
    }
    closeProdModal();
  } catch(e) {
    alert("Erro ao salvar: " + e.message);
  } finally {
    document.getElementById('btnSalvarProd').textContent = "Salvar Produto";
  }
}

function editProduct(id) { openProductForm(id); }

async function deleteProduct(id) {
  if(confirm("Tem certeza que deseja excluir este produto de todos os canais (Site, PDV e Nuvem)?")) {
    await db.collection("products").doc(id).delete();
  }
}

// IMPORT / EXPORT CSV (Restaurado)
function exportCSV() {
  if(products.length === 0) return alert("Nada para exportar.");
  const headers = ['id','name','category','cost','price','stock','sizes'];
  const rows = products.map(p => headers.map(h => `"${p[h]||''}"`).join(','));
  const csv = headers.join(',') + '\\n' + rows.join('\\n');
  const link = document.createElement("a");
  link.setAttribute("href", "data:text/csv;charset=utf-8," + encodeURI(csv));
  link.setAttribute("download", "produtos_brugnera.csv");
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
}
function importCSV(e) { alert("Importação via CSV para o Firebase requer configuração de segurança adicional. Use o botão '+ Novo Produto' por enquanto."); e.target.value = ''; }

// ==========================================
// PDV (FRENTE DE CAIXA)
// ==========================================
function renderPDVGrid() {
  const search = document.getElementById('pdvSearch').value.toLowerCase();
  const grid = document.getElementById('pdvGrid');
  const available = products.filter(p => p.stock > 0 && p.name.toLowerCase().includes(search));
  
  grid.innerHTML = available.map(p => `
    <div class="pdv-card" onclick="addToPDV('${p.id}')">
      <img src="${p.img}">
      <div style="font-size:0.8rem; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
      <div style="color:var(--gold); font-size:0.9rem;">R$ ${p.price.toFixed(2)}</div>
      <div style="color:var(--text2); font-size:0.7rem;">Estoque: ${p.stock}</div>
    </div>
  `).join('');
}

function addToPDV(id) {
  const p = products.find(x => x.id === id);
  if(!p || p.stock <= 0) return;
  const existing = pdvCart.find(i => i.id === id);
  if(existing) {
    if(existing.qty < p.stock) existing.qty++; else alert("Estoque máximo atingido!");
  } else {
    pdvCart.push({ id: p.id, name: p.name, price: p.price, cost: p.cost, qty: 1 });
  }
  updatePDVCart();
}

function updatePDVCart() {
  const container = document.getElementById('pdvCartItems');
  if(pdvCart.length === 0) {
    container.innerHTML = "Nenhum item adicionado.";
    document.getElementById('pdvTotal').textContent = "R$ 0,00";
    return;
  }
  let total = 0;
  container.innerHTML = pdvCart.map((item, index) => {
    total += item.price * item.qty;
    return `
      <div class="pdv-cart-item">
        <div style="flex:1;"><b>${item.qty}x</b> ${item.name}</div>
        <div>R$ ${(item.price * item.qty).toFixed(2)}</div>
        <button style="background:none;border:none;color:var(--rose);margin-left:10px;cursor:pointer;" onclick="pdvCart.splice(${index},1);updatePDVCart()">✕</button>
      </div>
    `;
  }).join('');
  document.getElementById('pdvTotal').textContent = `R$ ${total.toFixed(2).replace('.',',')}`;
}

async function finishPDV() {
  if(pdvCart.length === 0) return alert("Carrinho vazio!");
  
  const total = pdvCart.reduce((acc, i) => acc + (i.price * i.qty), 0);
  const totalCost = pdvCart.reduce((acc, i) => acc + (i.cost * i.qty), 0);
  const payment = document.getElementById('pdvPayment').value;

  const orderData = {
    origin: "Loja Física",
    client: "Cliente Balcão",
    items: pdvCart.map(i => `${i.qty}x ${i.name}`).join(', '),
    value: total,
    cost: totalCost,
    payment: payment,
    status: "pago",
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    dateStr: new Date().toLocaleString('pt-BR')
  };

  try {
    await db.collection("orders").add(orderData);
    for(let item of pdvCart) {
      const p = products.find(x => x.id === item.id);
      await db.collection("products").doc(item.id).update({ stock: p.stock - item.qty });
    }
    alert("Venda registrada com sucesso! Estoque atualizado.");
    pdvCart = [];
    updatePDVCart();
  } catch(e) {
    alert("Erro ao finalizar venda: " + e.message);
  }
}

// ==========================================
// PEDIDOS & DASHBOARD (Restaurado completo)
// ==========================================
function renderOrders() {
  const tbody = document.getElementById('ordersTableBody');
  const recent = document.getElementById('recentOrders');
  
  const html = orders.map(o => {
    let icon = o.origin === 'Loja Física' ? '🏬' : (o.origin === 'Shopee' ? '🟧' : '🛍️');
    return `
    <tr>
      <td style="font-size:1.1rem;" title="${o.origin}">${icon} ${o.origin}</td>
      <td>${o.client}</td>
      <td style="font-size:0.75rem; color:var(--text2)">${o.items}</td>
      <td style="color:var(--gold)">R$ ${(o.value||0).toFixed(2).replace('.',',')}</td>
      <td>${o.payment}</td>
      <td><span class="status-badge ${o.status==='pago'?'pago':(o.status==='pendente'?'pendente':'enviado')}">${o.status}</span></td>
      <td>
        <select onchange="updateOrderStatus('${o.id}', this.value)" style="padding:4px;background:var(--surface2);border:1px solid var(--border);color:white;font-size:0.7rem">
          <option value="pendente" ${o.status==='pendente'?'selected':''}>Pendente</option>
          <option value="pago" ${o.status==='pago'?'selected':''}>Pago</option>
          <option value="enviado" ${o.status==='enviado'?'selected':''}>Enviado</option>
        </select>
      </td>
    </tr>
  `});
  
  tbody.innerHTML = html.join('') || '<tr><td colspan="7" style="text-align:center">Nenhum pedido ainda.</td></tr>';
  recent.innerHTML = orders.slice(0,5).map(o => `<tr><td>${o.origin==='Loja Física'?'🏬':'🛍️'} ${o.origin}</td><td>${o.client}</td><td style="color:var(--gold)">R$ ${o.value.toFixed(2)}</td><td>${o.payment}</td><td><span class="status-badge pago">${o.status}</span></td></tr>`).join('');
  
  // Render Fake Charts
  document.getElementById('salesChart').innerHTML = [0,1,2,3,4,5,6].map(d => `<div class="bar-wrap"><div class="bar" style="height:${Math.floor(Math.random()*60)+20}px"></div></div>`).join('');
}

function filterOrders(status, btn) {
  document.querySelectorAll('.order-filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  // Se fosse filtrar de verdade, precisaríamos alterar a query do Firebase. Por enquanto é visual.
}

async function updateOrderStatus(id, status) {
  await db.collection("orders").doc(id).update({ status });
}

function calculateDashboard() {
  let receita = 0; let custoTotal = 0; let vendasSite = 0; let vendasFisica = 0;
  
  orders.forEach(o => {
    receita += (o.value || 0);
    custoTotal += (o.cost || 0);
    if(o.origin === 'Loja Física') vendasFisica++;
    else vendasSite++;
  });

  const lucroReal = receita - custoTotal;

  document.getElementById('dashReceita').textContent = `R$ ${receita.toFixed(2).replace('.',',')}`;
  document.getElementById('dashLucro').textContent = `R$ ${lucroReal.toFixed(2).replace('.',',')}`;
  document.getElementById('dashSite').textContent = vendasSite;
  document.getElementById('dashFisica').textContent = vendasFisica;
}

// ==========================================
// ESTOQUE (Restaurado)
// ==========================================
function renderEstoque() {
  const grid = document.getElementById('stockGrid');
  if(products.length === 0) {
    grid.innerHTML = '<p style="color:var(--text2);">Nenhum produto cadastrado.</p>';
  } else {
    grid.innerHTML = products.map(p => `
      <div class="stock-card">
        <div class="stock-card-name">${p.name}</div>
        <div class="stock-card-qty ${p.stock<=3?'low':''}">${p.stock}</div>
      </div>
    `).join('');
  }
  
  document.getElementById('stockLog').innerHTML = stockLog.length === 0 ? '<tr><td colspan="5" style="text-align:center">Sem registros.</td></tr>' : 
    stockLog.slice(0,10).map(l => `<tr><td>${l.date}</td><td>${l.product}</td><td><span class="status-badge pago">${l.type}</span></td><td>${l.qty}</td><td>${l.user}</td></tr>`).join('');
}

function openStockEntry() {
  document.getElementById('stkProd').innerHTML = products.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('stockModal').classList.add('show');
}

async function saveStockEntry() {
  const id = document.getElementById('stkProd').value;
  const qty = parseInt(document.getElementById('stkQty').value);
  const type = document.getElementById('stkType').value;
  if(!qty) return;
  
  const p = products.find(x => x.id === id);
  const delta = type === 'saida' ? -qty : qty;
  const newStock = Math.max(0, p.stock + delta);
  
  await db.collection("products").doc(id).update({ stock: newStock });
  
  stockLog.unshift({date:new Date().toLocaleDateString('pt-BR'), product:p.name, type, qty:delta, user:'Admin'});
  localStorage.setItem('lumina_stocklog', JSON.stringify(stockLog));
  document.getElementById('stockModal').classList.remove('show');
}

// ==========================================
// IA MARKETING (Restaurado)
// ==========================================
function updateAiSelect() {
  document.getElementById('aiProdSelect').innerHTML = products.length === 0 ? '<option>Cadastre produtos primeiro</option>' : products.map(p=>`<option value="${p.name}">${p.name}</option>`).join('');
}

function setAiType(type, el) {
  currentAiType = type;
  document.querySelectorAll('.ai-type-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
}

function generateAI() {
  const prod = document.getElementById('aiProdSelect').value;
  if(!prod || products.length === 0) return alert("Selecione um produto.");
  
  document.getElementById('aiLoading').classList.add('show');
  document.getElementById('aiResultArea').style.display = 'none';

  setTimeout(() => {
    let result = "";
    if(currentAiType === 'legenda') result = `✨ Exclusividade que fala por si.\nO ${prod} chegou para elevar o seu estilo. Corre pro site antes que acabe! #ModaFeminina #BrugneraStore`;
    else if(currentAiType === 'shopee') result = `[ORIGINAL] ${prod} - Moda Feminina Premium.\n\nGaranta já o seu ${prod}. Tecido de alta qualidade, costura reforçada. Envio imediato para todo o Brasil.`;
    else if(currentAiType === 'relatorio') result = `📊 IA Analisou: O produto ${prod} tem tido boa aceitação. A margem de lucro está excelente. Sugiro criar um combo com acessórios para aumentar o ticket médio.`;
    else result = `📱 Ideia de Story: Mostre os detalhes do ${prod} em vídeo com uma música em alta no Instagram.`;

    document.getElementById('tabResultado').textContent = result;
    document.getElementById('aiResultArea').style.display = 'block';
    document.getElementById('aiLoading').classList.remove('show');
  }, 1500);
}

// INIT
document.getElementById('dateBadge').textContent = new Date().toLocaleDateString('pt-BR', {weekday:'long',day:'2-digit',month:'long'});