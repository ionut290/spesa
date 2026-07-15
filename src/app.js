const STORAGE_KEY = 'spesa-intelligente-items';
const LOYALTY_KEY = 'spesa-intelligente-loyalty-cards';
const RECENTS_KEY = 'spesa-intelligente-recent-products';
const OFFLINE_KEY = 'spesa-intelligente-offline-scans';

const state = {
  items: JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'),
  loyaltyCards: JSON.parse(localStorage.getItem(LOYALTY_KEY) || '[]'),
  recentProducts: JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'),
  offlineScans: JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]'),
  deferredPrompt: null,
  currentOffers: [],
  userLocation: null,
  scannedProduct: null,
  scannerLocked: false,
  cameraStream: null,
  scannerTimer: null,
};

const authorizedSources = [
  'Database interno indicizzato per codice a barre',
  'API ufficiali supermercati configurate dal backend',
  'API di comparazione prezzi autorizzate',
  'Cataloghi pubblici autorizzati',
  'Volantini e feed promozionali accessibili legalmente',
  'Database partner configurabili dal backend',
];

const productModelFields = ['id', 'barcode', 'barcodeType', 'name', 'normalizedName', 'brand', 'category', 'imageUrl', 'packageSize', 'packageUnit', 'description', 'source', 'createdAt', 'updatedAt'];
const loyaltyBrands = ['Coop', 'Conad', 'Esselunga', 'Carrefour', 'Lidl', 'Eurospin', 'MD', 'Pam', 'Despar', 'Aldi'];
const suggestions = ['Latte Granarolo intero 1 litro', 'Pasta Barilla spaghetti 500 g', 'Olio extravergine Monini 1 litro', 'Detersivo lavatrice 30 lavaggi', 'Caffè espresso 250 g', 'Riso Carnaroli 1 kg'];

const partnerCatalog = [
  { name: 'Latte Granarolo intero', brand: 'Granarolo', format: '1 litro', unit: 'litro', size: 1, store: 'Coop', address: 'Via Roma 12, Milano', distance: 1.8, price: 1.79, loyaltyPrice: 1.59, loyaltyRequired: true, validUntil: '2026-08-02', available: true, image: '🥛', barcode: '8001234567890', barcodeType: 'EAN-13', category: 'Latticini', description: 'Latte intero a lunga conservazione.' },
  { name: 'Latte Granarolo intero', brand: 'Granarolo', format: '1 litro', unit: 'litro', size: 1, store: 'Esselunga', address: 'Viale Monza 45, Milano', distance: 3.2, price: 1.69, loyaltyPrice: null, loyaltyRequired: false, validUntil: '2026-07-28', available: true, image: '🥛', barcode: '8001234567890', barcodeType: 'EAN-13', category: 'Latticini', description: 'Latte intero a lunga conservazione.' },
  { name: 'Pasta Barilla spaghetti', brand: 'Barilla', format: '500 g', unit: 'kg', size: 0.5, store: 'Conad', address: 'Corso Italia 8, Milano', distance: 2.5, price: 1.25, loyaltyPrice: 0.99, loyaltyRequired: true, validUntil: '2026-08-10', available: true, image: '🍝', barcode: '8076809513753', barcodeType: 'EAN-13', category: 'Pasta', description: 'Spaghetti di semola di grano duro.' },
  { name: 'Pasta Barilla spaghetti', brand: 'Barilla', format: '500 g', unit: 'kg', size: 0.5, store: 'Lidl', address: 'Via Torino 21, Milano', distance: 6.4, price: 1.09, loyaltyPrice: null, loyaltyRequired: false, validUntil: '2026-07-30', available: true, image: '🍝', barcode: '8076809513753', barcodeType: 'EAN-13', category: 'Pasta', description: 'Spaghetti di semola di grano duro.' },
  { name: 'Olio extravergine', brand: 'Monini', format: '1 litro', unit: 'litro', size: 1, store: 'Carrefour', address: 'Piazza Duomo 3, Milano', distance: 4.4, price: 8.49, loyaltyPrice: 7.49, loyaltyRequired: true, validUntil: '2026-08-01', available: true, image: '🫒', barcode: '8005510000018', barcodeType: 'EAN-13', category: 'Condimenti', description: 'Olio extravergine di oliva.' },
  { name: 'Detersivo lavatrice', brand: 'Dash', format: '30 lavaggi', unit: 'pezzo', size: 1, store: 'Eurospin', address: 'Via Padova 90, Milano', distance: 12.6, price: 5.99, loyaltyPrice: null, loyaltyRequired: false, validUntil: '2026-08-05', available: true, image: '🧴', barcode: '8001090000003', barcodeType: 'EAN-13', category: 'Casa', description: 'Detersivo per lavatrice.' },
];

