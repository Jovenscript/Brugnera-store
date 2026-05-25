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

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

// ==========================================
// EMAILS AUTORIZADOS COMO ADMIN
// ==========================================
const ADMIN_EMAILS = [
  'admin@brugnerastore.com.br'
];

// CONFIGURAÇÕES DO GERENCIADOR DE FOTOS
const MAX_PRODUCT_IMAGES = 8;   // limite de fotos por produto
const MAX_IMAGE_MB = 8;         // tamanho máximo aceito por arquivo (antes de comprimir)

// ESTADOS GLOBAIS
let products = [];
let draftProducts = []; 
let orders = [];
let pdvCart = [];
let editingId = null;
let currentAiType = 'legenda';
let stockLog = JSON.parse(localStorage.getItem('brugnera_stocklog') || '[]');
let igExtractedData = null;
let igImageBase64 = null;
let productColors = [];   // [{ nome, hex, imagens: [base64...] }] — cada COR tem suas próprias fotos. A foto [0] de cada cor é a capa daquela cor.
let activeColorIndex = 0; // qual cor está sendo editada agora no formulário
let dragImgIndex = null;  // índice da foto sendo arrastada (drag & drop)

// ==========================================
// AUTENTICAÇÃO — GUARD DO ADMIN
// ==========================================
auth.onAuthStateChanged((user) => {
  if (user && ADMIN_EMAILS.includes(user.email)) {
    const guardEl = document.getElementById('authGuard');
    if(guardEl) guardEl.style.display = 'none';
    initApp();
  } else if (user) {
    showGuardError('Esta conta não tem acesso ao painel administrativo.');
    auth.signOut();
  } else {
    const guardEl = document.getElementById('authGuard');
    if(guardEl) guardEl.style.display = 'flex';
  }
});

function guardLogin() {
  const email = document.getElementById('guardEmail').value.trim();
  const pass = document.getElementById('guardPass').value;
  const btn = document.getElementById('guardBtn');

  if (!email || !pass) { showGuardError('Preencha e-mail e senha.'); return; }

  btn.textContent = 'Entrando...';
  btn.style.opacity = '0.7';

  auth.signInWithEmailAndPassword(email, pass)
    .then((cred) => {
      if (!ADMIN_EMAILS.includes(cred.user.email)) {
        auth.signOut();
        showGuardError('Este e-mail não tem permissão de administrador.');
        btn.textContent = 'ENTRAR NO PAINEL';
        btn.style.opacity = '1';
      }
    })
    .catch((err) => {
      showGuardError('E-mail ou senha incorretos. Tente novamente.');
      btn.textContent = 'ENTRAR NO PAINEL';
      btn.style.opacity = '1';
    });
}

function showGuardError(msg) {
  const el = document.getElementById('guardError');
  if(el) { el.textContent = msg; el.style.display = 'block'; }
}

function adminLogout() {
  if (confirm('Tem certeza que deseja sair do painel?')) {
    auth.signOut();
  }
}

