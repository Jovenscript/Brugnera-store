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
let touchstartX = 0;
let touchendX = 0;

// Variáveis para o Checkout com Frete
let cartSubtotalValue = 0;
let cartShippingValue = 0;
let cartTotalValue = 0;
let selectedShippingName = "";

const instaImgs = [
  "https://images.unsplash.com/photo-1536766768598-e09213fdcf22?w=400&q=80",
  "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&q=80",
  "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&q=80",
  "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400&q=80",
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80",
  "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=400&q=80",
];

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
});

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
  
  const inStockList = list.filter(p => p.stock > 0);
  
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
    const mainImg = p.images && p.images.length > 0 ? p.images[0] : (p.img || '');
    const disc = calcDiscount(p);
    const pix = fmt(p.price * 0.95);

    // Badges baseados em dados REAIS (oferta, mais vendido, escassez real)
    const badges = [];
    if (disc > 0) badges.push(`<span class="badge badge-offer">−${disc}% OFF</span>`);
    if (p.bestseller) badges.push(`<span class="badge badge-bestseller">★ Mais vendido</span>`);
    if (p.stock <= 3) badges.push(`<span class="badge badge-last">🔥 Últimas ${p.stock}</span>`);

    return `
    <article class="product-card">
      <div class="product-img-wrap" onclick="openProductModal('${p.id}')">
        ${badges.length ? `<div class="product-badges">${badges.join('')}</div>` : ''}
        <img src="${mainImg}" alt="${p.name}" loading="lazy">
        <button class="product-quick-add">Ver peça</button>
      </div>
      <div class="product-info">
        <h3>${p.name}</h3>
        <div class="price-row">
          ${disc > 0 ? `<span class="price-old">R$ ${fmt(p.oldPrice)}</span>` : ''}
          <span class="price-now">R$ ${fmt(p.price)}</span>
        </div>
        <div class="price-pix">≈ R$ ${pix} à vista no Pix</div>
        <div class="installments">💳 ou em até 3x sem juros</div>
      </div>
    </article>
  `}).join('');
}

function filterProducts(cat, btn) {
  document.querySelectorAll('#dynamicFilters .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderProducts(cat === 'all' ? onlineProducts : onlineProducts.filter(p => p.category === cat));
}

// ==========================================
// MODAL TELA CHEIA E CARROSSEL COM EFEITO GHOST
// ==========================================
function openProductModal(id) {
  const p = onlineProducts.find(x => x.id === id);
  if(!p || p.stock <= 0) return showToast("Produto esgotado.");

  currentProduct = p; 
  selectedSize = null;
  
  carouselImagesArray = p.images && p.images.length > 0 ? p.images : (p.img ? [p.img] : []);
  currentCarouselIndex = 0;
  
  renderCarousel();

  document.getElementById('modalName').textContent = p.name;

  // Preço (com promoção honesta, se houver)
  const disc = calcDiscount(p);
  const priceEl = document.getElementById('modalPrice');
  if (disc > 0) {
    priceEl.innerHTML = `<span class="modal-old-price">De R$ ${fmt(p.oldPrice)}</span>R$ ${fmt(p.price)}<span class="modal-off-pill">−${disc}% OFF</span>`;
  } else {
    priceEl.innerHTML = `R$ ${fmt(p.price)}`;
  }

  const pixPrice = fmt(p.price * 0.95);
  document.getElementById('modalPix').textContent = `R$ ${pixPrice} no Pix (5% off)`;
  document.getElementById('modalDesc').textContent = p.desc || "Peça exclusiva Brugnera Store.";
  document.getElementById('modalStock').textContent = p.stock <= 3 ? `⚠️ Últimas ${p.stock} unidades em estoque!` : `✓ ${p.stock} unidades disponíveis`;
  
  const sizes = p.sizes || ['U'];
  document.getElementById('modalSizes').innerHTML = sizes.map(s => `<button class="size-btn" onclick="selectSize('${s}', this)">${s}</button>`).join('');

  // Sinais de confiança (criados via JS — não precisa mexer no HTML)
  renderModalTrust();
  
  document.getElementById('prodOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
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
    <span>💚 <b>5% OFF</b> no Pix</span>
    <span>📦 Enviamos p/ todo o Brasil</span>
    <span>🔁 Troca facilitada</span>
  `;
}

function renderCarousel() {
  const container = document.getElementById('carouselContainer');
  const dots = document.getElementById('carouselDots');
  
  container.innerHTML = carouselImagesArray.map((img, index) => `
    <img src="${img}" class="carousel-img ${index === currentCarouselIndex ? 'active' : ''}">
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
}

function closeProdModal() {
  document.getElementById('prodOverlay').classList.remove('open');
  document.body.style.overflow = '';
  currentProduct = null; 
  selectedSize = null;
}

function handleProdClick(e) { if (e.target === document.getElementById('prodOverlay')) closeProdModal(); }

// ==========================================
// CARRINHO DE COMPRAS E FRETE
// ==========================================
function saveCart() { localStorage.setItem('brugnera_cart', JSON.stringify(cart)); updateCartUI(); }

function addToCartFromModal() {
  if (!currentProduct) return;
  if (!selectedSize) { showToast('Selecione um tamanho para continuar.'); return; }
  
  const existing = cart.find(i => i.id === currentProduct.id && i.size === selectedSize);
  
  if (existing) { 
    if(existing.qty < currentProduct.stock) {
      existing.qty++; 
    } else {
      return showToast('Estoque máximo atingido!');
    }
  } else {
    const cartImg = currentProduct.images && currentProduct.images.length > 0 ? currentProduct.images[0] : (currentProduct.img || '');
    cart.push({ id: currentProduct.id, name: currentProduct.name, price: currentProduct.price, img: cartImg, size: selectedSize, qty: 1 });
  }
  
  saveCart();
  closeProdModal();
  showToast(`✓ ${currentProduct.name} adicionado ao carrinho`);
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
  
  container.innerHTML = cart.map(item => `
    <article class="cart-item">
      <img class="cart-item-img" src="${item.img}" alt="${item.name}">
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        <div class="size">Tamanho: ${item.size}</div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeQty('${item.id}', '${item.size}', -1)">−</button>
          <span>${item.qty}</span>
          <button class="qty-btn" onclick="changeQty('${item.id}', '${item.size}', 1)">+</button>
        </div>
      </div>
      <div class="cart-item-price">R$ ${(item.price * item.qty).toFixed(2).replace('.',',')}</div>
    </article>
  `).join('');
}

function changeQty(id, size, delta) {
  const item = cart.find(i => i.id === id && i.size === size);
  if (!item) return;
  
  const p = onlineProducts.find(x => x.id === id);
  if(delta > 0 && p && item.qty >= p.stock) return showToast("Estoque máximo atingido!");

  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => !(i.id === id && i.size === size));
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
  if(paymentMethod === 'Pix') {
    subtotal = subtotal * 0.95; 
  }
  
  cartTotalValue = subtotal + cartShippingValue;
  
  document.getElementById('chkSubtotalVal').textContent = subtotal.toFixed(2).replace('.',',');
  document.getElementById('chkFreteVal').textContent = cartShippingValue.toFixed(2).replace('.',',');
  document.getElementById('chkTotalVal').textContent = cartTotalValue.toFixed(2).replace('.',',');
}

function buscarCEP(cep) {
  const cepLimpo = cep.replace(/\D/g, '');
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
          document.getElementById('clientNum').focus();
        }
      })
      .catch(err => {
        document.getElementById('cepLoader').style.display = 'none';
        showToast('Erro ao buscar o CEP.');
      });
  }
}

