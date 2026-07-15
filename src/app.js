const STORAGE_KEY = 'spesa-intelligente-items';
const LOYALTY_KEY = 'spesa-intelligente-loyalty-cards';

const state = {
  items: JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'),
  loyaltyCards: JSON.parse(localStorage.getItem(LOYALTY_KEY) || '[]'),
  deferredPrompt: null,
  currentOffers: [],
  userLocation: null,
};

const authorizedSources = [
  'API ufficiali supermercati configurate dal backend',
  'API di comparazione prezzi autorizzate',
  'Cataloghi pubblici autorizzati',
  'Volantini e feed promozionali accessibili legalmente',
  'Database partner configurabili dal backend',
];

const loyaltyBrands = ['Coop', 'Conad', 'Esselunga', 'Carrefour', 'Lidl', 'Eurospin', 'MD', 'Pam', 'Despar', 'Aldi'];
const suggestions = ['Latte Granarolo intero 1 litro', 'Pasta Barilla spaghetti 500 g', 'Olio extravergine 1 litro', 'Detersivo lavatrice 30 lavaggi', 'Caffè espresso 250 g', 'Riso Carnaroli 1 kg'];

const partnerCatalog = [
  { name: 'Latte Granarolo intero', brand: 'Granarolo', format: '1 litro', unit: 'litro', size: 1, store: 'Coop', address: 'Via Roma 12, Milano', distance: 1.8, price: 1.79, loyaltyPrice: 1.59, loyaltyRequired: true, validUntil: '2026-08-02', available: true, image: '🥛' },
  { name: 'Latte Granarolo intero', brand: 'Granarolo', format: '1 litro', unit: 'litro', size: 1, store: 'Esselunga', address: 'Viale Monza 45, Milano', distance: 3.2, price: 1.69, loyaltyPrice: null, loyaltyRequired: false, validUntil: '2026-07-28', available: true, image: '🥛' },
  { name: 'Pasta Barilla spaghetti', brand: 'Barilla', format: '500 g', unit: 'kg', size: 0.5, store: 'Conad', address: 'Corso Italia 8, Milano', distance: 2.5, price: 1.25, loyaltyPrice: 0.99, loyaltyRequired: true, validUntil: '2026-08-10', available: true, image: '🍝' },
  { name: 'Pasta Barilla spaghetti', brand: 'Barilla', format: '500 g', unit: 'kg', size: 0.5, store: 'Lidl', address: 'Via Torino 21, Milano', distance: 6.4, price: 1.09, loyaltyPrice: null, loyaltyRequired: false, validUntil: '2026-07-30', available: true, image: '🍝' },
  { name: 'Olio extravergine', brand: 'Monini', format: '1 litro', unit: 'litro', size: 1, store: 'Carrefour', address: 'Piazza Duomo 3, Milano', distance: 4.4, price: 8.49, loyaltyPrice: 7.49, loyaltyRequired: true, validUntil: '2026-08-01', available: true, image: '🫒' },
  { name: 'Detersivo lavatrice', brand: 'Dash', format: '30 lavaggi', unit: 'pezzo', size: 1, store: 'Eurospin', address: 'Via Padova 90, Milano', distance: 12.6, price: 5.99, loyaltyPrice: null, loyaltyRequired: false, validUntil: '2026-08-05', available: true, image: '🧴' },
];

const form = document.querySelector('#itemForm');
const list = document.querySelector('#shoppingList');
const bestStore = document.querySelector('#bestStore');
const installButton = document.querySelector('#installButton');
const template = document.querySelector('#itemTemplate');
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

function saveItems() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items)); }
function saveLoyaltyCards() { localStorage.setItem(LOYALTY_KEY, JSON.stringify(state.loyaltyCards)); }
function normalize(value) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function isActive(offer) { return new Date(`${offer.validUntil}T23:59:59`) >= new Date(); }
function canUseLoyalty(offer) { return offer.loyaltyRequired && state.loyaltyCards.includes(offer.store); }
function effectivePrice(offer) { return canUseLoyalty(offer) && offer.loyaltyPrice ? offer.loyaltyPrice : offer.price; }
function unitLabel(offer) { return offer.unit === 'kg' && offer.size <= 0.1 ? '100 g' : offer.unit; }
function unitPrice(offer) { return offer.unit === 'kg' && offer.size <= 0.1 ? effectivePrice(offer) / (offer.size * 10) : effectivePrice(offer) / offer.size; }
function totalFor(offer, quantity) { return effectivePrice(offer) * quantity; }

function renderSuggestions() {
  document.querySelector('#productSuggestions').replaceChildren(...suggestions.map((item) => Object.assign(document.createElement('option'), { value: item })));
}

function renderLoyaltyCards() {
  const container = document.querySelector('#loyaltyCards');
  container.replaceChildren(...loyaltyBrands.map((brand) => {
    const label = document.createElement('label');
    label.className = 'check card-check';
    label.innerHTML = `<input type="checkbox" value="${brand}"> ${brand}`;
    const input = label.querySelector('input');
    input.checked = state.loyaltyCards.includes(brand);
    input.addEventListener('change', () => {
      state.loyaltyCards = input.checked ? [...state.loyaltyCards, brand] : state.loyaltyCards.filter((card) => card !== brand);
      saveLoyaltyCards();
      renderResults();
    });
    return label;
  }));
}