// ==========================================
// INIT E BANCO DE DADOS
// ==========================================
function initApp() {
  db.collection("products").onSnapshot((snapshot) => {
    const allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Separa os produtos reais dos rascunhos da Automação Make
    products = allProducts.filter(p => p.status !== 'rascunho');
    draftProducts = allProducts.filter(p => p.status === 'rascunho');

    updateCategoryLists(); // Atualiza categorias dinâmicas (Etapa 2)
    renderProdTable();
    renderDraftTable(); 
    updateDraftBadge(); 
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

  // UPLOAD DE MÚLTIPLAS IMAGENS  (agora ACUMULA em vez de zerar a cada seleção)
  const fileInput = document.getElementById('fImgFile');
  if(fileInput) {
    fileInput.addEventListener('change', function(e) {
      const files = Array.from(e.target.files || []);
      if(!files.length) return;
      addImageFiles(files);
      // Limpa o input para permitir re-selecionar os mesmos arquivos / adicionar em novos lotes
      e.target.value = '';
    });
  }

  const dateBadge = document.getElementById('dateBadge');
  if(dateBadge) dateBadge.textContent = new Date().toLocaleDateString('pt-BR', {weekday:'long', day:'2-digit', month:'long'});
}

// ==========================================
// GERENCIADOR DE FOTOS DO PRODUTO
//  - Adiciona (comprime via Canvas e acumula no array)
//  - Define capa (move a foto para a posição [0])
//  - Exclui foto
//  - Reordena (arrastar no desktop / botões ◀ ▶ no celular)
// ==========================================
// Cria uma nova cor vazia
function novaCor(nome = '', hex = '#888888') { return { nome, hex, imagens: [] }; }
// Retorna o array de fotos da COR que está sendo editada agora
function fotosAtivas() { return productColors[activeColorIndex] ? productColors[activeColorIndex].imagens : []; }

function addImageFiles(files) {
  if (!productColors[activeColorIndex]) { productColors.push(novaCor()); activeColorIndex = 0; }
  const alvo = productColors[activeColorIndex].imagens;
  const remaining = MAX_PRODUCT_IMAGES - alvo.length;
  if (remaining <= 0) {
    alert(`Limite de ${MAX_PRODUCT_IMAGES} fotos por cor. Exclua alguma para adicionar outra.`);
    return;
  }

  // Validação: só imagens e dentro do tamanho máximo
  const onlyImages = files.filter(f => f.type && f.type.startsWith('image/'));
  if (onlyImages.length !== files.length) {
    alert('Alguns arquivos foram ignorados por não serem imagens.');
  }
  const validSize = onlyImages.filter(f => f.size <= MAX_IMAGE_MB * 1024 * 1024);
  if (validSize.length !== onlyImages.length) {
    alert(`Algumas fotos foram ignoradas por passarem de ${MAX_IMAGE_MB}MB.`);
  }

  const toProcess = validSize.slice(0, remaining);
  if (validSize.length > remaining) {
    alert(`Só cabem mais ${remaining} foto(s). As demais foram ignoradas.`);
  }

  const storage = firebase.storage();
  toProcess.forEach(file => {
    const reader = new FileReader();
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        let scaleSize = 800 / img.width; 
        if (scaleSize > 1) scaleSize = 1;
        canvas.width = img.width * scaleSize;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Sobe pro Firebase Storage (almoxarifado) e pega o link
        canvas.toBlob(function(blob) {
          const filename = Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.jpg';
          const storageRef = storage.ref('product-images/' + filename);
          const uploadTask = storageRef.put(blob, { contentType: 'image/jpeg' });

          uploadTask.on('state_changed',
            null, // podemos adicionar barra de progresso depois
            function(error) { alert('Erro ao subir foto: ' + error.message); },
            function() {
              uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
                productColors[activeColorIndex].imagens.push(downloadURL);
                renderColorManager();
              });
            }
          );
        }, 'image/jpeg', 0.72);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---- Gerenciamento das CORES (abas) ----
function addColor() {
  if (productColors.length >= 12) { alert('Limite de 12 cores por produto.'); return; }
  productColors.push(novaCor('', '#888888'));
  activeColorIndex = productColors.length - 1;
  renderColorManager();
}
function removeColor(i) {
  if (i < 0 || i >= productColors.length) return;
  if (productColors.length === 1) { alert('O produto precisa de pelo menos 1 cor. Você pode renomeá-la.'); return; }
  if (!confirm(`Excluir a cor "${productColors[i].nome || 'sem nome'}" e todas as fotos dela?`)) return;
  productColors.splice(i, 1);
  if (activeColorIndex >= productColors.length) activeColorIndex = productColors.length - 1;
  renderColorManager();
}
function setActiveColor(i) {
  if (i < 0 || i >= productColors.length) return;
  activeColorIndex = i;
  renderColorManager();
}
// Atualiza nome/cor SEM re-render completo (pra não perder o foco do campo enquanto digita)
function updateColorName(i, value) {
  if (!productColors[i]) return;
  productColors[i].nome = value;
  const tab = document.querySelector(`.color-tab[data-idx="${i}"] .color-tab-name`);
  if (tab) tab.textContent = value || 'Sem nome';
}
function updateColorHex(i, value) {
  if (!productColors[i]) return;
  productColors[i].hex = value;
  const dot = document.querySelector(`.color-tab[data-idx="${i}"] .color-dot`);
  if (dot) dot.style.background = value;
}

function renderColorManager() {
  const container = document.getElementById('imgPreviewContainer');
  if (!container) return;

  // Garante pelo menos uma cor sempre
  if (productColors.length === 0) { productColors.push(novaCor('Padrão', '#888888')); activeColorIndex = 0; }
  if (activeColorIndex >= productColors.length) activeColorIndex = productColors.length - 1;

  // Compatibilidade com o restante do sistema: capa do produto = 1ª foto da 1ª cor
  const cover = (productColors[0] && productColors[0].imagens[0]) || '';
  const hiddenEl = document.getElementById('fImgBase64');
  if (hiddenEl) hiddenEl.value = cover;
  const legacyPreview = document.getElementById('imgPreview');
  if (legacyPreview) legacyPreview.style.display = 'none';

  const ativa = productColors[activeColorIndex];
  const fotos = ativa.imagens;
  const last = fotos.length - 1;

  // Abas de cor (bolinha + nome + contador de fotos)
  const tabs = productColors.map((c, i) => `
    <button type="button" class="color-tab ${i === activeColorIndex ? 'active' : ''}" data-idx="${i}" onclick="setActiveColor(${i})">
      <span class="color-dot" style="background:${c.hex || '#888'}"></span>
      <span class="color-tab-name">${c.nome ? c.nome.replace(/</g,'&lt;') : 'Sem nome'}</span>
      <span class="color-tab-count">${c.imagens.length}</span>
    </button>`).join('');

  // Grade de fotos da cor ativa
  const grid = fotos.length === 0
    ? `<div class="img-manager-empty">Nenhuma foto nesta cor ainda. A 1ª foto vira a <b>capa</b> desta cor.</div>`
    : `<div class="img-thumb-grid">
        ${fotos.map((src, i) => `
          <div class="img-thumb ${i === 0 ? 'cover' : ''}"
               draggable="true"
               ondragstart="dragImgStart(event, ${i})"
               ondragover="dragImgOver(event)"
               ondrop="dragImgDrop(event, ${i})"
               ondragend="dragImgEnd(event)">
            ${i === 0 ? '<span class="img-thumb-badge">★ Capa</span>' : ''}
            <img src="${src}" alt="Foto ${i + 1}">
            <div class="img-thumb-actions">
              <button type="button" title="Mover para a esquerda" onclick="moveImage(${i}, ${i - 1})" ${i === 0 ? 'disabled' : ''}>◀</button>
              ${i !== 0 ? `<button type="button" class="set-cover" title="Definir como capa" onclick="setCoverImage(${i})">★</button>` : ''}
              <button type="button" class="remove" title="Excluir foto" onclick="removeImage(${i})">✕</button>
              <button type="button" title="Mover para a direita" onclick="moveImage(${i}, ${i + 1})" ${i === last ? 'disabled' : ''}>▶</button>
            </div>
          </div>`).join('')}
      </div>`;

  container.className = 'color-manager';
  container.innerHTML = `
    <div class="color-tabs">
      ${tabs}
      <button type="button" class="color-tab-add" onclick="addColor()" title="Adicionar nova cor">+ Cor</button>
    </div>
    <div class="color-editor">
      <div class="color-editor-head">
        <label class="color-field">
          <span>Nome da cor</span>
          <input type="text" value="${(ativa.nome || '').replace(/"/g,'&quot;')}" placeholder="Ex: Preto, Branco, Vinho..." oninput="updateColorName(${activeColorIndex}, this.value)">
        </label>
        <label class="color-field color-field-hex">
          <span>Bolinha</span>
          <input type="color" value="${ativa.hex || '#888888'}" oninput="updateColorHex(${activeColorIndex}, this.value)">
        </label>
        ${productColors.length > 1 ? `<button type="button" class="color-remove-btn" onclick="removeColor(${activeColorIndex})">✕ Excluir cor</button>` : ''}
      </div>
      <div class="img-manager-counter">${fotos.length}/${MAX_PRODUCT_IMAGES} fotos desta cor &bull; a 1ª é a capa &bull; arraste para reordenar</div>
      ${grid}
    </div>`;
}

function removeImage(index) {
  const alvo = fotosAtivas();
  if (index < 0 || index >= alvo.length) return;
  alvo.splice(index, 1);
  renderColorManager();
}

function setCoverImage(index) {
  const alvo = fotosAtivas();
  if (index <= 0 || index >= alvo.length) return;
  const [img] = alvo.splice(index, 1);
  alvo.unshift(img);
  renderColorManager();
}

function moveImage(from, to) {
  const alvo = fotosAtivas();
  if (to < 0 || to >= alvo.length || from === to) return;
  const [img] = alvo.splice(from, 1);
  alvo.splice(to, 0, img);
  renderColorManager();
}

// Drag & Drop (desktop)
function dragImgStart(e, i) {
  dragImgIndex = i;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
}
function dragImgOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}
function dragImgDrop(e, i) {
  e.preventDefault();
  if (dragImgIndex === null || dragImgIndex === i) return;
  moveImage(dragImgIndex, i);
  dragImgIndex = null;
}
function dragImgEnd(e) {
  e.currentTarget.classList.remove('dragging');
  dragImgIndex = null;
}

// ==========================================
// UTILITÁRIO DE IMAGEM (Instagram)
// ==========================================
function handleImageUpload(file, base64FieldId, previewId, callback) {
  if (!file) return;
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
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      if (base64FieldId) {
        document.getElementById(base64FieldId).value = dataUrl;
        document.getElementById(previewId).src = dataUrl;
        document.getElementById(previewId).style.display = 'block';
      }
      if (callback) callback(dataUrl);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// ==========================================
// NAVEGAÇÃO E CATEGORIAS DINÂMICAS
// ==========================================
function showPage(name, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  const pageEl = document.getElementById('page' + name.charAt(0).toUpperCase() + name.slice(1));
  if(pageEl) pageEl.classList.add('active');
  if(el) el.classList.add('active');
  
  const titles = {
    dashboard: 'Dashboard',
    pdv: 'Frente de Caixa (PDV)',
    pedidos: 'Gestão de Pedidos',
    produtos: 'Produtos Ativos',
    importados: 'Rascunhos do Make',
    estoque: 'Controle de Estoque',
    instagram: '📸 Instagram → Site',
    ia: 'Gerador de Marketing IA'
  };
  const titleEl = document.getElementById('pageTitle');
  if(titleEl) titleEl.textContent = titles[name] || name;
}

function updateDraftBadge() {
  const badge = document.getElementById('badgeInsta');
  const mainDot = document.getElementById('mainNotifDot');
  if(badge && mainDot) {
    if(draftProducts.length > 0) {
      badge.textContent = draftProducts.length;
      badge.style.display = 'inline-block';
      mainDot.style.display = 'block';
    } else {
      badge.style.display = 'none';
      mainDot.style.display = 'none';
    }
  }
}

function updateCategoryLists() {
  const categories = [...new Set(products.map(p => p.category))].filter(Boolean);
  const datalist = document.getElementById('catList');
  if(datalist) datalist.innerHTML = categories.map(cat => `<option value="${cat}">`).join('');
  
  const filterSelect = document.getElementById('prodCatFilter');
  if(filterSelect) filterSelect.innerHTML = `<option value="">Todas categorias</option>` + categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

// ==========================================
// PRODUTOS
// ==========================================
function renderProdTable() {
  const search = document.getElementById('prodSearch').value.toLowerCase();
  const cat = document.getElementById('prodCatFilter')?.value || '';
  const tbody = document.getElementById('prodTableBody');
  if(!tbody) return;

  const filtered = products.filter(p => (!search || p.name.toLowerCase().includes(search)) && (!cat || p.category === cat));
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text2)">Nenhum produto encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(p => {
    const mainImg = p.images && p.images.length > 0 ? p.images[0] : (p.img || '');
    return `
    <tr>
      <td><img src="${mainImg}" style="width:40px;height:50px;object-fit:cover;border-radius:4px;"></td>
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
  `}).join('');
}

function renderDraftTable() {
  const tbody = document.getElementById('draftTableBody');
  if(!tbody) return;

  if(draftProducts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text2)">Nenhum produto importado pendente.</td></tr>';
    return;
  }
  tbody.innerHTML = draftProducts.map(p => {
    const mainImg = p.images && p.images.length > 0 ? p.images[0] : (p.img || '');
    return `
    <tr>
      <td><img src="${mainImg}" style="width:40px;height:50px;object-fit:cover;border-radius:4px; border:2px solid var(--rose);"></td>
      <td><strong>${p.name}</strong><br><small style="color:var(--text2)">Via Make.com</small></td>
      <td>R$ ${(p.price||0).toFixed(2).replace('.',',')}</td>
      <td><span class="status-badge rascunho">Sem Estoque</span></td>
      <td style="display:flex;gap:6px;padding:14px 16px">
        <button class="btn btn-gold btn-sm" onclick="activateDraft('${p.id}')">Adicionar Estoque e Ativar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">Descartar</button>
      </td>
    </tr>
  `}).join('');
}

