import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('🧪 Iniciando verificación de persistencia estricta en Firestore para Eventos...\n');

const appJsPath = path.resolve(process.cwd(), 'public/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

// 1. Simulación de entorno DOM y Storage
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
    innerHTML: '',
    style: {},
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
      toggle(c, f) { if (f ?? !this._classes.has(c)) { this._classes.add(c); return true; } this._classes.delete(c); return false; }
    },
    disabled: false,
    children: [],
    appendChild(c) { this.children.push(c); return c; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    setAttribute() {},
    getAttribute() { return null; },
    dispatchEvent() {}
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
  'event-title-input', 'event-category-input', 'event-review-input', 'btn-save-event', 'event-form-error',
  'modal-admin-event', 'admin-events-list', 'admin-events-badge',
  'event-upload-progress-box', 'event-upload-progress-label', 'event-upload-progress-percent', 'event-upload-progress-bar'
].forEach(id => getOrCreateElement(id));

global.localStorage = mockLocalStorage;
global.sessionStorage = mockLocalStorage;
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
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  body: createMockElement('body')
};
try {
  Object.defineProperty(global, 'navigator', {
    value: { onLine: true },
    configurable: true,
    writable: true
  });
} catch (e) {}
global.URL = {
  createObjectURL: () => 'blob:mock-preview-url',
  revokeObjectURL: () => {}
};
global.fetch = async () => ({
  ok: true,
  json: async () => ({ ok: true, success: true })
});

// Fábrica de Sandbox para aislar tests
function createSandbox(customDb) {
  const sanitizedContent = appJsContent.replace('let db = null;', 'let db = injectedDb;');
  const wrappedCode = `
    ${sanitizedContent}
    return {
      app,
      FIRESTORE_PROMOTIONS_COLLECTION,
      FIRESTORE_EVENTS_COLLECTION,
      EVENT_CATEGORIES,
      convertImageToWebP,
      uploadFlyerToR2
    };
  `;
  const sandboxFn = new Function('injectedDb', wrappedCode);
  return sandboxFn(customDb);
}

let passedTests = 0;
async function runAsyncTest(title, fn) {
  try {
    process.stdout.write(`Prueba: ${title}... `);
    await fn();
    console.log('✅ SUPERADA');
    passedTests++;
  } catch (err) {
    console.log('❌ FALLÓ');
    console.error(err);
    process.exit(1);
  }
}

