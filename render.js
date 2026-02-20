import { BROKERS, BROKER_COLORS, TIME_START, TIME_END, state } from "./config.js";
import { isoDate, getRow, getStartOfWeek, getClientList, getPropertyList, checkTimeOverlap } from "./utils.js";

// --- CONFIGURAÇÃO DE TEMAS ESPECÍFICOS POR NOME ---
// --- CONFIGURAÇÃO DE TEMAS ESPECÍFICOS POR NOME ---
const SPECIFIC_THEMES = {
    lima:   { bg: "#e0f2fe", border: "#0ea5e9" }, // Azul Claro (Sky)
    braga:  { bg: "#ffe4e6", border: "#f43f5e" }, // Vermelho Claro (Rose)
    davi:   { bg: "#dcfce7", border: "#22c55e" }, // Verde Claro (Green)
    carlos: { bg: "#fae8ff", border: "#d946ef" }, // Roxo/Rosa Claro (Fuchsia)
    igor:   { bg: "#fef9c3", border: "#eab308" }, // Amarelo (Yellow)
    carol:  { bg: "#fbcfe8", border: "#ec4899" }, // Rosa (Pink)
    
    // ALTERADO: De Cinza para Laranja Suave (Bege/Areia)
    // Assim não confunde com os cards que ficaram cinza por terem passado do horário
    externo:{ bg: "#f1ffd6ff", border: "#b8fb3cff" }, 
    
    chaves: { bg: "#ffefe8ff", border: "#7c5241ff" }, // Neutro (Stone)
};

// Fallback para outros casos (Paleta Pastel Padrão)
const PASTEL_FALLBACK = [
    { bg: "#e0e7ff", border: "#6366f1" }, // Indigo
    { bg: "#ecfccb", border: "#84cc16" }, // Lime
    { bg: "#cffafe", border: "#06b6d4" }, // Cyan
];
function getBrokerTheme(brokerId) {
    if (!brokerId) return SPECIFIC_THEMES.externo;
    
    // Tenta encontrar o corretor na lista para pegar o nome
    const broker = BROKERS.find(b => b.id === brokerId);
    
    // Se não achar, usa um fallback baseado no ID
    if (!broker) {
         let hash = 0;
         for (let i = 0; i < brokerId.length; i++) hash = brokerId.charCodeAt(i) + ((hash << 5) - hash);
         return PASTEL_FALLBACK[Math.abs(hash) % PASTEL_FALLBACK.length];
    }

    // Normaliza o nome para minúsculo para facilitar a busca
    const nameLower = broker.name.toLowerCase();

    // Aplica as cores conforme solicitado
    if (nameLower.includes("lima"))   return SPECIFIC_THEMES.lima;
    if (nameLower.includes("braga"))  return SPECIFIC_THEMES.braga;
    if (nameLower.includes("davi"))   return SPECIFIC_THEMES.davi;
    if (nameLower.includes("carlos")) return SPECIFIC_THEMES.carlos;
    if (nameLower.includes("igor"))   return SPECIFIC_THEMES.igor;
    if (nameLower.includes("carol"))  return SPECIFIC_THEMES.carol;
    if (nameLower.includes("externo")) return SPECIFIC_THEMES.externo;
    if (nameLower.includes("chave") || nameLower.includes("retirada")) return SPECIFIC_THEMES.chaves;

    // Se for um corretor novo não listado, usa fallback rotativo
    const idx = BROKERS.findIndex(b => b.id === brokerId);
    return PASTEL_FALLBACK[idx % PASTEL_FALLBACK.length];
}

// Função principal que decide qual visão desenhar
export function renderMain() {
  const grid = document.getElementById("schedule-grid");
  if (!grid) return;

  grid.innerHTML = "";
  grid.className = `schedule-grid grid-${state.currentView}`;
  
  if (state.currentView === "day") renderDayView(grid);
  if (state.currentView === "week") renderWeekView(grid);
  if (state.currentView === "month") renderMonthView(grid);
}