function filterProdTable() { renderProdTable(); }

function openProductForm(id = null, isDraft = false) {
  editingId = id;
  const p = id ? (isDraft ? draftProducts.find(x=>x.id===id) : products.find(x=>x.id===id)) : null;
  
  document.getElementById('prodModalTitle').textContent = p ? (isDraft ? 'Ativar Importado' : 'Editar Produto') : 'Novo Produto';
  document.getElementById('fNome').value = p?.name || '';
  document.getElementById('fCat').value = p?.category || '';
  document.getElementById('fCusto').value = p?.cost || '';
  document.getElementById('fPreco').value = p?.price || '';
  document.getElementById('fEstoque').value = p?.stock || '';
  document.getElementById('fTamanhos').value = p?.sizes?.join(',') || 'P,M,G';
  document.getElementById('fDesc').value = p?.desc || '';
  document.getElementById('fChanSite').checked = p ? (p.channelSite !== false) : true;
  document.getElementById('fChanShopee').checked = p ? (p.channelShopee === true) : false;
  
  if(document.getElementById('fImgFile')) document.getElementById('fImgFile').value = '';
  if(document.getElementById('fImgBase64')) document.getElementById('fImgBase64').value = p?.img || '';

  // Carrega as CORES existentes. Produtos antigos (sem 'cores') viram uma única cor "Padrão" com as fotos atuais.
  if (p?.cores && Array.isArray(p.cores) && p.cores.length) {
    productColors = p.cores.map(c => ({
      nome: c.nome || '',
      hex: c.hex || '#888888',
      imagens: Array.isArray(c.imagens) ? [...c.imagens] : []
    }));
  } else {
    const legacy = (p?.images && p.images.length) ? [...p.images] : (p?.img ? [p.img] : []);
    productColors = [ { nome: 'Padrão', hex: '#888888', imagens: legacy } ];
  }
  activeColorIndex = 0;
  renderColorManager();

  document.getElementById('prodModal').classList.add('show');
}

