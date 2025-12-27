const REVENUE_PER_CLIENT = 1000000; // Rp 1.000.000 per tahun
let globalData = null;
let selectedPackage = null;

// DOM Elements
const serverTypeSelect = document.getElementById('serverType');
const serverPackageSelect = document.getElementById('serverPackage');
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
}

// Event Listeners
serverTypeSelect.addEventListener('change', (e) => {
    populatePackages(e.target.value);
    dashboard.classList.add('hidden');
    selectedPackage = null;
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

function getDomainCost() {
    // Default to .com renewal price from JSON if possible, else hardcode fallback based on known data
    const domainData = globalData['harga_domain'].find(d => d.ekstensi === '.com');
    if (domainData && domainData.harga && domainData.harga.tahun_berikutnya) {
        return domainData.harga.tahun_berikutnya;
    }
    return 209900; // Fallback hardcoded
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
    // Domain Expense (Per Client) -> Using .com Renewal Price
    const domainCostPerClient = getDomainCost();
    const totalDomainCost = clients * domainCostPerClient;

    // Server Expense (Fixed per Server Package)
    // Use "total_tahun_berikutnya" (Renewal) for conservative estimate, or "perpanjangan_bulanan" * 12
    let serverYearlyCost = 0;
    if (selectedPackage.harga.total_tahun_berikutnya) {
        serverYearlyCost = selectedPackage.harga.total_tahun_berikutnya;
    } else if (selectedPackage.harga.perpanjangan_bulanan) {
        // If yearly total not explicitly listed, calc from monthly
        serverYearlyCost = selectedPackage.harga.perpanjangan_bulanan * 12;
    } else if (selectedPackage.harga.total_tahun_pertama) {
        // Fallback to first year if renewal missing (warn user?)
        serverYearlyCost = selectedPackage.harga.total_tahun_pertama;
    }

    const totalExpense = serverYearlyCost + totalDomainCost;

    // 3. Profit
    const netProfit = revenue - totalExpense;

    // 4. Break Even Point
    // Revenue * X = ServerCost + (DomainCost * X)
    // (Revenue - DomainCost) * X = ServerCost
    // X = ServerCost / (Revenue - DomainCost)
    const profitPerClient = REVENUE_PER_CLIENT - domainCostPerClient;
    const bepClients = Math.ceil(serverYearlyCost / profitPerClient);

    // 5. Capacity Check
    const limitString = selectedPackage.detail.website || "1 Website"; // Default fallback
    const maxWebsites = parseWebsiteLimit(limitString);

    updateUI(revenue, totalExpense, netProfit, serverYearlyCost, domainCostPerClient, bepClients, maxWebsites, clients);
}

function updateUI(revenue, expense, profit, serverCost, domainCost, bep, maxWebsites, currentClients) {
    // Cards
    document.getElementById('revenueYear').textContent = formatter.format(revenue);
    document.getElementById('expenseYear').textContent = formatter.format(expense);

    const profitEl = document.getElementById('profitYear');
    const profitStatus = document.getElementById('profitStatus');
    profitEl.textContent = formatter.format(profit);

    if (profit > 0) {
        profitEl.className = "value text-success";
        profitStatus.innerHTML = 'PROFITABLE (Untung) <i class="fas fa-rocket"></i>';
        profitStatus.className = "text-success";
    } else if (profit < 0) {
        profitEl.className = "value text-danger";
        profitStatus.innerHTML = 'UNPROFITABLE (Rugi) <i class="fas fa-arrow-trend-down"></i>';
        profitStatus.className = "text-danger";
    } else {
        profitEl.className = "value";
        profitStatus.innerHTML = 'Balik Modal (Netral) <i class="fas fa-balance-scale"></i>';
        profitStatus.className = "";
    }

    // Analysis
    document.getElementById('serverCostDisplay').textContent = formatter.format(serverCost) + " / tahun";
    document.getElementById('domainCostDisplay').textContent = formatter.format(domainCost);
    document.getElementById('bepClients').textContent = bep;

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

            // Adjust calculation for multiple server packages?
            // User requested simplified logic first, but let's hint at it. 
            // For now, let's keep the math simple (1 server) but show big warning.
        } else {
            capacityStatusEl.className = "text-success";
            capacityWarning.classList.add('hidden');
        }
    } else {
        capacityStatusEl.textContent = "Aman (Unlimited)";
        capacityWarning.classList.add('hidden');
    }

    // Resource Warning (Info Performa)
    const resourceWarning = document.getElementById('resourceWarning');
    const resourceInfoText = document.getElementById('resourceInfoText');
    if (selectedPackage.info_performa) {
        resourceWarning.classList.remove('hidden');
        resourceInfoText.textContent = selectedPackage.info_performa;
    } else {
        resourceWarning.classList.add('hidden');
    }
}

// Init
loadData();