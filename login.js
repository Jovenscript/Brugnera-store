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

// Iniciar Firebase com segurança
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();

// ==========================================
// FUNÇÕES DE TELA (MENSAGENS)
// ==========================================
function mostrarErro(msg) {
  const box = document.getElementById('errorBox');
  box.style.display = 'block';
  box.textContent = msg;
}

function ocultarErro() {
  document.getElementById('errorBox').style.display = 'none';
}

function trocarFormulario() {
  ocultarErro();
  const loginForm = document.getElementById('loginForm');
  const regForm = document.getElementById('registerForm');
  
  if (loginForm.style.display === 'none') {
    loginForm.style.display = 'block';
    regForm.style.display = 'none';
  } else {
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
  }
}

// ==========================================
// FAZER CADASTRO
// ==========================================
function fazerCadastro() {
  ocultarErro();
  const email = document.getElementById('emailCadastro').value.trim().toLowerCase();
  const senha = document.getElementById('senhaCadastro').value;
  const btn = document.getElementById('btnCadastrar');

  if(!email || !senha) return mostrarErro('Por favor, preencha todos os campos!');

  btn.textContent = 'AGUARDE...';
  
  auth.createUserWithEmailAndPassword(email, senha)
    .then((userCredential) => {
      // Assim que cria a conta, joga pro site normal
      window.location.href = 'index.html'; 
    })
    .catch((error) => {
      mostrarErro('Erro ao criar conta: verifique se o e-mail é válido.');
      btn.textContent = 'CADASTRAR';
    });
}

// ==========================================
// FAZER LOGIN
// ==========================================
function fazerLogin() {
  ocultarErro();
  
  // Limpa o email de espaços extras e letras maiúsculas que dão erro
  const email = document.getElementById('emailLogin').value.trim().toLowerCase();
  const senha = document.getElementById('senhaLogin').value;
  const btn = document.getElementById('btnEntrar');

  if(!email || !senha) return mostrarErro('Por favor, preencha seu e-mail e senha.');

  btn.textContent = 'AGUARDE...';

  auth.signInWithEmailAndPassword(email, senha)
    .then((userCredential) => {
      // Regra oficial para autorizar a dona da loja a entrar no admin:
      if(email === 'admin@brugnerastore.com.br' || email.includes('admin')) {
        window.location.href = 'admin.html';
      } else {
        // Se for um cliente que logou, manda ele pra vitrine
        window.location.href = 'index.html';
      }
    })
    .catch((error) => {
      mostrarErro('E-mail ou senha incorretos.');
      btn.textContent = 'ENTRAR';
    });
}