async function runAll() {
  console.log('=== VERIFICACIÓN 1: Regresión de Colecciones y Flyers ===');
  
  await runAsyncTest('1.1. Colección de Flyers en "promotions" y Eventos en "events"', async () => {
    const { FIRESTORE_PROMOTIONS_COLLECTION, FIRESTORE_EVENTS_COLLECTION } = createSandbox(null);
    assert.strictEqual(FIRESTORE_PROMOTIONS_COLLECTION, 'promotions');
    assert.strictEqual(FIRESTORE_EVENTS_COLLECTION, 'events');
  });

  console.log('\n=== VERIFICACIÓN 2: Casos de Persistencia en Firestore ===');

  await runAsyncTest('2.1. Firebase disponible y guardado exitoso (documento persistido en Firestore y app.events)', async () => {
    const firestoreEvents = new Map();
    const mockDb = {
      collection(col) {
        assert.strictEqual(col, 'events');
        return {
          doc(docId) {
            return {
              async set(payload) {
                firestoreEvents.set(docId, JSON.parse(JSON.stringify(payload)));
                return Promise.resolve();
              }
            };
          }
        };
      }
    };

    const { app } = createSandbox(mockDb);
    app.events = [];
    app.currentEditingEventId = null;
    app.activeEventQueue = {
      items: [{ status: 'completed', url: 'https://r2.7dapp.com/foto1.webp' }],
      getCompletedPhotos: () => [{ id: 'p1', name: 'foto1.webp', url: 'https://r2.7dapp.com/foto1.webp', order: 0 }],
      processQueue: async () => ({ failed: 0 })
    };

    getOrCreateElement('event-title-input').value = 'Gala Anual 2026';
    getOrCreateElement('event-category-input').value = 'corporate';
    getOrCreateElement('event-review-input').value = 'Excelente velada empresarial.';
    const errBox = getOrCreateElement('event-form-error');
    errBox.style.display = 'none';

    await app.handleAdminEventSubmit({ preventDefault() {} });

    // Verificaciones:
    // 1. Guardado en Firestore
    assert.strictEqual(firestoreEvents.size, 1);
    const savedDoc = Array.from(firestoreEvents.values())[0];
    assert.strictEqual(savedDoc.title, 'Gala Anual 2026');
    assert.strictEqual(savedDoc.status, 'active');

    // 2. Agregado al estado en memoria tras confirmación
    assert.strictEqual(app.events.length, 1);
    assert.strictEqual(app.events[0].title, 'Gala Anual 2026');

    // 3. Cola de fotos de sesión reseteada
    assert.strictEqual(app.activeEventQueue, null);

    // 4. Sin errores en errBox
    assert.strictEqual(errBox.style.display, 'none');
  });

  await runAsyncTest('2.2. Firebase no inicializado (db = null: rechazo, sin modificar app.events ni limpiar cola)', async () => {
    const { app } = createSandbox(null);
    app.events = [];
    const photoQueue = {
      items: [{ status: 'completed', url: 'https://r2.7dapp.com/foto1.webp' }],
      getCompletedPhotos: () => [{ id: 'p1', name: 'foto1.webp', url: 'https://r2.7dapp.com/foto1.webp', order: 0 }],
      processQueue: async () => ({ failed: 0 })
    };
    app.activeEventQueue = photoQueue;

    getOrCreateElement('event-title-input').value = 'Evento Sin DB';
    getOrCreateElement('event-category-input').value = 'social';
    getOrCreateElement('event-review-input').value = 'Intento de guardar sin Firebase.';
    const errBox = getOrCreateElement('event-form-error');

    await app.handleAdminEventSubmit({ preventDefault() {} });

    // Verificaciones:
    // 1. app.events NO debe modificarse
    assert.strictEqual(app.events.length, 0, 'app.events no debe contener eventos si db es null');

    // 2. activeEventQueue NO debe haberse limpiado (usuario no pierde fotos)
    assert.strictEqual(app.activeEventQueue, photoQueue);

    // 3. Error claro mostrado en errBox
    assert.strictEqual(errBox.style.display, 'block');
    assert(errBox.textContent.includes('no está inicializada') || errBox.textContent.includes('no se encuentra disponible'));
  });

  await runAsyncTest('2.3. Error de permisos (permission-denied: rechazo, sin modificar app.events ni limpiar cola)', async () => {
    const mockDb = {
      collection(col) {
        return {
          doc() {
            return {
              async set() {
                const permErr = new Error('Missing or insufficient permissions.');
                permErr.code = 'permission-denied';
                throw permErr;
              }
            };
          }
        };
      }
    };

    const { app } = createSandbox(mockDb);
    app.events = [];
    const photoQueue = {
      items: [{ status: 'completed', url: 'https://r2.7dapp.com/foto1.webp' }],
      getCompletedPhotos: () => [{ id: 'p1', name: 'foto1.webp', url: 'https://r2.7dapp.com/foto1.webp', order: 0 }],
      processQueue: async () => ({ failed: 0 })
    };
    app.activeEventQueue = photoQueue;

    getOrCreateElement('event-title-input').value = 'Evento Permiso Denegado';
    getOrCreateElement('event-category-input').value = 'sports';
    getOrCreateElement('event-review-input').value = 'Intento con reglas bloqueadas.';
    const errBox = getOrCreateElement('event-form-error');

    await app.handleAdminEventSubmit({ preventDefault() {} });

    // Verificaciones:
    assert.strictEqual(app.events.length, 0, 'No debe guardarse localmente si Firestore deniega permisos');
    assert.strictEqual(app.activeEventQueue, photoQueue, 'La cola de fotos debe preservarse ante error de permisos');
    assert.strictEqual(errBox.style.display, 'block');
    assert(errBox.textContent.includes('Permiso denegado') || errBox.textContent.includes('reglas de seguridad'));
  });

  await runAsyncTest('2.4. Error de red o conexión (network-error: rechazo, sin modificar app.events ni limpiar cola)', async () => {
    const mockDb = {
      collection(col) {
        return {
          doc() {
            return {
              async set() {
                throw new Error('Network request failed: timeout');
              }
            };
          }
        };
      }
    };

    const { app } = createSandbox(mockDb);
    app.events = [];
    const photoQueue = {
      items: [{ status: 'completed', url: 'https://r2.7dapp.com/foto1.webp' }],
      getCompletedPhotos: () => [{ id: 'p1', name: 'foto1.webp', url: 'https://r2.7dapp.com/foto1.webp', order: 0 }],
      processQueue: async () => ({ failed: 0 })
    };
    app.activeEventQueue = photoQueue;

    getOrCreateElement('event-title-input').value = 'Evento Error Conexión';
    getOrCreateElement('event-category-input').value = 'culture';
    getOrCreateElement('event-review-input').value = 'Intento con caída de internet.';
    const errBox = getOrCreateElement('event-form-error');

    await app.handleAdminEventSubmit({ preventDefault() {} });

    // Verificaciones:
    assert.strictEqual(app.events.length, 0, 'No debe guardarse localmente si Firestore falla por red');
    assert.strictEqual(app.activeEventQueue, photoQueue, 'La cola de fotos debe preservarse ante error de red');
    assert.strictEqual(errBox.style.display, 'block');
    assert(errBox.textContent.includes('Network request failed') || errBox.textContent.includes('servidor'));
  });

  await runAsyncTest('2.5. Intento de doble envío concurrente (reentrancia / debounce)', async () => {
    let setCalls = 0;
    let finishSetPromise;
    const pendingPromise = new Promise(resolve => { finishSetPromise = resolve; });

    const mockDb = {
      collection() {
        return {
          doc() {
            return {
              async set() {
                setCalls++;
                await pendingPromise;
                return Promise.resolve();
              }
            };
          }
        };
      }
    };

    const { app } = createSandbox(mockDb);
    app.events = [];
    app.activeEventQueue = {
      items: [{ status: 'completed', url: 'https://r2.7dapp.com/foto1.webp' }],
      getCompletedPhotos: () => [{ id: 'p1', name: 'foto1.webp', url: 'https://r2.7dapp.com/foto1.webp', order: 0 }],
      processQueue: async () => ({ failed: 0 })
    };

    getOrCreateElement('event-title-input').value = 'Evento Doble Clic';
    getOrCreateElement('event-category-input').value = 'corporate';
    getOrCreateElement('event-review-input').value = 'Prueba de concurrencia.';

    // Primer envío (queda esperando pendingPromise)
    const p1 = app.handleAdminEventSubmit({ preventDefault() {} });
    assert.strictEqual(app.isSubmittingEvent, true, 'El flag isSubmittingEvent debe estar activo');

    // Segundo envío concurrente mientras el primero sigue en vuelo
    const p2 = app.handleAdminEventSubmit({ preventDefault() {} });

    // Liberar la promesa del primer envío
    finishSetPromise();
    await Promise.all([p1, p2]);

    // Verificaciones:
    assert.strictEqual(setCalls, 1, 'Firestore .set() solo debió ser invocado una única vez');
    assert.strictEqual(app.events.length, 1, 'Solo 1 evento debe haber sido guardado');
    assert.strictEqual(app.isSubmittingEvent, false, 'El flag isSubmittingEvent debe liberarse al terminar');
  });

  await runAsyncTest('2.6. Edición preserva createdAt, authorUid y authorEmail originales', async () => {
    const existingDoc = {
      id: 'evt_existing_123',
      title: 'Título Antiguo',
      category: 'wedding',
      categoryLabel: 'Boda',
      review: 'Reseña original.',
      photos: [{ id: 'p1', name: 'f1.jpg', url: 'https://r2.7dapp.com/f1.webp' }],
      status: 'active',
      createdAt: 1680000000000,
      authorUid: 'admin-original-999',
      authorEmail: 'creador.original@7dapp.com'
    };

    let updatedPayload = null;
    const mockDb = {
      collection(col) {
        assert.strictEqual(col, 'events');
        return {
          doc(id) {
            return {
              async set(payload) {
                updatedPayload = payload;
                return Promise.resolve();
              }
            };
          }
        };
      }
    };

    const { app } = createSandbox(mockDb);
    app.events = [existingDoc];
    app.currentEditingEventId = existingDoc.id;
    app.activeEventQueue = {
      items: [{ status: 'completed', url: 'https://r2.7dapp.com/f2.webp' }],
      getCompletedPhotos: () => [{ id: 'p2', name: 'f2.jpg', url: 'https://r2.7dapp.com/f2.webp', order: 0 }],
      processQueue: async () => ({ failed: 0 })
    };
    app.adminAuth = {
      currentUser: {
        uid: 'otro-admin-456',
        email: 'otro-admin@7dapp.com'
      }
    };

    getOrCreateElement('event-title-input').value = 'Título Editado 2026';
    getOrCreateElement('event-category-input').value = 'wedding';
    getOrCreateElement('event-review-input').value = 'Reseña editada.';

    await app.handleAdminEventSubmit({ preventDefault() {} });

    // Verificaciones:
    assert(updatedPayload !== null, 'Debe haber guardado el payload');
    assert.strictEqual(updatedPayload.title, 'Título Editado 2026');
    assert.strictEqual(updatedPayload.createdAt, 1680000000000, 'createdAt original debe preservarse intacto');
    assert.strictEqual(updatedPayload.authorUid, 'admin-original-999', 'authorUid original debe preservarse intacto');
    assert.strictEqual(updatedPayload.authorEmail, 'creador.original@7dapp.com', 'authorEmail original debe preservarse intacto');
    assert(updatedPayload.updatedAt > 1680000000000, 'updatedAt debe haberse actualizado');

    const inMemory = app.events.find(e => e.id === existingDoc.id);
    assert.strictEqual(inMemory.createdAt, 1680000000000);
    assert.strictEqual(inMemory.authorUid, 'admin-original-999');
    assert.strictEqual(inMemory.authorEmail, 'creador.original@7dapp.com');
  });

  await runAsyncTest('2.7. Sincronización en tiempo real lee exclusivamente de la colección "events"', async () => {
    const queriedCollections = new Set();
    let eventsOnSnapshotRegistered = false;

    const mockDb = {
      collection(col) {
        queriedCollections.add(col);
        return {
          doc(id) {
            return {
              onSnapshot(cb) { return () => {}; },
              get() { return Promise.resolve({ exists: false }); }
            };
          },
          onSnapshot(successCb, errorCb) {
            if (col === 'events') {
              eventsOnSnapshotRegistered = true;
            }
            return () => {};
          }
        };
      }
    };

    const { app } = createSandbox(mockDb);
    if (typeof app.initFirestoreSync === 'function') {
      app.initFirestoreSync();
    }
    assert(typeof app.syncEvents === 'function', 'app.syncEvents debe ser una función tras inicialización');

    // Ejecutar sincronización de eventos
    app.syncEvents();

    assert(queriedCollections.has('events'), 'syncEvents debe consultar estrictamente la colección events');
    assert.strictEqual(eventsOnSnapshotRegistered, true, 'syncEvents debe registrar el listener onSnapshot en events');
  });

  console.log(`\n🎉 RESULTADO FINAL: ${passedTests} de 7 pruebas de persistencia y robustez superadas exitosamente (100%).`);
  process.exit(0);
}

runAll().catch(e => {
  console.error('Error no controlado en suite:', e);
  process.exit(1);
});
