import { state, BROKERS, TIME_START, TIME_END } from "./config.js";
import { getClientList } from "./utils.js";
import { renderMain, updateHeaderDate, scrollToBusinessHours } from "./render.js";

export function setupUIInteractions() {
    setupDropdowns();
    setupSearch();
    setupEventCheckboxLogic();
    setupClientAddButton();
    setupGlobalViewFunctions();
}

function setupDropdowns() {
    const opts = BROKERS.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
    const brokerSelectView = document.getElementById("view-broker-select");
    const brokerSelectForm = document.getElementById("form-broker");
    
    if(brokerSelectView) brokerSelectView.innerHTML = opts;
    if(brokerSelectForm) brokerSelectForm.innerHTML = opts;

    let times = "";
    for (let h = TIME_START; h < TIME_END; h++) {
        times += `<option value="${h.toString().padStart(2, "0")}:00">${h}:00</option>`;
        times += `<option value="${h.toString().padStart(2, "0")}:30">${h}:30</option>`;
    }
    times += `<option value="${TIME_END}:00">00:00 (Fim)</option>`;

    document.getElementById("form-start").innerHTML = times;
    document.getElementById("form-end").innerHTML = times;
}

function setupEventCheckboxLogic() {
    const chk = document.getElementById("form-is-event");
    if(!chk) return;

    chk.addEventListener("change", () => {
        const isEvent = chk.checked;
        const visitContainer = document.getElementById("visit-fields-container");
        const eventContainer = document.getElementById("event-fields-container");
        const shareSection = document.getElementById("share-section");

        if (isEvent) {
            visitContainer.classList.add("hidden");
            shareSection.classList.add("hidden");
            eventContainer.classList.remove("hidden");
            document.getElementById("form-address").required = false;
            document.getElementById("form-reference").required = false;
            document.querySelectorAll(".client-name-input").forEach(inp => {
                inp.required = false; inp.disabled = true;
            });
        } else {
            visitContainer.classList.remove("hidden");
            shareSection.classList.remove("hidden");
            eventContainer.classList.add("hidden");
            document.getElementById("form-address").required = true;
            document.getElementById("form-reference").required = true;
            document.querySelectorAll(".client-name-input").forEach(inp => {
                inp.required = true; inp.disabled = false;
            });
        }
    });
}

function setupClientAddButton() {
    const btnAddClient = document.getElementById("btn-add-client");
    if(btnAddClient) {
        btnAddClient.addEventListener("click", () => {
            const container = document.getElementById("clients-container");
            // Ao clicar no botão, geramos a data atual e o nome do usuário logado
            const nowStr = new Date().toLocaleString("pt-BR");
            addClientRow(
                "", 
                "", 
                state.userProfile.email, 
                container.children.length, 
                true,
                state.userProfile.name, // Nome de quem clicou
                nowStr                  // Data de agora
            );
        });
    }
}

