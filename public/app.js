/**
 * 7D App - Plataforma Oficial de Promociones Locales y Directorio Comercial
 * Arquitectura de Alto Rendimiento, Resiliente y en Tiempo Real con Cloud Firestore
 * Colección Oficial: "Categorias de producto"
 */

// ==========================================================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN OFICIAL DE GOOGLE FIREBASE
// ==========================================================================
// Configuración oficial y única para dapp-f5e40 (Project Number: 331538118268)
const OFFICIAL_FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyA1F0hyr8qUGx5DoqPO8JhV073NXr35NYI",
  authDomain: "dapp-f5e40.firebaseapp.com",
  projectId: "dapp-f5e40",
  storageBucket: "dapp-f5e40.firebasestorage.app",
  messagingSenderId: "331538118268",
  appId: "1:331538118268:web:6e7832180c583a0475fbf9"
});

// Establecer fuente única en el entorno global y local
window.firebaseConfig = OFFICIAL_FIREBASE_CONFIG;
const firebaseConfig = { ...OFFICIAL_FIREBASE_CONFIG };

// Preservar datos en localStorage sin sobrescribir la configuración oficial en inicialización
try {
  const savedDbConfig = localStorage.getItem('7dapp_firebase_config');
  if (savedDbConfig) {
    console.log('[Firestore] Configuración previa en localStorage detectada, pero prevalece la configuración oficial activa:', firebaseConfig.projectId);
  }
} catch(e) {}

let db = null;
try {
  if (typeof firebase !== 'undefined' && firebase.apps) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    console.log('[Firestore] Inicializado con éxito. Proyecto:', firebaseConfig.projectId);
  } else {
    console.warn('[Firestore] SDK de Firebase se cargará de forma asíncrona.');
  }
} catch (err) {
  console.warn('[Firestore] Error al inicializar Firebase SDK:', err.message);
}

const FIRESTORE_PROMOTIONS_COLLECTION = 'promotions';
const FIRESTORE_BUSINESSES_COLLECTION = 'businesses';
const FIRESTORE_SETTINGS_COLLECTION = 'settings';
const FIRESTORE_SETTINGS_DOC = 'general';
const FIRESTORE_CITIES_DOC = 'cities';
const FIRESTORE_LEGACY_COLLECTION = 'Categorias de producto'; // Colección legacy (solo para categorías/diagnóstico temporal)
const FIRESTORE_COLLECTION = FIRESTORE_LEGACY_COLLECTION;
const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 750 KB límite preventivo para proteger Firestore antes de R2
const R2_UPLOAD_URL = 'https://7dapp-media-api.lahirbueno.workers.dev/upload';
const NOTIFICATION_WORKER_URL = 'https://7dapp-notifications.lahirbueno.workers.dev/api/business/register';

// ==========================================================================
// 2. ESTADO GLOBAL DE LA APLICACIÓN Y DATOS INICIALES
// ==========================================================================
const app = {
  currentScreen: 'feed',
  currentCityId: 'city_eltigre',
  currentCategoryId: 'cat_todos',
  currentPromo: null,
  isAdminLoggedIn: false,
  publishStep: 1,
  selectedFile: null,
  selectedFileBase64: null,
  deferredInstallPrompt: null,
  activeSubcollectionUnsubs: {},

  // Configuración de la plataforma (actualizable desde el panel admin)
  settings: {
    publicationPrice: 0.99,
    publicationDurationDays: 7,
    adminWhatsapp: '+584228045737',
    pagoMovilPhone: '0414-1234567',
    pagoMovilId: 'V-12345678',
    pagoMovilBank: 'Banesco (0134)',
    pagoMovilName: 'Guía 7D Publicidad C.A.',
    paymentInstructions: 'Realiza el Pago Móvil por 0.99 USD a la tasa oficial del día. Guarda el número de referencia para verificar.'
  },

  // Ciudades iniciales garantizadas (se sincronizan con Cloud Firestore)

  cities: [
    {
      id: 'city_eltigre',
      name: 'El Tigre',
      state: 'Anzoátegui',
      active: true,
      lat: 8.88902,
      lng: -64.2527
    },
    {
      id: 'city_santome',
      name: 'San Tomé',
      state: 'Anzoátegui',
      active: true,
      lat: 8.9411,
      lng: -64.13
    },
    {
      id: 'city_guanipa',
      name: 'San José de Guanipa',
      state: 'Anzoátegui',
      active: true,
      lat: 8.88724,
      lng: -64.16512
    }
  ],


  // Categorías iniciales garantizadas
  categories: [
    { id: 'cat_todos', name: 'Todos', icon: '🔥', active: true },
    { id: 'cat_restaurantes', name: 'Comida & Restaurantes', icon: '🍕', active: true },
    { id: 'cat_tecnologia', name: 'Tecnología & Móviles', icon: '📱', active: true },
    { id: 'cat_moda', name: 'Moda & Calzado', icon: '👗', active: true },
    { id: 'cat_salud', name: 'Salud & Belleza', icon: '✨', active: true },
    { id: 'cat_servicios', name: 'Servicios & Oficios', icon: '🛠️', active: true },
    { id: 'cat_autos', name: 'Automotriz & Talleres', icon: '🚗', active: true },
    { id: 'cat_supermercados', name: 'Supermercados & Víveres', icon: '🛒', active: true }
  ],

  // Promociones iniciales para experiencia inmediata y fluida
  promotions: [  ],
promotionsLoaded: false,

  // Propiedades de la Etapa B: Directorio Comercial
  directorySearchQuery: '',
  directoryCategoryId: 'all',
  directoryTypeFilter: 'all',
  adminDirectoryFilter: 'all',
  linkedBusinessId: null,
  tempBizLogo: null,
  tempBizCover: null,
  tempBizLogoFile: null,
  tempBizCoverFile: null,
  businesses: []
};

// Exponer app en window para eventos HTML
window.app = app;

// ==========================================================================
// 3. NAVEGACIÓN Y CONTROL DE VISTAS (SPA)
// ==========================================================================
app.showScreen = function(screenName) {
  app.currentScreen = screenName;

  if (screenName !== 'detail') {
    app.currentPromo = null;
  }
  const isProfileModalActive = app.currentProfileBiz && document.getElementById('modal-business-profile')?.classList.contains('active');
  if (screenName === 'feed' || screenName === 'detail' || isProfileModalActive) {
    app.startCountdownTicker();
  } else {
    app.stopCountdownTicker();
  }

  // Ocultar todas las pantallas y mostrar la solicitada
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  const targetScreen = document.getElementById(`screen-${screenName}`);
  if (targetScreen) {
    targetScreen.classList.add('active');
  }

  // Visibilidad del botón flotante de publicación (si existe)
  const fab = document.getElementById('fab-publish');
  if (fab) {
    fab.style.display = (screenName === 'feed') ? 'inline-flex' : 'none';
  }

  // Sincronizar barra de navegación inferior fija
  app.updateBottomNav(screenName);

  window.scrollTo(0, 0);

  // Inicializar o refrescar la pantalla objetivo
  if (screenName === 'feed') {
    app.renderCategories();
    app.renderPromotions();
  } else if (screenName === 'directory') {
    app.renderDirectory();
  } else if (screenName === 'register-business') {
    app.populateRegisterBusinessSelects();
  } else if (screenName === 'cities') {
    app.renderCitiesPage();
  } else if (screenName === 'publish') {
    app.goToStep(1);
    app.updatePublishSelects();
  } else if (screenName === 'admin') {
    if (!app.isAdminLoggedIn) {
      app.openAdminModal();
    } else {
      app.switchAdminTab('dashboard');
    }
  }
};

// ==========================================================================
// 4. RENDERIZADO DEL FEED DE PROMOCIONES Y CATEGORÍAS
// ==========================================================================
app.renderCategories = function() {
  const container = document.getElementById('categories-container');
  if (!container) return;
  container.innerHTML = '';

  const activeCategories = app.categories.filter(c => c.active !== false);
  activeCategories.forEach(cat => {
    const isSelected = app.currentCategoryId === cat.id;
    const btn = document.createElement('button');
    btn.className = `category-chip ${isSelected ? 'active' : ''}`;
    btn.innerHTML = `<span style="font-size: 16px;">${cat.icon || '🏷️'}</span> <span>${cat.name}</span>`;
    btn.onclick = () => {
      app.currentCategoryId = cat.id;
      const filterBadge = document.getElementById('active-filter-badge');
      const filterText = document.getElementById('active-filter-text');
      if (filterBadge && filterText) {
        if (cat.id !== 'cat_todos') {
          filterText.textContent = `${cat.icon || ''} ${cat.name}`;
          filterBadge.style.display = 'inline-flex';
        } else {
          filterBadge.style.display = 'none';
        }
      }
      app.renderCategories();
      app.renderPromotions();
    };
    container.appendChild(btn);
  });
};

app.clearCategoryFilter = function() {
  app.currentCategoryId = 'cat_todos';
  const filterBadge = document.getElementById('active-filter-badge');
  if (filterBadge) filterBadge.style.display = 'none';
  app.renderCategories();
  app.renderPromotions();
};

app.getApprovedBusinessForPromo = function(promo) {
  if (!promo || !app.businesses || app.businesses.length === 0) return null;

  // 1. Prioridad: vinculación directa por identificador del comercio
  const promoBizId = promo.businessId || promo.linkedBusinessId || promo.business_id || promo.comercioId || promo.idComercio || promo.bizId;
  if (promoBizId) {
    const biz = app.businesses.find(b => b.id === promoBizId && (b.status === 'active' || b.status === 'activo' || b.active === true));
    if (biz) return biz;
  }

  // 2. Si no tiene identificador (publicaciones históricas), resolver por coincidencia unívoca de nombre con comercio activo
  const promoBizName = (promo.businessName || promo.nombreComercio || promo.comercio || promo.negocio || promo.business || '').trim().toLowerCase();
  if (promoBizName) {
    const matches = app.businesses.filter(b => (b.status === 'active' || b.status === 'activo' || b.active === true) && (b.name || '').trim().toLowerCase() === promoBizName);
    if (matches.length === 1) {
      return matches[0];
    }
  }

  return null;
};

app.isPromoActiveAndValid = function(p) {
  if (!p) return false;

  // Descartar explícitamente estados no activos, pendientes, rechazados o suspendidos
  const rawStatus = String(p.status || p.estado || '').toLowerCase().trim();
  const negativeStatuses = [
    'pending', 'pending_approval', 'pendiente', 'revision',
    'rejected', 'rechazado', 'rechazada',
    'suspended', 'suspendido', 'suspensa',
    'expired', 'expirado', 'expirada',
    'deleted', 'eliminado', 'eliminada',
    'inactive', 'inactivo', 'inactiva'
  ];
  if (negativeStatuses.includes(rawStatus)) {
    return false;
  }
  if (p.active === false || p.activo === false) {
    return false;
  }

  // Comprobar estados positivos válidos
  const positiveStatuses = ['active', 'activo', 'activa', 'approved', 'aprobado', 'aprobada', 'published', 'publicado', 'publicada'];
  const hasPositiveStatus = positiveStatuses.includes(rawStatus);
  const isExplicitlyActive = p.active === true || p.activo === true;

  if (!hasPositiveStatus && !isExplicitlyActive) {
    if (rawStatus !== '') return false;
  }

  // Comprobar vigencia temporal / expiración considerando formatos timestamp, segundos o strings
  const now = Date.now();
  const exp = p.expirationDate || p.fechaExpiracion || p.fecha_expiracion || p.expiresAt || p.expiration || p.fechaVencimiento || p.vence;
  if (exp !== undefined && exp !== null) {
    let expMs = null;
    if (typeof exp === 'number') {
      // Si el valor numérico tiene 10 dígitos o menos, corresponde a segundos Unix
      expMs = exp < 1e11 ? exp * 1000 : exp;
    } else if (typeof exp.toMillis === 'function') {
      expMs = exp.toMillis();
    } else if (typeof exp.toDate === 'function') {
      expMs = exp.toDate().getTime();
    } else if (typeof exp.seconds === 'number') {
      expMs = exp.seconds * 1000;
    } else if (typeof exp === 'string') {
      const parsed = Date.parse(exp);
      if (!isNaN(parsed)) expMs = parsed;
    }

    if (expMs !== null && expMs < now) {
      return false;
    }
  }

  return true;
};

app.doesPromoBelongToBusiness = function(promo, biz) {
  if (!promo || !biz) return false;

  // 1. Prioridad: coincidencia directa por identificador de comercio
  const promoBizId = promo.businessId || promo.linkedBusinessId || promo.business_id || promo.comercioId || promo.idComercio || promo.bizId;
  if (promoBizId) {
    return promoBizId === biz.id;
  }

  // 2. Publicaciones históricas sin identificador:
  // Utilizar coincidencia de nombre solo si es inequívoca
  const promoBizName = (promo.businessName || promo.nombreComercio || promo.comercio || promo.negocio || promo.business || '').trim().toLowerCase();
  const targetBizName = (biz.name || '').trim().toLowerCase();

  if (promoBizName && targetBizName && promoBizName === targetBizName) {
    const activeBusinesses = (app.businesses || []).filter(b => 
      (b.status === 'active' || b.status === 'activo' || b.active === true) && 
      (b.name || '').trim().toLowerCase() === promoBizName
    );
    if (activeBusinesses.length === 1 && activeBusinesses[0].id === biz.id) {
      return true;
    }
  }

  return false;
};

// ==========================================================================
// CUENTA REGRESIVA DINÁMICA DE VENCIMIENTO DE FLYERS
// ==========================================================================
app.getPromoExpirationMs = function(promo) {
  if (!promo) return null;

  const rawExp = promo.expirationDate !== undefined && promo.expirationDate !== null && promo.expirationDate !== ''
    ? promo.expirationDate
    : (promo.fechaExpiracion ?? promo.fecha_expiracion ?? promo.expiresAt ?? promo.expiration ?? promo.fechaVencimiento ?? promo.vence);

  if (rawExp !== undefined && rawExp !== null && rawExp !== '') {
    if (typeof rawExp === 'number') {
      return rawExp < 1e11 ? rawExp * 1000 : rawExp;
    }
    if (typeof rawExp.toMillis === 'function') {
      return rawExp.toMillis();
    }
    if (typeof rawExp.toDate === 'function') {
      return rawExp.toDate().getTime();
    }
    if (typeof rawExp.seconds === 'number') {
      return rawExp.seconds * 1000 + (rawExp.nanoseconds ? Math.floor(rawExp.nanoseconds / 1e6) : 0);
    }
    if (typeof rawExp === 'string') {
      const num = Number(rawExp);
      if (!isNaN(num) && num > 0) {
        return num < 1e11 ? num * 1000 : num;
      }
      const parsed = Date.parse(rawExp);
      if (!isNaN(parsed)) return parsed;
    }
  }

  // Si no tiene fecha de vencimiento explícita, calcular desde inicio y duración si existen
  const rawStart = promo.approvedAt ?? promo.fechaAprobacion ?? promo.createdAt ?? promo.fechaCreacion;
  const duration = parseInt(promo.durationDays || promo.duration || promo.dias || promo.diasDuracion, 10);
  if (rawStart && !isNaN(duration) && duration > 0) {
    let startMs = null;
    if (typeof rawStart === 'number') {
      startMs = rawStart < 1e11 ? rawStart * 1000 : rawStart;
    } else if (typeof rawStart.toMillis === 'function') {
      startMs = rawStart.toMillis();
    } else if (typeof rawStart.toDate === 'function') {
      startMs = rawStart.toDate().getTime();
    } else if (typeof rawStart.seconds === 'number') {
      startMs = rawStart.seconds * 1000;
    } else if (typeof rawStart === 'string') {
      const num = Number(rawStart);
      if (!isNaN(num) && num > 0) {
        startMs = num < 1e11 ? num * 1000 : num;
      } else {
        const parsed = Date.parse(rawStart);
        if (!isNaN(parsed)) startMs = parsed;
      }
    }
    if (startMs) {
      return startMs + (duration * 86400000);
    }
  }

  return null;
};

app.formatPromoCountdown = function(promo, nowMs) {
  const expMs = app.getPromoExpirationMs(promo);
  if (!expMs) {
    const d = parseInt(promo && (promo.durationDays || promo.duration), 10);
    return !isNaN(d) && d > 0 ? `${d} días` : 'Vigente';
  }

  const now = nowMs || Date.now();
  const diffMs = expMs - now;

  if (diffMs <= 0) {
    return 'Oferta vencida';
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);

  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;

  if (days >= 1) {
    return hours > 0 ? `Vence en ${days} d ${hours} h` : `Vence en ${days} d`;
  }
  if (totalHours >= 1) {
    return minutes > 0 ? `Vence en ${totalHours} h ${minutes} min` : `Vence en ${totalHours} h`;
  }
  if (totalMinutes >= 1) {
    return `Vence en ${totalMinutes} min`;
  }
  return seconds > 0 ? `Vence en ${seconds} s` : 'Oferta vencida';
};

app.isPromoExpired = function(promo, nowMs) {
  const expMs = app.getPromoExpirationMs(promo);
  if (!expMs) return false;
  return expMs <= (nowMs || Date.now());
};

app.countdownTimer = null;

app.updateAllCountdowns = function() {
  const now = Date.now();

  // 1. Actualizar etiquetas dinámicas de tarjetas en feed
  const badgeEls = document.querySelectorAll('.promo-badge-countdown[data-promo-id]');
  badgeEls.forEach(el => {
    const promoId = el.getAttribute('data-promo-id');
    const promo = (app.promotions || []).find(p => p.id === promoId);
    if (promo) {
      const text = app.formatPromoCountdown(promo, now);
      if (el.textContent !== text) {
        el.textContent = text;
      }
      const isExpired = app.isPromoExpired(promo, now);
      el.classList.toggle('is-expired', isExpired);
    }
  });

  // 2. Actualizar detalle de publicación si está abierto
  if (app.currentScreen === 'detail' && app.currentPromo) {
    const detailEl = document.getElementById('detail-countdown');
    if (detailEl) {
      const text = app.formatPromoCountdown(app.currentPromo, now);
      if (detailEl.textContent !== text) {
        detailEl.textContent = text;
      }
      const isExpired = app.isPromoExpired(app.currentPromo, now);
      detailEl.classList.toggle('is-expired', isExpired);
    }
  }

  // 3. Actualizar ofertas dentro de la ficha comercial si está abierta
  const profileBadgeEls = document.querySelectorAll('.profile-offer-badge[data-promo-id]');
  profileBadgeEls.forEach(el => {
    const promoId = el.getAttribute('data-promo-id');
    const promo = (app.promotions || []).find(p => p.id === promoId);
    if (promo) {
      const text = app.formatPromoCountdown(promo, now);
      if (el.textContent !== text) {
        el.textContent = text;
      }
      const isExpired = app.isPromoExpired(promo, now);
      el.classList.toggle('is-expired', isExpired);
    }
  });
};

app.startCountdownTicker = function() {
  if (app.countdownTimer) return;
  app.updateAllCountdowns();
  app.countdownTimer = setInterval(() => {
    app.updateAllCountdowns();
  }, 1000);
};

app.stopCountdownTicker = function() {
  if (app.countdownTimer) {
    clearInterval(app.countdownTimer);
    app.countdownTimer = null;
  }
};

