//appointments-actions.js: Só cuida do banco de dados. Salvar, Editar, Excluir e Validar conflitos. É o "músculo" do sistema.
import { db, state, BROKERS } from "./config.js";
import { checkOverlap, showDialog } from "./utils.js";
import { 
    doc, addDoc, updateDoc, deleteDoc, collection, query, where, writeBatch, getDocs 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { 
    handleBrokerNotification, 
    getConsultantName 
} from "./appointments-core.js";

// --- AÇÃO: SALVAR AGENDAMENTO ---
export async function saveAppointmentAction(formData) {
    const id = formData.id;
    const isNew = !id;
    const isAdmin = state.userProfile.role === "admin";
    
    let oldAppt = null;
    if (!isNew) {
        oldAppt = state.appointments.find(a => a.id === id);
        if (!oldAppt) throw new Error("Erro: Visita original não encontrada.");
    }

    const amICreator = isNew ? true : (oldAppt.createdBy === state.userProfile.email);
    const isCoreEditor = (isAdmin || amICreator);

    // Define Owner
    let finalOwnerEmail = isNew ? state.userProfile.email : oldAppt.createdBy;
    let finalOwnerName = isNew ? state.userProfile.name : oldAppt.createdByName;

    if (isAdmin && formData.adminSelectedOwner) {
        finalOwnerEmail = formData.adminSelectedOwner;
        const found = state.availableConsultants.find(c => c.email === finalOwnerEmail);
        finalOwnerName = found ? found.name : finalOwnerEmail;
    }

    // Prepara objeto base
    const baseData = {
        brokerId: formData.brokerId,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        isEvent: formData.isEvent,
        eventComment: formData.eventComment,
        reference: formData.reference,
        propertyAddress: formData.propertyAddress,
        clients: formData.clients,
        clientName: formData.clients.length > 0 ? formData.clients[0].name : "",
        clientPhone: formData.clients.length > 0 ? formData.clients[0].phone : "",
        sharedWith: formData.sharedWith,
        
        createdBy: finalOwnerEmail,
        createdByName: finalOwnerName,
        createdAt: isNew ? new Date().toISOString() : oldAppt.createdAt
    };

    // Mantém dados antigos se não tiver permissão de CoreEditor e for edição
    if (!isCoreEditor && !isNew) {
        baseData.brokerId = oldAppt.brokerId;
        baseData.date = oldAppt.date;
        baseData.startTime = oldAppt.startTime;
        baseData.endTime = oldAppt.endTime;
        baseData.isEvent = oldAppt.isEvent;
        baseData.eventComment = oldAppt.eventComment;
        baseData.reference = oldAppt.reference;
        baseData.propertyAddress = oldAppt.propertyAddress;
        baseData.sharedWith = oldAppt.sharedWith; 
        baseData.createdBy = oldAppt.createdBy;
        baseData.createdByName = oldAppt.createdByName;
    }

    // Validações
    if (!baseData.isEvent && baseData.clients.length === 0) throw new Error("Adicione pelo menos um cliente.");
    if (baseData.startTime >= baseData.endTime && baseData.endTime !== "24:00") throw new Error("Horário final inválido.");
    
    if (checkOverlap(baseData.brokerId, baseData.date, baseData.startTime, baseData.endTime, id, baseData.isEvent)) {
      throw new Error("❌ Já existe um agendamento neste horário!");
    }

    // --- CRIAÇÃO ---
    if (isNew) {
          const repeatEnd = formData.recurrence.endDate;
          const repeatDays = formData.recurrence.days;
          
          if (baseData.isEvent && repeatEnd && repeatDays.length > 0) {
              const newGroupId = Date.now().toString(); 
              const [y, m, d] = baseData.date.split("-").map(Number);
              const currentLoopDate = new Date(y, m - 1, d);
              const [yE, mE, dE] = repeatEnd.split("-").map(Number);
              const limitDate = new Date(yE, mE - 1, dE);
              const promises = [];
              while (currentLoopDate <= limitDate) {
                  if (repeatDays.includes(currentLoopDate.getDay())) {
                      const dataCopy = { ...baseData };
                      const yr = currentLoopDate.getFullYear();
                      const mo = String(currentLoopDate.getMonth() + 1).padStart(2, '0');
                      const da = String(currentLoopDate.getDate()).padStart(2, '0');
                      dataCopy.date = `${yr}-${mo}-${da}`;
                      dataCopy.groupId = newGroupId;
                      dataCopy.history = [{ user: state.userProfile.name, date: new Date().toLocaleString("pt-BR"), action: "Criado (Série)" }];
                      promises.push(addDoc(collection(db, "appointments"), dataCopy));
                  }
                  currentLoopDate.setDate(currentLoopDate.getDate() + 1);
              }
              await Promise.all(promises);
          } else {
              baseData.history = [{ user: state.userProfile.name, date: new Date().toLocaleString("pt-BR"), action: baseData.isEvent ? "Criou Evento" : "Criou Visita" }];
              await addDoc(collection(db, "appointments"), baseData);
              const brokerName = BROKERS.find(b => b.id === baseData.brokerId)?.name;
              await handleBrokerNotification(baseData.brokerId, brokerName, "create", baseData);
          }
    } 
    // --- ATUALIZAÇÃO ---
    else {
        const changes = generateHistoryDiff(oldAppt, baseData);
        const actionText = changes.length ? "Alterou: " + changes.join(" | ") : "Edição simples";
        const log = { user: state.userProfile.name, date: new Date().toLocaleString("pt-BR"), action: actionText };
        
        if (oldAppt.history) baseData.history = [...oldAppt.history, log];
        else baseData.history = [log];

        await updateDoc(doc(db, "appointments", id), baseData);
        const brokerName = BROKERS.find(b => b.id === baseData.brokerId)?.name;
        await handleBrokerNotification(baseData.brokerId, brokerName, "update", baseData);
    }
}

// --- AÇÃO: DELETAR AGENDAMENTO ---
export async function deleteAppointmentAction(appt) {
    const brokerName = BROKERS.find((b) => b.id === appt.brokerId)?.name || "Desconhecido";
    const brokerIdToNotify = appt.brokerId;
    const apptDataForMsg = { ...appt, brokerName: brokerName };

    if (appt.groupId) {
         const choice = await showDialog("Excluir Recorrência", "Este evento faz parte de uma série.", [
             { text: "Só este", value: "single", class: "btn-danger" },
             { text: "Toda a série", value: "series", class: "btn-danger" },
             { text: "Cancelar", value: null, class: "btn-secondary" }
         ]);
         if (!choice) return false; // Cancelou

         if (choice === "series") {
             const qSeries = query(collection(db, "appointments"), where("groupId", "==", appt.groupId));
             const snap = await getDocs(qSeries);
             const batch = writeBatch(db);
             snap.forEach(d => batch.delete(d.ref));
             await batch.commit();
         } else {
             await deleteDoc(doc(db, "appointments", appt.id));
         }
    } else {
         const confirm = await showDialog("Excluir", "Deseja realmente excluir este agendamento?", [
             { text: "Sim, Excluir", value: true, class: "btn-danger" },
             { text: "Cancelar", value: false, class: "btn-secondary" }
         ]);
         if (!confirm) return false; // Cancelou
         await deleteDoc(doc(db, "appointments", appt.id));
    }
    
    await handleBrokerNotification(brokerIdToNotify, brokerName, "delete", apptDataForMsg);
    return true; // Sucesso
}

// --- HELPER: DIFERENÇAS PARA HISTÓRICO ---
function generateHistoryDiff(oldAppt, newData) {
    let changes = [];
    const fields = { 
        startTime: "Início", endTime: "Fim", 
        reference: "Referência", propertyAddress: "Endereço", 
        date: "Data", brokerId: "Corretor", 
        eventComment: "Comentário", createdByName: "Responsável",
        isEvent: "Tipo"
    };

    for (let key in fields) {
        let oldVal = oldAppt[key];
        let newVal = newData[key];
        
        if (oldVal === undefined || oldVal === null) oldVal = "";
        if (newVal === undefined || newVal === null) newVal = "";
        
        if (key === 'brokerId') {
            const oldB = BROKERS.find(b => b.id === oldVal)?.name || oldVal;
            const newB = BROKERS.find(b => b.id === newVal)?.name || newVal;
            if (oldVal !== newVal) changes.push(`${fields[key]}: de '${oldB}' para '${newB}'`);
        } else if (key === 'date') {
            if (oldVal !== newVal) {
                const [oy, om, od] = oldVal.split("-");
                const [ny, nm, nd] = newVal.split("-");
                changes.push(`${fields[key]}: de '${od}/${om}' para '${nd}/${nm}'`);
            }
        } else if (key === 'isEvent') {
            if (oldVal !== newVal) {
                changes.push(`Tipo: de '${oldVal ? "Evento" : "Visita"}' para '${newVal ? "Evento" : "Visita"}'`);
            }
        } else {
            if (String(oldVal).trim() !== String(newVal).trim()) {
                changes.push(`${fields[key]}: de '${oldVal}' para '${newVal}'`);
            }
        }
    }
    
    const getClientSig = (c) => `${c.name?.trim()}|${c.phone?.trim()}`;
    const oldSigs = oldAppt.clients ? oldAppt.clients.map(getClientSig) : [];
    const newSigs = newData.clients.map(getClientSig);
    
    newData.clients.forEach(nc => {
         if (!oldSigs.includes(getClientSig(nc))) {
             changes.push(`Adicionou cliente: ${nc.name}`);
         }
    });
    
    if (oldAppt.clients) {
        oldAppt.clients.forEach(oc => {
            if (!newSigs.includes(getClientSig(oc))) {
                 changes.push(`Removeu cliente: ${oc.name}`);
            }
        });
    }
    
    const oldShared = oldAppt.sharedWith || [];
    const newShared = newData.sharedWith || [];
    const addedShared = newShared.filter(x => !oldShared.includes(x));
    const removedShared = oldShared.filter(x => !newShared.includes(x));
    
    if (addedShared.length > 0) changes.push(`Compartilhou com: [${addedShared.map(getConsultantName).join(", ")}]`);
    if (removedShared.length > 0) changes.push(`Removeu acesso de: [${removedShared.map(getConsultantName).join(", ")}]`);

    return changes;
}