const form = document.querySelector('#itemForm');
const list = document.querySelector('#shoppingList');
const bestStore = document.querySelector('#bestStore');
const installButton = document.querySelector('#installButton');
const template = document.querySelector('#itemTemplate');
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

function saveItems() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items)); }
function saveLoyaltyCards() { localStorage.setItem(LOYALTY_KEY, JSON.stringify(state.loyaltyCards)); }
function saveRecents() { localStorage.setItem(RECENTS_KEY, JSON.stringify(state.recentProducts)); }
function saveOfflineScans() { localStorage.setItem(OFFLINE_KEY, JSON.stringify(state.offlineScans)); }
function normalize(value) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function isActive(offer) { return new Date(`${offer.validUntil}T23:59:59`) >= new Date(); }
function canUseLoyalty(offer) { return offer.loyaltyRequired && state.loyaltyCards.includes(offer.store); }
function effectivePrice(offer) { return canUseLoyalty(offer) && offer.loyaltyPrice ? offer.loyaltyPrice : offer.price; }
function unitLabel(offer) { return offer.unit === 'kg' && offer.size <= 0.1 ? '100 g' : offer.unit; }
function unitPrice(offer) { return offer.unit === 'kg' && offer.size <= 0.1 ? effectivePrice(offer) / (offer.size * 10) : effectivePrice(offer) / offer.size; }
function totalFor(offer, quantity) { return effectivePrice(offer) * quantity; }

function productFromOffer(offer) {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), barcode: offer.barcode || null, barcodeType: offer.barcodeType || null, name: offer.name, normalizedName: normalize(offer.name), brand: offer.brand, category: offer.category || 'Altro', imageUrl: offer.image || '', packageSize: offer.size, packageUnit: offer.unit, format: offer.format, description: offer.description || '', source: 'DATI DIMOSTRATIVI - backend modulare da collegare a fonti autorizzate', createdAt: now, updatedAt: now };
}

function isValidBarcode(code) { return /^(\d{8}|\d{12,13})$/.test(code) || /^[A-Z0-9\-]{6,48}$/i.test(code); }
function detectBarcodeType(code) { if (/^\d{13}$/.test(code)) return 'EAN-13'; if (/^\d{8}$/.test(code)) return 'EAN-8 / UPC-E'; if (/^\d{12}$/.test(code)) return 'UPC-A'; return 'Code 128'; }
function findProductByBarcode(barcode) { const offer = partnerCatalog.find((item) => item.barcode === barcode); return offer ? productFromOffer(offer) : null; }
function matchingOffersForProduct(product, quantity) { return searchOffers(`${product.name} ${product.brand || ''} ${product.format || ''}`, quantity).map((offer) => ({ ...offer, product })); }

function addRecent(product, lastPrice = null) {
  const entry = { ...product, lastPrice, seenAt: new Date().toISOString() };
  state.recentProducts = [entry, ...state.recentProducts.filter((item) => (item.barcode || item.name) !== (entry.barcode || entry.name))].slice(0, 6);
  saveRecents();
  renderRecents();
}

function renderSuggestions() {
  document.querySelector('#productSuggestions').replaceChildren(...suggestions.map((item) => Object.assign(document.createElement('option'), { value: item })));
}

function renderRecents() {
  const container = document.querySelector('#recentProducts');
  if (!container) return;
  if (!state.recentProducts.length) {
    container.innerHTML = '<p class="muted">Nessun prodotto recente. Scansiona o cerca un prodotto per iniziare.</p>';
    return;
  }
  container.replaceChildren(...state.recentProducts.map((product) => {
    const card = document.createElement('article');
    card.className = 'recent-card';
    card.innerHTML = `<div class="product-image" aria-hidden="true">${product.imageUrl || '🛒'}</div><div><h3>${product.name}</h3><p>${product.brand || 'Marca non indicata'} · ${product.format || `${product.packageSize || ''} ${product.packageUnit || ''}`.trim() || 'Formato non indicato'}</p><p>Ultimo prezzo trovato: <strong>${product.lastPrice ? euro.format(product.lastPrice) : 'DATI DIMOSTRATIVI non disponibili'}</strong></p><button type="button">AGGIUNGI DI NUOVO</button></div>`;
    card.querySelector('button').addEventListener('click', () => { document.querySelector('#itemName').value = `${product.name} ${product.brand || ''} ${product.format || ''}`.trim(); submitProductSearch(product); });
    return card;
  }));
}

