// app.js

// 1. IMPORTAÇÕES
import { db, state } from "./config.js";
import { updateHeaderDate, renderMain, scrollToBusinessHours } from "./render.js";
import { 
    collection, query, where, onSnapshot, limit 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

import { initAuth } from "./auth.js";
import { setupUIInteractions } from "./interactions.js";
import { setupAppointmentLogic } from "./appointments.js";
import { initReports } from "./reports.js"; 

// 2. INICIALIZAÇÃO E AUTENTICAÇÃO
initAuth(initApp);

// 3. FUNÇÃO PRINCIPAL
function initApp() {
    if (!state.appInitialized) {
        setupUIInteractions();
        setupAppointmentLogic();
        state.appInitialized = true;
        
        // Renderiza o nome do usuário assim que possível
        renderUserInfo();

        // Delay para garantir que módulos dependentes (como reports)
        // tenham acesso ao state.userProfile totalmente carregado
        setTimeout(() => {
            // --- CORREÇÃO AQUI ---
            // Verifica se o perfil carregou E se é admin antes de iniciar relatórios
            if (state.userProfile && state.userProfile.role === 'admin') {
                initReports(); 
            }
            // ---------------------
            
            renderUserInfo(); // Garante novamente a renderização da info do usuário
        }, 1000);
    }
    // Inicia ouvintes baseado na data atual do estado (ou hoje)
    const baseDate = state.currentDate || new Date();
    setupRealtime(baseDate);
    
    updateHeaderDate();
    renderMain();
    scrollToBusinessHours();
}

function renderUserInfo() {
    if (!state.userProfile) return;
    
    // Mapeamento de cargos
    const rolesMap = {
        'admin': 'Administrador',
        'consultant': 'Consultora',
        'broker': 'Corretor'
    };

    const userInfoDiv = document.querySelector('.user-info');
    if (userInfoDiv) {
        // Busca no mapa ou usa 'Corretor' como padrão caso não encontre
        const roleDisplay = rolesMap[state.userProfile.role] || 'Corretor';

        userInfoDiv.innerHTML = `
            <div style="font-weight:700; font-size:0.9rem;">${state.userProfile.name}</div>
            <div style="font-size:0.75rem; color:#64748b;">${roleDisplay}</div>
        `;
        userInfoDiv.style.display = 'block';
    }
}

// 4. REALTIME LISTENER OTIMIZADO
// Aceita uma 'centerDate' para saber em torno de qual data buscar dados
export function setupRealtime(centerDate) {
  // SEGURANÇA: Se já existir um ouvinte rodando, cancela ele antes de criar um novo.
  // Isso impede que você tenha 2, 3, 10 ouvintes rodando ao mesmo tempo gastando leitura.
  if (state.unsubscribeSnapshot) {
      state.unsubscribeSnapshot();
      state.unsubscribeSnapshot = null;
  }

  // Define datas relativas à data central informada
  // Ex: Se o usuário estiver olhando o mês que vem, carrega dados de lá.
  const startDate = new Date(centerDate);
  startDate.setDate(startDate.getDate() - 30); // 30 dias para trás
  
  const endDate = new Date(centerDate);
  endDate.setDate(endDate.getDate() + 30); // 30 dias para frente

  // Formatação YYYY-MM-DD
  const formatDate = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
  };

  const startString = formatDate(startDate);
  const endString = formatDate(endDate);

  console.log(`[Firestore] Lendo agenda de ${startString} até ${endString}`);

  // Query Otimizada + Limite de Segurança
  const q = query(
      collection(db, "appointments"), 
      where("date", ">=", startString),
      where("date", "<=", endString),
      limit(2000) 
  );
  
  state.unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
      const appts = [];
      snapshot.forEach((doc) => {
          appts.push({ id: doc.id, ...doc.data() });
      });
      
      state.appointments = appts;
      renderMain();
  }, (error) => {
      console.error("Erro no listener realtime:", error);
      // Se der erro de índice, o link aparecerá aqui no console
  });
}