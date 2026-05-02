// --- DADOS INICIAIS (SIMULANDO BANCO DE DADOS COM ESTOQUE E CÓDIGO DE BARRAS) ---
const initialProducts = [
    { id: 1, name: "Vestido Midi Seda Plissada", price: 389.90, category: "Vestidos", img: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=600&q=80", desc: "Vestido elegante em seda pura com caimento impecável.", barcode: "7891000000001", stock: 15 },
    { id: 2, name: "Conjunto Alfaiataria Paris", price: 459.00, category: "Conjuntos", img: "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=600&q=80", desc: "Conjunto composto por blazer acinturado e calça pantalona.", barcode: "7891000000002", stock: 8 },
    { id: 3, name: "Blusa Gola Alta Minimal", price: 189.90, category: "Blusas", img: "https://images.unsplash.com/photo-1551794274-12499d3e8e9e?auto=format&fit=crop&w=600&q=80", desc: "Blusa manga longa com gola alta em tecido canelado premium.", barcode: "7891000000003", stock: 20 },
    { id: 4, name: "Vestido Longo Noir", price: 529.90, category: "Vestidos", img: "https://images.unsplash.com/photo-1566206091558-4f22ef389dcd?auto=format&fit=crop&w=600&q=80", desc: "O clássico vestido preto elevado a outro nível.", barcode: "7891000000004", stock: 5 },
    { id: 5, name: "Camisa Branca Classic", price: 219.00, category: "Blusas", img: "https://images.unsplash.com/photo-1598554747436-c9293d6a588f?auto=format&fit=crop&w=600&q=80", desc: "A peça mais versátil que você pode ter.", barcode: "7891000000005", stock: 12 },
    { id: 6, name: "Calça Pantalona Areia", price: 279.90, category: "Calças", img: "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=600&q=80", desc: "Cintura alta, caimento fluido e elegante.", barcode: "7891000000006", stock: 10 }
];

// Atualiza o banco de dados local com as novas chaves (stock e barcode) caso seja um acesso antigo
function initializeDB() {
    let stored = localStorage.getItem('brugnera_products');
    if (!stored) {
        localStorage.setItem('brugnera_products', JSON.stringify(initialProducts));
    } else {
        // Migração: Adiciona stock e barcode para quem já testou o site antes
        let products = JSON.parse(stored);
        let updated = false;
        products = products.map(p => {
            if (p.stock === undefined || p.barcode === undefined) {
                updated = true;
                return { ...p, stock: p.stock || 10, barcode: p.barcode || Math.floor(Math.random() * 1000000000).toString() };
            }
            return p;
        });
        if(updated) localStorage.setItem('brugnera_products', JSON.stringify(products));
    }

    if (!localStorage.getItem('brugnera_cart')) localStorage.setItem('brugnera_cart', JSON.stringify([]));
    if (!localStorage.getItem('brugnera_pos_cart')) localStorage.setItem('brugnera_pos_cart', JSON.stringify([])); // Carrinho do PDV
}

initializeDB();

// Funções de Banco de Dados
const getProducts = () => JSON.parse(localStorage.getItem('brugnera_products'));
const saveProducts = (products) => localStorage.setItem('brugnera_products', JSON.stringify(products));
const getCart = () => JSON.parse(localStorage.getItem('brugnera_cart'));
const saveCart = (cart) => { localStorage.setItem('brugnera_cart', JSON.stringify(cart)); updateCartBadge(); };

// Formatação de Moeda
const formatMoney = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// --- MENU LATERAL (HAMBÚRGUER) ---
function toggleMenu() {
    const menu = document.getElementById('side-menu');
    const overlay = document.getElementById('menu-overlay');
    menu.classList.toggle('open');
    overlay.classList.toggle('active');
}

// --- SISTEMA DE ROTEAMENTO (SPA) ---
const app = document.getElementById('app');

function navigate(page, param = null) {
    window.scrollTo(0, 0);
    if (page === 'home') renderHome(param || 'Todos');
    else if (page === 'product') renderProduct(param);
    else if (page === 'cart') renderCart();
    else if (page === 'checkout') renderCheckout();
    else if (page === 'admin') renderAdminLogin();
    else if (page === 'pos') renderPOS();
}

// --- 1. PÁGINA INICIAL ---
function renderHome(filterCategory = 'Todos') {
    const products = getProducts();
    const categories = ['Todos', ...new Set(products.map(p => p.category))];
    
    let filteredProducts = products;
    if (filterCategory !== 'Todos') {
        filteredProducts = products.filter(p => p.category === filterCategory);
    }

    let html = `
        <section class="hero">
            <div class="hero-content">
                <h1>Nova Coleção</h1>
                <p>Elegância e sofisticação em cada detalhe.</p>
                <button class="btn" onclick="document.getElementById('shop').scrollIntoView({behavior: 'smooth'})">Ver Produtos</button>
            </div>
        </section>

        <div class="container" id="shop">
            <h2 class="section-title">Nossas Peças</h2>
            
            <div class="filters">
                ${categories.map(cat => `
                    <button class="filter-btn ${cat === filterCategory ? 'active' : ''}" 
                        onclick="renderHome('${cat}')">${cat}</button>
                `).join('')}
            </div>

            <div class="product-grid">
                ${filteredProducts.map(product => `
                    <div class="product-card" onclick="navigate('product', ${product.id})">
                        <div class="product-img-wrapper">
                            <img src="${product.img}" alt="${product.name}">
                        </div>
                        <h3 class="product-title">${product.name}</h3>
                        <p class="product-price">${formatMoney(product.price)}</p>
                        ${product.stock > 0 ? `<span class="stock-badge">Em estoque</span>` : `<span class="stock-badge" style="background:#d9534f;">Esgotado</span>`}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    app.innerHTML = html;
}

// --- 2. PÁGINA DE PRODUTO ---
function renderProduct(id) {
    const product = getProducts().find(p => p.id === id);
    if (!product) return navigate('home');

    app.innerHTML = `
        <div class="container">
            <div class="product-detail-view">
                <div class="product-detail-img">
                    <img src="${product.img}" alt="${product.name}">
                </div>
                <div class="product-detail-info">
                    <h2>${product.name}</h2>
                    <p class="price">${formatMoney(product.price)}</p>
                    <p class="desc">${product.desc}</p>
                    <p style="font-size: 0.9rem; color: var(--gray-dark); margin-bottom: 20px;">Estoque disponível: ${product.stock} peças</p>
                    
                    <div class="size-selector">
                        <p>Tamanho</p>
                        <div class="sizes">
                            <div class="size-btn selected" onclick="selectSize(this)">M</div>
                            <div class="size-btn" onclick="selectSize(this)">G</div>
                        </div>
                    </div>

                    ${product.stock > 0 ? `
                        <button class="btn" onclick="addToCart(${product.id})" style="width: 100%; padding: 15px; font-size: 1rem;">
                            Adicionar à Sacola
                        </button>
                    ` : `
                        <button class="btn" disabled style="width: 100%; padding: 15px; font-size: 1rem; background: #ccc; border-color: #ccc;">
                            Produto Esgotado
                        </button>
                    `}
                    
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--gray-medium);">
                        <p style="font-size: 0.9rem; margin-bottom: 10px;"><i class="fa-solid fa-truck"></i> Calcule o frete</p>
                        <div style="display: flex; gap: 10px;">
                            <input type="text" placeholder="00000-000" style="padding: 10px; border: 1px solid #ccc; flex: 1;">
                            <button class="btn btn-outline" onclick="alert('Frete fixo para o Brasil: R$ 15,00')">Calcular</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

window.selectSize = function(element) {
    document.querySelectorAll('.size-btn').forEach(btn => btn.classList.remove('selected'));
    element.classList.add('selected');
}

// --- 3. CARRINHO (E-COMMERCE) ---
window.addToCart = function(productId) {
    const product = getProducts().find(p => p.id === productId);
    if(product.stock <= 0) return alert('Desculpe, este produto está sem estoque.');
    
    const size = document.querySelector('.size-btn.selected').innerText;
    const cart = getCart();
    
    cart.push({ ...product, selectedSize: size, cartId: Date.now() });
    saveCart(cart);
    
    alert('Produto adicionado com sucesso!');
    navigate('cart');
}

function renderCart() {
    const cart = getCart();
    let subtotal = cart.reduce((acc, item) => acc + item.price, 0);

    let html = `
        <div class="container cart-view">
            <h2 class="section-title">Sua Sacola</h2>
    `;

    if (cart.length === 0) {
        html += `
            <div style="text-align: center; padding: 50px 0;">
                <p style="margin-bottom: 20px;">Sua sacola está vazia.</p>
                <button class="btn" onclick="navigate('home')">Continuar Comprando</button>
            </div>
        `;
    } else {
        html += cart.map(item => `
            <div class="cart-item">
                <img src="${item.img}" alt="${item.name}">
                <div class="cart-item-info">
                    <h3 class="cart-item-title">${item.name}</h3>
                    <p style="color: var(--gray-dark); font-size: 0.9rem;">Tamanho: ${item.selectedSize}</p>
                    <p style="font-weight: bold; margin-top: 10px;">${formatMoney(item.price)}</p>
                    <span class="cart-item-remove" onclick="removeFromCart(${item.cartId})">Remover</span>
                </div>
            </div>
        `).join('');

        html += `
            <div class="cart-summary">
                <h3>Subtotal: ${formatMoney(subtotal)}</h3>
                <button class="btn" onclick="navigate('checkout')" style="width: 100%; padding: 15px;">Finalizar Compra</button>
            </div>
        `;
    }

    html += `</div>`;
    app.innerHTML = html;
}

window.removeFromCart = function(cartId) {
    const cart = getCart().filter(item => item.cartId !== cartId);
    saveCart(cart);
    renderCart();
}

// --- 4. CHECKOUT ONLINE (Dá baixa no estoque) ---
function renderCheckout() {
    const cart = getCart();
    if (cart.length === 0) return navigate('home');
    let total = cart.reduce((acc, item) => acc + item.price, 0) + 15;

    app.innerHTML = `
        <div class="container checkout-view">
            <h2 class="section-title">Finalizar Pedido</h2>
            <div class="checkout-form">
                <h3>Dados de Entrega</h3>
                <div class="form-group"><input type="text" placeholder="Nome Completo"></div>
                <div class="form-group"><input type="email" placeholder="E-mail"></div>
                
                <div class="cart-summary" style="text-align: left; background: var(--black); color: var(--white);">
                    <p>Total dos Produtos: ${formatMoney(total - 15)}</p>
                    <p>Frete: R$ 15,00</p>
                    <h2 style="margin-top: 15px; border-top: 1px solid #333; padding-top: 15px;">Total a Pagar: ${formatMoney(total)}</h2>
                    <button class="btn" style="background: var(--white); color: var(--black); width: 100%; margin-top: 20px;" onclick="finishOnlineOrder()">Confirmar Pagamento</button>
                </div>
            </div>
        </div>
    `;
}

window.finishOnlineOrder = function() {
    const cart = getCart();
    let products = getProducts();

    // Dando baixa no estoque para vendas do site
    cart.forEach(cartItem => {
        let prodIndex = products.findIndex(p => p.id === cartItem.id);
        if(prodIndex !== -1 && products[prodIndex].stock > 0) {
            products[prodIndex].stock -= 1;
        }
    });

    saveProducts(products); // Salva estoque reduzido
    saveCart([]); // Limpa o carrinho
    alert('Pedido realizado com sucesso! Baixa no estoque efetuada.');
    navigate('home');
}


// --- 5. SISTEMA ERP / CAIXA (PDV) COM CÓDIGO DE BARRAS ---
function renderPOS() {
    let posCart = JSON.parse(localStorage.getItem('brugnera_pos_cart')) || [];
    let total = posCart.reduce((acc, item) => acc + item.price, 0);

    app.innerHTML = `
        <div class="container">
            <h2 class="section-title" style="margin-bottom: 20px;">Caixa da Loja (PDV)</h2>
            <p style="text-align:center; margin-bottom: 30px; color: var(--gray-dark);">Venda Física - Bipar produto ou digitar código</p>
            
            <div class="pos-view">
                <div class="pos-scanner">
                    <div class="form-group">
                        <label>Leitor de Código de Barras</label>
                        <input type="text" id="barcode-input" placeholder="Passe o leitor aqui..." autocomplete="off" autofocus onkeyup="checkBarcode(event)">
                        <p style="font-size: 0.8rem; margin-top: 10px;">(Aperte ENTER após digitar se estiver simulando sem leitor)</p>
                    </div>
                </div>

                <div class="pos-list">
                    <h3>Lista de Produtos</h3>
                    <hr style="margin: 10px 0; border: 0; border-top: 1px solid #ccc;">
                    ${posCart.length === 0 ? '<p>Nenhum produto no caixa.</p>' : ''}
                    ${posCart.map((item, index) => `
                        <div class="pos-item">
                            <span>${item.name}</span>
                            <span>${formatMoney(item.price)} <i class="fa-solid fa-trash" style="color:red; cursor:pointer; margin-left:10px;" onclick="removePosItem(${index})"></i></span>
                        </div>
                    `).join('')}
                    
                    <div class="pos-total">Total: ${formatMoney(total)}</div>
                    
                    ${posCart.length > 0 ? `
                        <button class="btn" style="width: 100%; padding: 15px; font-size: 1.2rem;" onclick="finishPOSSale()">Finalizar Venda (Dar Baixa)</button>
                        <button class="btn btn-outline" style="width: 100%; margin-top: 10px;" onclick="clearPOS()">Cancelar Venda</button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    // Mantem o foco no leitor de código de barras
    setTimeout(() => { document.getElementById('barcode-input').focus(); }, 100);
}

window.checkBarcode = function(event) {
    if(event.key === 'Enter') {
        const barcode = event.target.value.trim();
        const products = getProducts();
        const product = products.find(p => p.barcode === barcode);

        if(product) {
            if(product.stock <= 0) {
                alert('Aviso: Produto sem estoque no sistema!');
            } else {
                let posCart = JSON.parse(localStorage.getItem('brugnera_pos_cart')) || [];
                posCart.push(product);
                localStorage.setItem('brugnera_pos_cart', JSON.stringify(posCart));
            }
        } else {
            alert('Produto não encontrado!');
        }
        renderPOS(); // Recarrega o PDV
    }
}

window.removePosItem = function(index) {
    let posCart = JSON.parse(localStorage.getItem('brugnera_pos_cart')) || [];
    posCart.splice(index, 1);
    localStorage.setItem('brugnera_pos_cart', JSON.stringify(posCart));
    renderPOS();
}

window.clearPOS = function() {
    localStorage.setItem('brugnera_pos_cart', JSON.stringify([]));
    renderPOS();
}

window.finishPOSSale = function() {
    let posCart = JSON.parse(localStorage.getItem('brugnera_pos_cart')) || [];
    let products = getProducts();

    // Reduz o estoque para cada item vendido no caixa
    posCart.forEach(cartItem => {
        let prodIndex = products.findIndex(p => p.id === cartItem.id);
        if(prodIndex !== -1 && products[prodIndex].stock > 0) {
            products[prodIndex].stock -= 1;
        }
    });

    saveProducts(products); // Atualiza Banco
    localStorage.setItem('brugnera_pos_cart', JSON.stringify([])); // Limpa caixa
    alert('Venda efetuada com sucesso! O estoque foi atualizado.');
    renderPOS();
}


// --- 6. ÁREA ADMINISTRATIVA (CADASTRO E ESTOQUE) ---
function renderAdminLogin() {
    const pass = prompt('Área Restrita. Digite a senha (admin123):');
    if (pass === 'admin123') renderAdminDashboard();
    else { alert('Senha incorreta.'); navigate('home'); }
}

function renderAdminDashboard() {
    const products = getProducts();
    
    app.innerHTML = `
        <div class="container admin-view">
            <div class="admin-header">
                <h2>Gestão de Produtos e Estoque (ERP)</h2>
                <button class="btn" onclick="toggleAdminForm()">+ Entrada de Roupa</button>
            </div>

            <div class="admin-form" id="admin-form">
                <h3>Cadastrar / Editar Produto</h3>
                <form onsubmit="saveProductAdmin(event)" style="display: flex; flex-direction: column; gap: 15px; margin-top: 20px;">
                    <input type="hidden" id="admin-id">
                    <div class="form-row">
                        <div class="form-group"><label>Nome da Peça</label><input type="text" id="admin-name" required></div>
                        <div class="form-group"><label>Categoria</label><input type="text" id="admin-category" required></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>Preço</label><input type="number" step="0.01" id="admin-price" required></div>
                        <div class="form-group"><label>Qtd. Estoque</label><input type="number" id="admin-stock" required></div>
                        <div class="form-group"><label>Cód. Barras</label><input type="text" id="admin-barcode" required></div>
                    </div>
                    <div class="form-group"><label>URL da Imagem</label><input type="text" id="admin-img" required></div>
                    <div class="form-group"><label>Descrição</label><textarea id="admin-desc" rows="2" required></textarea></div>
                    
                    <button type="submit" class="btn">Salvar Produto / Dar Entrada</button>
                </form>
            </div>

            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Cód. Barras</th>
                        <th>Produto</th>
                        <th>Categoria</th>
                        <th>Preço</th>
                        <th>Estoque</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${products.map(p => `
                        <tr>
                            <td style="font-family: monospace;">${p.barcode}</td>
                            <td>${p.name}</td>
                            <td>${p.category}</td>
                            <td>${formatMoney(p.price)}</td>
                            <td><strong>${p.stock}</strong> un.</td>
                            <td>
                                <button class="action-btn edit" onclick="editProductAdmin(${p.id})"><i class="fa-solid fa-pen"></i></button>
                                <button class="action-btn delete" onclick="deleteProductAdmin(${p.id})"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <button class="btn btn-outline" style="margin-top: 30px;" onclick="navigate('home')">Sair do Painel</button>
        </div>
    `;
}

window.toggleAdminForm = function() {
    document.getElementById('admin-form').classList.toggle('active');
    document.getElementById('admin-id').value = ''; // Limpa para novo cadastro
}

window.editProductAdmin = function(id) {
    const product = getProducts().find(p => p.id === id);
    if(product) {
        document.getElementById('admin-id').value = product.id;
        document.getElementById('admin-name').value = product.name;
        document.getElementById('admin-category').value = product.category;
        document.getElementById('admin-price').value = product.price;
        document.getElementById('admin-stock').value = product.stock;
        document.getElementById('admin-barcode').value = product.barcode;
        document.getElementById('admin-img').value = product.img;
        document.getElementById('admin-desc').value = product.desc;
        document.getElementById('admin-form').classList.add('active');
        window.scrollTo(0, 0);
    }
}

window.saveProductAdmin = function(e) {
    e.preventDefault();
    let products = getProducts();
    const idField = document.getElementById('admin-id').value;
    
    const newProduct = {
        id: idField ? parseInt(idField) : Date.now(),
        name: document.getElementById('admin-name').value,
        category: document.getElementById('admin-category').value,
        price: parseFloat(document.getElementById('admin-price').value),
        stock: parseInt(document.getElementById('admin-stock').value),
        barcode: document.getElementById('admin-barcode').value,
        img: document.getElementById('admin-img').value,
        desc: document.getElementById('admin-desc').value
    };

    if(idField) {
        // Atualiza
        products = products.map(p => p.id === newProduct.id ? newProduct : p);
    } else {
        // Cria novo
        products.push(newProduct);
    }

    saveProducts(products);
    alert('Operação salva com sucesso!');
    renderAdminDashboard();
}

window.deleteProductAdmin = function(id) {
    if(confirm('Tem certeza que deseja excluir esta peça do sistema?')) {
        let products = getProducts();
        products = products.filter(p => p.id !== id);
        saveProducts(products);
        renderAdminDashboard();
    }
}

// --- UTILITÁRIOS ---
function updateCartBadge() {
    const cart = getCart();
    document.getElementById('cart-count-badge').innerText = cart.length;
}

// Inicialização
updateCartBadge();
navigate('home');