function closeProdModal() { document.getElementById('prodModal').classList.remove('show'); }

function activateDraft(id) { openProductForm(id, true); }

async function saveProduct() {
  const name = document.getElementById('fNome').value.trim();
  const stock = parseInt(document.getElementById('fEstoque').value) || 0;
  const cat = document.getElementById('fCat').value.trim();
  const cost = parseFloat(document.getElementById('fCusto').value) || 0;
  const price = parseFloat(document.getElementById('fPreco').value) || 0;

  // Monta as cores válidas (precisa ter pelo menos 1 foto). Nomeia automaticamente as sem nome.
  const cores = productColors
    .map(c => ({ nome: (c.nome || '').trim(), hex: c.hex || '#888888', imagens: c.imagens || [] }))
    .filter(c => c.imagens.length > 0);
  cores.forEach((c, i) => { if (!c.nome) c.nome = `Cor ${i + 1}`; });
  const totalFotos = cores.reduce((n, c) => n + c.imagens.length, 0);

  // ---- Validações (prevenção de erros) ----
  if (!name) return alert("Nome é obrigatório.");
  if (!cat) return alert("Categoria é obrigatória.");
  if (totalFotos === 0 &&
      !confirm("Este produto está sem fotos. Sem capa ele fica feio na vitrine. Salvar mesmo assim?")) {
    return;
  }
  if (price > 0 && cost > 0 && price < cost &&
      !confirm("⚠️ O preço de VENDA está menor que o CUSTO — isso dá prejuízo. Deseja continuar mesmo assim?")) {
    return;
  }

  // A capa do produto = 1ª foto da 1ª cor. NÃO duplicamos o resto das fotos em 'images'
  // (elas já vivem em 'cores'); guardamos só a capa para compatibilidade com PDV/carrinho/tabela.
  const imgBase64 = document.getElementById('fImgBase64') ? document.getElementById('fImgBase64').value : '';
  const cover = cores.length > 0 ? cores[0].imagens[0] : (imgBase64 || '');

  // Guarda de tamanho: o Firestore recusa documentos acima de 1 MB.
  const approxBytes = new Blob([JSON.stringify(cores)]).size;
  if (approxBytes > 950000) {
    alert(
      `As fotos deste produto estão pesadas demais (${(approxBytes / 1024 / 1024).toFixed(2)} MB) e passam do limite de 1 MB por produto do banco.\n\n` +
      `Dica rápida: use menos fotos por cor (ou fotos menores) por enquanto.\n` +
      `Em breve vamos guardar as fotos no Firebase Storage — aí esse limite acaba.`
    );
    return;
  }
  
  const data = {
    name,
    category: cat,
    cost: cost,
    price: price,
    stock: stock,
    sizes: document.getElementById('fTamanhos').value.split(',').map(s => s.trim()).filter(Boolean),
    desc: document.getElementById('fDesc').value,
    cores: cores,
    images: cover ? [cover] : [],
    img: cover,
    channelSite: document.getElementById('fChanSite').checked,
    channelShopee: document.getElementById('fChanShopee').checked,
    channelPdv: true,
    active: true,
    status: 'ativo'
  };
  
  try {
    document.getElementById('btnSalvarProd').textContent = "Salvando...";
    if (editingId) {
      await db.collection("products").doc(editingId).update(data);
    } else {
      await db.collection("products").add(data);
      if (data.stock > 0) {
        stockLog.unshift({date: new Date().toLocaleDateString('pt-BR'), product: name, type: 'entrada', qty: data.stock, user: 'Admin'});
        localStorage.setItem('brugnera_stocklog', JSON.stringify(stockLog));
      }
    }
    closeProdModal();
  } catch(e) {
    const msg = (e && e.message) ? e.message.toLowerCase() : '';
    if (msg.includes('size') || msg.includes('1048487') || msg.includes('bytes')) {
      alert("As fotos ficaram pesadas demais para o banco (limite de 1 MB por produto). Use menos fotos ou fotos menores por enquanto. 🙂");
    } else {
      alert("Erro ao salvar: " + (e.message || e));
    }
  } finally {
    document.getElementById('btnSalvarProd').textContent = "Salvar Produto";
  }
}

