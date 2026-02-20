//appointments-ui.js: Só cuida da aparência. Abre o modal, preenche os campos, esconde/mostra botões e controla as abas (Evento vs Visita).

import { state, BROKERS } from "./config.js";
import { addClientRow, addPropertyRow } from "./interactions.js";
import { getClientList, getPropertyList } from "./utils.js";
import { 
    isTimeLocked, 
    getLockMessage, 
    createWhatsappButton,
    getConsultantName
} from "./appointments-core.js";

// --- FUNÇÃO DE LEITURA DO FORMULÁRIO (EXTRAI DADOS PARA O CONTROLADOR) ---
export function getFormDataFromUI() {
    const idRaw = document.getElementById("appt-id").value;
    const id = idRaw ? idRaw.trim() : "";
    const chkIsEvent = document.getElementById("form-is-event");
    
    // Coleta Clientes
    let clientsData = [];
    const rows = document.querySelectorAll(".client-item-row");
    rows.forEach(row => {
        const nameInput = row.querySelector(".client-name-input");
        const phoneInput = row.querySelector(".client-phone-input");
        const addedByInput = row.querySelector(".client-added-by");
        const addedByNameInput = row.querySelector(".client-added-by-name");
        const addedAtInput = row.querySelector(".client-added-at");
        if(nameInput && nameInput.value.trim()) {
            clientsData.push({ 
                name: nameInput.value.trim(), 
                phone: phoneInput.value.trim(), 
                addedBy: addedByInput.value, 
                addedByName: addedByNameInput ? addedByNameInput.value : "", 
                addedAt: addedAtInput ? addedAtInput.value : ""
            });
        }
    });

    // Coleta Imóveis
    let propertiesData = [];
    const propertyRows = document.querySelectorAll(".property-item-row");
    propertyRows.forEach(row => {
        const referenceInput = row.querySelector(".property-reference-input");
        const addressInput = row.querySelector(".property-address-input");
        const reference = referenceInput ? referenceInput.value.trim() : "";
        const address = addressInput ? addressInput.value.trim() : "";
        if (reference || address) {
            propertiesData.push({ reference, address });
        }
    });

    // Coleta Checkboxes de Compartilhamento
    let sharedWith = [];
    const checkboxes = document.querySelectorAll("#share-checkboxes input[type='checkbox']");
    checkboxes.forEach(chk => { if (chk.checked) sharedWith.push(chk.value); });

    // Coleta Recorrência (se houver)
    const recurrenceEnd = document.getElementById("recurrence-end-date").value;
    const recurrenceDays = Array.from(document.querySelectorAll("input[name='recurrence-day']:checked")).map(c => parseInt(c.value));

    // Owner Select (Admin)
    const ownerSelect = document.getElementById("form-owner-select");
    let adminSelectedOwner = ownerSelect ? ownerSelect.value : null;

    // Elementos de Status (Novos)
    const statusEl = document.getElementById("form-status");
    const statusObsEl = document.getElementById("form-status-obs");

    return {
        id,
        brokerId: document.getElementById("form-broker").value,
        date: document.getElementById("form-date").value,
        startTime: document.getElementById("form-start").value,
        endTime: document.getElementById("form-end").value,
        isEvent: chkIsEvent.checked,
        
        // --- NOVOS CAMPOS DE STATUS ---
        status: statusEl ? statusEl.value : "agendada",
        statusObservation: statusObsEl ? statusObsEl.value : "",
        // ------------------------------

        eventComment: document.getElementById("form-event-comment").value,
        reference: propertiesData[0]?.reference || "",
        propertyAddress: propertiesData[0]?.address || "",
        properties: propertiesData,
        clients: clientsData,
        sharedWith: sharedWith,
        recurrence: {
            endDate: recurrenceEnd,
            days: recurrenceDays
        },
        adminSelectedOwner
    };
}

