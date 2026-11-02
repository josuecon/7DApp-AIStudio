import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('🧪 Iniciando batería de pruebas obligatorias: Fase 3.0 — Sección e Interfaz Pública de Eventos...\n');

// 1. Verificar orden en public/index.html (Pruebas 15, 16, 17)
const indexHtmlPath = path.resolve(process.cwd(), 'public/index.html');
const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

// Mocks para DOM
const storageMap = new Map();
const mockLocalStorage = {
  getItem: (k) => storageMap.get(k) || null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear()
};

function createMockElement(id = '', tag = 'div') {
  return {
    id,
    tagName: tag.toUpperCase(),
    value: '',
    textContent: '',
    _html: '',
    get innerHTML() {
      if (this.children.length > 0) {
        return this.children.map(c => c.innerHTML || c.outerHTML || '').join('');
      }
      return this._html;
    },
    set innerHTML(val) {
      this._html = val || '';
      if (!val) {
        this.children = [];
      }
    },
    style: {},
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this._classes.has(c)) { this._classes.delete(c); return false; }
          else { this._classes.add(c); return true; }
        }
        if (force) { this._classes.add(c); return true; }
        else { this._classes.delete(c); return false; }
      }
    },
    disabled: false,
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    setAttribute() {},
    getAttribute() { return null; }
  };
}

const elementRegistry = new Map();
function getOrCreateElement(id) {
  if (!elementRegistry.has(id)) {
    elementRegistry.set(id, createMockElement(id));
  }
  return elementRegistry.get(id);
}

[
  'screen-events', 'screen-feed', 'screen-directory', 'screen-register-business',
  'screen-cities', 'screen-detail', 'screen-event-detail', 'screen-publish', 'screen-admin',
  'nav-btn-events', 'nav-btn-feed', 'nav-btn-directory', 'nav-btn-register-business', 'nav-btn-publish',
  'active-events-count', 'events-loading', 'events-error', 'events-empty-state', 'public-events-grid',
  'events-recent-flyers-section', 'events-recent-flyers-grid',
  'event-detail-error', 'event-detail-error-title', 'event-detail-error-desc',
  'event-detail-content', 'event-detail-title', 'event-detail-category-badge',
  'event-detail-date', 'event-detail-review-text', 'event-detail-photo-count',
  'event-detail-gallery-grid', 'event-detail-empty-gallery',
  'modal-event-lightbox', 'lightbox-img', 'lightbox-counter', 'promotions-grid',
  'empty-state', 'active-promos-count', 'fab-publish', 'modal-all-categories'
].forEach(id => getOrCreateElement(id));

global.window = {
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false }),
  localStorage: mockLocalStorage,
  sessionStorage: mockLocalStorage,
  location: { hash: '', origin: 'https://guia7d.web.app', pathname: '/' },
  scrollTo() {}
};
global.document = {
  getElementById: (id) => getOrCreateElement(id),
  createElement: (tag) => createMockElement('', tag),
  querySelectorAll: (selector) => {
    if (selector === '.screen') {
      return [
        getOrCreateElement('screen-events'),
        getOrCreateElement('screen-feed'),
        getOrCreateElement('screen-directory'),
        getOrCreateElement('screen-register-business'),
        getOrCreateElement('screen-cities'),
        getOrCreateElement('screen-detail'),
        getOrCreateElement('screen-event-detail'),
        getOrCreateElement('screen-publish'),
        getOrCreateElement('screen-admin')
      ];
    }
    return [];
  },
  querySelector: (sel) => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  body: {
    classList: {
      add() {},
      remove() {}
    }
  }
};
global.localStorage = mockLocalStorage;
global.sessionStorage = mockLocalStorage;
global.history = {
  replaceState: (state, title, url) => {
    if (url.includes('#')) {
      global.window.location.hash = url.substring(url.indexOf('#'));
    } else {
      global.window.location.hash = '';
    }
  }
};
Object.defineProperty(globalThis, 'navigator', {
  value: {
    userAgent: 'NodeTest',
    standalone: false
  },
  configurable: true,
  writable: true
});
global.alert = () => {};
global.confirm = () => true;

// Cargar app.js en contexto
const appJsPath = path.resolve(process.cwd(), 'public/app.js');
const appJsCode = fs.readFileSync(appJsPath, 'utf8');
(0, eval)(appJsCode);

const app = global.app || window.app;
assert(app, 'El objeto app debe existir');