function selecionarFrete(valor, nome) {
  cartShippingValue = valor;
  selectedShippingName = nome;
  atualizarTotalCheckout();
}

async function confirmOnlinePurchase() {
  const name = document.getElementById('clientName').value.trim();
  const phone = document.getElementById('clientPhone').value.trim();
  const payment = document.getElementById('clientPayment').value;
  
  const cep = document.getElementById('clientCEP').value;
  const num = document.getElementById('clientNum').value;
  
  if(!name || !phone) return showToast("Preencha seu Nome e WhatsApp.");
  if(!cep || !num) return showToast("Por favor, preencha o CEP e o Número da residência.");
  if(cartShippingValue === 0) return showToast("Selecione uma opção de Frete.");
  if(cart.length === 0) return showToast("Carrinho vazio.");

  const rua = document.getElementById('clientRua').value;
  const comp = document.getElementById('clientComp').value;
  const bairro = document.getElementById('clientBairro').value;
  const cidade = document.getElementById('clientCidade').value;
  const uf = document.getElementById('clientUF').value;
  const fullAddress = `${rua}, ${num} ${comp ? '('+comp+')' : ''} - ${bairro}, ${cidade}/${uf} - CEP: ${cep}`;

  let totalCost = 0;
  let itemsArray = [];

  for(let item of cart) {
    const p = onlineProducts.find(x => x.id === item.id);
    if(p) totalCost += (p.cost || 0) * item.qty;
    itemsArray.push(`${item.qty}x ${item.name} (Tam: ${item.size})`);
  }

  const orderData = {
    origin: "Site da Loja",
    client: name,
    phone: phone,
    address: fullAddress,
    shippingMethod: selectedShippingName,
    shippingCost: cartShippingValue,
    items: itemsArray.join(', '),
    value: cartTotalValue,
    cost: totalCost,
    payment: payment,
    status: "pendente",
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    dateStr: new Date().toLocaleString('pt-BR')
  };

  try {
    await db.collection("orders").add(orderData);
    
    for(let item of cart) {
      // Operação atômica: evita venda dupla quando 2 clientes compram ao mesmo tempo
      await db.collection("products").doc(item.id).update({
        stock: firebase.firestore.FieldValue.increment(-item.qty)
      });
    }

    document.getElementById('checkoutModal').style.display = 'none';
    document.getElementById('clientName').value = '';
    document.getElementById('clientPhone').value = '';
    document.getElementById('clientCEP').value = '';
    document.getElementById('addressFields').style.display = 'none';
    document.getElementById('shippingSection').style.display = 'none';
    
    cart = [];
    saveCart();
    toggleCart(); 
    
    showToast("Pedido realizado com sucesso! Nossa equipe chamará no WhatsApp.");

  } catch(e) {
    alert("Erro ao processar compra: " + e.message);
  }
}

// ==========================================
// UTILIDADES E COMPONENTES VISUAIS
// ==========================================
function renderInsta() {
  document.getElementById('instaGrid').innerHTML = instaImgs.map(src => `
    <a href="https://www.instagram.com/brugnera_store" target="_blank" rel="noopener noreferrer" class="insta-item">
      <img src="${src}" loading="lazy">
      <div class="insta-overlay">📸</div>
    </a>
  `).join('');
}

function renderStrip() {
  const msgs = ['Frete para todo o Brasil','Pix com 5% de desconto','12x sem juros no cartão','Envio em até 24h','Nova Coleção Disponível'];
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