function editProduct(id) { openProductForm(id, false); }

async function deleteProduct(id) {
  if (confirm("Tem certeza que deseja excluir?")) {
    await db.collection("products").doc(id).delete();
  }
}

function exportCSV() {
  if (products.length === 0) return alert("Nada para exportar.");
  const headers = ['id','name','category','cost','price','stock','sizes'];
  const rows = products.map(p => headers.map(h => `"${p[h]||''}"`).join(','));
  const csv = headers.join(',') + '\n' + rows.join('\n');
  const link = document.createElement("a");
  link.setAttribute("href", "data:text/csv;charset=utf-8," + encodeURI(csv));
  link.setAttribute("download", "produtos_brugnera.csv");
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
}
function importCSV(e) { alert("Importação via CSV disponível em breve. Use '+ Novo Produto' por enquanto."); e.target.value = ''; }

// ==========================================
// PDV
// ==========================================
function renderPDVGrid() {
  const search = document.getElementById('pdvSearch')?.value.toLowerCase() || '';
  const grid = document.getElementById('pdvGrid');
  if(!grid) return;

  const available = products.filter(p => p.stock > 0 && p.name.toLowerCase().includes(search));
  grid.innerHTML = available.map(p => {
    const mainImg = p.images && p.images.length > 0 ? p.images[0] : (p.img || '');
    return `
    <div class="pdv-card" onclick="addToPDV('${p.id}')">
      <img src="${mainImg}">
      <div style="font-size:0.8rem; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
      <div style="color:var(--gold); font-size:0.9rem;">R$ ${p.price.toFixed(2)}</div>
      <div style="color:var(--text2); font-size:0.7rem;">Estoque: ${p.stock}</div>
    </div>
  `}).join('');
}

function addToPDV(id) {
  const p = products.find(x => x.id === id);
  if (!p || p.stock <= 0) return;
  const existing = pdvCart.find(i => i.id === id);
  if (existing) {
    if (existing.qty < p.stock) existing.qty++;
    else alert("Estoque máximo atingido!");
  } else {
    pdvCart.push({ id: p.id, name: p.name, price: p.price, cost: p.cost, qty: 1 });
  }
  updatePDVCart();
}

