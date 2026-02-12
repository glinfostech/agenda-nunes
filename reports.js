import { db, state, BROKERS } from "./config.js";
import { collection, query, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- VARIÁVEIS GLOBAIS DO RELATÓRIO ---
let currentReportData = []; 
let currentPage = 1;
const ITEMS_PER_PAGE = 50;  

// --- INICIALIZAÇÃO ---
export function initReports() {
    if (!state.userProfile || state.userProfile.role !== 'admin') {
        return;
    }
    injectReportButton();
    injectReportModal();
}

// --- UI (INTERFACE) ---
function injectReportButton() {
    const navbar = document.querySelector('.navbar .brand-section'); 
    if (navbar) {
        if (document.querySelector('.btn-report')) return;

        const btn = document.createElement('button');
        btn.className = 'btn-report';
        btn.innerHTML = `<i class="fas fa-chart-line"></i> Relatórios`;
        btn.onclick = openReportModal;
        btn.style.marginLeft = "15px";
        navbar.appendChild(btn);
    }
}

function injectReportModal() {
    if (document.getElementById('report-modal')) return;

    const modalHtml = `
    <div id="report-modal" class="report-modal">
        <div class="report-content">
            
            <div class="report-header">
                <h2><i class="fas fa-file-invoice"></i> Relatório de Visitas</h2>
                <button class="btn-close-report" onclick="closeReportModal()"><i class="fas fa-times"></i></button>
            </div>

            <div class="report-filters">
                <div class="filters-grid">
                    
                    <div class="filter-group">
                        <label>Data Inicial</label>
                        <input type="date" id="rep-start-date" class="form-control">
                    </div>

                    <div class="filter-group">
                        <label>Data Final</label>
                        <input type="date" id="rep-end-date" class="form-control">
                    </div>

                    <div class="filter-group">
                        <label>Corretor</label>
                        <select id="rep-broker" class="form-control">
                            <option value="">Todos</option>
                            ${BROKERS.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
                        </select>
                    </div>

                    <div class="filter-group">
                        <label>Consultora</label>
                        <select id="rep-consultant" class="form-control">
                            <option value="">Todas</option>
                            </select>
                    </div>

                    <div class="filter-group button-group">
                        <button class="btn-generate" onclick="generateReport()">
                            <i class="fas fa-search"></i> Gerar
                        </button>
                    </div>

                </div>
            </div>

            <div class="report-results" id="report-results-area">
                <div class="placeholder-msg">Selecione os filtros e clique em Gerar</div>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // --- NOVO: Lógica para Fechar com ESC e Clique Fora ---
    const modal = document.getElementById('report-modal');
    
    // 1. Clique fora (no overlay escuro)
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeReportModal();
        }
    });

    // 2. Tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
            closeReportModal();
        }
    });
}

// Tornar funções globais
window.openReportModal = openReportModal;
window.closeReportModal = closeReportModal;
window.generateReport = generateReport;
window.changeReportPage = changeReportPage;

function openReportModal() {
    populateConsultants();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    document.getElementById('rep-start-date').value = firstDay;
    document.getElementById('rep-end-date').value = lastDay;

    document.getElementById('report-modal').classList.add('open');
}

function closeReportModal() {
    document.getElementById('report-modal').classList.remove('open');
}

function populateConsultants() {
    const select = document.getElementById('rep-consultant');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">Todas</option>';

    if (state.availableConsultants && state.availableConsultants.length > 0) {
        state.availableConsultants.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name; 
            opt.textContent = c.name;
            select.appendChild(opt);
        });
    }
    select.value = currentVal;
}

// --- LÓGICA DE GERAÇÃO ---
async function generateReport() {
    const startDate = document.getElementById('rep-start-date').value;
    const endDate = document.getElementById('rep-end-date').value;
    const brokerId = document.getElementById('rep-broker').value;
    const consultantName = document.getElementById('rep-consultant').value;

    if (!startDate || !endDate) {
        alert("Selecione data inicial e final");
        return;
    }

    const container = document.getElementById('report-results-area');
    container.innerHTML = '<div class="loading-spinner">Carregando dados...</div>';

    try {
        const q = query(collection(db, "appointments"));
        const snapshot = await getDocs(q);

        const allDocs = snapshot.docs.map(d => {
            const data = d.data();
            
            let clientFinal = "Sem Cliente";
            if (data.clientName) clientFinal = data.clientName;
            else if (data.clients && data.clients.length > 0) clientFinal = data.clients[0].name;

            return {
                id: d.id,
                date: data.date || "", 
                time: data.startTime || "",
                client: clientFinal,
                brokerId: data.brokerId || "",
                consultant: data.createdByName || "Desconhecido",
                reference: data.reference || "--",
                address: data.propertyAddress || "",
                status: data.status || "Agendado",
                sharedWith: data.sharedWith || []
            };
        });

        // Filtra em Memória
        currentReportData = allDocs.filter(item => {
            if (!item.date) return false; 
            if (item.date < startDate || item.date > endDate) return false;

            if (brokerId) {
                const isOwner = item.brokerId === brokerId;
                const isShared = item.sharedWith && item.sharedWith.includes(brokerId);
                if (!isOwner && !isShared) return false;
            }

            if (consultantName) {
                if (item.consultant !== consultantName) return false;
            }

            return true;
        });

        // Ordenar
        currentReportData.sort((a, b) => {
            const dateA = String(a.date || "");
            const dateB = String(b.date || "");
            if (dateA !== dateB) return dateA.localeCompare(dateB);

            const timeA = String(a.time || "");
            const timeB = String(b.time || "");
            return timeA.localeCompare(timeB);
        });

        currentPage = 1;
        renderReportTable();

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="error-msg">Erro ao gerar: ${err.message}</div>`;
    }
}