// --- LÓGICA DE ABERTURA E APARÊNCIA DO MODAL ---
export function openAppointmentModal(appt, defaults = {}, onDeleteCallback) {
    const modal = document.getElementById("modal");
    const btnSave = document.getElementById("btn-save");
    const btnDel = document.getElementById("btn-delete");
    const lockWarning = document.getElementById("lock-warning");
    const chkIsEvent = document.getElementById("form-is-event");
    const recurrenceSection = document.getElementById("recurrence-section");
    const headerInfo = document.getElementById("creation-info-header");
    
    const divEventType = document.getElementById("div-event-type");
    const inpBroker = document.getElementById("form-broker");
    const brokerStatic = document.getElementById("broker-static-name");
    const btnChangeBroker = document.getElementById("btn-change-broker");
    
    const whatsContainer = document.getElementById("whatsapp-buttons-container");
    const shareCheckboxes = document.getElementById("share-checkboxes");
    const shareSection = document.getElementById("share-section");
    let btnAddClient = document.getElementById("btn-add-client"); 

    const inpDate = document.getElementById("form-date");
    const dateStatic = document.getElementById("date-static-display");
    const btnChangeDate = document.getElementById("btn-change-date");
    const propertiesContainer = document.getElementById("properties-container");
    let btnAddProperty = document.getElementById("btn-add-property");
    const inpEventComment = document.getElementById("form-event-comment");
    const inpStart = document.getElementById("form-start");
    const inpEnd = document.getElementById("form-end");

    // --- ELEMENTOS DE STATUS ---
    const inpStatus = document.getElementById("form-status");
    const divStatusObs = document.getElementById("div-status-obs");
    const lblStatusObs = document.getElementById("lbl-status-obs");
    const inpStatusObs = document.getElementById("form-status-obs");

    if(btnSave) btnSave.disabled = false;
    modal.classList.add("open");
    document.getElementById("appt-id").value = appt ? appt.id : "";

    // --- SETUP LAYOUT ---
    setupCustomLayout(inpBroker, divEventType);

    // --- PREENCHIMENTO CAMPOS ---
    populateBrokerField(inpBroker, brokerStatic, btnChangeBroker, appt, defaults);
    populateDateField(inpDate, dateStatic, btnChangeDate, appt, defaults);

    whatsContainer.innerHTML = ""; 
    lockWarning.style.display = "none";

    // --- LÓGICA DE STATUS (PREENCHIMENTO E EVENTOS) ---
    if (inpStatus) {
        const currentStatus = (appt && appt.status) ? appt.status : "agendada";
        inpStatus.value = currentStatus;
        if(inpStatusObs) inpStatusObs.value = (appt && appt.statusObservation) ? appt.statusObservation : "";

        const updateStatusUI = () => {
            const val = inpStatus.value;
            if (val === "agendada") {
                if(divStatusObs) divStatusObs.classList.add("hidden");
            } else {
                if(divStatusObs) divStatusObs.classList.remove("hidden");
                if (val === "cancelada") {
                    if(lblStatusObs) lblStatusObs.innerText = "Motivo do Cancelamento / Problema";
                    if(inpStatusObs) inpStatusObs.placeholder = "Descreva o motivo do cancelamento...";
                } else {
                    if(lblStatusObs) lblStatusObs.innerText = "Interesse do Cliente / Feedback";
                    if(inpStatusObs) inpStatusObs.placeholder = "O cliente gostou? Fez proposta? (Opcional)";
                }
            }
        };

        inpStatus.onchange = updateStatusUI;
        updateStatusUI(); 
    }

    // --- PERMISSÕES (LÓGICA AJUSTADA) ---
    const amICreator = appt ? appt.createdBy === state.userProfile.email : true; 
    const isAdmin = state.userProfile.role === "admin";
    const isSuperAdmin = (state.userProfile.email === "gl.infostech@gmail.com");
    const amIShared = appt && appt.sharedWith && appt.sharedWith.includes(state.userProfile.email);
    
    // CoreEditor: Admin ou Criador
    const isCoreEditor = (isAdmin || amICreator);
    // CanSaveAny: Pode salvar se for Editor, Criador ou Compartilhado
    const canSaveAny = (isCoreEditor || amIShared);
    
    // Lógica de Trava Temporal
    let isLocked = false;
    if (appt && isTimeLocked(appt.date, appt.startTime) && !isSuperAdmin) {
        isLocked = true;
        lockWarning.style.display = "block";
        lockWarning.innerText = getLockMessage(appt.date);
    }

    // --- REGRAS ESPECÍFICAS PEDIDAS NO PROMPT ---
    
    // 1. Quem pode editar o STATUS?
    // Regra: Criador/Admin pode SEMPRE. Compartilhados só se NÃO estiver bloqueado.
    const canEditStatus = (amICreator || isAdmin) || (canSaveAny && !isLocked);

    // 2. Quem pode interagir com o GERAL (Campos principais)?
    // Regra original: Ninguém se estiver bloqueado.
    const canInteractGeneral = canSaveAny && !isLocked;

    // 3. O botão SALVAR deve aparecer?
    // Aparece se puder interagir no geral OU se puder editar Status (mesmo bloqueado)
    const showSaveButton = canInteractGeneral || (isLocked && (amICreator || isAdmin));
    
    // 4. Pode deletar?
    const canDelete = isCoreEditor && !isLocked;

    const isEvent = appt ? appt.isEvent : false;
    divEventType.classList.toggle("hidden", !canSaveAny);

    // --- UPDATE FORM STATE ---
    const updateFormState = () => {
        const isEvt = chkIsEvent.checked;
        const clContainer = document.getElementById("clients-container");
        const clientHeader = document.querySelector(".clients-header-row");
        
        // Bloqueio Geral (Data, Hora, Endereço...)
        const disableCore = !isCoreEditor || isLocked;

        inpBroker.disabled = disableCore;
        inpDate.disabled = disableCore;
        inpStart.disabled = disableCore;
        inpEnd.disabled = disableCore;
        inpEventComment.disabled = disableCore;
        chkIsEvent.disabled = disableCore;

        // --- MUDANÇA 1: Status segue permissão específica ---
        if(inpStatus) inpStatus.disabled = !canEditStatus;
        if(inpStatusObs) inpStatusObs.disabled = !canEditStatus;

        const ownerSelect = document.getElementById("form-owner-select");
        if(ownerSelect) ownerSelect.disabled = disableCore;

        // --- MUDANÇA 2: Botão de Trocar Corretor ---
        // Regra: Bloqueado para todos, exceto Criador (sempre) ou se estiver Aberta (Core Editors)
        if(btnChangeBroker) {
            // Se sou Criador/Admin, posso trocar SE (não bloqueado OU sou criador)
            // Simplificando: Criador pode sempre. Outros Admins só se não bloqueado? 
            // O prompt diz: "bloqueado para todos a nao ser para quem criou ou enquanto a visita estiver aberta"
            const canChangeBroker = isCoreEditor && (!isLocked || amICreator);
            
            // Só mostra o botão se tiver permissão E o campo de input estiver escondido (modo visualização)
            const show = (canChangeBroker && appt && inpBroker.classList.contains("hidden"));
            
            btnChangeBroker.style.display = show ? "inline-flex" : "none";
            show ? btnChangeBroker.classList.remove("hidden") : btnChangeBroker.classList.add("hidden");
        }

        if(btnChangeDate) {
            const show = (!disableCore && appt && inpDate.classList.contains("hidden"));
            btnChangeDate.style.display = show ? "inline-flex" : "none";
            show ? btnChangeDate.classList.remove("hidden") : btnChangeDate.classList.add("hidden");
        }

        if (isEvt) {
            if(propertiesContainer) propertiesContainer.classList.add("hidden");
            if(btnAddProperty) btnAddProperty.classList.add("hidden");
            inpEventComment.parentElement.classList.remove("hidden");
            if(clContainer) clContainer.classList.add("hidden");
            if(clientHeader) clientHeader.classList.add("hidden");
            if(btnAddClient) btnAddClient.classList.add("hidden");
            enforcePropertyRowPermissions(false, true);
        } else {
            if(propertiesContainer) propertiesContainer.classList.remove("hidden");
            if(btnAddProperty) btnAddProperty.classList.toggle("hidden", !canInteractGeneral);
            inpEventComment.parentElement.classList.add("hidden");
            if(clContainer) clContainer.classList.remove("hidden");
            if(clientHeader) clientHeader.classList.remove("hidden");
            // Botão Adicionar Cliente: segue regra geral de interação (bloqueado se Locked)
            if(btnAddClient) btnAddClient.classList.toggle("hidden", !canInteractGeneral);
            enforceClientRowPermissions(isLocked, isCoreEditor, chkIsEvent.checked);
            enforcePropertyRowPermissions(canInteractGeneral, chkIsEvent.checked);
        }
    };

    chkIsEvent.checked = isEvent; 
    chkIsEvent.dispatchEvent(new Event('change')); 
    chkIsEvent.onclick = updateFormState;
    updateFormState(); // Init

    // --- RECORRÊNCIA (ADMIN) ---
    if (isAdmin && !appt) {
        recurrenceSection.classList.remove("hidden");
        document.getElementById("recurrence-end-date").value = "";
        document.querySelectorAll("input[name='recurrence-day']").forEach(c => c.checked = false);
    } else {
        recurrenceSection.classList.add("hidden");
    }

    // --- BOTÕES DE AÇÃO VISUAL ---
    // MUDANÇA 3: Botão Salvar visível se puder salvar algo (mesmo que só o status)
    btnSave.classList.toggle("hidden", !showSaveButton);
    btnDel.classList.toggle("hidden", !canDelete);
    
    if(btnAddProperty) {
        const newBtnProperty = btnAddProperty.cloneNode(true);
        btnAddProperty.parentNode.replaceChild(newBtnProperty, btnAddProperty);
        btnAddProperty = newBtnProperty;
        btnAddProperty.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            addPropertyRow("", "", 0, true);
        };
    }

    // Configura o botão de adicionar cliente
    if(btnAddClient) {
        const newBtn = btnAddClient.cloneNode(true);
        btnAddClient.parentNode.replaceChild(newBtn, btnAddClient);
        btnAddClient = newBtn;
        btnAddClient.onclick = (e) => {
             e.preventDefault(); e.stopPropagation(); 
             const nowStr = new Date().toLocaleString("pt-BR");
             addClientRow("", "", state.userProfile.email, 0, true, state.userProfile.name, nowStr);
        };
    }

    // --- PREENCHIMENTO DE DADOS ESPECÍFICOS ---
    if (appt) {
        document.getElementById("modal-title").innerText = isEvent ? "Evento/Aviso" : "Detalhes da Visita";
        renderHeaderInfo(headerInfo, appt, isAdmin, isSuperAdmin);
        renderHistoryLogs(appt, isAdmin);

        if (isEvent) {
            inpEventComment.value = appt.eventComment || "";
            renderPropertiesInput([], false);
        } else {
            renderPropertiesInput(getPropertyList(appt), canInteractGeneral);
            // Clientes só editáveis se não bloqueado geral
            renderClientsInput(getClientList(appt), canInteractGeneral, amICreator, isAdmin, appt);
        }
        inpStart.value = appt.startTime;
        inpEnd.value = appt.endTime;

        if ((canInteractGeneral) && !isEvent) {
            const clientList = getClientList(appt);
            let targetClient = null;
            if (isCoreEditor) {
                 if (clientList.length > 0) targetClient = clientList[0];
            } else if (amIShared) {
                 targetClient = clientList.find(c => c.addedBy === state.userProfile.email);
            }
            const brokerNameForWhats = BROKERS.find((b) => b.id === appt.brokerId)?.name || "Desconhecido";
            if (targetClient && targetClient.phone) whatsContainer.appendChild(
                createWhatsappButton(targetClient.name, targetClient.phone, appt, brokerNameForWhats)
            );
        }
    } else {
        // NOVO AGENDAMENTO
        setupNewAppointmentUI(defaults, inpBroker, brokerStatic, btnChangeBroker, inpDate, dateStatic, btnChangeDate, inpEventComment, inpStart, inpEnd, updateFormState);
    }

    // --- COMPARTILHAMENTO ---
    setupShareSection(shareCheckboxes, shareSection, isCoreEditor, isLocked, isEvent, appt);

    // --- BOTÃO DELETAR ---
    btnDel.onclick = () => {
        if(onDeleteCallback) onDeleteCallback(appt);
    };
    
    setupClientObserver(enforceClientRowPermissions, isLocked, isCoreEditor, chkIsEvent);
    enforcePropertyRowPermissions(canInteractGeneral, chkIsEvent.checked);
}