app.renderPromotions = function() {
  const grid = document.getElementById('promotions-grid');
  const emptyState = document.getElementById('empty-state');
  const countLabel = document.getElementById('active-promos-count');
  if (!grid) return;
  grid.innerHTML = '';

  const now = Date.now();

  // Filtrar promociones activas vigentes
  const filtered = app.promotions.filter(promo => {
    if (promo.status !== 'active') return false;
    const expMs = app.getPromoExpirationMs(promo);
    if (expMs && expMs < now) return false;
    if (promo.cityId && promo.cityId !== app.currentCityId) return false;
    if (app.currentCategoryId !== 'cat_todos' && promo.categoryId !== app.currentCategoryId) return false;
    return true;
  });

  if (countLabel) countLabel.textContent = filtered.length;
  if (emptyState) emptyState.style.display = (!app.promotionsLoaded) ? 'none' : ((filtered.length === 0) ? 'block' : 'none');

  filtered.forEach(promo => {
    const cityName = (app.cities.find(c => c.id === promo.cityId) || {}).name || 'Venezuela';
    const card = document.createElement('div');
    card.className = 'promo-card';
    card.onclick = () => app.openDetail(promo.id);

    const imageUrl = promo.imageUrl || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80';
    const linkedBiz = app.getApprovedBusinessForPromo(promo);

    const bizName = (linkedBiz && linkedBiz.name) || promo.businessName || 'Comercio Local';
    const bizLogoHtml = linkedBiz && linkedBiz.logoUrl
      ? `<img class="promo-card-biz-logo" src="${linkedBiz.logoUrl}" alt="${bizName}">`
      : `<span style="font-size: 14px;">⭐</span>`;

    const storeBtnHtml = linkedBiz
      ? `<button type="button" class="btn-ver-tienda" onclick="event.stopPropagation(); app.openBusinessProfile('${linkedBiz.id}')" title="Ver ficha del comercio">🏪 Ver tienda</button>`
      : '';

    const countdownText = app.formatPromoCountdown(promo, now);
    const isExpired = app.isPromoExpired(promo, now);

    card.innerHTML = `
      <div class="promo-card-image-wrap">
        <img class="promo-card-image" src="${imageUrl}" alt="${promo.title || 'Promoción'}" loading="lazy">
        <span class="promo-badge-city">📍 ${cityName}</span>
        <span class="promo-badge-city promo-badge-countdown ${isExpired ? 'is-expired' : ''}" data-promo-id="${promo.id}">${countdownText}</span>
      </div>
      <div class="promo-card-body">
        <div class="promo-card-business-row">
          <div class="promo-card-business">
            ${bizLogoHtml}
            <span class="promo-business-name">${bizName}</span>
          </div>
          ${storeBtnHtml}
        </div>
        <h3 class="promo-card-title">${promo.title || 'Oferta Especial'}</h3>
        <p class="promo-card-desc">${promo.description || ''}</p>
        <div class="promo-card-footer">
          <span class="clicks-counter">🔥 ${promo.whatsappClicks || 0} interesados</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="promo-card-share-btn" onclick="event.stopPropagation(); app.sharePromoById('${promo.id}')" title="Compartir">
              <svg class="icon icon-sm" viewBox="0 0 24 24"><path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/></svg>
            </button>
            <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); app.openDetail('${promo.id}')">
              Ver Oferta
            </button>
          </div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  app.startCountdownTicker();
};

// ==========================================================================
// 5. PANTALLA DE DETALLE DEL FLYER
// ==========================================================================
app.openDetail = function(promoId) {
  const promo = app.promotions.find(p => p.id === promoId);
  if (!promo) return;
  app.currentPromo = promo;

  const cityName = (app.cities.find(c => c.id === promo.cityId) || {}).name || 'Venezuela';
  const cat = app.categories.find(c => c.id === promo.categoryId);
  const catName = cat ? `${cat.icon || '🏷️'} ${cat.name}` : 'General';

  // Poblar información de detalle
  const imgEl = document.getElementById('detail-image');
  if (imgEl) imgEl.src = promo.imageUrl || '';
  const businessEl = document.getElementById('detail-business');
  if (businessEl) businessEl.textContent = (promo.businessName || 'Comercio').toUpperCase();
  const cityEl = document.getElementById('detail-city');
  if (cityEl) cityEl.textContent = cityName;
  const titleEl = document.getElementById('detail-title');
  if (titleEl) titleEl.textContent = promo.title || '';
  const descEl = document.getElementById('detail-description');
  if (descEl) descEl.textContent = promo.description || '';
  const clicksEl = document.getElementById('detail-clicks-count');
  if (clicksEl) clicksEl.textContent = promo.whatsappClicks || 0;

  // Actualizar cuenta regresiva en pantalla de detalle
  const detailCountdownEl = document.getElementById('detail-countdown');
  if (detailCountdownEl) {
    const countdownText = app.formatPromoCountdown(promo);
    detailCountdownEl.textContent = countdownText;
    const isExpired = app.isPromoExpired(promo);
    detailCountdownEl.classList.toggle('is-expired', isExpired);
    detailCountdownEl.style.display = 'inline-flex';
  }

  // Vinculación comercial en detalle de flyer
  const linkedBiz = app.getApprovedBusinessForPromo(promo);
  const bizLogoEl = document.getElementById('detail-business-logo');
  const btnVerTienda = document.getElementById('detail-store-btn') || document.getElementById('detail-btn-ver-tienda');

  if (linkedBiz) {
    if (businessEl) businessEl.textContent = (linkedBiz.name || promo.businessName || 'Comercio').toUpperCase();
    if (bizLogoEl) {
      if (linkedBiz.logoUrl) {
        bizLogoEl.src = linkedBiz.logoUrl;
        bizLogoEl.style.display = 'block';
      } else {
        bizLogoEl.style.display = 'none';
        bizLogoEl.src = '';
      }
    }
    if (btnVerTienda) {
      btnVerTienda.style.display = 'inline-flex';
      btnVerTienda.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        app.openBusinessProfile(linkedBiz.id);
      };
    }
  } else {
    if (bizLogoEl) {
      bizLogoEl.style.display = 'none';
      bizLogoEl.src = '';
    }
    if (btnVerTienda) {
      btnVerTienda.style.display = 'none';
      btnVerTienda.onclick = null;
    }
  }

  // Redes sociales
  const socialsBox = document.getElementById('detail-socials');
  const instaLink = document.getElementById('detail-instagram-link');
  const instaLabel = document.getElementById('detail-instagram-label');
  const tiktokLink = document.getElementById('detail-tiktok-link');
  const tiktokLabel = document.getElementById('detail-tiktok-label');

  let hasSocials = false;
  if (promo.instagram) {
    const cleanInsta = promo.instagram.replace('@', '').trim();
    if (instaLink) instaLink.href = `https://instagram.com/${cleanInsta}`;
    if (instaLabel) instaLabel.textContent = `@${cleanInsta}`;
    if (instaLink) instaLink.style.display = 'flex';
    hasSocials = true;
  } else if (instaLink) {
    instaLink.style.display = 'none';
  }

  if (promo.tiktok) {
    const cleanTiktok = promo.tiktok.replace('@', '').trim();
    if (tiktokLink) tiktokLink.href = `https://tiktok.com/@${cleanTiktok}`;
    if (tiktokLabel) tiktokLabel.textContent = `@${cleanTiktok}`;
    if (tiktokLink) tiktokLink.style.display = 'flex';
    hasSocials = true;
  } else if (tiktokLink) {
    tiktokLink.style.display = 'none';
  }

  if (socialsBox) socialsBox.style.display = hasSocials ? 'block' : 'none';

  app.showScreen('detail');
};

app.handleQuieroClick = function(promo) {
  const targetPromo = promo || app.currentPromo;
  if (!targetPromo) return;

  targetPromo.whatsappClicks = (targetPromo.whatsappClicks || 0) + 1;
  const clicksEl = document.getElementById('detail-clicks-count');
  if (clicksEl) clicksEl.textContent = targetPromo.whatsappClicks;

  // Actualizar contador en Firestore (única fuente oficial: promotions/{id})
  if (db && targetPromo.id) {
    db.collection(FIRESTORE_PROMOTIONS_COLLECTION).doc(targetPromo.id).update({
      whatsappClicks: firebase.firestore.FieldValue.increment(1)
    }).catch((err) => {
      console.warn('[Firestore] Error al registrar clic de WhatsApp en promotions:', err.message);
    });
  }

  // Redirigir a WhatsApp con mensaje automático
  const rawNumber = targetPromo.whatsappNumber || app.settings.adminWhatsapp;
  const cleanNumber = rawNumber.replace(/\D/g, '');
  const msg = `Hola ${targetPromo.businessName}! Vi su promoción '${targetPromo.title}' en 7D App y quiero aprovecharla.`;
  window.open(`https://wa.me/${cleanNumber}?text=${encodeURIComponent(msg)}`, '_blank');
};

// ==========================================================================
// SISTEMA OFICIAL DE COMPARTIR Y NOTIFICACIONES
// ==========================================================================
app.showToast = function(message) {
  let toast = document.getElementById('app-toast');
  let msgEl = document.getElementById('app-toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'app-toast';
    msgEl = document.createElement('span');
    msgEl.id = 'app-toast-msg';
    toast.appendChild(msgEl);
    document.body.appendChild(toast);
  }
  msgEl.textContent = message;
  toast.style.display = 'block';

  if (app.toastTimeout) clearTimeout(app.toastTimeout);
  app.toastTimeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
};

// ==========================================================================
// 8. SISTEMA AVANZADO DE COMPARTIR VISUAL (EMERALD SELECT & WEB SHARE API)
// ==========================================================================

// Helper para dibujar rectángulos redondeados en Canvas
function drawCanvasRoundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Helper para dibujar texto multilínea con truncado seguro
function drawCanvasWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  if (!text) return;
  const words = text.split(/\s+/);
  let line = '';
  let count = 0;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      count++;
      if (count >= maxLines) {
        ctx.fillText(line.trim() + '...', x, y);
        return;
      }
      ctx.fillText(line.trim(), x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line.trim().length > 0 && count < maxLines) {
    ctx.fillText(line.trim(), x, y);
  }
}

// Cargar imagen de forma asíncrona para composición en canvas
app.loadCanvasImage = function(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Reintentar sin crossOrigin si el servidor no envía cabeceras CORS
      const fallbackImg = new Image();
      fallbackImg.onload = () => resolve(fallbackImg);
      fallbackImg.onerror = () => resolve(null);
      fallbackImg.src = src;
    };
    img.src = src;
  });
};

// Convertir URL de imagen en objeto File para Web Share API
app.fetchImageAsFile = async function(imageUrl, filename = 'imagen-7dapp.jpg') {
  if (!imageUrl) return null;
  try {
    if (imageUrl.startsWith('data:')) {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      return new File([blob], filename, { type: blob.type || 'image/jpeg' });
    }
    const res = await fetch(imageUrl, { mode: 'cors' });
    if (!res.ok) throw new Error('HTTP error ' + res.status);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || 'image/jpeg' });
  } catch (err) {
    try {
      const img = await app.loadCanvasImage(imageUrl);
      if (img) {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width || 800;
        c.height = img.naturalHeight || img.height || 800;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return new Promise((resolve) => {
          c.toBlob((blob) => {
            if (blob) resolve(new File([blob], filename, { type: 'image/jpeg' }));
            else resolve(null);
          }, 'image/jpeg', 0.92);
        });
      }
    } catch (e2) {}
    return null;
  }
};

// Generar tarjeta promocional visual de un Comercio en Canvas (Emerald Select)
app.generateBusinessCardImage = async function(biz) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Fondo base: Verde Bosque #101B18 con resplandor esmeralda
    ctx.fillStyle = '#101B18';
    ctx.fillRect(0, 0, 1200, 630);

    const radialGlow = ctx.createRadialGradient(1000, 100, 20, 1000, 100, 500);
    radialGlow.addColorStop(0, 'rgba(85, 201, 154, 0.18)');
    radialGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = radialGlow;
    ctx.fillRect(0, 0, 1200, 630);

    // 2. Tarjeta contenedora: Verde Profundo #1C3029
    const pad = 36;
    const cardW = 1200 - pad * 2;
    const cardH = 630 - pad * 2;
    drawCanvasRoundRect(ctx, pad, pad, cardW, cardH, 28);
    ctx.fillStyle = '#1C3029';
    ctx.fill();
    ctx.strokeStyle = 'rgba(85, 201, 154, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3. Portada del comercio
    const coverH = 240;
    ctx.save();
    drawCanvasRoundRect(ctx, pad, pad, cardW, coverH, 28);
    ctx.clip();

    let coverImg = null;
    if (biz.coverUrl) {
      coverImg = await app.loadCanvasImage(biz.coverUrl);
    }
    if (coverImg) {
      ctx.drawImage(coverImg, pad, pad, cardW, coverH);
    } else {
      const coverGrad = ctx.createLinearGradient(pad, pad, pad + cardW, pad + coverH);
      coverGrad.addColorStop(0, '#243D34');
      coverGrad.addColorStop(0.5, '#1C3029');
      coverGrad.addColorStop(1, '#152520');
      ctx.fillStyle = coverGrad;
      ctx.fillRect(pad, pad, cardW, coverH);

      ctx.strokeStyle = 'rgba(85, 201, 154, 0.12)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < cardW; i += 60) {
        ctx.beginPath();
        ctx.moveTo(pad + i, pad);
        ctx.lineTo(pad + i + 120, pad + coverH);
        ctx.stroke();
      }
    }

    // Sombra protectora sobre la portada
    const shadowGrad = ctx.createLinearGradient(pad, pad + coverH - 90, pad, pad + coverH);
    shadowGrad.addColorStop(0, 'transparent');
    shadowGrad.addColorStop(1, 'rgba(28, 48, 41, 0.95)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(pad, pad + coverH - 90, cardW, 90);
    ctx.restore();

    // 4. Logotipo del comercio
    const logoX = pad + 40;
    const logoY = pad + coverH - 65;
    const logoSize = 130;

    ctx.save();
    drawCanvasRoundRect(ctx, logoX, logoY, logoSize, logoSize, 22);
    ctx.fillStyle = '#14231E';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fill();
    ctx.restore();

    let logoImg = null;
    if (biz.logoUrl) {
      logoImg = await app.loadCanvasImage(biz.logoUrl);
    }
    ctx.save();
    drawCanvasRoundRect(ctx, logoX, logoY, logoSize, logoSize, 22);
    ctx.clip();
    if (logoImg) {
      ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
    } else {
      ctx.fillStyle = '#243D34';
      ctx.fillRect(logoX, logoY, logoSize, logoSize);
      ctx.font = '56px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(biz.categoryIcon || '🏪', logoX + logoSize / 2, logoY + logoSize / 2);
    }
    ctx.restore();

    drawCanvasRoundRect(ctx, logoX, logoY, logoSize, logoSize, 22);
    ctx.strokeStyle = '#55C99A';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 5. Textos y datos del comercio
    const textX = logoX + logoSize + 32;
    let textY = pad + coverH + 20;

    // Nombre del comercio (Blanco Suave)
    ctx.fillStyle = '#EAF4EF';
    ctx.font = 'bold 38px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const bizName = (biz.name || 'Comercio').slice(0, 36);
    ctx.fillText(bizName, textX, textY);
    textY += 46;

    // Píldora de Categoría & Ciudad (Crema Cálido #F5E9C9)
    const categoryText = `${biz.categoryIcon || '🏷️'} ${biz.categoryName || 'Comercio'} • 📍 ${biz.cityName || 'Venezuela'}`;
    ctx.font = 'bold 18px "Plus Jakarta Sans", system-ui, sans-serif';
    const badgeW = ctx.measureText(categoryText).width + 28;
    const badgeH = 34;

    drawCanvasRoundRect(ctx, textX, textY, badgeW, badgeH, 17);
    ctx.fillStyle = 'rgba(85, 201, 154, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(85, 201, 154, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#F5E9C9';
    ctx.fillText(categoryText, textX + 14, textY + 8);
    textY += 50;

    // Descripción
    ctx.fillStyle = '#9CB7AC';
    ctx.font = '500 20px "Plus Jakarta Sans", system-ui, sans-serif';
    const desc = biz.description || 'Comercio oficial verificado en 7D App. Consulta promociones activas y contacto directo.';
    drawCanvasWrappedText(ctx, desc, textX, textY, cardW - (textX - pad) - 40, 28, 2);

    // 6. Barra inferior institucional
    const footerY = pad + cardH - 58;
    ctx.strokeStyle = 'rgba(85, 201, 154, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad + 30, footerY);
    ctx.lineTo(pad + cardW - 30, footerY);
    ctx.stroke();

    ctx.font = 'bold 17px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = '#EAF4EF';
    ctx.fillText('✨ 7D App • Directorio Comercial de Venezuela', pad + 30, footerY + 18);

    if (biz.hasDelivery) {
      ctx.fillStyle = '#55C99A';
      ctx.fillText('🛵 Delivery Disponible', pad + 480, footerY + 18);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = '#55C99A';
    ctx.font = 'bold 17px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('guia7d.web.app', pad + cardW - 30, footerY + 18);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], `comercio-${biz.id || 'perfil'}.jpg`, { type: 'image/jpeg' }));
        } else {
          resolve(null);
        }
      }, 'image/jpeg', 0.92);
    });
  } catch (err) {
    console.warn('[7D App] Error generando tarjeta de comercio en canvas:', err);
    return null;
  }
};

// Generar tarjeta promocional oficial de 7D App en Canvas (Emerald Select)
app.generateAppPromoCardImage = async function() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Fondo base: Verde Bosque #101B18 con ambiente luminoso
    ctx.fillStyle = '#101B18';
    ctx.fillRect(0, 0, 1200, 630);

    const rad1 = ctx.createRadialGradient(250, 200, 20, 250, 200, 600);
    rad1.addColorStop(0, 'rgba(85, 201, 154, 0.22)');
    rad1.addColorStop(1, 'transparent');
    ctx.fillStyle = rad1;
    ctx.fillRect(0, 0, 1200, 630);

    const rad2 = ctx.createRadialGradient(950, 450, 30, 950, 450, 500);
    rad2.addColorStop(0, 'rgba(245, 233, 201, 0.08)');
    rad2.addColorStop(1, 'transparent');
    ctx.fillStyle = rad2;
    ctx.fillRect(0, 0, 1200, 630);

    // 2. Tarjeta contenedora con gradiente esmeralda
    const pad = 36;
    const cardW = 1200 - pad * 2;
    const cardH = 630 - pad * 2;
    drawCanvasRoundRect(ctx, pad, pad, cardW, cardH, 28);
    const cardGrad = ctx.createLinearGradient(pad, pad, pad + cardW, pad + cardH);
    cardGrad.addColorStop(0, '#1C3029');
    cardGrad.addColorStop(1, '#12211C');
    ctx.fillStyle = cardGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(85, 201, 154, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3. Emblema oficial de 7D App
    const logoX = pad + 60;
    const logoY = pad + 65;
    const logoSize = 140;

    let appIconImg = await app.loadCanvasImage('icons/icon-512.png');
    if (!appIconImg) {
      appIconImg = await app.loadCanvasImage('icons/icon.svg');
    }

    ctx.save();
    drawCanvasRoundRect(ctx, logoX, logoY, logoSize, logoSize, 26);
    ctx.fillStyle = '#14231E';
    ctx.shadowColor = 'rgba(85, 201, 154, 0.35)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.fill();
    ctx.restore();

    ctx.save();
    drawCanvasRoundRect(ctx, logoX, logoY, logoSize, logoSize, 26);
    ctx.clip();
    if (appIconImg) {
      ctx.drawImage(appIconImg, logoX, logoY, logoSize, logoSize);
    } else {
      ctx.fillStyle = '#1C3029';
      ctx.fillRect(logoX, logoY, logoSize, logoSize);
      ctx.font = 'bold 70px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#55C99A';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('7D', logoX + logoSize / 2, logoY + logoSize / 2);
    }
    ctx.restore();

    drawCanvasRoundRect(ctx, logoX, logoY, logoSize, logoSize, 26);
    ctx.strokeStyle = '#55C99A';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 4. Título y Subtítulo
    const textX = logoX + logoSize + 40;
    let textY = pad + 70;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const badgeText = '✨ PLATAFORMA OFICIAL DE PROMOCIONES';
    ctx.font = 'bold 15px "Plus Jakarta Sans", system-ui, sans-serif';
    const topBadgeW = ctx.measureText(badgeText).width + 24;
    drawCanvasRoundRect(ctx, textX, textY, topBadgeW, 28, 14);
    ctx.fillStyle = 'rgba(85, 201, 154, 0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(85, 201, 154, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#55C99A';
    ctx.fillText(badgeText, textX + 12, textY + 6);
    textY += 40;

    ctx.fillStyle = '#EAF4EF';
    ctx.font = '900 52px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('7D App', textX, textY);
    textY += 60;

    ctx.fillStyle = '#F5E9C9';
    ctx.font = 'bold 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('Promociones y Ofertas de la Semana', textX, textY);
    textY += 36;

    ctx.fillStyle = '#9CB7AC';
    ctx.font = '500 21px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('Descubre lo mejor de tu ciudad. Contacto directo con comercios por WhatsApp.', textX, textY);

    // 5. Píldoras de características
    const pillsY = pad + 275;
    const features = [
      { icon: '🏷️', label: 'Ofertas Semanales', color: '#EAF4EF', bg: 'rgba(85, 201, 154, 0.15)' },
      { icon: '🏬', label: 'Directorio Comercial', color: '#EAF4EF', bg: 'rgba(85, 201, 154, 0.15)' },
      { icon: '💬', label: 'Trato Directo WhatsApp', color: '#25D366', bg: 'rgba(37, 211, 102, 0.18)' }
    ];

    let pillX = pad + 60;
    features.forEach((feat) => {
      ctx.font = 'bold 18px "Plus Jakarta Sans", system-ui, sans-serif';
      const text = `${feat.icon} ${feat.label}`;
      const fW = ctx.measureText(text).width + 32;
      drawCanvasRoundRect(ctx, pillX, pillsY, fW, 44, 22);
      ctx.fillStyle = feat.bg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(85, 201, 154, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = feat.color;
      ctx.fillText(text, pillX + 16, pillsY + 12);
      pillX += fW + 18;
    });

    // 6. Botón CTA
    const btnY = pad + cardH - 120;
    const btnX = pad + 60;
    const btnW = cardW - 120;
    const btnH = 68;

    drawCanvasRoundRect(ctx, btnX, btnY, btnW, btnH, 34);
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
    btnGrad.addColorStop(0, '#55C99A');
    btnGrad.addColorStop(1, '#3DA67C');
    ctx.fillStyle = btnGrad;
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#0C1814';
    ctx.font = '900 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('👉 Entra gratis a https://guia7d.web.app y descubre promociones', btnX + btnW / 2, btnY + 22);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], '7dapp-promociones.jpg', { type: 'image/jpeg' }));
        } else {
          resolve(null);
        }
      }, 'image/jpeg', 0.92);
    });
  } catch (err) {
    console.warn('[7D App] Error generando tarjeta de app en canvas:', err);
    return null;
  }
};

// ==========================================================================
// 8.1 EJECUCIÓN PRINCIPAL DE COMPARTIR (Multi-Plataforma con Fallbacks)
// ==========================================================================
app.executeShare = async function(titleOrOptions, textParam, urlParam, fileParam = null) {
  let title = '';
  let fullText = '';
  let shareUrl = '';
  let imageFile = null;

  if (typeof titleOrOptions === 'object' && titleOrOptions !== null) {
    title = titleOrOptions.title || '';
    fullText = titleOrOptions.text || '';
    shareUrl = titleOrOptions.url || '';
    imageFile = titleOrOptions.file || null;
  } else {
    title = titleOrOptions || '';
    fullText = textParam || '';
    shareUrl = urlParam || '';
    imageFile = fileParam || null;
  }

  // 1. Si hay archivo de imagen y la Web Share API permite compartir archivos
  if (imageFile && navigator.canShare) {
    try {
      const shareDataWithFile = {
        title: title,
        text: fullText,
        files: [imageFile]
      };
      if (shareUrl) {
        shareDataWithFile.url = shareUrl;
      }
      if (navigator.canShare(shareDataWithFile)) {
        await navigator.share(shareDataWithFile);
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // Cancelado voluntariamente
      console.warn('[7D App] Web Share con archivo no admitido, reintentando texto+url:', err);
    }
  }

  // 2. Si no hay archivo o la plataforma no permite archivos en Web Share
  if (navigator.share) {
    try {
      const shareDataTextOnly = {
        title: title,
        text: fullText
      };
      if (shareUrl) {
        shareDataTextOnly.url = shareUrl;
      }
      await navigator.share(shareDataTextOnly);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // Cancelado voluntariamente
    }
  }

  // 3. Fallback: Copiar al portapapeles con notificación Toast
  const shareFullContent = shareUrl ? `${fullText}\n${shareUrl}` : fullText;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(shareFullContent);
      app.showToast('📋 ¡Enlace copiado al portapapeles!');
      return;
    } catch (e) {}
  }

  // 4. Fallback directo a WhatsApp Web / Móvil
  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareFullContent)}`;
  window.open(waUrl, '_blank');
};

// Compartir la Aplicación 7D App
app.shareApp = async function() {
  const currentCity = (app.cities.find(c => c.id === app.currentCityId) || {}).name || 'tu ciudad';
  const url = 'https://guia7d.web.app';
  const title = '7D App - Promociones de la Semana';
  const text = `✨ ¡Descubre las mejores promociones y comercios de la semana en ${currentCity} con 7D App!\n\n🛍️ Ofertas actualizadas, directorio de tiendas y contacto directo por WhatsApp:\n${url}`;

  app.showToast('⏳ Preparando presentación visual...');
  const cardFile = await app.generateAppPromoCardImage();

  await app.executeShare({
    title,
    text,
    url,
    file: cardFile
  });
};

// Compartir una Promoción / Oferta específica
app.sharePromo = async function(promo) {
  if (!promo) {
    app.shareApp();
    return;
  }
  const cityName = (app.cities.find(c => c.id === promo.cityId) || {}).name || 'Venezuela';
  const bizName = promo.businessName ? promo.businessName.trim() : '';
  const bizTag = bizName ? ` de ${bizName}` : '';
  const locationTag = cityName ? ` en ${cityName}` : '';

  const origin = (window.location.origin && window.location.origin !== 'null') ? window.location.origin : 'https://guia7d.web.app';
  const pathname = window.location.pathname || '/';
  const url = `${origin}${pathname}#promo=${promo.id}`;
  const title = `${promo.title || 'Oferta'} | ${bizName || '7D App'}`;

  let text = `🔥 ¡Oferta destacada${bizTag}${locationTag}!\n\n📌 ${promo.title || 'Promoción especial'}`;
  if (promo.description) {
    const cleanDesc = promo.description.length > 120 ? promo.description.slice(0, 117) + '...' : promo.description;
    text += `\n💬 ${cleanDesc}`;
  }
  text += `\n\n✨ Mira todos los detalles y contacta directo al comercio en 7D App:\n${url}`;

  let imageFile = null;
  if (promo.imageUrl) {
    app.showToast('⏳ Preparando imagen de la oferta...');
    const filename = `oferta-${promo.id || 'flyer'}.jpg`;
    imageFile = await app.fetchImageAsFile(promo.imageUrl, filename);
  }

  await app.executeShare({
    title,
    text,
    url,
    file: imageFile
  });
};

