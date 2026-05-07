// CONFIGURAÇÃO DO FIREBASE
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
const auth = firebase.auth();

// Emails que têm acesso ao painel Admin
const ADMIN_EMAILS = [
  'admin@brugnera.com',
  'caroline@brugnera.com',
  'brugnera@brugnera.com',
];

// Se já estiver logada, redirecionar automaticamente
auth.onAuthStateChanged((user) => {
  if (user) {
    if (ADMIN_EMAILS.includes(user.email)) {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'index.html';
    }
  }
});

// ALTERNAR ENTRE LOGIN E CADASTRO
function trocarFormulario() {
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

// FAZER CADASTRO (clientes normais)
function fazerCadastro() {
  const email = document.getElementById('emailCadastro').value;
  const senha = document.getElementById('senhaCadastro').value;
  const btn = document.getElementById('btnCadastrar');
  if (!email || !senha) return alert('Preencha todos os campos!');
  btn.textContent = 'Aguarde...';
  auth.createUserWithEmailAndPassword(email, senha)
    .then(() => {
      // onAuthStateChanged vai redirecionar
    })
    .catch((error) => {
      alert('Erro ao criar conta: ' + error.message);
      btn.textContent = 'Cadastrar';
    });
}

// FAZER LOGIN
function fazerLogin() {
  const email = document.getElementById('emailLogin').value;
  const senha = document.getElementById('senhaLogin').value;
  const btn = document.getElementById('btnEntrar');
  if (!email || !senha) return alert('Preencha todos os campos!');
  btn.textContent = 'Entrando...';
  auth.signInWithEmailAndPassword(email, senha)
    .then(() => {
      // onAuthStateChanged vai redirecionar corretamente
    })
    .catch((error) => {
      alert('E-mail ou senha incorretos.');
      btn.textContent = 'Entrar';
    });
}
