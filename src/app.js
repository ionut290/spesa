const STORAGE_KEY = 'spesa-intelligente-items';

const state = {
  items: JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'),
  deferredPrompt: null,
};

const form = document.querySelector('#itemForm');
const list = document.querySelector('#shoppingList');
const comparison = document.querySelector('#comparison');
const bestStore = document.querySelector('#bestStore');
const hideLoyalty = document.querySelector('#hideLoyalty');
const installButton = document.querySelector('#installButton');
const template = document.querySelector('#itemTemplate');

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}

function visibleItems() {
  return hideLoyalty.checked ? state.items.filter((item) => !item.loyalty) : state.items;
}

function totalsByStore() {
  return visibleItems().reduce((totals, item) => {
    totals[item.store] = (totals[item.store] || 0) + item.price * item.quantity;
    return totals;
  }, {});
}

function renderList() {
  list.replaceChildren();

  if (!visibleItems().length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Nessun prodotto: aggiungi il primo articolo alla lista.';
    list.append(empty);
    return;
  }

  visibleItems().forEach((item) => {
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelector('[data-name]').textContent = item.name;
    row.querySelector('[data-meta]').textContent = `${item.quantity} × ${euro.format(item.price)} · ${item.store}${item.loyalty ? ' · carta fedeltà' : ''}`;
    row.querySelector('[data-remove]').addEventListener('click', () => {
      state.items = state.items.filter((candidate) => candidate.id !== item.id);
      saveItems();
      render();
    });
    list.append(row);
  });
}

function renderComparison() {
  const totals = Object.entries(totalsByStore()).sort((a, b) => a[1] - b[1]);
  comparison.replaceChildren();
  bestStore.textContent = totals[0]?.[0] || 'Aggiungi prezzi';

  if (!totals.length) {
    comparison.textContent = 'Inserisci prezzi per vedere il confronto tra supermercati.';
    return;
  }

  totals.forEach(([store, total], index) => {
    const card = document.createElement('article');
    card.className = 'store-card';
    card.innerHTML = `<span>${index === 0 ? '🏆 ' : ''}${store}</span><strong>${euro.format(total)}</strong>`;
    comparison.append(card);
  });
}

function render() {
  renderList();
  renderComparison();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const item = {
    id: crypto.randomUUID(),
    name: data.get('name') || document.querySelector('#itemName').value.trim(),
    quantity: Number(document.querySelector('#itemQuantity').value || 1),
    store: document.querySelector('#itemStore').value.trim(),
    price: Number(document.querySelector('#itemPrice').value || 0),
    loyalty: document.querySelector('#itemLoyalty').checked,
  };

  state.items.push(item);
  saveItems();
  form.reset();
  document.querySelector('#itemQuantity').value = 1;
  render();
});

hideLoyalty.addEventListener('change', render);

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.deferredPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener('click', async () => {
  if (!state.deferredPrompt) return;
  state.deferredPrompt.prompt();
  await state.deferredPrompt.userChoice;
  state.deferredPrompt = null;
  installButton.hidden = true;
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

render();