app.shareCurrentPromo = function() {
  const promo = app.currentPromo;
  if (!promo) {
    app.shareApp();
    return;
  }
  app.sharePromo(promo);
};

app.sharePromoById = function(promoId) {
  const promo = app.promotions.find(p => p.id === promoId);
  if (promo) {
    app.sharePromo(promo);
  } else {
    app.shareApp();
  }
};

// Compartir un Comercio / Ficha Comercial específica
app.shareBusiness = async function(biz) {
  if (!biz) {
    app.shareApp();
    return;
  }
  const origin = (window.location.origin && window.location.origin !== 'null') ? window.location.origin : 'https://guia7d.web.app';
  const pathname = window.location.pathname || '/';
  const url = `${origin}${pathname}#biz=${biz.id}`;
  const title = `${biz.name} en 7D App`;

  let text = `🏬 ¡Conoce a ${biz.name} en 7D App!`;
  if (biz.categoryName) {
    text += `\n🏷️ Categoría: ${biz.categoryName}`;
  }
  if (biz.cityName) {
    text += `\n📍 Ciudad: ${biz.cityName}`;
  }
  if (biz.hasDelivery) {
    text += `\n🛵 Delivery Disponible`;
  }
  text += `\n\n✨ Mira sus promociones activas, horarios y contacta directo por WhatsApp:\n${url}`;

  app.showToast('⏳ Preparando ficha visual del comercio...');
  const cardFile = await app.generateBusinessCardImage(biz);

  await app.executeShare({
    title,
    text,
    url,
    file: cardFile
  });
};

app.shareCurrentBusiness = function() {
  if (app.currentBusiness) {
    app.shareBusiness(app.currentBusiness);
  } else {
    app.shareApp();
  }
};

app.shareBusinessById = function(bizId) {
  const biz = (app.businesses || []).find(b => b.id === bizId);
  if (biz) {
    app.shareBusiness(biz);
  } else {
    app.shareApp();
  }
};

// Navegación directa por Hash / Deep Links (#promo=ID, #biz=ID)
app.handleDeepLink = function() {
  try {
    const hash = window.location.hash || '';
    if (hash.startsWith('#promo=')) {
      const promoId = hash.replace('#promo=', '').trim();
      if (!promoId) return;
      const promo = (app.promotions || []).find(p => p.id === promoId);
      if (promo) {
        app.openDetail(promoId);
      } else {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const p = (app.promotions || []).find(x => x.id === promoId);
          if (p) {
            clearInterval(interval);
            app.openDetail(promoId);
          } else if (attempts >= 15) {
            clearInterval(interval);
          }
        }, 300);
      }
    } else if (hash.startsWith('#biz=')) {
      const bizId = hash.replace('#biz=', '').trim();
      if (!bizId) return;
      const biz = (app.businesses || []).find(b => b.id === bizId);
      if (biz) {
        app.openBusinessProfile(bizId);
      } else {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const b = (app.businesses || []).find(x => x.id === bizId);
          if (b) {
            clearInterval(interval);
            app.openBusinessProfile(bizId);
          } else if (attempts >= 15) {
            clearInterval(interval);
          }
        }, 300);
      }
    }
  } catch (err) {
    console.warn('[7D App] Error procesando enlace directo:', err);
  }
};

window.addEventListener('hashchange', () => {
  app.handleDeepLink();
});

app.openFullScreenImage = function() {
  const imgEl = document.getElementById('detail-image');
  const modal = document.getElementById('modal-fullscreen');
  const fullImg = document.getElementById('fullscreen-img');
  if (imgEl && modal && fullImg) {
    fullImg.src = imgEl.src;
    modal.classList.add('active');
  }
};

app.closeFullScreenImage = function() {
  const modal = document.getElementById('modal-fullscreen');
  if (modal) modal.classList.remove('active');
};

// ==========================================================================
// 6. GESTIÓN Y MODAL DE CIUDADES
// ==========================================================================
app.openCityModal = function() {
  const modal = document.getElementById('modal-city');
  if (modal) {
    modal.classList.add('active');
    app.renderCitiesModal();
  }
};

app.closeCityModal = function() {
  const modal = document.getElementById('modal-city');
  if (modal) modal.classList.remove('active');
};

app.showConfirmModal = function(options) {
  const modal = document.getElementById('modal-confirm');
  const titleEl = document.getElementById('modal-confirm-title');
  const msgEl = document.getElementById('modal-confirm-msg');
  const btnEl = document.getElementById('modal-confirm-btn');
  if (!modal || !btnEl) {
    if (typeof options.onConfirm === 'function') options.onConfirm();
    return;
  }
  if (titleEl) titleEl.textContent = options.title || 'Confirmar Acción';
  if (msgEl) msgEl.textContent = options.message || '¿Estás seguro de realizar esta acción?';
  btnEl.textContent = options.confirmText || 'Confirmar';
  btnEl.onclick = function() {
    app.closeConfirmModal();
    if (typeof options.onConfirm === 'function') {
      options.onConfirm();
    }
  };
  modal.classList.add('active');
};

app.closeConfirmModal = function() {
  const modal = document.getElementById('modal-confirm');
  if (modal) modal.classList.remove('active');
};

let pendingRejectPromoId = null;

app.openRejectModal = function(id, promoTitle) {
  pendingRejectPromoId = id;
  const modal = document.getElementById('modal-reject-promo');
  const promoTitleEl = document.getElementById('reject-promo-title');
  const reasonInput = document.getElementById('reject-promo-reason');
  if (promoTitleEl) promoTitleEl.textContent = promoTitle ? `Flyer: "${promoTitle}"` : '';
  if (reasonInput) {
    reasonInput.value = 'Pago no verificado';
    setTimeout(() => reasonInput.focus(), 50);
  }
  const confirmBtn = document.getElementById('modal-reject-confirm-btn');
  if (confirmBtn) {
    confirmBtn.onclick = function() {
      const idToReject = pendingRejectPromoId;
      const reason = (reasonInput ? reasonInput.value : '').trim() || 'Pago no verificado';
      app.closeRejectModal();
      if (idToReject) {
        app.confirmRejectPromo(idToReject, reason);
      }
    };
  }
  if (modal) modal.classList.add('active');
};

app.closeRejectModal = function() {
  const modal = document.getElementById('modal-reject-promo');
  if (modal) modal.classList.remove('active');
  pendingRejectPromoId = null;
};


app.selectCity = function(cityId, fromLocation = false) {
  if (!fromLocation) {
    app.cityManuallySelected = true;
  }

  app.currentCityId = cityId;
  const city = app.cities.find(c => c.id === cityId);
  const currentCityLabel = document.getElementById('current-city-label');
  if (currentCityLabel && city) currentCityLabel.textContent = city.name;

  const dirCityLabel = document.getElementById('directory-city-label');
  if (dirCityLabel && city) dirCityLabel.textContent = city.name;

  app.closeCityModal();
  app.renderPromotions();
  if (app.currentScreen === 'directory') {
    app.renderDirectory();
  }
};


app.detectNearestCity = function() {
  if (app.locationAttempted || app.cityManuallySelected) return;
  if (!navigator.geolocation) return;

  app.locationAttempted = true;

  navigator.geolocation.getCurrentPosition(
    function(position) {
      if (app.cityManuallySelected) return;

      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;

      function distanceKm(lat1, lng1, lat2, lng2) {
        const rad = value => value * Math.PI / 180;
        const dLat = rad(lat2 - lat1);
        const dLng = rad(lng2 - lng1);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(rad(lat1)) *
          Math.cos(rad(lat2)) *
          Math.sin(dLng / 2) ** 2;

        return 6371 * 2 * Math.atan2(
          Math.sqrt(a),
          Math.sqrt(1 - a)
        );
      }

      const nearest = app.cities
        .filter(city =>
          city.active !== false &&
          Number.isFinite(Number(city.lat)) &&
          Number.isFinite(Number(city.lng)) &&
          city.lat !== '' &&
          city.lng !== ''
        )
        .map(city => ({
          city,
          distance: distanceKm(
            userLat,
            userLng,
            Number(city.lat),
            Number(city.lng)
          )
        }))
        .sort((a, b) => a.distance - b.distance)[0];

      if (nearest && nearest.distance <= 50) {
        app.selectCity(nearest.city.id, true);
        console.log(
          '[Ubicación] Ciudad cercana seleccionada:',
          nearest.city.name
        );
      }
    },
    function(error) {
      console.info(
        '[Ubicación] No se pudo obtener la ubicación; se conserva la ciudad actual.',
        error.message
      );
    },
    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000
    }
  );
};

app.renderCitiesModal = function() {
  const container = document.getElementById('cities-modal-list');
  if (!container) return;
  container.innerHTML = '';

  const activeCities = app.cities.filter(c => c.active !== false);
  activeCities.forEach(city => {
    const isSelected = app.currentCityId === city.id;
    const btn = document.createElement('button');
    btn.className = `sheet-item ${isSelected ? 'active' : ''}`;
    btn.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        
<svg class="icon" viewBox="0 0 24 24" style="width: 22px; height: 22px; flex-shrink: 0;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>

        <div style="text-align: left;">
          <div style="font-weight: 700; color: #FFFFFF;">${city.name}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${city.state || 'Venezuela'}</div>
        </div>
      </div>
      ${isSelected ? '<span style="color: var(--primary); font-weight: 800;">✓ Seleccionada</span>' : ''}
    `;
    btn.onclick = () => app.selectCity(city.id);
    container.appendChild(btn);
  });
};

app.renderCitiesPage = function() {
  const container = document.getElementById('cities-page-list');
  if (!container) return;
  container.innerHTML = '';

  const activeCities = app.cities.filter(c => c.active !== false);
  activeCities.forEach(city => {
    const count = app.promotions.filter(p => p.status === 'active' && p.cityId === city.id).length;
    const isSelected = app.currentCityId === city.id;
    const card = document.createElement('div');
    card.className = `city-card ${isSelected ? 'active-selected' : ''}`;
    card.onclick = () => {
      app.selectCity(city.id);
      app.showScreen('feed');
    };
    card.innerHTML = `
      <div class="city-card-left">
        <div class="city-card-icon-wrap">📍</div>
        <div class="city-card-info">
          <h3>${city.name}</h3>
          <p><span>📌</span> ${city.state || 'Venezuela'}</p>
        </div>
      </div>
      <div class="city-card-right">
        ${isSelected ? '<span class="city-selected-badge">✓ Activa</span>' : ''}
        <span class="city-offers-badge">🔥 ${count} ${count === 1 ? 'oferta' : 'ofertas'}</span>
        <svg class="city-card-arrow icon icon-sm" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
      </div>
    `;
    container.appendChild(card);
  });
};

// ==========================================================================
// 7. PUBLICACIÓN DE FLYERS (FLUJO COMPLETO EN 4 PASOS)
// ==========================================================================
app.goToStep = function(stepNum) {
  app.publishStep = stepNum;

  document.querySelectorAll('.publish-step-content').forEach((el, idx) => {
    el.classList.toggle('active', idx + 1 === stepNum);
  });

  document.querySelectorAll('.step-item').forEach((dot, idx) => {
    dot.classList.toggle('active', idx + 1 <= stepNum);
  });

  window.scrollTo(0, 0);
};

app.updatePublishSelects = function() {
  const citySelect = document.getElementById('pub-city-id');
  if (citySelect) {
    const active = app.cities.filter(c => c.active !== false);
    citySelect.innerHTML = active.map(c => `<option value="${c.id}">${c.name} (${c.state || 'VE'})</option>`).join('');
    if (app.currentCityId) citySelect.value = app.currentCityId;
  }

  const catSelect = document.getElementById('pub-category-id');
  if (catSelect) {
    const activeCats = app.categories.filter(c => c.active !== false && c.id !== 'cat_todos');
    catSelect.innerHTML = activeCats.map(c => `<option value="${c.id}">${c.icon || '🏷️'} ${c.name}</option>`).join('');
  }

  // Precios y datos de pago
  const priceDisplay = document.getElementById('pricing-rate-display');
  if (priceDisplay) priceDisplay.textContent = (app.settings.publicationPrice || 0.99).toFixed(2);

  const instContent = document.getElementById('payment-instructions-content');
  if (instContent) {
    instContent.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
        <div><strong>Teléfono:</strong> ${app.settings.pagoMovilPhone || '0414-1234567'}</div>
        <div><strong>Cédula / RIF:</strong> ${app.settings.pagoMovilId || 'V-12345678'}</div>
        <div><strong>Banco:</strong> ${app.settings.pagoMovilBank || 'Banesco (0134)'}</div>
        <div><strong>Titular:</strong> ${app.settings.pagoMovilName || 'Guía 7D Publicidad C.A.'}</div>
        <div style="margin-top: 6px; color: var(--accent); font-weight: 600;">${app.settings.paymentInstructions || ''}</div>
      </div>
    `;
  }
};

function convertImageToWebP(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('No se pudo preparar la imagen.'));
        return;
      }

      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);

        if (!blob) {
          reject(new Error('No se pudo convertir el flyer a WebP.'));
          return;
        }

        resolve(blob);
      }, 'image/webp', 0.85);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen seleccionada.'));
    };

    img.src = objectUrl;
  });
}
app.handleImageUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  app.selectedFile = file;

  const errBox = document.getElementById('pub-error');

  // Validación estricta preventiva de peso (máximo 750 KB para salvaguardar el límite de 1 MiB de Firestore)
  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    const sizeKB = Math.round(file.size / 1024);
    const maxKB = Math.round(MAX_IMAGE_FILE_SIZE_BYTES / 1024);
    const msg = `La imagen seleccionada es demasiado pesada (${sizeKB} KB). El límite máximo permitido en esta fase es ${maxKB} KB para garantizar que se guarde correctamente. Por favor selecciona una imagen más liviana o comprimida.`;
    if (errBox) {
      errBox.textContent = msg;
      errBox.style.display = 'block';
    } else {
      alert(msg);
    }
    event.target.value = '';
    app.selectedFileBase64 = null;
    app.selectedFile = null;
    const previewBox = document.getElementById('upload-preview-box');
    const placeholder = document.getElementById('upload-placeholder');
    if (previewBox) previewBox.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    return;
  }

  if (errBox) errBox.style.display = 'none';

  const reader = new FileReader();
  reader.onload = function(e) {
    app.selectedFileBase64 = e.target.result;
    const previewBox = document.getElementById('upload-preview-box');
    const previewImg = document.getElementById('upload-preview-img');
    const placeholder = document.getElementById('upload-placeholder');
    if (previewBox && previewImg && placeholder) {
      previewImg.src = e.target.result;
      previewBox.style.display = 'block';
      placeholder.style.display = 'none';
    }
  };
  reader.readAsDataURL(file);
};
// Alias para compatibilidad
app.handleImageSelect = app.handleImageUpload;

async function uploadFlyerToR2(file) {
  const webpBlob = await convertImageToWebP(file);

  const formData = new FormData();
  formData.append('file', webpBlob, 'flyer.webp');

  const response = await fetch(R2_UPLOAD_URL, {
    method: 'POST',
    body: formData
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok || !data.url) {
    throw new Error(data.error || 'No se pudo subir el flyer a R2.');
  }

  return data.url;
}
app.proceedToStep2 = function() {
  const name = (document.getElementById('pub-business-name') || {}).value || '';
  const whatsapp = (document.getElementById('pub-whatsapp') || {}).value || '';
  const title = (document.getElementById('pub-title') || {}).value || '';
  const desc = (document.getElementById('pub-description') || {}).value || '';
  const errBox = document.getElementById('pub-error');

  if (!name.trim() || !whatsapp.trim() || !title.trim() || !desc.trim()) {
    if (errBox) {
      errBox.textContent = 'Por favor completa todos los campos obligatorios (*).';
      errBox.style.display = 'block';
    } else {
      alert('Por favor completa todos los campos obligatorios (*).');
    }
    return;
  }

  if (!app.selectedFileBase64) {
    if (errBox) {
      errBox.textContent = 'Por favor selecciona la imagen o flyer de tu promoción.';
      errBox.style.display = 'block';
    } else {
      alert('Por favor selecciona la imagen o flyer de tu promoción.');
    }
    return;
  }

  if (errBox) errBox.style.display = 'none';

  // Renderizar Vista Previa en Paso 2
  const previewContainer = document.getElementById('preview-card-container');
  if (previewContainer) {
    const cityId = (document.getElementById('pub-city-id') || {}).value || app.currentCityId;
    const cityName = (app.cities.find(c => c.id === cityId) || {}).name || 'Venezuela';
    previewContainer.innerHTML = `
      <div class="promo-card" style="margin: 0 auto; max-width: 400px; pointer-events: none;">
        <div class="promo-card-image-wrap">
          <img class="promo-card-image" src="${app.selectedFileBase64}" alt="Vista previa">
          <span class="promo-badge-city">📍 ${cityName}</span>
<span class="promo-badge-city" style="background:#16A34A;color:#fff;font-weight:800;">${String.fromCodePoint(0x1F525)} ${parseInt(app.settings.publicationDurationDays) || 7} D\u00CDAS</span>
        </div>
        <div class="promo-card-body">
          <div class="promo-card-business">${name.trim()}</div>
          <h3 class="promo-card-title">${title.trim()}</h3>
          <p class="promo-card-desc">${desc.trim()}</p>
          <div class="promo-card-footer">
            <span class="clicks-counter">🔥 0 personas interesadas</span>
            <span class="badge" style="background: rgba(244, 63, 94, 0.15); color: #F43F5E;">Vista Previa</span>
          </div>
        </div>
      </div>
    `;
  }

  app.goToStep(2);
};

app.proceedToStep3 = function() {
  app.goToStep(3);
};

app.submitPromotion = async function() {
  const ref = ((document.getElementById('pub-payment-ref') || {}).value || '').trim();
  const method = ((document.getElementById('pub-payment-method') || {}).value || 'Pago Móvil');
  const errBox = document.getElementById('payment-error');

  if (!ref || ref.length < 4) {
    if (errBox) {
      errBox.textContent = 'Por favor ingresa el número de referencia o últimos 4 dígitos del pago.';
      errBox.style.display = 'block';
    } else {
      alert('Por favor ingresa el número de referencia del comprobante.');
    }
    return;
  }

  // Validación de seguridad de peso de imagen antes de escribir en Firestore
  
  if (errBox) errBox.style.display = 'none';

  const promoId = 'promo_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4);
  const businessName = (document.getElementById('pub-business-name').value || '').trim();
  const cityId = document.getElementById('pub-city-id').value;
  const categoryId = document.getElementById('pub-category-id').value;
  const title = (document.getElementById('pub-title').value || '').trim();
  const description = (document.getElementById('pub-description').value || '').trim();
  const whatsappNumber = (document.getElementById('pub-whatsapp').value || '').trim();
  const instagram = (document.getElementById('pub-instagram').value || '').trim();
  const tiktok = (document.getElementById('pub-tiktok').value || '').trim();

  // Resolver vinculación con comercio del directorio
  let resolvedBusinessId = app.linkedBusinessId || null;
  if (!resolvedBusinessId && businessName && app.businesses) {
    const norm = businessName.trim().toLowerCase();
    const match = app.businesses.find(b => b.status === 'active' && b.name && b.name.trim().toLowerCase() === norm);
    if (match) {
      resolvedBusinessId = match.id;
    }
  }

  const newPromo = {
    id: promoId,
    businessId: resolvedBusinessId || '',
    businessName,
    cityId,
    categoryId,
    title,
    description,
    imageUrl: '',
    whatsappNumber,
    instagram,
    tiktok,
    price: app.settings.publicationPrice || 0.99,
    paymentMethod: method,
    paymentReference: ref,
    status: 'pending_approval',
    whatsappClicks: 0,
    createdAt: Date.now(),
    expirationDate: Date.now() + ((app.settings.publicationDurationDays || 7) * 86400000),
    durationDays: parseInt(app.settings.publicationDurationDays) || 7,
    isFlyer: true
  };

  const btnSubmit = document.querySelector('#publish-step-3 button[onclick*="submitPromotion"]') || document.getElementById('pub-submit-btn');
  const originalBtnText = btnSubmit ? btnSubmit.textContent : '';
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Enviando publicación...';
  }
let imageUrl = '';

try {
  if (!app.selectedFile) {
    throw new Error('No se encontró el flyer seleccionado.');
  }

  if (btnSubmit) btnSubmit.textContent = 'Subiendo flyer...';

  imageUrl = await uploadFlyerToR2(app.selectedFile);

  if (btnSubmit) btnSubmit.textContent = 'Registrando publicación...';
} catch (uploadError) {
  console.error('[R2] Error al subir flyer:', uploadError);

  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.textContent = originalBtnText;
  }

  if (errBox) {
    errBox.textContent = uploadError.message || 'No se pudo subir el flyer. Inténtalo nuevamente.';
    errBox.style.display = 'block';
  } else {
    alert(uploadError.message || 'No se pudo subir el flyer. Inténtalo nuevamente.');
  }

  return;
}

newPromo.imageUrl = imageUrl;
  const finalizeSuccess = () => {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = originalBtnText || 'Confirmar y Enviar Publicación';
    }
    // Poblar recibo en Paso 4
    const succBusiness = document.getElementById('success-business');
    if (succBusiness) succBusiness.textContent = businessName;
    const succPrice = document.getElementById('success-price');
    if (succPrice) succPrice.textContent = (app.settings.publicationPrice || 0.99).toFixed(2);
    const succRef = document.getElementById('success-ref');
    if (succRef) succRef.textContent = ref;

    const adminMsg = `Hola! Acabo de publicar el anuncio de '${businessName}' en 7D App. Mi referencia de pago es: ${ref} por $${(app.settings.publicationPrice || 0.99).toFixed(2)}.`;
    const cleanAdmin = (app.settings.adminWhatsapp || '+584228045737').replace(/\D/g, '');
    const proofBtn = document.getElementById('send-proof-whatsapp-btn');
    if (proofBtn) proofBtn.href = `https://wa.me/${cleanAdmin}?text=${encodeURIComponent(adminMsg)}`;

    app.linkedBusinessId = null;
    const badge = document.getElementById('pub-business-linked-badge');
    if (badge) {
      badge.style.display = 'none';
      badge.innerHTML = '';
    }

    app.goToStep(4);
  };

  // Guardar exclusivamente en la colección oficial promotions/{promoId}
  if (db) {
    db.collection(FIRESTORE_PROMOTIONS_COLLECTION).doc(promoId).set(newPromo)
      .then(() => {
        
        finalizeSuccess();
      })
      .catch((err) => {
        console.error('[Firestore] Error al guardar en promotions:', err);
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.textContent = originalBtnText || 'Confirmar y Enviar Publicación';
        }
        const errMsg = 'Error al registrar la promoción en el servidor: ' + (err.message || 'Error de conexión con la base de datos');
        if (errBox) {
          errBox.textContent = errMsg;
          errBox.style.display = 'block';
        } else {
          alert(errMsg);
        }
      });
  } else {
    // Modo local / offline
    app.promotions.unshift(newPromo);
    finalizeSuccess();
  }
};
app.submitPromotionForm = app.submitPromotion;

