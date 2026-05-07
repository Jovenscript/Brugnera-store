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
const auth = firebase.auth();

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

// FAZER CADASTRO
function fazerCadastro() {
  const email = document.getElementById('emailCadastro').value;
  const senha = document.getElementById('senhaCadastro').value;
  const btn = document.getElementById('btnCadastrar');

  if(!email || !senha) return alert('Preencha todos os campos!');

  btn.textContent = 'Aguarde...';
  
  auth.createUserWithEmailAndPassword(email, senha)
    .then((userCredential) => {
      alert('Conta criada com sucesso! Bem-vinda à Brugnera Store.');
      window.location.href = 'index.html'; // Manda pro site
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

  if(!email || !senha) return alert('Preencha todos os campos!');

  btn.textContent = 'Aguarde...';

  auth.signInWithEmailAndPassword(email, senha)
    .then((userCredential) => {
      // Se for o seu email de dona, manda pro painel Admin. Se for cliente, manda pra loja.
      if(email.includes('admin') || email.includes('caroline')) {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'index.html';
      }
    })
    .catch((error) => {
      alert('E-mail ou senha incorretos.');
      btn.textContent = 'Entrar';
    });
}