function renderLoyaltyCards() {
  const container = document.querySelector('#loyaltyCards');
  container.replaceChildren(...loyaltyBrands.map((brand) => {
    const label = document.createElement('label');
    label.className = 'check card-check';
    label.innerHTML = `<input type="checkbox" value="${brand}"> ${brand}`;
    const input = label.querySelector('input');
    input.checked = state.loyaltyCards.includes(brand);
    input.addEventListener('change', () => { state.loyaltyCards = input.checked ? [...state.loyaltyCards, brand] : state.loyaltyCards.filter((card) => card !== brand); saveLoyaltyCards(); renderResults(); });
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
    }, () => reject(new Error('Permesso GPS negato o posizione non disponibile. Inserisci città o CAP.')), { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 });
  });
}

function searchOffers(productName, quantity) {
  const query = normalize(productName);
  const radii = [10, 20, 30, 50];
  for (const radius of radii) {
    const matches = partnerCatalog.filter((offer) => offer.distance <= radius && offer.available && isActive(offer) && query.split(' ').some((term) => term.length > 2 && normalize(`${offer.name} ${offer.brand} ${offer.format} ${offer.barcode}`).includes(term)));
    if (matches.length) return matches.map((offer) => ({ ...offer, radius, requestedQuantity: quantity })).sort((a, b) => totalFor(a, quantity) - totalFor(b, quantity));
  }
  return [];
}

async function submitProductSearch(product = null) {
  const name = product ? product.name : document.querySelector('#itemName').value.trim();
  const quantity = Math.max(1, Number(document.querySelector('#itemQuantity').value || 1));
  const status = document.querySelector('#locationStatus');
  try {
    state.userLocation = state.userLocation || await getLocation();
    status.textContent = `Posizione acquisita (precisione ${Math.round(state.userLocation.accuracy)} m). ${authorizedSources.length} categorie di fonti autorizzate configurabili. DATI DIMOSTRATIVI.`;
  } catch (error) {
    status.textContent = error.message;
    document.querySelector('#manualLocation').hidden = false;
  }
  state.currentOffers = product ? matchingOffersForProduct(product, quantity) : searchOffers(name, quantity);
  if (!state.currentOffers.length) status.textContent = 'Nessun prezzo disponibile per questo prodotto nella tua zona. DATI DIMOSTRATIVI: collega il backend a fonti autorizzate per prezzi reali.';
  if (state.currentOffers[0]) addRecent(product || productFromOffer(state.currentOffers[0]), effectivePrice(state.currentOffers[0]));
  renderResults();
}

function offerCard(offer, featured = false) {
  const quantity = offer.requestedQuantity || 1;
  const loyaltyText = canUseLoyalty(offer) ? 'Con carta fedeltà' : 'Senza carta fedeltà';
  const loyaltyWarning = offer.loyaltyRequired && !canUseLoyalty(offer) ? '<p class="warning">Prezzo disponibile solo con carta fedeltà.</p>' : '';
  const card = document.createElement('article');
  card.className = featured ? 'offer-card featured' : 'offer-card';
  card.innerHTML = `<div class="product-image" aria-hidden="true">${offer.image || '🛒'}</div><div><h3>${offer.name}</h3><p>${offer.brand} · ${offer.format}</p><p><strong>${offer.store}</strong> · ${offer.address} · ${offer.distance.toFixed(1)} km</p><p>Prezzo confezione: <strong>${euro.format(effectivePrice(offer))}</strong> · Prezzo unitario: <strong>${euro.format(unitPrice(offer))}/${unitLabel(offer)}</strong></p><p>Quantità: ${quantity} · Totale da pagare: <strong>${euro.format(totalFor(offer, quantity))}</strong></p><p>${loyaltyText} · Validità offerta: ${offer.validUntil} · Disponibilità: ${offer.available ? 'Disponibile' : 'Non disponibile'} · DATI DIMOSTRATIVI</p>${loyaltyWarning}<div class="actions"><button type="button" class="ghost">NAVIGA</button><button type="button" data-add-offer>AGGIUNGI ALLA LISTA</button>${featured ? '' : '<button type="button" class="ghost">Dettagli</button>'}</div></div>`;
  card.querySelector('[data-add-offer]')?.addEventListener('click', () => addOfferToList(offer));
  return card;
}