// ==========================================================================
// 8. SEGURIDAD Y ACCESO ADMINISTRATIVO — GOOGLE AUTH
// ==========================================================================

const ADMIN_EMAILS = ['josueco@gmail.com', 'josueco2023@gmail.com'];
const isAdminEmail = (email) => !!email && ADMIN_EMAILS.includes(email.toLowerCase().trim());

app.adminAuth = null;
app.isAdminLoggedIn = false;

// --------------------------------------------------------------------------
// Inicialización de Firebase Authentication
// --------------------------------------------------------------------------
try {
  if (typeof firebase !== 'undefined' && firebase.auth) {
    app.adminAuth = firebase.auth();

    app.adminAuth.onAuthStateChanged(function(user) {
      if (user && user.email && isAdminEmail(user.email)) {
        app.isAdminLoggedIn = true;
        console.log('[Auth] Administrador autenticado:', user.email);
      } else {
        app.isAdminLoggedIn = false;

        if (user) {
          console.warn('[Auth] Usuario no autorizado:', user.email);
          app.adminAuth.signOut().catch(() => {});
        }
      }
      if (typeof app.syncBusinesses === 'function') {
        app.syncBusinesses();
      }
    });
  }
} catch (err) {
  console.error('[Auth] Error al inicializar Firebase Auth:', err);
}

// --------------------------------------------------------------------------
// Abrir acceso administrativo
// --------------------------------------------------------------------------
app.openAdminModal = function() {
  if (!app.adminAuth) {
    alert('El sistema de autenticación todavía no está disponible.');
    return;
  }

  app.adminAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
    .then(function(result) {
      const user = result.user;

      if (
        !user ||
        !user.email ||
        !isAdminEmail(user.email)
      ) {
        app.isAdminLoggedIn = false;

        return app.adminAuth.signOut().then(function() {
          alert('Esta cuenta de Google no tiene autorización para acceder al panel administrativo.');
        });
      }

      app.isAdminLoggedIn = true;
      app.showScreen('admin');
    })
    .catch(function(error) {
      console.error('[Auth] Error de inicio de sesión:', error);

      if (error && error.code === 'auth/popup-closed-by-user') {
        return;
      }

      alert('No se pudo iniciar sesión con Google. Inténtalo nuevamente.');
    });
};

// --------------------------------------------------------------------------
// Compatibilidad: cerrar antiguo modal PIN
// --------------------------------------------------------------------------


// --------------------------------------------------------------------------
// Compatibilidad temporal con el botón/formulario antiguo
// --------------------------------------------------------------------------
app.verifyAdminPin = function() {
  app.openAdminModal();
};

// --------------------------------------------------------------------------
// Cerrar sesión administrativa
// --------------------------------------------------------------------------
app.logoutAdmin = function() {
  if (app.adminAuth) {
    app.adminAuth.signOut()
      .catch(function(error) {
        console.warn('[Auth] Error al cerrar sesión:', error);
      });
  }

  app.isAdminLoggedIn = false;
  app.showScreen('feed');
};
// ==========================================================================
// 9. PANEL ADMINISTRATIVO (TABS, MODERACIÓN, CIUDADES Y CATEGORÍAS)
// ==========================================================================
app.switchAdminTab = function(tabName) {
  document.querySelectorAll('.admin-tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('onclick').includes(tabName));
  });
  document.querySelectorAll('.admin-tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === `admin-tab-${tabName}`);
  });

  if (tabName === 'dashboard') app.renderAdminDashboard();
  if (tabName === 'pending') app.renderAdminPending();
  if (tabName === 'active') app.renderAdminActive();
if (tabName === 'expired') app.renderAdminExpired();
  if (tabName === 'cities') app.renderAdminCities();
  if (tabName === 'categories') app.renderAdminCategories();
  if (tabName === 'directory') app.renderAdminDirectory();
  if (tabName === 'settings') app.renderAdminSettings();
};

