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

// Endpoint da função de frete (Cloud Function -> Melhor Envio)
const FRETE_API = "https://us-central1-brugnerastore.cloudfunctions.net/calcularFrete";

// ==========================================
// ESTADOS GLOBAIS
// ==========================================
let onlineProducts = [];
let cart = JSON.parse(localStorage.getItem('brugnera_cart') || '[]');
let currentProduct = null;
let selectedSize = null;

// LÓGICA DO CARROSSEL
let currentCarouselIndex = 0;
let carouselImagesArray = [];
let selectedColorIndex = 0; // qual cor o cliente está vendo no momento
let touchstartX = 0;
let touchendX = 0;

// Retorna as CORES de um produto (cada uma com suas fotos).
// Produtos antigos (sem 'cores') viram uma única cor com as fotos atuais.
function getProductColors(p) {
  if (p && Array.isArray(p.cores) && p.cores.length) {
    // Foto de capa pra usar em cores que não têm foto própria (assim a cor não some da vitrine)
    const primeiraComFoto = p.cores.find(c => c.imagens && c.imagens.length);
    const fallback = p.img || (p.images && p.images[0]) || (primeiraComFoto ? primeiraComFoto.imagens[0] : '') || '';
    const cores = p.cores.map(c => {
      const imgs = (c.imagens && c.imagens.length) ? c.imagens : (fallback ? [fallback] : []);
      return { nome: c.nome || '', hex: c.hex || '', imagens: imgs, grade: Array.isArray(c.grade) ? c.grade : [] };
    }).filter(c => c.imagens.length > 0); // só descarta se não existe NENHUMA imagem disponível
    if (cores.length) return cores;
  }
  // Legado: uma cor só. Monta a grade a partir dos tamanhos/estoque do produto.
  const imgs = (p && p.images && p.images.length) ? p.images : (p && p.img ? [p.img] : []);
  const sizes = (p && p.sizes && p.sizes.length) ? p.sizes : ['U'];
  const stock = parseInt(p && p.stock) || 0;
  const grade = sizes.map(t => ({ tamanho: t, estoque: stock })); // legado: todos os tamanhos usam o estoque do produto
  return [{ nome: '', hex: '', imagens: imgs, grade }];
}

// Estoque de uma variação específica (cor + tamanho)
function getVariantStock(p, colorName, size) {
  const cores = getProductColors(p);
  const cor = cores.find(c => (c.nome || '') === (colorName || '')) || cores[0];
  if (!cor) return 0;
  const item = (cor.grade || []).find(s => s.tamanho === size);
  return item ? (parseInt(item.estoque) || 0) : 0;
}

// Variáveis para o Checkout com Frete
let cartSubtotalValue = 0;
let cartShippingValue = 0;
let cartTotalValue = 0;

// ===== PIX (copia-e-cola / QR estático com valor) =====
const STORE_WA = '554796629668';
const PIX_DADOS = { chave: '29bf1696-b20c-4ea2-8a6a-cf50ca024fed', nome: 'Claudiane Brugnera dos Santos', cidade: 'Barra Velha' };
function pixCrc16(s){let c=0xFFFF;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let j=0;j<8;j++){c=(c&0x8000)?((c<<1)^0x1021):(c<<1);c&=0xFFFF;}}return c.toString(16).toUpperCase().padStart(4,'0');}
function pixTlv(id,v){return id+v.length.toString().padStart(2,'0')+v;}
function gerarPixBRCode(valor){
  const nome = PIX_DADOS.nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().slice(0,25);
  const cidade = PIX_DADOS.cidade.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().slice(0,15);
  const ma = pixTlv('00','BR.GOV.BCB.PIX') + pixTlv('01', PIX_DADOS.chave);
  let p = pixTlv('00','01') + pixTlv('01','11') + pixTlv('26', ma) + pixTlv('52','0000') + pixTlv('53','986') + (valor ? pixTlv('54', Number(valor).toFixed(2)) : '') + pixTlv('58','BR') + pixTlv('59', nome) + pixTlv('60', cidade) + pixTlv('62', pixTlv('05','***'));
  p += '6304';
  return p + pixCrc16(p);
}
let pixCopiaAtual = '';
let selectedShippingName = "";

// ==========================================
// HELPERS DE PREÇO E CONVERSÃO
// ==========================================
function fmt(n) { return Number(n || 0).toFixed(2).replace('.', ','); }

// Desconto honesto: só calcula se houver um preço "de" REAL maior que o preço atual.
function calcDiscount(p) {
  if (p && p.oldPrice && Number(p.oldPrice) > Number(p.price)) {
    return Math.round((p.oldPrice - p.price) / p.oldPrice * 100);
  }
  return 0;
}

// ==========================================
// ESCUTAR BANCO EM TEMPO REAL
// ==========================================
db.collection("products")
  .where("active", "==", true)
  .where("channelSite", "==", true)
  .onSnapshot((snapshot) => {
    onlineProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderFilters(); // <--- ETAPA 2: CHAMA A CRIAÇÃO DOS BOTÕES
    renderProducts(onlineProducts);
    renderInsta(); // Galeria usa as fotos dos produtos — atualiza quando eles chegam
    abrirProdutoDaURL(); // Deep-link: ?produto=ID abre a peça direto
});

// Abre o produto indicado na URL (link compartilhado) — roda só 1 vez
let deepLinkAberto = false;
function abrirProdutoDaURL() {
  if (deepLinkAberto) return;
  const id = new URLSearchParams(location.search).get('produto');
  if (!id) { deepLinkAberto = true; return; }
  const p = onlineProducts.find(x => x.id === id);
  if (p) { deepLinkAberto = true; openProductModal(id); }
}