// --- FUNÇÕES AUXILIARES DE UI ---

function setupCustomLayout(inpBroker, divEventType) {
    const brokerContainer = inpBroker.parentElement; 
    let topRowWrapper = document.getElementById("custom-top-row-wrapper");
    if (!topRowWrapper) {
        topRowWrapper = document.createElement("div");
        topRowWrapper.id = "custom-top-row-wrapper";
        topRowWrapper.style.display = "flex";
        topRowWrapper.style.alignItems = "center";
        topRowWrapper.style.gap = "15px";
        topRowWrapper.style.marginBottom = "10px";
        brokerContainer.parentNode.insertBefore(topRowWrapper, brokerContainer);
        brokerContainer.style.flex = "1"; 
        brokerContainer.style.marginBottom = "0";
        topRowWrapper.appendChild(brokerContainer);
        const separator = document.createElement("div");
        separator.style.borderLeft = "1px solid #e2e8f0";
        separator.style.height = "35px";
        separator.style.margin = "0 5px";
        topRowWrapper.appendChild(separator);
        divEventType.style.marginBottom = "0"; 
        divEventType.style.flex = "1"; 
        divEventType.style.display = "flex"; 
        divEventType.style.alignItems = "center"; 
        divEventType.style.justifyContent = "flex-start"; 
        topRowWrapper.appendChild(divEventType);
    }
}