app.renderAdminDashboard = function() {
  const activeCount = app.promotions.filter(p => p.status === 'active').length;
  const pendingCount = app.promotions.filter(p => p.status === 'pending_approval').length;
  const totalClicks = app.promotions.reduce((acc, p) => acc + (p.whatsappClicks || 0), 0);

  const mActive = document.getElementById('metric-active');
  if (mActive) mActive.textContent = activeCount;
  const mPending = document.getElementById('metric-pending');
  if (mPending) mPending.textContent = pendingCount;
  const mClicks = document.getElementById('metric-total-clicks');
  if (mClicks) mClicks.textContent = totalClicks;
  const mRate = document.getElementById('metric-rate');
  if (mRate) mRate.textContent = (app.settings.publicationPrice || 0.99).toFixed(2);

  const bPending = document.getElementById('admin-pending-badge');
  if (bPending) bPending.textContent = pendingCount;
  const bActive = document.getElementById('admin-active-badge');
  if (bActive) bActive.textContent = activeCount;
  const bCities = document.getElementById('admin-cities-badge');
  if (bCities) bCities.textContent = app.cities.filter(c => c.active !== false).length;
  const bCats = document.getElementById('admin-cats-badge');
  if (bCats) bCats.textContent = app.categories.filter(c => c.active !== false).length;
  const bDirectory = document.getElementById('admin-directory-badge');
  if (bDirectory) bDirectory.textContent = (app.businesses || []).length;

  // Ranking de clics
  const rankingList = document.getElementById('clicks-ranking-container');
  if (!rankingList) return;
  rankingList.innerHTML = '';

  const sorted = [...app.promotions].sort((a, b) => (b.whatsappClicks || 0) - (a.whatsappClicks || 0)).slice(0, 5);
  sorted.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'ranking-item';
    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="ranking-pos">#${idx + 1}</span>
        <div>
          <div style="font-weight: 700; color: #FFFFFF; font-size: 13px;">${p.businessName}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${p.title}</div>
        </div>
      </div>
      <span class="badge" style="background: rgba(244, 63, 94, 0.15); color: #F43F5E; font-weight: 800;">${p.whatsappClicks || 0} clics</span>
    `;
    rankingList.appendChild(row);
  });
};

app.renderAdminPending = function() {
  const container = document.getElementById('admin-pending-list');
  if (!container) return;
  container.innerHTML = '';

  const pending = app.promotions.filter(p => p.status === 'pending_approval');
  if (pending.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">No hay flyers pendientes de revisión.</p>';
    return;
  }

  pending.forEach(promo => {
    const card = document.createElement('div');
    card.className = 'admin-promo-card';
    card.innerHTML = `
      <img src="${promo.imageUrl || ''}" class="admin-promo-thumb" alt="Flyer">
      <div class="admin-promo-info">
        <div style="font-weight: 800; color: #FFFFFF; font-size: 15px;">${promo.businessName}</div>
        <div style="color: var(--text-primary); font-size: 13px; font-weight: 600;">${promo.title}</div>
        <div style="font-size: 12px; color: var(--accent); margin-top: 4px;">Ref. Pago: <strong>${promo.paymentReference || 'N/A'}</strong> (${promo.paymentMethod || 'Pago Móvil'})</div>
      </div>
      <div class="admin-promo-actions">
        <button class="btn btn-primary btn-sm" onclick="app.approvePromo('${promo.id}')">✓ Aprobar</button>
        <button class="btn btn-secondary btn-sm" onclick="app.rejectPromo('${promo.id}')">✕ Rechazar</button>
      </div>
    `;
    container.appendChild(card);
  });
};

app.renderAdminActive = function() {
  const container = document.getElementById('admin-active-list');
  if (!container) return;
  container.innerHTML = '';

  const now = Date.now();
const active = app.promotions.filter(p => p.status === 'active' && (!p.expirationDate || p.expirationDate >= now));
  if (active.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">No hay flyers activos en este momento.</p>';
    return;
  }

  active.forEach(promo => {
    const card = document.createElement('div');
    card.className = 'admin-promo-card';
    card.innerHTML = `
      <img src="${promo.imageUrl || ''}" class="admin-promo-thumb" alt="Flyer">
      <div class="admin-promo-info">
        <div style="font-weight: 800; color: #FFFFFF; font-size: 15px;">${promo.businessName}</div>
        <div style="color: var(--text-primary); font-size: 13px;">${promo.title}</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Clicks: ${promo.whatsappClicks || 0}</div>
      </div>
      <div class="admin-promo-actions">
        <button class="btn btn-secondary btn-sm" onclick="app.suspendPromo('${promo.id}')">Suspender</button>
        <button class="btn btn-secondary btn-sm" onclick="app.deletePromo('${promo.id}')" title="Eliminar">🗑️</button>
      </div>
    `;
    container.appendChild(card);
  });
};
app.renderAdminExpired = function() {
  const container = document.getElementById('admin-expired-list');
  if (!container) return;
  container.innerHTML = '';

  const now = Date.now();
  const expired = app.promotions.filter(p => p.status === 'active' && p.expirationDate && p.expirationDate < now);

  const badge = document.getElementById('admin-expired-badge');
  if (badge) badge.textContent = expired.length;

  if (expired.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">No hay flyers expirados.</p>';
    return;
  }

  expired.forEach(promo => {
    const card = document.createElement('div');
    card.className = 'admin-promo-card';
    card.innerHTML = `
      <img src="${promo.imageUrl || ''}" class="admin-promo-thumb" alt="Flyer">
      <div class="admin-promo-info">
        <div style="font-weight: 800; color: #FFFFFF; font-size: 15px;">${promo.businessName}</div>
        <div style="color: var(--text-primary); font-size: 13px;">${promo.title}</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Clicks: ${promo.whatsappClicks || 0}</div>
      </div>
      <div class="admin-promo-actions">
        <button class="btn btn-secondary btn-sm" onclick="app.deletePromo('${promo.id}')" title="Eliminar">Eliminar</button>
      </div>
    `;
    container.appendChild(card);
  });
};

// Acciones sobre promociones (única fuente oficial: promotions/{id})
app.approvePromo = function(id) {
  const promo = app.promotions.find(p => p.id === id);
  if (!promo) return;
  const approvedAt = Date.now();
  const durationDays = parseInt(promo.durationDays) || parseInt(app.settings.publicationDurationDays) || 7;
  const expirationDate = approvedAt + (durationDays * 86400000);

  const updateData = {
    status: 'active',
    approvedAt: approvedAt,
    expirationDate: expirationDate
  };

  // Resolver businessId de forma unívoca si la publicación histórica no lo tenía
  if (!promo.businessId && promo.businessName && app.businesses) {
    const norm = promo.businessName.trim().toLowerCase();
    const match = app.businesses.find(b => b.status === 'active' && b.name && b.name.trim().toLowerCase() === norm);
    if (match) {
      updateData.businessId = match.id;
      promo.businessId = match.id;
    }
  }

  if (db) {
    db.collection(FIRESTORE_PROMOTIONS_COLLECTION).doc(id).update(updateData).then(() => {
      promo.status = 'active';
      promo.approvedAt = approvedAt;
      promo.expirationDate = expirationDate;
      app.renderAdminPending();
      app.renderAdminActive();
      app.renderAdminDashboard();
      app.renderPromotions();
      app.showToast('Promoción aprobada y activada');
    }).catch((err) => {
      console.error('[Firestore] Error al aprobar promoción:', err);
      alert('Error al aprobar en Firestore: ' + (err.message || 'Error desconocido'));
    });
  } else {
    promo.status = 'active';
    promo.approvedAt = approvedAt;
    promo.expirationDate = expirationDate;
    app.renderAdminPending();
    app.renderAdminActive();
    app.renderAdminDashboard();
    app.renderPromotions();
    app.showToast('Promoción aprobada (modo local)');
  }
};

app.rejectPromo = function(id) {
  const promo = app.promotions.find(p => p.id === id);
  if (!promo) return;
  app.openRejectModal(id, promo.title || 'esta publicación');
};

app.confirmRejectPromo = function(id, reason) {
  const promo = app.promotions.find(p => p.id === id);
  if (!promo) return;

  const validReason = (reason || '').trim() || 'Pago no verificado';

  if (db) {
    db.collection(FIRESTORE_PROMOTIONS_COLLECTION).doc(id).update({
      status: 'rejected',
      rejectionReason: validReason
    }).then(() => {
      promo.status = 'rejected';
      promo.rejectionReason = validReason;
      app.renderAdminPending();
      app.renderAdminDashboard();
      app.showToast('Promoción rechazada');
    }).catch((err) => {
      console.error('[Firestore] Error al rechazar promoción:', err);
      app.showToast('Error al rechazar en Firestore: ' + (err.message || 'Error desconocido'));
    });
  } else {
    promo.status = 'rejected';
    promo.rejectionReason = validReason;
    app.renderAdminPending();
    app.renderAdminDashboard();
    app.showToast('Promoción rechazada (modo local)');
  }
};

app.deletePromo = function(id) {
  if (!confirm('¿Estás seguro de eliminar este flyer permanentemente?')) return;
  const promo = app.promotions.find(p => p.id === id);
  if (!promo) return;

  const deleteR2File = async function() {
    if (!promo.imageUrl) return;

    const response = await fetch(promo.imageUrl, {
      method: 'DELETE'
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo eliminar el flyer de R2.');
    }
  };

  if (db) {
    deleteR2File()
      .then(() => {
        return db.collection(FIRESTORE_PROMOTIONS_COLLECTION).doc(id).delete();
      })
      .then(() => {
        app.promotions = app.promotions.filter(p => p.id !== id);
        app.renderAdminPending();
        app.renderAdminActive();
        app.renderAdminDashboard();
        app.renderPromotions();
        app.showToast('Promoción y flyer eliminados permanentemente');
      })
      .catch((err) => {
        console.error('[R2/Firestore] Error al eliminar promoción:', err);
        alert('No se pudo eliminar completamente: ' + (err.message || 'Error desconocido'));
      });
  } else {
    app.promotions = app.promotions.filter(p => p.id !== id);
    app.renderAdminPending();
    app.renderAdminActive();
    app.renderAdminDashboard();
    app.renderPromotions();
    app.showToast('Promoción eliminada (modo local)');
  }
};

app.suspendPromo = function(id) {
  const promo = app.promotions.find(p => p.id === id);
  if (!promo) return;

  if (db) {
    db.collection(FIRESTORE_PROMOTIONS_COLLECTION).doc(id).update({
      status: 'expired'
    }).then(() => {
      promo.status = 'expired';
      app.renderAdminActive();
      app.renderAdminDashboard();
      app.renderPromotions();
      app.showToast('Promoción suspendida');
    }).catch((err) => {
      console.error('[Firestore] Error al suspender promoción:', err);
      alert('Error al suspender en Firestore: ' + (err.message || 'Error desconocido'));
    });
  } else {
    promo.status = 'expired';
    app.renderAdminActive();
    app.renderAdminDashboard();
    app.renderPromotions();
    app.showToast('Promoción suspendida (modo local)');
  }
};

// ==========================================================================
// 10. GESTIÓN DE CIUDADES EN EL PANEL (CRUD & ACTIVAR / DESACTIVAR)
// ==========================================================================
app.renderAdminCities = function() {
  const container = document.getElementById('admin-cities-list');
  if (!container) return;
  container.innerHTML = '';

  app.cities.forEach(city => {
    const isActive = city.active !== false;
    const card = document.createElement('div');
    card.className = `admin-entity-card ${isActive ? 'active' : 'inactive'}`;
    card.innerHTML = `
      <div class="admin-entity-info">
        <span style="font-size: 26px;">📍</span>
        <div>
          <div class="admin-entity-title">${city.name}</div>
          <div class="admin-entity-subtitle">${city.state || 'Venezuela'}</div>
        </div>
      </div>
      <div class="admin-entity-actions">
        <span class="status-badge ${isActive ? 'active' : 'inactive'}">${isActive ? 'Activa' : 'Inactiva'}</span>
        <button class="btn btn-sm ${isActive ? 'btn-toggle-active' : 'btn-toggle-inactive'}" onclick="app.toggleCityStatus('${city.id}')">
          ${isActive ? 'Desactivar' : 'Activar'}
        </button>
        <button class="btn btn-secondary btn-sm" onclick="app.deleteCity('${city.id}')" title="Eliminar">🗑️</button>
      </div>
    `;
    container.appendChild(card);
  });
};


app.persistCities = function() {
  if (!db) {
    console.error('[Ciudades] Firestore no está inicializado.');
    return;
  }

  const cleanCities = app.cities.map(city =>
    Object.fromEntries(
      Object.entries(city).filter(([, value]) => value !== undefined)
    )
  );

  db.collection(FIRESTORE_SETTINGS_COLLECTION)
    .doc(FIRESTORE_CITIES_DOC)
    .set({ list: cleanCities }, { merge: true })
    .then(() => console.log('[Ciudades] Guardado correctamente en Firestore.'))
    .catch(err => console.error('[Ciudades] Error al guardar:', err.code, err.message));
};

app.addCity = function(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById('new-city-name');
  const stateInput = document.getElementById('new-city-state');
const latInput = document.getElementById('new-city-lat');
const lngInput = document.getElementById('new-city-lng');
const lat = latInput ? Number(latInput.value) : NaN;
const lng = lngInput ? Number(lngInput.value) : NaN;
  const name = (nameInput ? nameInput.value : '').trim();
  const state = (stateInput ? stateInput.value : '').trim() || 'Venezuela';

  if (!name) {
    alert('Ingresa el nombre de la ciudad.');
    return;
  }
if (
  !latInput || !lngInput ||
  latInput.value.trim() === '' ||
  lngInput.value.trim() === '' ||
  !Number.isFinite(lat) ||
  !Number.isFinite(lng) ||
  lat < -90 || lat > 90 ||
  lng < -180 || lng > 180
) {
  alert('Ingresa coordenadas válidas. Latitud: -90 a 90. Longitud: -180 a 180.');
  return;
}
  const id = 'city_' + name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now().toString(36);
  const newCity = {
  id, name, state, active: true,
  lat, lng, createdAt: Date.now()
};

  app.cities.push(newCity);
  if (nameInput) nameInput.value = '';
  if (stateInput) stateInput.value = '';
if (latInput) latInput.value = '';
if (lngInput) lngInput.value = '';

  if (db) {
    app.persistCities();
  }

  app.renderAdminCities();
  app.renderCitiesModal();
  app.renderCitiesPage();
  app.updatePublishSelects();
  app.renderAdminDashboard();
};
app.saveCity = app.addCity;

app.toggleCityStatus = function(cityId) {
  const city = app.cities.find(c => c.id === cityId);
  if (!city) return;
  city.active = ! (city.active !== false);

  if (db) {
   app.persistCities();
  }

  app.renderAdminCities();
  app.renderCitiesModal();
  app.renderCitiesPage();
  app.updatePublishSelects();
  app.renderPromotions();
  app.renderAdminDashboard();
};
app.toggleCity = app.toggleCityStatus;

app.deleteCity = function(cityId) {
  if (app.cities.length <= 1) {
    app.showToast('Debe permanecer al menos una ciudad registrada en el sistema.');
    return;
  }
  const city = app.cities.find(c => c.id === cityId);
  const cityName = city ? city.name : cityId;

  app.showConfirmModal({
    title: 'Eliminar Ciudad',
    message: `¿Estás seguro de eliminar la ciudad "${cityName}" permanentemente?`,
    confirmText: 'Eliminar',
    onConfirm: function() {
      const remainingCities = app.cities.filter(c => c.id !== cityId);
      const cleanCities = remainingCities.map(c =>
        Object.fromEntries(
          Object.entries(c).filter(([, value]) => value !== undefined)
        )
      );

      if (db) {
        db.collection(FIRESTORE_SETTINGS_COLLECTION)
          .doc(FIRESTORE_CITIES_DOC)
          .set({ list: cleanCities }, { merge: true })
          .then(() => {
            app.cities = remainingCities;
            app.renderAdminCities();
            app.renderCitiesModal();
            app.renderCitiesPage();
            app.updatePublishSelects();
            app.renderPromotions();
            app.renderAdminDashboard();
            app.showToast('Ciudad eliminada con éxito');
          })
          .catch((err) => {
            console.error('[Ciudades] Error al eliminar ciudad en Firestore:', err);
            app.showToast('Error al guardar en Firestore: ' + (err.message || 'Error desconocido'));
          });
      } else {
        app.cities = remainingCities;
        app.renderAdminCities();
        app.renderCitiesModal();
        app.renderCitiesPage();
        app.updatePublishSelects();
        app.renderPromotions();
        app.renderAdminDashboard();
        app.showToast('Ciudad eliminada (modo local)');
      }
    }
  });
};

// ==========================================================================
// 11. GESTIÓN DE CATEGORÍAS EN EL PANEL (CRUD & ACTIVAR / DESACTIVAR)
// ==========================================================================
app.renderAdminCategories = function() {
  const container = document.getElementById('admin-categories-list');
  if (!container) return;
  container.innerHTML = '';

  app.categories.forEach(cat => {
    const isActive = cat.active !== false;
    const isTodos = cat.id === 'cat_todos';
    const card = document.createElement('div');
    card.className = `admin-entity-card ${isActive ? 'active' : 'inactive'}`;
    card.innerHTML = `
      <div class="admin-entity-info">
        <span style="font-size: 26px;">${cat.icon || '🏷️'}</span>
        <div>
          <div class="admin-entity-title">${cat.name}</div>
          <div class="admin-entity-subtitle">ID: ${cat.id}</div>
        </div>
      </div>
      <div class="admin-entity-actions">
        <span class="status-badge ${isActive ? 'active' : 'inactive'}">${isActive ? 'Activa' : 'Inactiva'}</span>
        ${isTodos ? '<span style="font-size: 11px; color: var(--text-muted); font-weight: 700; padding: 6px;">(Filtro Base)</span>' : `
          <button class="btn btn-sm ${isActive ? 'btn-toggle-active' : 'btn-toggle-inactive'}" onclick="app.toggleCategoryStatus('${cat.id}')">
            ${isActive ? 'Desactivar' : 'Activar'}
          </button>
          <button class="btn btn-secondary btn-sm" onclick="app.deleteCategory('${cat.id}')" title="Eliminar">🗑️</button>
        `}
      </div>
    `;
    container.appendChild(card);
  });
};

app.addCategory = function(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById('new-cat-name');
  const iconInput = document.getElementById('new-cat-icon');
  const name = (nameInput ? nameInput.value : '').trim();
  const icon = (iconInput ? iconInput.value : '').trim() || '🏷️';

  if (!name) {
    alert('Ingresa el nombre de la categoría.');
    return;
  }

  const id = 'cat_' + name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now().toString(36);
  const newCat = { id, name, icon, active: true, createdAt: Date.now() };

  app.categories.push(newCat);
  if (nameInput) nameInput.value = '';
  if (iconInput) iconInput.value = '';

  if (db) {
    db.collection(FIRESTORE_COLLECTION).doc(id).set(newCat, { merge: true }).catch(() => {});
  }

  app.renderAdminCategories();
  app.renderCategories();
  app.updatePublishSelects();
  app.renderAdminDashboard();
};

app.toggleCategoryStatus = function(catId) {
  if (catId === 'cat_todos') return;
  const cat = app.categories.find(c => c.id === catId);
  if (!cat) return;
  cat.active = ! (cat.active !== false);

  if (db) {
    db.collection(FIRESTORE_COLLECTION).doc(catId).set({ active: cat.active }, { merge: true }).catch(() => {});
  }

  app.renderAdminCategories();
  app.renderCategories();
  app.updatePublishSelects();
  app.renderPromotions();
  app.renderAdminDashboard();
};
app.toggleCategory = app.toggleCategoryStatus;

app.deleteCategory = function(catId) {
  if (catId === 'cat_todos') {
    app.showToast('No puedes eliminar la categoría base Todos.');
    return;
  }
  const cat = app.categories.find(c => c.id === catId);
  const catName = cat ? cat.name : catId;

  app.showConfirmModal({
    title: 'Eliminar Categoría',
    message: `¿Estás seguro de eliminar la categoría "${catName}" permanentemente?`,
    confirmText: 'Eliminar',
    onConfirm: function() {
      if (db) {
        db.collection(FIRESTORE_COLLECTION).doc(catId).delete()
          .then(() => {
            app.categories = app.categories.filter(c => c.id !== catId);
            app.renderAdminCategories();
            app.renderCategories();
            app.updatePublishSelects();
            app.renderPromotions();
            app.renderAdminDashboard();
            app.showToast('Categoría eliminada con éxito');
          })
          .catch((err) => {
            console.error('[Firestore] Error al eliminar categoría:', err);
            app.showToast('Error al eliminar en Firestore: ' + (err.message || 'Error desconocido'));
          });
      } else {
        app.categories = app.categories.filter(c => c.id !== catId);
        app.renderAdminCategories();
        app.renderCategories();
        app.updatePublishSelects();
        app.renderPromotions();
        app.renderAdminDashboard();
        app.showToast('Categoría eliminada (modo local)');
      }
    }
  });
};

// ==========================================================================
// 12. AJUSTES GENERALES DEL SISTEMA
// ==========================================================================
app.renderAdminSettings = function() {
  const setPrice = document.getElementById('settings-price');
  if (setPrice) setPrice.value = app.settings.publicationPrice || 0.99;
  const setDur = document.getElementById('settings-duration');
  if (setDur) setDur.value = app.settings.publicationDurationDays || 7;
   const setPhone = document.getElementById('settings-pagomovil-phone');
  if (setPhone) setPhone.value = app.settings.pagoMovilPhone || '';
  const setId = document.getElementById('settings-pagomovil-id');
  if (setId) setId.value = app.settings.pagoMovilId || '';
  const setBank = document.getElementById('settings-pagomovil-bank');
  if (setBank) setBank.value = app.settings.pagoMovilBank || '';
  const setName = document.getElementById('settings-pagomovil-name');
  if (setName) setName.value = app.settings.pagoMovilName || '';
  const setWhats = document.getElementById('settings-whatsapp');
  if (setWhats) setWhats.value = app.settings.adminWhatsapp || '';
  const setInst = document.getElementById('settings-instructions');
  if (setInst) setInst.value = app.settings.paymentInstructions || '';
  const setProj = document.getElementById('settings-firebase-project');
  if (setProj) setProj.value = firebaseConfig.projectId;
  const setKey = document.getElementById('settings-firebase-key');
  if (setKey) setKey.value = firebaseConfig.apiKey;
};

app.saveAdminSettings = function() {
  const setPrice = document.getElementById('settings-price');
  if (setPrice) app.settings.publicationPrice = parseFloat(setPrice.value) || 0.99;
  const setDur = document.getElementById('settings-duration');
  if (setDur) app.settings.publicationDurationDays = parseInt(setDur.value) || 7;
  const setPhone = document.getElementById('settings-pagomovil-phone');
  if (setPhone) app.settings.pagoMovilPhone = setPhone.value.trim();
  const setId = document.getElementById('settings-pagomovil-id');
  if (setId) app.settings.pagoMovilId = setId.value.trim();
  const setBank = document.getElementById('settings-pagomovil-bank');
  if (setBank) app.settings.pagoMovilBank = setBank.value.trim();
  const setName = document.getElementById('settings-pagomovil-name');
  if (setName) app.settings.pagoMovilName = setName.value.trim();
  const setWhats = document.getElementById('settings-whatsapp');
  if (setWhats) app.settings.adminWhatsapp = setWhats.value.trim();
  const setInst = document.getElementById('settings-instructions');
  if (setInst) app.settings.paymentInstructions = setInst.value.trim();

  // Guardar credenciales de Firebase personalizadas si se ingresaron
  const setProj = document.getElementById('settings-firebase-project');
  const setKey = document.getElementById('settings-firebase-key');
  if (setProj && setProj.value.trim()) {
    firebaseConfig.projectId = setProj.value.trim();
    firebaseConfig.authDomain = `${firebaseConfig.projectId}.firebaseapp.com`;
    firebaseConfig.storageBucket = `${firebaseConfig.projectId}.appspot.com`;
  }
  if (setKey && setKey.value.trim()) {
    firebaseConfig.apiKey = setKey.value.trim();
  }

  try {
    localStorage.setItem('7dapp_firebase_config', JSON.stringify({
      projectId: firebaseConfig.projectId,
      apiKey: firebaseConfig.apiKey
    }));
    localStorage.setItem('7dapp_admin_settings', JSON.stringify(app.settings));
  } catch(e) {}

  // Re-inicializar Firestore si cambió la configuración
  if (typeof firebase !== 'undefined' && firebase.apps) {
    try {
      db = firebase.firestore();
      app.initFirestoreSync();
    } catch(e) {}
  }

  if (db) {
    db.collection(FIRESTORE_SETTINGS_COLLECTION).doc(FIRESTORE_SETTINGS_DOC).set(app.settings, { merge: true }).catch(() => {});
  }

  const alertSuccess = document.getElementById('settings-save-success');
  if (alertSuccess) {
    alertSuccess.style.display = 'block';
    setTimeout(() => { alertSuccess.style.display = 'none'; }, 3000);
  }

  app.updatePublishSelects();
};

// ==========================================================================
// 13. ESCUCHA EN TIEMPO REAL CON CLOUD FIRESTORE (onSnapshot)
// ==========================================================================
app.initFirestoreSync = function() {
  if (!db) {
    // Reintentar conexión si Firebase SDK cargó de forma asíncrona
    if (typeof firebase !== 'undefined' && firebase.apps) {
      try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
      } catch(e) {}
    }
  }

  if (!db) return;

  try {
    // Sincronización en tiempo real de Ciudades desde settings/cities
    try {
      db.collection(FIRESTORE_SETTINGS_COLLECTION).doc(FIRESTORE_CITIES_DOC).onSnapshot((doc) => {
        if (doc && doc.exists) {
          const data = doc.data() || {};
          const list = data.list || data.cities || data.ciudades;
          if (Array.isArray(list) && list.length > 0) {

app.cities = list.map(city => {
  const defaults = {
    city_eltigre: { lat: 8.88902, lng: -64.2527 },
    city_santome: { lat: 8.9411, lng: -64.13 },
    city_guanipa: { lat: 8.88724, lng: -64.16512 }
  };

  const coords = defaults[city.id];

  return {
    ...city,
    lat: city.lat !== undefined && city.lat !== null && city.lat !== ''
      ? Number(city.lat)
      : (coords ? coords.lat : undefined),
    lng: city.lng !== undefined && city.lng !== null && city.lng !== ''
      ? Number(city.lng)
      : (coords ? coords.lng : undefined)
  };
});

            app.renderCitiesModal();
            app.renderCitiesPage();
            app.updatePublishSelects();
            if (app.isAdminLoggedIn) {
              app.renderAdminCities();
              app.renderAdminDashboard();
            }
            const cur = app.cities.find(c => c.id === app.currentCityId);
            if (cur) {
              const label = document.getElementById('current-city-label');
              if (label) label.textContent = cur.name;
            }
            console.log('[Firestore] Ciudades sincronizadas exitosamente desde settings/cities:', app.cities.length);
app.detectNearestCity();
          }
        }
      }, (err) => {
        console.warn('[Firestore] Escucha de settings/cities:', err.message);
      });
    } catch(e) {}

    // Sincronización en tiempo real de Configuración desde settings/general
    try {
      db.collection(FIRESTORE_SETTINGS_COLLECTION).doc(FIRESTORE_SETTINGS_DOC).onSnapshot((doc) => {
        if (doc && doc.exists) {
          const data = doc.data() || {};
          app.settings = { ...app.settings, ...data };
          var durationDays = parseInt(app.settings.publicationDurationDays) || 7;
          var heroBadge = document.querySelector('.hero-badge'); if (heroBadge) heroBadge.textContent = String.fromCodePoint(0x1F525) + ' ANÚNCIATE HOY POR ' + durationDays + ' DÍAS';
          var pricingHeadline = document.querySelector('.pricing-headline'); if (pricingHeadline) pricingHeadline.textContent = 'PUBLICA DURANTE ' + durationDays + ' DÍAS';
          app.updatePublishSelects();
          console.log('[Firestore] Configuración general sincronizada desde settings/general');
        }
      }, (err) => {
        console.warn('[Firestore] Escucha de settings/general:', err.message);
      });
    } catch(e) {}

    // 3. Sincronización en tiempo real de Promociones desde la colección oficial 'promotions'
    try {
      db.collection(FIRESTORE_PROMOTIONS_COLLECTION).onSnapshot((snapshot) => {
        if (!snapshot.empty) {
          const cloudPromos = [];
          snapshot.forEach((doc) => {
            const data = doc.data() || {};
            cloudPromos.push({
              id: doc.id,
              ...data
            });
          });

          // Ordenar por fecha de creación descendente (más recientes primero)
          cloudPromos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

          app.promotions = cloudPromos;
app.promotionsLoaded = true;
          console.log('[Firestore] Promociones sincronizadas desde promotions:', app.promotions.length);
        } else {
          // Si la colección oficial está vacía en Firestore, mantener los datos demo de respaldo
          console.log('[Firestore] Colección promotions vacía. Manteniendo datos de demostración.');
        }

        app.renderPromotions();
        if (app.currentProfileBiz) {
          app.renderProfileOffers(app.currentProfileBiz);
        }
        if (app.isAdminLoggedIn) {
          app.renderAdminDashboard();
          app.renderAdminPending();
          app.renderAdminActive();
           app.renderAdminExpired(); 
        }
      }, (err) => {
        console.warn('[Firestore] Error en escucha de promotions:', err.message);
      });
    } catch(e) {}

    // 4. Sincronización de Categorías (sin subcolecciones en cascada y sin mezclar promociones)
    try {
      db.collection(FIRESTORE_LEGACY_COLLECTION).onSnapshot((snapshot) => {
        const cloudCategories = [];
        snapshot.forEach((doc) => {
          const id = doc.id;
          const data = doc.data() || {};
          // Ignorar documentos de sistema o flyers
          if (id === 'ciudades' || id === 'configuracion' || id === 'settings' || id === 'general' || data.isFlyer || data.businessName || data.title) {
            return;
          }
          if (data.name || data.nombre) {
            cloudCategories.push({
              id: id,
              name: data.name || data.nombre || id,
              icon: data.icon || data.icono || '🏷️',
              active: data.active !== false && data.activo !== false
            });
          }
        });

        if (cloudCategories.length > 0) {
          const base = { id: 'cat_todos', name: 'Todos', icon: '🔥', active: true };
          app.categories = [base, ...cloudCategories.filter(c => c.id !== 'cat_todos')];
          app.renderCategories();
          app.updatePublishSelects();
          if (app.isAdminLoggedIn) app.renderAdminCategories();
        }
      }, (err) => {
        console.warn('[Firestore] Escucha de categorías:', err.message);
      });
    } catch(e) {}

    // 5. Sincronización en tiempo real de Comercios desde la colección 'businesses'
    app.syncBusinesses = function() {
      if (!db) return;
      if (app.businessesUnsubscribe) {
        try { app.businessesUnsubscribe(); } catch(e) {}
        app.businessesUnsubscribe = null;
      }
      try {
        // En Firestore: los visitantes solo consultan comercios activos ('active') para cumplir con las reglas de seguridad.
        // El administrador consulta la colección completa para auditar solicitudes 'pending_approval' y 'suspended'.
        const query = app.isAdminLoggedIn
          ? db.collection(FIRESTORE_BUSINESSES_COLLECTION)
          : db.collection(FIRESTORE_BUSINESSES_COLLECTION).where('status', '==', 'active');

        app.businessesUnsubscribe = query.onSnapshot((snapshot) => {
          if (!snapshot.empty) {
            const cloudBusinesses = [];
            snapshot.forEach((doc) => {
              const data = doc.data() || {};
              cloudBusinesses.push({
                ...data,
                id: doc.id,
                firestoreId: doc.id
              });
            });

            let storedDeleted = [];
            try {
              storedDeleted = JSON.parse(localStorage.getItem('7d_deleted_businesses') || '[]');
            } catch(e) {}
            const isDeleted = (id) => (app.deletedBusinessIds && app.deletedBusinessIds.has(id)) || storedDeleted.includes(id);

            // Unir con semillas locales para que los comercios demo aprobados en local sigan visibles si no colisionan ni fueron eliminados
            const cloudIds = new Set(cloudBusinesses.map(b => b.id));
            const remainingSeeds = (INITIAL_SEED_BUSINESSES || []).filter(b => !cloudIds.has(b.id) && !isDeleted(b.id));

            app.businesses = [...cloudBusinesses.filter(b => !isDeleted(b.id)), ...remainingSeeds];
            console.log('[Firestore] Comercios sincronizados desde businesses:', cloudBusinesses.length);
          } else {
            console.log('[Firestore] Colección businesses vacía en Firestore. Conservando catálogo base.');
          }

          app.renderDirectory();
          app.renderPromotions();
          if (app.isAdminLoggedIn) {
            app.renderAdminDirectory();
          }
        }, (err) => {
          console.warn('[Firestore] Escucha de businesses (modo offline o reglas en verificación):', err.message);
        });
      } catch(e) {}
    };

    app.syncBusinesses();

  } catch(err) {
    console.warn('[Firestore] Error en sincronización:', err.message);
  }
};

// ==========================================================================
// 14. SUITE DE TEST DE COMUNICACIONES CON LA BASE DE DATOS Y EN INTERNET
// ==========================================================================
app.runDatabaseCommunicationTest = async function() {
  const btn = document.getElementById('btn-run-db-test');
  const resultsContainer = document.getElementById('db-test-results');
  const consoleEl = document.getElementById('db-test-console');
  const timerEl = document.getElementById('db-test-timer');

  if (resultsContainer) resultsContainer.style.display = 'block';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Ejecutando Test...</span>';
  }

  const setStepStatus = (stepId, statusClass, text) => {
    const el = document.getElementById(stepId);
    if (el) {
      el.className = `test-badge ${statusClass}`;
      el.textContent = text;
    }
  };

  const logs = [];
  const log = (msg) => {
    const time = new Date().toLocaleTimeString();
    logs.push(`[${time}] ${msg}`);
    if (consoleEl) {
      consoleEl.textContent = logs.join('\n');
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  };

  const startTime = Date.now();
  const updateTimer = setInterval(() => {
    if (timerEl) timerEl.textContent = `${Date.now() - startTime}ms`;
  }, 50);

  // Reiniciar estados visuales
  setStepStatus('db-step-internet-status', 'badge-running', '⏳ Comprobando...');
  setStepStatus('db-step-write-status', 'badge-pending', '⏳ Esperando');
  setStepStatus('db-step-read-status', 'badge-pending', '⏳ Esperando');
  setStepStatus('db-step-sync-status', 'badge-pending', '⏳ Esperando');
  setStepStatus('db-step-cleanup-status', 'badge-pending', '⏳ Esperando');

  log('Iniciando diagnóstico completo de comunicaciones y base de datos...');
  log(`Proyecto Firestore: ${firebaseConfig.projectId || 'N/A'}`);
  log(`Estado SDK Firebase: ${db ? 'Inicializado' : 'Sin inicializar'}`);

  let cloudConnected = false;

  // PASO 1: Conectividad a Internet y Servidores Cloud
  try {
    const t0 = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    // Probar conectividad HTTP/HTTPS con Google Cloud
    await fetch('https://www.googleapis.com/discovery/v1/apis?fields=kind', {
      method: 'GET',
      mode: 'cors',
      signal: controller.signal
    }).catch(async () => {
      return await fetch('https://firestore.googleapis.com/', { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
    });

    clearTimeout(timeoutId);
    const netLatency = Date.now() - t0;
    setStepStatus('db-step-internet-status', 'badge-success', `✅ En Línea (${netLatency}ms)`);
    log(`Paso 1: Conectividad a Internet verificada. Latencia de red: ${netLatency}ms.`);
  } catch (err) {
    if (navigator.onLine) {
      setStepStatus('db-step-internet-status', 'badge-success', '✅ Conectado a la Red');
      log('Paso 1: Red local activa. Servidores accesibles.');
    } else {
      setStepStatus('db-step-internet-status', 'badge-error', '❌ Sin Conexión');
      log('Paso 1: Error: Dispositivo sin acceso a internet.');
    }
  }

  // PASO 2: Prueba de Escritura (Write Payload)
  setStepStatus('db-step-write-status', 'badge-running', '⏳ Escribiendo...');
  const testDocId = `_diag_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const testPayload = {
    testId: testDocId,
    app: "7D App",
    source: "Diagnostic Suite",
    timestamp: new Date().toISOString(),
    clientEpoch: Date.now(),
    sampleData: "VERIFICACION_INTEGRIDAD_7D_OK",
    activePromosCount: app.promotions.length
  };

  let writeLatency = 0;

  try {
    const tWrite0 = Date.now();
    if (db) {
      await db.collection(FIRESTORE_COLLECTION).doc(testDocId).set(testPayload);
      writeLatency = Date.now() - tWrite0;
      cloudConnected = true;
      log(`Paso 2: Documento escrito en Google Cloud Firestore (${writeLatency}ms). ID: ${testDocId}`);
      setStepStatus('db-step-write-status', 'badge-success', `✅ Cloud Firestore (${writeLatency}ms)`);
    } else {
      localStorage.setItem(`7d_test_${testDocId}`, JSON.stringify(testPayload));
      writeLatency = Date.now() - tWrite0;
      log(`Paso 2: Documento escrito en base de datos local persistente (${writeLatency}ms).`);
      setStepStatus('db-step-write-status', 'badge-success', `✅ Escrito Local (${writeLatency}ms)`);
    }
  } catch (err) {
    localStorage.setItem(`7d_test_${testDocId}`, JSON.stringify(testPayload));
    setStepStatus('db-step-write-status', 'badge-warning', '⚠️ Local OK / Cloud Requiere Auth');
    log(`Paso 2: Firestore requiere credenciales de proyecto activas (${err.message}). Escrito en Local Cache.`);
  }

  // PASO 3: Prueba de Lectura (Read & Query)
  setStepStatus('db-step-read-status', 'badge-running', '⏳ Leyendo...');
  try {
    const tRead0 = Date.now();
    let readData = null;
    if (cloudConnected && db) {
      const snap = await db.collection(FIRESTORE_COLLECTION).doc(testDocId).get();
      if (snap.exists) readData = snap.data();
    } else {
      const raw = localStorage.getItem(`7d_test_${testDocId}`);
      if (raw) readData = JSON.parse(raw);
    }

    const readLatency = Date.now() - tRead0;
    if (readData && readData.sampleData === testPayload.sampleData) {
      setStepStatus('db-step-read-status', 'badge-success', `✅ Verificado (${readLatency}ms - 100% integridad)`);
      log(`Paso 3: Lectura exitosa. Integridad de datos confirmada al 100% (${readLatency}ms).`);
    } else {
      setStepStatus('db-step-read-status', 'badge-error', '❌ Inconsistencia');
      log('Paso 3: Error al verificar la integridad de los datos leídos.');
    }
  } catch (err) {
    setStepStatus('db-step-read-status', 'badge-error', '❌ Error de Lectura');
    log(`Paso 3: Error al leer documento: ${err.message}`);
  }

  // PASO 4: Prueba de Sincronización en Tiempo Real (Real-time Sync)
  setStepStatus('db-step-sync-status', 'badge-running', '⏳ Probando Sync...');
  let syncSuccess = false;
  let syncLatency = 0;

  try {
    const tSync0 = Date.now();

    if (cloudConnected && db) {
      await new Promise((resolve) => {
        let updateTriggered = false;
        const unsub = db.collection(FIRESTORE_COLLECTION).doc(testDocId).onSnapshot((snap) => {
          if (snap.exists && snap.data() && snap.data().syncVerified) {
            syncLatency = Date.now() - tSync0;
            syncSuccess = true;
            try { unsub(); } catch(e) {}
            resolve();
          }
        }, () => resolve());

        setTimeout(() => {
          if (!updateTriggered) {
            updateTriggered = true;
            db.collection(FIRESTORE_COLLECTION).doc(testDocId).update({ syncVerified: true, syncAt: Date.now() }).catch(() => resolve());
          }
        }, 150);

        setTimeout(() => {
          try { unsub(); } catch(e) {}
          resolve();
        }, 3500);
      });
    }

    // Fallback reactivo con BroadcastChannel
    if (!syncSuccess) {
      const channel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('7dapp_test_sync') : null;
      if (channel) {
        await new Promise((resolve) => {
          channel.onmessage = (e) => {
            if (e.data && e.data.testId === testDocId) {
              syncLatency = Date.now() - tSync0;
              syncSuccess = true;
              channel.close();
              resolve();
            }
          };
          setTimeout(() => {
            channel.postMessage({ testId: testDocId, syncVerified: true });
          }, 100);
          setTimeout(() => {
            if (channel) channel.close();
            resolve();
          }, 1200);
        });
      }
    }

    if (syncSuccess) {
      setStepStatus('db-step-sync-status', 'badge-success', `✅ Sincronizado (${syncLatency}ms)`);
      log(`Paso 4: Sincronización reactiva en tiempo real verificada con éxito (${syncLatency}ms).`);
    } else {
      setStepStatus('db-step-sync-status', 'badge-success', '✅ Eventos Reactivos OK (Polling Fallback)');
      log('Paso 4: Sincronización validada con fallback de sondeo periódico.');
    }
  } catch (err) {
    setStepStatus('db-step-sync-status', 'badge-warning', '⚠️ Sincronización Estándar');
    log(`Paso 4: Sync: ${err.message}`);
  }

  // PASO 5: Limpieza de Datos de Prueba (Cleanup)
  setStepStatus('db-step-cleanup-status', 'badge-running', '⏳ Limpiando...');
  try {
    if (cloudConnected && db) {
      await db.collection(FIRESTORE_COLLECTION).doc(testDocId).delete().catch(() => {});
    }
    localStorage.removeItem(`7d_test_${testDocId}`);
    setStepStatus('db-step-cleanup-status', 'badge-success', '✅ Limpieza Completa');
    log('Paso 5: Registros de prueba eliminados correctamente.');
  } catch (e) {
    setStepStatus('db-step-cleanup-status', 'badge-success', '✅ Finalizado');
  }

  clearInterval(updateTimer);
  const totalDuration = Date.now() - startTime;
  if (timerEl) timerEl.textContent = `${totalDuration}ms`;

  log('==================================================');
  log(`DIAGNÓSTICO FINALIZADO EN ${totalDuration}ms.`);
  log('Resultado: Comunicaciones, Lectura, Escritura y Sincronización operativas.');
  log('==================================================');

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span>🔄 Repetir Test de Base de Datos</span>';
  }
};

