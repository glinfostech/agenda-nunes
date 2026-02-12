// config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getFirestore, 
    enableIndexedDbPersistence 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// --- CONFIGURAÇÃO ---
const firebaseConfig = {
  apiKey: "AIzaSyCktArIqaWQr3HrXTeJ-tCa1BJGlIlcAVY",
  authDomain: "agenda-imobiliaria-fec0f.firebaseapp.com",
  projectId: "agenda-imobiliaria-fec0f",
  storageBucket: "agenda-imobiliaria-fec0f.firebasestorage.app",
  messagingSenderId: "288904850912",
  appId: "1:288904850912:web:7d3042336f78d7ecfb4f85",
  measurementId: "G-V89NSRTS34"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// --- ATIVAÇÃO DA PERSISTÊNCIA (CACHE) ---
// Isso faz com que o F5 não conte como novas leituras para dados já baixados
enableIndexedDbPersistence(db)
  .catch((err) => {
      if (err.code == 'failed-precondition') {
          console.log('Muitas abas abertas. Persistência habilitada em apenas uma.');
      } else if (err.code == 'unimplemented') {
          console.log('Navegador não suporta persistência.');
      }
  });

// --- DADOS E CONSTANTES ---
export const BROKERS = [
  { id: "broker_lima", name: "Lima" },
  { id: "broker_braga", name: "Braga" },
  { id: "broker_davi", name: "Davi" },
  { id: "broker_carlos", name: "Carlos" },
  { id: "broker_igor", name: "Igor" },
  { id: "carol", name: "Carol" },
  { id: "broker_externo", name: "Corretor Externo" },
  { id: "broker_chaves", name: "Retirada de Chaves" },
];

export const BROKER_COLORS = {
  "broker_lima": "#bae6fd",
  "broker_braga": "#fd9c9cff",
  "broker_davi": "#bbf7d0",
  "broker_carlos": "#ffa6f3ff",
  "broker_igor": "#fde047",
  "broker_externo": "#e5e7eb",
  "broker_chaves": "#fed7aa",
  "default": "#c7d2fe" 
};

export const TIME_START = 0;
export const TIME_END = 24;

// --- ESTADO GLOBAL (State) ---
export const state = {
    appointments: [],
    availableConsultants: [],
    userProfile: null,
    currentView: "day",
    currentDate: new Date(),
    selectedBrokerId: BROKERS[0].id,
    appInitialized: false,
    unsubscribeSnapshot: null
};