function populateBrokerField(inpBroker, brokerStatic, btnChangeBroker, appt, defaults) {
    inpBroker.innerHTML = ""; 
    BROKERS.forEach(b => {
        const opt = document.createElement("option");
        opt.value = b.id; opt.innerText = b.name; inpBroker.appendChild(opt);
    });
    const brokerId = appt ? appt.brokerId : defaults.brokerId;
    inpBroker.value = brokerId;
    const brokerName = BROKERS.find((b) => b.id === brokerId)?.name || "Desconhecido";
    brokerStatic.innerText = brokerName;
    
    brokerStatic.classList.remove("hidden");
    inpBroker.classList.add("hidden");
    
    if(btnChangeBroker) {
        btnChangeBroker.classList.add("hidden");
        btnChangeBroker.style.display = "none";
        btnChangeBroker.onclick = () => {
            brokerStatic.classList.add("hidden");
            btnChangeBroker.style.display = "none";
            btnChangeBroker.classList.add("hidden");
            inpBroker.classList.remove("hidden");
        };
    }
}

function populateDateField(inpDate, dateStatic, btnChangeDate, appt, defaults) {
    const targetDate = appt ? appt.date : defaults.date;
    inpDate.value = targetDate;
    const [y, m, d] = targetDate.split("-");
    dateStatic.innerText = `${d}/${m}/${y}`;
    
    dateStatic.classList.remove("hidden");
    inpDate.classList.add("hidden"); 
    
    if(btnChangeDate) {
        btnChangeDate.classList.add("hidden");
        btnChangeDate.style.display = "none";
        btnChangeDate.onclick = () => {
            dateStatic.classList.add("hidden");
            btnChangeDate.style.display = "none";
            btnChangeDate.classList.add("hidden");
            inpDate.classList.remove("hidden");
        };
    }
}