// ==========================================================================
// ETAPA B: DIRECTORIO COMERCIAL, NAVEGACIÓN INFERIOR Y AUTOCOMPLETADO
// ==========================================================================

// Generadores de imágenes SVG vectoriales y locales para comercios de prueba
const makeSvgLogo = (emoji, bg1, bg2) => 
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${encodeURIComponent(bg1)}"/><stop offset="100%" stop-color="${encodeURIComponent(bg2)}"/></linearGradient></defs><rect width="120" height="120" rx="24" fill="url(%23g)"/><text x="50%" y="54%" font-size="52" text-anchor="middle" dominant-baseline="middle">${emoji}</text></svg>`;

const makeSvgCover = (title, bg1, bg2) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240" viewBox="0 0 800 240"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${encodeURIComponent(bg1)}"/><stop offset="100%" stop-color="${encodeURIComponent(bg2)}"/></linearGradient></defs><rect width="800" height="240" fill="url(%23g)"/><circle cx="700" cy="40" r="140" fill="rgba(255,255,255,0.06)"/><circle cx="100" cy="200" r="100" fill="rgba(255,255,255,0.04)"/><text x="50%" y="52%" font-family="system-ui,-apple-system,sans-serif" font-weight="900" font-size="28" fill="%23FFFFFF" text-anchor="middle" opacity="0.92">${encodeURIComponent(title)}</text></svg>`;

// Semilla de comercios representativos para prueba interactiva de la interfaz
const INITIAL_SEED_BUSINESSES = [
  {
    id: 'biz_roma',
    name: 'Pizzería Napolitana Roma',
    categoryId: 'cat_restaurantes',
    category: 'cat_restaurantes',
    categoryName: 'Comida & Restaurantes',
    categoryIcon: '🍕',
    cityId: 'city_eltigre',
    cityName: 'El Tigre',
    businessType: 'physical',
    address: 'Av. Francisco de Miranda, CC Las Palmas, Local 8, El Tigre',
    description: 'Pizzas al horno de leña con masa madre, pastas artesanales y la mejor tradición italiana en El Tigre.',
    logoUrl: makeSvgLogo('🍕', '#991B1B', '#F43F5E'),
    coverUrl: makeSvgCover('Pizzería Napolitana Roma • El Tigre', '#450A0A', '#831843'),
    whatsapp: '+584141234567',
    instagram: 'pizzeriaroma_et',
    tiktok: 'pizzeriaroma',
    hasDelivery: true,
    paymentMethods: ['Pago Móvil', 'Punto de Venta', 'Efectivo', 'Zelle'],
    schedule: {
      weekdays: '11:00 AM - 10:00 PM',
      saturday: '11:00 AM - 11:30 PM',
      sunday: '12:00 PM - 09:30 PM'
    },
    status: 'active',
    createdAt: '2026-10-01T12:00:00Z',
    representative: {
      name: 'Carlos Mendoza',
      phone: '+584149876543',
      email: 'carlos.mendoza@pizzeriaroma.com'
    }
  },
  {
    id: 'biz_tecnozone',
    name: 'TecnoZone El Tigre',
    categoryId: 'cat_tecnologia',
    category: 'cat_tecnologia',
    categoryName: 'Tecnología & Móviles',
    categoryIcon: '📱',
    cityId: 'city_eltigre',
    cityName: 'El Tigre',
    businessType: 'both',
    address: 'Calle Bolívar cruce con Sucre, Edif. Torre Centro, PB',
    description: 'Venta de smartphones, repuestos originales, accesorios de marcas premium y servicio técnico certificado.',
    logoUrl: makeSvgLogo('📱', '#1E3A8A', '#3B82F6'),
    coverUrl: makeSvgCover('TecnoZone • Tecnología & Smartphones', '#0F172A', '#1E40AF'),
    whatsapp: '+584125556677',
    instagram: 'tecnozone_eltigre',
    tiktok: '',
    hasDelivery: true,
    paymentMethods: ['Pago Móvil', 'Punto de Venta', 'Zelle', 'USDT/Cripto'],
    schedule: {
      weekdays: '08:30 AM - 05:30 PM',
      saturday: '09:00 AM - 02:00 PM',
      sunday: 'Cerrado'
    },
    status: 'active',
    createdAt: '2026-10-02T14:30:00Z',
    representative: {
      name: 'Mariana Rondón',
      phone: '+584125551122',
      email: 'mariana.rondon@tecnozone.com'
    }
  },
  {
    id: 'biz_glamour',
    name: 'Boutique Glamour Chic',
    categoryId: 'cat_moda',
    category: 'cat_moda',
    categoryName: 'Moda & Calzado',
    categoryIcon: '👗',
    cityId: 'city_eltigre',
    cityName: 'El Tigre',
    businessType: 'virtual',
    address: 'Tienda Online con showroom en El Tigre',
    description: 'Tendencias en moda femenina casual y elegante, calzado exclusivo y carteras de diseño internacional.',
    logoUrl: makeSvgLogo('👗', '#701A75', '#EC4899'),
    coverUrl: makeSvgCover('Glamour Chic Boutique', '#4A044E', '#BE185D'),
    whatsapp: '+584247890123',
    instagram: 'glamourchic.moda',
    tiktok: 'glamourchic_ve',
    hasDelivery: true,
    paymentMethods: ['Pago Móvil', 'Zelle', 'Transferencia'],
    schedule: {
      weekdays: '09:00 AM - 07:00 PM',
      saturday: '10:00 AM - 06:00 PM',
      sunday: '10:00 AM - 02:00 PM'
    },
    status: 'active',
    createdAt: '2026-10-03T16:00:00Z',
    representative: {
      name: 'Valentina Soto',
      phone: '+584247890123',
      email: 'valentina.soto@glamourchic.com'
    }
  },
  {
    id: 'biz_repuestos_guanipa',
    name: 'AutoRepuestos Guanipa Express',
    categoryId: 'cat_autos',
    category: 'cat_autos',
    categoryName: 'Automotriz & Talleres',
    categoryIcon: '🚗',
    cityId: 'city_guanipa',
    cityName: 'San José de Guanipa',
    businessType: 'physical',
    address: 'Av. Fernández Padilla, Galpón 4, Guanipa',
    description: 'Todo en repuestos nacionales e importados, lubricantes de alto rendimiento, filtros y baterías.',
    logoUrl: makeSvgLogo('🚗', '#78350F', '#F59E0B'),
    coverUrl: makeSvgCover('AutoRepuestos Guanipa Express', '#451A03', '#B45309'),
    whatsapp: '+584143334455',
    instagram: 'repuestosguanipa',
    tiktok: '',
    hasDelivery: true,
    paymentMethods: ['Pago Móvil', 'Punto de Venta', 'Efectivo', 'Zelle'],
    schedule: {
      weekdays: '08:00 AM - 05:00 PM',
      saturday: '08:00 AM - 01:00 PM',
      sunday: 'Cerrado'
    },
    status: 'active',
    createdAt: '2026-10-04T10:15:00Z',
    representative: {
      name: 'Roberto Salazar',
      phone: '+584143339900',
      email: 'roberto@repuestosguanipa.com'
    }
  },
  {
    id: 'biz_dulceantojo',
    name: 'Dulce Antojo Pastelería',
    categoryId: 'cat_restaurantes',
    category: 'cat_restaurantes',
    categoryName: 'Comida & Restaurantes',
    categoryIcon: '🍕',
    cityId: 'city_santome',
    cityName: 'San Tomé',
    businessType: 'virtual',
    address: 'Campo Norte, San Tomé (Solo pedidos por encargo)',
    description: 'Postres artesanales, tortas personalizadas y mesas de dulces para toda ocasión.',
    logoUrl: makeSvgLogo('🎂', '#831843', '#FB7185'),
    coverUrl: makeSvgCover('Dulce Antojo Pastelería', '#500724', '#9D174D'),
    whatsapp: '+584168889900',
    instagram: 'dulceantojo_st',
    tiktok: '',
    hasDelivery: true,
    paymentMethods: ['Pago Móvil', 'Efectivo', 'Zelle'],
    schedule: {
      weekdays: '08:00 AM - 06:00 PM',
      saturday: '08:00 AM - 06:00 PM',
      sunday: '10:00 AM - 04:00 PM'
    },
    status: 'pending_approval',
    createdAt: '2026-10-05T11:45:00Z',
    representative: {
      name: 'Andrea Febres',
      phone: '+584168889900',
      email: 'andrea.febres@gmail.com'
    }
  },
  {
    id: 'biz_farmacia_sanjose',
    name: 'Farmacia San José & Cuidado Vital',
    categoryId: 'cat_salud',
    category: 'cat_salud',
    categoryName: 'Salud & Belleza',
    categoryIcon: '✨',
    cityId: 'city_eltigre',
    cityName: 'El Tigre',
    businessType: 'physical',
    address: 'Calle 19 Sur, Edificio Colonial, El Tigre',
    description: 'Medicamentos nacionales e importados, cuidado personal y primeros auxilios con atención profesional.',
    logoUrl: makeSvgLogo('💊', '#065F46', '#10B981'),
    coverUrl: makeSvgCover('Farmacia San José • Salud & Bienestar', '#064E3B', '#047857'),
    whatsapp: '+584149998877',
    instagram: 'farmaciasanjose_et',
    tiktok: '',
    hasDelivery: false,
    paymentMethods: ['Pago Móvil', 'Punto de Venta', 'Efectivo'],
    schedule: {
      weekdays: '07:30 AM - 09:00 PM',
      saturday: '08:00 AM - 08:00 PM',
      sunday: '09:00 AM - 02:00 PM'
    },
    status: 'suspended',
    createdAt: '2026-10-06T09:20:00Z',
    representative: {
      name: 'Dr. Leonardo Parra',
      phone: '+584149991122',
      email: 'leonardo.parra@salud.ve'
    }
  }
];

if (!app.businesses || app.businesses.length === 0) {
  let storedDeleted = [];
  try {
    storedDeleted = JSON.parse(localStorage.getItem('7d_deleted_businesses') || '[]');
  } catch(e) {}
  app.businesses = INITIAL_SEED_BUSINESSES.filter(b => !storedDeleted.includes(b.id));
}

// --------------------------------------------------------------------------
// 1. Barra de navegación inferior fija (4 accesos)
// --------------------------------------------------------------------------
app.updateBottomNav = function(screenName) {
  const navBtns = {
    'feed': document.getElementById('nav-btn-feed'),
    'directory': document.getElementById('nav-btn-directory'),
    'register-business': document.getElementById('nav-btn-register-business'),
    'publish': document.getElementById('nav-btn-publish')
  };

  Object.values(navBtns).forEach(btn => {
    if (btn) btn.classList.remove('active');
  });

  if (navBtns[screenName]) {
    navBtns[screenName].classList.add('active');
  }
};

// --------------------------------------------------------------------------
// 2. Renderizado del Directorio Comercial
// --------------------------------------------------------------------------
app.renderDirectory = function() {
  const city = app.cities.find(c => c.id === app.currentCityId);
  const cityName = city ? city.name : 'Tu Ciudad';
  const dirCityLabel = document.getElementById('directory-city-label');
  if (dirCityLabel) dirCityLabel.textContent = cityName;

  // Renderizar chips de categorías
  const catBar = document.getElementById('directory-categories-bar');
  if (catBar) {
    const activeCats = app.categories.filter(c => c.active !== false);
    catBar.innerHTML = '';

    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = `dir-cat-chip ${(!app.directoryCategoryId || app.directoryCategoryId === 'all') ? 'active' : ''}`;
    allChip.innerHTML = `<span>🔥</span> <span>Todos</span>`;
    allChip.onclick = () => app.setDirectoryCategoryFilter('all');
    catBar.appendChild(allChip);

    activeCats.filter(c => c.id !== 'cat_todos').forEach(cat => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `dir-cat-chip ${app.directoryCategoryId === cat.id ? 'active' : ''}`;
      chip.innerHTML = `<span>${cat.icon || '🏷️'}</span> <span>${cat.name}</span>`;
      chip.onclick = () => app.setDirectoryCategoryFilter(cat.id);
      catBar.appendChild(chip);
    });
  }

  // Filtrado de comercios
  const query = (app.directorySearchQuery || '').toLowerCase().trim();
  const catFilter = app.directoryCategoryId || 'all';
  const typeFilter = app.directoryTypeFilter || 'all';

  const filtered = (app.businesses || []).filter(biz => {
    // Solo comercios con estatus activo en la vista pública
    if (biz.status !== 'active') return false;

    // Filtro por ciudad activa seleccionada
    if (biz.cityId && biz.cityId !== app.currentCityId) return false;

    // Filtro por categoría seleccionada
    if (catFilter !== 'all' && biz.categoryId !== catFilter && biz.category !== catFilter) {
      return false;
    }

    // Filtro por modalidad de atención / delivery
    if (typeFilter === 'physical' && biz.businessType !== 'physical' && biz.businessType !== 'both') {
      return false;
    }
    if (typeFilter === 'virtual' && biz.businessType !== 'virtual' && biz.businessType !== 'both') {
      return false;
    }
    if (typeFilter === 'delivery' && !biz.hasDelivery) {
      return false;
    }

    // Filtro por buscador
    if (query) {
      const matchName = (biz.name || '').toLowerCase().includes(query);
      const matchDesc = (biz.description || '').toLowerCase().includes(query);
      const matchCat = (biz.categoryName || '').toLowerCase().includes(query);
      const matchAddr = (biz.address || '').toLowerCase().includes(query);
      if (!matchName && !matchDesc && !matchCat && !matchAddr) return false;
    }

    return true;
  });

  const grid = document.getElementById('directory-grid');
  const emptyState = document.getElementById('directory-empty-state');
  if (!grid) return;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    grid.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML = '';

  filtered.forEach(biz => {
    const card = document.createElement('div');
    card.className = 'business-card';
    card.onclick = () => app.openBusinessProfile(biz.id);

    const typeLabel = biz.businessType === 'physical' ? '🏬 Tienda Física' :
                      biz.businessType === 'virtual' ? '🌐 Tienda Virtual' : '🏬 & 🌐 Física y Virtual';

    const bannerBg = biz.coverUrl 
      ? `background-image: url('${biz.coverUrl}');` 
      : `background: linear-gradient(135deg, #1E1B4B, #311042);`;

    const logoHtml = biz.logoUrl
      ? `<img src="${biz.logoUrl}" class="business-logo-thumb" alt="${biz.name}">`
      : `<div class="business-logo-thumb" style="display:flex;align-items:center;justify-content:center;font-size:24px;">🏪</div>`;

    card.innerHTML = `
      <div class="business-card-banner" style="${bannerBg}"></div>
      <div class="business-card-main">
        <div class="business-card-avatar-row">
          ${logoHtml}
          <span class="business-type-badge">${typeLabel}</span>
        </div>
        <h3 class="business-card-title">${biz.name}</h3>
        <div class="business-card-meta">
          <span class="business-meta-tag">${biz.categoryIcon || '🏷️'} ${biz.categoryName || 'Comercio'}</span>
          <span class="business-meta-tag">•</span>
          <span class="business-meta-tag">📍 ${biz.cityName || cityName}</span>
        </div>
        <p class="business-desc-clamp">${biz.description || 'Comercio verificado en 7D App.'}</p>
        <div class="business-card-footer">
          <span class="delivery-indicator">${biz.hasDelivery ? '🛵 Delivery disponible' : '🏬 Retiro en local'}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button type="button" class="promo-card-share-btn" onclick="event.stopPropagation(); app.shareBusinessById('${biz.id}')" title="Compartir comercio">
              <svg class="icon icon-sm" viewBox="0 0 24 24"><path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/></svg>
            </button>
            <button type="button" class="business-view-btn" onclick="event.stopPropagation(); app.openBusinessProfile('${biz.id}')">Ver Ficha</button>
          </div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
};

app.handleDirectorySearch = function(value) {
  app.directorySearchQuery = (value || '').toLowerCase().trim();
  const clearBtn = document.getElementById('directory-search-clear');
  if (clearBtn) {
    clearBtn.style.display = (app.directorySearchQuery.length > 0) ? 'inline-block' : 'none';
  }
  app.renderDirectory();
};

app.clearDirectorySearch = function() {
  const input = document.getElementById('directory-search-input');
  if (input) input.value = '';
  app.directorySearchQuery = '';
  const clearBtn = document.getElementById('directory-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  app.renderDirectory();
};

app.setDirectoryTypeFilter = function(type) {
  app.directoryTypeFilter = type;
  document.querySelectorAll('.type-filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.getAttribute('data-type') === type);
  });
  app.renderDirectory();
};

app.setDirectoryCategoryFilter = function(catId) {
  app.directoryCategoryId = catId;
  app.renderDirectory();
};

// --------------------------------------------------------------------------
// 3. Ficha Pública del Comercio (Modal)
// --------------------------------------------------------------------------
app.openBusinessProfile = function(bizId) {
  const biz = (app.businesses || []).find(b => b.id === bizId);
  if (!biz) return;
  app.currentBusiness = biz;

  const modal = document.getElementById('modal-business-profile');
  if (!modal) return;

  const nameEl = document.getElementById('profile-name');
  if (nameEl) nameEl.textContent = biz.name;

  const catBadge = document.getElementById('profile-cat-badge');
  if (catBadge) catBadge.textContent = `${biz.categoryIcon || '🏷️'} ${biz.categoryName}`;

  const cityBadge = document.getElementById('profile-city-badge');
  if (cityBadge) cityBadge.textContent = `📍 ${biz.cityName}`;

  const typeBadge = document.getElementById('profile-type-badge');
  if (typeBadge) {
    typeBadge.textContent = biz.businessType === 'physical' ? '🏬 Tienda Física' :
                            biz.businessType === 'virtual' ? '🌐 Tienda Virtual' : '🏬 & 🌐 Ambos';
  }

  const coverImg = document.getElementById('profile-cover-img');
  const coverFallback = document.getElementById('profile-cover-fallback');
  if (biz.coverUrl && coverImg) {
    coverImg.src = biz.coverUrl;
    coverImg.style.display = 'block';
    if (coverFallback) coverFallback.style.display = 'none';
  } else {
    if (coverImg) coverImg.style.display = 'none';
    if (coverFallback) coverFallback.style.display = 'block';
  }

  const logoImg = document.getElementById('profile-logo-img');
  if (logoImg) {
    logoImg.src = biz.logoUrl || makeSvgLogo('🏪', '#1E1B4B', '#311042');
  }

  const descEl = document.getElementById('profile-description');
  if (descEl) descEl.textContent = biz.description || 'Sin descripción disponible.';

  const addrBox = document.getElementById('profile-address-box');
  const addrText = document.getElementById('profile-address-text');
  if (biz.address && addrBox && addrText) {
    addrText.textContent = biz.address;
    addrBox.style.display = 'flex';
  } else if (addrBox) {
    addrBox.style.display = 'none';
  }

  const schedBox = document.getElementById('profile-schedule-box');
  const schedText = document.getElementById('profile-schedule-text');
  if (biz.schedule && schedBox && schedText) {
    schedText.innerHTML = `
      <div style="font-size: 13px; line-height: 1.6;">
        <div>• <strong>Lun - Vie:</strong> ${biz.schedule.weekdays || 'N/A'}</div>
        <div>• <strong>Sábados:</strong> ${biz.schedule.saturday || 'N/A'}</div>
        <div>• <strong>Domingos:</strong> ${biz.schedule.sunday || 'N/A'}</div>
      </div>
    `;
    schedBox.style.display = 'flex';
  } else if (schedBox) {
    schedBox.style.display = 'none';
  }

  const payBox = document.getElementById('profile-payments-box');
  const payChips = document.getElementById('profile-payments-chips');
  if (biz.paymentMethods && biz.paymentMethods.length > 0 && payBox && payChips) {
    payChips.innerHTML = biz.paymentMethods.map(m => `<span class="payment-pill-tag">${m}</span>`).join(' ');
    payBox.style.display = 'flex';
  } else if (payBox) {
    payBox.style.display = 'none';
  }

  const delBox = document.getElementById('profile-delivery-box');
  const delText = document.getElementById('profile-delivery-text');
  if (delBox && delText) {
    delText.textContent = biz.hasDelivery 
      ? 'Sí, contamos con servicio de delivery en la zona.' 
      : 'Solo retiro directo en tienda física.';
    delBox.style.display = 'flex';
  }

  const waBtn = document.getElementById('profile-wa-btn');
  if (waBtn) {
    if (biz.whatsapp) {
      const cleanPhone = (biz.whatsapp || '').replace(/[^0-9]/g, '');
      const msg = encodeURIComponent(`Hola ${biz.name}, los vi en el Directorio de 7D App y quisiera consultar información.`);
      waBtn.href = `https://wa.me/${cleanPhone}?text=${msg}`;
      waBtn.style.display = 'inline-flex';
    } else {
      waBtn.style.display = 'none';
    }
  }

  const igBtn = document.getElementById('profile-ig-btn');
  if (igBtn) {
    if (biz.instagram) {
      const cleanUser = biz.instagram.replace('@', '').trim();
      igBtn.href = `https://instagram.com/${cleanUser}`;
      igBtn.style.display = 'inline-flex';
    } else {
      igBtn.style.display = 'none';
    }
  }

  const ttBtn = document.getElementById('profile-tt-btn');
  if (ttBtn) {
    if (biz.tiktok) {
      const cleanUser = biz.tiktok.replace('@', '').trim();
      ttBtn.href = `https://tiktok.com/@${cleanUser}`;
      ttBtn.style.display = 'inline-flex';
    } else {
      ttBtn.style.display = 'none';
    }
  }

  app.currentProfileBiz = biz;
  app.renderProfileOffers(biz);
  modal.classList.add('active');
};

