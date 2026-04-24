// Глобальные переменные
let currentUser = null;
let userRef = null;
let unsubscribeInventory = null;

// ---------- Инициализация после загрузки страницы ----------
document.addEventListener('DOMContentLoaded', () => {
    const authBtn = document.getElementById('authBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const clickerBtn = document.getElementById('clickerBtn');
    const wheelBtn = document.getElementById('wheelBtn');
    const adminGive = document.getElementById('adminGiveMoney');
    const profileBtn = document.getElementById('profileBtn');
    const closeProfile = document.getElementById('closeProfile');

    authBtn.onclick = () => loginOrRegister();
    logoutBtn.onclick = () => logout();
    clickerBtn.onclick = () => clicker();
    wheelBtn.onclick = () => spinWheel();
    if (adminGive) adminGive.onclick = () => adminGiveMoney();
    profileBtn.onclick = () => showProfile();
    closeProfile.onclick = () => document.getElementById('profileModal').style.display = 'none';
});

async function loginOrRegister() {
    const login = document.getElementById('loginInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    const errorDiv = document.getElementById('authError');
    errorDiv.innerText = '';

    if (!login || !password) {
        errorDiv.innerText = 'Заполните поля';
        return;
    }
    if (password.length < 6 || !/\d/.test(password)) {
        errorDiv.innerText = 'Пароль: мин 6 символов и цифра';
        return;
    }

    // Используем Firestore как хранилище пользователей (простая аутентификация без Firebase Auth)
    const usersRef = firebase.firestore().collection('users');
    const doc = await usersRef.doc(login).get();
    if (doc.exists) {
        // Проверка пароля
        if (doc.data().password !== password) {
            errorDiv.innerText = 'Неверный пароль';
            return;
        }
        currentUser = { login, ...doc.data() };
    } else {
        // Регистрация
        await usersRef.doc(login).set({
            login: login,
            password: password,
            balance: 0,
            inventory: [], // [{id, name, price, wear, count}]
            stats: { casesOpened: 0, upgradesDone: 0, bestSkin: null, bestSkinCase: null },
            clickerLastDate: null,
            clickerCountToday: 0,
            wheelLastDate: null
        });
        currentUser = { login, balance: 0, inventory: [], stats: { casesOpened: 0, upgradesDone: 0, bestSkin: null, bestSkinCase: null }, clickerCountToday: 0 };
    }
    userRef = firebase.firestore().collection('users').doc(login);
    // Подписка на реальные изменения
    userRef.onSnapshot((snap) => {
        if (snap.exists) {
            currentUser = { login, ...snap.data() };
            updateUI();
        }
    });
    // Загружаем дроп-лист
    subscribeToDropList();
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'block';
    updateUI();

    // Показываем админку только если login === 'PawPaw69'
    const adminPanel = document.getElementById('adminPanel');
    if (login === 'PawPaw69') adminPanel.style.display = 'block';
    else adminPanel.style.display = 'none';
}

function logout() {
    if (unsubscribeInventory) unsubscribeInventory();
    currentUser = null;
    document.getElementById('authScreen').style.display = 'block';
    document.getElementById('gameScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'none'; // фикс бага
}

function updateUI() {
    if (!currentUser) return;
    document.getElementById('balance').innerText = currentUser.balance?.toFixed(2) || 0;
    document.getElementById('username').innerText = currentUser.login;
    const left = (currentUser.clickerCountToday !== undefined) ? (50 - currentUser.clickerCountToday) : 50;
    document.getElementById('clickerLeft').innerText = Math.max(0, left);
    renderInventory();
    renderCases();
}

// ---------- Инвентарь со стакингом ----------
function renderInventory() {
    const container = document.getElementById('inventoryContainer');
    if (!container) return;
    const inv = currentUser.inventory || [];
    // Стакинг уже должен быть в БД, но подстрахуем
    const grouped = {};
    inv.forEach(item => {
        const key = `${item.id}_${item.wear}`;
        if (grouped[key]) grouped[key].count += item.count;
        else grouped[key] = { ...item, count: item.count || 1 };
    });
    const flat = Object.values(grouped);
    container.innerHTML = flat.map(item => `
        <div class="inventory-item">
            <b>${item.name}</b> (${item.wear})<br>
            Цена: ${item.price}$<br>
            Кол-во: ${item.count}x<br>
            <button onclick="sellSkin('${item.id}', '${item.wear}')">Продать 1</button>
            <button onclick="sellSkin('${item.id}', '${item.wear}', true)">Продать все</button>
        </div>
    `).join('');
}

window.sellSkin = async (skinId, wear, sellAll = false) => {
    if (!currentUser) return;
    const inv = currentUser.inventory || [];
    const index = inv.findIndex(i => i.id === skinId && i.wear === wear);
    if (index === -1) return;
    let item = inv[index];
    let sellCount = sellAll ? item.count : 1;
    let totalPrice = item.price * sellCount;
    if (item.count <= sellCount) {
        inv.splice(index, 1);
    } else {
        item.count -= sellCount;
    }
    await userRef.update({
        inventory: inv,
        balance: firebase.firestore.FieldValue.increment(totalPrice)
    });
    addToDropList(`${currentUser.login} продал ${item.name} x${sellCount} за ${totalPrice}$`);
};

// ---------- Кейсы (один тестовый, остальные добавить по аналогии) ----------
const casesData = [
    { id: 'case1', name: 'Обычный кейс', price: 5, type: 'normal', items: [
        { id: 'ak47', name: 'AK-47 | Redline', price: 15, wear: 'FT', chance: 0.5 },
        { id: 'awp', name: 'AWP | Dragon Lore', price: 5000, wear: 'FN', chance: 0.01 },
        { id: 'usp', name: 'USP-S | Guardian', price: 1.5, wear: 'MW', chance: 0.49 }
    ] },
    { id: 'case30k', name: 'Кейс за 30000$', price: 30000, type: 'expensive', items: [
        { id: 'trash', name: 'MP9 | Sand Dashed', price: 0.1, wear: 'BS', chance: 0.999 },
        { id: 'godhand', name: 'Рука бога', price: 100000, wear: 'FN', chance: 0.001 }
    ] }
    // Добавить остальные кейсы, сортировка по price в renderCases
];

function renderCases() {
    const container = document.getElementById('casesContainer');
    const sorted = [...casesData].sort((a,b) => a.price - b.price);
    container.innerHTML = sorted.map(c => `
        <div class="case-card" onclick="openCase('${c.id}')">
            <h3>${c.name}</h3>
            <p>Цена: ${c.price}$</p>
            <button>Открыть 1</button>
        </div>
    `).join('');
}

window.openCase = async (caseId, count = 1) => {
    const c = casesData.find(c => c.id === caseId);
    if (!c) return;
    const totalCost = c.price * count;
    if (currentUser.balance < totalCost) {
        alert('Не хватает денег');
        return;
    }
    let drops = [];
    for (let i = 0; i < count; i++) {
        const drop = getRandomItem(c.items);
        drops.push(drop);
    }
    // Обновляем баланс и инвентарь
    let newBalance = currentUser.balance - totalCost;
    let newInv = [...(currentUser.inventory || [])];
    for (let drop of drops) {
        const existing = newInv.find(i => i.id === drop.id && i.wear === drop.wear);
        if (existing) existing.count = (existing.count || 1) + 1;
        else newInv.push({ ...drop, count: 1 });
        // Обновляем статистику самого дорогого
        if (!currentUser.stats.bestSkin || drop.price > currentUser.stats.bestSkin.price) {
            await userRef.update({ 'stats.bestSkin': drop, 'stats.bestSkinCase': c.name });
        }
    }
    await userRef.update({
        balance: newBalance,
        inventory: newInv,
        'stats.casesOpened': firebase.firestore.FieldValue.increment(count)
    });
    // Добавляем в дроп-лист каждый дроп
    drops.forEach(d => addToDropList(`${currentUser.login} открыл ${c.name} и получил ${d.name} (${d.price}$)`));
};

function getRandomItem(items) {
    const totalChance = items.reduce((sum, i) => sum + i.chance, 0);
    let rand = Math.random() * totalChance;
    let acc = 0;
    for (let item of items) {
        acc += item.chance;
        if (rand <= acc) return { ...item, count: 1 };
    }
    return items[0];
}

// ---------- Колесо фортуны (ежедневный бонус) ----------
async function spinWheel() {
    const lastDate = currentUser.wheelLastDate;
    const today = new Date().toDateString();
    if (lastDate === today) {
        alert('Бонус уже получен сегодня!');
        return;
    }
    const segments = ['Деньги', 'Скин', 'Кейс'];
    const result = segments[Math.floor(Math.random() * segments.length)];
    let reward = null;
    if (result === 'Деньги') {
        let money = Math.floor(Math.random() * 991) + 10; // 10-1000
        await userRef.update({ balance: firebase.firestore.FieldValue.increment(money) });
        reward = `${money}$`;
        addToDropList(`${currentUser.login} выиграл ${reward} на колесе фортуны!`);
    } else if (result === 'Скин') {
        // случайный скин из всех кейсов
        const allItems = casesData.flatMap(c => c.items);
        const randomSkin = allItems[Math.floor(Math.random() * allItems.length)];
        let newInv = [...(currentUser.inventory || [])];
        const existing = newInv.find(i => i.id === randomSkin.id && i.wear === randomSkin.wear);
        if (existing) existing.count = (existing.count || 1) + 1;
        else newInv.push({ ...randomSkin, count: 1 });
        await userRef.update({ inventory: newInv });
        reward = `${randomSkin.name} (${randomSkin.price}$)`;
        addToDropList(`${currentUser.login} выиграл скин ${reward} на колесе!`);
    } else { // Кейс
        // выдаём бесплатный кейс (один случайный)
        const freeCase = casesData[Math.floor(Math.random() * casesData.length)];
        // Бесплатная попытка открытия: открываем кейс без списания денег
        const drop = getRandomItem(freeCase.items);
        let newInv = [...(currentUser.inventory || [])];
        const existing = newInv.find(i => i.id === drop.id && i.wear === drop.wear);
        if (existing) existing.count = (existing.count || 1) + 1;
        else newInv.push({ ...drop, count: 1 });
        await userRef.update({ inventory: newInv, 'stats.casesOpened': firebase.firestore.FieldValue.increment(1) });
        reward = `бесплатное открытие кейса "${freeCase.name}" → ${drop.name}`;
        addToDropList(`${currentUser.login} выиграл ${reward} на колесе!`);
    }
    await userRef.update({ wheelLastDate: today });
    alert(`Вам выпало: ${result}! ${reward}`);
    updateUI();
}

// ---------- Кликер (+1, лимит 50/день) ----------
async function clicker() {
    let today = new Date().toDateString();
    let lastDate = currentUser.clickerLastDate;
    let countToday = currentUser.clickerCountToday || 0;
    if (lastDate !== today) {
        countToday = 0;
    }
    if (countToday >= 50) {
        alert('Дневной лимит кликов исчерпан');
        return;
    }
    countToday++;
    await userRef.update({
        balance: firebase.firestore.FieldValue.increment(1),
        clickerCountToday: countToday,
        clickerLastDate: today
    });
    updateUI();
}

// ---------- Дроп-лист в реальном времени ----------
let unsubscribeDrops = null;
function subscribeToDropList() {
    if (unsubscribeDrops) unsubscribeDrops();
    const dropsRef = firebase.firestore().collection('drops').orderBy('timestamp', 'desc').limit(50);
    unsubscribeDrops = dropsRef.onSnapshot(snapshot => {
        const list = document.getElementById('dropList');
        list.innerHTML = '';
        snapshot.forEach(doc => {
            const li = document.createElement('li');
            li.textContent = doc.data().text;
            list.appendChild(li);
        });
    });
}
async function addToDropList(text) {
    await firebase.firestore().collection('drops').add({
        text: text,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
}

// ---------- Админ-панель (выдача денег) ----------
async function adminGiveMoney() {
    if (!currentUser || currentUser.login !== 'PawPaw69') return;
    const targetUser = document.getElementById('adminUser').value.trim();
    const amount = parseFloat(document.getElementById('adminMoney').value);
    if (!targetUser || isNaN(amount)) return;
    const userDoc = firebase.firestore().collection('users').doc(targetUser);
    const snap = await userDoc.get();
    if (!snap.exists) {
        alert('Пользователь не найден');
        return;
    }
    await userDoc.update({
        balance: firebase.firestore.FieldValue.increment(amount)
    });
    addToDropList(`Админ PawPaw69 выдал ${amount}$ игроку ${targetUser}`);
    alert(`Выдано ${amount}$ игроку ${targetUser}`);
}

// ---------- Профиль (статистика) ----------
async function showProfile() {
    if (!currentUser) return;
    document.getElementById('profileLogin').innerText = currentUser.login;
    document.getElementById('casesOpened').innerText = currentUser.stats?.casesOpened || 0;
    document.getElementById('upgradesDone').innerText = currentUser.stats?.upgradesDone || 0;
    let bestStr = 'нет';
    if (currentUser.stats?.bestSkin) bestStr = `${currentUser.stats.bestSkin.name} (${currentUser.stats.bestSkin.price}$)`;
    document.getElementById('bestSkin').innerText = bestStr;
    document.getElementById('bestSkinCase').innerText = currentUser.stats?.bestSkinCase || '—';
    document.getElementById('profileModal').style.display = 'block';
}