let passedTests = 0;
async function runTest(num, name, fn) {
  try {
    console.log(`Prueba ${num}: ${name}...`);
    await fn();
    console.log(`  ✅ Prueba ${num} SUPERADA.\n`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ Prueba ${num} FALLÓ:`, err);
    process.exit(1);
  }
}

async function runSuite() {
  // 15. Eventos antes de Ofertas en la página pública
  await runTest(15, 'Estructura HTML: Eventos aparece antes de Ofertas en la página pública', async () => {
    const eventsIdx = indexHtmlContent.indexOf('id="screen-events"');
    const feedIdx = indexHtmlContent.indexOf('id="screen-feed"');
    assert(eventsIdx !== -1, 'screen-events debe existir en index.html');
    assert(feedIdx !== -1, 'screen-feed debe existir en index.html');
    assert(eventsIdx < feedIdx, 'screen-events debe ubicarse antes de screen-feed en el DOM');
  });

  // 16. Eventos antes de Ofertas en la navegación inferior
  await runTest(16, 'Estructura HTML: Eventos como primera opción en navegación inferior antes de Ofertas', async () => {
    const bottomNavIdx = indexHtmlContent.indexOf('id="bottom-nav"');
    assert(bottomNavIdx !== -1, 'bottom-nav debe existir');
    const navSlice = indexHtmlContent.substring(bottomNavIdx);

    const btnEventsIdx = navSlice.indexOf('id="nav-btn-events"');
    const btnFeedIdx = navSlice.indexOf('id="nav-btn-feed"');
    assert(btnEventsIdx !== -1, 'nav-btn-events debe existir en bottom-nav');
    assert(btnFeedIdx !== -1, 'nav-btn-feed debe existir en bottom-nav');
    assert(btnEventsIdx < btnFeedIdx, 'nav-btn-events debe aparecer antes de nav-btn-feed');
  });

  // 17. Conservación del orden relativo de las demás opciones
  await runTest(17, 'Estructura HTML: Orden de navegación (Eventos, Ofertas, Directorio, Registrar, Publicar)', async () => {
    const bottomNavIdx = indexHtmlContent.indexOf('id="bottom-nav"');
    const navSlice = indexHtmlContent.substring(bottomNavIdx);

    const idxEvents = navSlice.indexOf('id="nav-btn-events"');
    const idxFeed = navSlice.indexOf('id="nav-btn-feed"');
    const idxDir = navSlice.indexOf('id="nav-btn-directory"');
    const idxReg = navSlice.indexOf('id="nav-btn-register-business"');
    const idxPub = navSlice.indexOf('id="nav-btn-publish"');

    assert(idxEvents < idxFeed, 'Eventos antes de Ofertas');
    assert(idxFeed < idxDir, 'Ofertas antes de Directorio');
    assert(idxDir < idxReg, 'Directorio antes de Registrar');
    assert(idxReg < idxPub, 'Registrar antes de Publicar');
  });

  // 1. Eventos activos visibles
  await runTest(1, 'Listado público: Eventos con status active son visibles en la interfaz', async () => {
    app.eventsLoaded = true;
    app.eventsLoadError = null;
    app.events = [
      { id: 'ev_act_1', title: 'Gran Fiesta de Gala', category: 'celebration', status: 'active', createdAt: 1000, photos: [{ url: 'https://r2.test/act1.webp' }] },
      { id: 'ev_act_2', title: 'Boda en Jardines', category: 'wedding', status: 'active', createdAt: 2000, photos: [{ url: 'https://r2.test/act2.webp' }] }
    ];

    app.renderPublicEvents();

    const grid = getOrCreateElement('public-events-grid');
    assert.strictEqual(grid.children.length, 2, 'Deben renderizarse exactamente los 2 eventos activos');
    const countBadge = getOrCreateElement('active-events-count');
    assert.strictEqual(countBadge.textContent, 2);
  });

  // 2. Eventos en borrador invisibles
  await runTest(2, 'Listado público: Eventos con status draft son excluidos estrictamente', async () => {
    app.events = [
      { id: 'ev_act', title: 'Evento Activo', category: 'celebration', status: 'active', createdAt: 1000, photos: [{ url: 'https://r2.test/act.webp' }] },
      { id: 'ev_draft', title: 'Evento Borrador', category: 'wedding', status: 'draft', createdAt: 2000, photos: [{ url: 'https://r2.test/draft.webp' }] }
    ];

    app.renderPublicEvents();

    const grid = getOrCreateElement('public-events-grid');
    assert.strictEqual(grid.children.length, 1, 'Solo 1 evento debe renderizarse');
    assert(grid.children[0].innerHTML.includes('Evento Activo'));
    assert(!grid.children[0].innerHTML.includes('Evento Borrador'));
  });

  // 3. Eventos archivados invisibles
  await runTest(3, 'Listado público: Eventos con status archived son excluidos', async () => {
    app.events = [
      { id: 'ev_act', title: 'Evento Activo', category: 'celebration', status: 'active', createdAt: 1000, photos: [{ url: 'https://r2.test/act.webp' }] },
      { id: 'ev_arch', title: 'Evento Archivado', category: 'wedding', status: 'archived', createdAt: 2000, photos: [{ url: 'https://r2.test/arch.webp' }] }
    ];

    app.renderPublicEvents();

    const grid = getOrCreateElement('public-events-grid');
    assert.strictEqual(grid.children.length, 1);
    assert(!grid.children[0].innerHTML.includes('Evento Archivado'));
  });

  // 4. Eventos en eliminación invisibles
  await runTest(4, 'Listado público: Eventos con status deleting son excluidos', async () => {
    app.events = [
      { id: 'ev_act', title: 'Evento Activo', category: 'celebration', status: 'active', createdAt: 1000, photos: [{ url: 'https://r2.test/act.webp' }] },
      { id: 'ev_del', title: 'Evento en Eliminación', category: 'wedding', status: 'deleting', createdAt: 2000, photos: [{ url: 'https://r2.test/del.webp' }] }
    ];

    app.renderPublicEvents();

    const grid = getOrCreateElement('public-events-grid');
    assert.strictEqual(grid.children.length, 1);
    assert(!grid.children[0].innerHTML.includes('Evento en Eliminación'));
  });

  // 5. Orden correcto de eventos
  await runTest(5, 'Orden de eventos: Ordenados del más reciente al más antiguo por createdAt', async () => {
    app.events = [
      { id: 'ev_old', title: 'Evento Antiguo', category: 'celebration', status: 'active', createdAt: 1000, photos: [{ url: 'https://r2.test/old.webp' }] },
      { id: 'ev_new', title: 'Evento Más Nuevo', category: 'wedding', status: 'active', createdAt: 3000, photos: [{ url: 'https://r2.test/new.webp' }] },
      { id: 'ev_mid', title: 'Evento Intermedio', category: 'birthday', status: 'active', createdAt: 2000, photos: [{ url: 'https://r2.test/mid.webp' }] }
    ];

    app.renderPublicEvents();

    const grid = getOrCreateElement('public-events-grid');
    assert.strictEqual(grid.children.length, 3);
    assert(grid.children[0].innerHTML.includes('Evento Más Nuevo'), 'Primero debe ser el de createdAt 3000');
    assert(grid.children[1].innerHTML.includes('Evento Intermedio'), 'Segundo debe ser el de createdAt 2000');
    assert(grid.children[2].innerHTML.includes('Evento Antiguo'), 'Tercero debe ser el de createdAt 1000');
  });

  // 6. Selección de fotografía principal
  await runTest(6, 'Fotografía principal: Primera fotografía válida seleccionada con fallback sin imagen rota', async () => {
    app.events = [
      {
        id: 'ev_photos',
        title: 'Evento con fotos',
        category: 'celebration',
        status: 'active',
        createdAt: 2000,
        photos: [
          { url: '   ' }, // Inválida
          { url: 'https://r2.test/first_valid.webp' }, // Primera válida
          { url: 'https://r2.test/second.webp' }
        ]
      },
      {
        id: 'ev_no_photos',
        title: 'Evento sin fotos',
        category: 'wedding',
        status: 'active',
        createdAt: 1000,
        photos: []
      }
    ];

    app.renderPublicEvents();

    const grid = getOrCreateElement('public-events-grid');
    const card1 = grid.children[0];
    const card2 = grid.children[1];

    assert(card1.innerHTML.includes('src="https://r2.test/first_valid.webp"'), 'Toma la primera URL válida');
    assert(!card2.innerHTML.includes('<img class="event-card-img"'), 'No genera img rota');
    assert(card2.innerHTML.includes('event-card-placeholder'), 'Genera placeholder estilizado');
  });

  // 7. Apertura y cierre del detalle
  await runTest(7, 'Detalle individual: openEventDetail muestra contenido y closeEventDetail vuelve a eventos', async () => {
    const targetEvent = {
      id: 'ev_detail_1',
      title: 'Boda Real 2026',
      category: 'wedding',
      status: 'active',
      review: 'Una noche mágica llena de amor y alegría.',
      createdAt: 1700000000000,
      photos: [
        { url: 'https://r2.test/p1.webp' },
        { url: 'https://r2.test/p2.webp' }
      ]
    };
    app.events = [targetEvent];

    app.openEventDetail('ev_detail_1');

    assert.strictEqual(app.currentScreen, 'event-detail');
    assert.strictEqual(app.currentEvent.id, 'ev_detail_1');
    assert.strictEqual(getOrCreateElement('event-detail-title').textContent, 'Boda Real 2026');
    assert.strictEqual(getOrCreateElement('event-detail-review-text').textContent, 'Una noche mágica llena de amor y alegría.');
    assert.strictEqual(getOrCreateElement('event-detail-photo-count').textContent, 2);
    assert.strictEqual(getOrCreateElement('event-detail-error').style.display, 'none');

    // Cerrar detalle
    app.closeEventDetail();
    assert.strictEqual(app.currentScreen, 'events');
    assert.strictEqual(app.currentEvent, null);
  });

  // 8. Navegación por la galería (Lightbox)
  await runTest(8, 'Galería y Lightbox: Navegación circular entre fotografías (anterior, siguiente)', async () => {
    app.currentEvent = {
      id: 'ev_lightbox_test',
      status: 'active',
      photos: [
        { url: 'https://r2.test/gal1.webp' },
        { url: 'https://r2.test/gal2.webp' },
        { url: 'https://r2.test/gal3.webp' }
      ]
    };

    app.openEventPhotoLightbox(0);
    assert.strictEqual(app.currentLightboxPhotoIndex, 0);
    assert.strictEqual(getOrCreateElement('lightbox-img').src, 'https://r2.test/gal1.webp');
    assert.strictEqual(getOrCreateElement('lightbox-counter').textContent, 'Foto 1 de 3');

    // Siguiente foto
    app.nextEventPhoto();
    assert.strictEqual(app.currentLightboxPhotoIndex, 1);
    assert.strictEqual(getOrCreateElement('lightbox-img').src, 'https://r2.test/gal2.webp');

    // Siguiente a la última y dar la vuelta (circular)
    app.nextEventPhoto();
    assert.strictEqual(app.currentLightboxPhotoIndex, 2);
    app.nextEventPhoto();
    assert.strictEqual(app.currentLightboxPhotoIndex, 0); // Vuelve al inicio

    // Anterior (circular hacia atrás)
    app.prevEventPhoto();
    assert.strictEqual(app.currentLightboxPhotoIndex, 2);

    app.closeEventPhotoLightbox();
    assert.strictEqual(getOrCreateElement('modal-event-lightbox').style.display, 'none');
  });

  // 9. Compartir mediante Web Share API
  await runTest(9, 'Compartir evento: Utiliza Web Share API con título, texto y URL canónica', async () => {
    let sharedData = null;
    global.navigator.share = async (data) => {
      sharedData = data;
      return Promise.resolve();
    };

    const evt = {
      id: 'ev_share_test',
      title: 'Festival Musical de Primavera',
      category: 'celebration',
      review: 'Música en vivo y gastronomía local.',
      status: 'active'
    };

    await app.shareEvent(evt);

    assert(sharedData !== null, 'navigator.share debe ser invocado');
    assert(sharedData.url.includes('#event=ev_share_test'), 'Debe incluir enlace canónico con hash #event=');
    assert(sharedData.title.includes('Festival Musical'), 'Debe incluir el título del evento');
  });

  // 10. Alternativa de copia de enlace
  await runTest(10, 'Compartir evento: Alternativa de copia al portapapeles si Web Share falla', async () => {
    global.navigator.share = null; // No disponible
    let clipboardText = null;
    global.navigator.clipboard = {
      writeText: async (txt) => {
        clipboardText = txt;
        return Promise.resolve();
      }
    };

    let toastShown = null;
    app.showToast = (msg) => { toastShown = msg; };

    const evt = { id: 'ev_clip_test', title: 'Boda Elegante', category: 'wedding', status: 'active' };
    await app.shareEvent(evt);

    assert(clipboardText !== null, 'Debe llamar a clipboard.writeText');
    assert(clipboardText.includes('#event=ev_clip_test'));
    assert(toastShown && toastShown.includes('copiado'), 'Debe emitir feedback visual al usuario');
  });

  // 11. Evento inexistente o no activo
  await runTest(11, 'Detalle: Manejo de evento no encontrado o que dejó de estar activo', async () => {
    app.events = [
      { id: 'ev_draft_hidden', title: 'Borrador Oculto', status: 'draft' }
    ];

    // Intentar abrir evento que no existe
    app.openEventDetail('ev_unexistent_999');
    assert.strictEqual(app.currentScreen, 'event-detail');
    assert.strictEqual(getOrCreateElement('event-detail-error').style.display, 'block');
    assert.strictEqual(getOrCreateElement('event-detail-content').style.display, 'none');

    // Intentar abrir evento con status !== 'active'
    app.openEventDetail('ev_draft_hidden');
    assert.strictEqual(app.currentScreen, 'event-detail');
    assert.strictEqual(getOrCreateElement('event-detail-error').style.display, 'block');
    assert.strictEqual(getOrCreateElement('event-detail-content').style.display, 'none');
  });

  // 12. Listado vacío y errores de lectura
  await runTest(12, 'Estados de interfaz: Listado vacío y error de lectura en Firestore', async () => {
    // Caso vacío
    app.eventsLoaded = true;
    app.eventsLoadError = null;
    app.events = [];
    app.renderPublicEvents();

    assert.strictEqual(getOrCreateElement('events-empty-state').style.display, 'block');
    assert.strictEqual(getOrCreateElement('events-loading').style.display, 'none');
    assert.strictEqual(getOrCreateElement('events-error').style.display, 'none');

    // Caso error de lectura
    app.eventsLoaded = true;
    app.eventsLoadError = new Error('Permission denied');
    app.renderPublicEvents();

    assert.strictEqual(getOrCreateElement('events-error').style.display, 'block');
    assert.strictEqual(getOrCreateElement('events-empty-state').style.display, 'none');
  });

  // 13. Exactamente cinco flyers activos como máximo
  await runTest(13, 'Integración de flyers: Máximo 5 flyers activos mostrados bajo eventos', async () => {
    const now = Date.now();
    app.promotions = [
      { id: 'f1', title: 'Flyer 1', status: 'active', createdAt: 100 },
      { id: 'f2', title: 'Flyer 2', status: 'active', createdAt: 200 },
      { id: 'f3', title: 'Flyer 3', status: 'active', createdAt: 300 },
      { id: 'f4', title: 'Flyer 4', status: 'active', createdAt: 400 },
      { id: 'f5', title: 'Flyer 5', status: 'active', createdAt: 500 },
      { id: 'f6', title: 'Flyer 6', status: 'active', createdAt: 600 },
      { id: 'f7', title: 'Flyer 7', status: 'active', createdAt: 700 },
      { id: 'f8', title: 'Flyer 8', status: 'active', createdAt: 800 }
    ];

    app.renderRecentFlyersForEvents();

    const grid = getOrCreateElement('events-recent-flyers-grid');
    assert.strictEqual(grid.children.length, 5, 'Debe limitar estrictamente a 5 flyers');
  });

  // 14. Orden correcto de flyers
  await runTest(14, 'Integración de flyers: Ordenados del más nuevo al más antiguo', async () => {
    const grid = getOrCreateElement('events-recent-flyers-grid');
    // Del test anterior con 8 flyers, los 5 primeros deben ser 8, 7, 6, 5, 4
    assert(grid.children[0].innerHTML.includes('Flyer 8'), 'Primero debe ser el más nuevo (createdAt 800)');
    assert(grid.children[1].innerHTML.includes('Flyer 7'));
    assert(grid.children[2].innerHTML.includes('Flyer 6'));
    assert(grid.children[3].innerHTML.includes('Flyer 5'));
    assert(grid.children[4].innerHTML.includes('Flyer 4'));
  });

  // 18. Regresión de Ofertas y demás secciones públicas
  await runTest(18, 'Regresión: Navegación y pantallas existentes (feed, directory, publish) intactas', async () => {
    app.showScreen('feed');
    assert.strictEqual(app.currentScreen, 'feed');
    assert(getOrCreateElement('nav-btn-feed').classList.contains('active'));
    assert(!getOrCreateElement('nav-btn-events').classList.contains('active'));

    app.showScreen('directory');
    assert.strictEqual(app.currentScreen, 'directory');
    assert(getOrCreateElement('nav-btn-directory').classList.contains('active'));

    app.showScreen('events');
    assert.strictEqual(app.currentScreen, 'events');
    assert(getOrCreateElement('nav-btn-events').classList.contains('active'));

    // Verificar que las funciones de flyers no fueron alteradas
    assert.strictEqual(typeof convertImageToWebP, 'function');
    assert.strictEqual(typeof uploadFlyerToR2, 'function');
    assert.strictEqual(typeof deleteR2File, 'function');
    assert.strictEqual(typeof app.openAdminEventModal, 'function');
  });

  console.log(`\n🎉 RESULTADO FINAL: ${passedTests} de 18 pruebas superadas exitosamente (100%).`);
}

runSuite().catch(e => {
  console.error('Error fatal en runner:', e);
  process.exit(1);
});