function updatePDVCart() {
  const container = document.getElementById('pdvCartItems');
  if(!container) return;
  
  if (pdvCart.length === 0) {
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
  if (pdvCart.length === 0) return alert("Carrinho vazio!");
  const total = pdvCart.reduce((acc, i) => acc + (i.price * i.qty), 0);
  const totalCost = pdvCart.reduce((acc, i) => acc + (i.cost * i.qty), 0);
  const payment = document.getElementById('pdvPayment').value;
  
  const orderData = {
    origin: "Loja Física",
    client: "Cliente Balcão",
    items: pdvCart.map(i => `${i.qty}x ${i.name}`).join(', '),
    value: total,
    cost: totalCost,
    payment,
    status: "pago",
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    dateStr: new Date().toLocaleString('pt-BR')
  };
  
  try {
    await db.collection("orders").add(orderData);
    for (let item of pdvCart) {
      // Operação atômica: evita venda dupla em concorrência
      await db.collection("products").doc(item.id).update({
        stock: firebase.firestore.FieldValue.increment(-item.qty)
      });
    }
    alert("✅ Venda registrada! Estoque atualizado.");
    pdvCart = [];
    updatePDVCart();
  } catch(e) {
    alert("Erro ao finalizar venda: " + e.message);
  }
}

// ==========================================
// PEDIDOS & DASHBOARD
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
          <option value="entregue" ${o.status==='entregue'?'selected':''}>Entregue</option>
        </select>
      </td>
    </tr>
  `});
  
  if(tbody) tbody.innerHTML = html.join('') || '<tr><td colspan="7" style="text-align:center">Nenhum pedido ainda.</td></tr>';
  if(recent) recent.innerHTML = orders.slice(0,5).map(o => `<tr><td>${o.origin==='Loja Física'?'🏬':'🛍️'} ${o.origin}</td><td>${o.client}</td><td style="color:var(--gold)">R$ ${(o.value||0).toFixed(2)}</td><td>${o.payment}</td><td><span class="status-badge pago">${o.status}</span></td></tr>`).join('');
  
  const salesChart = document.getElementById('salesChart');
  if(salesChart) salesChart.innerHTML = [0,1,2,3,4,5,6].map(d => `<div class="bar-wrap"><div class="bar" style="height:${Math.floor(Math.random()*60)+20}px"></div></div>`).join('');
}

function filterOrders(status, btn) {
  document.querySelectorAll('.order-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function updateOrderStatus(id, status) {
  await db.collection("orders").doc(id).update({ status });
}

function calculateDashboard() {
  let receita = 0; let custoTotal = 0; let vendasSite = 0; let vendasFisica = 0;
  orders.forEach(o => {
    receita += (o.value || 0);
    custoTotal += (o.cost || 0);
    if (o.origin === 'Loja Física') vendasFisica++;
    else vendasSite++;
  });
  const dashReceita = document.getElementById('dashReceita');
  const dashLucro = document.getElementById('dashLucro');
  if(dashReceita) dashReceita.textContent = `R$ ${receita.toFixed(2).replace('.',',')}`;
  if(dashLucro) dashLucro.textContent = `R$ ${(receita - custoTotal).toFixed(2).replace('.',',')}`;
  
  const ds = document.getElementById('dashSite');
  const df = document.getElementById('dashFisica');
  if(ds) ds.textContent = vendasSite;
  if(df) df.textContent = vendasFisica;
}

// ==========================================
// ESTOQUE
// ==========================================
function renderEstoque() {
  const grid = document.getElementById('stockGrid');
  if(!grid) return;

  grid.innerHTML = products.length === 0
    ? '<p style="color:var(--text2);">Nenhum produto cadastrado.</p>'
    : products.map(p => `
      <div class="stock-card">
        <div class="stock-card-name">${p.name}</div>
        <div class="stock-card-qty ${p.stock<=3?'low':''}">${p.stock}</div>
      </div>
    `).join('');
  
  const sLog = document.getElementById('stockLog');
  if(sLog) sLog.innerHTML = stockLog.length === 0
    ? '<tr><td colspan="5" style="text-align:center">Sem registros.</td></tr>'
    : stockLog.slice(0,10).map(l => `<tr><td>${l.date}</td><td>${l.product}</td><td><span class="status-badge pago">${l.type}</span></td><td>${l.qty}</td><td>${l.user}</td></tr>`).join('');
}

function openStockEntry() {
  const stkProd = document.getElementById('stkProd');
  if(stkProd) stkProd.innerHTML = products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('stockModal').classList.add('show');
}

async function saveStockEntry() {
  const id = document.getElementById('stkProd').value;
  const qty = parseInt(document.getElementById('stkQty').value);
  const type = document.getElementById('stkType').value;
  if (!qty) return;
  const p = products.find(x => x.id === id);
  const delta = type === 'saida' ? -qty : qty;

  // Atomicidade no estoque (entrada/saída/ajuste)
  if (type === 'ajuste') {
    await db.collection("products").doc(id).update({ stock: Math.max(0, qty) });
  } else {
    await db.collection("products").doc(id).update({
      stock: firebase.firestore.FieldValue.increment(delta)
    });
  }

  stockLog.unshift({date: new Date().toLocaleDateString('pt-BR'), product: p.name, type, qty: delta, user: 'Admin'});
  localStorage.setItem('brugnera_stocklog', JSON.stringify(stockLog));
  document.getElementById('stockModal').classList.remove('show');
  renderEstoque();
}

// ==========================================
// 📸 INSTAGRAM → PRODUTO (AUTOMAÇÃO CLAUDE)
// ==========================================
function previewIgImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  handleImageUpload(file, null, null, (dataUrl) => {
    igImageBase64 = dataUrl;
    const igPreview = document.getElementById('igImagePreview');
    if(igPreview) {
        igPreview.src = dataUrl;
        igPreview.style.display = 'block';
    }
  });
}

async function analyzeInstagram() {
  const captionEl = document.getElementById('igCaption');
  if(!captionEl) return;
  const caption = captionEl.value.trim();
  if (!caption && !igImageBase64) {
    alert('Cole a legenda do Instagram ou adicione uma foto do produto.');
    return;
  }

  document.getElementById('igStep1').style.display = 'none';
  document.getElementById('igLoading').style.display = 'flex';
  document.getElementById('igStep2').style.display = 'none';

  try {
    const userContent = [];

    if (igImageBase64) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: igImageBase64.split(',')[1] }
      });
    }

    const promptText = `Você é um assistente de uma loja de moda feminina chamada Brugnera Store.

Analise ${igImageBase64 ? 'a imagem e ' : ''}a legenda do post do Instagram abaixo e extraia as informações do produto para cadastrá-lo no site da loja.

Legenda do Instagram:
"""
${caption || '(sem legenda)'}
"""

Retorne APENAS um JSON válido (sem texto antes ou depois) com este formato:
{
  "nome": "Nome do produto",
  "categoria": "vestidos|blusas|conjuntos|acessorios",
  "preco": 0.00,
  "tamanhos": "P,M,G",
  "descricao": "Descrição bonita do produto para o site (2-3 frases)",
  "legenda_otimizada": "Legenda melhorada para Instagram com emojis e hashtags relevantes (máximo 220 caracteres + hashtags)"
}

Regras:
- Se não encontrar o preço, use 0
- Para categoria, escolha a mais adequada entre as opções
- Para tamanhos, use o que está na legenda ou "P,M,G" se não especificado
- A legenda_otimizada deve ser persuasiva, com emojis no início, terminar com "Link na bio! 🔗" e incluir pelo menos 5 hashtags relevantes como #BrugneraStore #ModaFeminina`;

    userContent.push({ type: "text", text: promptText });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: userContent }]
      })
    });

    if (!response.ok) throw new Error('Erro na API da IA');

    const data = await response.json();
    const rawText = data.content.map(b => b.text || '').join('').trim();

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Resposta da IA inválida');

    igExtractedData = JSON.parse(jsonMatch[0]);

    document.getElementById('igFNome').value = igExtractedData.nome || '';
    document.getElementById('igFCat').value = igExtractedData.categoria || 'vestidos';
    document.getElementById('igFPreco').value = igExtractedData.preco || '';
    document.getElementById('igFTamanhos').value = igExtractedData.tamanhos || 'P,M,G';
    document.getElementById('igFDesc').value = igExtractedData.descricao || '';
    document.getElementById('igGeneratedCaption').textContent = igExtractedData.legenda_otimizada || '';
    document.getElementById('igFEstoque').value = '';

    document.getElementById('igLoading').style.display = 'none';
    document.getElementById('igStep2').style.display = 'block';

  } catch(err) {
    console.error(err);
    document.getElementById('igLoading').style.display = 'none';
    document.getElementById('igStep1').style.display = 'block';
    alert('Erro ao analisar o post: ' + err.message + '\n\nVerifique sua chave da API nas configurações.');
  }
}