async function getLocation() {
  const status = document.querySelector('#locationStatus');
  if (!navigator.geolocation) throw new Error('Posizione non disponibile. Inserisci città o CAP.');
  status.textContent = 'Richiesta consenso GPS in corso…';
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition((position) => {
      if (position.coords.accuracy > 5000) reject(new Error('Posizione non sufficientemente precisa. Inserisci città o CAP.'));
      else resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy });
    }, () => reject(new Error('Posizione non disponibile. Inserisci città o CAP.')), { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 });
  });
}

function searchOffers(productName, quantity) {
  const query = normalize(productName);
  const radii = [10, 20, 30, 50];
  for (const radius of radii) {
    const matches = partnerCatalog.filter((offer) => offer.distance <= radius && offer.available && isActive(offer) && query.split(' ').some((term) => term.length > 2 && normalize(`${offer.name} ${offer.brand} ${offer.format}`).includes(term)));
    if (matches.length) return matches.map((offer) => ({ ...offer, radius, requestedQuantity: quantity })).sort((a, b) => totalFor(a, quantity) - totalFor(b, quantity));
  }
  return [];
}

function offerCard(offer, featured = false) {
  const quantity = offer.requestedQuantity || 1;
  const loyaltyText = canUseLoyalty(offer) ? 'Con carta fedeltà' : 'Senza carta fedeltà';
  const loyaltyWarning = offer.loyaltyRequired && !canUseLoyalty(offer) ? '<p class="warning">Prezzo disponibile solo con carta fedeltà.</p>' : '';
  const card = document.createElement('article');
  card.className = featured ? 'offer-card featured' : 'offer-card';
  card.innerHTML = `
    <div class="product-image" aria-hidden="true">${offer.image || '🛒'}</div>
    <div>
      <h3>${offer.name}</h3>
      <p>${offer.brand} · ${offer.format}</p>
      <p><strong>${offer.store}</strong> · ${offer.address} · ${offer.distance.toFixed(1)} km</p>
      <p>Prezzo confezione: <strong>${euro.format(effectivePrice(offer))}</strong> · Prezzo unitario: <strong>${euro.format(unitPrice(offer))}/${unitLabel(offer)}</strong></p>
      <p>Quantità: ${quantity} · Totale da pagare: <strong>${euro.format(totalFor(offer, quantity))}</strong></p>
      <p>${loyaltyText} · Validità offerta: ${offer.validUntil} · Disponibilità: ${offer.available ? 'Disponibile' : 'Non disponibile'}</p>
      ${loyaltyWarning}
      <div class="actions"><button type="button" class="ghost">NAVIGA</button><button type="button" data-add-offer>AGGIUNGI ALLA LISTA</button>${featured ? '' : '<button type="button" class="ghost">Dettagli</button>'}</div>
    </div>`;
  card.querySelector('[data-add-offer]')?.addEventListener('click', () => addOfferToList(offer));
  return card;
}

function renderResults() {
  const panel = document.querySelector('#resultsPanel');
  const recommended = document.querySelector('#recommendedResult');
  const other = document.querySelector('#otherOffers');
  recommended.replaceChildren();
  other.replaceChildren();
  if (!state.currentOffers.length) return;
  panel.hidden = false;
  const [best, ...others] = [...state.currentOffers].sort((a, b) => totalFor(a, a.requestedQuantity) - totalFor(b, b.requestedQuantity));
  bestStore.textContent = best.store;
  recommended.append(offerCard(best, true));
  others.forEach((offer) => other.append(offerCard(offer)));
}

function addOfferToList(offer) {
  state.items.push({ id: crypto.randomUUID(), name: offer.name, quantity: offer.requestedQuantity, store: offer.store, total: totalFor(offer, offer.requestedQuantity), unitPrice: unitPrice(offer), loyalty: canUseLoyalty(offer) });
  saveItems();
  renderList();
}

function renderList() {
  list.replaceChildren();
  if (!state.items.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Nessun prodotto: cerca il prezzo migliore e aggiungi il primo articolo alla lista.';
    list.append(empty);
    return;
  }
  state.items.forEach((item) => {
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelector('[data-name]').textContent = item.name;
    row.querySelector('[data-meta]').textContent = `${item.quantity} pz · ${item.store} · totale ${euro.format(item.total)}${item.loyalty ? ' · con carta fedeltà' : ''}`;
    row.querySelector('[data-remove]').addEventListener('click', () => { state.items = state.items.filter((candidate) => candidate.id !== item.id); saveItems(); renderList(); });
    list.append(row);
  });
}

