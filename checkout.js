// CONECTA AO FIREBASE
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

// LÊ O CARRINHO SALVO NO NAVEGADOR
let cart = JSON.parse(localStorage.getItem('brugnera_cart') || '[]');
let metodoPagamento = 'Pix';
let totalGeral = 0;
let subtotal = 0;

// RENDERIZA O RESUMO DO PEDIDO
function renderResumo() {
  const container = document.getElementById('summaryItems');
  
  if (cart.length === 0) {
    alert("Seu carrinho está vazio!");
    window.location.href = 'index.html';
    return;
  }

  subtotal = 0;
  container.innerHTML = cart.map(item => {
    subtotal += item.price * item.qty;
    return `
      <div class="summary-item">
        <img src="${item.img}" onerror="this.style.display='none'">
        <div class="summary-item-info">
          <h4>${item.name}</h4>
          <p>Tamanho: ${item.size} | Qtd: ${item.qty}</p>
          <div class="summary-item-price">R$ ${(item.price * item.qty).toFixed(2).replace('.',',')}</div>
        </div>
      </div>
    `;
  }).join('');

  calcularTotal();
}

function selecionarPagamento(metodo, labelEl) {
  metodoPagamento = metodo;
  document.querySelectorAll('.pay-opt').forEach(el => el.classList.remove('active'));
  labelEl.classList.add('active');
  calcularTotal();
}

function calcularTotal() {
  document.getElementById('sumSubtotal').textContent = `R$ ${subtotal.toFixed(2).replace('.',',')}`;
  
  if (metodoPagamento === 'Pix') {
    const desconto = subtotal * 0.05;
    totalGeral = subtotal - desconto;
    document.getElementById('descontoRow').style.display = 'flex';
    document.getElementById('sumDesconto').textContent = `- R$ ${desconto.toFixed(2).replace('.',',')}`;
  } else {
    totalGeral = subtotal;
    document.getElementById('descontoRow').style.display = 'none';
  }

  document.getElementById('sumTotal').textContent = `R$ ${totalGeral.toFixed(2).replace('.',',')}`;
}

// FINALIZAR A COMPRA (SALVA NO FIREBASE)
function concluirCompra() {
  const nome = document.getElementById('cNome').value.trim();
  const email = document.getElementById('cEmail').value.trim();
  const whats = document.getElementById('cWhats').value.trim();
  
  if (!nome || !email || !whats) {
    return alert('Por favor, preencha seus dados de contato para podermos enviar o pedido.');
  }

  const btn = document.getElementById('btnFinalizar');
  btn.textContent = 'Processando pedido...';
  btn.disabled = true;

  let itemsStr = [];
  
  // Para cada item, vamos montar a string pro painel e dar baixa no estoque
  cart.forEach(item => {
    itemsStr.push(`${item.qty}x ${item.name} (${item.size})`);
    
    // Procura o produto no Firebase para descontar o estoque
    db.collection('products').doc(item.id).get().then(doc => {
      if (doc.exists) {
        const produtoDb = doc.data();
        const novoEstoque = produtoDb.stock - item.qty;
        
        // Atualiza estoque
        db.collection('products').doc(item.id).update({ stock: novoEstoque });
        
        // Registra no Log
        db.collection('stockLog').add({
           createdAt: firebase.firestore.FieldValue.serverTimestamp(),
           date: new Date().toLocaleDateString('pt-BR'),
           product: item.name, type: 'Venda Site', qty: -item.qty, user: 'Site Online'
        });
      }
    });
  });

  // Cria o Pedido para a tela do Admin
  const order = {
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    id: 'SITE' + Date.now().toString().slice(-5),
    origin: 'site',
    client: nome,
    email: email,
    whatsapp: whats,
    items: itemsStr.join(', '),
    value: totalGeral,
    payment: metodoPagamento,
    status: 'pendente'
  };

  db.collection('orders').add(order).then(() => {
    // Limpa o carrinho
    localStorage.removeItem('brugnera_cart');
    
    alert(`Pedido Realizado com Sucesso, ${nome}!\n\nSeu pedido já apareceu no painel da loja. Entraremos em contato pelo WhatsApp para combinar a entrega.`);
    
    window.location.href = 'index.html';
  }).catch(error => {
    alert('Erro ao processar: ' + error.message);
    btn.textContent = 'Confirmar Pagamento';
    btn.disabled = false;
  });
}

// Inicia
renderResumo();