function enforceClientRowPermissions(isLocked, isCoreEditor, isEvtMode) {
    const rows = document.querySelectorAll(".client-item-row");
    if(isEvtMode) return; 

    rows.forEach(row => {
        const addedByInput = row.querySelector(".client-added-by");
        const rowOwner = addedByInput ? addedByInput.value : "";
        const isMine = (rowOwner === state.userProfile.email);
        
        // Clientes: Se está bloqueado, ninguém edita dados do cliente.
        let canEditThisRow = (!isLocked) && (isCoreEditor || isMine);
        
        const nameInp = row.querySelector(".client-name-input");
        const phoneInp = row.querySelector(".client-phone-input");
        if(nameInp) nameInp.disabled = !canEditThisRow;
        if(phoneInp) phoneInp.disabled = !canEditThisRow;

        const btnDel = row.querySelector(".remove-client-btn");
        if(btnDel) {
            if (!canEditThisRow) {
                btnDel.style.display = "none";
            } else {
                btnDel.style.display = (rows.length > 1) ? "flex" : "none";
            }
        }
    });
}


function enforcePropertyRowPermissions(canInteractGeneral, isEvent) {
    const rows = document.querySelectorAll(".property-item-row");
    rows.forEach(row => {
        const refInp = row.querySelector(".property-reference-input");
        const addrInp = row.querySelector(".property-address-input");
        const btnDel = row.querySelector(".remove-property-btn");
        const canEdit = canInteractGeneral && !isEvent;

        if (refInp) {
            refInp.disabled = !canEdit;
            refInp.required = !isEvent;
        }
        if (addrInp) {
            addrInp.disabled = !canEdit;
            addrInp.required = !isEvent;
        }
        if (btnDel) btnDel.style.display = canEdit ? "flex" : "none";
    });
}