// ==========================================
// CATEGORIAS DINÂMICAS (ETAPA 2)
// ==========================================
function renderFilters() {
  const filtersDiv = document.getElementById('dynamicFilters');
  const availableProducts = onlineProducts.filter(p => p.stock > 0);
  const categories = [...new Set(availableProducts.map(p => p.category))].filter(Boolean);
  
  if (categories.length === 0) {
    filtersDiv.innerHTML = '<p style="color:var(--gray); font-size:0.8rem;">Nenhuma coleção disponível no momento.</p>';
    return;
  }

  let html = `<button class="filter-btn active" onclick="filterProducts('all', this)">Tudo</button>`;
  categories.forEach(cat => {
    html += `<button class="filter-btn" onclick="filterProducts('${cat}', this)">${cat}</button>`;
  });
  filtersDiv.innerHTML = html;
}

// ==========================================
// RENDERIZAÇÃO DA VITRINE (com conversão)
// ==========================================
function renderProducts(list) {
  const grid = document.getElementById('productsGrid');
  
  const disponiveis = list.filter(p => p.stock > 0);
  const esgotados = list.filter(p => !(p.stock > 0));
  const inStockList = [...disponiveis, ...esgotados]; // esgotados no fim, com selo
  
  if (inStockList.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: white; border: 1px solid var(--border);">
        <h3 style="font-family:'Playfair Display', serif; font-size: 2rem; color: var(--gold); margin-bottom: 16px;">Coleção em Construção</h3>
        <p style="font-size: 1.1rem; color: var(--gray);">Estamos preparando e trazendo as melhores peças para você. Aguarde as novidades em breve!</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = inStockList.map(p => {
    const allImgs = (p.images && p.images.length > 0) ? p.images : (p.img ? [p.img] : []);
    const mainImg = allImgs[0] || '';
    const temCarrossel = allImgs.length > 1;
    const disc = calcDiscount(p);
    const cores = getProductColors(p);
    const dotsHtml = cores.length > 1
      ? `<div class="card-colors">${cores.slice(0,5).map(c => `<span class="card-color-dot" style="background:${c.hex || '#ccc'}" title="${(c.nome||'').replace(/"/g,'&quot;')}"></span>`).join('')}${cores.length > 5 ? `<span class="card-color-more">+${cores.length - 5}</span>` : ''}</div>`
      : '';

    // Badges baseados em dados REAIS (oferta, mais vendido, escassez real)
    const esgotado = !(p.stock > 0);
    const badges = [];
    if (disc > 0 && !esgotado) badges.push(`<span class="badge badge-offer">−${disc}% OFF</span>`);
    if (p.bestseller) badges.push(`<span class="badge badge-bestseller">★ Mais vendido</span>`);
    if (p.stock <= 3) badges.push(`<span class="badge badge-last">🔥 Últimas ${p.stock}</span>`);

    // Carrossel leve: guarda todas as imagens em data-attr, alterna no hover/touch
    const imgsData = temCarrossel ? `data-imgs='${JSON.stringify(allImgs.map(i => cdnImg(i, 600))).replace(/'/g, "&#39;")}'` : '';
    const carHint = temCarrossel ? `<span class="card-car-hint">${allImgs.length} fotos</span>` : '';

    return `
    <article class="product-card">
      <div class="product-img-wrap" onclick="openProductModal('${p.id}')"
           ${imgsData}
           onmouseenter="iniciarCarrossel(this)" onmouseleave="pararCarrossel(this)"
           ontouchstart="iniciarCarrossel(this)">
        ${badges.length ? `<div class="product-badges">${badges.join('')}</div>` : ''}
        <img src="${cdnImg(mainImg, 600)}" alt="${p.name}" loading="lazy">${esgotado ? '<span class="selo-esgotado">ESGOTADO</span>' : ''}
        ${carHint}
        <button class="product-quick-add">Ver peça</button>
      </div>
      <div class="product-info">
        <h3>${p.name}</h3>
        ${dotsHtml}
        <div class="price-row">
          ${disc > 0 ? `<span class="price-old">R$ ${fmt(p.oldPrice)}</span>` : ''}
          <span class="price-now">R$ ${fmt(p.price)}</span>
        </div>
        <div class="installments">💳 ou em até 12x no cartão</div>
      </div>
    </article>
  `}).join('');
}

// ===== Carrossel leve nos cards (só roda no card ativo, não pesa a página) =====
function iniciarCarrossel(wrap) {
  if (wrap._carTimer) return;
  let imgs;
  try { imgs = JSON.parse(wrap.getAttribute('data-imgs') || '[]'); } catch(e) { return; }
  if (!imgs || imgs.length < 2) return;
  const imgEl = wrap.querySelector('img');
  if (!imgEl) return;
  let i = 0;
  wrap._carTimer = setInterval(() => {
    i = (i + 1) % imgs.length;
    imgEl.src = imgs[i];
  }, 900);
}
function pararCarrossel(wrap) {
  if (wrap._carTimer) { clearInterval(wrap._carTimer); wrap._carTimer = null; }
  try {
    const imgs = JSON.parse(wrap.getAttribute('data-imgs') || '[]');
    const imgEl = wrap.querySelector('img');
    if (imgs[0] && imgEl) imgEl.src = imgs[0]; // volta pra foto principal
  } catch(e) {}
}

let categoriaAtiva = 'all';
let buscaAtiva = '';