// --- Atualizar texto do cabeçalho (Data) ---
export function updateHeaderDate() {
  const dateEl = document.getElementById("current-date-label");
  if (!dateEl) return;

  if (state.currentView === "day") {
    dateEl.innerText = state.currentDate.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  } else if (state.currentView === "week") {
    const start = getStartOfWeek(state.currentDate);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    dateEl.innerText = `Semana de ${fmt(start)} até ${fmt(end)}`;
  } else {
    dateEl.innerText = state.currentDate.toLocaleString("pt-BR", { month: "long", year: "numeric" });
  }
}

export function scrollToBusinessHours() {
  setTimeout(() => {
    const container = document.getElementById("calendar-scroller");
    const target = document.getElementById("time-marker-08:00");
    if (target && container) {
      container.scrollTo({ top: target.offsetTop - 60, behavior: "smooth" });
    }
  }, 100);
}

// --- Funções Internas de Desenho ---

function renderDayView(grid) {
  grid.appendChild(createCell("header-cell", "Horário"));
  BROKERS.forEach((b, i) => {
    const h = createCell("header-cell", b.name);
    h.style.gridColumn = i + 2;
    h.style.gridRow = 1;
    grid.appendChild(h);
  });

  let row = 2;
  const dateStr = isoDate(state.currentDate);
  
  for (let h = TIME_START; h < TIME_END; h++) {
    ["00", "30"].forEach((m) => {
      const time = `${h.toString().padStart(2, "0")}:${m}`;
      const t = createCell("time-cell", time);
      t.id = `time-marker-${time}`;
      t.style.gridColumn = 1; t.style.gridRow = row;
      grid.appendChild(t);

      BROKERS.forEach((broker, colIdx) => {
        const slot = createCell("grid-slot", "");
        slot.style.gridColumn = colIdx + 2; slot.style.gridRow = row;
        slot.onclick = () => window.openModal(null, { brokerId: broker.id, time, date: dateStr });
        grid.appendChild(slot);
      });
      row++;
    });
  }
  
  const todaysAppts = state.appointments.filter((a) => a.date === dateStr);
  
  todaysAppts.forEach((appt) => {
      const bIdx = BROKERS.findIndex((b) => b.id === appt.brokerId);
      if (bIdx >= 0) {
          const col = bIdx + 2;
          const rStart = getRow(appt.startTime);
          const span = getRow(appt.endTime) - getRow(appt.startTime);
          
          let styleConfig = { width: "100%", left: "0%" };

          if (appt.isEvent) {
              styleConfig.width = "50%";
              styleConfig.left = "0%";
          } else {
              const conflictEvent = todaysAppts.find(other => 
                  other.isEvent && 
                  other.brokerId === appt.brokerId && 
                  checkTimeOverlap(appt, other)
              );
              if (conflictEvent) {
                  styleConfig.width = "50%";
                  styleConfig.left = "50%"; 
              }
          }
          placeCard(grid, appt, col, rStart, span, styleConfig);
      }
  });
}

function renderWeekView(grid) {
  const startOfWeek = getStartOfWeek(state.currentDate);
  const weekDays = [];
  
  grid.appendChild(createCell("header-cell", "Horário"));
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    weekDays.push(isoDate(d));
    const h = createCell("header-cell", d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric" }));
    h.classList.add("capitalize");
    h.style.gridColumn = i + 2; h.style.gridRow = 1;
    grid.appendChild(h);
  }

  let row = 2;
  for (let h = TIME_START; h < TIME_END; h++) {
    ["00", "30"].forEach((m) => {
      const time = `${h.toString().padStart(2, "0")}:${m}`;
      const t = createCell("time-cell", time);
      t.id = `time-marker-${time}`;
      t.style.gridColumn = 1; t.style.gridRow = row;
      grid.appendChild(t);
      weekDays.forEach((dIso, colIdx) => {
        const slot = createCell("grid-slot", "");
        slot.style.gridColumn = colIdx + 2; slot.style.gridRow = row;
        slot.onclick = () => window.openModal(null, { brokerId: state.selectedBrokerId, time, date: dIso });
        grid.appendChild(slot);
      });
      row++;
    });
  }

  const weekAppts = state.appointments.filter((a) => a.brokerId === state.selectedBrokerId && weekDays.includes(a.date));
  
  weekAppts.forEach((appt) => {
      const dayIdx = weekDays.indexOf(appt.date);
      if (dayIdx >= 0) {
          const col = dayIdx + 2;
          const rStart = getRow(appt.startTime);
          const span = getRow(appt.endTime) - getRow(appt.startTime);

          let styleConfig = { width: "100%", left: "0%" };
          if (appt.isEvent) {
              styleConfig.width = "50%";
              styleConfig.left = "0%";
          } else {
              const conflictEvent = weekAppts.find(other => 
                  other.isEvent && 
                  other.date === appt.date &&
                  checkTimeOverlap(appt, other)
              );
              if (conflictEvent) {
                  styleConfig.width = "50%";
                  styleConfig.left = "50%";
              }
          }
          placeCard(grid, appt, col, rStart, span, styleConfig);
      }
  });
}