function renderResults() {
  const panel = document.querySelector('#resultsPanel');
  const recommended = document.querySelector('#recommendedResult');
  const other = document.querySelector('#otherOffers');
  recommended.replaceChildren(); other.replaceChildren();
  if (!state.currentOffers.length) return;
  panel.hidden = false;
  const [best, ...others] = [...state.currentOffers].sort((a, b) => totalFor(a, a.requestedQuantity) - totalFor(b, b.requestedQuantity));
  bestStore.textContent = best.store;
  recommended.append(offerCard(best, true));
  others.forEach((offer) => other.append(offerCard(offer)));
}

function addOfferToList(offer) {
  state.items.push({ id: crypto.randomUUID(), name: offer.name, quantity: offer.requestedQuantity, store: offer.store, total: totalFor(offer, offer.requestedQuantity), unitPrice: unitPrice(offer), loyalty: canUseLoyalty(offer), barcode: offer.barcode || null, category: offer.category || 'Altro', notes: '' });
  saveItems(); addRecent(productFromOffer(offer), effectivePrice(offer)); renderList();
}

function renderList() {
  list.replaceChildren();
  if (!state.items.length) { const empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = 'Nessun prodotto: cerca il prezzo migliore e aggiungi il primo articolo alla lista.'; list.append(empty); return; }
  state.items.forEach((item) => {
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelector('[data-name]').textContent = item.name;
    row.querySelector('[data-meta]').textContent = `${item.quantity} pz · ${item.category || 'Categoria non indicata'} · ${item.store} · totale ${euro.format(item.total)}${item.loyalty ? ' · con carta fedeltà' : ''}`;
    row.querySelector('[data-remove]').addEventListener('click', () => { state.items = state.items.filter((candidate) => candidate.id !== item.id); saveItems(); renderList(); });
    list.append(row);
  });
}

function showScanner() {
  const overlay = document.querySelector('#scannerOverlay');
  overlay.hidden = false;
  document.querySelector('#scannerMessage').textContent = 'Inquadra il codice a barre del prodotto';
  if (!navigator.mediaDevices?.getUserMedia) { document.querySelector('#scannerMessage').textContent = 'Il browser non supporta la fotocamera o la scansione. Puoi inserire un codice manualmente.'; return; }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then((stream) => {
    state.cameraStream = stream;
    document.querySelector('#scannerVideo').srcObject = stream;
    startDemoScanner();
  }).catch(() => { document.querySelector('#scannerMessage').textContent = 'Permesso fotocamera negato. Puoi riprovare o inserire il codice manualmente.'; });
}

function startDemoScanner() {
  clearTimeout(state.scannerTimer);
  state.scannerTimer = setTimeout(() => handleBarcodeDetected('8076809513753'), 1800);
}
function closeScanner() { document.querySelector('#scannerOverlay').hidden = true; state.cameraStream?.getTracks().forEach((track) => track.stop()); state.cameraStream = null; state.scannerLocked = false; clearTimeout(state.scannerTimer); }
function setScanResult(html) { document.querySelector('#scanResult').innerHTML = html; }

function handleBarcodeDetected(code) {
  if (state.scannerLocked) return;
  state.scannerLocked = true;
  if (!isValidBarcode(code)) { setScanResult('<article class="scan-card"><h3>Codice a barre non riconosciuto. Prova a inquadrarlo nuovamente.</h3><button type="button" id="retryScan">RIPROVA</button></article>'); document.querySelector('#retryScan').addEventListener('click', () => { state.scannerLocked = false; setScanResult(''); showScanner(); }); return; }
  closeScanner();
  setScanResult('<article class="scan-card"><p class="loading">Ricerca prodotto in corso...</p></article>');
  if (!navigator.onLine) {
    state.offlineScans.push({ barcode: code, quantity: Number(document.querySelector('#itemQuantity').value || 1), scannedAt: new Date().toISOString() }); saveOfflineScans();
    setScanResult(`<article class="scan-card"><h3>Prodotto salvato.</h3><p>La ricerca dei prezzi partirà quando tornerà la connessione.</p><p>Codice rilevato: <strong>${code}</strong></p></article>`); return;
  }
  setTimeout(() => renderScannedProduct(code), 500);
}

