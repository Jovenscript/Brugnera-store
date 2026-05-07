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
// ESCUTAR BANCO EM TEMPO REAL
// ==========================================
db.collection("products")
  .where("active", "==", true)
  .where("channelSite", "==", true)
  .onSnapshot((snapshot) => {
    onlineProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderProducts(onlineProducts);
});

// ==========================================
// RENDERIZAÇÃO DA VITRINE
// ==========================================
function renderProducts(list) {
  const grid = document.getElementById('productsGrid');
  
  if (list.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: white; border: 1px solid var(--border);">
        <h3 style="font-family:'Playfair Display', serif; font-size: 2rem; color: var(--gold); margin-bottom: 16px;">Coleção em Construção</h3>
        <p style="font-size: 1.1rem; color: var(--gray);">Estamos preparando e trazendo as melhores peças para você. Aguarde as novidades em breve!</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = list.map(p => `
    <article class="product-card">
      <div class="product-img-wrap" onclick="openProductModal('${p.id}')">
        <img src="${p.img}" alt="${p.name}" loading="lazy">
        <button class="product-quick-add">Adicionar ao Carrinho</button>
      </div>
      <div class="product-info">
        <h3>${p.name}</h3>
        <div class="price">R$ ${p.price.toFixed(2).replace('.',',')}</div>
        ${p.stock <= 3 ? `<div class="stock-alert">⚠️ Últimas ${p.stock} unidades!</div>` : `<div class="stock-alert" style="color:var(--gray)">Disponível</div>`}
      </div>
    </article>
  `).join('');
}

function filterProducts(cat, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderProducts(cat === 'all' ? onlineProducts : onlineProducts.filter(p => p.category === cat));
}

// ==========================================
// MODAL DE PRODUTO
// ==========================================
function openProductModal(id) {
  const p = onlineProducts.find(x => x.id === id);
  if(!p || p.stock <= 0) return showToast("Produto esgotado.");

  currentProduct = p; 
  selectedSize = null;
  
  document.getElementById('modalImg').src = p.img;
  document.getElementById('modalName').textContent = p.name;
  document.getElementById('modalPrice').textContent = `R$ ${p.price.toFixed(2).replace('.',',')}`;
  
  const pixPrice = (p.price * 0.95).toFixed(2).replace('.', ',');
  document.getElementById('modalPix').textContent = `R$ ${pixPrice} no Pix (5% off)`;
  document.getElementById('modalDesc').textContent = p.desc || "Peça exclusiva Brugnera Store.";
  document.getElementById('modalStock').textContent = p.stock <= 3 ? `⚠️ Últimas ${p.stock} unidades em estoque!` : `✓ ${p.stock} unidades disponíveis`;
  
  const sizes = p.sizes || ['U'];
  document.getElementById('modalSizes').innerHTML = sizes.map(s => `<button class="size-btn" onclick="selectSize('${s}', this)">${s}</button>`).join('');
  
  document.getElementById('prodOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

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
// CARRINHO DE COMPRAS
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
    cart.push({ id: currentProduct.id, name: currentProduct.name, price: currentProduct.price, img: currentProduct.img, size: selectedSize, qty: 1 });
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

// ==========================================
// CHECKOUT, CEP E ENVIO PARA O FIREBASE
// ==========================================
function openCheckoutModal() {
  if (cart.length === 0) { showToast('Adicione produtos ao carrinho primeiro.'); return; }
  
  // Limpar formulário e valores anteriores
  cartShippingValue = 0;
  selectedShippingName = "";
  document.getElementById('shippingSection').style.display = 'none';
  document.querySelectorAll('input[name="shippingOpt"]').forEach(r => r.checked = false);
  
  atualizarTotalCheckout();
  document.getElementById('checkoutModal').style.display = 'flex';
}

function atualizarTotalCheckout() {
  // Aplica desconto se for Pix (Apenas no subtotal dos produtos)
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

// Buscar Endereço Automaticamente (ViaCEP API)
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
          // Preencher campos
          document.getElementById('clientRua').value = dados.logradouro;
          document.getElementById('clientBairro').value = dados.bairro;
          document.getElementById('clientCidade').value = dados.localidade;
          document.getElementById('clientUF').value = dados.uf;
          
          // Mostrar campos e opções de frete
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

  // Montar o endereço completo para salvar no Firebase
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
    // 1. Enviar pedido pro Banco de Dados
    await db.collection("orders").add(orderData);
    
    // 2. Dar baixa no estoque na nuvem de TODOS os itens do carrinho
    for(let item of cart) {
      const p = onlineProducts.find(x => x.id === item.id);
      if(p) {
        await db.collection("products").doc(item.id).update({
          stock: Math.max(0, p.stock - item.qty)
        });
      }
    }

    // Limpar tudo
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
  const msgs = ['Frete Grátis acima de R$299','Pix com 5% de desconto','12x sem juros no cartão','Envio em até 24h','Nova Coleção Disponível'];
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

// MOBILE DRAWER
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