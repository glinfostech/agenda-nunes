//appointments-core.js: Contém regras de validação (horário, bloqueio), formatação de dados, envio de WhatsApp e notificações. São funções que você raramente mexe, a não ser que a regra de negócio mude.

import { state } from "./config.js";
import { showDialog } from "./utils.js";

// --- MAPEAMENTO DE TELEFONES DOS CORRETORES ---
const BROKER_CONTACTS = {
    "Davi": "5515998538409",
    "Carlos": "5515974072397",
    "Braga": "5515991451481",
    "Lima": "5515997278796",
    "Igor": "5515998168850",
    "Carol": "5515991809938"
};

export function getBrokerPhoneByName(name) {
    if (!name) return null;
    for (const [key, phone] of Object.entries(BROKER_CONTACTS)) {
        if (name.toLowerCase().includes(key.toLowerCase())) return phone;
    }
    return null;
}

// --- LÓGICA DE BLOQUEIO POR HORÁRIO ---
export function isTimeLocked(dateStr, timeStr) {
    if (!dateStr || !timeStr) return false;
    const now = new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min] = timeStr.split(':').map(Number);
    const apptStart = new Date(y, m - 1, d, h, min);
    return now >= apptStart;
}

export function getLockMessage(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const apptDate = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    if (apptDate < today) return "Prazo encerrado. Edição bloqueada."; 
    else return "Horário da visita iniciado. Edição bloqueada."; 
}

export function getConsultantName(email) {
    if (!email) return "Desconhecido";
    if (state.availableConsultants) {
        const found = state.availableConsultants.find(c => c.email === email);
        if (found && found.name) return found.name;
    }
    if (state.userProfile && state.userProfile.email === email) return state.userProfile.name || email;
    return email;
}

// --- LÓGICA DE NOTIFICAÇÃO E WHATSAPP ---
export async function handleBrokerNotification(brokerId, brokerName, type, data) {
    if (data.isEvent) return; 
    const phone = getBrokerPhoneByName(brokerName);
    if (!phone) return; 
    let title = "", msgConfirm = "", whatsappText = "";
    const [y, m, d] = data.date.split("-");
    const formattedDate = `${d}/${m}/${y}`;
    const address = data.propertyAddress || "Endereço não informado";
    const ref = data.reference ? `(Ref: ${data.reference})` : "";
    let clientName = "Cliente não informado", clientPhone = "Não informado";
    if (data.clients && data.clients.length > 0) {
        clientName = data.clients[0].name || "Sem nome";
        clientPhone = data.clients[0].phone || "Não informado";
    }

    if (type === "create") {
        title = "Confirmar ao Corretor?";
        msgConfirm = `Deseja enviar o agendamento para o WhatsApp de ${brokerName}?`;
        whatsappText = `Oi ${brokerName}, segue novo agendamento marcado:\n\nData: ${formattedDate}\nHorário: ${data.startTime} às ${data.endTime}\nImóvel: ${address} ${ref}\nCliente: ${clientName}\nTelefone: ${clientPhone}`;
    } else if (type === "delete") {
        title = "Avisar Cancelamento?";
        msgConfirm = `Deseja avisar ${brokerName} sobre o cancelamento?`;
        whatsappText = `Oi ${brokerName}, o agendamento abaixo foi CANCELADO:\n\nData: ${formattedDate}\nHorário: ${data.startTime} às ${data.endTime}\nImóvel: ${address} ${ref}\nCliente: ${clientName}`;
    } else if (type === "update") {
        title = "Avisar Atualização?";
        msgConfirm = `Deseja enviar o agendamento atualizado para ${brokerName}?`;
        whatsappText = `Oi ${brokerName}, segue agendamento ATUALIZADO:\n\nData: ${formattedDate}\nHorário: ${data.startTime} às ${data.endTime}\nImóvel: ${address} ${ref}\nCliente: ${clientName}\nTelefone: ${clientPhone}`;
    }
    const confirmSend = await showDialog(title, msgConfirm, [{ text: "Sim, Enviar", value: true, class: "btn-whatsapp" }, { text: "Não", value: false, class: "btn-secondary" }]);
    if (confirmSend) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}`, "_blank");
}

export function createWhatsappButton(name, phone, appt, brokerName) {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "btn btn-whatsapp";
    btn.innerHTML = `<i class="fab fa-whatsapp"></i> WhatsApp`;
    btn.onclick = () => {
        if (!phone) return alert("Telefone não cadastrado.");
        const dateParts = appt.date.split("-");
        const msg = `Olá ${name}, estou entrando em contato para confirmar sua visita no imóvel da rua ${appt.propertyAddress} (Ref: ${appt.reference || ''}) com o corretor ${brokerName} no dia ${dateParts[2]}/${dateParts[1]} às ${appt.startTime}.`;
        let cleanPhone = phone.replace(/\D/g, "");
        if (cleanPhone && !cleanPhone.startsWith("55") && cleanPhone.length >= 10) cleanPhone = "55" + cleanPhone;
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
    };
    return btn;
}