function renderMonthView(grid) {
  ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"].forEach((d) => {
    const c = createCell("header-cell", d);
    c.style.position = "static";
    grid.appendChild(c);
  });

  const y = state.currentDate.getFullYear();
  const m = state.currentDate.getMonth();
  const firstDay = new Date(y, m, 1);
  const lastDay = new Date(y, m + 1, 0);
  
  let startDayOffset = firstDay.getDay() - 1;
  if (startDayOffset === -1) startDayOffset = 6;
  
  for (let i = 0; i < startDayOffset; i++) grid.appendChild(createCell("month-cell", ""));
  
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const cur = new Date(y, m, d);
    const iso = isoDate(cur);
    const cell = document.createElement("div");
    cell.className = "month-cell";
    cell.innerHTML = `<div class="month-cell-header">${d}</div>`;
    
    const dayAppts = state.appointments.filter((a) => a.date === iso && a.brokerId === state.selectedBrokerId);
    dayAppts.sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    dayAppts.forEach((a) => {
      const dot = document.createElement("div");
      // Cores novas aqui
      const theme = getBrokerTheme(a.brokerId);
      const bgColor = a.isEvent ? "#fff7ed" : theme.bg;
      const borderColor = a.isEvent ? "#f97316" : theme.border;
      
      dot.style.cssText = `font-size:10px; padding:2px; background:${bgColor}; margin-bottom:2px; border-radius:3px; overflow:hidden; white-space:nowrap; cursor:pointer; color:#0f172a; border-left: 3px solid ${borderColor}; border-top:1px solid rgba(0,0,0,0.05); border-right:1px solid rgba(0,0,0,0.05); border-bottom:1px solid rgba(0,0,0,0.05);`;
      
      const labelText = a.isEvent ? `(AVISO) ${a.eventComment}` : `${a.startTime} ${a.reference || ""} ${getClientList(a)[0]?.name || ""}`;
      dot.innerText = labelText;
      
      dot.onclick = (e) => { e.stopPropagation(); window.openModal(a); };
      cell.appendChild(dot);
    });
    
    cell.onclick = (e) => { 
        if (e.target === cell || e.target.className === "month-cell-header") { 
            state.currentDate = new Date(y, m, d); 
            window.setView("day"); 
        } 
    };
    grid.appendChild(cell);
  }
}

function createCell(cls, txt) { 
    const d = document.createElement("div"); 
    d.className = cls; 
    d.innerText = txt; 
    return d; 
}

