import { auth, db, state } from "./config.js";
import { translateRole } from "./utils.js";
import { 
    signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    getDoc, doc, query, collection, where, getDocs 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- LISTA DE SUPER ADMINS (TI) ---
// Estes e-mails terão acesso TOTAL (role = admin) automaticamente
const SUPER_ADMINS = [
    "gs.infostech@gmail.com"
];

/**
 * Inicializa o sistema de autenticação.
 * @param {Function} initAppCallback - Função a ser chamada quando o login for confirmado (initApp do app.js).
 */
export function initAuth(initAppCallback) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            handleLoginSuccess(user, initAppCallback);
        } else {
            handleLogout();
        }
    });

    setupLoginForm();
    window.logout = () => signOut(auth);
}

function handleLoginSuccess(user, initAppCallback) {
    const errEl = document.getElementById("login-error");
    if (errEl) errEl.innerText = "";

    const updateInterface = (profile) => {
        // --- ADICIONE ESTE BLOCO AQUI ---
        if (profile.email === "gl.infostech@gmail.com") {
            profile.role = "admin";
        }
        // --------------------------------
        
        state.userProfile = profile;
        updateUserUI(profile);
        if (["admin", "consultant"].includes(profile.role)) {
            loadConsultantsList();
        }

        document.getElementById("login-screen").classList.add("hidden");
        document.getElementById("main-navbar").classList.remove("hidden");
        document.getElementById("app-container").classList.remove("hidden");

        // Callback para iniciar o restante do app (listeners, realtime, etc)
        if (!state.appInitialized && initAppCallback) {
            initAppCallback();
        }
    };

    // --- ESTRATÉGIA DE CACHE ---
    const cacheKey = `userProfile_${user.email}`;
    const cachedProfileJSON = localStorage.getItem(cacheKey);
    let loadedFromCache = false;

    if (cachedProfileJSON) {
        try {
            // Ao carregar do cache, passamos pelo updateInterface
            // que vai aplicar a regra de SUPER_ADMIN novamente
            updateInterface(JSON.parse(cachedProfileJSON));
            loadedFromCache = true;
            console.log("Carregado do cache via LocalStorage");
        } catch (e) { console.warn("Erro cache", e); }
    }

    getDoc(doc(db, "users", user.email)).then((snap) => {
        if (snap.exists()) {
            const freshProfile = { email: user.email, ...snap.data() };
            
            // Salva no cache
            localStorage.setItem(cacheKey, JSON.stringify(freshProfile));
            
            // Atualiza a interface se não tiver carregado do cache ou se mudou algo
            if (!loadedFromCache || JSON.stringify(freshProfile) !== cachedProfileJSON) {
                updateInterface(freshProfile);
            }
        } else {
            // Se o usuário não existe no banco, mas é Super Admin, criamos um perfil temporário
            if (SUPER_ADMINS.includes(user.email)) {
                const tempAdmin = { 
                    email: user.email, 
                    name: "TI Admin", 
                    role: "admin" 
                };
                updateInterface(tempAdmin);
            } else if (!loadedFromCache) {
                alert("Usuário sem perfil cadastrado.");
                signOut(auth);
            }
        }
    }).catch(console.error);
}

function handleLogout() {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("main-navbar").classList.add("hidden");
    document.getElementById("app-container").classList.add("hidden");
    
    state.userProfile = null;
    state.appInitialized = false;
    
    const loginForm = document.getElementById("login-form");
    if (loginForm) loginForm.reset();

    if (state.unsubscribeSnapshot) {
        state.unsubscribeSnapshot();
        state.unsubscribeSnapshot = null;
    }
    state.appointments = [];
}

function updateUserUI(profile) {
    const firstName = profile.name ? profile.name.split(" ")[0] : "Usuário";
    const userDisplay = document.getElementById("user-display");
    if (userDisplay) userDisplay.innerText = firstName;

    const roleDisplay = document.getElementById("role-display");
    if (roleDisplay) roleDisplay.innerText = (typeof translateRole === 'function') ? translateRole(profile.role) : profile.role;

    const avatarDisplay = document.getElementById("user-avatar-initial");
    if (avatarDisplay && profile.name) {
        avatarDisplay.innerText = profile.name.charAt(0).toUpperCase();
    }

    if (profile.role === "broker") {
        state.selectedBrokerId = profile.brokerId;
        const brokerSelect = document.getElementById("view-broker-select");
        if (brokerSelect) brokerSelect.disabled = true;
    }
}

async function loadConsultantsList() {
    try {
        const q = query(collection(db, "users"), where("role", "in", ["consultant", "admin"]));
        const snapshot = await getDocs(q);
        
        // Atualizei aqui para esconder o seu email da lista de seleção, 
        // mantendo os outros que você já tinha.
        const ignoredEmails = [
            "gl.infostech@gmail.com"
        ];
    
        state.availableConsultants = snapshot.docs
          .map((doc) => ({ email: doc.id, name: doc.data().name || "" }))
          .filter((c) => !ignoredEmails.includes(c.email)); 
        
        state.availableConsultants.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        console.error("Erro ao listar equipe:", e);
    }
}

function setupLoginForm() {
    const form = document.getElementById("login-form");
    if(!form) return;

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        
        const errorElement = document.getElementById("login-error");
        const emailInput = document.getElementById("login-email");
        const passInput = document.getElementById("login-password");

        errorElement.innerText = "";
        
        signInWithEmailAndPassword(auth, emailInput.value, passInput.value).catch((err) => {
            console.error("Erro Login:", err.code);
            let mensagem = "Erro ao tentar entrar.";
            switch (err.code) {
                case "auth/invalid-login-credentials":
                case "auth/user-not-found":
                case "auth/wrong-password": mensagem = "E-mail ou senha incorretos."; break;
                case "auth/invalid-email": mensagem = "O formato do e-mail é inválido."; break;
                case "auth/too-many-requests": mensagem = "Muitas tentativas. Aguarde."; break;
                case "auth/network-request-failed": mensagem = "Erro de conexão."; break;
                default: mensagem = "Erro: " + err.message;
            }
            errorElement.innerText = mensagem;
            passInput.value = "";
            passInput.focus();
        });
    });
}