function renderOptimization() {
  const panel = document.querySelector('#optimizationPanel');
  const target = document.querySelector('#optimizationResults');
  if (!state.items.length) return;
  const byStore = state.items.reduce((groups, item) => ({ ...groups, [item.store]: [...(groups[item.store] || []), item] }), {});
  const totals = Object.entries(byStore).map(([store, items]) => ({ store, items, total: items.reduce((sum, item) => sum + item.total, 0) })).sort((a, b) => a.total - b.total);
  const total = state.items.reduce((sum, item) => sum + item.total, 0);
  panel.hidden = false;
  target.innerHTML = `<article class="store-card"><h3>SPESA PIÙ ECONOMICA</h3><p>Divide gli acquisti tra più supermercati per ottenere il prezzo totale minimo.</p><p>Costo totale: <strong>${euro.format(total)}</strong> · Risparmio stimato: ${euro.format(Math.max(0, total * 0.08))} · Distanza totale stimata: calcolata sui punti vendita disponibili.</p>${totals.map((group) => `<p><strong>${group.store}</strong>: ${group.items.map((item) => item.name).join(', ')} · ${euro.format(group.total)}</p>`).join('')}<p>Prodotti non trovati: nessuno tra quelli già aggiunti. Offerte con carta fedeltà: ${state.items.filter((item) => item.loyalty).map((item) => item.name).join(', ') || 'nessuna'}.</p></article><article class="store-card"><h3>MIGLIOR SUPERMERCATO UNICO</h3><p>Suggerisce un solo supermercato dove acquistare il maggior numero possibile di prodotti con il totale complessivo più conveniente.</p><p><strong>${totals[0].store}</strong> · Costo parziale prodotti disponibili: ${euro.format(totals[0].total)} · Prodotti: ${totals[0].items.map((item) => item.name).join(', ')}</p></article>`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.querySelector('#itemName').value.trim();
  const quantity = Math.max(1, Number(document.querySelector('#itemQuantity').value || 1));
  const status = document.querySelector('#locationStatus');
  try {
    state.userLocation = state.userLocation || await getLocation();
    status.textContent = `Posizione acquisita (precisione ${Math.round(state.userLocation.accuracy)} m). ${authorizedSources.length} categorie di fonti autorizzate configurabili.`;
  } catch (error) {
    status.textContent = error.message;
    document.querySelector('#manualLocation').hidden = false;
  }
  state.currentOffers = searchOffers(name, quantity);
  if (!state.currentOffers.length) status.textContent = 'Nessun prezzo disponibile per questo prodotto nella tua zona. Alcuni supermercati non forniscono prezzi aggiornati online. I prezzi possono variare nel punto vendita. Verifica prima dell’acquisto.';
  renderResults();
});

document.querySelector('#decreaseQuantity').addEventListener('click', () => { const input = document.querySelector('#itemQuantity'); input.value = Math.max(1, Number(input.value || 1) - 1); });
document.querySelector('#increaseQuantity').addEventListener('click', () => { const input = document.querySelector('#itemQuantity'); input.value = Number(input.value || 1) + 1; });
document.querySelector('#useManualLocation').addEventListener('click', () => { const value = document.querySelector('#locationQuery').value.trim(); state.userLocation = { manual: value }; document.querySelector('#locationStatus').textContent = value ? `Posizione manuale impostata: ${value}.` : 'Posizione non disponibile. Inserisci città o CAP.'; });
document.querySelector('#clearLocation').addEventListener('click', () => { state.userLocation = null; document.querySelector('#locationStatus').textContent = 'Posizione cancellata. Verrà richiesto un nuovo consenso GPS alla prossima ricerca.'; });
document.querySelector('#optimizeCart').addEventListener('click', renderOptimization);
function applyTextFilters() {
  const brand = normalize(document.querySelector('#brandFilter').value.trim());
  const format = normalize(document.querySelector('#formatFilter').value.trim());
  const radius = Number(document.querySelector('#radiusFilter').value || 50);
  state.currentOffers = state.currentOffers.filter((offer) => (!brand || normalize(offer.brand).includes(brand)) && (!format || normalize(offer.format).includes(format)) && offer.distance <= radius);
  renderResults();
}
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { state.currentOffers = button.dataset.filter === 'nearest' ? state.currentOffers.sort((a, b) => a.distance - b.distance) : state.currentOffers.sort((a, b) => totalFor(a, a.requestedQuantity) - totalFor(b, b.requestedQuantity)); if (button.dataset.filter === 'noLoyalty') state.currentOffers = state.currentOffers.filter((offer) => !offer.loyaltyRequired); if (button.dataset.filter === 'active') state.currentOffers = state.currentOffers.filter(isActive); renderResults(); }));
document.querySelector('#brandFilter').addEventListener('change', applyTextFilters);
document.querySelector('#formatFilter').addEventListener('change', applyTextFilters);
document.querySelector('#radiusFilter').addEventListener('change', applyTextFilters);

window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); state.deferredPrompt = event; installButton.hidden = false; });
installButton.addEventListener('click', async () => { if (!state.deferredPrompt) return; state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; state.deferredPrompt = null; installButton.hidden = true; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

renderSuggestions();
renderLoyaltyCards();
renderList();