function filterProducts(cat, btn) {
  document.querySelectorAll('#dynamicFilters .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  categoriaAtiva = cat;
  aplicarFiltrosCatalogo();
}

function buscarCatalogo(termo) {
  buscaAtiva = (termo || '').toLowerCase().trim();
  aplicarFiltrosCatalogo();
}

function aplicarFiltrosCatalogo() {
  let lista = categoriaAtiva === 'all' ? onlineProducts : onlineProducts.filter(p => p.category === categoriaAtiva);
  if (buscaAtiva) {
    lista = lista.filter(p => {
      const alvo = [p.name, p.description, p.category, (p.sizes || []).join(' ')].join(' ').toLowerCase();
      return alvo.includes(buscaAtiva);
    });
  }
  renderProducts(lista);
}

// ==========================================
// MODAL TELA CHEIA E CARROSSEL COM EFEITO GHOST
// ==========================================
function openProductModal(id) {
  const p = onlineProducts.find(x => x.id === id);
  if(!p || p.stock <= 0) return showToast("Produto esgotado.");

  currentProduct = p; 
  selectedSize = null;
  selectedColorIndex = 0;

  const cores = getProductColors(p);
  carouselImagesArray = cores[0].imagens;
  currentCarouselIndex = 0;
  
  renderCarousel();
  renderColorSwatches();

  document.getElementById('modalName').textContent = p.name;

  // Preço (com promoção honesta, se houver)
  const disc = calcDiscount(p);
  const priceEl = document.getElementById('modalPrice');
  if (disc > 0) {
    priceEl.innerHTML = `<span class="modal-old-price">De R$ ${fmt(p.oldPrice)}</span>R$ ${fmt(p.price)}<span class="modal-off-pill">−${disc}% OFF</span>`;
  } else {
    priceEl.innerHTML = `R$ ${fmt(p.price)}`;
  }

  document.getElementById('modalPix').textContent = '';
  document.getElementById('modalDesc').textContent = p.desc || "Peça exclusiva Brugnera Store.";

  // Tamanhos + estoque da COR selecionada (atualiza a mensagem de estoque também)
  renderModalSizes();

  // Sinais de confiança (criados via JS — não precisa mexer no HTML)
  renderModalTrust();
  
  document.getElementById('prodOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  // Link compartilhável: coloca ?produto=ID na URL sem recarregar
  try { history.replaceState(null, '', `${location.pathname}?produto=${id}`); } catch(e) {}
}

// Compartilhar produto (Instagram/WhatsApp): usa share nativo ou copia o link
function compartilharProduto() {
  if (!currentProduct) return;
  const url = `${location.origin}${location.pathname}?produto=${currentProduct.id}`;
  const texto = `${currentProduct.name} — Brugnera Store`;
  if (navigator.share) {
    navigator.share({ title: texto, text: texto, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url)
      .then(() => showToast('Link copiado! 📋'))
      .catch(() => showToast('Não foi possível copiar o link.'));
  }
}

function renderModalTrust() {
  let trustEl = document.getElementById('modalTrust');
  if (!trustEl) {
    trustEl = document.createElement('div');
    trustEl.id = 'modalTrust';
    trustEl.className = 'prod-trust';
    const stockEl = document.getElementById('modalStock');
    if (stockEl && stockEl.parentNode) {
      stockEl.parentNode.insertBefore(trustEl, stockEl.nextSibling);
    }
  }
  trustEl.innerHTML = `
    <span>🔒 <b>Compra segura</b></span>
    <span>📦 Enviamos p/ todo o Brasil</span>
    <span>🔁 Troca facilitada</span>
    <button type="button" onclick="compartilharProduto()" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:0.8rem;">🔗 Compartilhar</button>
  `;
}

function renderColorSwatches() {
  const cores = getProductColors(currentProduct);
  let el = document.getElementById('modalColors');

  // Com 1 cor só (ou produto antigo) não mostra seletor de cor
  if (cores.length <= 1) { if (el) el.style.display = 'none'; return; }

  // Cria o bloco de cores 1x e encaixa logo acima do seletor de tamanho
  if (!el) {
    el = document.createElement('div');
    el.id = 'modalColors';
    el.className = 'modal-colors';
    const sizesEl = document.getElementById('modalSizes');
    if (sizesEl && sizesEl.parentNode) sizesEl.parentNode.insertBefore(el, sizesEl);
  }
  el.style.display = '';

  const ativa = cores[selectedColorIndex] || cores[0];
  el.innerHTML = `
    <div class="modal-colors-label">Cor: <b>${(ativa.nome || 'Única').replace(/</g,'&lt;')}</b></div>
    <div class="modal-colors-dots">
      ${cores.map((c, i) => `
        <button type="button" class="color-swatch ${i === selectedColorIndex ? 'active' : ''}"
                title="${(c.nome || '').replace(/"/g,'&quot;')}" onclick="selectColor(${i})">
          <span style="background:${c.hex || '#cccccc'}"></span>
        </button>`).join('')}
    </div>`;
}

function selectColor(i) {
  const cores = getProductColors(currentProduct);
  if (i < 0 || i >= cores.length) return;
  selectedColorIndex = i;
  carouselImagesArray = cores[i].imagens;
  currentCarouselIndex = 0;
  renderCarousel();
  renderColorSwatches();
  renderModalSizes(); // troca os tamanhos/estoque pra os desta cor
}

// Renderiza os botões de tamanho da COR ativa (esgotado = riscado e desabilitado)
function renderModalSizes() {
  const cont = document.getElementById('modalSizes');
  if (!cont || !currentProduct) return;
  const cores = getProductColors(currentProduct);
  const cor = cores[selectedColorIndex] || cores[0];
  const grade = (cor && Array.isArray(cor.grade)) ? cor.grade : [];

  selectedSize = null; // ao trocar de cor, zera o tamanho escolhido

  if (!grade.length) {
    const sizes = currentProduct.sizes || ['U'];
    cont.innerHTML = sizes.map(s => `<button class="size-btn" onclick="selectSize('${s}', this)">${s}</button>`).join('');
  } else {
    cont.innerHTML = grade.map(s => {
      const esgotado = (parseInt(s.estoque) || 0) <= 0;
      const tam = (s.tamanho || '').replace(/'/g, '');
      return `<button class="size-btn ${esgotado ? 'sold-out' : ''}" ${esgotado ? 'disabled' : ''} onclick="selectSize('${tam}', this)">${s.tamanho}</button>`;
    }).join('');
  }
  atualizarStockMsg();
}

// Atualiza a mensagem de estoque conforme cor + tamanho escolhidos
function atualizarStockMsg() {
  const el = document.getElementById('modalStock');
  if (!el || !currentProduct) return;
  const cores = getProductColors(currentProduct);
  const cor = cores[selectedColorIndex] || cores[0];
  const grade = (cor && Array.isArray(cor.grade)) ? cor.grade : [];
  const totalCor = grade.reduce((n, s) => n + (parseInt(s.estoque) || 0), 0);

  if (!selectedSize) {
    el.textContent = totalCor <= 0 ? 'Esgotado nesta cor 😔' : 'Selecione um tamanho';
    return;
  }
  const item = grade.find(s => s.tamanho === selectedSize);
  const est = item ? (parseInt(item.estoque) || 0) : 0;
  if (est <= 0) el.textContent = `Tamanho ${selectedSize} esgotado nesta cor`;
  else if (est <= 3) el.textContent = `⚠️ Últimas ${est} no tamanho ${selectedSize}!`;
  else el.textContent = `✓ ${est} disponíveis no tamanho ${selectedSize}`;
}

function renderCarousel() {
  const container = document.getElementById('carouselContainer');
  const dots = document.getElementById('carouselDots');
  
  container.innerHTML = carouselImagesArray.map((img, index) => `
    <img src="${cdnImg(img, 900)}" class="carousel-img ${index === currentCarouselIndex ? 'active' : ''}">
  `).join('');
  
  dots.innerHTML = carouselImagesArray.map((_, index) => `
    <div class="dot ${index === currentCarouselIndex ? 'active' : ''}" onclick="goToImage(event, ${index})"></div>
  `).join('');
}

function nextImage(e) {
  if(e) e.stopPropagation();
  currentCarouselIndex = (currentCarouselIndex + 1) % carouselImagesArray.length;
  renderCarousel();
}

function prevImage(e) {
  if(e) e.stopPropagation();
  currentCarouselIndex = (currentCarouselIndex - 1 + carouselImagesArray.length) % carouselImagesArray.length;
  renderCarousel();
}

function goToImage(e, index) {
  if(e) e.stopPropagation();
  currentCarouselIndex = index;
  renderCarousel();
}

const slider = document.getElementById('carouselArea');
slider.addEventListener('touchstart', e => { touchstartX = e.changedTouches[0].screenX; }, {passive: true});
slider.addEventListener('touchend', e => { 
  touchendX = e.changedTouches[0].screenX; 
  if (touchendX < touchstartX - 40) nextImage(); 
  if (touchendX > touchstartX + 40) prevImage(); 
}, {passive: true});

function selectSize(size, btn) {
  selectedSize = size;
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  atualizarStockMsg();
}

function closeProdModal() {
  document.getElementById('prodOverlay').classList.remove('open');
  document.body.style.overflow = '';
  currentProduct = null; 
  selectedSize = null;
  // Remove ?produto=ID da URL ao fechar
  try { history.replaceState(null, '', location.pathname); } catch(e) {}
}

function handleProdClick(e) { if (e.target === document.getElementById('prodOverlay')) closeProdModal(); }

// ==========================================
// CARRINHO DE COMPRAS E FRETE
// ==========================================
function saveCart() { localStorage.setItem('brugnera_cart', JSON.stringify(cart)); updateCartUI(); }

function addToCartFromModal() {
  if (!currentProduct) return;
  if (!selectedSize) { showToast('Selecione um tamanho para continuar.'); return; }

  const cor = getProductColors(currentProduct)[selectedColorIndex] || {};
  const corNome = cor.nome || '';
  const variantStock = getVariantStock(currentProduct, corNome, selectedSize);

  if (variantStock <= 0) { showToast('Esse tamanho/cor está esgotado.'); return; }

  const existing = cart.find(i => i.id === currentProduct.id && i.size === selectedSize && (i.color || '') === corNome);
  if (existing) {
    if (existing.qty < variantStock) existing.qty++;
    else return showToast('Estoque máximo atingido!');
  } else {
    const cartImg = (cor.imagens && cor.imagens.length) ? cor.imagens[0]
                    : (currentProduct.images && currentProduct.images.length ? currentProduct.images[0] : (currentProduct.img || ''));
    cart.push({ id: currentProduct.id, name: currentProduct.name, price: currentProduct.price, img: cartImg, size: selectedSize, color: corNome, qty: 1, peso: parseFloat(currentProduct.peso) || 0 });
  }

  saveCart();
  const nomeAdicionado = currentProduct.name;
  closeProdModal();
  mostrarPopupCarrinho(nomeAdicionado);
}

// ITEM 4 (Clau): após adicionar, oferece continuar ou finalizar
let popupCarrinhoTimer = null;
function mostrarPopupCarrinho(nome) {
  fecharPopupCarrinho();
  const el = document.createElement('div');
  el.className = 'added-popup';
  el.id = 'addedPopup';
  el.innerHTML = `
    <span style="font-size:0.88rem;">✓ <b>${nome}</b> no carrinho!</span>
    <button class="btn-continuar" onclick="fecharPopupCarrinho()">Continuar comprando</button>
    <button class="btn-finalizar" onclick="fecharPopupCarrinho(); toggleCart();">Finalizar compra</button>`;
  document.body.appendChild(el);
  popupCarrinhoTimer = setTimeout(fecharPopupCarrinho, 6000);
}
function fecharPopupCarrinho() {
  if (popupCarrinhoTimer) { clearTimeout(popupCarrinhoTimer); popupCarrinhoTimer = null; }
  const el = document.getElementById('addedPopup');
  if (el) el.remove();
}

function updateCartUI() {
  const count = cart.reduce((a,b) => a + b.qty, 0);
  document.getElementById('cartCount').textContent = count;
  
  cartSubtotalValue = cart.reduce((a,b) => a + b.price * b.qty, 0);
  document.getElementById('cartSubtotal').textContent = `R$ ${cartSubtotalValue.toFixed(2).replace('.',',')}`;
  document.getElementById('cartTotal').textContent = `R$ ${cartSubtotalValue.toFixed(2).replace('.',',')}`;
  
  const container = document.getElementById('cartItems');
  if (cart.length === 0) {
    container.innerHTML = '<p style="color:var(--gray);text-align:center;margin-top:40px;font-size:0.85rem;">Seu carrinho está vazio</p>';
    return;
  }
  
  container.innerHTML = cart.map((item, idx) => `
    <article class="cart-item">
      <img class="cart-item-img" src="${cdnImg(item.img, 200)}" alt="${item.name}">
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        ${item.color ? `<div class="size">Cor: ${item.color}</div>` : ''}
        <div class="size">Tamanho: ${item.size}</div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeQty(${idx}, -1)">−</button>
          <span>${item.qty}</span>
          <button class="qty-btn" onclick="changeQty(${idx}, 1)">+</button>
        </div>
      </div>
      <div class="cart-item-price">R$ ${(item.price * item.qty).toFixed(2).replace('.',',')}</div>
    </article>
  `).join('');
}

function changeQty(index, delta) {
  const item = cart[index];
  if (!item) return;
  
  const p = onlineProducts.find(x => x.id === item.id);
  if (delta > 0 && p) {
    const vstock = getVariantStock(p, item.color || '', item.size);
    if (item.qty >= vstock) return showToast("Estoque máximo atingido!");
  }

  item.qty += delta;
  if (item.qty <= 0) cart.splice(index, 1);
  saveCart();
}

function toggleCart() { document.getElementById('cartOverlay').classList.toggle('open'); }
function handleCartClick(e) { if (e.target === document.getElementById('cartOverlay')) toggleCart(); }

function openCheckoutModal() {
  if (cart.length === 0) { showToast('Adicione produtos ao carrinho primeiro.'); return; }
  
  cartShippingValue = 0;
  selectedShippingName = "";
  document.getElementById('shippingSection').style.display = 'none';
  document.querySelectorAll('input[name="shippingOpt"]').forEach(r => r.checked = false);
  
  atualizarTotalCheckout();
  document.getElementById('checkoutModal').style.display = 'flex';
}

function atualizarTotalCheckout() {
  let subtotal = cartSubtotalValue;
  const paymentMethod = document.getElementById('clientPayment').value;
  // Desconto no Pix removido a pedido da loja — Pix agora é preço cheio.
  
  cartTotalValue = subtotal + cartShippingValue;
  
  document.getElementById('chkSubtotalVal').textContent = subtotal.toFixed(2).replace('.',',');
  document.getElementById('chkFreteVal').textContent = cartShippingValue.toFixed(2).replace('.',',');
  document.getElementById('chkTotalVal').textContent = cartTotalValue.toFixed(2).replace('.',',');
}

function buscarCEP(cep) {
  const cepLimpo = cep.replace(/\D/g, '');
  // Máscara visual 00000-000
  const campoCep = document.getElementById('clientCEP');
  if (campoCep) campoCep.value = cepLimpo.length > 5 ? cepLimpo.slice(0,5) + '-' + cepLimpo.slice(5,8) : cepLimpo;
  if (cepLimpo.length === 8) {
    document.getElementById('cepLoader').style.display = 'block';
    
    fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      .then(res => res.json())
      .then(dados => {
        document.getElementById('cepLoader').style.display = 'none';
        if(dados.erro) {
          showToast('CEP não encontrado.');
          document.getElementById('addressFields').style.display = 'none';
        } else {
          document.getElementById('clientRua').value = dados.logradouro;
          document.getElementById('clientBairro').value = dados.bairro;
          document.getElementById('clientCidade').value = dados.localidade;
          document.getElementById('clientUF').value = dados.uf;
          
          document.getElementById('addressFields').style.display = 'block';
          document.getElementById('shippingSection').style.display = 'block';
          // CEP genérico (cidade sem logradouro): cliente digita a rua manualmente
          if (!dados.logradouro) document.getElementById('clientRua').focus();
          else document.getElementById('clientNum').focus();

          // Busca o frete REAL no Melhor Envio para este CEP
          calcularFreteReal(cepLimpo);
        }
      })
      .catch(err => {
        document.getElementById('cepLoader').style.display = 'none';
        showToast('Erro ao buscar o CEP.');
      });
  }
}

let tipoEntregaAtual = 'entrega';

function setTipoEntrega(tipo) {
  tipoEntregaAtual = tipo;
  const secEnd = document.getElementById('secaoEndereco');
  const info = document.getElementById('retiradaInfo');
  if (tipo === 'retirada') {
    secEnd.style.display = 'none';
    selecionarFrete(0, 'Retirada na Loja');
    const lin1 = LOJA_RETIRADA.endereco ? `<b>📍 ${LOJA_RETIRADA.endereco}</b><br>` : '';
    const lin2 = LOJA_RETIRADA.horario ? `🕐 ${LOJA_RETIRADA.horario}<br>` : '';
    info.innerHTML = `${lin1}${lin2}Você retira sua peça sem pagar frete. Combinamos os detalhes pelo WhatsApp assim que o pedido for confirmado 💛`;
    info.style.display = 'block';
  } else {
    secEnd.style.display = 'block';
    info.style.display = 'none';
    cartShippingValue = 0;
    selectedShippingName = "";
    atualizarTotalCheckout();
  }
}

function selecionarFrete(valor, nome) {
  cartShippingValue = valor;
  selectedShippingName = nome;
  atualizarTotalCheckout();
}

// Consulta o frete REAL (Cloud Function -> Melhor Envio) e renderiza as opções
// 🏠 Retirada na loja — preencher com endereço/horário da Clau quando ela passar
const LOJA_RETIRADA = {
  endereco: "Av. Itajuba, 4054 — Itajuba, Barra Velha/SC",
  horario: "Seg a Sex, 9h30–12h e 13h–18h30 · Sáb, 9h30–18h30"
};

// Otimiza URLs do Cloudinary (WebP automático + compressão + largura certa)
function cdnImg(url, w = 600) {
  if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  if (/\/upload\/[a-z]_/.test(url)) return url; // já tem transformação
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${w}/`);
}

const FRETE_GRATIS_MIN = 249; // Pedidos a partir deste valor têm frete grátis (definido pela Clau)

function subtotalCarrinho() {
  return cart.reduce((s, i) => s + (parseFloat(i.price) || 0) * (i.qty || 1), 0);
}

async function calcularFreteReal(cep) {
  const container = document.getElementById('shippingOptions');
  if (!container) return;

  // Zera frete anterior e mostra carregamento
  cartShippingValue = 0;
  selectedShippingName = "";
  atualizarTotalCheckout();
  container.innerHTML = '<p style="font-size:0.85rem;color:var(--gray);">📦 Calculando frete...</p>';

  const subtotal = subtotalCarrinho();
  const temFreteGratis = subtotal >= FRETE_GRATIS_MIN;

  try {
    // Soma o peso real das peças no carrinho (usa o padrão da função se a peça não tiver peso)
    const pesoTotal = cart.reduce((s, i) => s + (parseFloat(i.peso) || 0.3) * (i.qty || 1), 0);
    const resp = await fetch(`${FRETE_API}?cep=${cep}&peso=${pesoTotal.toFixed(3)}`);
    const data = await resp.json();

    if (!data.ok || !Array.isArray(data.opcoes) || data.opcoes.length === 0) {
      if (temFreteGratis) { renderFreteGratis(container, null); return; }
      container.innerHTML = '<p style="font-size:0.85rem;color:var(--rose);">Não conseguimos calcular o frete para este CEP agora. Confira o CEP e tente novamente.</p>';
      return;
    }

    // Mais barato primeiro
    const opcoes = data.opcoes.slice().sort((a, b) => a.preco - b.preco);

    // 🎁 Frete grátis: mostra opção única já selecionada (usa o prazo da opção mais barata)
    if (temFreteGratis) { renderFreteGratis(container, opcoes[0]); return; }

    const faltam = FRETE_GRATIS_MIN - subtotal;
    const hintGratis = `<p style="font-size:0.82rem;color:var(--gold);margin-bottom:8px;">💛 Faltam <b>R$ ${faltam.toFixed(2).replace('.', ',')}</b> para ganhar <b>Frete Grátis</b>!</p>`;

    container.innerHTML = hintGratis + opcoes.map((o) => {
      const label = `${o.transportadora} ${o.nome}`.trim();
      const precoFmt = Number(o.preco).toFixed(2).replace('.', ',');
      const labelSafe = label.replace(/'/g, "");
      return `
        <label class="ship-opt">
          <input type="radio" name="shippingOpt" value="${label}"
                 onchange="selecionarFrete(${Number(o.preco)}, '${labelSafe}')">
          <span><b>${label}</b> (${o.prazoDias} dias úteis) — R$ ${precoFmt}</span>
        </label>
      `;
    }).join('');
  } catch (e) {
    if (temFreteGratis) { renderFreteGratis(container, null); return; }
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--rose);">Erro ao calcular o frete. Verifique sua conexão e tente de novo.</p>';
  }
}

function renderFreteGratis(container, opcaoBase) {
  const prazo = opcaoBase ? ` (até ${opcaoBase.prazoDias} dias úteis)` : '';
  container.innerHTML = `
    <label class="ship-opt" style="border-color:var(--gold);">
      <input type="radio" name="shippingOpt" value="Frete Grátis" checked
             onchange="selecionarFrete(0, 'Frete Grátis')">
      <span><b>🎁 Frete Grátis</b>${prazo} — <b style="color:var(--gold);">R$ 0,00</b></span>
    </label>
    <p style="font-size:0.78rem;color:var(--gray);margin-top:6px;">Você ganhou frete grátis por comprar acima de R$ ${FRETE_GRATIS_MIN.toFixed(2).replace('.', ',')} 💛</p>
  `;
  selecionarFrete(0, 'Frete Grátis');
}

async function confirmOnlinePurchase() {
  const name = document.getElementById('clientName').value.trim();
  const phone = document.getElementById('clientPhone').value.trim();
  const payment = document.getElementById('clientPayment').value;
  
  const cep = document.getElementById('clientCEP').value;
  const num = document.getElementById('clientNum').value;
  
  if(!name || !phone) return showToast("Preencha seu Nome e WhatsApp.");
  const ehRetirada = tipoEntregaAtual === 'retirada';
  if(!ehRetirada && (!cep || !num)) return showToast("Por favor, preencha o CEP e o Número da residência.");
  if(!selectedShippingName) return showToast("Selecione uma opção de Frete.");
  if(cart.length === 0) return showToast("Carrinho vazio.");

  let fullAddress;
  if (ehRetirada) {
    fullAddress = "🏠 RETIRADA NA LOJA" + (LOJA_RETIRADA.endereco ? ` — ${LOJA_RETIRADA.endereco}` : "");
  } else {
    const rua = document.getElementById('clientRua').value;
    const comp = document.getElementById('clientComp').value;
    const bairro = document.getElementById('clientBairro').value;
    const cidade = document.getElementById('clientCidade').value;
    const uf = document.getElementById('clientUF').value;
    fullAddress = `${rua}, ${num} ${comp ? '('+comp+')' : ''} - ${bairro}, ${cidade}/${uf} - CEP: ${cep}`;
  }

  let totalCost = 0;
  let itemsArray = [];
  let itemsDetail = [];

  for(let item of cart) {
    const p = onlineProducts.find(x => x.id === item.id);
    if(p) totalCost += (p.cost || 0) * item.qty;
    itemsArray.push(`${item.qty}x ${item.name}${item.color ? ' - ' + item.color : ''} (Tam: ${item.size})`);
    itemsDetail.push({ id: item.id, name: item.name, color: item.color || '', size: item.size, qty: item.qty, price: item.price });
  }

  const orderData = {
    origin: "Site da Loja",
    client: name,
    phone: phone,
    address: fullAddress,
    shippingMethod: selectedShippingName,
    shippingCost: cartShippingValue,
    items: itemsArray.join(', '),
    itemsDetail: itemsDetail,
    value: cartTotalValue,
    cost: totalCost,
    payment: payment,
    status: "pendente",
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    dateStr: new Date().toLocaleString('pt-BR')
  };

  try {
    const ref = await db.collection("orders").add(orderData);
    const orderId = ref.id;

    // O estoque NÃO baixa aqui. Ele baixa quando a loja marcar o pedido como "pago" no admin
    // (pagamento é manual via PIX). Isso evita reservar estoque de pedido que não foi pago.

    // Resumo pro WhatsApp (montado antes de limpar o carrinho)
    const resumoItens = itemsArray.join(', ');
    const totalPix = cartTotalValue;

    document.getElementById('checkoutModal').style.display = 'none';
    document.getElementById('clientName').value = '';
    document.getElementById('clientPhone').value = '';
    document.getElementById('clientCEP').value = '';
    document.getElementById('addressFields').style.display = 'none';
    document.getElementById('shippingSection').style.display = 'none';

    cart = [];
    saveCart();
    if (document.getElementById('cartOverlay').classList.contains('open')) toggleCart();

    // PIX abre a tela com QR Code; outras formas (cartão) levam ao WhatsApp pra combinar
    if (payment === 'Pix') {
      abrirPix(orderId, totalPix, name, resumoItens, fullAddress, selectedShippingName);
    } else {
      const num = orderId.slice(-6).toUpperCase();
      const msg = `Olá! Fiz um pedido no site 💛\n\n*Pedido:* #${num}\n*Cliente:* ${name}\n*Itens:* ${resumoItens}\n*Entrega:* ${selectedShippingName}\n*Endereço:* ${fullAddress}\n*Total:* R$ ${fmt(totalPix)}\n*Pagamento:* ${payment}\n\nQuero combinar o pagamento. 😊`;
      window.open(`https://wa.me/${STORE_WA}?text=${encodeURIComponent(msg)}`, '_blank');
      showToast("Pedido registrado! Te levamos pro WhatsApp pra combinar o pagamento.");
    }

  } catch(e) {
    console.error(e);
    showToast("Algo deu errado ao finalizar. Tente de novo ou fale com a gente no WhatsApp.");
  }
}