function setupSearch() {
    const searchInput = document.getElementById("global-search");
    const dropdown = document.getElementById("search-dropdown");
    const list = document.getElementById("search-results-list");
  
    if(!searchInput || !dropdown) return; 

    document.addEventListener('click', (e) => {
        const isClickInside = searchInput.contains(e.target) || dropdown.contains(e.target);
        if (!isClickInside) dropdown.classList.remove('active');
    });

    searchInput.addEventListener("input", (e) => {
        const rawTerm = searchInput.value || "";
        const term = rawTerm.toLowerCase().trim();
        
        if (!term) { dropdown.classList.remove("active"); return; }

        const highlightMatch = (text) => {
            if (!text) return "";
            const strText = String(text);
            const regex = new RegExp(`(${term})`, 'gi'); 
            return strText.replace(regex, '<mark style="background-color: #fef08a; color:#854d0e; padding:0 2px; border-radius:2px;">$1</mark>');
        };

        const results = state.appointments.filter(a => {
            if (a.isEvent) return (a.eventComment && a.eventComment.toLowerCase().includes(term));
            
            const refMatch = (a.reference && a.reference.toLowerCase().includes(term));
            const addrMatch = (a.propertyAddress && a.propertyAddress.toLowerCase().includes(term));
            const consultantMatch = (a.createdByName && a.createdByName.toLowerCase().includes(term));
            
            const clientList = getClientList(a);
            const clientMatch = clientList.some(c => {
                const nameFound = (c.name && String(c.name).toLowerCase().includes(term));
                const cleanPhone = (c.phone || "").replace(/\D/g, "");
                const phoneFound = cleanPhone.includes(term) || (c.phone && c.phone.includes(term));
                return nameFound || phoneFound;
            });
            
            return refMatch || addrMatch || clientMatch || consultantMatch;
        });

        results.sort((a, b) => new Date(b.date) - new Date(a.date));
        list.innerHTML = "";
        
        if (results.length === 0) {
            list.innerHTML = "<div style='padding:12px; color:gray; text-align:center;'>Nenhum resultado encontrado.</div>";
        } else {
            results.forEach(res => {
                const div = document.createElement("div");
                div.className = "result-item";
                const dateParts = res.date.split("-");
                const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                
                if (res.isEvent) {
                    div.innerHTML = `
                        <div class="result-main-line">
                            <span style="color:#f97316;">EVENTO: ${highlightMatch(res.eventComment)}</span>
                            <span class="result-date">${dateFormatted}</span>
                        </div>`;
                } else {
                    const clientNamesHtml = getClientList(res).map(c => {
                        const name = c.name || "Sem Nome";
                        return highlightMatch(name);
                    }).join(", ");

                    const consultantName = res.createdByName || "Consultora";
                    const consultantHtml = highlightMatch(consultantName);

                    const refHtml = highlightMatch(res.reference || "Sem Ref");
                    const addrHtml = highlightMatch(res.propertyAddress);

                    div.innerHTML = `
                    <div class="result-main-line">
                        <span class="result-ref">${refHtml}</span>
                        <span class="result-date">${dateFormatted}</span>
                    </div>
                    
                    <div class="result-sub" style="font-weight:600; color:#444;">
                        <i class="fas fa-user-tie" style="font-size:0.8em;"></i> ${consultantHtml}
                    </div>
                    
                    <div class="result-sub">${addrHtml}</div>
                    <div class="result-sub" style="color:#64748b;">${clientNamesHtml}</div>`;
                }
                
                div.onclick = () => {
                    dropdown.classList.remove("active");
                    searchInput.value = ""; 
                    const [y, m, d] = res.date.split("-").map(Number);
                    state.currentDate = new Date(y, m - 1, d);
                    window.setView('day'); 
                    setTimeout(() => {
                        const targetId = `time-marker-${res.startTime}`;
                        const el = document.getElementById(targetId);
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                    }, 150); 
                    if(window.openModal) window.openModal(res);
                };
                list.appendChild(div);
            });
        }
        dropdown.classList.add("active");
    });
}

function setupGlobalViewFunctions() {
    window.setView = (view) => {
        state.currentView = view;
        document.querySelectorAll(".view-btn").forEach((b) => b.classList.remove("active"));
        document.getElementById(`btn-${view}`).classList.add("active");
        
        const brokerSel = document.getElementById("view-broker-select");
        if (view === "day") brokerSel.classList.add("hidden");
        else brokerSel.classList.remove("hidden");
        
        updateHeaderDate();
        renderMain();
        if (view !== "month") scrollToBusinessHours();
    };

    window.changeDate = (delta) => {
        if (state.currentView === "day") state.currentDate.setDate(state.currentDate.getDate() + delta);
        if (state.currentView === "week") state.currentDate.setDate(state.currentDate.getDate() + delta * 7);
        if (state.currentView === "month") state.currentDate.setMonth(state.currentDate.getMonth() + delta);
        updateHeaderDate();
        renderMain();
    };

    window.changeBrokerFilter = () => {
        state.selectedBrokerId = document.getElementById("view-broker-select").value;
        renderMain();
    };
    
    window.closeModal = () => {
        document.getElementById("modal").classList.remove("open");
    };
}