function renderReportTable() {
    const container = document.getElementById('report-results-area');
    const totalVisits = currentReportData.length;
    
    // --- CÁLCULOS DE STATUS ---
    const now = new Date();
    let realizedCount = 0;
    
    currentReportData.forEach(item => {
        if (item.date && item.time) {
            const apptDate = new Date(`${item.date}T${item.time}`);
            if (apptDate < now) {
                realizedCount++;
            }
        }
    });

    const notRealizedCount = totalVisits - realizedCount;

    const totalPages = Math.ceil(totalVisits / ITEMS_PER_PAGE);
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const pageData = currentReportData.slice(startIdx, endIdx);

    // --- HTML DOS CARDS ---
    let html = `
    <div class="stats-summary">
        <div class="stat-card">
            <span class="stat-value">${totalVisits}</span>
            <span class="stat-label">Total</span>
        </div>
        <div class="stat-card">
            <span class="stat-value" style="color:#22c55e;">${realizedCount}</span>
            <span class="stat-label">Realizadas</span>
        </div>
        <div class="stat-card">
            <span class="stat-value" style="color:#64748b;">${notRealizedCount}</span>
            <span class="stat-label">Não Realizadas</span>
        </div>
    </div>

    <div class="report-table-container">
        <table class="report-table">
            <thead>
                <tr>
                    <th style="width: 130px;">Data / Hora</th>
                    <th style="width: 160px;">Equipe</th>
                    <th>Imóvel / Endereço</th>
                    <th style="width: 180px;">Cliente</th>
                    <th style="width: 70px; text-align:center;">Status</th>
                </tr>
            </thead>
            <tbody>
    `;

    if (pageData.length === 0) {
        html += `<tr><td colspan="5" style="text-align:center; padding: 20px;">Nenhum registro encontrado.</td></tr>`;
    } else {
        pageData.forEach(row => {
            const brName = BROKERS.find(b => b.id === row.brokerId)?.name || "N/A";
            const dateFmt = row.date.split('-').reverse().join('/');
            
            // Lógica do Ícone de Status
            let statusIcon = '<i class="far fa-clock" style="color:#cbd5e1; font-size:1.1rem;" title="Pendente / Futuro"></i>'; 
            
            if (row.date && row.time) {
                 const apptDate = new Date(`${row.date}T${row.time}`);
                 if (apptDate < now) {
                     statusIcon = '<i class="fas fa-check-circle" style="color:#22c55e; font-size:1.1rem;" title="Realizado"></i>'; 
                 }
            }

            html += `
            <tr>
                <td>
                    <div style="font-weight:700; color:var(--text-main);">${dateFmt}</div>
                    <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                        <i class="far fa-clock"></i> ${row.time}
                    </div>
                </td>
                
                <td>
                    <span class="broker-badge" style="margin-bottom:4px; display:inline-block;">${brName}</span>
                    <div style="font-size:0.8rem; color:#64748b;">
                        Cons: <strong>${row.consultant}</strong>
                    </div>
                </td>
                
                <td>
                    <div style="font-weight:700; color:var(--primary); font-size:0.9rem;">
                        Ref: ${row.reference}
                    </div>
                    <div style="font-size:0.8rem; color:#475569; line-height:1.3; margin-top:2px;">
                        ${row.address || '<span style="color:#ccc">Sem endereço</span>'}
                    </div>
                </td>
                
                <td>
                    <div style="font-weight:600; color:#334155;">${row.client}</div>
                </td>

                <td style="text-align:center;">
                    ${statusIcon}
                </td>
            </tr>
            `;
        });
    }

    html += `</tbody></table></div>`;

    if (totalVisits > 0) {
        html += `
        <div class="report-pagination">
            <div class="pagination-info">
                Página <strong>${currentPage}</strong> de <strong>${totalPages}</strong>
            </div>
            <div class="pagination-controls">
                <button onclick="changeReportPage(-1)" class="btn-page" ${currentPage === 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i> Anterior
                </button>
                <button onclick="changeReportPage(1)" class="btn-page" ${currentPage === totalPages ? 'disabled' : ''}>
                    Próximo <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
        `;
    }

    container.innerHTML = html;
}

function changeReportPage(delta) {
    const totalPages = Math.ceil(currentReportData.length / ITEMS_PER_PAGE);
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderReportTable();
    }
}