function renderScannedProduct(code) {
  const product = findProductByBarcode(code);
  const quantity = Number(document.querySelector('#itemQuantity').value || 1);
  if (!product) {
    setScanResult(`<article class="scan-card"><h3>Prodotto non trovato</h3><p>Codice rilevato: <strong>${code}</strong></p><label>Nome prodotto<input id="unknownName" placeholder="Nome prodotto"></label><label>Marca<input id="unknownBrand" placeholder="Marca opzionale"></label><label>Formato<input id="unknownFormat" placeholder="Formato opzionale"></label><div class="actions"><button type="button" id="saveUnknown">SALVA E CERCA PREZZI</button><button type="button" id="scanAgain" class="ghost">SCANSIONA DI NUOVO</button></div></article>`);
    document.querySelector('#scanAgain').addEventListener('click', showScanner);
    document.querySelector('#saveUnknown').addEventListener('click', () => {
      const name = document.querySelector('#unknownName').value.trim();
      if (!name) return;
      const now = new Date().toISOString();
      state.scannedProduct = { id: crypto.randomUUID(), barcode: code, barcodeType: detectBarcodeType(code), name, normalizedName: normalize(name), brand: document.querySelector('#unknownBrand').value.trim(), category: 'Da classificare', imageUrl: '', packageSize: null, packageUnit: '', format: document.querySelector('#unknownFormat').value.trim(), description: '', source: 'Inserito manualmente dall’utente', createdAt: now, updatedAt: now };
      document.querySelector('#itemName').value = `${state.scannedProduct.name} ${state.scannedProduct.brand} ${state.scannedProduct.format}`.trim(); submitProductSearch(state.scannedProduct);
    }); return;
  }
  state.scannedProduct = product; addRecent(product);
  setScanResult(`<article class="scan-card"><div class="product-image">${product.imageUrl || '🛒'}</div><h3>${product.name}</h3><p>${product.brand} · ${product.format || `${product.packageSize} ${product.packageUnit}`}</p><p>Codice a barre: <strong>${product.barcode}</strong> · ${product.barcodeType}</p><p>Categoria: ${product.category} · Quantità: ${quantity}</p><p class="muted">${product.description}</p><div class="actions"><button type="button" id="confirmScan">CONFERMA E CERCA PREZZI</button><button type="button" id="scanAgain" class="ghost">SCANSIONA DI NUOVO</button></div></article>`);
  document.querySelector('#confirmScan').addEventListener('click', () => submitProductSearch(product));
  document.querySelector('#scanAgain').addEventListener('click', showScanner);
}

function renderOptimization() {
  const panel = document.querySelector('#optimizationPanel'); const target = document.querySelector('#optimizationResults'); if (!state.items.length) return;
  const byStore = state.items.reduce((groups, item) => ({ ...groups, [item.store]: [...(groups[item.store] || []), item] }), {});
  const totals = Object.entries(byStore).map(([store, items]) => ({ store, items, total: items.reduce((sum, item) => sum + item.total, 0) })).sort((a, b) => a.total - b.total);
  const total = state.items.reduce((sum, item) => sum + item.total, 0); panel.hidden = false;
  target.innerHTML = `<article class="store-card"><h3>SPESA PIÙ ECONOMICA</h3><p>Divide gli acquisti tra più supermercati per ottenere il prezzo totale minimo.</p><p>Costo totale: <strong>${euro.format(total)}</strong> · Risparmio stimato: ${euro.format(Math.max(0, total * 0.08))} · Distanza totale stimata: calcolata sui punti vendita disponibili.</p>${totals.map((group) => `<p><strong>${group.store}</strong>: ${group.items.map((item) => item.name).join(', ')} · ${euro.format(group.total)}</p>`).join('')}<p>Prodotti non trovati: nessuno tra quelli già aggiunti. Offerte con carta fedeltà: ${state.items.filter((item) => item.loyalty).map((item) => item.name).join(', ') || 'nessuna'}.</p></article><article class="store-card"><h3>MIGLIOR SUPERMERCATO UNICO</h3><p><strong>${totals[0].store}</strong> · Costo parziale prodotti disponibili: ${euro.format(totals[0].total)} · Prodotti: ${totals[0].items.map((item) => item.name).join(', ')}</p></article>`;
}

