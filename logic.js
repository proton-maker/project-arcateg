const REVENUE_PER_CLIENT = 1000000; // Rp 1.000.000 per tahun
let globalData = null;
let selectedPackage = null;

// DOM Elements
const serverTypeSelect = document.getElementById('serverType');
const serverPackageSelect = document.getElementById('serverPackage');
const domainExtensionSelect = document.getElementById('domainExtension');
const clientCountInput = document.getElementById('clientCount');
const clientCountVal = document.getElementById('clientCountVal');
const dashboard = document.getElementById('dashboard');

// Formatting Currency
const formatter = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
});

async function loadData() {
    try {
        const response = await fetch('pengeluaran.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        globalData = await response.json();
        populateCategories();
        populateDomains();
    } catch (error) {
        console.error("Gagal memuat data:", error);
        alert("Gagal memuat file pengeluaran.json. Pastikan file ada di folder yang sama.");
    }
}

function populateCategories() {
    // Filter categories that start with "harga_"
    const categories = Object.keys(globalData).filter(key => key.startsWith('harga_') && key !== 'harga_domain');

    // Friendly names map
    const friendlyNames = {
        'harga_vps_server': 'VPS Server (KVM)',
        'harga_cloud_hosting': 'Cloud Hosting',
        'harga_web_hosting': 'Web Hosting (Shared)',
        'harga_cpanel_cloud_hosting': 'cPanel Cloud Hosting',
        'harga_agency_hosting': 'Agency Hosting'
    };

    categories.forEach(cat => {
        const option = document.createElement('option');
        value = cat;
        option.value = cat;
        option.textContent = friendlyNames[cat] || cat.replace('harga_', '').replace(/_/g, ' ').toUpperCase();
        serverTypeSelect.appendChild(option);
    });
}

function populatePackages(category) {
    serverPackageSelect.innerHTML = '<option value="" disabled selected>-- Pilih Paket --</option>';
    const packages = globalData[category];

    packages.forEach((pkg, index) => {
        const option = document.createElement('option');
        option.value = index; // Store index to retrieve object easily
        // Show Name + Detail info if available (RAM/Storage)
        let mainDetail = "";
        if (pkg.detail) {
            if (pkg.detail.ram) mainDetail += ` | ${pkg.detail.ram}`;
            if (pkg.detail.cpu) mainDetail += ` - ${pkg.detail.cpu}`;
        }

        option.textContent = `${pkg.paket} ${mainDetail}`;
        serverPackageSelect.appendChild(option);
    });

    serverPackageSelect.disabled = false;
    serverPackageSelect.disabled = false;
}

function populateDomains() {
    const domains = globalData['harga_domain'];
    // Default to .com if available
    let defaultIndex = -1;
    
    domains.forEach((dom, index) => {
        const option = document.createElement('option');
        option.value = index;
        const price = dom.harga.tahun_berikutnya || dom.harga.tahun_pertama;
        option.textContent = `${dom.ekstensi} (${formatter.format(price)}/thn)`;
        domainExtensionSelect.appendChild(option);
        
        if (dom.ekstensi === '.com') defaultIndex = index;
    });
    
    if (defaultIndex !== -1) {
        domainExtensionSelect.value = defaultIndex;
    } else if (domains.length > 0) {
        domainExtensionSelect.value = 0;
    }
}

// Event Listeners
serverTypeSelect.addEventListener('change', (e) => {
    populatePackages(e.target.value);
    dashboard.classList.add('hidden');
    selectedPackage = null;
});

domainExtensionSelect.addEventListener('change', () => {
    if(selectedPackage) calculate();
});

serverPackageSelect.addEventListener('change', (e) => {
    const category = serverTypeSelect.value;
    const index = e.target.value;
    selectedPackage = globalData[category][index];
    calculate();
    dashboard.classList.remove('hidden');
});

clientCountInput.addEventListener('input', (e) => {
    clientCountVal.textContent = e.target.value;
    if (selectedPackage) calculate();
});

// Helper for quick buttons
window.setClients = function (num) {
    clientCountInput.value = num;
    clientCountVal.textContent = num;
    if (selectedPackage) calculate();
}

function getDomainCosts() {
    const index = domainExtensionSelect.value;
    if (index === "" || index === null) return { firstYear: 0, renewal: 0 };
    
    const domain = globalData['harga_domain'][index];
    
    return {
        firstYear: domain.harga.tahun_pertama || domain.harga.tahun_berikutnya,
        renewal: domain.harga.tahun_berikutnya || domain.harga.tahun_pertama
    };
}

function parseWebsiteLimit(limitString) {
    if (!limitString) return Infinity;
    const lower = limitString.toLowerCase();

    if (lower.includes('unlimited')) return Infinity;

    // Extract first number found
    const match = lower.match(/(\d+)\s*(website|domain)/);
    if (match) return parseInt(match[1]);

    return 1; // Default assumes 1 if not specified or unclear
}

function calculate() {
    const clients = parseInt(clientCountInput.value);

    // 1. Revenue
    const revenue = clients * REVENUE_PER_CLIENT;

    // 2. Expenses
    const domainStats = getDomainCosts();
    const totalDomainCost1 = clients * domainStats.firstYear;
    const totalDomainCost2 = clients * domainStats.renewal;

    // Server Expense (Fixed per Server Package)
    let serverCost1 = 0;
    let serverCost2 = 0;
    
    // Year 1 (Promo)
    if (selectedPackage.harga.total_tahun_pertama) {
        serverCost1 = selectedPackage.harga.total_tahun_pertama;
    } else if (selectedPackage.harga.promo_bulanan) {
        serverCost1 = selectedPackage.harga.promo_bulanan * 12;
    } else {
        // Fallback
        serverCost1 = selectedPackage.harga.total_tahun_berikutnya || (selectedPackage.harga.perpanjangan_bulanan * 12);
    }
    
    // Year 2+ (Renewal)
    if (selectedPackage.harga.total_tahun_berikutnya) {
        serverCost2 = selectedPackage.harga.total_tahun_berikutnya;
    } else if (selectedPackage.harga.perpanjangan_bulanan) {
        serverCost2 = selectedPackage.harga.perpanjangan_bulanan * 12;
    } else if (selectedPackage.harga.catatan_perpanjangan) { 
        // Heuristic for known text like "Estimasi ~850rb - 1jt"
        // Let's take a safe upper bound estimate if exact number missing?
        // Or just fallback to Year 1 * 1.5? 
        // For Agency Professional user said ~850rb-1jt per month -> ~12jt year?
        // Let's reuse promo price if 0 but warn? 
        // Current JSON for Agency Professional has total_tahun_berikutnya: 0. 
        // We shouldn't leave it 0.
        // Let's use Year 1 price if Year 2 is missing/zero, to be safe.
        serverCost2 = serverCost1; 
    } else {
        serverCost2 = serverCost1;
    }
    
    // If specific packages have explicit 0 but text note, we might want to handle it.
    // But for now, ensuring non-zero server cost is critical.
    if(serverCost2 === 0 && serverCost1 > 0) serverCost2 = serverCost1;

    const totalExpense1 = serverCost1 + totalDomainCost1;
    const totalExpense2 = serverCost2 + totalDomainCost2;

    // 3. Profit
    const profit1 = revenue - totalExpense1;
    const profit2 = revenue - totalExpense2;

    // 4. Break Even Point
    const profitPerClient1 = REVENUE_PER_CLIENT - domainStats.firstYear;
    const bep1 = profitPerClient1 > 0 ? Math.ceil(serverCost1 / profitPerClient1) : "Inf";
    
    const profitPerClient2 = REVENUE_PER_CLIENT - domainStats.renewal;
    const bep2 = profitPerClient2 > 0 ? Math.ceil(serverCost2 / profitPerClient2) : "Inf";

    // 5. Capacity Check
    const limitString = selectedPackage.detail.website || "1 Website"; 
    const maxWebsites = parseWebsiteLimit(limitString);

    updateUI(revenue, totalExpense1, totalExpense2, profit1, profit2, serverCost1, serverCost2, domainStats, bep1, bep2, maxWebsites, clients);
}

function updateUI(revenue, expense1, expense2, profit1, profit2, serverCost1, serverCost2, domainStats, bep1, bep2, maxWebsites, currentClients) {
    // Cards
    document.getElementById('revenueYear').textContent = formatter.format(revenue);
    
    document.getElementById('expenseYear1').textContent = formatter.format(expense1);
    document.getElementById('expenseYear2').textContent = formatter.format(expense2);

    const updateProfitStatus = (elVal, elStatus, amount) => {
        elVal.textContent = formatter.format(amount);
        if (amount > 0) {
            elVal.className = "value-small text-success";
            elStatus.innerHTML = '<i class="fas fa-rocket"></i> Untung';
            elStatus.className = "text-success";
        } else if (amount < 0) {
            elVal.className = "value-small text-danger";
            elStatus.innerHTML = '<i class="fas fa-arrow-trend-down"></i> Rugi';
            elStatus.className = "text-danger";
        } else {
            elVal.className = "value-small";
            elStatus.innerHTML = '<i class="fas fa-balance-scale"></i> Netral';
            elStatus.className = "";
        }
    };
    
    updateProfitStatus(document.getElementById('profitYear1'), document.getElementById('profitStatus1'), profit1);
    updateProfitStatus(document.getElementById('profitYear2'), document.getElementById('profitStatus2'), profit2);

    // Analysis
    document.getElementById('serverCost1').textContent = formatter.format(serverCost1);
    document.getElementById('serverCost2').textContent = formatter.format(serverCost2);
    
    const selectedDomainIdx = domainExtensionSelect.value;
    const domainName = globalData['harga_domain'][selectedDomainIdx].ekstensi;
    
    document.getElementById('domainCost1').textContent = formatter.format(domainStats.firstYear);
    document.getElementById('domainCost2').textContent = formatter.format(domainStats.renewal);
    
    document.getElementById('bep1').textContent = bep1;
    document.getElementById('bep2').textContent = bep2;

    const serverCapacityEl = document.getElementById('serverCapacity');
    serverCapacityEl.textContent = (maxWebsites === Infinity) ? "Unlimited" : `${maxWebsites} Website`;

    const capacityStatusEl = document.getElementById('capacityStatus');
    const capacityWarning = document.getElementById('capacityWarning');

    if (maxWebsites !== Infinity) {
        capacityStatusEl.textContent = `${currentClients} / ${maxWebsites} Terpakai`;
        if (currentClients > maxWebsites) {
            capacityStatusEl.className = "text-danger";
            capacityWarning.classList.remove('hidden');
            capacityWarning.innerHTML = `<i class="fas fa-exclamation-triangle"></i> PERINGATAN: Paket ini hanya mendukung maksimal ${maxWebsites} website. Anda perlu ${Math.ceil(currentClients/maxWebsites)} paket ini untuk ${currentClients} klien.`;
        } else {
            capacityStatusEl.className = "text-success";
            capacityWarning.classList.add('hidden');
        }
    } else {
        capacityStatusEl.textContent = "Aman (Unlimited)";
        capacityWarning.classList.add('hidden');
    }

    // Resource Warning (Info Performa) & Technical Analysis
    const resourceWarning = document.getElementById('resourceWarning');
    const resourceInfoText = document.getElementById('resourceInfoText');
    
    let warningText = "";
    
    // Check for standard performance info
    if (selectedPackage.info_performa) {
        warningText += `<strong>Info Performa:</strong> ${selectedPackage.info_performa}<br>`;
    }
    
    // Check for Technical Analysis (WordPress Only)
    if (selectedPackage.analisis_teknis) {
        const tech = selectedPackage.analisis_teknis;
        if (tech.tipe && tech.tipe.includes("WordPress")) {
            warningText += `<br><strong>⚠️ RESTRIKSI PLATFORM (${tech.tipe}):</strong><br>`;
            warningText += `<ul style="margin: 5px 0; padding-left: 20px; list-style-type: square;">`;
            
            if (tech.kekurangan) {
                tech.kekurangan.forEach(k => warningText += `<li>${k}</li>`);
            }
            if (tech.karakteristik_wordpress && tech.karakteristik_wordpress.kustomisasi) {
                 warningText += `<li>${tech.karakteristik_wordpress.kustomisasi}</li>`;
            }
            warningText += `</ul>`;
        }
    }

    if (warningText) {
        resourceWarning.classList.remove('hidden');
        resourceInfoText.innerHTML = warningText;
    } else {
        resourceWarning.classList.add('hidden');
    }
}

// Init
loadData();