function setupClientObserver(enforceFn, isLocked, isCoreEditor, chkIsEvent) {
    const clientsContainer = document.getElementById("clients-container");
    if(clientsContainer) {
        if(clientsContainer._permissionObserver) {
            clientsContainer._permissionObserver.disconnect();
        }
        const observer = new MutationObserver(() => {
            enforceFn(isLocked, isCoreEditor, chkIsEvent.checked);
        });
        observer.observe(clientsContainer, { childList: true, subtree: true });
        clientsContainer._permissionObserver = observer;
    }
}

function setupNewAppointmentUI(defaults, inpBroker, brokerStatic, btnChangeBroker, inpDate, dateStatic, btnChangeDate, inpEventComment, inpStart, inpEnd, updateFormState) {
    document.getElementById("modal-title").innerText = "Novo Agendamento";
    const headerInfo = document.getElementById("creation-info-header");
    if(headerInfo) headerInfo.innerHTML = "";
    
    inpBroker.classList.remove("hidden");
    inpBroker.disabled = false;
    brokerStatic.classList.add("hidden");
    if(btnChangeBroker) btnChangeBroker.style.display = "none";
    
    inpDate.classList.remove("hidden");
    dateStatic.classList.add("hidden");
    if(btnChangeDate) btnChangeDate.style.display = "none";

    inpEventComment.value = "";
    document.getElementById("clients-container").innerHTML = "";
    document.getElementById("properties-container").innerHTML = "";
    const nowStr = new Date().toLocaleString("pt-BR");
    
    addClientRow("", "", state.userProfile.email, 0, true, state.userProfile.name, nowStr);
    addPropertyRow("", "", 0, true);

    inpStart.value = defaults.time;
    const [h, m] = defaults.time.split(":").map(Number);
    const endH = h + 1 >= 24 ? "24" : (h + 1).toString();
    inpEnd.value = `${endH.padStart(2,"0")}:${m.toString().padStart(2,"0")}`;
    
    document.getElementById("audit-log-container").classList.add("hidden");
    
    const historyContainer = document.getElementById("history-logs-container");
    if (historyContainer) historyContainer.style.display = "none";

    const inpStatus = document.getElementById("form-status");
    const inpStatusObs = document.getElementById("form-status-obs");
    if(inpStatus) inpStatus.value = "agendada";
    if(inpStatusObs) inpStatusObs.value = "";
    
    updateFormState();
}

function renderHeaderInfo(headerInfo, appt, isAdmin, isSuperAdmin) {
    if(!headerInfo) return;
    const creationDate = appt.createdAt ? new Date(appt.createdAt).toLocaleString("pt-BR") : "N/A";
    let originalCreatorName = appt.createdByName;
    if (appt.history && appt.history.length > 0) originalCreatorName = appt.history[0].user; 
    let idBadgeHtml = (isAdmin || isSuperAdmin) ? `<div class="id-badge">#${appt.id.slice(0, 5).toUpperCase()}</div>` : "";
    let recurrenceIcon = appt.groupId ? `<span class="recurrence-icon"><i class="fas fa-sync-alt"></i></span>` : "";

    let ownerHtml = "";
    if (isAdmin) {
        let options = "";
        const currentOwnerEmail = appt.createdBy;
        const sortedConsultants = [...state.availableConsultants].sort((a,b) => a.name.localeCompare(b.name));
        sortedConsultants.forEach(c => {
            const selected = c.email === currentOwnerEmail ? "selected" : "";
            options += `<option value="${c.email}" ${selected}>${c.name}</option>`;
        });
        if (!state.availableConsultants.find(c => c.email === currentOwnerEmail)) options += `<option value="${currentOwnerEmail}" selected>${appt.createdByName} (Inativo)</option>`;
        ownerHtml = `<div class="owner-select-wrapper"><label>Responsável:</label><select id="form-owner-select" class="owner-select-styled">${options}</select></div>`;
    } else {
        ownerHtml = `<div class="owner-select-wrapper"><label>Responsável:</label><span style="font-weight:600; font-size:0.9rem; color:#334155;">${appt.createdByName}</span></div>`;
    }
    headerInfo.innerHTML = `<div class="meta-header-container"><div class="meta-left-group">${ownerHtml}<span class="meta-info-text">Criado por <strong>${originalCreatorName}</strong> em ${creationDate} ${recurrenceIcon}</span></div>${idBadgeHtml}</div>`;
}