// --- FUNÇÃO AJUSTADA PARA FLEXBOX E DADOS DE CADASTRO ---
export function addClientRow(nameVal, phoneVal, addedByVal, index, rowEditable, addedByNameVal = "", addedAtVal = "") {
    const container = document.getElementById("clients-container");
    const row = document.createElement("div");
    row.className = "client-item-row";
    
    // Layout Flexbox: Garante que fiquem lado a lado e alinhados ao topo
    row.style.display = "flex";
    row.style.gap = "10px";
    row.style.alignItems = "flex-start";
    row.style.marginBottom = "10px";
    row.style.paddingBottom = "10px";
    row.style.borderBottom = "1px solid #eee";
    
    // Hidden inputs originais
    const hiddenAddedBy = document.createElement("input");
    hiddenAddedBy.type = "hidden"; hiddenAddedBy.className = "client-added-by"; hiddenAddedBy.value = addedByVal || state.userProfile.email; 
    row.appendChild(hiddenAddedBy);

    // --- NOVOS INPUTS HIDDEN (Nome e Data) ---
    const hiddenAddedByName = document.createElement("input");
    hiddenAddedByName.type = "hidden"; 
    hiddenAddedByName.className = "client-added-by-name";
    hiddenAddedByName.value = addedByNameVal || ""; 
    row.appendChild(hiddenAddedByName);

    const hiddenAddedAt = document.createElement("input");
    hiddenAddedAt.type = "hidden"; 
    hiddenAddedAt.className = "client-added-at";
    hiddenAddedAt.value = addedAtVal || ""; 
    row.appendChild(hiddenAddedAt);
    
    // --- COLUNA NOME ---
    const divName = document.createElement("div");
    divName.style.flex = "1"; // Ocupa metade
    
    const labelName = document.createElement("label");
    labelName.textContent = "Nome";
    // Estilos inline para garantir visual correto sem depender só do CSS externo
    labelName.style.display = "block";
    labelName.style.fontSize = "0.85rem";
    labelName.style.fontWeight = "600";
    labelName.style.marginBottom = "4px";

    const inputName = document.createElement("input");
    inputName.type = "text"; inputName.className = "form-control client-name-input";
    inputName.value = nameVal; inputName.required = true; inputName.disabled = !rowEditable;
    inputName.style.width = "100%";
    
    divName.appendChild(labelName); 
    divName.appendChild(inputName);

    // EXIBIÇÃO VISUAL: "Cadastrado por..."
    if (hiddenAddedByName.value && hiddenAddedAt.value) {
        const infoDiv = document.createElement("div");
        infoDiv.style.fontSize = "0.7rem";
        infoDiv.style.color = "#94a3b8"; 
        infoDiv.style.marginTop = "4px";
        infoDiv.style.fontStyle = "italic";
        infoDiv.style.lineHeight = "1.2";
        infoDiv.innerText = `Cadastrado por: ${hiddenAddedByName.value} em ${hiddenAddedAt.value}`;
        divName.appendChild(infoDiv);
    }

    // --- COLUNA TELEFONE ---
    const divPhone = document.createElement("div");
    divPhone.style.flex = "1"; // Ocupa metade
    
    const labelPhone = document.createElement("label");
    labelPhone.textContent = "Telefone";
    labelPhone.style.display = "block";
    labelPhone.style.fontSize = "0.85rem";
    labelPhone.style.fontWeight = "600";
    labelPhone.style.marginBottom = "4px";

    const inputPhone = document.createElement("input");
    inputPhone.type = "text"; inputPhone.className = "form-control client-phone-input";
    inputPhone.value = phoneVal; inputPhone.disabled = !rowEditable;
    inputPhone.style.width = "100%";
    inputPhone.addEventListener('input', function(e) { e.target.value = e.target.value.replace(/[^0-9+\-()\s]/g, ''); });
    
    divPhone.appendChild(labelPhone); 
    divPhone.appendChild(inputPhone);

    row.appendChild(divName); 
    row.appendChild(divPhone);

    // BOTÃO REMOVER
    if (rowEditable) {
        const btnContainer = document.createElement("div");
        // Ajuste para alinhar verticalmente com os inputs (compensando o label)
        btnContainer.style.display = "flex";
        btnContainer.style.alignItems = "center";
        btnContainer.style.justifyContent = "center";
        btnContainer.style.paddingTop = "24px"; 

        const btnRem = document.createElement("button");
        btnRem.type = "button"; btnRem.className = "remove-client-btn";
        btnRem.innerHTML = "<i class='fas fa-trash'></i>";
        // Estilos para garantir que o botão fique bonito e limpo
        btnRem.style.border = "none";
        btnRem.style.background = "transparent";
        btnRem.style.color = "#ef4444";
        btnRem.style.cursor = "pointer";
        btnRem.style.fontSize = "1rem";

        btnRem.onclick = () => { row.remove(); };
        btnContainer.appendChild(btnRem);
        row.appendChild(btnContainer);
    }
    container.appendChild(row);
}