// Abre a tela de pagamento PIX com QR Code, copia-e-cola e botão de comprovante no WhatsApp
function abrirPix(orderId, valor, cliente, resumoItens, endereco, frete){
  const num = orderId.slice(-6).toUpperCase();
  pixCopiaAtual = gerarPixBRCode(valor);
  document.getElementById('pixOrderId').textContent = '#' + num;
  document.getElementById('pixValor').textContent = fmt(valor);
  document.getElementById('pixCopia').textContent = pixCopiaAtual;
  const box = document.getElementById('pixQr');
  box.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    new QRCode(box, { text: pixCopiaAtual, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
  }
  const msg = `Olá! Fiz um pedido no site 💛\n\n*Pedido:* #${num}\n*Cliente:* ${cliente}\n*Itens:* ${resumoItens}\n*Entrega:* ${frete}\n*Endereço:* ${endereco}\n*Total:* R$ ${fmt(valor)}\n\nJá fiz o PIX — segue o comprovante:`;
  document.getElementById('pixWhatsBtn').href = `https://wa.me/${STORE_WA}?text=${encodeURIComponent(msg)}`;
  document.getElementById('pixModal').style.display = 'flex';
}

function copiarPix(){
  if(!pixCopiaAtual) return;
  navigator.clipboard.writeText(pixCopiaAtual).then(()=> showToast('Código PIX copiado!')).catch(()=> showToast('Copie o código manualmente.'));
}

// ==========================================
// UTILIDADES E COMPONENTES VISUAIS
// ==========================================
// Monta os itens da galeria a partir das FOTOS DOS PRODUTOS (até 2 por produto),
// embaralhadas pra não ficar igual ao grid de cima. Cada item abre o produto.
function instaGalleryItems() {
  const pool = [];
  onlineProducts.forEach(p => {
    const imgs = [];
    getProductColors(p).forEach(c => (c.imagens || []).forEach(u => imgs.push(u)));
    if (!imgs.length && p.img) imgs.push(p.img);
    imgs.slice(0, 2).forEach(u => pool.push({ img: u, id: p.id, name: p.name || '' }));
  });
  const seen = new Set();
  const uniq = pool.filter(it => { if (seen.has(it.img)) return false; seen.add(it.img); return true; });
  for (let i = uniq.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniq[i], uniq[j]] = [uniq[j], uniq[i]];
  }
  return uniq.slice(0, 12);
}