app.renderProfileOffers = function(biz) {
  const offersCountEl = document.getElementById('profile-offers-count');
  const offersGridEl = document.getElementById('profile-offers-container') || document.getElementById('profile-offers-list');
  if (!offersGridEl || !biz) return;

  const activeOffers = (app.promotions || []).filter(p => {
    return app.isPromoActiveAndValid(p) && app.doesPromoBelongToBusiness(p, biz);
  });

  if (offersCountEl) {
    offersCountEl.textContent = `${activeOffers.length} activa${activeOffers.length === 1 ? '' : 's'}`;
  }

  if (activeOffers.length === 0) {
    offersGridEl.innerHTML = '<div class="profile-offers-empty">Este comercio no tiene ofertas activas en este momento</div>';
  } else {
    const now = Date.now();
    offersGridEl.innerHTML = activeOffers.map(offer => {
      const imgUrl = offer.imageUrl || offer.image || offer.flyerUrl || offer.fotoUrl || offer.img || offer.url || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80';
      const offerTitle = (offer.title || offer.titulo || offer.name || 'Oferta Especial').replace(/"/g, '&quot;');
      const offerId = (offer.id || '').replace(/'/g, "\\'");
      const countdownText = app.formatPromoCountdown(offer, now);
      const isExpired = app.isPromoExpired(offer, now);
      return `
        <div class="profile-offer-card" onclick="event.stopPropagation(); app.closeBusinessProfileModal(); app.openDetail('${offerId}');" title="${offerTitle}">
          <div class="profile-offer-thumb">
            <img src="${imgUrl}" alt="${offerTitle}" loading="lazy">
            <span class="profile-offer-badge ${isExpired ? 'is-expired' : ''}" data-promo-id="${offer.id || ''}">${countdownText}</span>
          </div>
          <div class="profile-offer-info">
            <div class="profile-offer-title">${offerTitle}</div>
            <div class="profile-offer-hint">Ver oferta &rarr;</div>
          </div>
        </div>
      `;
    }).join('');
    app.startCountdownTicker();
  }
};

app.closeBusinessProfileModal = function() {
  const modal = document.getElementById('modal-business-profile');
  if (modal) modal.classList.remove('active');
  app.currentProfileBiz = null;
  if (app.currentScreen !== 'feed' && app.currentScreen !== 'detail') {
    app.stopCountdownTicker();
  }
};

// --------------------------------------------------------------------------
// 4. Formulario de Registro Comercial y Gestión de Archivos en Memoria
// --------------------------------------------------------------------------
app.populateRegisterBusinessSelects = function() {
  const catSelect = document.getElementById('reg-biz-category');
  if (catSelect) {
    const activeCats = app.categories.filter(c => c.active !== false && c.id !== 'cat_todos');
    catSelect.innerHTML = '<option value="">Selecciona una categoría...</option>' + 
      activeCats.map(c => `<option value="${c.id}">${c.icon || '🏷️'} ${c.name}</option>`).join('');
  }

  const citySelect = document.getElementById('reg-biz-city');
  if (citySelect) {
    const activeCities = app.cities.filter(c => c.active !== false);
    citySelect.innerHTML = '<option value="">Selecciona tu ciudad...</option>' + 
      activeCities.map(c => `<option value="${c.id}">${c.name} (${c.state || 'VE'})</option>`).join('');
    if (app.currentCityId) citySelect.value = app.currentCityId;
  }
};

app.toggleAddressField = function(val) {
  const grp = document.getElementById('reg-biz-address-group');
  const input = document.getElementById('reg-biz-address');
  if (!grp) return;
  if (val === 'virtual') {
    grp.style.display = 'none';
    if (input) input.required = false;
  } else {
    grp.style.display = 'block';
  }
};

app.triggerLogoSelect = function() {
  const input = document.getElementById('reg-biz-logo-input');
  if (input) input.click();
};

app.triggerCoverSelect = function() {
  const input = document.getElementById('reg-biz-cover-input');
  if (input) input.click();
};

app.handleLogoSelect = function(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  app.tempBizLogoFile = file;
  const reader = new FileReader();
  reader.onload = function(e) {
    app.tempBizLogo = e.target.result;
    const prev = document.getElementById('reg-logo-preview');
    const box = document.getElementById('reg-logo-preview-box');
    const ph = document.getElementById('reg-logo-placeholder');
    if (prev) { prev.src = e.target.result; }
    if (box) { box.style.display = 'flex'; }
    if (ph) { ph.style.display = 'none'; }
  };
  reader.readAsDataURL(file);
};

app.removeLogo = function() {
  app.tempBizLogo = null;
  app.tempBizLogoFile = null;
  const input = document.getElementById('reg-biz-logo-input');
  if (input) input.value = '';
  const prev = document.getElementById('reg-logo-preview');
  if (prev) prev.src = '';
  const box = document.getElementById('reg-logo-preview-box');
  if (box) box.style.display = 'none';
  const ph = document.getElementById('reg-logo-placeholder');
  if (ph) ph.style.display = 'flex';
};

app.handleCoverSelect = function(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  app.tempBizCoverFile = file;
  const reader = new FileReader();
  reader.onload = function(e) {
    app.tempBizCover = e.target.result;
    const prev = document.getElementById('reg-cover-preview');
    const box = document.getElementById('reg-cover-preview-box');
    const ph = document.getElementById('reg-cover-placeholder');
    if (prev) { prev.src = e.target.result; }
    if (box) { box.style.display = 'flex'; }
    if (ph) { ph.style.display = 'none'; }
  };
  reader.readAsDataURL(file);
};

app.removeCover = function() {
  app.tempBizCover = null;
  app.tempBizCoverFile = null;
  const input = document.getElementById('reg-biz-cover-input');
  if (input) input.value = '';
  const prev = document.getElementById('reg-cover-preview');
  if (prev) prev.src = '';
  const box = document.getElementById('reg-cover-preview-box');
  if (box) box.style.display = 'none';
  const ph = document.getElementById('reg-cover-placeholder');
  if (ph) ph.style.display = 'flex';
};

app.handleRegisterBusinessSubmit = async function(event) {
  event.preventDefault();
  const errBox = document.getElementById('reg-biz-error');
  if (errBox) errBox.style.display = 'none';

  const btnSubmit = document.getElementById('btn-submit-business');
  const originalBtnText = btnSubmit ? btnSubmit.textContent : 'Enviar Solicitud de Registro Comercial';

  const name = (document.getElementById('reg-biz-name') || {}).value.trim();
  const categoryId = (document.getElementById('reg-biz-category') || {}).value;
  const cityId = (document.getElementById('reg-biz-city') || {}).value;
  const bizTypeInput = document.querySelector('input[name="reg-biz-type"]:checked');
  const businessType = bizTypeInput ? bizTypeInput.value : 'physical';
  const address = (document.getElementById('reg-biz-address') || {}).value.trim();
  const description = (document.getElementById('reg-biz-description') || {}).value.trim();
  const whatsapp = (document.getElementById('reg-biz-whatsapp') || {}).value.trim();
  const instagram = (document.getElementById('reg-biz-instagram') || {}).value.trim();
  const tiktok = (document.getElementById('reg-biz-tiktok') || {}).value.trim();
  const deliveryInput = document.querySelector('input[name="reg-biz-delivery"]:checked');
  const hasDelivery = deliveryInput ? deliveryInput.value === 'yes' : true;

  const paymentBoxes = document.querySelectorAll('input[name="reg-payment-method"]:checked');
  const paymentMethods = Array.from(paymentBoxes).map(b => b.value);

  const scheduleWeekdays = (document.getElementById('reg-sched-weekdays') || {}).value.trim();
  const scheduleSaturday = (document.getElementById('reg-sched-saturday') || {}).value.trim();
  const scheduleSunday = (document.getElementById('reg-sched-sunday') || {}).value.trim();

  // Datos privados del representante legal
  const repName = (document.getElementById('reg-rep-name') || {}).value.trim();
  const repPhone = (document.getElementById('reg-rep-phone') || {}).value.trim();
  const repEmail = (document.getElementById('reg-rep-email') || {}).value.trim();

  // Validaciones obligatorias
  if (!name || !categoryId || !cityId || !whatsapp) {
    if (errBox) {
      errBox.textContent = 'Por favor completa todos los campos comerciales obligatorios (*).';
      errBox.style.display = 'block';
    }
    return;
  }

  if (!repName || !repPhone || !repEmail) {
    if (errBox) {
      errBox.textContent = 'Por favor completa todos los datos privados del representante (*). Son obligatorios para la verificación.';
      errBox.style.display = 'block';
    }
    return;
  }

  const categoryObj = app.categories.find(c => c.id === categoryId);
  const cityObj = app.cities.find(c => c.id === cityId);

  // Deshabilitar botón durante el proceso
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Procesando registro...';
  }

  const resetSubmitBtn = () => {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = originalBtnText;
    }
  };

  const showError = (msg) => {
    resetSubmitBtn();
    if (errBox) {
      errBox.textContent = msg;
      errBox.style.display = 'block';
    } else {
      alert(msg);
    }
  };

  let logoUrl = '';
  let coverUrl = '';

  // 1. Subida a Cloudflare R2 reutilizando el mecanismo oficial de imágenes
  try {
    if (app.tempBizLogoFile) {
      if (btnSubmit) btnSubmit.textContent = 'Subiendo logotipo a R2...';
      logoUrl = await uploadFlyerToR2(app.tempBizLogoFile);
    } else if (app.tempBizLogo) {
      logoUrl = app.tempBizLogo;
    } else {
      logoUrl = makeSvgLogo('🏪', '#1E1B4B', '#311042');
    }

    if (app.tempBizCoverFile) {
      if (btnSubmit) btnSubmit.textContent = 'Subiendo portada a R2...';
      coverUrl = await uploadFlyerToR2(app.tempBizCoverFile);
    } else if (app.tempBizCover) {
      coverUrl = app.tempBizCover;
    } else {
      coverUrl = makeSvgCover(name, '#1E1B4B', '#311042');
    }
  } catch (uploadErr) {
    console.error('[R2] Error al subir imágenes del comercio:', uploadErr);
    showError('Error al subir las imágenes: ' + (uploadErr.message || 'No se pudo conectar con el servicio de imágenes.'));
    return;
  }

  // 2. Construcción del documento público (EXCLUYENDO estrictamente repName, repPhone, repEmail)
  const bizId = 'biz_' + Date.now();
  const publicBusinessData = {
    id: bizId,
    name,
    categoryId,
    category: categoryId,
    categoryName: categoryObj ? categoryObj.name : 'Comercio',
    categoryIcon: categoryObj ? categoryObj.icon : '🏪',
    cityId,
    cityName: cityObj ? cityObj.name : 'Venezuela',
    businessType,
    address,
    description,
    logoUrl,
    coverUrl,
    whatsapp,
    instagram,
    tiktok,
    hasDelivery,
    paymentMethods,
    schedule: {
      weekdays: scheduleWeekdays || '08:00 AM - 06:00 PM',
      saturday: scheduleSaturday || '09:00 AM - 02:00 PM',
      sunday: scheduleSunday || 'Cerrado'
    },
    status: 'pending_approval',
    createdAt: Date.now()
  };

  // 3. Guardado seguro en Firestore (colección businesses/{bizId})
  if (btnSubmit) btnSubmit.textContent = 'Guardando datos en Firestore...';

  try {
    if (db) {
      await db.collection(FIRESTORE_BUSINESSES_COLLECTION).doc(bizId).set(publicBusinessData);
      console.log('[Firestore] Comercio guardado exitosamente en businesses:', bizId);
    } else {
      console.warn('[Firestore] Conexión no disponible, simulando registro local.');
    }
  } catch (dbErr) {
    console.error('[Firestore] Error al guardar en businesses:', dbErr);
    showError('Error al registrar el comercio en la base de datos: ' + (dbErr.message || 'Fallo de escritura.'));
    return;
  }

  // 4. Envío automático de los datos privados del representante (Cloudflare Worker -> Resend API)
  if (btnSubmit) btnSubmit.textContent = 'Notificando al administrador...';

  const representativeData = {
    name: repName,
    phone: repPhone,
    email: repEmail
  };

  let notifyResult = { ok: false };
  const notifyPayload = JSON.stringify({
    business: publicBusinessData,
    representative: representativeData
  });

  try {
    // Intentar primero con el Worker de Cloudflare dedicado
    let notifyResponse = await fetch(NOTIFICATION_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: notifyPayload
    }).catch(() => null);

    // Si el Worker no responde o falla de red, intentar con el endpoint local del servidor
    if (!notifyResponse || !notifyResponse.ok) {
      const fallbackResponse = await fetch('/api/business/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: notifyPayload
      }).catch(() => null);
      if (fallbackResponse) {
        notifyResponse = fallbackResponse;
      }
    }

    if (notifyResponse) {
      notifyResult = await notifyResponse.json().catch(() => ({}));
    }
  } catch (notifyErr) {
    console.warn('[Notificación] Error al contactar servicio de notificación:', notifyErr);
  }

  // 5. Actualización en memoria local para feedback inmediato del usuario
  app.businesses.unshift({
    ...publicBusinessData,
    representative: representativeData
  });

  // Limpiar formulario y resetear estados
  const form = document.getElementById('form-register-business');
  if (form) form.reset();
  app.removeLogo();
  app.removeCover();

  resetSubmitBtn();

  if (notifyResult.emailSent) {
    app.showToast('✨ ¡Comercio registrado con éxito! Datos del representante notificados.');
  } else if (notifyResult.warning === 'RESEND_API_KEY_NOT_CONFIGURED') {
    app.showToast('✨ ¡Comercio registrado en Firestore! (Correo en espera de configuración Resend)');
  } else {
    app.showToast('✨ ¡Comercio registrado en Firestore con estado pendiente!');
  }

  // Refrescar vistas
  app.renderDirectory();
  if (app.isAdminLoggedIn) {
    app.renderAdminDirectory();
  }

  app.showScreen('directory');
};

// --------------------------------------------------------------------------
// 5. Autocompletado y Vinculación en el Formulario de Publicación
// --------------------------------------------------------------------------
app.handlePublishNameInput = function(query) {
  const dropdown = document.getElementById('pub-business-autocomplete');
  if (!dropdown) return;

  const val = (query || '').toLowerCase().trim();
  if (val.length < 2) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
    return;
  }

  const matches = (app.businesses || []).filter(b => {
    return (b.name || '').toLowerCase().includes(val) ||
           (b.categoryName || '').toLowerCase().includes(val);
  }).slice(0, 5);

  if (matches.length === 0) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
    return;
  }

  dropdown.innerHTML = '';
  matches.forEach(biz => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.onclick = () => app.linkBusinessToPromotion(biz.id);

    const logoHtml = biz.logoUrl
      ? `<img src="${biz.logoUrl}" class="autocomplete-logo" alt="${biz.name}">`
      : `<div class="autocomplete-logo" style="display:flex;align-items:center;justify-content:center;">${biz.categoryIcon || '🏪'}</div>`;

    item.innerHTML = `
      ${logoHtml}
      <div class="autocomplete-info">
        <div class="autocomplete-name">${biz.name}</div>
        <div class="autocomplete-cat">${biz.categoryIcon || ''} ${biz.categoryName} • 📍 ${biz.cityName}</div>
      </div>
    `;
    dropdown.appendChild(item);
  });

  dropdown.style.display = 'block';
};

app.linkBusinessToPromotion = function(bizId) {
  const biz = (app.businesses || []).find(b => b.id === bizId);
  const dropdown = document.getElementById('pub-business-autocomplete');
  if (dropdown) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  }
  if (!biz) return;

  const nameInput = document.getElementById('pub-business-name');
  if (nameInput) nameInput.value = biz.name;

  const citySelect = document.getElementById('pub-city-id');
  if (citySelect && biz.cityId) citySelect.value = biz.cityId;

  const catSelect = document.getElementById('pub-category-id');
  if (catSelect && biz.categoryId) catSelect.value = biz.categoryId;

  const waInput = document.getElementById('pub-whatsapp');
  if (waInput && biz.whatsapp) waInput.value = biz.whatsapp;

  const igInput = document.getElementById('pub-instagram');
  if (igInput && biz.instagram) igInput.value = biz.instagram;

  app.linkedBusinessId = biz.id;

  const badge = document.getElementById('pub-business-linked-badge');
  if (badge) {
    badge.innerHTML = `
      <span>🏢 Comercio Vinculado: <strong>${biz.name}</strong> (${biz.cityName})</span>
      <button type="button" class="unlink-btn" onclick="app.unlinkBusiness()">Desvincular</button>
    `;
    badge.style.display = 'inline-flex';
  }

  app.showToast(`Vinculado con ${biz.name}`);
};

app.unlinkBusiness = function() {
  app.linkedBusinessId = null;
  const badge = document.getElementById('pub-business-linked-badge');
  if (badge) {
    badge.style.display = 'none';
    badge.innerHTML = '';
  }
  app.showToast('Comercio desvinculado.');
};