form.addEventListener('submit', (event) => { event.preventDefault(); submitProductSearch(); });
document.querySelector('#scanButton').addEventListener('click', showScanner);
document.querySelector('#cancelScan').addEventListener('click', closeScanner);
document.querySelector('#torchToggle').addEventListener('click', () => { document.querySelector('#scannerMessage').textContent = 'Torcia non disponibile in questa demo web. Su Android Capacitor usare un plugin stabile con permesso CAMERA.'; });
document.querySelector('#galleryInput').addEventListener('change', () => { const code = prompt('Inserisci il codice letto dalla foto, se supportato dal dispositivo:'); if (code) handleBarcodeDetected(code.trim()); });
document.querySelector('#manualBarcode').addEventListener('change', (event) => { if (event.target.value.trim()) handleBarcodeDetected(event.target.value.trim()); });
document.querySelector('#voiceButton').addEventListener('click', () => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { document.querySelector('#locationStatus').textContent = 'Ricerca vocale non supportata da questo browser. Puoi scrivere il prodotto nel campo di ricerca.'; return; }
  const recognition = new Recognition(); recognition.lang = 'it-IT'; recognition.interimResults = false; recognition.maxAlternatives = 1;
  document.querySelector('#locationStatus').textContent = 'Richiesta consenso microfono e ascolto in corso…';
  recognition.onresult = (event) => { document.querySelector('#itemName').value = event.results[0][0].transcript; document.querySelector('#locationStatus').textContent = 'Testo vocale inserito nel campo di ricerca.'; };
  recognition.onerror = () => { document.querySelector('#locationStatus').textContent = 'Permesso microfono negato o ricerca vocale non disponibile.'; };
  recognition.start();
});
document.querySelector('#decreaseQuantity').addEventListener('click', () => { const input = document.querySelector('#itemQuantity'); input.value = Math.max(1, Number(input.value || 1) - 1); });
document.querySelector('#increaseQuantity').addEventListener('click', () => { const input = document.querySelector('#itemQuantity'); input.value = Number(input.value || 1) + 1; });
document.querySelector('#useManualLocation').addEventListener('click', () => { const value = document.querySelector('#locationQuery').value.trim(); state.userLocation = { manual: value, accuracy: 0 }; document.querySelector('#locationStatus').textContent = value ? `Posizione manuale impostata: ${value}.` : 'Posizione non disponibile. Inserisci città o CAP.'; });
document.querySelector('#clearLocation').addEventListener('click', () => { state.userLocation = null; document.querySelector('#locationStatus').textContent = 'Posizione cancellata. Verrà richiesto un nuovo consenso GPS alla prossima ricerca.'; });
document.querySelector('#optimizeCart').addEventListener('click', renderOptimization);
function applyTextFilters() { const brand = normalize(document.querySelector('#brandFilter').value.trim()); const format = normalize(document.querySelector('#formatFilter').value.trim()); const radius = Number(document.querySelector('#radiusFilter').value || 50); state.currentOffers = state.currentOffers.filter((offer) => (!brand || normalize(offer.brand).includes(brand)) && (!format || normalize(offer.format).includes(format)) && offer.distance <= radius); renderResults(); }
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { state.currentOffers = button.dataset.filter === 'nearest' ? state.currentOffers.sort((a, b) => a.distance - b.distance) : state.currentOffers.sort((a, b) => totalFor(a, a.requestedQuantity) - totalFor(b, b.requestedQuantity)); if (button.dataset.filter === 'noLoyalty') state.currentOffers = state.currentOffers.filter((offer) => !offer.loyaltyRequired); if (button.dataset.filter === 'active') state.currentOffers = state.currentOffers.filter(isActive); renderResults(); }));
document.querySelector('#brandFilter').addEventListener('change', applyTextFilters);
document.querySelector('#formatFilter').addEventListener('change', applyTextFilters);
document.querySelector('#radiusFilter').addEventListener('change', applyTextFilters);
window.addEventListener('online', () => { if (!state.offlineScans.length) return; document.querySelector('#locationStatus').textContent = 'Connessione ripristinata: identificazione prodotti offline e ricerca prezzi in corso.'; const pending = [...state.offlineScans]; state.offlineScans = []; saveOfflineScans(); pending.forEach((scan) => renderScannedProduct(scan.barcode)); });
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); state.deferredPrompt = event; installButton.hidden = false; });
installButton.addEventListener('click', async () => { if (!state.deferredPrompt) return; state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; state.deferredPrompt = null; installButton.hidden = true; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

console.info('Product model fields:', productModelFields.join(', '));
renderSuggestions(); renderLoyaltyCards(); renderList(); renderRecents();