async function publishIgProduct() {
  const name = document.getElementById('igFNome').value.trim();
  const estoque = parseInt(document.getElementById('igFEstoque').value) || 0;

  if (!name) return alert('Nome do produto é obrigatório.');
  if (estoque === 0 && !confirm('Estoque está zerado. Publicar mesmo assim?')) return;

  const data = {
    name,
    category: document.getElementById('igFCat').value,
    cost: 0,
    price: parseFloat(document.getElementById('igFPreco').value) || 0,
    stock: estoque,
    sizes: document.getElementById('igFTamanhos').value.split(',').map(s => s.trim()),
    desc: document.getElementById('igFDesc').value,
    images: igImageBase64 ? [igImageBase64] : [], 
    img: igImageBase64 || '',
    channelSite: true,
    channelShopee: false,
    channelPdv: true,
    active: true,
    origem: 'instagram',
    status: 'ativo'
  };

  try {
    const btn = document.querySelector('#pageInstagram .btn-gold');
    if (btn) btn.textContent = 'Publicando...';
    await db.collection("products").add(data);

    if (estoque > 0) {
      stockLog.unshift({date: new Date().toLocaleDateString('pt-BR'), product: name, type: 'entrada', qty: estoque, user: 'Instagram'});
      localStorage.setItem('brugnera_stocklog', JSON.stringify(stockLog));
    }

    alert(`✅ "${name}" publicado no site com sucesso!`);
    resetIg();
  } catch(e) {
    alert('Erro ao publicar: ' + e.message);
  }
}