function renderHistoryLogs(appt, isAdmin) {
    if (isAdmin && appt && appt.history && appt.history.length > 0) {
        let historyContainer = document.getElementById("history-logs-container");
        if (!historyContainer) {
            historyContainer = document.createElement("div");
            historyContainer.id = "history-logs-container";
            historyContainer.style.marginTop = "20px";
            historyContainer.style.padding = "10px";
            historyContainer.style.backgroundColor = "#f1f5f9";
            historyContainer.style.borderRadius = "6px";
            historyContainer.style.border = "1px solid #e2e8f0";
            historyContainer.style.fontSize = "0.8rem";
            historyContainer.style.maxHeight = "150px";
            historyContainer.style.overflowY = "auto";
            
            const formStart = document.getElementById("form-start"); 
            if(formStart && formStart.form) {
                 formStart.form.appendChild(historyContainer);
            } else {
                 const modalContent = document.querySelector(".modal-content") || document.getElementById("modal");
                 modalContent.appendChild(historyContainer);
            }
        }

        historyContainer.innerHTML = `<h4 style="margin:0 0 10px 0; font-size:0.9rem; color:#334155; border-bottom:1px solid #cbd5e1; padding-bottom:5px;">Histórico de Edições (Admin)</h4>`;
        historyContainer.style.display = "block";

        const sortedHistory = [...appt.history].reverse();
        sortedHistory.forEach(log => {
            const logItem = document.createElement("div");
            logItem.style.marginBottom = "8px";
            logItem.style.lineHeight = "1.4";
            const actionStyle = "color:#475569;";
            const metaStyle = "font-weight:bold; color:#0f172a;";
            logItem.innerHTML = `<div style="${metaStyle}">${log.date} - ${log.user}</div><div style="${actionStyle}">${log.action}</div>`;
            historyContainer.appendChild(logItem);
        });
    } else {
        const historyContainer = document.getElementById("history-logs-container");
        if (historyContainer) historyContainer.style.display = "none";
    }
}

function setupShareSection(shareCheckboxes, shareSection, isCoreEditor, isLocked, isEvent, appt) {
    shareCheckboxes.innerHTML = "";
    const canShare = isCoreEditor && !isLocked && !isEvent;
    
    if (state.availableConsultants.length > 0 && !isEvent) {
        shareSection.classList.remove("hidden");
        const currentShared = (appt && appt.sharedWith) ? appt.sharedWith : [];
        state.availableConsultants.forEach(c => {
            if (c.email === state.userProfile.email) return;
            const div = document.createElement("div");
            div.className = "checkbox-item";
            const chk = document.createElement("input");
            chk.type = "checkbox"; 
            chk.value = c.email;
            chk.checked = currentShared.includes(c.email);
            chk.disabled = !canShare;
            div.appendChild(chk);
            div.appendChild(document.createTextNode(c.name));
            shareCheckboxes.appendChild(div);
        });

        const btnSelAll = document.getElementById("btn-select-all");
        if(btnSelAll) {
            btnSelAll.style.display = canShare ? "block" : "none";
            btnSelAll.onclick = () => {
                const chks = document.querySelectorAll("#share-checkboxes input[type='checkbox']:not(:disabled)");
                const allC = Array.from(chks).every(c => c.checked);
                chks.forEach(c => c.checked = !allC);
            };
        }
    } else {
        shareSection.classList.add("hidden");
    }
}

export function renderPropertiesInput(properties, formEditable) {
    const propertiesContainer = document.getElementById("properties-container");
    propertiesContainer.innerHTML = "";
    if (!properties || properties.length === 0) {
        addPropertyRow("", "", 0, formEditable);
    } else {
        properties.forEach((p, index) => {
            addPropertyRow(p.reference || "", p.address || "", index, formEditable);
        });
    }
}

export function renderClientsInput(clients, formEditable, isCreator, isAdmin, apptContext = null) {
    const clientsContainer = document.getElementById("clients-container");
    clientsContainer.innerHTML = "";
    if (!clients || clients.length === 0) {
        const nowStr = new Date().toLocaleString("pt-BR");
        addClientRow("", "", state.userProfile.email, 0, formEditable, state.userProfile.name, nowStr);
    } else {
        clients.forEach((c, index) => {
            addClientRow(c.name || "", c.phone || "", c.addedBy, index, formEditable, c.addedByName || "", c.addedAt || "");
        });
    }
}