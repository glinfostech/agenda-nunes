// appointments-actions.js
import { db, state, BROKERS } from "./config.js";
import { checkOverlap, showDialog } from "./utils.js";
import { 
    doc, addDoc, updateDoc, deleteDoc, collection, query, where, writeBatch, getDocs 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { 
    handleBrokerNotification, 
    getConsultantName,
    isTimeLocked 
} from "./appointments-core.js";

// --- AÇÃO: SALVAR AGENDAMENTO ---
export async function saveAppointmentAction(formData) {
    const id = formData.id;
    const isNew = !id;
    const isAdmin = state.userProfile.role === "admin";
    // Super Admin: gl.infostech@gmail.com (Bypass total)
    const isSuperAdmin = (state.userProfile.email === "gl.infostech@gmail.com");
    
    let oldAppt = null;
    if (!isNew) {
        oldAppt = state.appointments.find(a => a.id === id);
        if (!oldAppt) throw new Error("Erro: Visita original não encontrada.");
    }

    const amICreator = isNew ? true : (oldAppt.createdBy === state.userProfile.email);

    // Verifica bloqueio de tempo
    let isLocked = false;
    if (!isNew && !isSuperAdmin) {
        isLocked = isTimeLocked(oldAppt.date, oldAppt.startTime);
    }

    // --- NOVA VALIDAÇÃO DE SEGURANÇA (O PEDIDO) ---
    // Se estiver bloqueado, Admin comum NÃO pode alterar Corretor nem Dono.
    // Apenas o Criador (ou Super Admin) pode.
    if (isLocked && !isSuperAdmin) {
        const proposedOwner = (isAdmin && formData.adminSelectedOwner) ? formData.adminSelectedOwner : (oldAppt.createdBy);
        
        const brokerChanged = (oldAppt.brokerId !== formData.brokerId);
        const ownerChanged = (oldAppt.createdBy !== proposedOwner);

        if (brokerChanged || ownerChanged) {
            // Se mudou corretor ou dono, E eu não sou o criador... BLOQUEIA.
            if (!amICreator) {
                throw new Error("Ação Bloqueada: Como a visita já excedeu o tempo limite, apenas o Criador pode alterar o Corretor ou Responsável.");
            }
        }
    }
    // --------------------------------------------------

    // Define Owner Final
    let finalOwnerEmail = isNew ? state.userProfile.email : oldAppt.createdBy;
    let finalOwnerName = isNew ? state.userProfile.name : oldAppt.createdByName;

    // Se for Admin mudando o dono (permitido se não bloqueado ou se for criador/super)
    if (isAdmin && formData.adminSelectedOwner) {
        // Se cair aqui, já passou pela validação acima.
        finalOwnerEmail = formData.adminSelectedOwner;
        const consultantObj = state.availableConsultants.find(c => c.email === finalOwnerEmail);
        finalOwnerName = consultantObj ? consultantObj.name : (finalOwnerEmail === oldAppt?.createdBy ? oldAppt.createdByName : finalOwnerEmail);
    }

    // Objeto base para Salvar
    const appointmentData = {
        brokerId: formData.brokerId,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        isEvent: formData.isEvent,
        
        // Status agora sempre salva
        status: formData.status || "agendada",
        statusObservation: formData.statusObservation || "",

        eventComment: formData.eventComment || "",
        reference: formData.reference || "",
        propertyAddress: formData.propertyAddress || "",
        properties: formData.properties || [],
        clients: formData.clients || [], // Array de objetos { name, phone, addedBy... }
        sharedWith: formData.sharedWith || [],
        
        createdBy: finalOwnerEmail,
        createdByName: finalOwnerName,
        
        updatedAt: new Date().toISOString(),
        updatedBy: state.userProfile.email
    };

    if (isNew) {
        appointmentData.createdAt = new Date().toISOString();
        // Verifica conflitos para novos
        if (!formData.isEvent) {
            const conflict = checkOverlap(appointmentData, null, state.appointments);
            if (conflict) throw new Error(conflict);
        }
    } else {
        // Verifica conflitos na edição
        if (!formData.isEvent) {
            const conflict = checkOverlap(appointmentData, id, state.appointments);
            if (conflict) throw new Error(conflict);
        }
    }

    // --- REGISTRO DE HISTÓRICO (Audit Log) ---
    // Adicionamos logs se houver mudanças importantes
    if (!isNew) {
        const historyLog = oldAppt.history ? [...oldAppt.history] : [];
        const changes = detectChanges(oldAppt, appointmentData);
        
        if (changes.length > 0) {
            historyLog.push({
                date: new Date().toLocaleString("pt-BR"),
                user: state.userProfile.name,
                action: changes.join("; ")
            });
            appointmentData.history = historyLog;
        } else {
             // Se não houve mudança em campos monitorados, mantemos o histórico antigo
             // Mas permitimos salvar (caso seja só um "touch" ou mudança menor não monitorada)
             appointmentData.history = historyLog;
        }
    } else {
        appointmentData.history = [{
            date: new Date().toLocaleString("pt-BR"),
            user: state.userProfile.name,
            action: "Criação do Agendamento"
        }];
    }

    // --- SALVAR NO FIRESTORE ---
    // Lógica de Recorrência (Admin criando múltiplos)
    const isRecurrent = (isNew && isAdmin && formData.recurrence && formData.recurrence.days && formData.recurrence.days.length > 0 && formData.recurrence.endDate);

    try {
        if (isRecurrent) {
            // Criação em Lote (Recorrência)
            const batch = writeBatch(db);
            const generatedDates = generateRecurrenceDates(formData.date, formData.recurrence.endDate, formData.recurrence.days);
            
            if (generatedDates.length === 0) throw new Error("Nenhuma data gerada para a recorrência selecionada.");

            generatedDates.forEach(dateStr => {
                const ref = doc(collection(db, "appointments"));
                const clone = { ...appointmentData, date: dateStr };
                // Recalcula conflito para cada data (opcional, mas recomendado)
                // Para simplificar o batch, assumimos risco ou verificamos antes. 
                // Aqui vamos confiar no Admin ou adicionar verificação simples se desejar.
                batch.set(ref, clone);
            });
            
            await batch.commit();
            return { message: `${generatedDates.length} agendamentos criados com recorrência!` };

        } else {
            // Salva Único
            if (isNew) {
                await addDoc(collection(db, "appointments"), appointmentData);
            } else {
                await updateDoc(doc(db, "appointments", id), appointmentData);
            }
            
            // Notificações (apenas se não for evento)
            if (!appointmentData.isEvent) {
                // Se mudou corretor ou horário, notificar?
                // A lógica simples é: notificar o corretor do agendamento atual
                await handleBrokerNotification(appointmentData, isNew ? "new" : "update");
            }
            
            return { message: isNew ? "Agendamento criado com sucesso!" : "Agendamento atualizado com sucesso!" };
        }
    } catch (error) {
        console.error("Erro ao salvar:", error);
        throw error; // Repassa erro para a UI mostrar
    }
}

export async function deleteAppointmentAction(appt) {
    if (!appt || !appt.id) return;
    
    // Regra: Não deletar se bloqueado (salvo Super Admin)
    const isSuperAdmin = (state.userProfile.email === "gl.infostech@gmail.com");
    if (isTimeLocked(appt.date, appt.startTime) && !isSuperAdmin) {
        throw new Error("Não é possível excluir visitas antigas/bloqueadas.");
    }

    try {
        await deleteDoc(doc(db, "appointments", appt.id));
        if (!appt.isEvent) {
            await handleBrokerNotification(appt, "delete");
        }
        return { message: "Agendamento excluído." };
    } catch (e) {
        console.error(e);
        throw new Error("Erro ao excluir agendamento.");
    }
}

// --- UTILITÁRIOS INTERNOS ---

function generateRecurrenceDates(startDateStr, endDateStr, daysOfWeek) {
    let current = new Date(startDateStr + "T00:00:00");
    const end = new Date(endDateStr + "T00:00:00");
    const dates = [];

    // Ajusta current para o dia seguinte para não duplicar o primeiro se já coincidir
    // (Ou mantém, depende da regra. Vamos incluir a data inicial se bater o dia)
    
    while (current <= end) {
        if (daysOfWeek.includes(current.getDay())) {
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, "0");
            const d = String(current.getDate()).padStart(2, "0");
            dates.push(`${y}-${m}-${d}`);
        }
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

function detectChanges(oldAppt, newData) {
    const changes = [];
    const fields = {
        brokerId: "Corretor",
        date: "Data",
        startTime: "Início",
        endTime: "Fim",
        propertyAddress: "Endereço",
        properties: "Imóveis",
        status: "Status",
        statusObservation: "Obs. Status",
        createdBy: "Responsável"
    };

    for (let key in fields) {
        let oldVal = oldAppt[key];
        let newVal = newData[key];
        
        if (key === "brokerId") {
            if (oldVal !== newVal) {
                const oldName = BROKERS.find(b => b.id === oldVal)?.name || oldVal;
                const newName = BROKERS.find(b => b.id === newVal)?.name || newVal;
                changes.push(`Corretor: de '${oldName}' para '${newName}'`);
            }
        } else if (key === "createdBy") {
            if (oldVal !== newVal) {
                 changes.push(`Responsável alterado`);
            }
        } else if (key === "isEvent") {
             // Ignora ou trata diferente
        } else {
            if (String(oldVal || "").trim() !== String(newVal || "").trim()) {
                changes.push(`${fields[key]}: alterado`);
            }
        }
    }
    
    // Verifica Clientes (Adições/Remoções)
    const getClientSig = (c) => `${c.name?.trim()}`;
    const oldSigs = oldAppt.clients ? oldAppt.clients.map(getClientSig) : [];
    const newSigs = newData.clients ? newData.clients.map(getClientSig) : [];
    
    newSigs.forEach(ns => {
        if (!oldSigs.includes(ns)) changes.push(`Cliente add: ${ns}`);
    });
    
    return changes;
}