function copyIgCaption() {
  const textEl = document.getElementById('igGeneratedCaption');
  if(textEl) {
    navigator.clipboard.writeText(textEl.textContent).then(() => alert('Legenda copiada!'));
  }
}

function resetIg() {
  igExtractedData = null;
  igImageBase64 = null;
  const captionEl = document.getElementById('igCaption');
  if(captionEl) captionEl.value = '';
  const imgFileEl = document.getElementById('igImageFile');
  if(imgFileEl) imgFileEl.value = '';
  const imgPreviewEl = document.getElementById('igImagePreview');
  if(imgPreviewEl) imgPreviewEl.style.display = 'none';
  
  const step1 = document.getElementById('igStep1');
  if(step1) step1.style.display = 'block';
  const step2 = document.getElementById('igStep2');
  if(step2) step2.style.display = 'none';
  const loading = document.getElementById('igLoading');
  if(loading) loading.style.display = 'none';
}

// ==========================================
// 🤖 IA MARKETING
// ==========================================
function updateAiSelect() {
  const sel = document.getElementById('aiProdSelect');
  if(!sel) return;
  sel.innerHTML = products.length === 0
    ? '<option value="">Cadastre produtos primeiro</option>'
    : '<option value="">— Selecione um produto —</option>' + products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function setAiType(type, el) {
  currentAiType = type;
  document.querySelectorAll('.ai-type-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

async function generateAI() {
  const prodId = document.getElementById('aiProdSelect').value;
  if (!prodId) return alert("Selecione um produto.");
  const prod = products.find(p => p.id === prodId);
  if (!prod) return;

  document.getElementById('aiLoading').classList.add('show');
  document.getElementById('aiResultArea').style.display = 'none';

  const prompts = {
    legenda: `Crie uma legenda para o Instagram para vender o produto "${prod.name}" da loja Brugnera Store (moda feminina premium). Categoria: ${prod.category}. Preço: R$ ${prod.price.toFixed(2)}. Tamanhos: ${prod.sizes?.join(', ')}. Descrição: ${prod.desc || 'produto de moda feminina'}. Seja criativa, use emojis, crie urgência, termine com "Link na bio! 🔗" e coloque 7-10 hashtags relevantes. Máximo 280 caracteres + hashtags.`,
    shopee: `Crie uma descrição de produto para a Shopee para: "${prod.name}". Categoria: ${prod.category}. Preço: R$ ${prod.price.toFixed(2)}. Tamanhos: ${prod.sizes?.join(', ')}. ${prod.desc || ''}. Inclua: título chamativo, descrição detalhada de tecido/caimento, tabela de tamanhos, informações de envio, aviso sobre cor (pode variar conforme tela). Seja persuasiva e profissional.`,
    stories: `Crie um roteiro de Stories do Instagram para divulgar "${prod.name}" da loja Brugnera Store. Preço: R$ ${prod.price.toFixed(2)}. Inclua: 1) Tela de abertura impactante 2) Apresentação do produto 3) Detalhes e diferenciais 4) CTA para o link na bio. Para cada tela, diga o texto na tela, a música/som sugerido e uma instrução de criação. Seja dinâmica e use tendências do Instagram.`,
    relatorio: `Analise os dados desta loja de moda feminina e gere insights de marketing:
Produtos cadastrados: ${products.length}
Produtos com estoque baixo (≤3): ${products.filter(p => p.stock <= 3).length}
Total de pedidos: ${orders.length}
Faturamento: R$ ${orders.reduce((a,o)=>a+(o.value||0),0).toFixed(2)}
Pedidos online: ${orders.filter(o=>o.origin!=='Loja Física').length}
Pedidos físicos: ${orders.filter(o=>o.origin==='Loja Física').length}

Gere: 3 insights de performance, 3 sugestões de ação imediata para aumentar vendas, 1 ideia de campanha de marketing para o próximo mês. Use emojis e seja direta e prática.`
  };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompts[currentAiType] }]
      })
    });

    if (!response.ok) throw new Error('Erro na API');
    const data = await response.json();
    const result = data.content.map(b => b.text || '').join('').trim();

    document.getElementById('tabResultado').textContent = result;
    document.getElementById('aiResultArea').style.display = 'block';
  } catch(err) {
    document.getElementById('tabResultado').textContent = '❌ Erro ao gerar conteúdo: ' + err.message;
    document.getElementById('aiResultArea').style.display = 'block';
  } finally {
    document.getElementById('aiLoading').classList.remove('show');
  }
}

function copyAiResult() {
  const text = document.getElementById('tabResultado').textContent;
  navigator.clipboard.writeText(text).then(() => alert('Copiado!'));
}