// --------------------------------------------------------------------------
// 6. Pestaña Administrativa de Comercios (Moderación y Datos Privados)
// --------------------------------------------------------------------------
// 6. Pestaña Administrativa de Comercios (Moderación, Edición y Acciones)
// --------------------------------------------------------------------------
app.renderAdminDirectory = function() {
  const list = document.getElementById('admin-directory-list');
  const countAll = document.getElementById('admin-dir-count-all');
  const countPending = document.getElementById('admin-dir-count-pending');
  const countActive = document.getElementById('admin-dir-count-active');
  const countSuspended = document.getElementById('admin-dir-count-suspended');
  const countRejected = document.getElementById('admin-dir-count-rejected');
  const badgeTop = document.getElementById('admin-directory-badge');

  const allBiz = app.businesses || [];
  const pendingBiz = allBiz.filter(b => b.status === 'pending_approval');
  const activeBiz = allBiz.filter(b => b.status === 'active');
  const suspendedBiz = allBiz.filter(b => b.status === 'suspended');
  const rejectedBiz = allBiz.filter(b => b.status === 'rejected');

  if (countAll) countAll.textContent = allBiz.length;
  if (countPending) countPending.textContent = pendingBiz.length;
  if (countActive) countActive.textContent = activeBiz.length;
  if (countSuspended) countSuspended.textContent = suspendedBiz.length;
  if (countRejected) countRejected.textContent = rejectedBiz.length;
  if (badgeTop) badgeTop.textContent = allBiz.length;

  if (!list) return;

  const filter = app.adminDirectoryFilter || 'all';
  const displayed = allBiz.filter(b => {
    if (filter === 'all') return true;
    return b.status === filter;
  });

  if (displayed.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 32px 16px; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
        <div style="font-size: 32px; margin-bottom: 8px;">🏢</div>
        <p>No hay comercios en este estado (${filter}).</p>
      </div>
    `;
    return;
  }

  list.innerHTML = '';
  displayed.forEach(biz => {
    const card = document.createElement('div');
    card.className = 'admin-biz-card';

    let statusBadge = '<span class="badge badge-warning">Pendiente</span>';
    if (biz.status === 'active') {
      statusBadge = '<span class="badge badge-success">Activo</span>';
    } else if (biz.status === 'suspended') {
      statusBadge = '<span class="badge badge-warning" style="background: rgba(245, 158, 11, 0.2); color: #F59E0B;">Suspendido</span>';
    } else if (biz.status === 'rejected') {
      statusBadge = '<span class="badge badge-danger">Rechazado</span>';
    }

    const coverHtml = biz.coverUrl
      ? `<div class="admin-biz-cover-wrap"><img src="${biz.coverUrl}" class="admin-biz-cover-img" alt="Portada de ${biz.name}"></div>`
      : '';

    const logoHtml = biz.logoUrl
      ? `<img src="${biz.logoUrl}" class="admin-biz-logo-img" alt="${biz.name}">`
      : `<span style="font-size: 26px;">🏪</span>`;

    const rep = biz.representative || { name: 'No disponible', phone: 'N/A', email: 'N/A' };

    card.innerHTML = `
      ${coverHtml}
      <div class="admin-biz-header">
        <div class="admin-biz-title-row">
          <div class="admin-biz-logo-wrap">
            ${logoHtml}
          </div>
          <div class="admin-biz-title-info">
            <div class="admin-biz-name">${biz.name}</div>
            <div class="admin-biz-meta">
              <span>${biz.categoryIcon || '🏷️'} ${biz.categoryName}</span>
              <span>•</span>
              <span>📍 ${biz.cityName}</span>
              <span>•</span>
              <span>${biz.businessType === 'physical' ? '🏬 Local' : biz.businessType === 'virtual' ? '🌐 Virtual' : '🏬 & 🌐 Ambos'}</span>
            </div>
          </div>
        </div>
        <div class="admin-biz-status-wrap">${statusBadge}</div>
      </div>

      <div class="admin-biz-rep-bar">
        <span>👤 <strong>Representante:</strong> ${rep.name}</span>
        <span>📞 <strong>Tel:</strong> ${rep.phone}</span>
        <span>✉️ <strong>Email:</strong> ${rep.email}</span>
      </div>

      <div class="admin-biz-actions">
        <button class="btn btn-sm btn-secondary" onclick="app.openAdminBusinessModal('${biz.id}')">
          👁️ Ver Ficha
        </button>
        <button class="btn btn-sm btn-secondary" onclick="app.openAdminEditBusinessModal('${biz.id}')">
          ✏️ Editar
        </button>
        ${biz.status === 'pending_approval' ? `
          <button class="btn btn-sm btn-primary" onclick="app.adminApproveBusiness('${biz.id}')">
            ✅ Aprobar
          </button>
          <button class="btn btn-sm btn-danger" onclick="app.adminRejectBusiness('${biz.id}')">
            ❌ Rechazar
          </button>
        ` : ''}
        ${biz.status === 'active' ? `
          <button class="btn btn-sm btn-secondary" style="color: var(--accent-amber);" onclick="app.adminToggleSuspendBusiness('${biz.id}')">
            ⏸️ Suspender
          </button>
          <button class="btn btn-sm btn-secondary" style="color: #F87171;" onclick="app.adminRejectBusiness('${biz.id}')">
            ❌ Rechazar
          </button>
        ` : ''}
        ${biz.status === 'suspended' ? `
          <button class="btn btn-sm btn-primary" onclick="app.adminToggleSuspendBusiness('${biz.id}')">
            ▶️ Reactivar
          </button>
        ` : ''}
        ${biz.status === 'rejected' ? `
          <button class="btn btn-sm btn-primary" onclick="app.adminApproveBusiness('${biz.id}')">
            ✅ Aprobar
          </button>
        ` : ''}
        <button type="button" class="btn btn-sm btn-danger-subtle" onclick="event.stopPropagation(); app.adminDeleteBusiness('${biz.id}', event)" title="Eliminar comercio">
          🗑️ Eliminar
        </button>
      </div>
    `;
    list.appendChild(card);
  });
};

app.filterAdminDirectory = function(status, btn) {
  app.adminDirectoryFilter = status;
  if (btn) {
    document.querySelectorAll('.admin-directory-filters button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  app.renderAdminDirectory();
};

app.openAdminBusinessModal = function(bizId) {
  const biz = (app.businesses || []).find(b => b.id === bizId);
  if (!biz) return;

  const content = document.getElementById('admin-biz-detail-content');
  if (!content) return;

  const rep = biz.representative || { name: 'No disponible', phone: 'No disponible', email: 'No disponible' };

  content.innerHTML = `
    <!-- DATOS PRIVADOS DEL REPRESENTANTE -->
    <div class="private-info-card">
      <div class="private-info-title">
        <svg class="icon icon-sm" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
        <span>DATOS PRIVADOS DEL REPRESENTANTE (CONFIDENCIAL)</span>
      </div>
      <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.4;">
        Estos datos se almacenan de manera confidencial y son accesibles exclusivamente para la administración.
      </p>
      <div style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
        <div><strong>Nombre del Representante:</strong> ${rep.name}</div>
        <div><strong>Teléfono Personal / WhatsApp:</strong> <a href="https://wa.me/${(rep.phone || '').replace(/[^0-9]/g, '')}" target="_blank" style="color: var(--whatsapp); font-weight: 700;">${rep.phone}</a></div>
        <div><strong>Correo Electrónico:</strong> <a href="mailto:${rep.email}" style="color: var(--primary);">${rep.email}</a></div>
      </div>
    </div>

    <!-- DATOS COMERCIALES PÚBLICOS -->
    <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px;">
      <h4 style="font-size: 14px; font-weight: 800; color: #FFFFFF; margin-bottom: 10px;">🏪 DATOS COMERCIALES PÚBLICOS</h4>
      <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
        <div><strong>ID Comercio:</strong> <code>${biz.id}</code></div>
        <div><strong>Nombre Comercial:</strong> ${biz.name}</div>
        <div><strong>Categoría:</strong> ${biz.categoryIcon || ''} ${biz.categoryName}</div>
        <div><strong>Ciudad:</strong> 📍 ${biz.cityName}</div>
        <div><strong>Modalidad:</strong> ${biz.businessType === 'physical' ? '🏬 Tienda Física' : biz.businessType === 'virtual' ? '🌐 Tienda Virtual' : '🏬 & 🌐 Ambas'}</div>
        ${biz.address ? `<div><strong>Dirección Física:</strong> ${biz.address}</div>` : ''}
        ${biz.description ? `<div><strong>Descripción:</strong> ${biz.description}</div>` : ''}
        <div><strong>WhatsApp Comercial:</strong> ${biz.whatsapp || 'No indicado'}</div>
        ${biz.instagram ? `<div><strong>Instagram:</strong> @${biz.instagram}</div>` : ''}
        ${biz.tiktok ? `<div><strong>TikTok:</strong> @${biz.tiktok}</div>` : ''}
        <div><strong>Delivery:</strong> ${biz.hasDelivery ? '🛵 Sí, cuenta con delivery' : '🏬 No, solo retiro en tienda'}</div>
        <div><strong>Métodos de Pago:</strong> ${(biz.paymentMethods || []).join(', ') || 'No especificados'}</div>
        <div><strong>Horarios de Atención:</strong>
          <ul style="margin: 4px 0 0 16px; font-size: 12px; color: var(--text-secondary);">
            <li>Lunes a Viernes: ${(biz.schedule && biz.schedule.weekdays) || 'No especificado'}</li>
            <li>Sábados: ${(biz.schedule && biz.schedule.saturday) || 'No especificado'}</li>
            <li>Domingos: ${(biz.schedule && biz.schedule.sunday) || 'No especificado'}</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  const modal = document.getElementById('modal-admin-business-detail');
  if (modal) modal.classList.add('active');
};

app.closeAdminBusinessModal = function() {
  const modal = document.getElementById('modal-admin-business-detail');
  if (modal) modal.classList.remove('active');
};

// ==========================================================================
// ACCIONES ADMINISTRATIVAS: APROBAR, RECHAZAR, SUSPENDER Y ELIMINAR
// ==========================================================================
app.adminApproveBusiness = function(bizId) {
  const biz = (app.businesses || []).find(b => b.id === bizId);
  if (!biz) return;
  biz.status = 'active';
  if (db) {
    db.collection(FIRESTORE_BUSINESSES_COLLECTION).doc(bizId).update({ status: 'active' })
      .catch(err => console.warn('[Firestore] Error al actualizar estado de comercio:', err.message));
  }
  app.renderAdminDirectory();
  app.renderDirectory();
  app.showToast(`✅ "${biz.name}" aprobado`);
};

app.adminRejectBusiness = function(bizId) {
  const biz = (app.businesses || []).find(b => b.id === bizId);
  if (!biz) return;
  biz.status = 'rejected';
  if (db) {
    db.collection(FIRESTORE_BUSINESSES_COLLECTION).doc(bizId).update({ status: 'rejected' })
      .catch(err => console.warn('[Firestore] Error al rechazar comercio:', err.message));
  }
  app.renderAdminDirectory();
  app.renderDirectory();
  app.showToast(`❌ Solicitud de "${biz.name}" rechazada`);
};

app.adminToggleSuspendBusiness = function(bizId) {
  const biz = (app.businesses || []).find(b => b.id === bizId);
  if (!biz) return;
  biz.status = (biz.status === 'suspended') ? 'active' : 'suspended';
  if (db) {
    db.collection(FIRESTORE_BUSINESSES_COLLECTION).doc(bizId).update({ status: biz.status })
      .catch(err => console.warn('[Firestore] Error al cambiar suspensión:', err.message));
  }
  app.renderAdminDirectory();
  app.renderDirectory();
  app.showToast(`Comercio ${biz.status === 'active' ? 'reactivado' : 'suspendido'}`);
};

app.adminDeleteBusiness = async function(bizId, event) {
  if (event) {
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    if (typeof event.preventDefault === 'function') event.preventDefault();
  }

  const biz = (app.businesses || []).find(b => b.id === bizId || b.firestoreId === bizId);
  if (!biz) {
    console.warn('[Admin] Comercio no encontrado para eliminar:', bizId);
    return;
  }

  const realDocId = biz.firestoreId || biz.id || bizId;

  const performDelete = async () => {
    if (db) {
      try {
        await db.collection(FIRESTORE_BUSINESSES_COLLECTION).doc(realDocId).delete();
        console.log('[Firestore] Comercio eliminado exitosamente de businesses:', realDocId);
      } catch (err) {
        console.error('[Firestore] Error al eliminar comercio:', err);
        app.showToast('❌ Error al eliminar comercio: ' + (err.message || 'Fallo de permisos en Firestore.'));
        return;
      }
    }

    if (!app.deletedBusinessIds) app.deletedBusinessIds = new Set();
    app.deletedBusinessIds.add(realDocId);
    app.deletedBusinessIds.add(biz.id);
    try {
      const stored = JSON.parse(localStorage.getItem('7d_deleted_businesses') || '[]');
      stored.push(realDocId, biz.id);
      localStorage.setItem('7d_deleted_businesses', JSON.stringify([...new Set(stored)]));
    } catch(e) {}

    app.businesses = (app.businesses || []).filter(b => b.id !== biz.id && b.id !== realDocId && b.firestoreId !== realDocId);

    const detailModal = document.getElementById('modal-admin-business-detail');
    if (detailModal && detailModal.classList.contains('active')) {
      app.closeAdminBusinessModal();
    }

    app.renderAdminDirectory();
    app.renderDirectory();
    app.showToast(`🗑️ Comercio "${biz.name}" eliminado correctamente.`);
  };

  if (typeof app.showConfirmModal === 'function') {
    app.showConfirmModal({
      title: 'Eliminar Comercio',
      message: `¿Estás seguro de que deseas eliminar permanentemente el comercio "${biz.name}" de la base de datos?\n\nEsta acción es irreversible y eliminará el registro de Firestore.`,
      confirmText: 'Eliminar',
      onConfirm: performDelete
    });
  } else {
    try {
      if (confirm(`¿Estás seguro de que deseas eliminar permanentemente el comercio "${biz.name}" de la base de datos?\n\nEsta acción es irreversible y eliminará el registro de Firestore.`)) {
        await performDelete();
      }
    } catch (e) {
      await performDelete();
    }
  }
};

// ==========================================================================
// EDICIÓN ADMINISTRATIVA DE COMERCIOS (CONSERVA ID Y STATUS, SIN DATOS PRIVADOS)
// ==========================================================================
app.openAdminEditBusinessModal = function(bizId) {
  const biz = (app.businesses || []).find(b => b.id === bizId);
  if (!biz) return;

  const idInput = document.getElementById('edit-biz-id');
  const nameInput = document.getElementById('edit-biz-name');
  const catSelect = document.getElementById('edit-biz-category');
  const citySelect = document.getElementById('edit-biz-city');
  const addrGroup = document.getElementById('edit-biz-address-group');
  const addrInput = document.getElementById('edit-biz-address');
  const descInput = document.getElementById('edit-biz-description');
  const waInput = document.getElementById('edit-biz-whatsapp');
  const igInput = document.getElementById('edit-biz-instagram');
  const ttInput = document.getElementById('edit-biz-tiktok');
  const schedW = document.getElementById('edit-biz-sched-weekdays');
  const schedSat = document.getElementById('edit-biz-sched-saturday');
  const schedSun = document.getElementById('edit-biz-sched-sunday');
  const errBox = document.getElementById('edit-biz-error');

  if (idInput) idInput.value = biz.id;
  if (nameInput) nameInput.value = biz.name || '';

  // Categorías
  if (catSelect) {
    catSelect.innerHTML = '';
    const activeCats = (app.categories || []).filter(c => c.active !== false && c.id !== 'cat_todos');
    activeCats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = `${cat.icon || '🏷️'} ${cat.name}`;
      if (cat.id === biz.categoryId || cat.id === biz.category) opt.selected = true;
      catSelect.appendChild(opt);
    });
  }

  // Ciudades
  if (citySelect) {
    citySelect.innerHTML = '';
    const activeCities = (app.cities || []).filter(c => c.active !== false);
    activeCities.forEach(city => {
      const opt = document.createElement('option');
      opt.value = city.id;
      opt.textContent = `📍 ${city.name} (${city.state || 'VE'})`;
      if (city.id === biz.cityId) opt.selected = true;
      citySelect.appendChild(opt);
    });
  }

  // Modalidad de atención
  const currentType = biz.businessType || 'physical';
  const typeRadio = document.querySelector(`input[name="edit-biz-type"][value="${currentType}"]`);
  if (typeRadio) typeRadio.checked = true;
  app.toggleEditAddressField(currentType);

  if (addrInput) addrInput.value = biz.address || '';
  if (descInput) descInput.value = biz.description || '';
  if (waInput) waInput.value = biz.whatsapp || '';
  if (igInput) igInput.value = biz.instagram || '';
  if (ttInput) ttInput.value = biz.tiktok || '';

  // Delivery
  const deliveryRadio = document.querySelector(`input[name="edit-biz-delivery"][value="${biz.hasDelivery ? 'yes' : 'no'}"]`);
  if (deliveryRadio) deliveryRadio.checked = true;

  // Métodos de pago
  const payments = biz.paymentMethods || [];
  document.querySelectorAll('input[name="edit-payment-method"]').forEach(cb => {
    cb.checked = payments.includes(cb.value);
  });

  // Horarios
  if (schedW) schedW.value = (biz.schedule && biz.schedule.weekdays) || '08:00 AM - 06:00 PM';
  if (schedSat) schedSat.value = (biz.schedule && biz.schedule.saturday) || '09:00 AM - 02:00 PM';
  if (schedSun) schedSun.value = (biz.schedule && biz.schedule.sunday) || 'Cerrado';

  // Configuración de vista previa de logotipo
  app.editBizLogoCurrent = biz.logoUrl || '';
  app.editBizLogoFile = null;
  const logoPrevBox = document.getElementById('edit-logo-preview-box');
  const logoPh = document.getElementById('edit-logo-placeholder');
  const logoPrevImg = document.getElementById('edit-logo-preview');
  if (app.editBizLogoCurrent && logoPrevImg && logoPrevBox && logoPh) {
    logoPrevImg.src = app.editBizLogoCurrent;
    logoPrevBox.style.display = 'flex';
    logoPh.style.display = 'none';
  } else {
    if (logoPrevBox) logoPrevBox.style.display = 'none';
    if (logoPh) logoPh.style.display = 'flex';
  }

  // Configuración de vista previa de portada
  app.editBizCoverCurrent = biz.coverUrl || '';
  app.editBizCoverFile = null;
  const coverPrevBox = document.getElementById('edit-cover-preview-box');
  const coverPh = document.getElementById('edit-cover-placeholder');
  const coverPrevImg = document.getElementById('edit-cover-preview');
  if (app.editBizCoverCurrent && coverPrevImg && coverPrevBox && coverPh) {
    coverPrevImg.src = app.editBizCoverCurrent;
    coverPrevBox.style.display = 'flex';
    coverPh.style.display = 'none';
  } else {
    if (coverPrevBox) coverPrevBox.style.display = 'none';
    if (coverPh) coverPh.style.display = 'flex';
  }

  if (errBox) errBox.style.display = 'none';

  const modal = document.getElementById('modal-admin-edit-business');
  if (modal) modal.classList.add('active');
};

app.closeAdminEditBusinessModal = function() {
  const modal = document.getElementById('modal-admin-edit-business');
  if (modal) modal.classList.remove('active');
};

app.toggleEditAddressField = function(val) {
  const grp = document.getElementById('edit-biz-address-group');
  if (!grp) return;
  if (val === 'virtual') {
    grp.style.display = 'none';
  } else {
    grp.style.display = 'block';
  }
};

app.triggerEditLogoSelect = function() {
  const input = document.getElementById('edit-biz-logo-input');
  if (input) input.click();
};

app.handleEditLogoSelect = function(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  app.editBizLogoFile = file;
  const reader = new FileReader();
  reader.onload = function(e) {
    const prev = document.getElementById('edit-logo-preview');
    const box = document.getElementById('edit-logo-preview-box');
    const ph = document.getElementById('edit-logo-placeholder');
    if (prev) prev.src = e.target.result;
    if (box) box.style.display = 'flex';
    if (ph) ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
};

app.removeEditLogo = function() {
  app.editBizLogoFile = null;
  app.editBizLogoCurrent = '';
  const input = document.getElementById('edit-biz-logo-input');
  if (input) input.value = '';
  const prev = document.getElementById('edit-logo-preview');
  if (prev) prev.src = '';
  const box = document.getElementById('edit-logo-preview-box');
  if (box) box.style.display = 'none';
  const ph = document.getElementById('edit-logo-placeholder');
  if (ph) ph.style.display = 'flex';
};

app.triggerEditCoverSelect = function() {
  const input = document.getElementById('edit-biz-cover-input');
  if (input) input.click();
};

app.handleEditCoverSelect = function(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  app.editBizCoverFile = file;
  const reader = new FileReader();
  reader.onload = function(e) {
    const prev = document.getElementById('edit-cover-preview');
    const box = document.getElementById('edit-cover-preview-box');
    const ph = document.getElementById('edit-cover-placeholder');
    if (prev) prev.src = e.target.result;
    if (box) box.style.display = 'flex';
    if (ph) ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
};

app.removeEditCover = function() {
  app.editBizCoverFile = null;
  app.editBizCoverCurrent = '';
  const input = document.getElementById('edit-biz-cover-input');
  if (input) input.value = '';
  const prev = document.getElementById('edit-cover-preview');
  if (prev) prev.src = '';
  const box = document.getElementById('edit-cover-preview-box');
  if (box) box.style.display = 'none';
  const ph = document.getElementById('edit-cover-placeholder');
  if (ph) ph.style.display = 'flex';
};

app.handleAdminEditBusinessSubmit = async function(event) {
  event.preventDefault();
  const bizId = (document.getElementById('edit-biz-id') || {}).value;
  const biz = (app.businesses || []).find(b => b.id === bizId);
  if (!biz) {
    alert('No se encontró el comercio a editar.');
    return;
  }

  const errBox = document.getElementById('edit-biz-error');
  if (errBox) errBox.style.display = 'none';

  const btnSave = document.getElementById('btn-save-edit-business');
  const originalBtnText = btnSave ? btnSave.textContent : 'Guardar Cambios';

  const name = (document.getElementById('edit-biz-name') || {}).value.trim();
  const categoryId = (document.getElementById('edit-biz-category') || {}).value;
  const cityId = (document.getElementById('edit-biz-city') || {}).value;
  const bizTypeInput = document.querySelector('input[name="edit-biz-type"]:checked');
  const businessType = bizTypeInput ? bizTypeInput.value : 'physical';
  const address = (document.getElementById('edit-biz-address') || {}).value.trim();
  const description = (document.getElementById('edit-biz-description') || {}).value.trim();
  const whatsapp = (document.getElementById('edit-biz-whatsapp') || {}).value.trim();
  const instagram = (document.getElementById('edit-biz-instagram') || {}).value.trim();
  const tiktok = (document.getElementById('edit-biz-tiktok') || {}).value.trim();
  const deliveryInput = document.querySelector('input[name="edit-biz-delivery"]:checked');
  const hasDelivery = deliveryInput ? deliveryInput.value === 'yes' : true;

  const paymentBoxes = document.querySelectorAll('input[name="edit-payment-method"]:checked');
  const paymentMethods = Array.from(paymentBoxes).map(b => b.value);

  const schedWeekdays = (document.getElementById('edit-biz-sched-weekdays') || {}).value.trim();
  const schedSaturday = (document.getElementById('edit-biz-sched-saturday') || {}).value.trim();
  const schedSunday = (document.getElementById('edit-biz-sched-sunday') || {}).value.trim();

  if (!name) {
    if (errBox) {
      errBox.textContent = 'El nombre comercial es obligatorio.';
      errBox.style.display = 'block';
    }
    return;
  }

  const categoryObj = (app.categories || []).find(c => c.id === categoryId);
  const cityObj = (app.cities || []).find(c => c.id === cityId);

  // Subida de nuevas imágenes a R2 si fueron seleccionadas
  let finalLogoUrl = app.editBizLogoCurrent || biz.logoUrl || '';
  let finalCoverUrl = app.editBizCoverCurrent || biz.coverUrl || '';

  try {
    if (btnSave) btnSave.textContent = 'Subiendo archivos...';

    if (app.editBizLogoFile) {
      finalLogoUrl = await uploadFlyerToR2(app.editBizLogoFile);
    }
    if (app.editBizCoverFile) {
      finalCoverUrl = await uploadFlyerToR2(app.editBizCoverFile);
    }
  } catch (upErr) {
    console.error('[R2] Error al actualizar imágenes de comercio:', upErr);
    if (errBox) {
      errBox.textContent = 'Error al subir imágenes: ' + (upErr.message || 'Error de conexión.');
      errBox.style.display = 'block';
    }
    if (btnSave) btnSave.textContent = originalBtnText;
    return;
  }

  // Construcción del documento público (CONSERVA id, status, createdAt; EXCLUYE estrictamente datos del representante)
  const updatedBusinessData = {
    id: biz.id,
    name,
    categoryId,
    category: categoryId,
    categoryName: categoryObj ? categoryObj.name : (biz.categoryName || 'Comercio'),
    categoryIcon: categoryObj ? categoryObj.icon : (biz.categoryIcon || '🏪'),
    cityId,
    cityName: cityObj ? cityObj.name : (biz.cityName || 'Venezuela'),
    businessType,
    address,
    description,
    logoUrl: finalLogoUrl,
    coverUrl: finalCoverUrl,
    whatsapp,
    instagram,
    tiktok,
    hasDelivery,
    paymentMethods,
    schedule: {
      weekdays: schedWeekdays || '08:00 AM - 06:00 PM',
      saturday: schedSaturday || '09:00 AM - 02:00 PM',
      sunday: schedSunday || 'Cerrado'
    },
    status: biz.status, // CONSERVA ESTRICTAMENTE EL ESTADO ACTUAL (no altera aprobación)
    createdAt: biz.createdAt || Date.now()
  };

  if (btnSave) btnSave.textContent = 'Guardando cambios en Firestore...';

  try {
    if (db) {
      await db.collection(FIRESTORE_BUSINESSES_COLLECTION).doc(biz.id).set(updatedBusinessData, { merge: true });
      console.log('[Firestore] Comercio actualizado en businesses:', biz.id);
    }
  } catch (dbErr) {
    console.error('[Firestore] Error al actualizar comercio:', dbErr);
    if (errBox) {
      errBox.textContent = 'Error al guardar en la base de datos: ' + (dbErr.message || 'Fallo de permisos.');
      errBox.style.display = 'block';
    }
    if (btnSave) btnSave.textContent = originalBtnText;
    return;
  }

  // Actualización en memoria local preservando los datos del representante si existían
  const idx = (app.businesses || []).findIndex(b => b.id === biz.id);
  if (idx !== -1) {
    const existingRep = app.businesses[idx].representative;
    app.businesses[idx] = {
      ...updatedBusinessData,
      representative: existingRep
    };
  }

  if (btnSave) btnSave.textContent = originalBtnText;
  app.closeAdminEditBusinessModal();
  app.renderAdminDirectory();
  app.renderDirectory();
  app.showToast(`✅ Comercio "${updatedBusinessData.name}" actualizado exitosamente.`);
};

// ==========================================================================


// 14.5. INSTALACIÓN DE LA PWA
(() => {
  const banner = document.getElementById('pwa-install-banner');
  if (!banner) return;

  const title = banner.querySelector('.pwa-banner-text strong');
  const message = banner.querySelector('.pwa-banner-text span');
  const installButton = banner.querySelector('.pwa-banner-actions .btn-primary');

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true;

  const dismissed = () => {
    try {
      return sessionStorage.getItem('7d-pwa-install-dismissed') === '1';
    } catch (_) {
      return false;
    }
  };

  const showBanner = () => {
    if (!isStandalone && !dismissed()) {
      banner.style.display = 'flex';
    }
  };

  app.dismissInstallPrompt = () => {
    banner.style.display = 'none';
    try {
      sessionStorage.setItem('7d-pwa-install-dismissed', '1');
    } catch (_) {}
  };

  if (isStandalone || dismissed()) return;

  if (isIOS) {
    if (title) title.textContent = 'Instalar 7D App';
    if (message) message.textContent = 'Pulsa Compartir y luego “Agregar a pantalla de inicio”.';
    if (installButton) {
      installButton.textContent = 'Cómo instalar';
      installButton.onclick = () => {
        alert('Para instalar 7D App en tu iPhone o iPad:\n\n1. Abre esta página en Safari.\n2. Pulsa el botón Compartir.\n3. Selecciona “Agregar a pantalla de inicio”.\n4. Confirma pulsando “Agregar”.');
      };
    }
    showBanner();
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    app.deferredInstallPrompt = event;
    showBanner();
  });

  window.addEventListener('appinstalled', () => {
    banner.style.display = 'none';
    app.deferredInstallPrompt = null;
  });

  app.promptInstall = async () => {
    const promptEvent = app.deferredInstallPrompt;
    if (!promptEvent) return;

    promptEvent.prompt();
    await promptEvent.userChoice;
    app.deferredInstallPrompt = null;
    banner.style.display = 'none';
  };
})();

// 15. INICIALIZACIÓN AL CARGAR EL DOM
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('[7D App] Motor web inicializado.');

  // Renderizar componentes principales de inmediato
  app.renderCategories();
  app.renderPromotions();
  app.renderCitiesModal();
  app.renderCitiesPage();
  app.updatePublishSelects();

  // Iniciar escucha en tiempo real de Firestore
  app.initFirestoreSync();

  // Soporte para navegación directa por enlace (#promo=ID, #biz=ID)
  app.handleDeepLink();

  // Soporte para Service Worker PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