function renderInsta() {
  const grid = document.getElementById('instaGrid');
  if (!grid) return;
  grid.classList.add('is-carousel');
  const items = instaGalleryItems();

  if (!items.length) {
    grid.innerHTML = `<div class="insta-track" id="instaTrack">${Array.from({ length: 6 }).map(() => `<div class="insta-item insta-skel"></div>`).join('')}</div>`;
    return;
  }

  const cards = items.map(it => {
    const safeName = String(it.name).replace(/"/g, '&quot;');
    return `
    <button type="button" class="insta-item" onclick="openProductModal('${it.id}')" aria-label="Ver ${safeName}">
      <img src="${cdnImg(it.img, 500)}" loading="lazy" alt="${safeName}">
      <div class="insta-overlay"><span>Ver produto</span></div>
    </button>`;
  }).join('');

  grid.innerHTML = `
    <button type="button" class="insta-nav insta-prev" onclick="instaScroll(-1)" aria-label="Fotos anteriores">‹</button>
    <div class="insta-track" id="instaTrack">${cards}</div>
    <button type="button" class="insta-nav insta-next" onclick="instaScroll(1)" aria-label="Próximas fotos">›</button>`;
}

function instaScroll(dir) {
  const track = document.getElementById('instaTrack');
  if (!track) return;
  const card = track.querySelector('.insta-item');
  const step = card ? (card.offsetWidth + 12) * 2 : 320;
  track.scrollBy({ left: dir * step, behavior: 'smooth' });
}

function renderStrip() {
  const msgs = ['Frete para todo o Brasil','Parcele em até 12x no cartão','Frete Grátis acima de R$ 249','Envio em até 24h','Nova Coleção Disponível'];
  const full = [...msgs,...msgs].map(m => `<span>${m}</span><span class="dot">✦</span>`).join('');
  document.getElementById('stripInner').innerHTML = full + full;
}

function startTimer() {
  let end = new Date(); end.setHours(23,59,59,0);
  setInterval(() => {
    const now = new Date(), diff = end - now;
    if (diff <= 0) { end = new Date(); end.setHours(end.getHours()+24,59,59,0); return; }
    const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
    document.getElementById('th').textContent = String(h).padStart(2,'0');
    document.getElementById('tm').textContent = String(m).padStart(2,'0');
    document.getElementById('ts').textContent = String(s).padStart(2,'0');
  }, 1000);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function toggleDrawer() {
  const drawer = document.getElementById('navDrawer');
  const btn = document.getElementById('menuBtn');
  const open = drawer.classList.toggle('open');
  btn.setAttribute('aria-expanded', open);
  btn.textContent = open ? '✕' : '☰';
}
function closeDrawer() {
  document.getElementById('navDrawer').classList.remove('open');
  document.getElementById('menuBtn').setAttribute('aria-expanded', false);
  document.getElementById('menuBtn').textContent = '☰';
}
document.addEventListener('click', function(e) {
  const drawer = document.getElementById('navDrawer');
  const btn = document.getElementById('menuBtn');
  if (drawer.classList.contains('open') && !drawer.contains(e.target) && !btn.contains(e.target)) {
    closeDrawer();
  }
});

// INIT
renderInsta();
renderStrip();
startTimer();
updateCartUI();


// ================= PÁGINAS LEGAIS (rodapé) =================
const LEGAL_TEXTS = {
  troca: {
    titulo: "Troca & Devolução",
    corpo: `
      <p><b>Arrependimento (compra online):</b> você pode desistir da compra em até <b>7 dias corridos</b> após o recebimento (art. 49 do CDC), com reembolso integral. A peça deve estar sem uso, com etiqueta.</p>
      <p><b>Troca de tamanho ou cor:</b> solicite em até <b>7 dias</b> após o recebimento pelo nosso WhatsApp. A peça deve estar sem uso, sem lavagem e com etiqueta.</p>
      <p><b>Defeito de fabricação:</b> comunicando em até <b>30 dias</b>, trocamos a peça ou devolvemos o valor (art. 26 do CDC).</p>
      <p><b>Como solicitar:</b> chame no WhatsApp com o número do pedido que cuidamos de tudo 💛</p>`
  },
  privacidade: {
    titulo: "Política de Privacidade",
    corpo: `
      <p>Coletamos apenas o necessário para processar seu pedido: <b>nome, WhatsApp e endereço de entrega</b>.</p>
      <p>Seus dados são usados exclusivamente para separação, envio e comunicação sobre o pedido — compartilhados somente com a transportadora responsável pela entrega.</p>
      <p><b>Não vendemos nem repassamos seus dados</b> a terceiros para publicidade. Tudo é armazenado com segurança na infraestrutura do Google (Firebase).</p>
      <p>Conforme a <b>LGPD</b>, você pode solicitar a correção ou exclusão dos seus dados a qualquer momento pelo nosso WhatsApp.</p>`
  },
  termos: {
    titulo: "Termos de Uso",
    corpo: `
      <p>Preços, promoções e disponibilidade de estoque podem mudar sem aviso prévio. O pedido é confirmado após a aprovação do pagamento.</p>
      <p>As fotos das peças são ilustrativas — pequenas variações de cor podem ocorrer conforme a tela do dispositivo.</p>
      <p>Pagamentos parcelados no cartão seguem as condições e eventuais juros da operadora do cartão.</p>
      <p>Dúvidas? Fale com a gente pelo WhatsApp. Brugnera Store — Barra Velha/SC.</p>`
  }
};

function abrirLegal(tipo) {
  const t = LEGAL_TEXTS[tipo];
  if (!t) return;
  let ov = document.getElementById('legalOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'legalOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.innerHTML = '<div id="legalBox" style="background:#fff;max-width:560px;width:100%;max-height:80vh;overflow-y:auto;border-radius:12px;padding:28px;line-height:1.6;font-size:0.92rem;"></div>';
    ov.addEventListener('click', (e) => { if (e.target === ov) fecharLegal(); });
    document.body.appendChild(ov);
  }
  document.getElementById('legalBox').innerHTML =
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
       <h3 style="margin:0;font-size:1.15rem;">${t.titulo}</h3>
       <button onclick="fecharLegal()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;line-height:1;">×</button>
     </div>${t.corpo}`;
  ov.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function fecharLegal() {
  const ov = document.getElementById('legalOverlay');
  if (ov) ov.style.display = 'none';
  document.body.style.overflow = '';
}