function placeCard(grid, appt, col, rowStart, span, styleConfig = {}) {
  const div = document.createElement("div");
  
  // --- LÓGICA ALTERADA ---
  // Verifica se existe compartilhamento
  const hasShares = appt.sharedWith && appt.sharedWith.length > 0;
  
  // Verifica se EU (usuário logado) faço parte disso (Criador ou Convidado)
  const amInvolved = (appt.createdBy === state.userProfile.email) ||
                     (appt.sharedWith && appt.sharedWith.includes(state.userProfile.email));
                     
  // Só mostro o ícone se houver compartilhamento E eu for uma das partes interessadas
  const showSharedIcon = hasShares && amInvolved;
  // -----------------------
  
  // 1. Definição da Paleta de Cores
  const theme = getBrokerTheme(appt.brokerId);
  div.className = `appointment-card`;
  div.style.backgroundColor = theme.bg;
  div.style.borderLeftColor = theme.border; 

  // --- LÓGICA DE AGENDAMENTO PASSADO ---
  if (!appt.isEvent) {
      // Reconstrói a data/hora final do agendamento
      const [y, m, d] = appt.date.split('-').map(Number);
      const [h, min] = appt.startTime.split(':').map(Number);
      
      const apptEnd = new Date(y, m - 1, d, h, min);
      // Adiciona a duração
      apptEnd.setMinutes(apptEnd.getMinutes() + (parseInt(appt.duration) || 30));
      
      const now = new Date();

      // Se já passou o horário
      if (apptEnd < now) {
          // saturate(40%): Mantém a cor original, mas "desbota"
          // brightness(96%): Escurece um pouquinho
          div.style.filter = "saturate(40%) brightness(96%) contrast(90%)";
          div.style.cursor = "default";
      }
  }
  // -------------------------------------

  div.style.gridColumn = col;
  div.style.gridRow = `${rowStart} / span ${span}`;
  
  // Trava de tamanho (overflow hidden)
  div.style.overflow = "hidden"; 
  div.style.maxHeight = "100%";
  div.style.display = "flex";
  div.style.flexDirection = "column";
  div.style.justifyContent = "flex-start";
  
  if (styleConfig.width) div.style.width = styleConfig.width;
  if (styleConfig.left) div.style.left = styleConfig.left;

  const textStyle = `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; line-height: 1.2;`;

  if (appt.isEvent) {
      div.classList.add("event-card-style");
      div.style.zIndex = "15"; 
      div.innerHTML = `
          <div style="font-weight:bold; font-size:0.8rem; margin-bottom:2px; ${textStyle}"><i class="fas fa-exclamation-circle"></i> AVISO</div>
          <div style="font-style:italic; white-space: normal; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">${appt.eventComment || "Sem descrição"}</div>
      `;
  } else {
      div.style.zIndex = "20"; 
      
      if (state.userProfile && appt.createdBy === state.userProfile.email) {
          div.classList.add("my-appointment-highlight");
          const star = document.createElement("i");
          star.className = "fas fa-star my-star-icon";
          div.appendChild(star);
      }

      const contentDiv = document.createElement("div");
      contentDiv.style.flex = "1";
      contentDiv.style.overflow = "hidden";
      
      // Usa a nova variável showSharedIcon para decidir se renderiza o ícone
      let iconHtml = showSharedIcon ? `<i class="fas fa-users shared-icon" title="Compartilhado"></i> ` : "";
      
      let html = "";
      
      // Linha 1: Consultora + Ícone (se aplicável)
      html += `<div style="${textStyle}"><strong>Cons:</strong> ${iconHtml}${appt.createdByName}</div>`;
      
      const propertyList = getPropertyList(appt);
      const firstProperty = propertyList[0] || { reference: appt.reference || "", address: appt.propertyAddress || "" };

      // Linha 2: Referência
      if (firstProperty.reference) {
         html += `<div style="${textStyle}"><strong>Ref:</strong> ${firstProperty.reference}</div>`;
      }
      
      // Linha 3: Endereço
      html += `<div style="${textStyle}" title="${firstProperty.address || ""}"><strong>End:</strong> ${firstProperty.address || ""}</div>`;

      if (propertyList.length > 1) {
          html += `<div style="${textStyle}; color:#555;">+ ${propertyList.length - 1} imóvel(is)</div>`;
      }

      // Linha 4+: Clientes
      const clientList = getClientList(appt);
      if (clientList.length > 0) {
          const mainName = clientList[0].name || "Sem Nome"; 
          html += `<div style="${textStyle}" title="${mainName}"><strong>Cli:</strong> ${mainName}</div>`;
          
          if (clientList[0].phone) {
             html += `<div style="${textStyle}"><i class="fab fa-whatsapp" style="font-size:0.7rem; color: #25D366;"></i> ${clientList[0].phone}</div>`;
          }
          
          if (clientList.length > 1) {
              html += `<div style="${textStyle}; color:#555;">+ ${clientList.length - 1} cliente(s)</div>`;
          }
      }

      contentDiv.innerHTML = html;
      div.prepend(contentDiv);
  }

  div.onclick = (e) => { e.stopPropagation(); window.openModal(appt); };
  grid.appendChild(div);
}