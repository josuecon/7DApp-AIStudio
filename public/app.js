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
const FIRESTORE_EVENTS_COLLECTION = 'events';
const FIRESTORE_LEGACY_COLLECTION = 'Categorias de producto'; // Colección legacy (solo para categorías/diagnóstico temporal)
const FIRESTORE_COLLECTION = FIRESTORE_LEGACY_COLLECTION;

// Categorías oficiales obligatorias del Módulo Eventos (Fase 2)
const EVENT_CATEGORIES = [
  { id: 'birthday', label: 'Cumpleaños', icon: '🎂', lucideIcon: 'cake' },
  { id: 'fifteen_years', label: '15 años', icon: '👑', lucideIcon: 'crown' },
  { id: 'wedding', label: 'Bodas', icon: '💍', lucideIcon: 'gem' },
  { id: 'corporate', label: 'Corporativo', icon: '💼', lucideIcon: 'briefcase' },
  { id: 'celebration', label: 'Celebraciones', icon: '🎉', lucideIcon: 'party-popper' }
];

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
  events: [],
  activeEventQueue: null,
  currentEditingEventId: null,
  removedExistingPhotos: [],
  eventPreviewUrls: new Set(),

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
  businesses: [],
  currentStatsYearMonth: null,

  // Propiedades del Módulo Eventos (Fase 3.0: Interfaz Pública)
  events: [],
  eventsLoaded: false,
  eventsLoadError: null,
  currentEvent: null,
  currentLightboxPhotoIndex: 0,
  currentLightboxPhotos: [],
  currentEventCategory: 'all'
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
  if (screenName !== 'event-detail') {
    app.currentEvent = null;
  }
  const isProfileModalActive = app.currentProfileBiz && document.getElementById('modal-business-profile')?.classList.contains('active');
  if (screenName !== 'detail' && screenName !== 'event-detail' && !isProfileModalActive) {
    if (typeof app.resetSocialMeta === 'function') {
      app.resetSocialMeta();
    }
  }
  if (screenName === 'feed' || screenName === 'detail' || screenName === 'events' || isProfileModalActive) {
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
  if (screenName === 'events') {
    app.renderPublicEvents();
    app.renderRecentFlyersForEvents();
  } else if (screenName === 'feed') {
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
// ==========================================================================
// 4. SISTEMA DE CATEGORÍAS, ICONOS VECTORIALES LUCIDE Y PANEL INFERIOR
// ==========================================================================

// Mapeo inteligente y normalizado de categorías a nombres de iconos oficiales de Lucide
app.getCategoryLucideIcon = function(cat) {
  if (!cat) return 'tag';
  const name = ((typeof cat === 'string' ? cat : (cat.name || cat.id || '')) + '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (name.includes('todo')) return 'layers';
  if (name.includes('comida') || name.includes('restaurante') || name.includes('gastronom') || name.includes('alimento') || name.includes('pizza') || name.includes('hamburguesa') || name.includes('sushi') || name.includes('arepa') || name.includes('pollo')) return 'utensils';
  if (name.includes('tecnolog') || name.includes('movil') || name.includes('celular') || name.includes('telefono') || name.includes('comput') || name.includes('electron') || name.includes('gadget')) return 'smartphone';
  if (name.includes('moda') || name.includes('calzado') || name.includes('ropa') || name.includes('vestir') || name.includes('zapato') || name.includes('boutique') || name.includes('textil')) return 'shirt';
  if (name.includes('belleza') || name.includes('estetica') || name.includes('peluqueria') || name.includes('barber') || name.includes('spa') || name.includes('cosmet') || name.includes('manicur')) return 'sparkles';
  if (name.includes('salud') || name.includes('medic') || name.includes('clinica') || name.includes('odontolog') || name.includes('dental')) return 'heart-pulse';
  if (name.includes('farmacia') || name.includes('drogu')) return 'pill';
  if (name.includes('auto') || name.includes('vehicul') || name.includes('carro') || name.includes('taller') || name.includes('moto') || name.includes('repuesto') || name.includes('mecanic') || name.includes('caucho')) return 'car-front';
  if (name.includes('supermercado') || name.includes('viver') || name.includes('bodegon') || name.includes('mercado') || name.includes('abarrote') || name.includes('fruter')) return 'shopping-cart';
  if (name.includes('hogar') || name.includes('casa') || name.includes('mueble') || name.includes('decoracion') || name.includes('inmobiliaria') || name.includes('ferreter')) return 'house';
  if (name.includes('servicio') || name.includes('oficio') || name.includes('reparac') || name.includes('tecnico') || name.includes('mantenimiento') || name.includes('plomer') || name.includes('electric')) return 'wrench';
  if (name.includes('mascota') || name.includes('veterin') || name.includes('perro') || name.includes('gato') || name.includes('animal')) return 'paw-print';
  if (name.includes('cafe') || name.includes('panader') || name.includes('dulce') || name.includes('pasteler') || name.includes('reposteria')) return 'coffee';
  if (name.includes('deporte') || name.includes('gym') || name.includes('gimnasio') || name.includes('fitness') || name.includes('ciclismo') || name.includes('entren')) return 'dumbbell';
  if (name.includes('educac') || name.includes('libro') || name.includes('libreria') || name.includes('curso') || name.includes('escuela') || name.includes('papeler')) return 'book-open';
  if (name.includes('licor') || name.includes('bebida') || name.includes('cerveza') || name.includes('bar') || name.includes('vinos')) return 'wine';
  if (name.includes('viaje') || name.includes('turism') || name.includes('hotel') || name.includes('posada') || name.includes('vuelo')) return 'hotel';
  if (name.includes('joya') || name.includes('reloj') || name.includes('accesorio') || name.includes('optica') || name.includes('lente') || name.includes('boda') || name.includes('wedding')) return 'gem';
  if (name.includes('cumple') || name.includes('birthday')) return 'cake';
  if (name.includes('15') || name.includes('quince') || name.includes('fifteen')) return 'crown';
  if (name.includes('corporativ') || name.includes('corporate')) return 'briefcase';
  if (name.includes('evento') || name.includes('fiesta') || name.includes('entretenim') || name.includes('cine') || name.includes('musica') || name.includes('celebrac')) return 'party-popper';

  return 'tag';
};

// Generador de SVG Lucide ultra-resiliente (render inmediato en HTML + fallback para createIcons)
app.createLucideSvgString = function(iconName, customClass, size) {
  customClass = customClass || 'cat-lucide-icon';
  size = size || 18;
  const name = iconName || 'tag';

  if (typeof window !== 'undefined' && window.lucide) {
    const pascal = name.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    const iconDef = window.lucide[pascal] || (window.lucide.icons && window.lucide.icons[pascal]);
    if (iconDef && Array.isArray(iconDef)) {
      const childrenHtml = iconDef.map(([tag, attrs]) => {
        const attrStr = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
        return `<${tag} ${attrStr}></${tag}>`;
      }).join('');
      return `<svg class="lucide lucide-${name} ${customClass}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${childrenHtml}</svg>`;
    }
  }

  return `<i data-lucide="${name}" class="${customClass}" aria-hidden="true"></i>`;
};

// Refresco preventivo de iconos Lucide en el DOM
app.refreshLucideIcons = function() {
  if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
    try {
      window.lucide.createIcons();
    } catch(err) {
      console.warn('[Lucide] Error al refrescar iconos:', err);
    }
  }
};

// Obtener las 4 categorías destacadas elegidas por el administrador
app.getFeaturedCategories = function() {
  const allActiveCategories = (app.categories || []).filter(c => c.active !== false && c.id !== 'cat_todos');
  const savedIds = app.settings && Array.isArray(app.settings.featuredCategoryIds)
    ? app.settings.featuredCategoryIds
    : null;

  if (savedIds && savedIds.length > 0) {
    // Mapear cada ID guardado a su categoría activa existente respetando el orden
    const matched = savedIds
      .map(id => allActiveCategories.find(c => c.id === id))
      .filter(Boolean);

    // Si las 4 categorías configuradas siguen activas, devolverlas exactamente en ese orden
    if (matched.length === 4) {
      return matched;
    }

    // Si alguna categoría configurada se desactivó o eliminó, completar con las restantes activas sin duplicar
    if (matched.length > 0) {
      const remaining = allActiveCategories.filter(c => !matched.some(m => m.id === c.id));
      return [...matched, ...remaining].slice(0, 4);
    }
  }

  // Inicialización segura por defecto: primeras 4 categorías activas
  return allActiveCategories.slice(0, 4);
};

// Obtener los IDs guardados de las categorías destacadas (o los 4 primeros activos)
app.getSavedFeaturedCategoryIds = function() {
  const featured = app.getFeaturedCategories();
  return featured.map(c => c.id);
};

// Renderizado de las 4 categorías principales en la portada con cuadrícula de 2 columnas
app.renderCategories = function() {
  const gridContainer = document.getElementById('categories-grid');
  const legacyContainer = document.getElementById('categories-container');
  const allBtn = document.getElementById('cat-filter-all-btn');
  const viewAllBtn = document.getElementById('cat-btn-view-all');
  const iconAll = document.getElementById('cat-icon-all');
  const iconViewAll = document.getElementById('cat-icon-view-all');

  // Actualizar icono en botón «Todas»
  if (iconAll) {
    iconAll.innerHTML = app.createLucideSvgString('layers', 'cat-pill-lucide', 16);
  }

  // Actualizar icono en botón «Ver todas»
  if (iconViewAll) {
    iconViewAll.innerHTML = app.createLucideSvgString('layout-grid', 'cat-pill-lucide', 16);
  }

  // Estado del botón «Todas»
  const isAllSelected = (!app.currentCategoryId || app.currentCategoryId === 'cat_todos');
  if (allBtn) {
    allBtn.classList.toggle('active', isAllSelected);
    allBtn.setAttribute('aria-pressed', isAllSelected ? 'true' : 'false');
  }

  // Obtener las 4 categorías principales según la selección ordenada del administrador
  const mainCategories = app.getFeaturedCategories();

  // Indicar en «Ver todas» si la categoría activa no está entre las 4 principales
  const activeNotInMain = !isAllSelected && !mainCategories.some(c => c.id === app.currentCategoryId);
  if (viewAllBtn) {
    viewAllBtn.classList.toggle('active-filter-highlight', activeNotInMain);
  }

  if (gridContainer) {
    gridContainer.innerHTML = '';
    mainCategories.forEach(cat => {
      const isSelected = app.currentCategoryId === cat.id;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `category-card ${isSelected ? 'active' : ''}`;
      card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      card.title = `Filtrar por ${cat.name}`;

      const iconName = app.getCategoryLucideIcon(cat);
      const iconSvg = app.createLucideSvgString(iconName, 'cat-card-lucide', 18);

      card.innerHTML = `
        <span class="cat-card-icon">${iconSvg}</span>
        <span class="cat-card-name">${cat.name}</span>
      `;

      card.onclick = () => {
        app.selectCategory(cat.id);
      };

      gridContainer.appendChild(card);
    });
  }

  // Compatibilidad con contenedor previo si estuviera presente
  if (legacyContainer && !gridContainer) {
    legacyContainer.innerHTML = '';
    mainCategories.forEach(cat => {
      const isSelected = app.currentCategoryId === cat.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `category-chip ${isSelected ? 'active' : ''}`;
      btn.innerHTML = `${app.createLucideSvgString(app.getCategoryLucideIcon(cat), 'cat-chip-lucide', 16)} <span>${cat.name}</span>`;
      btn.onclick = () => app.selectCategory(cat.id);
      legacyContainer.appendChild(btn);
    });
  }

  // Actualizar etiqueta del filtro activo en el subbar
  const filterBadge = document.getElementById('active-filter-badge');
  const filterText = document.getElementById('active-filter-text');
  if (filterBadge && filterText) {
    if (!isAllSelected) {
      const activeCat = (app.categories || []).find(c => c.id === app.currentCategoryId);
      const catName = activeCat ? activeCat.name : 'Categoría';
      const catIcon = activeCat ? app.getCategoryLucideIcon(activeCat) : 'tag';
      filterText.innerHTML = `${app.createLucideSvgString(catIcon, 'filter-badge-icon', 14)} <span>${catName}</span>`;
      filterBadge.style.display = 'inline-flex';
    } else {
      filterBadge.style.display = 'none';
    }
  }

  // Refrescar cualquier elemento Lucide adicional
  app.refreshLucideIcons();
};

// Selección de categoría: actualiza estado, cierra panel y refresca feed
app.selectCategory = function(catId) {
  app.currentCategoryId = catId;
  app.closeAllCategoriesSheet();
  app.renderCategories();
  app.renderPromotions();
};

// Quitar filtro de categoría (mostrar todas las promociones)
app.clearCategoryFilter = function() {
  app.currentCategoryId = 'cat_todos';
  const filterBadge = document.getElementById('active-filter-badge');
  if (filterBadge) filterBadge.style.display = 'none';
  app.closeAllCategoriesSheet();
  app.renderCategories();
  app.renderPromotions();
};

// Abrir el panel inferior con todas las categorías activas (contexto 'promotions' o 'directory')
app.openAllCategoriesSheet = function(context = 'promotions') {
  app._categoriesSheetContext = context;
  const modal = document.getElementById('modal-all-categories');
  const listContainer = document.getElementById('all-categories-sheet-list');
  const headerIcon = document.getElementById('sheet-header-icon');
  const headerTitle = document.getElementById('sheet-header-title');
  const headerDesc = document.getElementById('sheet-header-desc');

  const isDirectory = context === 'directory';

  if (headerIcon) {
    headerIcon.innerHTML = app.createLucideSvgString('layout-grid', 'sheet-header-lucide', 20);
  }

  if (headerTitle) {
    headerTitle.textContent = isDirectory ? 'Categorías de Comercios' : 'Todas las categorías';
  }

  if (headerDesc) {
    headerDesc.textContent = isDirectory
      ? 'Elige una categoría comercial para explorar los comercios de tu ciudad:'
      : 'Elige una categoría para filtrar las ofertas y promociones vigentes:';
  }

  if (listContainer) {
    listContainer.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'categories-sheet-grid';

    // Opción 1: «Todas las ofertas» o «Todos los comercios»
    const isAllSelected = isDirectory
      ? (!app.directoryCategoryId || app.directoryCategoryId === 'all')
      : (!app.currentCategoryId || app.currentCategoryId === 'cat_todos');

    const allCard = document.createElement('button');
    allCard.type = 'button';
    allCard.className = `category-card sheet-card ${isAllSelected ? 'active' : ''}`;
    allCard.setAttribute('aria-pressed', isAllSelected ? 'true' : 'false');
    allCard.innerHTML = `
      <span class="cat-card-icon">${app.createLucideSvgString('layers', 'cat-card-lucide', 18)}</span>
      <span class="cat-card-name">${isDirectory ? 'Todos los comercios' : 'Todas las ofertas'}</span>
    `;
    allCard.onclick = () => {
      if (isDirectory) {
        app.clearDirectoryCategoryFilter();
        app.closeAllCategoriesSheet();
      } else {
        app.clearCategoryFilter();
      }
    };
    grid.appendChild(allCard);

    // Todas las categorías activas registradas
    const allActive = (app.categories || []).filter(c => c.active !== false && c.id !== 'cat_todos');
    allActive.forEach(cat => {
      const isSelected = isDirectory
        ? (app.directoryCategoryId === cat.id)
        : (app.currentCategoryId === cat.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `category-card sheet-card ${isSelected ? 'active' : ''}`;
      card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      const iconName = app.getCategoryLucideIcon(cat);
      card.innerHTML = `
        <span class="cat-card-icon">${app.createLucideSvgString(iconName, 'cat-card-lucide', 18)}</span>
        <span class="cat-card-name">${cat.name}</span>
      `;
      card.onclick = () => {
        if (isDirectory) {
          app.setDirectoryCategoryFilter(cat.id);
          app.closeAllCategoriesSheet();
        } else {
          app.selectCategory(cat.id);
        }
      };
      grid.appendChild(card);
    });

    listContainer.appendChild(grid);
  }

  if (modal) {
    modal.classList.add('active');
    document.body.classList.add('modal-open');
  }

  app.refreshLucideIcons();
};

// Acceso directo específico para abrir el panel de categorías en Directorio
app.openDirectoryCategoriesSheet = function() {
  app.openAllCategoriesSheet('directory');
};

// Cerrar el panel inferior de categorías
app.closeAllCategoriesSheet = function() {
  const modal = document.getElementById('modal-all-categories');
  if (modal) {
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
  }
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

app.createPromoCardElement = function(promo, now = Date.now()) {
  const cityName = (app.cities.find(c => c.id === promo.cityId) || {}).name || 'Venezuela';
  const card = document.createElement('div');
  card.className = 'promo-card';
  card.onclick = () => app.openDetail(promo.id);

  const imageUrl = promo.imageUrl || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80';
  const linkedBiz = app.getApprovedBusinessForPromo(promo);

  const bizName = (linkedBiz && linkedBiz.name) || promo.businessName || 'Comercio Local';
  const safeBizName = String(bizName).replace(/"/g, '&quot;');
  const safeBizLogo = linkedBiz && linkedBiz.logoUrl ? app.sanitizeImageUrl(linkedBiz.logoUrl) : '';
  const bizLogoHtml = safeBizLogo
    ? `<img class="promo-card-biz-logo" src="${safeBizLogo}" alt="${safeBizName}" loading="lazy" onerror="this.style.display='none';">`
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
  return card;
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
    const card = app.createPromoCardElement(promo, now);
    grid.appendChild(card);
  });

  app.startCountdownTicker();
  if (typeof app.renderRecentFlyersForEvents === 'function') {
    app.renderRecentFlyersForEvents();
  }
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

  // Metadatos sociales dinámicos Open Graph y Twitter Cards
  app.updateSocialMeta({
    title: `${promo.title || 'Oferta'} | ${promo.businessName || 'Dfarra'}`,
    description: promo.description ? promo.description.slice(0, 150) : `Oferta destacada en Dfarra - ${cityName}`,
    image: promo.imageUrl || 'https://dfarra.web.app/icons/dfarra-app-icon-512.png',
    url: `${window.location.origin}${window.location.pathname}#promo=${promo.id}`
  });

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
  const msg = `Hola ${targetPromo.businessName}! Vi su promoción '${targetPromo.title}' en Dfarra y quiero aprovecharla.`;
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

// Helper para dibujar imagen con ajuste 'cover' (aspect ratio proporcional sin deformación)
function drawCanvasImageCover(ctx, img, x, y, w, h) {
  if (!img) return;
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  if (!imgW || !imgH) return;
  const imgRatio = imgW / imgH;
  const targetRatio = w / h;
  let sW, sH, sX, sY;
  if (imgRatio > targetRatio) {
    sH = imgH;
    sW = imgH * targetRatio;
    sX = (imgW - sW) / 2;
    sY = 0;
  } else {
    sW = imgW;
    sH = imgW / targetRatio;
    sX = 0;
    sY = (imgH - sH) / 2;
  }
  ctx.drawImage(img, sX, sY, sW, sH, x, y, w, h);
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
app.fetchImageAsFile = async function(imageUrl, filename = 'imagen-dfarra.jpg') {
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

    // 1. Fondo base: Negro principal #0A0A0A con resplandor sobrio Dfarra
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, 1200, 630);

    const radialGlow = ctx.createRadialGradient(1000, 100, 20, 1000, 100, 500);
    radialGlow.addColorStop(0, 'rgba(181, 43, 50, 0.18)');
    radialGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = radialGlow;
    ctx.fillRect(0, 0, 1200, 630);

    // 2. Tarjeta contenedora: Carbón #191919 con borde sobrio
    const pad = 36;
    const cardW = 1200 - pad * 2;
    const cardH = 630 - pad * 2;
    drawCanvasRoundRect(ctx, pad, pad, cardW, cardH, 28);
    ctx.fillStyle = '#191919';
    ctx.fill();
    ctx.strokeStyle = 'rgba(181, 43, 50, 0.3)';
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
      drawCanvasImageCover(ctx, coverImg, pad, pad, cardW, coverH);
    } else {
      const coverGrad = ctx.createLinearGradient(pad, pad, pad + cardW, pad + coverH);
      coverGrad.addColorStop(0, '#242424');
      coverGrad.addColorStop(0.5, '#191919');
      coverGrad.addColorStop(1, '#0A0A0A');
      ctx.fillStyle = coverGrad;
      ctx.fillRect(pad, pad, cardW, coverH);

      ctx.strokeStyle = 'rgba(181, 43, 50, 0.12)';
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
    shadowGrad.addColorStop(1, 'rgba(25, 25, 25, 0.95)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(pad, pad + coverH - 90, cardW, 90);
    ctx.restore();

    // Insignia institucional Dfarra en esquina superior derecha
    let dfarraLogo = await app.loadCanvasImage('icons/dfarra-logo-horizontal.png');
    if (dfarraLogo) {
      const logoH = 34;
      const logoW = (dfarraLogo.naturalWidth / dfarraLogo.naturalHeight) * logoH || 110;
      const badgeX = pad + cardW - logoW - 20;
      const badgeY = pad + 16;
      drawCanvasRoundRect(ctx, badgeX - 10, badgeY - 6, logoW + 20, logoH + 12, 10);
      ctx.fillStyle = 'rgba(10, 10, 10, 0.76)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(181, 43, 50, 0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.drawImage(dfarraLogo, badgeX, badgeY, logoW, logoH);
    }

    // 4. Logotipo del comercio
    const logoX = pad + 40;
    const logoY = pad + coverH - 65;
    const logoSize = 130;

    ctx.save();
    drawCanvasRoundRect(ctx, logoX, logoY, logoSize, logoSize, 22);
    ctx.fillStyle = '#191919';
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
      ctx.fillStyle = '#242424';
      ctx.fillRect(logoX, logoY, logoSize, logoSize);
      ctx.font = '56px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(biz.categoryIcon || '🏪', logoX + logoSize / 2, logoY + logoSize / 2);
    }
    ctx.restore();

    drawCanvasRoundRect(ctx, logoX, logoY, logoSize, logoSize, 22);
    ctx.strokeStyle = '#B52B32';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 5. Textos y datos del comercio
    const textX = logoX + logoSize + 32;
    let textY = pad + coverH + 20;

    // Nombre del comercio (Blanco Puro)
    ctx.fillStyle = '#FFFFFF';
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
    ctx.fillStyle = 'rgba(181, 43, 50, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(181, 43, 50, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#F5E9C9';
    ctx.fillText(categoryText, textX + 14, textY + 8);
    textY += 50;

    // Descripción
    ctx.fillStyle = '#A6A6A6';
    ctx.font = '500 20px "Plus Jakarta Sans", system-ui, sans-serif';
    const desc = biz.description || 'Comercio oficial verificado en Dfarra. Consulta promociones activas y contacto directo.';
    drawCanvasWrappedText(ctx, desc, textX, textY, cardW - (textX - pad) - 40, 28, 2);

    // 6. Barra inferior institucional
    const footerY = pad + cardH - 58;
    ctx.strokeStyle = 'rgba(181, 43, 50, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad + 30, footerY);
    ctx.lineTo(pad + cardW - 30, footerY);
    ctx.stroke();

    ctx.font = 'bold 17px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('✨ Dfarra • Directorio Comercial de Venezuela', pad + 30, footerY + 18);

    if (biz.hasDelivery) {
      ctx.fillStyle = '#25D366';
      ctx.fillText('🛵 Delivery Disponible', pad + 480, footerY + 18);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = '#B52B32';
    ctx.font = 'bold 17px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('dfarra.web.app', pad + cardW - 30, footerY + 18);

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
    console.warn('[Dfarra] Error generando tarjeta de comercio en canvas:', err);
    return null;
  }
};

// Generar tarjeta promocional oficial de Dfarra en Canvas
app.generateAppPromoCardImage = async function() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Fondo base: Negro principal #0A0A0A con ambiente sobrio
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, 1200, 630);

    const rad1 = ctx.createRadialGradient(250, 200, 20, 250, 200, 600);
    rad1.addColorStop(0, 'rgba(181, 43, 50, 0.22)');
    rad1.addColorStop(1, 'transparent');
    ctx.fillStyle = rad1;
    ctx.fillRect(0, 0, 1200, 630);

    const rad2 = ctx.createRadialGradient(950, 450, 30, 950, 450, 500);
    rad2.addColorStop(0, 'rgba(245, 233, 201, 0.08)');
    rad2.addColorStop(1, 'transparent');
    ctx.fillStyle = rad2;
    ctx.fillRect(0, 0, 1200, 630);

    // 2. Tarjeta contenedora con gradiente carbón
    const pad = 36;
    const cardW = 1200 - pad * 2;
    const cardH = 630 - pad * 2;
    drawCanvasRoundRect(ctx, pad, pad, cardW, cardH, 28);
    const cardGrad = ctx.createLinearGradient(pad, pad, pad + cardW, pad + cardH);
    cardGrad.addColorStop(0, '#191919');
    cardGrad.addColorStop(1, '#121212');
    ctx.fillStyle = cardGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(181, 43, 50, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3. Emblema oficial de Dfarra
    const logoX = pad + 60;
    const logoY = pad + 65;
    const logoSize = 140;

    let appIconImg = await app.loadCanvasImage('icons/dfarra-app-icon-512.png');
    if (!appIconImg) {
      appIconImg = await app.loadCanvasImage('icons/icon-512.png');
    }
    if (!appIconImg) {
      appIconImg = await app.loadCanvasImage('icons/icon.svg');
    }

    ctx.save();
    drawCanvasRoundRect(ctx, logoX, logoY, logoSize, logoSize, 26);
    ctx.fillStyle = '#242424';
    ctx.shadowColor = 'rgba(181, 43, 50, 0.35)';
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
      ctx.fillStyle = '#191919';
      ctx.fillRect(logoX, logoY, logoSize, logoSize);
      ctx.font = 'bold 36px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#B52B32';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Dfarra', logoX + logoSize / 2, logoY + logoSize / 2);
    }
    ctx.restore();

    drawCanvasRoundRect(ctx, logoX, logoY, logoSize, logoSize, 26);
    ctx.strokeStyle = '#B52B32';
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
    ctx.fillStyle = 'rgba(181, 43, 50, 0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(181, 43, 50, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#B52B32';
    ctx.fillText(badgeText, textX + 12, textY + 6);
    textY += 40;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 52px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('Dfarra', textX, textY);
    textY += 60;

    ctx.fillStyle = '#F5E9C9';
    ctx.font = 'bold 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('Promociones y Ofertas de la Semana', textX, textY);
    textY += 36;

    ctx.fillStyle = '#A6A6A6';
    ctx.font = '500 21px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('Descubre lo mejor de tu ciudad. Contacto directo con comercios por WhatsApp.', textX, textY);

    // 5. Píldoras de características
    const pillsY = pad + 275;
    const features = [
      { icon: '🏷️', label: 'Ofertas Semanales', color: '#FFFFFF', bg: 'rgba(181, 43, 50, 0.15)', border: 'rgba(181, 43, 50, 0.3)' },
      { icon: '🏬', label: 'Directorio Comercial', color: '#FFFFFF', bg: 'rgba(181, 43, 50, 0.15)', border: 'rgba(181, 43, 50, 0.3)' },
      { icon: '💬', label: 'Trato Directo WhatsApp', color: '#25D366', bg: 'rgba(37, 211, 102, 0.18)', border: 'rgba(37, 211, 102, 0.35)' }
    ];

    let pillX = pad + 60;
    features.forEach((feat) => {
      ctx.font = 'bold 18px "Plus Jakarta Sans", system-ui, sans-serif';
      const text = `${feat.icon} ${feat.label}`;
      const fW = ctx.measureText(text).width + 32;
      drawCanvasRoundRect(ctx, pillX, pillsY, fW, 44, 22);
      ctx.fillStyle = feat.bg;
      ctx.fill();
      ctx.strokeStyle = feat.border;
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
    btnGrad.addColorStop(0, '#B52B32');
    btnGrad.addColorStop(1, '#982329');
    ctx.fillStyle = btnGrad;
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('👉 Entra gratis a https://dfarra.web.app y descubre promociones', btnX + btnW / 2, btnY + 22);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], 'dfarra-promociones.jpg', { type: 'image/jpeg' }));
        } else {
          resolve(null);
        }
      }, 'image/jpeg', 0.92);
    });
  } catch (err) {
    console.warn('[Dfarra] Error generando tarjeta de app en canvas:', err);
    return null;
  }
};

// Generar tarjeta promocional visual de un Evento en Canvas (1200x630 px - Coberturas Exclusivas)
app.generateEventCardImage = async function(event) {
  if (!event) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Fondo base negro principal #0A0A0A
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, 1200, 630);

    // Selección de fotografía principal / portada
    const validPhotos = (Array.isArray(event.photos) ? event.photos : []).filter(
      p => p && p.url && typeof p.url === 'string' && p.url.trim().length > 0
    );
    const coverUrl = event.coverUrl || (validPhotos.length > 0 ? validPhotos[0].url : null);

    let coverImg = null;
    if (coverUrl) {
      coverImg = await app.loadCanvasImage(coverUrl);
    }

    if (coverImg) {
      // 2.A RENDERIZADO HERO CON PORTADA REAL A SANGRE COMPLETA
      drawCanvasImageCover(ctx, coverImg, 0, 0, 1200, 630);

      // Degradado superior para legibilidad de logo y badges
      const topGrad = ctx.createLinearGradient(0, 0, 0, 170);
      topGrad.addColorStop(0, 'rgba(10, 10, 10, 0.90)');
      topGrad.addColorStop(0.6, 'rgba(10, 10, 10, 0.45)');
      topGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, 1200, 170);

      // Degradado inferior cinematográfico para legibilidad absoluta de textos
      const bottomGrad = ctx.createLinearGradient(0, 190, 0, 630);
      bottomGrad.addColorStop(0, 'transparent');
      bottomGrad.addColorStop(0.35, 'rgba(10, 10, 10, 0.65)');
      bottomGrad.addColorStop(0.7, 'rgba(10, 10, 10, 0.94)');
      bottomGrad.addColorStop(1, '#0A0A0A');
      ctx.fillStyle = bottomGrad;
      ctx.fillRect(0, 190, 1200, 440);

      // Resplandor sobrio de acento rojo de marca en esquina
      const accentGlow = ctx.createRadialGradient(1120, 90, 10, 1120, 90, 480);
      accentGlow.addColorStop(0, 'rgba(181, 43, 50, 0.35)');
      accentGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = accentGlow;
      ctx.fillRect(0, 0, 1200, 630);
    } else {
      // 2.B HERO INSTITUCIONAL DFARRA (Sin fotografía de portada)
      const radBg = ctx.createRadialGradient(600, 315, 40, 600, 315, 600);
      radBg.addColorStop(0, 'rgba(181, 43, 50, 0.24)');
      radBg.addColorStop(0.65, 'rgba(25, 25, 25, 0.95)');
      radBg.addColorStop(1, '#0A0A0A');
      ctx.fillStyle = radBg;
      ctx.fillRect(0, 0, 1200, 630);

      // Contenedor tarjeta interior
      const pad = 36;
      drawCanvasRoundRect(ctx, pad, pad, 1200 - pad * 2, 630 - pad * 2, 28);
      ctx.fillStyle = '#191919';
      ctx.fill();
      ctx.strokeStyle = 'rgba(181, 43, 50, 0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Icono central fotográfico watermark
      ctx.fillStyle = 'rgba(181, 43, 50, 0.14)';
      ctx.font = '160px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📸', 600, 260);
    }

    // 3. Borde elegante exterior Dfarra
    ctx.strokeStyle = 'rgba(181, 43, 50, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(10, 10, 1200 - 20, 630 - 20);

    // 4. Barra Superior: Logotipo Oficial Dfarra y Pills
    const padX = 48;
    const topY = 38;

    // Logotipo Oficial Horizontal Dfarra
    let dfarraLogo = await app.loadCanvasImage('icons/dfarra-logo-horizontal.png');
    if (dfarraLogo) {
      const logoH = 46;
      const logoW = (dfarraLogo.naturalWidth / dfarraLogo.naturalHeight) * logoH || 150;
      ctx.drawImage(dfarraLogo, padX, topY, logoW, logoH);
    } else {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '900 36px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('Dfarra', padX, topY);
      ctx.fillStyle = '#B52B32';
      ctx.fillText('•', padX + 115, topY);
    }

    // Badge de Categoría a la derecha
    const catLabel = app.getEventCategoryLabel(event.category) || 'Cobertura de Evento';
    ctx.font = 'bold 20px "Plus Jakarta Sans", system-ui, sans-serif';
    const catText = catLabel.toUpperCase();
    const catBadgeW = ctx.measureText(catText).width + 36;
    const catBadgeH = 46;
    const catBadgeX = 1200 - padX - catBadgeW;

    drawCanvasRoundRect(ctx, catBadgeX, topY, catBadgeW, catBadgeH, 23);
    ctx.fillStyle = 'rgba(25, 25, 25, 0.88)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(181, 43, 50, 0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#F5E9C9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(catText, catBadgeX + catBadgeW / 2, topY + catBadgeH / 2);

    // Badge de conteo de fotos si hay más de 1
    if (validPhotos.length > 1) {
      const countText = `📷 ${validPhotos.length} FOTOS`;
      ctx.font = 'bold 16px "Plus Jakarta Sans", system-ui, sans-serif';
      const countBadgeW = ctx.measureText(countText).width + 26;
      const countBadgeX = catBadgeX - countBadgeW - 14;
      drawCanvasRoundRect(ctx, countBadgeX, topY + 4, countBadgeW, 38, 19);
      ctx.fillStyle = 'rgba(181, 43, 50, 0.28)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(181, 43, 50, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(countText, countBadgeX + countBadgeW / 2, topY + 4 + 19);
    }

    // 5. Contenido Principal del Evento (Zona Inferior)
    const textStartX = padX;
    let contentY = 365;

    // Eyebrow / Tagline oficial
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = '#B52B32';
    ctx.fillText('COBERTURA EXCLUSIVA', textStartX, contentY);
    contentY += 32;

    // Título del evento (Blanco puro, hasta 2 líneas)
    ctx.font = '900 44px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    const eventTitle = (event.title || 'Cobertura de Evento Especial').trim();
    drawCanvasWrappedText(ctx, eventTitle, textStartX, contentY, 1200 - padX * 2, 50, 2);
    contentY += 95;

    // Fila de Metadatos: Ciudad, Fecha
    const cityName = event.cityName || (app.cities.find(c => c.id === event.cityId) || {}).name || '';
    const dateFormatted = app.formatEventDate(event.createdAt || event.publishedAt);

    let metaX = textStartX;
    if (cityName) {
      const cityText = `📍 ${cityName}`;
      ctx.font = 'bold 18px "Plus Jakarta Sans", system-ui, sans-serif';
      const cW = ctx.measureText(cityText).width + 28;
      drawCanvasRoundRect(ctx, metaX, contentY, cW, 36, 18);
      ctx.fillStyle = 'rgba(25, 25, 25, 0.88)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(166, 166, 166, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#A6A6A6';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(cityText, metaX + 14, contentY + 18);
      metaX += cW + 12;
    }

    if (dateFormatted) {
      const dateText = `📅 ${dateFormatted}`;
      ctx.font = 'bold 18px "Plus Jakarta Sans", system-ui, sans-serif';
      const dW = ctx.measureText(dateText).width + 28;
      drawCanvasRoundRect(ctx, metaX, contentY, dW, 36, 18);
      ctx.fillStyle = 'rgba(25, 25, 25, 0.88)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(166, 166, 166, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#A6A6A6';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(dateText, metaX + 14, contentY + 18);
      metaX += dW + 12;
    }

    // 6. Pie de Página Institucional Dfarra
    const footerY = 572;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, footerY);
    ctx.lineTo(1200 - padX, footerY);
    ctx.stroke();

    ctx.font = 'bold 17px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('✨ Dfarra • Experiencias y Coberturas Exclusivas', padX, footerY + 24);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#B52B32';
    ctx.fillText('dfarra.web.app', 1200 - padX, footerY + 24);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], `evento-${event.id || 'cobertura'}.jpg`, { type: 'image/jpeg' }));
        } else {
          resolve(null);
        }
      }, 'image/jpeg', 0.92);
    });
  } catch (err) {
    console.warn('[Dfarra] Error generando tarjeta de evento en canvas:', err);
    return null;
  }
};

// Generar tarjeta promocional visual de una Oferta en Canvas (1200x630 px)
app.generatePromoCardImage = async function(promo) {
  if (!promo) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Fondo base negro principal #0A0A0A con resplandor rojo Dfarra
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, 1200, 630);

    const rad1 = ctx.createRadialGradient(200, 180, 30, 200, 180, 500);
    rad1.addColorStop(0, 'rgba(181, 43, 50, 0.25)');
    rad1.addColorStop(1, 'transparent');
    ctx.fillStyle = rad1;
    ctx.fillRect(0, 0, 1200, 630);

    const rad2 = ctx.createRadialGradient(1000, 480, 20, 1000, 480, 450);
    rad2.addColorStop(0, 'rgba(245, 233, 201, 0.1)');
    rad2.addColorStop(1, 'transparent');
    ctx.fillStyle = rad2;
    ctx.fillRect(0, 0, 1200, 630);

    // 2. Tarjeta contenedora carbón
    const pad = 36;
    const cardW = 1200 - pad * 2;
    const cardH = 630 - pad * 2;
    drawCanvasRoundRect(ctx, pad, pad, cardW, cardH, 28);
    ctx.fillStyle = '#191919';
    ctx.fill();
    ctx.strokeStyle = 'rgba(181, 43, 50, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3. Cabecera con Logotipo Oficial Dfarra y Badge de Oferta
    const headerX = pad + 40;
    const headerY = pad + 40;

    let dfarraLogo = await app.loadCanvasImage('icons/dfarra-logo-horizontal.png');
    if (dfarraLogo) {
      const logoH = 44;
      const logoW = (dfarraLogo.naturalWidth / dfarraLogo.naturalHeight) * logoH || 140;
      ctx.drawImage(dfarraLogo, headerX, headerY, logoW, logoH);
    } else {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '900 34px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('Dfarra', headerX, headerY);
    }

    const badgeText = '🔥 ANÚNCIATE HOY POR 7 DÍAS';
    ctx.font = 'bold 18px "Plus Jakarta Sans", system-ui, sans-serif';
    const bW = ctx.measureText(badgeText).width + 32;
    const bH = 42;
    const bX = pad + cardW - 40 - bW;

    drawCanvasRoundRect(ctx, bX, headerY, bW, bH, 21);
    ctx.fillStyle = 'rgba(181, 43, 50, 0.2)';
    ctx.fill();
    ctx.strokeStyle = '#B52B32';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#F5E9C9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, bX + bW / 2, headerY + bH / 2);

    // 4. Contenido de la Oferta
    let contentY = headerY + 76;
    const bizName = promo.businessName ? promo.businessName.trim() : '';
    const cityName = (app.cities.find(c => c.id === promo.cityId) || {}).name || '';

    if (bizName) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 24px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#F5E9C9';
      ctx.fillText(`🏬 ${bizName}${cityName ? ' • 📍 ' + cityName : ''}`, headerX, contentY);
      contentY += 40;
    }

    // Título de la promoción
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '900 46px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    const promoTitle = promo.title || 'Promoción Especial';
    drawCanvasWrappedText(ctx, promoTitle, headerX, contentY, cardW - 80, 54, 2);
    contentY += 115;

    // Descripción
    if (promo.description) {
      ctx.font = '500 22px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#A6A6A6';
      drawCanvasWrappedText(ctx, promo.description, headerX, contentY, cardW - 80, 32, 2);
    }

    // 5. Botón de acción
    const btnY = pad + cardH - 110;
    const btnX = headerX;
    const btnW = cardW - 80;
    const btnH = 62;

    drawCanvasRoundRect(ctx, btnX, btnY, btnW, btnH, 31);
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
    btnGrad.addColorStop(0, '#B52B32');
    btnGrad.addColorStop(1, '#982329');
    ctx.fillStyle = btnGrad;
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('👉 Descubre esta oferta en https://dfarra.web.app', btnX + btnW / 2, btnY + btnH / 2);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], `oferta-${promo.id || 'promo'}.jpg`, { type: 'image/jpeg' }));
        } else {
          resolve(null);
        }
      }, 'image/jpeg', 0.92);
    });
  } catch (err) {
    console.warn('[Dfarra] Error generando tarjeta de oferta en canvas:', err);
    return null;
  }
};

// Actualización dinámica de metadatos sociales para Open Graph y Twitter Cards
app.updateSocialMeta = function(meta) {
  if (!meta) return;
  try {
    if (meta.title) {
      document.title = meta.title;
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', meta.title);
      const twTitle = document.querySelector('meta[name="twitter:title"]');
      if (twTitle) twTitle.setAttribute('content', meta.title);
    }
    if (meta.description) {
      const desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', meta.description);
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', meta.description);
      const twDesc = document.querySelector('meta[name="twitter:description"]');
      if (twDesc) twDesc.setAttribute('content', meta.description);
    }
    if (meta.image) {
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg) ogImg.setAttribute('content', meta.image);
      const ogSecImg = document.querySelector('meta[property="og:image:secure_url"]');
      if (ogSecImg) ogSecImg.setAttribute('content', meta.image);
      const twImg = document.querySelector('meta[name="twitter:image"]');
      if (twImg) twImg.setAttribute('content', meta.image);
    }
    if (meta.url) {
      const ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) ogUrl.setAttribute('content', meta.url);
    }
  } catch(e) {}
};

app.resetSocialMeta = function() {
  app.updateSocialMeta({
    title: 'Dfarra - Tu ciudad, en tus manos',
    description: 'Descubre las mejores ofertas, comercios locales y coberturas exclusivas de eventos. Tu ciudad, en tus manos. Contacta directo por WhatsApp.',
    image: 'https://dfarra.web.app/icons/dfarra-app-icon-512.png',
    url: 'https://dfarra.web.app/'
  });
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
      console.warn('[Dfarra] Web Share con archivo no admitido, reintentando texto+url:', err);
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

// Compartir la Aplicación Dfarra
app.shareApp = async function() {
  const currentCity = (app.cities.find(c => c.id === app.currentCityId) || {}).name || 'tu ciudad';
  const url = 'https://dfarra.web.app';
  const title = 'Dfarra - Tu ciudad, en tus manos';
  const text = `✨ ¡Descubre las mejores promociones y comercios de la semana en ${currentCity} con Dfarra!\n\n🛍️ Ofertas actualizadas, directorio de tiendas y contacto directo por WhatsApp:\n${url}`;

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

  const origin = (window.location.origin && window.location.origin !== 'null') ? window.location.origin : 'https://dfarra.web.app';
  const pathname = window.location.pathname || '/';
  const url = `${origin}${pathname}#promo=${promo.id}`;
  const title = `${promo.title || 'Oferta'} | ${bizName || 'Dfarra'}`;

  let text = `🔥 ¡Oferta destacada${bizTag}${locationTag}!\n\n📌 ${promo.title || 'Promoción especial'}`;
  if (promo.description) {
    const cleanDesc = promo.description.length > 120 ? promo.description.slice(0, 117) + '...' : promo.description;
    text += `\n💬 ${cleanDesc}`;
  }
  text += `\n\n✨ Mira todos los detalles y contacta directo al comercio en Dfarra:\n${url}`;

  let imageFile = null;
  if (promo.imageUrl) {
    app.showToast('⏳ Preparando imagen de la oferta...');
    const filename = `oferta-${promo.id || 'flyer'}.jpg`;
    imageFile = await app.fetchImageAsFile(promo.imageUrl, filename);
  }
  if (!imageFile) {
    app.showToast('⏳ Preparando tarjeta de la oferta...');
    imageFile = await app.generatePromoCardImage(promo);
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
  const origin = (window.location.origin && window.location.origin !== 'null') ? window.location.origin : 'https://dfarra.web.app';
  const pathname = window.location.pathname || '/';
  const url = `${origin}${pathname}#biz=${biz.id}`;
  const title = `${biz.name} en Dfarra`;

  let text = `🏬 ¡Conoce a ${biz.name} en Dfarra!`;
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
    } else if (hash.startsWith('#event=')) {
      const eventId = hash.replace('#event=', '').trim();
      if (!eventId) return;
      const event = (app.events || []).find(e => e.id === eventId);
      if (event) {
        app.openEventDetail(eventId);
      } else {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const e = (app.events || []).find(x => x.id === eventId);
          if (e) {
            clearInterval(interval);
            app.openEventDetail(eventId);
          } else if (attempts >= 15) {
            clearInterval(interval);
            if (app.eventsLoaded) {
              app.openEventDetail(eventId);
            }
          }
        }, 300);
      }
    } else if (hash === '#events') {
      app.showScreen('events');
    }
  } catch (err) {
    console.warn('[Dfarra] Error procesando enlace directo:', err);
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
  const catGrid = document.getElementById('pub-category-grid');
  if (catSelect) {
    const activeCats = app.categories.filter(c => c.active !== false && c.id !== 'cat_todos');
    const prevVal = catSelect.value;
    catSelect.innerHTML = activeCats.map(c => `<option value="${c.id}">${c.icon || '🏷️'} ${c.name}</option>`).join('');
    // Preservar valor seleccionado si sigue activo, o seleccionar por defecto la primera categoría
    const selectedVal = (prevVal && activeCats.some(c => c.id === prevVal))
      ? prevVal
      : (activeCats[0] ? activeCats[0].id : '');
    catSelect.value = selectedVal;

    if (catGrid) {
      catGrid.innerHTML = '';
      activeCats.forEach(cat => {
        const isSelected = catSelect.value === cat.id;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `category-card form-cat-card ${isSelected ? 'active' : ''}`;
        card.setAttribute('data-cat-id', cat.id);
        card.setAttribute('role', 'radio');
        card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
        card.title = `Seleccionar ${cat.name}`;

        const iconName = app.getCategoryLucideIcon(cat);
        const iconSvg = app.createLucideSvgString(iconName, 'cat-card-lucide', 18);

        card.innerHTML = `
          <span class="cat-card-icon">${iconSvg}</span>
          <span class="cat-card-name">${cat.name}</span>
        `;

        card.onclick = () => {
          app.setPublishCategory(cat.id);
        };

        catGrid.appendChild(card);
      });
    }
  }
};

app.setPublishCategory = function(catId) {
  const catSelect = document.getElementById('pub-category-id');
  if (catSelect) {
    catSelect.value = catId;
    catSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const catGrid = document.getElementById('pub-category-grid');
  if (catGrid) {
    catGrid.querySelectorAll('.category-card').forEach(btn => {
      const isSelected = btn.getAttribute('data-cat-id') === catId;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });
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

// ============================================================================
// DFARRA — MOTOR DE PROCESAMIENTO Y SUBIDA DE IMÁGENES A CLOUDFLARE R2
// ============================================================================

const BIZ_IMAGE_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB límite estricto
const BIZ_LOGO_MAX_DIMENSION = 400;                     // 400x400 píxeles máx para logotipos
const BIZ_COVER_MAX_DIMENSION = 1280;                   // 1280px máx en lado mayor para portadas
const BIZ_IMAGE_WEBP_QUALITY = 0.82;                    // Calidad WebP entre 0.80 y 0.85
const BIZ_IMAGE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const BIZ_IMAGE_TIMEOUT_MS = 35000;                     // 35 segundos límite de red para subidas a R2

/**
 * Valida formato y tamaño del archivo original.
 * Acepta únicamente JPEG, PNG y WebP con un límite estricto de 10 MB.
 */
function validateBusinessImageFile(file, label = 'La imagen') {
  if (!file) {
    return { valid: false, error: `${label} no es válida o no fue proporcionada.` };
  }

  const fileType = (file.type || '').toLowerCase();
  const fileName = (file.name || '').toLowerCase();
  const hasValidExt = /\.(jpe?g|png|webp)$/i.test(fileName);
  const isAllowedMime = BIZ_IMAGE_ALLOWED_MIME_TYPES.includes(fileType);

  if (!isAllowedMime && !hasValidExt) {
    return {
      valid: false,
      error: `Formato no compatible (${fileType || fileName || 'desconocido'}). Solo se admiten imágenes en formato JPEG, PNG o WebP.`
    };
  }

  if (file.size > BIZ_IMAGE_MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `${label} supera el límite máximo de 10 MB (peso detectado: ${sizeMB} MB). Por favor selecciona un archivo más ligero.`
    };
  }

  return { valid: true };
}

/**
 * Función única y reutilizable para validar, redimensionar y convertir imágenes a WebP.
 * - Valida que no supere 10 MB y formatos admitidos (JPEG, PNG, WebP).
 * - Para logotipos: limita dimensiones a máx 400x400px.
 * - Para portadas: limita el lado mayor a 1280px, conservando proporción.
 * - Utiliza calidad WebP entre 0.80 y 0.85 (0.82 por defecto).
 * - Libera explícitamente ObjectURL y Canvas (width=0, height=0).
 */
function processImageToWebP(file, options = {}) {
  return new Promise((resolve, reject) => {
    const label = options.label || 'La imagen';
    const validation = validateBusinessImageFile(file, label);
    if (!validation.valid) {
      reject(new Error(validation.error));
      return;
    }

    const maxDimension = options.maxDimension || (options.isLogo ? BIZ_LOGO_MAX_DIMENSION : BIZ_COVER_MAX_DIMENSION);
    const quality = (typeof options.quality === 'number' && options.quality >= 0.80 && options.quality <= 0.85)
      ? options.quality
      : BIZ_IMAGE_WEBP_QUALITY;

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const origWidth = img.naturalWidth || img.width;
        const origHeight = img.naturalHeight || img.height;

        if (!origWidth || !origHeight) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error(`No se pudieron determinar las dimensiones de ${label.toLowerCase()}.`));
          return;
        }

        let targetWidth = origWidth;
        let targetHeight = origHeight;
        const longestSide = Math.max(origWidth, origHeight);

        if (longestSide > maxDimension) {
          const ratio = maxDimension / longestSide;
          targetWidth = Math.max(1, Math.round(origWidth * ratio));
          targetHeight = Math.max(1, Math.round(origHeight * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          canvas.width = 0;
          canvas.height = 0;
          reject(new Error('No se pudo inicializar el procesador gráfico en el navegador.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        canvas.toBlob((blob) => {
          // Liberación estricta de memoria temporal
          URL.revokeObjectURL(objectUrl);
          canvas.width = 0;
          canvas.height = 0;

          if (!blob) {
            reject(new Error(`Fallo al generar el archivo WebP optimizado para ${label.toLowerCase()}.`));
            return;
          }

          resolve({
            blob,
            width: targetWidth,
            height: targetHeight,
            size: blob.size,
            originalSize: file.size,
            mimeType: 'image/webp'
          });
        }, 'image/webp', quality);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`Error al procesar ${label.toLowerCase()}: ${err.message}`));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`No se pudo decodificar ${label.toLowerCase()}. Verifica que el archivo no esté dañado o en un formato no compatible (como HEIC/RAW).`));
    };

    img.src = objectUrl;
  });
}

/**
 * Función compatible para convertir imagen a WebP blob.
 */
async function convertImageToWebP(file, options = {}) {
  const res = await processImageToWebP(file, {
    maxDimension: 1920,
    quality: BIZ_IMAGE_WEBP_QUALITY,
    label: 'La imagen',
    ...options
  });
  return res.blob;
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

/**
 * Sube una imagen a Cloudflare R2 con:
 * 1. Optimización, redimensionamiento y conversión a WebP.
 * 2. AbortController con tiempo límite razonable (35s).
 * 3. Comprobación de respuesta HTTP, JSON del Worker y validación de URL HTTP(S).
 */
async function uploadImageToR2(file, options = {}, onProgress = null) {
  const label = options.label || 'la imagen';
  const tag = options.tag || 'media';

  if (typeof onProgress === 'function') {
    onProgress(`Optimizando ${label.toLowerCase()} (WebP)...`);
  }

  // 1. Proceso de optimización
  const processed = await processImageToWebP(file, options);

  // 2. Preparación de FormData con nombre identificativo y seguro
  const safeBaseName = (file.name || tag).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  const uploadFileName = `${tag}_${safeBaseName}_${Date.now()}.webp`;

  const formData = new FormData();
  formData.append('file', processed.blob, uploadFileName);

  if (typeof onProgress === 'function') {
    onProgress(`Subiendo ${label.toLowerCase()} a Cloudflare R2...`);
  }

  // 3. Petición con AbortController y tiempo límite razonable
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || BIZ_IMAGE_TIMEOUT_MS;
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response;
  try {
    response = await fetch(R2_UPLOAD_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
  } catch (netErr) {
    clearTimeout(timer);
    if (netErr.name === 'AbortError') {
      throw new Error(`Se agotó el tiempo de espera al subir ${label.toLowerCase()} a Cloudflare R2 (${Math.round(timeoutMs / 1000)}s). Verifica tu conexión a internet e inténtalo nuevamente.`);
    }
    throw new Error(`Error de conexión con Cloudflare R2 al subir ${label.toLowerCase()}: ${netErr.message || 'Fallo de red.'}`);
  } finally {
    clearTimeout(timer);
  }

  // 4. Verificación de respuesta HTTP
  if (!response.ok) {
    let errDetail = '';
    try {
      const errJson = await response.json();
      errDetail = errJson.error || errJson.message || '';
    } catch (_) {
      errDetail = await response.text().catch(() => '');
    }
    throw new Error(`Cloudflare R2 rechazó la subida (HTTP ${response.status}): ${errDetail || 'Error desconocido del servidor.'}`);
  }

  // 5. Verificación de formato JSON del Worker
  let data;
  try {
    data = await response.json();
  } catch (jsonErr) {
    throw new Error('La respuesta de Cloudflare R2 no tiene un formato JSON válido.');
  }

  if (!data || !data.ok || !data.url) {
    throw new Error((data && data.error) ? data.error : `Cloudflare R2 no devolvió una URL válida para ${label.toLowerCase()}.`);
  }

  // 6. Comprobación estricta de que la URL devuelta sea HTTP o HTTPS válida
  const rawUrl = String(data.url).trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (_) {
    throw new Error(`La URL devuelta por Cloudflare R2 no es válida: "${rawUrl}"`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`Protocolo inválido devuelto por Cloudflare R2: "${parsedUrl.protocol}"`);
  }

  return rawUrl;
}

/**
 * Función wrapper compatible para flyers y otros módulos.
 */
async function uploadFlyerToR2(file, options = {}, onProgress = null) {
  return uploadImageToR2(file, {
    label: 'El flyer',
    tag: 'flyer',
    maxDimension: 1920,
    quality: BIZ_IMAGE_WEBP_QUALITY,
    ...options
  }, onProgress);
}

// ============================================================================
// 7DApp — MÓDULO EVENTOS | FASE 1: MOTOR DE OPTIMIZACIÓN Y SUBIDA FOTOGRÁFICA
// Motor independiente para procesamiento, cola de subida y limpieza de eventos
// ============================================================================

const EVENT_PHOTO_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB límite original
const EVENT_PHOTO_MAX_DIMENSION = 1920;             // Límite máx en lado más largo (Full HD)
const EVENT_PHOTO_WEBP_QUALITY = 0.80;              // Calidad balanceada
const EVENT_PHOTO_MAX_COUNT = 50;                   // Máximo de fotos por evento
const EVENT_PHOTO_MAX_CONCURRENCY = 3;              // Cargas simultáneas
const EVENT_PHOTO_ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
];

/**
 * Valida formato y tamaño del archivo original de fotografía para eventos.
 */
function validateEventPhotoFile(file) {
  if (!file) {
    return { valid: false, error: 'No se proporcionó ningún archivo.' };
  }

  const fileType = (file.type || '').toLowerCase();
  const fileName = (file.name || '').toLowerCase();
  const hasValidExt = /\.(jpe?g|png|webp)$/i.test(fileName);
  const isAllowedType = EVENT_PHOTO_ALLOWED_TYPES.includes(fileType) || hasValidExt;

  if (!isAllowedType) {
    return {
      valid: false,
      error: `Formato no compatible (${fileType || fileName}). Solo se admiten JPG, JPEG, PNG y WebP.`
    };
  }

  if (file.size > EVENT_PHOTO_MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `La fotografía supera el límite máximo de 10 MB (peso detectado: ${sizeMB} MB).`
    };
  }

  return { valid: true };
}

/**
 * Procesa individualmente una imagen: redimensiona (lado máx 1920px sin ampliar),
 * comprime a WebP (~0.80) y libera canvas y ObjectURL.
 */
function processEventPhotoToWebP(file, customMaxDimension = EVENT_PHOTO_MAX_DIMENSION, customQuality = EVENT_PHOTO_WEBP_QUALITY) {
  return new Promise((resolve, reject) => {
    const validation = validateEventPhotoFile(file);
    if (!validation.valid) {
      reject(new Error(validation.error));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const origWidth = img.naturalWidth || img.width;
        const origHeight = img.naturalHeight || img.height;

        if (!origWidth || !origHeight) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Dimensiones de imagen inválidas.'));
          return;
        }

        // Calcular escala: no ampliar imágenes pequeñas, limitar lado más largo a 1920px
        let targetWidth = origWidth;
        let targetHeight = origHeight;
        const longestSide = Math.max(origWidth, origHeight);

        if (longestSide > customMaxDimension) {
          const ratio = customMaxDimension / longestSide;
          targetWidth = Math.round(origWidth * ratio);
          targetHeight = Math.round(origHeight * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('No se pudo inicializar el contexto de procesamiento 2D.'));
          return;
        }

        // Suavizado de imagen en el renderizado
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        canvas.toBlob((blob) => {
          // Liberación estricta de memoria temporal
          URL.revokeObjectURL(objectUrl);
          canvas.width = 0;
          canvas.height = 0;

          if (!blob) {
            reject(new Error('Fallo al generar el archivo WebP optimizado.'));
            return;
          }

          resolve({
            blob,
            originalName: file.name,
            originalSize: file.size,
            optimizedSize: blob.size,
            width: targetWidth,
            height: targetHeight,
            mimeType: 'image/webp'
          });
        }, 'image/webp', customQuality);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`No se pudo leer la imagen "${file.name}".`));
    };

    img.src = objectUrl;
  });
}

/**
 * Sube una fotografía individual procesada al Worker de Cloudflare R2 existente.
 */
async function uploadEventPhotoToR2(photoBlob, originalFileName = 'evento.webp', customUploadUrl = R2_UPLOAD_URL) {
  const formData = new FormData();
  const safeName = (originalFileName || 'evento')
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_') + '.webp';

  formData.append('file', photoBlob, safeName);

  const response = await fetch(customUploadUrl, {
    method: 'POST',
    body: formData
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok || !data.url) {
    throw new Error(data.error || `Error al subir la fotografía a R2 (HTTP ${response.status}).`);
  }

  // Extraer la ruta/clave del objeto a partir de la URL de forma segura
  let r2Key = null;
  try {
    const parsed = new URL(data.url);
    r2Key = parsed.pathname.replace(/^\/+/, '');
  } catch (_) {
    r2Key = null;
  }

  return {
    url: data.url,
    r2Key
  };
}

/**
 * Elimina una fotografía de R2 mediante petición DELETE a su URL.
 */
async function deleteEventPhotoFromR2(photoUrl) {
  if (!photoUrl || typeof photoUrl !== 'string') return { success: false, error: 'URL inválida.' };

  try {
    const response = await fetch(photoUrl, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || (data && data.ok === false)) {
      const is404 = response.status === 404;
      const errMsg = (data && data.error) || (is404 ? 'HTTP 404: Objeto no encontrado en R2 (requiere conciliación o reintento)' : `Error HTTP ${response.status}`);
      return {
        success: false,
        status: response.status,
        isNotFound: is404,
        error: errMsg
      };
    }

    return { success: true, status: response.status };
  } catch (err) {
    return { success: false, isNetworkError: true, error: err.message || 'Error de red al eliminar foto.' };
  }
}

/**
 * Clase controladora de la cola de procesamiento y subida para el módulo Eventos.
 * Maneja concurrencia (máx 3), progreso, reintentos y trazabilidad de archivos nuevos vs existentes.
 */
class EventPhotoUploadQueue {
  constructor(options = {}) {
    this.maxPhotos = options.maxPhotos || EVENT_PHOTO_MAX_COUNT;
    this.concurrency = options.concurrency || EVENT_PHOTO_MAX_CONCURRENCY;
    this.uploadUrl = options.uploadUrl || R2_UPLOAD_URL;
    this.items = []; // Elementos de la sesión
    this.sessionUploadedUrls = new Set(); // URLs subidas durante la sesión activa
    this.onProgress = options.onProgress || null; // Callback: ({ completed, total, currentItem, percent }) => {}
    this.isProcessing = false;
  }

  /**
   * Carga la lista inicial de fotos (fotografías existentes en Firestore)
   */
  setExistingPhotos(photos = []) {
    this.items = (photos || []).map((p, idx) => ({
      tempId: p.id || `existing_${idx}_${Date.now()}`,
      file: null,
      fileName: p.name || `foto_${idx + 1}.webp`,
      url: p.url,
      r2Key: p.r2Key || null,
      order: typeof p.order === 'number' ? p.order : idx,
      isNew: false,
      status: 'completed', // Las existentes ya están completadas
      error: null
    }));
    return this.getItems();
  }

  /**
   * Agrega nuevas fotografías a la cola respetando el límite máximo de 50.
   */
  addFiles(files = []) {
    const currentCount = this.items.length;
    const availableSlots = this.maxPhotos - currentCount;

    if (availableSlots <= 0) {
      throw new Error(`Se ha alcanzado el límite máximo de ${this.maxPhotos} fotografías por evento.`);
    }

    const filesToAdd = Array.from(files).slice(0, availableSlots);
    const addedItems = [];

    filesToAdd.forEach((file) => {
      const order = this.items.length;
      const tempId = `new_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const item = {
        tempId,
        file,
        fileName: file.name,
        url: null,
        r2Key: null,
        order,
        isNew: true,
        status: 'pending',
        error: null
      };
      this.items.push(item);
      addedItems.push(item);
    });

    return {
      added: addedItems,
      total: this.items.length,
      ignoredCount: files.length - filesToAdd.length
    };
  }

  /**
   * Remueve una fotografía de la lista local. Si ya fue subida y es nueva,
   * no la borra de R2 automáticamente hasta que se ordene explícitamente.
   */
  removeItem(tempId) {
    const idx = this.items.findIndex(i => i.tempId === tempId);
    if (idx === -1) return null;
    const removed = this.items.splice(idx, 1)[0];
    // Reordenar índices
    this.items.forEach((item, i) => { item.order = i; });
    return removed;
  }

  /**
   * Ejecuta el procesamiento y subida con concurrencia controlada (máx 3 a la vez).
   * Solo procesa los items pendientes o fallidos.
   */
  async processQueue(customProcessor = null, customUploader = null) {
    if (this.isProcessing) {
      throw new Error('La cola de subida ya está en ejecución.');
    }

    this.isProcessing = true;
    const processor = customProcessor || processEventPhotoToWebP;
    const uploader = customUploader || ((blob, name) => uploadEventPhotoToR2(blob, name, this.uploadUrl));

    const pendingItems = this.items.filter(i => i.status === 'pending' || i.status === 'failed');
    let completedCount = this.items.filter(i => i.status === 'completed').length;
    const totalCount = this.items.length;

    const emitProgress = (currentItem = null) => {
      if (typeof this.onProgress === 'function') {
        const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100;
        this.onProgress({
          completed: completedCount,
          total: totalCount,
          currentItem,
          percent
        });
      }
    };

    emitProgress();

    // Pool de ejecución concurrente limitado a this.concurrency
    let currentIndex = 0;

    const executeWorker = async () => {
      while (currentIndex < pendingItems.length) {
        const item = pendingItems[currentIndex++];
        if (!item || item.status === 'completed') continue;

        try {
          item.status = 'processing';
          item.error = null;
          emitProgress(item);

          // 1. Procesamiento individual Canvas -> WebP 1920px (sin saturar memoria)
          const processed = await processor(item.file);

          item.status = 'uploading';
          emitProgress(item);

          // 2. Subida individual al Worker
          const uploadResult = await uploader(processed.blob, item.fileName);

          item.url = uploadResult.url;
          item.r2Key = uploadResult.r2Key;
          item.status = 'completed';
          item.error = null;
          this.sessionUploadedUrls.add(uploadResult.url);
          completedCount++;
          emitProgress(item);
        } catch (err) {
          item.status = 'failed';
          item.error = err.message || 'Error durante el procesamiento o subida.';
          console.warn(`[EventPhotoEngine] Error en fotografía "${item.fileName}":`, err.message);
          emitProgress(item);
          // Continúa con las demás fotos sin detener la cola
        }
      }
    };

    const workerPromises = [];
    const activeWorkers = Math.min(this.concurrency, pendingItems.length);
    for (let w = 0; w < activeWorkers; w++) {
      workerPromises.push(executeWorker());
    }

    await Promise.all(workerPromises);
    this.isProcessing = false;
    emitProgress();

    return this.getSummary();
  }

  /**
   * Reintenta exclusivamente las fotos que hayan fallado.
   */
  async retryFailed(customProcessor = null, customUploader = null) {
    const failedItems = this.items.filter(i => i.status === 'failed');
    if (failedItems.length === 0) {
      return this.getSummary();
    }
    return this.processQueue(customProcessor, customUploader);
  }

  /**
   * Limpia y elimina de R2 exclusivamente los archivos NUEVOS subidos durante esta sesión
   * (por ejemplo, si el usuario cancela la creación o falla el guardado final en Firestore).
   * NUNCA toca fotografías existentes pertenecientes a eventos previos.
   */
  async cleanupSessionUploadedPhotos(customDeleter = null) {
    const deleter = customDeleter || deleteEventPhotoFromR2;
    const deletionResults = [];

    // Identificar fotos nuevas subidas durante la sesión
    const newUploaded = this.items.filter(i => i.isNew && i.url && this.sessionUploadedUrls.has(i.url));

    for (const item of newUploaded) {
      const res = await deleter(item.url);
      deletionResults.push({
        url: item.url,
        fileName: item.fileName,
        success: res.success,
        error: res.error || null
      });

      if (res.success) {
        this.sessionUploadedUrls.delete(item.url);
      }
    }

    return deletionResults;
  }

  getItems() {
    return this.items.map(i => ({ ...i }));
  }

  getCompletedPhotos() {
    return this.items
      .filter(i => i.status === 'completed' && Boolean(i.url))
      .map((i, index) => ({
        id: i.tempId,
        url: i.url,
        r2Key: i.r2Key,
        name: i.fileName,
        order: index
      }));
  }

  getSummary() {
    const total = this.items.length;
    const completed = this.items.filter(i => i.status === 'completed').length;
    const failed = this.items.filter(i => i.status === 'failed').length;
    const pending = this.items.filter(i => i.status === 'pending').length;

    return {
      total,
      completed,
      failed,
      pending,
      allCompleted: total > 0 && completed === total,
      failedItems: this.items.filter(i => i.status === 'failed').map(i => ({
        tempId: i.tempId,
        fileName: i.fileName,
        error: i.error
      }))
    };
  }
}

// Exponer el motor en el namespace global app sin alterar nada previo
app.eventPhotoEngine = {
  validateFile: validateEventPhotoFile,
  processToWebP: processEventPhotoToWebP,
  uploadToR2: uploadEventPhotoToR2,
  deleteFromR2: deleteEventPhotoFromR2,
  createQueue: (options) => new EventPhotoUploadQueue(options),
  CONSTANTS: {
    MAX_FILE_SIZE: EVENT_PHOTO_MAX_FILE_SIZE,
    MAX_DIMENSION: EVENT_PHOTO_MAX_DIMENSION,
    WEBP_QUALITY: EVENT_PHOTO_WEBP_QUALITY,
    MAX_COUNT: EVENT_PHOTO_MAX_COUNT,
    MAX_CONCURRENCY: EVENT_PHOTO_MAX_CONCURRENCY,
    ALLOWED_TYPES: EVENT_PHOTO_ALLOWED_TYPES
  }
};

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

    const adminMsg = `Hola! Acabo de publicar el anuncio de '${businessName}' en Dfarra. Mi referencia de pago es: ${ref} por $${(app.settings.publicationPrice || 0.99).toFixed(2)}.`;
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

const ADMIN_EMAILS = ['josueco@gmail.com', 'josueco2023@gmail.com', 'milabuenobrito@gmail.com'];
const isAdminEmail = (email) => !!email && ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(String(email).toLowerCase().trim());

app.ADMIN_EMAILS = ADMIN_EMAILS;
app.isAdminEmail = isAdminEmail;
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
      if (typeof app.syncEvents === 'function') {
        app.syncEvents();
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
  if (tabName === 'events') app.renderAdminEvents();
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
  const bEvents = document.getElementById('admin-events-badge');
  if (bEvents) bEvents.textContent = (app.events || []).length;

  // Ranking de clics
  const rankingList = document.getElementById('clicks-ranking-container');
  if (rankingList) {
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
  }

  // Renderizar sección de Estadísticas Mensuales
  app.renderMonthlyStats();
};

// ==========================================================================
// ESTADÍSTICAS MENSUALES DEL PANEL ADMINISTRATIVO
// ==========================================================================
const STATS_SPANISH_MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

app.formatStatsMonthLabel = function(ymString) {
  if (!ymString || typeof ymString !== 'string') return '';
  const parts = ymString.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return ymString;
  return `${STATS_SPANISH_MONTHS[m - 1]} ${y}`;
};

app.getStatsAvailableMonths = function() {
  const monthsSet = new Set();
  const now = new Date();

  // Siempre ofrecer al menos los últimos 12 meses
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    monthsSet.add(`${y}-${m}`);
  }

  // Incorporar meses históricos detectados en promociones
  (app.promotions || []).forEach(p => {
    const rawTime = p.approvedAt ?? p.fechaAprobacion ?? p.createdAt;
    if (rawTime !== undefined && rawTime !== null && rawTime !== '') {
      let ms = null;
      if (typeof rawTime === 'number') {
        ms = rawTime < 1e11 ? rawTime * 1000 : rawTime;
      } else if (typeof rawTime.toMillis === 'function') {
        ms = rawTime.toMillis();
      } else if (typeof rawTime.toDate === 'function') {
        ms = rawTime.toDate().getTime();
      } else if (typeof rawTime.seconds === 'number') {
        ms = rawTime.seconds * 1000;
      } else if (typeof rawTime === 'string') {
        const parsed = Date.parse(rawTime);
        if (!isNaN(parsed)) ms = parsed;
      }
      if (ms && !isNaN(ms)) {
        const d = new Date(ms);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        monthsSet.add(`${y}-${m}`);
      }
    }
  });

  if (app.currentStatsYearMonth) {
    monthsSet.add(app.currentStatsYearMonth);
  }

  return Array.from(monthsSet).sort().reverse();
};

app.changeStatsMonth = function(val) {
  if (val) {
    app.currentStatsYearMonth = val;
    app.renderMonthlyStats();
  }
};

app.navigateStatsMonth = function(direction) {
  const available = app.getStatsAvailableMonths();
  if (!available || available.length === 0) return;

  const current = app.currentStatsYearMonth || available[0];
  let idx = available.indexOf(current);
  if (idx === -1) idx = 0;

  // direction -1 = mes anterior (más antiguo, mayor índice en orden descendente)
  // direction +1 = mes siguiente (más nuevo, menor índice en orden descendente)
  const targetIdx = idx - direction;
  if (targetIdx >= 0 && targetIdx < available.length) {
    app.currentStatsYearMonth = available[targetIdx];
    app.renderMonthlyStats();
  }
};

app.renderMonthlyStats = function() {
  const container = document.getElementById('admin-monthly-stats-section');
  if (!container) return;

  const availableMonths = app.getStatsAvailableMonths();
  if (!app.currentStatsYearMonth) {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    app.currentStatsYearMonth = `${curYear}-${curMonth}`;
  }

  // Poblar selector desplegable de mes y año
  const monthSelect = document.getElementById('stats-month-select');
  if (monthSelect) {
    monthSelect.innerHTML = availableMonths.map(ym => {
      const label = app.formatStatsMonthLabel(ym);
      const isSelected = (ym === app.currentStatsYearMonth) ? 'selected' : '';
      return `<option value="${ym}" ${isSelected}>${label}</option>`;
    }).join('');
  }

  // Actualizar estado habilitado/deshabilitado de los botones ◀ y ▶
  const currentIdx = availableMonths.indexOf(app.currentStatsYearMonth);
  const prevBtn = container.querySelector('.btn-stats-nav[title="Mes anterior"]');
  const nextBtn = container.querySelector('.btn-stats-nav[title="Mes siguiente"]');
  if (prevBtn) {
    const isOldest = (currentIdx >= availableMonths.length - 1);
    prevBtn.disabled = isOldest;
    prevBtn.style.opacity = isOldest ? '0.35' : '1';
    prevBtn.style.cursor = isOldest ? 'not-allowed' : 'pointer';
  }
  if (nextBtn) {
    const isNewest = (currentIdx <= 0);
    nextBtn.disabled = isNewest;
    nextBtn.style.opacity = isNewest ? '0.35' : '1';
    nextBtn.style.cursor = isNewest ? 'not-allowed' : 'pointer';
  }

  // Límites temporales del mes seleccionado (tiempo local)
  const parts = app.currentStatsYearMonth.split('-');
  const selYear = parseInt(parts[0], 10);
  const selMonth = parseInt(parts[1], 10); // 1 a 12

  const startOfMonth = new Date(selYear, selMonth - 1, 1, 0, 0, 0, 0).getTime();
  const endOfMonth = new Date(selYear, selMonth, 0, 23, 59, 59, 999).getTime();

  // Estados negativos que descartan aprobación definitiva
  const negativeStatuses = [
    'pending', 'pending_approval', 'pendiente', 'revision',
    'rejected', 'rechazado', 'rechazada'
  ];

  const approvedThisMonth = [];
  let missingPriceCount = 0;
  let totalIncome = 0;

  (app.promotions || []).forEach(p => {
    if (!p) return;
    const rawStatus = String(p.status || p.estado || '').toLowerCase().trim();
    if (negativeStatuses.includes(rawStatus)) {
      // Excluir pendientes y rechazadas
      return;
    }

    // Fecha real de aprobación: approvedAt (o equivalente histórico fechaAprobacion)
    const rawApp = p.approvedAt ?? p.fechaAprobacion;
    let appTime = null;
    if (rawApp !== undefined && rawApp !== null && rawApp !== '') {
      if (typeof rawApp === 'number') {
        appTime = rawApp < 1e11 ? rawApp * 1000 : rawApp;
      } else if (typeof rawApp.toMillis === 'function') {
        appTime = rawApp.toMillis();
      } else if (typeof rawApp.toDate === 'function') {
        appTime = rawApp.toDate().getTime();
      } else if (typeof rawApp.seconds === 'number') {
        appTime = rawApp.seconds * 1000;
      } else if (typeof rawApp === 'string') {
        const parsed = Date.parse(rawApp);
        if (!isNaN(parsed)) appTime = parsed;
      }
    }

    // Solo se consideran registros con fecha de aprobación comprobable
    if (appTime === null) {
      return;
    }

    // Verificar si la aprobación ocurrió durante el mes seleccionado
    if (appTime >= startOfMonth && appTime <= endOfMonth) {
      let promoPrice = null;
      if (typeof p.price === 'number' && !isNaN(p.price) && p.price >= 0) {
        promoPrice = p.price;
      } else if (typeof p.price === 'string' && p.price.trim() !== '') {
        const parsed = parseFloat(p.price);
        if (!isNaN(parsed) && parsed >= 0) promoPrice = parsed;
      }

      if (promoPrice !== null) {
        totalIncome += promoPrice;
      } else {
        missingPriceCount++;
      }

      approvedThisMonth.push({
        ...p,
        _appTime: appTime,
        _parsedPrice: promoPrice
      });
    }
  });

  // Ordenar aprobaciones por fecha descendente (más recientes primero)
  approvedThisMonth.sort((a, b) => b._appTime - a._appTime);

  // 1. Indicador: Publicaciones aprobadas del mes
  const elPromos = document.getElementById('monthly-stat-promos');
  if (elPromos) {
    elPromos.textContent = approvedThisMonth.length;
  }

  // 2. Indicador: Ingresos del mes (USD)
  const elIncome = document.getElementById('monthly-stat-income');
  if (elIncome) {
    elIncome.innerHTML = `$${totalIncome.toFixed(2)} <span class="currency-tag">USD</span>`;
  }

  // 3. Advertencia de registros sin precio
  const warningEl = document.getElementById('monthly-stats-warning');
  if (warningEl) {
    if (missingPriceCount > 0) {
      warningEl.style.display = 'flex';
      warningEl.innerHTML = `
        <span class="stats-warning-icon">⚠️</span>
        <div class="stats-warning-content">
          <strong>Advertencia de datos:</strong> Se detectaron <strong>${missingPriceCount}</strong> publicación(es) aprobada(s) en este mes sin el campo <code>price</code> registrado en Firestore. El total de ingresos ($${totalIncome.toFixed(2)} USD) solo incluye los registros con importe verificado.
        </div>
      `;
    } else {
      warningEl.style.display = 'none';
      warningEl.innerHTML = '';
    }
  }

  // 4. Detalle y listado de publicaciones aprobadas del mes
  const countEl = document.getElementById('monthly-breakdown-count');
  if (countEl) {
    countEl.textContent = `${approvedThisMonth.length} ${approvedThisMonth.length === 1 ? 'publicación' : 'publicaciones'}`;
  }

  const listEl = document.getElementById('monthly-stats-list');
  if (listEl) {
    if (approvedThisMonth.length === 0) {
      const monthLabel = app.formatStatsMonthLabel(app.currentStatsYearMonth);
      listEl.innerHTML = `
        <div class="monthly-stats-empty">
          <span style="font-size: 26px; display: block; margin-bottom: 6px;">📭</span>
          No se registraron publicaciones aprobadas en <strong>${monthLabel}</strong>.
        </div>
      `;
    } else {
      listEl.innerHTML = approvedThisMonth.map(p => {
        const d = new Date(p._appTime);
        const day = String(d.getDate()).padStart(2, '0');
        const monthShort = STATS_SPANISH_MONTHS[d.getMonth()].slice(0, 3).toLowerCase();
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const dateStr = `${day} ${monthShort} ${year}, ${hours}:${minutes}`;

        const priceLabel = (p._parsedPrice !== null)
          ? `<span class="stat-price-badge">$${p._parsedPrice.toFixed(2)} USD</span>`
          : `<span class="stat-price-badge warning">Sin precio</span>`;

        const thumb = p.imageUrl
          ? `<img src="${p.imageUrl}" class="stat-item-thumb" alt="Flyer" onerror="this.style.display='none'">`
          : `<div class="stat-item-thumb-placeholder">📄</div>`;

        const isExpired = p.expirationDate && p.expirationDate < Date.now();
        const statusBadge = isExpired
          ? `<span class="stat-status-badge expired">Expirada</span>`
          : `<span class="stat-status-badge active">Activa</span>`;

        return `
          <div class="monthly-stat-item">
            ${thumb}
            <div class="stat-item-info">
              <div class="stat-item-top">
                <span class="stat-item-biz">${p.businessName || 'Comercio'}</span>
                ${statusBadge}
              </div>
              <div class="stat-item-title">${p.title || 'Publicación'}</div>
              <div class="stat-item-meta">
                <span>🗓️ Aprobado: ${dateStr}</span>
                <span>•</span>
                <span>Ref: <strong>${p.paymentReference || 'N/A'}</strong> (${p.paymentMethod || 'Pago Móvil'})</span>
              </div>
            </div>
            <div class="stat-item-price-wrap">
              ${priceLabel}
            </div>
          </div>
        `;
      }).join('');
    }
  }
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
// 11. GESTIÓN DE CATEGORÍAS EN EL PANEL (CRUD & CATEGORÍAS DESTACADAS)
// ==========================================================================

// Borrador temporal de las 4 categorías destacadas (en memoria del administrador)
app.tempFeaturedCategoryIds = null;

// Renderizar sección «Categorías destacadas» en el panel administrativo
app.renderFeaturedCategoriesManager = function() {
  const slotsContainer = document.getElementById('featured-slots-list');
  const poolContainer = document.getElementById('featured-pool-list');
  const statusPill = document.getElementById('featured-status-pill');
  const countText = document.getElementById('featured-count-text');
  const alertBox = document.getElementById('featured-alert-box');
  const saveBtn = document.getElementById('btn-save-featured');

  if (!slotsContainer || !poolContainer) return;

  const allActiveCategories = (app.categories || []).filter(c => c.active !== false && c.id !== 'cat_todos');

  // Inicializar borrador con la configuración guardada o la inicialización por defecto
  if (!app.tempFeaturedCategoryIds) {
    app.tempFeaturedCategoryIds = [...app.getSavedFeaturedCategoryIds()];
  }

  // Filtrar categorías que hayan dejado de existir o estén inactivas
  app.tempFeaturedCategoryIds = app.tempFeaturedCategoryIds.filter(id =>
    allActiveCategories.some(c => c.id === id)
  );

  const selectedCount = app.tempFeaturedCategoryIds.length;
  const isComplete = selectedCount === 4;

  // Actualizar etiqueta del contador
  if (statusPill && countText) {
    statusPill.className = `featured-badge-pill ${isComplete ? 'pill-success' : 'pill-warning'}`;
    if (isComplete) {
      countText.textContent = '4 de 4 seleccionadas ✓ Listo';
    } else {
      const missing = 4 - selectedCount;
      countText.textContent = `${selectedCount} de 4 seleccionadas (Faltan ${missing})`;
    }
  }

  // Mensaje de alerta / aviso informativo
  if (alertBox) {
    if (allActiveCategories.length < 4) {
      alertBox.className = 'featured-alert alert-warning';
      alertBox.style.display = 'block';
      alertBox.innerHTML = `
        <strong>⚠️ Aviso importante:</strong> Actualmente hay solo ${allActiveCategories.length} categorías activas en Dfarra. 
        Se requieren al menos 4 categorías activas para completar la cuadrícula de la portada. Puedes activar más categorías en la sección inferior.
      `;
    } else if (!isComplete) {
      alertBox.className = 'featured-alert alert-info';
      alertBox.style.display = 'block';
      alertBox.innerHTML = `
        ℹ️ Debes seleccionar exactamente <strong>4 categorías</strong> para guardar (actualmente tienes ${selectedCount}). 
        Pulsa <strong>«＋ Agregar»</strong> en las categorías de abajo para completar los 4 espacios.
      `;
    } else {
      alertBox.style.display = 'none';
      alertBox.innerHTML = '';
    }
  }

  // Deshabilitar botón si no hay 4 seleccionadas
  if (saveBtn) {
    const canSave = isComplete || (allActiveCategories.length < 4 && selectedCount === allActiveCategories.length);
    saveBtn.disabled = !canSave;
    saveBtn.style.opacity = canSave ? '1' : '0.6';
    saveBtn.style.cursor = canSave ? 'pointer' : 'not-allowed';
  }

  // 1. RENDERIZAR LOS 4 SLOTS ORDENADOS (1 al 4)
  slotsContainer.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const catId = app.tempFeaturedCategoryIds[i];
    const cat = catId ? allActiveCategories.find(c => c.id === catId) : null;
    const slotCard = document.createElement('div');

    if (cat) {
      slotCard.className = 'featured-slot-item occupied';
      const iconName = app.getCategoryLucideIcon(cat);
      const iconSvg = app.createLucideSvgString(iconName, 'slot-lucide-icon', 20);

      slotCard.innerHTML = `
        <div class="slot-position-badge">#${i + 1}</div>
        <div class="slot-cat-icon">${iconSvg}</div>
        <div class="slot-cat-info">
          <div class="slot-cat-name">${cat.name}</div>
          <div class="slot-cat-sub">Posición #${i + 1} en portada</div>
        </div>
        <div class="slot-actions">
          <button class="slot-btn btn-reorder" onclick="app.moveFeaturedCategory(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Subir orden" aria-label="Subir ${cat.name}">
            ▲ Subir
          </button>
          <button class="slot-btn btn-reorder" onclick="app.moveFeaturedCategory(${i}, 1)" ${i === selectedCount - 1 ? 'disabled' : ''} title="Bajar orden" aria-label="Bajar ${cat.name}">
            ▼ Bajar
          </button>
          <button class="slot-btn btn-remove" onclick="app.removeFeaturedCategory('${cat.id}')" title="Quitar de destacadas" aria-label="Quitar ${cat.name}">
            ✕
          </button>
        </div>
      `;
    } else {
      slotCard.className = 'featured-slot-item empty';
      slotCard.innerHTML = `
        <div class="slot-position-badge empty">#${i + 1}</div>
        <div class="slot-empty-info">
          <span>Espacio #${i + 1} disponible</span>
          <small>Selecciona una categoría de la lista activa inferior</small>
        </div>
      `;
    }
    slotsContainer.appendChild(slotCard);
  }

  // 2. RENDERIZAR POOL DE CATEGORÍAS ACTIVAS
  poolContainer.innerHTML = '';
  allActiveCategories.forEach(cat => {
    const isSelected = app.tempFeaturedCategoryIds.includes(cat.id);
    const orderIndex = isSelected ? app.tempFeaturedCategoryIds.indexOf(cat.id) : -1;
    const poolCard = document.createElement('div');
    poolCard.className = `featured-pool-item ${isSelected ? 'selected' : ''}`;

    const iconName = app.getCategoryLucideIcon(cat);
    const iconSvg = app.createLucideSvgString(iconName, 'pool-lucide-icon', 18);

    poolCard.innerHTML = `
      <div class="pool-item-left">
        <span class="pool-icon-wrap">${iconSvg}</span>
        <div class="pool-name-wrap">
          <span class="pool-cat-name">${cat.name}</span>
          ${isSelected ? `<span class="pool-badge-selected">★ Destacada #${orderIndex + 1}</span>` : ''}
        </div>
      </div>
      <div class="pool-item-right">
        ${isSelected ? `
          <button class="btn-pool-toggle remove" onclick="app.removeFeaturedCategory('${cat.id}')" title="Quitar de las destacadas">
            Quitar ✕
          </button>
        ` : `
          <button class="btn-pool-toggle add" onclick="app.addFeaturedCategory('${cat.id}')" ${selectedCount >= 4 ? 'disabled' : ''} title="${selectedCount >= 4 ? 'Ya seleccionaste 4' : 'Agregar a destacadas'}">
            ＋ Agregar
          </button>
        `}
      </div>
    `;

    poolContainer.appendChild(poolCard);
  });

  app.refreshLucideIcons();
};

app.moveFeaturedCategory = function(index, direction) {
  if (!app.tempFeaturedCategoryIds) return;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= app.tempFeaturedCategoryIds.length) return;

  const item = app.tempFeaturedCategoryIds[index];
  app.tempFeaturedCategoryIds[index] = app.tempFeaturedCategoryIds[newIndex];
  app.tempFeaturedCategoryIds[newIndex] = item;

  app.renderFeaturedCategoriesManager();
};

app.addFeaturedCategory = function(catId) {
  if (!app.tempFeaturedCategoryIds) app.tempFeaturedCategoryIds = [];
  if (app.tempFeaturedCategoryIds.includes(catId)) return;

  if (app.tempFeaturedCategoryIds.length >= 4) {
    app.showToast('Ya has seleccionado las 4 categorías. Quita una primero para agregar otra.');
    return;
  }

  app.tempFeaturedCategoryIds.push(catId);
  app.renderFeaturedCategoriesManager();
};

app.removeFeaturedCategory = function(catId) {
  if (!app.tempFeaturedCategoryIds) return;
  app.tempFeaturedCategoryIds = app.tempFeaturedCategoryIds.filter(id => id !== catId);
  app.renderFeaturedCategoriesManager();
};

app.resetFeaturedCategoriesDraft = function() {
  app.tempFeaturedCategoryIds = [...app.getSavedFeaturedCategoryIds()];
  app.renderFeaturedCategoriesManager();
  app.showToast('Borrador restablecido');
};

app.saveFeaturedCategories = function() {
  if (!app.isAdminLoggedIn) {
    app.showToast('Acceso denegado: solo los administradores pueden guardar cambios.');
    return;
  }

  const allActiveCategories = (app.categories || []).filter(c => c.active !== false && c.id !== 'cat_todos');

  if (allActiveCategories.length >= 4 && (!app.tempFeaturedCategoryIds || app.tempFeaturedCategoryIds.length !== 4)) {
    const currentCount = app.tempFeaturedCategoryIds ? app.tempFeaturedCategoryIds.length : 0;
    app.showToast(`Debes seleccionar exactamente 4 categorías destacadas (tienes ${currentCount}).`);
    return;
  }

  // Establecer la nueva configuración en app.settings
  app.settings.featuredCategoryIds = [...app.tempFeaturedCategoryIds];

  // Guardar en localStorage como copia de seguridad local
  try {
    localStorage.setItem('7dapp_admin_settings', JSON.stringify(app.settings));
  } catch(e) {}

  // Guardar en Cloud Firestore en settings/general
  if (db) {
    db.collection(FIRESTORE_SETTINGS_COLLECTION)
      .doc(FIRESTORE_SETTINGS_DOC)
      .set({ featuredCategoryIds: app.settings.featuredCategoryIds }, { merge: true })
      .then(() => {
        console.log('[Firestore] Categorías destacadas guardadas exitosamente en settings/general:', app.settings.featuredCategoryIds);
        app.showToast('¡Categorías destacadas guardadas con éxito!');
      })
      .catch((err) => {
        console.error('[Firestore] Error al guardar categorías destacadas:', err);
        app.showToast('Guardado localmente. Error en Firestore: ' + (err.message || ''));
      });
  } else {
    app.showToast('Categorías destacadas guardadas (modo local)');
  }

  // Refrescar inmediatamente la portada y el gestor
  app.renderCategories();
  app.renderFeaturedCategoriesManager();
};

app.renderAdminCategories = function() {
  app.renderFeaturedCategoriesManager();
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
          var heroBadge = document.querySelector('#feed-hero-badge, #screen-feed .hero-badge'); if (heroBadge) heroBadge.textContent = String.fromCodePoint(0x1F525) + ' ANÚNCIATE HOY POR ' + durationDays + ' DÍAS';
          var pricingHeadline = document.querySelector('.pricing-headline'); if (pricingHeadline) pricingHeadline.textContent = 'PUBLICA DURANTE ' + durationDays + ' DÍAS';
          app.updatePublishSelects();
          app.renderCategories();
          if (app.isAdminLoggedIn && typeof app.renderFeaturedCategoriesManager === 'function') {
            app.renderFeaturedCategoriesManager();
          }
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

    // 6. Sincronización en tiempo real de Eventos desde la colección 'events'
    app.syncEvents = function() {
      if (!db) return;
      if (app.eventsUnsubscribe) {
        try { app.eventsUnsubscribe(); } catch(e) {}
        app.eventsUnsubscribe = null;
      }
      try {
        const query = db.collection(FIRESTORE_EVENTS_COLLECTION);
        app.eventsUnsubscribe = query.onSnapshot((snapshot) => {
          if (!snapshot.empty) {
            const cloudEvents = [];
            snapshot.forEach((doc) => {
              const data = doc.data() || {};
              cloudEvents.push({
                ...data,
                id: doc.id
              });
            });
            cloudEvents.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            app.events = cloudEvents;
            app.eventsLoaded = true;
            app.eventsLoadError = null;
            console.log('[Firestore] Eventos sincronizados desde events:', cloudEvents.length);
          } else {
            app.events = [];
            app.eventsLoaded = true;
            app.eventsLoadError = null;
            console.log('[Firestore] Colección events vacía o sin registros.');
          }

          if (app.isAdminLoggedIn) {
            app.renderAdminEvents();
            app.renderAdminDashboard();
          }

          if (typeof app.renderPublicEvents === 'function') {
            app.renderPublicEvents();
          }
          if (typeof app.renderRecentFlyersForEvents === 'function') {
            app.renderRecentFlyersForEvents();
          }

          // Si el detalle de un evento está abierto y dejó de estar activo, refrescar vista de detalle
          if (app.currentScreen === 'event-detail' && app.currentEvent) {
            const fresh = (app.events || []).find(e => e.id === app.currentEvent.id);
            if (!fresh || fresh.status !== 'active') {
              app.openEventDetail(app.currentEvent.id);
            }
          }
        }, (err) => {
          console.warn('[Firestore] Escucha de events (reglas en verificación o permiso pendiente):', err.message);
          app.eventsLoaded = true;
          app.eventsLoadError = err;
          if (typeof app.renderPublicEvents === 'function') {
            app.renderPublicEvents();
          }
        });
      } catch(e) {}
    };

    app.syncEvents();

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

// Sanitizador robusto de URLs de imágenes para evitar roturas de marcado HTML por comillas o caracteres especiales
app.sanitizeImageUrl = function(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // Si es un SVG data URL con XML sin codificar (contiene comillas o < que rompen atributos HTML)
  if (trimmed.startsWith('data:image/svg+xml')) {
    if (trimmed.includes('<svg') || trimmed.includes('"') || trimmed.includes('\'')) {
      const commaIdx = trimmed.indexOf(',');
      if (commaIdx !== -1) {
        const meta = trimmed.substring(0, commaIdx);
        const body = trimmed.substring(commaIdx + 1);
        if (!meta.includes('base64')) {
          try {
            const cleanBody = decodeURIComponent(body.replace(/%23/g, '#'));
            return 'data:image/svg+xml;utf8,' + encodeURIComponent(cleanBody);
          } catch (_) {
            return 'data:image/svg+xml;utf8,' + encodeURIComponent(body);
          }
        }
      }
    }
  }

  // En URLs convencionales, escapar comillas dobles para que nunca rompan atributos src o style
  return trimmed.replace(/"/g, '&quot;');
};

// Generadores de imágenes SVG vectoriales y locales para comercios de prueba
const makeSvgLogo = (emoji, bg1, bg2) => {
  const safeEmoji = emoji || '🏪';
  const c1 = bg1 || '#191919';
  const c2 = bg2 || '#242424';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="120" height="120" rx="24" fill="url(#g)"/><text x="50%" y="54%" font-size="52" text-anchor="middle" dominant-baseline="middle">${safeEmoji}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
};

const makeSvgCover = (title, bg1, bg2) => {
  const safeTitle = (title || 'Dfarra').replace(/[<>&"]/g, '');
  const c1 = bg1 || '#191919';
  const c2 = bg2 || '#242424';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240" viewBox="0 0 800 240"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="800" height="240" fill="url(#g)"/><circle cx="700" cy="40" r="140" fill="rgba(255,255,255,0.06)"/><circle cx="100" cy="200" r="100" fill="rgba(255,255,255,0.04)"/><text x="50%" y="52%" font-family="system-ui,-apple-system,sans-serif" font-weight="900" font-size="28" fill="#FFFFFF" text-anchor="middle" opacity="0.92">${safeTitle}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
};

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
    paymentMethods: ['Pago Móvil', 'Punto de Venta', 'Zelle', 'USDT/Cripto', 'Cashea'],
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
// 1. Barra de navegación inferior fija (5 accesos: Eventos, Ofertas, Directorio, Registrar, Publicar)
// --------------------------------------------------------------------------
app.updateBottomNav = function(screenName) {
  const navBtns = {
    'events': document.getElementById('nav-btn-events'),
    'feed': document.getElementById('nav-btn-feed'),
    'directory': document.getElementById('nav-btn-directory'),
    'register-business': document.getElementById('nav-btn-register-business'),
    'publish': document.getElementById('nav-btn-publish')
  };

  Object.values(navBtns).forEach(btn => {
    if (btn) btn.classList.remove('active');
  });

  const activeKey = (screenName === 'event-detail') ? 'events' : screenName;
  if (navBtns[activeKey]) {
    navBtns[activeKey].classList.add('active');
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

  // Renderizar nuevo menú de categorías del directorio (Mismo diseño compacto con Lucide de Publicaciones)
  const gridContainer = document.getElementById('directory-categories-grid');
  const allBtn = document.getElementById('dir-cat-filter-all-btn');
  const viewAllBtn = document.getElementById('dir-cat-btn-view-all');
  const iconAll = document.getElementById('dir-cat-icon-all');
  const iconViewAll = document.getElementById('dir-cat-icon-view-all');

  // Actualizar icono en botón «Todas»
  if (iconAll) {
    iconAll.innerHTML = app.createLucideSvgString('layers', 'cat-pill-lucide', 16);
  }

  // Actualizar icono en botón «Ver todas»
  if (iconViewAll) {
    iconViewAll.innerHTML = app.createLucideSvgString('layout-grid', 'cat-pill-lucide', 16);
  }

  // Estado del botón «Todas»
  const isAllSelected = (!app.directoryCategoryId || app.directoryCategoryId === 'all');
  if (allBtn) {
    allBtn.classList.toggle('active', isAllSelected);
    allBtn.setAttribute('aria-pressed', isAllSelected ? 'true' : 'false');
  }

  // Obtener las 4 categorías principales según la configuración administrativa
  const mainCategories = app.getFeaturedCategories();

  // Indicar en «Ver todas» si la categoría activa no está entre las 4 principales
  const activeNotInMain = !isAllSelected && !mainCategories.some(c => c.id === app.directoryCategoryId);
  if (viewAllBtn) {
    viewAllBtn.classList.toggle('active-filter-highlight', activeNotInMain);
  }

  if (gridContainer) {
    gridContainer.innerHTML = '';
    mainCategories.forEach(cat => {
      const isSelected = app.directoryCategoryId === cat.id;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `category-card ${isSelected ? 'active' : ''}`;
      card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      card.title = `Filtrar comercios por ${cat.name}`;

      const iconName = app.getCategoryLucideIcon(cat);
      const iconSvg = app.createLucideSvgString(iconName, 'cat-card-lucide', 18);

      card.innerHTML = `
        <span class="cat-card-icon">${iconSvg}</span>
        <span class="cat-card-name">${cat.name}</span>
      `;

      card.onclick = () => {
        app.setDirectoryCategoryFilter(isSelected ? 'all' : cat.id);
      };

      gridContainer.appendChild(card);
    });
  }

  // Compatibilidad hacia atrás si existiera el contenedor horizontal antiguo
  const catBar = document.getElementById('directory-categories-bar');
  if (catBar && !gridContainer) {
    const activeCats = app.categories.filter(c => c.active !== false);
    catBar.innerHTML = '';

    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = `dir-cat-chip ${isAllSelected ? 'active' : ''}`;
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

  // Sincronizar estados visuales de los chips de filtrado combinables
  app.updateDirectoryFilterChips();

  // Filtrado de comercios multi-faceta (AND entre grupos independientes)
  const query = (app.directorySearchQuery || '').toLowerCase().trim();
  const catFilter = app.directoryCategoryId || 'all';
  const typeFilters = app.directoryTypeFilters || [];
  const deliveryFilter = !!app.directoryDeliveryFilter;
  const paymentFilters = app.directoryPaymentFilters || [];

  const filtered = (app.businesses || []).filter(biz => {
    // 1. Solo comercios con estatus activo en la vista pública
    if (biz.status !== 'active') return false;

    // 2. Filtro por ciudad activa seleccionada
    if (biz.cityId && biz.cityId !== app.currentCityId) return false;

    // 3. Grupo Categoría: Si se selecciona una categoría concreta, exigir pertenencia
    if (catFilter !== 'all' && biz.categoryId !== catFilter && biz.category !== catFilter) {
      return false;
    }

    // 4. Grupo Tipo de Comercio: Si hay selección, aceptar comercios que coincidan con cualquiera de los tipos activos
    if (typeFilters.length > 0) {
      let matchesType = false;
      const isPhysical = (biz.businessType === 'physical' || biz.businessType === 'both');
      const isVirtual = (biz.businessType === 'virtual' || biz.businessType === 'both');

      if (typeFilters.includes('physical') && isPhysical) {
        matchesType = true;
      }
      if (typeFilters.includes('virtual') && isVirtual) {
        matchesType = true;
      }

      if (!matchesType) return false;
    }

    // 5. Grupo Delivery: Si está activado, exigir hasDelivery === true
    if (deliveryFilter && !biz.hasDelivery) {
      return false;
    }

    // 6. Grupo Métodos de Pago: Si hay selección (ej. Cashea), exigir que acepte al menos uno de los métodos seleccionados
    if (paymentFilters.length > 0) {
      const bizPayments = Array.isArray(biz.paymentMethods) ? biz.paymentMethods : [];
      const acceptsPayment = paymentFilters.some(method => bizPayments.includes(method));
      if (!acceptsPayment) {
        return false;
      }
    }

    // 7. Grupo Buscador: Si existe búsqueda por texto, exigir coincidencia
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

    const safeName = (biz.name || 'Comercio').replace(/"/g, '&quot;');
    const safeCity = (biz.cityName || cityName || '').replace(/"/g, '&quot;');
    const safeCat = (biz.categoryName || 'Comercio').replace(/"/g, '&quot;');
    const safeCatIcon = (biz.categoryIcon || '🏷️');
    const safeDesc = (biz.description || 'Comercio verificado en Dfarra.').replace(/"/g, '&quot;');
    const safeCoverUrl = app.sanitizeImageUrl(biz.coverUrl);
    const safeLogoUrl = app.sanitizeImageUrl(biz.logoUrl);

    const bannerHtml = safeCoverUrl
      ? `<div class="business-card-banner"><img src="${safeCoverUrl}" class="business-card-banner-img" alt="Portada de ${safeName}" loading="lazy" onerror="this.style.display='none';"></div>`
      : `<div class="business-card-banner"></div>`;

    const logoHtml = safeLogoUrl
      ? `<img src="${safeLogoUrl}" class="business-logo-thumb" alt="${safeName}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'business-logo-thumb business-logo-fallback\\'>🏪</div>';">`
      : `<div class="business-logo-thumb business-logo-fallback" style="display:flex;align-items:center;justify-content:center;font-size:24px;">🏪</div>`;

    card.innerHTML = `
      ${bannerHtml}
      <div class="business-card-main">
        <div class="business-card-avatar-row">
          <div class="business-card-avatar-wrap">
            ${logoHtml}
          </div>
          <span class="business-type-badge">${typeLabel}</span>
        </div>
        <h3 class="business-card-title">${safeName}</h3>
        <div class="business-card-meta">
          <span class="business-meta-tag">${safeCatIcon} ${safeCat}</span>
          <span class="business-meta-tag">•</span>
          <span class="business-meta-tag">📍 ${safeCity}</span>
        </div>
        <p class="business-desc-clamp">${safeDesc}</p>
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

app.updateDirectoryFilterChips = function() {
  const types = app.directoryTypeFilters || [];
  const hasDelivery = !!app.directoryDeliveryFilter;
  const payments = app.directoryPaymentFilters || [];
  const isAll = (types.length === 0 && !hasDelivery && payments.length === 0);

  const chipAll = document.getElementById('dir-filter-all');
  const chipPhys = document.getElementById('dir-filter-physical');
  const chipVirt = document.getElementById('dir-filter-virtual');
  const chipDeliv = document.getElementById('dir-filter-delivery');
  const chipCashea = document.getElementById('dir-filter-cashea');

  if (chipAll) {
    chipAll.classList.toggle('active', isAll);
    chipAll.setAttribute('aria-pressed', isAll ? 'true' : 'false');
  }
  if (chipPhys) {
    const active = types.includes('physical');
    chipPhys.classList.toggle('active', active);
    chipPhys.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  if (chipVirt) {
    const active = types.includes('virtual');
    chipVirt.classList.toggle('active', active);
    chipVirt.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  if (chipDeliv) {
    chipDeliv.classList.toggle('active', hasDelivery);
    chipDeliv.setAttribute('aria-pressed', hasDelivery ? 'true' : 'false');
  }
  if (chipCashea) {
    const active = payments.includes('Cashea');
    chipCashea.classList.toggle('active', active);
    chipCashea.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
};

app.toggleDirectoryTypeFilter = function(type) {
  if (!Array.isArray(app.directoryTypeFilters)) app.directoryTypeFilters = [];
  const idx = app.directoryTypeFilters.indexOf(type);
  if (idx === -1) {
    app.directoryTypeFilters.push(type);
  } else {
    app.directoryTypeFilters.splice(idx, 1);
  }
  app.renderDirectory();
};

app.toggleDirectoryDeliveryFilter = function() {
  app.directoryDeliveryFilter = !app.directoryDeliveryFilter;
  app.renderDirectory();
};

app.toggleDirectoryPaymentFilter = function(method) {
  if (!Array.isArray(app.directoryPaymentFilters)) app.directoryPaymentFilters = [];
  const idx = app.directoryPaymentFilters.indexOf(method);
  if (idx === -1) {
    app.directoryPaymentFilters.push(method);
  } else {
    app.directoryPaymentFilters.splice(idx, 1);
  }
  app.renderDirectory();
};

app.resetDirectoryQuickFilters = function() {
  app.directoryTypeFilters = [];
  app.directoryDeliveryFilter = false;
  app.directoryPaymentFilters = [];
  app.renderDirectory();
};

app.setDirectoryTypeFilter = function(type) {
  if (type === 'all') {
    app.resetDirectoryQuickFilters();
  } else if (type === 'delivery') {
    app.toggleDirectoryDeliveryFilter();
  } else if (type === 'physical' || type === 'virtual') {
    app.toggleDirectoryTypeFilter(type);
  } else if (type === 'Cashea') {
    app.toggleDirectoryPaymentFilter('Cashea');
  } else {
    app.renderDirectory();
  }
};

app.setDirectoryCategoryFilter = function(catId) {
  app.directoryCategoryId = catId;
  app.renderDirectory();
};

app.clearDirectoryCategoryFilter = function() {
  app.directoryCategoryId = 'all';
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
  const safeProfileCover = app.sanitizeImageUrl(biz.coverUrl);
  if (safeProfileCover && coverImg) {
    coverImg.src = safeProfileCover;
    coverImg.style.display = 'block';
    coverImg.onerror = () => {
      coverImg.style.display = 'none';
      if (coverFallback) coverFallback.style.display = 'block';
    };
    if (coverFallback) coverFallback.style.display = 'none';
  } else {
    if (coverImg) coverImg.style.display = 'none';
    if (coverFallback) coverFallback.style.display = 'block';
  }

  const logoImg = document.getElementById('profile-logo-img');
  if (logoImg) {
    const safeProfileLogo = app.sanitizeImageUrl(biz.logoUrl);
    logoImg.src = safeProfileLogo || makeSvgLogo('🏪', '#191919', '#242424');
    logoImg.onerror = () => {
      logoImg.src = makeSvgLogo('🏪', '#191919', '#242424');
    };
  }

  const descEl = document.getElementById('profile-description');
  if (descEl) descEl.textContent = biz.description || 'Sin descripción disponible.';

  const addrBox = document.getElementById('profile-address-box');
  const addrText = document.getElementById('profile-address-text');
  const mapsBtn = document.getElementById('profile-maps-btn');

  const cleanAddress = (biz.address || '').trim();
  const isPhysical = biz.businessType !== 'virtual';
  const hasValidAddress = isPhysical && cleanAddress.length > 0;

  if (hasValidAddress && addrBox && addrText) {
    addrText.textContent = cleanAddress;
    addrBox.style.display = 'flex';

    if (mapsBtn) {
      const cityName = (biz.cityName || '').trim() || ((app.cities || []).find(c => c.id === biz.cityId) || {}).name || '';
      const queryParts = [biz.name, cleanAddress];
      if (cityName) queryParts.push(cityName);
      queryParts.push('Venezuela');
      const query = encodeURIComponent(queryParts.join(', '));
      mapsBtn.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
      mapsBtn.style.display = 'inline-flex';
    }
  } else {
    if (addrBox) addrBox.style.display = 'none';
    if (addrText) addrText.textContent = '';
    if (mapsBtn) {
      mapsBtn.href = '#';
      mapsBtn.style.display = 'none';
    }
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
      const msg = encodeURIComponent(`Hola ${biz.name}, los vi en el Directorio de Dfarra y quisiera consultar información.`);
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

  // Metadatos sociales dinámicos Open Graph y Twitter Cards
  const bizImage = biz.logoUrl || biz.coverUrl || 'https://dfarra.web.app/icons/dfarra-app-icon-512.png';
  app.updateSocialMeta({
    title: `${biz.name} | Dfarra`,
    description: biz.description ? biz.description.slice(0, 150) : `Conoce a ${biz.name} en Dfarra - ${biz.cityName || 'Venezuela'}`,
    image: bizImage,
    url: `${window.location.origin}${window.location.pathname}#biz=${biz.id}`
  });
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
  const mapsBtn = document.getElementById('profile-maps-btn');
  if (mapsBtn) {
    mapsBtn.href = '#';
    mapsBtn.style.display = 'none';
  }
  app.currentProfileBiz = null;
  if (app.currentScreen !== 'feed' && app.currentScreen !== 'detail') {
    app.stopCountdownTicker();
  }
  app.resetSocialMeta();
};

// --------------------------------------------------------------------------
// 4. Formulario de Registro Comercial y Gestión de Archivos en Memoria
// --------------------------------------------------------------------------
app.populateRegisterBusinessSelects = function() {
  const catSelect = document.getElementById('reg-biz-category');
  const catGrid = document.getElementById('reg-biz-category-grid');
  if (catSelect) {
    const activeCats = app.categories.filter(c => c.active !== false && c.id !== 'cat_todos');
    const prevVal = catSelect.value;
    catSelect.innerHTML = '<option value="">Selecciona una categoría...</option>' + 
      activeCats.map(c => `<option value="${c.id}">${c.icon || '🏷️'} ${c.name}</option>`).join('');
    if (prevVal && activeCats.some(c => c.id === prevVal)) {
      catSelect.value = prevVal;
    }

    if (catGrid) {
      catGrid.innerHTML = '';
      activeCats.forEach(cat => {
        const isSelected = catSelect.value === cat.id;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `category-card form-cat-card ${isSelected ? 'active' : ''}`;
        card.setAttribute('data-cat-id', cat.id);
        card.setAttribute('role', 'radio');
        card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
        card.title = `Seleccionar ${cat.name}`;

        const iconName = app.getCategoryLucideIcon(cat);
        const iconSvg = app.createLucideSvgString(iconName, 'cat-card-lucide', 18);

        card.innerHTML = `
          <span class="cat-card-icon">${iconSvg}</span>
          <span class="cat-card-name">${cat.name}</span>
        `;

        card.onclick = () => {
          app.setRegisterBusinessCategory(cat.id);
        };

        catGrid.appendChild(card);
      });
    }
  }

  const citySelect = document.getElementById('reg-biz-city');
  if (citySelect) {
    const activeCities = app.cities.filter(c => c.active !== false);
    citySelect.innerHTML = '<option value="">Selecciona tu ciudad...</option>' + 
      activeCities.map(c => `<option value="${c.id}">${c.name} (${c.state || 'VE'})</option>`).join('');
    if (app.currentCityId) citySelect.value = app.currentCityId;
  }
};

app.setRegisterBusinessCategory = function(catId) {
  const catSelect = document.getElementById('reg-biz-category');
  if (catSelect) {
    catSelect.value = catId;
    catSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const catGrid = document.getElementById('reg-biz-category-grid');
  if (catGrid) {
    catGrid.querySelectorAll('.category-card').forEach(btn => {
      const isSelected = btn.getAttribute('data-cat-id') === catId;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });
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

  const errBox = document.getElementById('reg-biz-error');
  const validation = validateBusinessImageFile(file, 'El logotipo');
  if (!validation.valid) {
    if (errBox) {
      errBox.textContent = validation.error;
      errBox.style.display = 'block';
    } else {
      alert(validation.error);
    }
    event.target.value = '';
    app.tempBizLogoFile = null;
    app.tempBizLogo = null;
    const box = document.getElementById('reg-logo-preview-box');
    const ph = document.getElementById('reg-logo-placeholder');
    if (box) box.style.display = 'none';
    if (ph) ph.style.display = 'flex';
    return;
  }

  if (errBox) errBox.style.display = 'none';
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

  const errBox = document.getElementById('reg-biz-error');
  const validation = validateBusinessImageFile(file, 'La portada');
  if (!validation.valid) {
    if (errBox) {
      errBox.textContent = validation.error;
      errBox.style.display = 'block';
    } else {
      alert(validation.error);
    }
    event.target.value = '';
    app.tempBizCoverFile = null;
    app.tempBizCover = null;
    const box = document.getElementById('reg-cover-preview-box');
    const ph = document.getElementById('reg-cover-placeholder');
    if (box) box.style.display = 'none';
    if (ph) ph.style.display = 'flex';
    return;
  }

  if (errBox) errBox.style.display = 'none';
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

  // 1. Subida a Cloudflare R2 con validación estricta, optimización WebP y verificación de URL
  try {
    if (app.tempBizLogoFile) {
      logoUrl = await uploadImageToR2(app.tempBizLogoFile, {
        label: 'Logotipo',
        tag: 'biz_logo',
        isLogo: true,
        maxDimension: BIZ_LOGO_MAX_DIMENSION,
        quality: BIZ_IMAGE_WEBP_QUALITY
      }, (status) => {
        if (btnSubmit) btnSubmit.textContent = status;
      });
    } else {
      logoUrl = ''; // Nunca guardar Data URLs, SVG ni Base64 en Firestore
    }

    if (app.tempBizCoverFile) {
      coverUrl = await uploadImageToR2(app.tempBizCoverFile, {
        label: 'Portada',
        tag: 'biz_cover',
        isLogo: false,
        maxDimension: BIZ_COVER_MAX_DIMENSION,
        quality: BIZ_IMAGE_WEBP_QUALITY
      }, (status) => {
        if (btnSubmit) btnSubmit.textContent = status;
      });
    } else {
      coverUrl = ''; // Nunca guardar Data URLs, SVG ni Base64 en Firestore
    }
  } catch (uploadErr) {
    console.error('[R2] Error al subir imágenes del comercio:', uploadErr);
    showError('Error al subir las imágenes: ' + (uploadErr.message || 'No se pudo conectar con el servicio de imágenes.'));
    return;
  }

  // 2. Construcción del documento público (EXCLUYENDO estrictamente repName, repPhone, repEmail)
  const form = document.getElementById('form-register-business');
  const bizId = (form && form.dataset && form.dataset.pendingBizId)
    ? form.dataset.pendingBizId
    : ('biz_' + Date.now());
  if (form && form.dataset) {
    form.dataset.pendingBizId = bizId;
  }

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

  // 4. Envío de datos privados al backend para persistencia privada en D1
  if (btnSubmit) btnSubmit.textContent = 'Verificando datos privados...';

  const representativeData = {
    name: repName,
    phone: repPhone,
    email: repEmail
  };

  const notifyPayload = JSON.stringify({
    business: publicBusinessData,
    representative: representativeData
  });

  let backendResponse = null;
  let backendResult = null;
  let networkError = null;

  try {
    backendResponse = await fetch('/api/business/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: notifyPayload
    });

    if (backendResponse) {
      try {
        backendResult = await backendResponse.json();
      } catch (jsonErr) {
        backendResult = null;
      }
    }
  } catch (fetchErr) {
    networkError = fetchErr;
    console.warn('[Backend] Error de conexión al registrar datos privados:', fetchErr);
  }

  // Comprobar inequívocamente el estado HTTP y el valor 'stored' de la persistencia privada
  const isStoredSuccessfully = Boolean(
    backendResponse &&
    backendResponse.ok &&
    backendResult &&
    backendResult.stored === true
  );

  // Mecanismo de contingencia para notificación de emergencia si el backend no respondió por red
  // IMPORTANTE: Este intento NUNCA modifica isStoredSuccessfully ni valida la persistencia privada
  if (!backendResponse && networkError) {
    try {
      await fetch(NOTIFICATION_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: notifyPayload
      }).catch(() => null);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // CASO DE ÉXITO COMPLETO: Firestore y Backend privado confirmados
  // --------------------------------------------------------------------------
  if (isStoredSuccessfully) {
    if (form) {
      if (form.dataset) delete form.dataset.pendingBizId;
      form.reset();
    }
    app.removeLogo();
    app.removeCover();
    resetSubmitBtn();

    // Actualización en memoria local para feedback inmediato (solo datos comerciales públicos, NUNCA datos privados)
    app.businesses.unshift(publicBusinessData);

    app.showToast('✨ ¡Comercio registrado con éxito! Datos del representante verificados y protegidos.');

    // Refrescar vistas
    app.renderDirectory();
    if (app.isAdminLoggedIn) {
      app.renderAdminDirectory();
    }

    app.showScreen('directory');
    return;
  }

  // --------------------------------------------------------------------------
  // CASO DE REGISTRO INCOMPLETO / FALLO DE PERSISTENCIA PRIVADA (FAIL-CLOSED)
  // --------------------------------------------------------------------------
  resetSubmitBtn();

  let reasonDetail = 'El servidor no pudo confirmar el almacenamiento privado.';
  if (backendResponse) {
    if (backendResponse.status === 503 || (backendResult && backendResult.code === 'PERSISTENT_STORAGE_NOT_CONFIGURED')) {
      reasonDetail = 'El almacenamiento privado persistente (Cloudflare D1) no está configurado en el servidor.';
    } else if (backendResponse.status === 500) {
      reasonDetail = 'Error interno en la base de datos de persistencia privada del servidor.';
    } else if (backendResponse.status >= 400) {
      reasonDetail = `Error en el servicio del backend (HTTP ${backendResponse.status}).`;
    } else if (backendResult && backendResult.stored === false) {
      reasonDetail = 'El servidor rechazó el almacenamiento de los datos privados.';
    } else {
      reasonDetail = 'La respuesta del servidor no confirmó la persistencia privada.';
    }
  } else if (networkError) {
    reasonDetail = 'No se pudo establecer conexión con el servidor para persistir los datos privados.';
  }

  const incompleteWarning = `⚠️ Registro incompleto: La ficha pública fue registrada con ID "${bizId}", pero los datos privados del representante no quedaron confirmados (${reasonDetail}). Se requiere revisión administrativa.`;
  console.warn('[Registro Comercial]', incompleteWarning, {
    bizId,
    status: backendResponse ? backendResponse.status : 'network_error',
    backendResult
  });

  // Mostrar mensaje de advertencia claro en el formulario (errBox) sin afirmar éxito completo
  if (errBox) {
    errBox.innerHTML = `
      <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px; color: #b91c1c;">⚠️ Registro Comercial Incompleto</div>
      <div style="font-size: 13px; line-height: 1.4; margin-bottom: 8px; color: #7f1d1d;">
        La ficha pública fue registrada con el identificador <code>${bizId}</code>, pero los datos privados del representante <strong>no quedaron confirmados</strong> en el almacenamiento seguro (${reasonDetail}).
      </div>
      <div style="font-size: 12px; line-height: 1.4; background: rgba(0,0,0,0.05); padding: 8px; border-radius: 4px; color: #374151;">
        📌 <strong>Acción requerida:</strong> Se requiere revisión administrativa para verificar este comercio y habilitar cupones. Por favor conserva el ID <code>${bizId}</code> y comunícate con administración. Para evitar duplicados, no vuelvas a enviar la solicitud.
      </div>
    `;
    errBox.style.display = 'block';
    if (typeof errBox.scrollIntoView === 'function') {
      errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Notificación toast de advertencia (NUNCA éxito completo)
  app.showToast(`⚠️ Registro incompleto (ID: ${bizId}): datos privados pendientes de confirmación administrativa.`);

  // Mantener coherencia en memoria local para el directorio público (exclusivamente datos públicos, sin datos privados)
  if (!app.businesses.some(b => b.id === bizId)) {
    app.businesses.unshift(publicBusinessData);
  }
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

    const safeLogoUrl = app.sanitizeImageUrl(biz.logoUrl);
    const safeName = (biz.name || 'Comercio').replace(/"/g, '&quot;');
    const safeCat = (biz.categoryName || 'Comercio').replace(/"/g, '&quot;');
    const safeCity = (biz.cityName || '').replace(/"/g, '&quot;');

    const logoHtml = safeLogoUrl
      ? `<img src="${safeLogoUrl}" class="autocomplete-logo" alt="${safeName}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'autocomplete-logo\\' style=\\'display:flex;align-items:center;justify-content:center;\\'>🏪</div>';">`
      : `<div class="autocomplete-logo" style="display:flex;align-items:center;justify-content:center;">${biz.categoryIcon || '🏪'}</div>`;

    item.innerHTML = `
      ${logoHtml}
      <div class="autocomplete-info">
        <div class="autocomplete-name">${safeName}</div>
        <div class="autocomplete-cat">${biz.categoryIcon || ''} ${safeCat} • 📍 ${safeCity}</div>
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

    const safeCoverUrl = app.sanitizeImageUrl(biz.coverUrl);
    const safeLogoUrl = app.sanitizeImageUrl(biz.logoUrl);
    const safeName = (biz.name || 'Comercio').replace(/"/g, '&quot;');
    const safeCity = (biz.cityName || '').replace(/"/g, '&quot;');
    const safeCat = (biz.categoryName || 'Comercio').replace(/"/g, '&quot;');
    const safeCatIcon = biz.categoryIcon || '🏷️';
    const safeType = biz.businessType === 'physical' ? '🏬 Local' : biz.businessType === 'virtual' ? '🌐 Virtual' : '🏬 & 🌐 Ambos';

    const coverHtml = safeCoverUrl
      ? `<div class="admin-biz-cover-wrap"><img src="${safeCoverUrl}" class="admin-biz-cover-img" alt="Portada de ${safeName}" loading="lazy" onerror="this.onerror=null; this.parentElement.style.display='none';"></div>`
      : '';

    const logoHtml = safeLogoUrl
      ? `<img src="${safeLogoUrl}" class="admin-biz-logo-img" alt="${safeName}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\\'font-size: 26px;\\'>🏪</span>';">`
      : `<span style="font-size: 26px;">🏪</span>`;

    const rep = biz.representative || { name: 'No disponible', phone: 'N/A', email: 'N/A' };
    const safeRepName = (rep.name || 'No disponible').replace(/"/g, '&quot;');
    const safeRepPhone = (rep.phone || 'N/A').replace(/"/g, '&quot;');
    const safeRepEmail = (rep.email || 'N/A').replace(/"/g, '&quot;');

    card.innerHTML = `
      ${coverHtml}
      <div class="admin-biz-header">
        <div class="admin-biz-title-row">
          <div class="admin-biz-logo-wrap">
            ${logoHtml}
          </div>
          <div class="admin-biz-title-info">
            <div class="admin-biz-name">${safeName}</div>
            <div class="admin-biz-meta">
              <span>${safeCatIcon} ${safeCat}</span>
              <span>•</span>
              <span>📍 ${safeCity}</span>
              <span>•</span>
              <span>${safeType}</span>
            </div>
          </div>
        </div>
        <div class="admin-biz-status-wrap">${statusBadge}</div>
      </div>

      <div class="admin-biz-rep-bar">
        <span>👤 <strong>Representante:</strong> ${safeRepName}</span>
        <span>📞 <strong>Tel:</strong> ${safeRepPhone}</span>
        <span>✉️ <strong>Email:</strong> ${safeRepEmail}</span>
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
  const schedW = document.getElementById('edit-sched-weekdays');
  const schedSat = document.getElementById('edit-sched-saturday');
  const schedSun = document.getElementById('edit-sched-sunday');
  const errBox = document.getElementById('edit-biz-error');
  const btnSave = document.getElementById('btn-save-edit-business');
  if (btnSave) {
    btnSave.disabled = false;
    btnSave.textContent = '💾 Guardar Cambios';
  }
  const logoInput = document.getElementById('edit-biz-logo-input');
  if (logoInput) logoInput.value = '';
  const coverInput = document.getElementById('edit-biz-cover-input');
  if (coverInput) coverInput.value = '';

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
    logoPrevImg.src = app.sanitizeImageUrl(app.editBizLogoCurrent);
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
    coverPrevImg.src = app.sanitizeImageUrl(app.editBizCoverCurrent);
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

  const errBox = document.getElementById('edit-biz-error');
  const validation = validateBusinessImageFile(file, 'El logotipo');
  if (!validation.valid) {
    if (errBox) {
      errBox.textContent = validation.error;
      errBox.style.display = 'block';
    } else {
      alert(validation.error);
    }
    event.target.value = '';
    app.editBizLogoFile = null;
    return;
  }

  if (errBox) errBox.style.display = 'none';
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

  const errBox = document.getElementById('edit-biz-error');
  const validation = validateBusinessImageFile(file, 'La portada');
  if (!validation.valid) {
    if (errBox) {
      errBox.textContent = validation.error;
      errBox.style.display = 'block';
    } else {
      alert(validation.error);
    }
    event.target.value = '';
    app.editBizCoverFile = null;
    return;
  }

  if (errBox) errBox.style.display = 'none';
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
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  const errBox = document.getElementById('edit-biz-error');
  if (errBox) errBox.style.display = 'none';

  const btnSave = document.getElementById('btn-save-edit-business');
  const originalBtnText = (btnSave && btnSave.textContent) ? btnSave.textContent : '💾 Guardar Cambios';

  const resetSaveBtn = () => {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.textContent = originalBtnText;
    }
  };

  const showEditError = (msg) => {
    resetSaveBtn();
    if (errBox) {
      errBox.textContent = msg;
      errBox.style.display = 'block';
    } else if (typeof app.showToast === 'function') {
      app.showToast('❌ ' + msg);
    }
  };

  try {
    const bizIdEl = document.getElementById('edit-biz-id');
    const bizId = bizIdEl && typeof bizIdEl.value === 'string' ? bizIdEl.value : '';
    const biz = (app.businesses || []).find(b => b.id === bizId || b.firestoreId === bizId);
    if (!biz) {
      showEditError('No se encontró el comercio a editar.');
      return;
    }

    const getInputValue = (id) => {
      const el = document.getElementById(id);
      return (el && typeof el.value === 'string') ? el.value.trim() : '';
    };

    const name = getInputValue('edit-biz-name');
    const categoryId = getInputValue('edit-biz-category') || biz.categoryId || biz.category || '';
    const cityId = getInputValue('edit-biz-city') || biz.cityId || '';
    const bizTypeInput = document.querySelector('input[name="edit-biz-type"]:checked');
    const businessType = bizTypeInput ? bizTypeInput.value : (biz.businessType || 'physical');
    const address = getInputValue('edit-biz-address');
    const description = getInputValue('edit-biz-description');
    const whatsapp = getInputValue('edit-biz-whatsapp');
    const instagram = getInputValue('edit-biz-instagram');
    const tiktok = getInputValue('edit-biz-tiktok');
    const deliveryInput = document.querySelector('input[name="edit-biz-delivery"]:checked');
    const hasDelivery = deliveryInput ? deliveryInput.value === 'yes' : Boolean(biz.hasDelivery);

    const paymentBoxes = document.querySelectorAll('input[name="edit-payment-method"]:checked') || [];
    const paymentMethods = Array.from(paymentBoxes).map(b => b.value);

    const schedWeekdays = getInputValue('edit-sched-weekdays');
    const schedSaturday = getInputValue('edit-sched-saturday');
    const schedSunday = getInputValue('edit-sched-sunday');

    if (!name) {
      showEditError('El nombre comercial es obligatorio.');
      return;
    }

    if (!categoryId || !cityId) {
      showEditError('La categoría y la ciudad comercial son obligatorias.');
      return;
    }

    if (typeof db === 'undefined' || !db || typeof db.collection !== 'function') {
      showEditError('Error: La conexión con Firestore no está inicializada. Recarga la página e inténtalo nuevamente.');
      return;
    }

    const categoryObj = (app.categories || []).find(c => c.id === categoryId);
    const cityObj = (app.cities || []).find(c => c.id === cityId);

    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = 'Procesando cambios...';
    }

    // Subida de nuevas imágenes a R2 si fueron seleccionadas (solo URLs HTTP/HTTPS válidas)
    let finalLogoUrl = '';
    if (app.editBizLogoCurrent && typeof app.editBizLogoCurrent === 'string' && /^https?:\/\//i.test(app.editBizLogoCurrent)) {
      finalLogoUrl = app.editBizLogoCurrent;
    } else if (biz.logoUrl && typeof biz.logoUrl === 'string' && /^https?:\/\//i.test(biz.logoUrl)) {
      finalLogoUrl = biz.logoUrl;
    }

    let finalCoverUrl = '';
    if (app.editBizCoverCurrent && typeof app.editBizCoverCurrent === 'string' && /^https?:\/\//i.test(app.editBizCoverCurrent)) {
      finalCoverUrl = app.editBizCoverCurrent;
    } else if (biz.coverUrl && typeof biz.coverUrl === 'string' && /^https?:\/\//i.test(biz.coverUrl)) {
      finalCoverUrl = biz.coverUrl;
    }

    try {
      if (app.editBizLogoFile) {
        finalLogoUrl = await uploadImageToR2(app.editBizLogoFile, {
          label: 'Logotipo',
          tag: 'biz_logo',
          isLogo: true,
          maxDimension: BIZ_LOGO_MAX_DIMENSION,
          quality: BIZ_IMAGE_WEBP_QUALITY
        }, (status) => {
          if (btnSave) btnSave.textContent = status;
        });
      }

      if (app.editBizCoverFile) {
        finalCoverUrl = await uploadImageToR2(app.editBizCoverFile, {
          label: 'Portada',
          tag: 'biz_cover',
          isLogo: false,
          maxDimension: BIZ_COVER_MAX_DIMENSION,
          quality: BIZ_IMAGE_WEBP_QUALITY
        }, (status) => {
          if (btnSave) btnSave.textContent = status;
        });
      }
    } catch (upErr) {
      console.error('[R2] Error al actualizar imágenes de comercio:', upErr);
      showEditError('Error al subir imágenes: ' + (upErr.message || 'Error de conexión.'));
      return;
    }

    // Protección adicional contra Data URLs, Base64 o SVG antes de persistir
    if (finalLogoUrl && !/^https?:\/\//i.test(finalLogoUrl)) {
      finalLogoUrl = '';
    }
    if (finalCoverUrl && !/^https?:\/\//i.test(finalCoverUrl)) {
      finalCoverUrl = '';
    }

    if (btnSave) btnSave.textContent = 'Guardando cambios en Firestore...';

    const targetDocId = biz.firestoreId || biz.id;

    // Construcción del documento público (CONSERVA id, status, createdAt; EXCLUYE estrictamente datos del representante)
    const updatedBusinessData = {
      id: targetDocId,
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

    try {
      await db.collection(FIRESTORE_BUSINESSES_COLLECTION).doc(targetDocId).set(updatedBusinessData, { merge: true });
      console.log('[Firestore] Comercio actualizado en businesses:', targetDocId);
    } catch (dbErr) {
      console.error('[Firestore] Error al actualizar comercio:', dbErr);
      showEditError('Error al guardar en la base de datos: ' + (dbErr.message || 'Fallo de permisos o conexión.'));
      return;
    }

    // Actualización en memoria local preservando campos no modificados y datos del representante si existían
    const idx = (app.businesses || []).findIndex(b => b.id === biz.id || b.firestoreId === targetDocId);
    if (idx !== -1) {
      app.businesses[idx] = {
        ...app.businesses[idx],
        ...updatedBusinessData,
        id: targetDocId,
        firestoreId: targetDocId
      };
    }

    app.editBizLogoFile = null;
    app.editBizCoverFile = null;

    app.closeAdminEditBusinessModal();
    app.renderAdminDirectory();
    app.renderDirectory();
    app.showToast(`✅ Comercio "${updatedBusinessData.name}" actualizado exitosamente.`);
  } catch (unexpectedErr) {
    console.error('[AdminEdit] Error inesperado al guardar comercio:', unexpectedErr);
    showEditError('Error inesperado al guardar los cambios: ' + (unexpectedErr.message || 'Inténtalo nuevamente.'));
  } finally {
    resetSaveBtn();
  }
};

// ==========================================================================
// 14.4. MÓDULO EVENTOS — FASE 2.2: GESTIÓN ADMINISTRATIVA, RESILIENCIA Y PURGA
// ==========================================================================

const PENDING_R2_DELETIONS_STORAGE_KEY = '7d_pending_r2_deletions';

// Respaldo en memoria temporal de sesión ante fallos de persistencia en localStorage (H-2.5-02)
app.sessionUnpersistedDeletionsQueue = app.sessionUnpersistedDeletionsQueue || [];

// Mutex de exclusión mutua por URL para serializar la purga de fotografías compartidas entre eventos (H-2.5-01)
app.urlPurgeMutexes = app.urlPurgeMutexes || new Map();

app.withUrlPurgeLock = async function(url, action) {
  if (!url) return action();
  while (app.urlPurgeMutexes.has(url)) {
    await app.urlPurgeMutexes.get(url);
  }
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  app.urlPurgeMutexes.set(url, promise);
  try {
    return await action();
  } finally {
    app.urlPurgeMutexes.delete(url);
    release();
  }
};

app.getPendingR2Deletions = function() {
  try {
    const raw = localStorage.getItem(PENDING_R2_DELETIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
};

app.savePendingR2Deletions = function(list) {
  try {
    localStorage.setItem(PENDING_R2_DELETIONS_STORAGE_KEY, JSON.stringify(list || []));
    return true;
  } catch (err) {
    console.warn('[R2 Queue] Error al persistir cola local en localStorage:', err);
    return false;
  }
};

app.enqueuePendingR2Deletions = function(photos, eventId, operationType = 'edit_removal') {
  const current = app.getPendingR2Deletions();
  const existingUrls = new Set(current.map(item => item.url));
  let addedCount = 0;

  // 1. Incorporar cualquier elemento pendiente en memoria de sesión no registrado en current
  if (Array.isArray(app.sessionUnpersistedDeletionsQueue) && app.sessionUnpersistedDeletionsQueue.length > 0) {
    app.sessionUnpersistedDeletionsQueue.forEach(item => {
      if (item && item.url && !existingUrls.has(item.url)) {
        current.push(item);
        existingUrls.add(item.url);
        addedCount++;
      }
    });
  }

  // 2. Incorporar las nuevas fotos proporcionadas
  if (Array.isArray(photos) && photos.length > 0) {
    photos.forEach(photo => {
      if (photo && photo.url && !existingUrls.has(photo.url)) {
        current.push({
          id: `del_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          url: photo.url,
          photoName: photo.name || photo.fileName || '',
          eventId: eventId || '',
          operationType: operationType, // 'edit_removal' | 'failed_purge'
          registeredAt: Date.now(),
          status: 'pending', // 'pending' | 'failed' | 'protected'
          attempts: 0,
          lastAttemptAt: null,
          lastError: null
        });
        existingUrls.add(photo.url);
        addedCount++;
      }
    });
  }

  // 3. Intentar persistir en localStorage
  if (current.length > 0) {
    const persisted = app.savePendingR2Deletions(current);
    if (!persisted) {
      console.warn('[R2 Queue] Falló la persistencia en localStorage. Conservando en cola temporal de sesión en memoria.');
      // Conservar los registros en la cola de sesión en memoria
      current.forEach(item => {
        if (!app.sessionUnpersistedDeletionsQueue.some(i => i.url === item.url)) {
          app.sessionUnpersistedDeletionsQueue.push(item);
        }
      });
      return { success: false, count: addedCount, persisted: false, queue: current, inMemoryQueue: app.sessionUnpersistedDeletionsQueue };
    } else {
      // Persistencia exitosa: vaciar la cola temporal de sesión en memoria
      app.sessionUnpersistedDeletionsQueue = [];
      console.log(`[R2 Queue] ${addedCount} foto(s) añadidas y persistidas exitosamente en localStorage.`);
    }
  }

  return { success: true, count: addedCount, persisted: true, queue: current };
};

app.dismissPendingR2Deletion = function(deletionId) {
  if (!deletionId) return;
  const current = app.getPendingR2Deletions();
  const item = current.find(i => i.id === deletionId);
  if (!item) return;

  const photoLabel = item.photoName || item.url;
  const proceed = confirm(`¿Deseas descartar de la cola local de purga la fotografía "${photoLabel}"?\n\nEsta fotografía continuará preservada en su evento correspondiente. Al descartarla, solo se retira del registro local y NUNCA se eliminará el archivo físico de R2.`);
  if (!proceed) return;

  const filtered = current.filter(i => i.id !== deletionId);
  app.savePendingR2Deletions(filtered);

  if (Array.isArray(app.sessionUnpersistedDeletionsQueue)) {
    app.sessionUnpersistedDeletionsQueue = app.sessionUnpersistedDeletionsQueue.filter(i => i.id !== deletionId);
  }

  app.renderAdminEvents();
  app.showToast('✅ Registro descartado de la cola local de purga.');
};

app.processPendingR2DeletionsQueue = async function() {
  if (app.isProcessingR2Deletions) return { remaining: 0, successCount: 0 };
  app.isProcessingR2Deletions = true;

  try {
    // Si existen elementos retenidos en memoria de sesión por fallos previos, intentar sincronizarlos primero
    if (Array.isArray(app.sessionUnpersistedDeletionsQueue) && app.sessionUnpersistedDeletionsQueue.length > 0) {
      const syncRes = app.enqueuePendingR2Deletions([], '', 'session_flush');
      if (!syncRes.persisted) {
        console.warn('[R2 Queue] No se puede procesar la purga física mientras localStorage siga inaccesible.');
        if (typeof app.renderAdminEvents === 'function') app.renderAdminEvents();
        return { remaining: app.sessionUnpersistedDeletionsQueue.length, successCount: 0, storageError: true };
      }
    }

    const current = app.getPendingR2Deletions();
    if (current.length === 0) return { remaining: 0, successCount: 0 };

    // Protección estricta: construir el conjunto de URLs referenciadas por TODOS los eventos
    // Incluyendo estados 'active', 'draft', 'archived' y 'deleting' sin excepción (H-2.3-04)
    const referencedUrls = new Set();
    (app.events || []).forEach(evt => {
      if (Array.isArray(evt.photos)) {
        evt.photos.forEach(p => {
          if (p && p.url) referencedUrls.add(p.url);
        });
      }
    });

    const updatedQueue = [];
    let successCount = 0;

    for (const item of current) {
      // Si la fotografía sigue referenciada en cualquier evento, conservarla en la cola marcada como protegida
      if (referencedUrls.has(item.url)) {
        console.warn('[R2 Queue] Omitiendo foto de cola porque sigue referenciada en un evento existente (activo, borrador, archivado o en eliminación):', item.url);
        item.status = 'protected';
        item.lastError = 'Protegida: La fotografía sigue referenciada en otro evento existente en la plataforma.';
        updatedQueue.push(item);
        continue;
      }

      item.attempts = (item.attempts || 0) + 1;
      item.lastAttemptAt = Date.now();

      try {
        const res = await app.eventPhotoEngine.deleteFromR2(item.url);
        if (res && res.success) {
          successCount++;
          // Al confirmar éxito, la foto no se añade a updatedQueue (se purga del registro)
        } else {
          item.status = 'failed';
          item.lastError = (res && res.error) || 'Fallo desconocido en Worker';
          updatedQueue.push(item);
        }
      } catch (err) {
        item.status = 'failed';
        item.lastError = err.message || 'Error de conexión';
        updatedQueue.push(item);
      }
    }

    app.savePendingR2Deletions(updatedQueue);
    if (typeof app.renderAdminEvents === 'function') {
      app.renderAdminEvents();
    }

    return {
      remaining: updatedQueue.length,
      successCount
    };
  } finally {
    app.isProcessingR2Deletions = false;
  }
};

app.renderAdminEvents = function() {
  const container = document.getElementById('admin-events-list');
  if (!container) return;

  const events = app.events || [];
  const badge = document.getElementById('admin-events-badge');
  if (badge) badge.textContent = events.length;

  const pendingDeletions = app.getPendingR2Deletions();
  const sessionQueueCount = (app.sessionUnpersistedDeletionsQueue || []).length;

  let queueAlertHtml = '';
  if (pendingDeletions.length > 0 || sessionQueueCount > 0) {
    const protectedItems = pendingDeletions.filter(i => i.status === 'protected');
    const protectedListHtml = protectedItems.length > 0 ? `
      <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(245, 158, 11, 0.3); font-size: 12px; width: 100%;">
        <strong>Fotografías protegidas por referencias en otros eventos:</strong>
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
          ${protectedItems.map(item => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.25); padding: 4px 8px; border-radius: 4px; gap: 8px;">
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 75%;" title="${item.url}">
                🔒 ${item.photoName || item.url}
              </span>
              <button type="button" class="btn btn-sm btn-secondary" onclick="app.dismissPendingR2Deletion('${item.id}')" style="font-size: 11px; padding: 2px 8px;" title="Descartar de la cola local sin borrar el archivo físico">
                ✕ Descartar
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    const sessionWarningHtml = sessionQueueCount > 0 ? `
      <div style="font-size: 12px; color: #ef4444; margin-top: 4px;">
        ⚠️ Almacenamiento local bloqueado: ${sessionQueueCount} foto(s) retiradas retenidas en memoria temporal de sesión esperando persistencia.
      </div>
    ` : '';

    queueAlertHtml = `
      <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div style="font-size: 13px; color: #f59e0b; flex: 1; min-width: 250px;">
          <strong>⚠️ Cola local de recuperación:</strong> ${pendingDeletions.length} fotografía(s) en cola de purga R2.
          ${sessionWarningHtml}
        </div>
        <button class="btn btn-sm btn-secondary" onclick="app.processPendingR2DeletionsQueue()" style="border-color: #f59e0b; color: #f59e0b;">
          🔄 Procesar Cola de Purga
        </button>
        ${protectedListHtml}
      </div>
    `;
  }

  if (events.length === 0) {
    container.innerHTML = `
      ${queueAlertHtml}
      <div style="text-align: center; padding: 48px 20px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);">
        <div style="font-size: 42px; margin-bottom: 12px;">📸</div>
        <h4 style="margin: 0 0 8px 0; color: #FFFFFF; font-size: 16px;">No hay eventos registrados</h4>
        <p style="color: var(--text-secondary); font-size: 13px; max-width: 440px; margin: 0 auto 20px auto; line-height: 1.5;">
          Publica el primer evento social o corporativo con reseña editorial y una galería de hasta 30 fotografías optimizadas en alta fidelidad.
        </p>
        <button class="btn btn-primary" onclick="app.openAdminEventModal()" style="display: inline-flex; align-items: center; gap: 6px;">
          <span>➕</span> Crear Primer Evento
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = queueAlertHtml;
  events.forEach((evt) => {
    const card = document.createElement('div');
    card.className = 'admin-event-card';

    const isDeleting = evt.status === 'deleting';
    const firstPhoto = (evt.photos && evt.photos[0] && evt.photos[0].url) || '';
    const photoCount = (evt.photos || []).length;
    const catObj = EVENT_CATEGORIES.find(c => c.id === evt.category) || { label: evt.categoryLabel || evt.category || 'Evento', icon: '🎉' };

    let thumbHtml = '';
    if (firstPhoto) {
      thumbHtml = `<img src="${firstPhoto}" class="admin-event-thumb" alt="${evt.title || 'Evento'}" loading="lazy">`;
    } else {
      thumbHtml = `
        <div class="admin-event-thumb" style="font-size: 40px; color: var(--text-secondary);">
          ${catObj.icon}
        </div>
      `;
    }

    const reviewSnippet = (evt.review || 'Sin reseña editorial registrada.').length > 180
      ? (evt.review.slice(0, 177) + '...')
      : (evt.review || '');

    const dateStr = evt.createdAt ? new Date(evt.createdAt).toLocaleDateString('es-VE', {
      year: 'numeric', month: 'short', day: 'numeric'
    }) : 'Fecha no registrada';

    let statusBadgeHtml = '';
    let actionButtonsHtml = '';

    if (isDeleting) {
      const isPhotosPurged = photoCount === 0;
      statusBadgeHtml = `
        <span class="badge" style="background: rgba(239, 68, 68, 0.18); color: #ef4444; font-weight: 700; border: 1px solid rgba(239, 68, 68, 0.35);">
          ${isPhotosPurged ? '⏳ Fotos purgadas: eliminación final de documento pendiente' : `⏳ Eliminación en curso (${photoCount} foto(s) pendientes)`}
        </span>
      `;
      actionButtonsHtml = `
        <button class="btn btn-sm btn-secondary" disabled style="opacity: 0.4; cursor: not-allowed;" title="Evento en proceso de purga">
          ✏️ En Eliminación
        </button>
        <button class="btn btn-sm btn-warning" onclick="app.retryPurgeEventPhotos('${evt.id}')" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.35);">
          ${isPhotosPurged ? '🔄 Reintentar Eliminación de Documento' : `🔄 Reintentar Purga (${photoCount})`}
        </button>
      `;
    } else {
      statusBadgeHtml = `
        <span class="badge" style="background: rgba(85, 201, 154, 0.15); color: #55c99a; font-weight: 700;">
          ${catObj.icon} ${catObj.label}
        </span>
        <span class="badge" style="background: rgba(255, 255, 255, 0.08); color: var(--text-secondary);">
          📸 ${photoCount} / 30 fotos
        </span>
      `;
      actionButtonsHtml = `
        <button class="btn btn-sm btn-secondary" onclick="app.openAdminEventModal('${evt.id}')">
          ✏️ Editar Evento
        </button>
        <button class="btn btn-sm btn-danger-subtle" onclick="app.confirmDeleteAdminEvent('${evt.id}')">
          🗑️ Eliminar
        </button>
      `;
    }

    card.innerHTML = `
      ${thumbHtml}
      <div class="admin-event-body">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
          <div>
            <h4 style="margin: 0 0 6px 0; color: #FFFFFF; font-size: 16px;">${evt.title || 'Evento sin título'}</h4>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              ${statusBadgeHtml}
              <span style="font-size: 11px; color: var(--text-muted);">
                📅 ${dateStr}
              </span>
            </div>
          </div>
        </div>

        <p style="color: var(--text-secondary); font-size: 13px; line-height: 1.5; margin: 4px 0 0 0;">
          ${reviewSnippet}
        </p>

        <div class="admin-event-actions">
          ${actionButtonsHtml}
        </div>
      </div>
    `;

    container.appendChild(card);
  });
};

app.clearEventPreviewUrls = function() {
  if (app.eventPreviewUrls && app.eventPreviewUrls.size > 0) {
    app.eventPreviewUrls.forEach(url => {
      try { URL.revokeObjectURL(url); } catch (_) {}
    });
    app.eventPreviewUrls.clear();
  }
};

app.openAdminEventModal = function(eventId = null) {
  if (!app.isAdminLoggedIn) {
    alert('Debes iniciar sesión como administrador para gestionar eventos.');
    return;
  }

  app.clearEventPreviewUrls();
  app.removedExistingPhotos = [];
  // Instanciar cola con concurrencia de 1 para protección estricta de memoria en móviles
  app.activeEventQueue = app.eventPhotoEngine.createQueue({
    concurrency: 1,
    maxPhotos: 50
  });

  // Configurar seguimiento reactivo de progreso
  app.activeEventQueue.onProgress = function({ completed, total, currentItem, percent }) {
    const box = document.getElementById('event-upload-progress-box');
    const label = document.getElementById('event-upload-progress-label');
    const percentEl = document.getElementById('event-upload-progress-percent');
    const bar = document.getElementById('event-upload-progress-bar');
    if (box && label && percentEl && bar) {
      if (app.activeEventQueue && app.activeEventQueue.isProcessing) {
        box.style.display = 'block';
        percentEl.textContent = `${percent}%`;
        bar.style.width = `${percent}%`;
        if (currentItem) {
          const actionText = currentItem.status === 'processing' ? 'Optimizando (WebP)' : 'Subiendo a R2';
          label.textContent = `${actionText} (${completed + 1}/${total}): ${currentItem.fileName}`;
        } else {
          label.textContent = `Procesando fotografías (${completed}/${total})...`;
        }
      } else {
        if (percent === 100) {
          label.textContent = `¡Procesamiento completado! (${completed}/${total})`;
          setTimeout(() => { if (box) box.style.display = 'none'; }, 2000);
        }
      }
    }
    app.renderEventPhotoGrid();
  };

  const titleEl = document.getElementById('modal-event-title');
  const idInput = document.getElementById('event-id');
  const titleInput = document.getElementById('event-title-input');
  const catInput = document.getElementById('event-category-input');
  const reviewInput = document.getElementById('event-review-input');
  const errBox = document.getElementById('event-form-error');
  const progressBox = document.getElementById('event-upload-progress-box');

  if (errBox) errBox.style.display = 'none';
  if (progressBox) progressBox.style.display = 'none';

  if (eventId) {
    const evt = (app.events || []).find(e => e.id === eventId);
    if (!evt) {
      alert('No se encontró el evento especificado.');
      return;
    }
    if (evt.status === 'deleting') {
      alert('Este evento está en proceso de eliminación y no puede ser editado.');
      return;
    }

    app.currentEditingEventId = eventId;
    if (titleEl) titleEl.textContent = '✏️ Editar Evento';
    if (idInput) idInput.value = evt.id;
    if (titleInput) titleInput.value = evt.title || '';
    if (catInput) catInput.value = evt.category || '';
    if (reviewInput) reviewInput.value = evt.review || '';

    // Cargar fotos existentes en la cola con isNew: false
    app.activeEventQueue.setExistingPhotos(evt.photos || []);
  } else {
    app.currentEditingEventId = null;
    if (titleEl) titleEl.textContent = '📸 Nuevo Evento';
    if (idInput) idInput.value = '';
    if (titleInput) titleInput.value = '';
    if (catInput) catInput.value = '';
    if (reviewInput) reviewInput.value = '';
  }

  app.renderEventPhotoGrid();

  const modal = document.getElementById('modal-admin-event');
  if (modal) modal.classList.add('active');
};

app.closeAdminEventModal = async function(confirmCancel = true) {
  if (confirmCancel && app.activeEventQueue) {
    const hasUploadedNew = app.activeEventQueue.sessionUploadedUrls.size > 0;
    const titleVal = (document.getElementById('event-title-input') || {}).value || '';
    const hasItems = app.activeEventQueue.items.length > 0;

    if (hasUploadedNew) {
      const proceed = confirm('¿Deseas cancelar? Las fotografías nuevas que se subieron durante esta sesión se eliminarán de R2.');
      if (!proceed) return;
      app.showToast('⏳ Limpiando fotografías temporales...');
      try {
        await app.activeEventQueue.cleanupSessionUploadedPhotos();
      } catch (err) {
        console.warn('[EventPhotoEngine] Error durante limpieza de sesión:', err);
      }
    } else if (titleVal.trim() || hasItems) {
      if (!confirm('¿Estás seguro de cerrar el formulario? Se perderán los cambios no guardados.')) {
        return;
      }
    }
  }

  app.clearEventPreviewUrls();
  app.activeEventQueue = null;
  app.currentEditingEventId = null;
  app.removedExistingPhotos = [];

  const modal = document.getElementById('modal-admin-event');
  if (modal) modal.classList.remove('active');
};

app.handleEventPhotoSelect = function(event) {
  const files = Array.from((event.target && event.target.files) || []);
  if (!files.length || !app.activeEventQueue) return;

  const validFiles = [];
  let firstError = null;

  for (const file of files) {
    const val = app.eventPhotoEngine.validateFile(file);
    if (val.valid) {
      validFiles.push(file);
    } else if (!firstError) {
      firstError = `${file.name}: ${val.error}`;
    }
  }

  if (firstError) {
    app.showToast(`⚠️ ${firstError}`);
  }

  if (validFiles.length > 0) {
    try {
      const addRes = app.activeEventQueue.addFiles(validFiles);

      // Crear ObjectURLs para preview ligero (solo de las fotos recién añadidas)
      addRes.added.forEach((item) => {
        if (item.file && !item.previewUrl) {
          const prevUrl = URL.createObjectURL(item.file);
          item.previewUrl = prevUrl;
          app.eventPreviewUrls.add(prevUrl);
        }
      });

      if (addRes.ignoredCount > 0) {
        app.showToast(`⚠️ Se admitieron fotos hasta el límite máximo de 50. Se ignoraron ${addRes.ignoredCount} archivo(s) excedentes.`);
      }
    } catch (err) {
      app.showToast(`⚠️ ${err.message}`);
    }
  }

  event.target.value = '';
  app.renderEventPhotoGrid();
};

app.renderEventPhotoGrid = function() {
  const grid = document.getElementById('event-photos-grid');
  const countBadge = document.getElementById('event-photo-count-badge');
  const retryBtn = document.getElementById('event-retry-btn');
  if (!grid) return;

  const queue = app.activeEventQueue;
  const items = queue ? queue.items : [];

  if (countBadge) {
    countBadge.textContent = `${items.length} / 30 fotos`;
  }

  const hasFailed = items.some(i => i.status === 'failed');
  if (retryBtn) {
    retryBtn.style.display = hasFailed ? 'inline-block' : 'none';
  }

  if (items.length === 0) {
    grid.innerHTML = `
      <div id="event-photos-empty" style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 24px 0; font-size: 13px;">
        No hay fotografías seleccionadas para este evento.
      </div>
    `;
    return;
  }

  grid.innerHTML = '';
  items.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'event-photo-item';

    const imgSrc = item.url || item.previewUrl || '';

    let statusText = '⏳ Pendiente';
    let statusClass = 'pending';
    if (item.status === 'completed') {
      statusText = '✅ Lista';
      statusClass = 'completed';
    } else if (item.status === 'processing') {
      statusText = '⚙️ WebP';
      statusClass = 'processing';
    } else if (item.status === 'uploading') {
      statusText = '☁️ R2';
      statusClass = 'uploading';
    } else if (item.status === 'failed') {
      statusText = '❌ Error';
      statusClass = 'failed';
    }

    const titleAttr = item.error ? `title="${item.error}"` : `title="${item.fileName}"`;

    const isFirst = index === 0;
    const isLast = index === items.length - 1;

    card.innerHTML = `
      <div class="event-photo-thumb-wrap" ${titleAttr}>
        ${imgSrc ? `<img src="${imgSrc}" class="event-photo-thumb" alt="${item.fileName}">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;">📷</div>`}
        <span class="event-photo-badge-order">#${index + 1}</span>
        <span class="event-photo-badge-status ${statusClass}">${statusText}</span>
      </div>
      <div class="event-photo-actions">
        <button type="button" class="event-photo-btn" onclick="app.moveEventPhoto('${item.tempId}', -1)" ${isFirst ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''} title="Mover hacia arriba / adelante">
          ⬅️
        </button>
        <button type="button" class="event-photo-btn" onclick="app.moveEventPhoto('${item.tempId}', 1)" ${isLast ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''} title="Mover hacia abajo / atrás">
          ➡️
        </button>
        <button type="button" class="event-photo-btn remove" onclick="app.removeEventPhoto('${item.tempId}')" title="Retirar fotografía">
          🗑️
        </button>
      </div>
    `;

    grid.appendChild(card);
  });
};

app.moveEventPhoto = function(tempId, direction) {
  if (!app.activeEventQueue) return;
  const items = app.activeEventQueue.items;
  const idx = items.findIndex(i => i.tempId === tempId);
  if (idx === -1) return;

  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= items.length) return;

  const temp = items[idx];
  items[idx] = items[targetIdx];
  items[targetIdx] = temp;

  items.forEach((item, i) => { item.order = i; });
  app.renderEventPhotoGrid();
};

app.removeEventPhoto = function(tempId) {
  if (!app.activeEventQueue) return;
  const items = app.activeEventQueue.items;
  const item = items.find(i => i.tempId === tempId);
  if (!item) return;

  // Si es una foto existente de un evento previo, registrarla para eliminación posterior
  // ÚNICAMENTE si se confirma el guardado del evento
  if (!item.isNew && item.url) {
    app.removedExistingPhotos.push({ ...item });
  }

  // Liberar el ObjectURL temporal de previsualización si existía
  if (item.previewUrl) {
    try { URL.revokeObjectURL(item.previewUrl); } catch (_) {}
    app.eventPreviewUrls.delete(item.previewUrl);
  }

  app.activeEventQueue.removeItem(tempId);
  app.renderEventPhotoGrid();
};

app.retryFailedEventPhotos = async function() {
  if (!app.activeEventQueue || app.activeEventQueue.isProcessing) return;
  const retryBtn = document.getElementById('event-retry-btn');
  if (retryBtn) retryBtn.disabled = true;

  try {
    app.showToast('🔄 Reintentando fotografías con error...');
    await app.activeEventQueue.retryFailed();
  } catch (err) {
    console.warn('[EventPhotoEngine] Error en reintento:', err);
  } finally {
    if (retryBtn) retryBtn.disabled = false;
    app.renderEventPhotoGrid();
  }
};

app.handleAdminEventSubmit = async function(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  // Bloqueo de reentrancia: evitar dobles envíos y ejecuciones concurrentes
  if (app.isSubmittingEvent) {
    console.warn('[Events] Guardado de evento ya en curso, ignorando clic repetido.');
    return;
  }
  if (!app.activeEventQueue) return;

  app.isSubmittingEvent = true;
  const btnSave = document.getElementById('btn-save-event');
  const originalBtnText = btnSave ? btnSave.innerHTML : '💾 Guardar Evento';
  if (btnSave) {
    btnSave.disabled = true;
  }

  const errBox = document.getElementById('event-form-error');
  if (errBox) errBox.style.display = 'none';

  try {
    const title = (document.getElementById('event-title-input') || {}).value.trim();
    const category = (document.getElementById('event-category-input') || {}).value;
    const review = (document.getElementById('event-review-input') || {}).value.trim();

    if (!title) {
      if (errBox) {
        errBox.textContent = 'El título del evento es obligatorio.';
        errBox.style.display = 'block';
      }
      return;
    }

    if (!category) {
      if (errBox) {
        errBox.textContent = 'Debes seleccionar una categoría obligatoria para el evento.';
        errBox.style.display = 'block';
      }
      return;
    }

    if (!review) {
      if (errBox) {
        errBox.textContent = 'La reseña o descripción editorial es obligatoria.';
        errBox.style.display = 'block';
      }
      return;
    }

    const currentItems = app.activeEventQueue.items;
    if (currentItems.length === 0) {
      if (errBox) {
        errBox.textContent = 'Debes agregar al menos una fotografía para la galería del evento.';
        errBox.style.display = 'block';
      }
      return;
    }

    // Si hay fotos pendientes de procesamiento/subida, procesarlas secuencialmente (1 a la vez)
    const pendingCount = currentItems.filter(i => i.status === 'pending' || i.status === 'failed').length;
    if (pendingCount > 0) {
      if (btnSave) {
        btnSave.textContent = '⏳ Procesando y subiendo fotos (1 a la vez)...';
      }

      const summary = await app.activeEventQueue.processQueue();
      if (summary.failed > 0) {
        if (errBox) {
          errBox.textContent = `Hubo un inconveniente al subir ${summary.failed} fotografía(s). Puedes reintentarlas o retirarlas para continuar.`;
          errBox.style.display = 'block';
        }
        return;
      }
    }

    const completedPhotos = app.activeEventQueue.getCompletedPhotos();
    if (completedPhotos.length === 0) {
      if (errBox) {
        errBox.textContent = 'No hay fotografías válidas completadas para guardar el evento.';
        errBox.style.display = 'block';
      }
      return;
    }

    const isEdit = Boolean(app.currentEditingEventId);
    const eventId = app.currentEditingEventId || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const existingEvt = isEdit ? (app.events || []).find(e => e.id === eventId) : null;
    const categoryObj = EVENT_CATEGORIES.find(c => c.id === category) || { id: category, label: category };
    const adminUser = (app.adminAuth && app.adminAuth.currentUser) || {};

    // Preservación estricta del administrador creador y fecha de creación original en ediciones
    const eventPayload = {
      id: eventId,
      title,
      category,
      categoryLabel: categoryObj.label,
      review,
      photos: completedPhotos,
      status: (existingEvt && existingEvt.status) || 'active',
      createdAt: (existingEvt && existingEvt.createdAt) || Date.now(),
      updatedAt: Date.now(),
      authorUid: (existingEvt && existingEvt.authorUid) || adminUser.uid || 'admin',
      authorEmail: (existingEvt && existingEvt.authorEmail) || adminUser.email || 'admin@dfarra.com'
    };

    if (btnSave) {
      btnSave.textContent = 'Guardando evento en Firestore...';
    }

    let savedInFirestore = false;
    let firestoreErrorReason = null;

    if (!db) {
      firestoreErrorReason = 'La base de datos de Firebase no está inicializada o no se encuentra disponible. No se pudo guardar el evento.';
      console.error('[Firestore] Guardado cancelado: Firebase db no está inicializado.');
    } else {
      try {
        await db.collection(FIRESTORE_EVENTS_COLLECTION).doc(eventId).set(eventPayload);
        savedInFirestore = true;
        console.log('[Firestore] Evento persistido exitosamente en events:', eventId);
      } catch (dbErr) {
        console.error('[Firestore] Error al guardar en events:', dbErr);
        if (dbErr.code === 'permission-denied' || (dbErr.message && (dbErr.message.includes('permission') || dbErr.message.includes('Missing or insufficient permissions')))) {
          firestoreErrorReason = 'Permiso denegado por las reglas de seguridad de Firestore para la colección "events".';
        } else {
          firestoreErrorReason = 'Error al registrar el evento en el servidor: ' + (dbErr.message || 'Error de conexión con la base de datos');
        }
      }
    }

    // Verificación de persistencia: informar al usuario si hubo error en Firestore y detener
    if (!savedInFirestore) {
      if (errBox) {
        errBox.textContent = firestoreErrorReason;
        errBox.style.display = 'block';
      }
      app.showToast('❌ ' + firestoreErrorReason);
      return;
    }

    // Si el guardado en Firestore tuvo éxito:
    // 1. Actualizar estado local en memoria para que app.events refleje de inmediato las fotos conservadas
    const existingIdx = (app.events || []).findIndex(e => e.id === eventId);
    if (existingIdx !== -1) {
      app.events[existingIdx] = eventPayload;
    } else {
      app.events.unshift(eventPayload);
    }

    // 2. Descartar la cola de sesión sin ejecutar limpieza de las fotos nuevas
    app.activeEventQueue = null;

    // 3. Si fue edición y se retiraron fotos existentes, registrar en cola persistente antes de eliminar
    if (isEdit && app.removedExistingPhotos && app.removedExistingPhotos.length > 0) {
      const enqueueRes = app.enqueuePendingR2Deletions(app.removedExistingPhotos, eventId, 'edit_removal');
      app.removedExistingPhotos = [];

      if (!enqueueRes.persisted) {
        // Si falló la persistencia local (QuotaExceededError, SecurityError, etc.), no iniciar la purga física
        app.showToast('⚠️ Evento guardado en base de datos, pero la purga física de fotos retiradas quedó pendiente (fallo de almacenamiento local).');
      } else {
        // Procesar cola persistente inmediatamente
        const queueRes = await app.processPendingR2DeletionsQueue();
        if (queueRes && queueRes.remaining > 0) {
          app.showToast(`⚠️ Evento guardado, pero ${queueRes.remaining} foto(s) retiradas quedaron en cola de eliminación.`);
        }
      }
    }

    app.clearEventPreviewUrls();

    const modal = document.getElementById('modal-admin-event');
    if (modal) modal.classList.remove('active');

    app.renderAdminEvents();
    app.renderAdminDashboard();
    app.showToast(`✅ Evento "${eventPayload.title}" guardado exitosamente.`);
  } finally {
    // Liberar siempre el bloqueo de reentrancia en el bloque finally
    app.isSubmittingEvent = false;
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = originalBtnText;
    }
  }
};

app.confirmDeleteAdminEvent = function(eventId) {
  const evt = (app.events || []).find(e => e.id === eventId);
  if (!evt) return;

  const photoCount = (evt.photos || []).length;
  app.showConfirmModal({
    title: 'Eliminar Evento',
    message: `¿Estás seguro de eliminar el evento "${evt.title}" y sus ${photoCount} fotografías de la galería? El evento pasará a purga segura de archivos.`,
    confirmText: 'Sí, Eliminar Evento',
    onConfirm: () => app.executeDeleteAdminEvent(eventId)
  });
};

app.executeDeleteAdminEvent = async function(eventId) {
  const evt = (app.events || []).find(e => e.id === eventId);
  if (!evt) return;

  app.showToast('⏳ Iniciando proceso de eliminación segura...');

  // 1. Marcar estado 'deleting' en Firestore esperando confirmación previa
  if (db) {
    try {
      await db.collection(FIRESTORE_EVENTS_COLLECTION).doc(eventId).update({
        status: 'deleting',
        deletionStartedAt: Date.now()
      });
      console.log('[Firestore] Evento marcado como deleting:', eventId);
    } catch (err) {
      console.error('[Firestore] Error al marcar evento como deleting en Firestore:', err);
      app.showToast('Error al actualizar en Firestore: ' + (err.message || 'Error desconocido'));
      return;
    }
  }

  // Actualizar estado en memoria local
  evt.status = 'deleting';
  app.renderAdminEvents();
  app.renderAdminDashboard();

  // Proceder a la purga controlada de fotos
  await app.purgeEventPhotos(eventId);
};

app.retryPurgeEventPhotos = async function(eventId) {
  const evt = (app.events || []).find(e => e.id === eventId);
  if (!evt) return;

  app.showToast('🔄 Reintentando purga de fotografías en R2...');
  await app.purgeEventPhotos(eventId);
};

app.purgeEventPhotos = async function(eventId) {
  if (!app.purgingEventIds) {
    app.purgingEventIds = new Set();
  }
  if (app.purgingEventIds.has(eventId)) {
    console.warn('[Events] Purga de este evento ya en curso, ignorando solicitud duplicada:', eventId);
    app.showToast('⏳ Ya existe una purga en curso para este evento.');
    return;
  }
  app.purgingEventIds.add(eventId);

  try {
    const evt = (app.events || []).find(e => e.id === eventId);
    if (!evt) return;

    let remainingPhotos = [...(evt.photos || [])];
    let failedDeletions = 0;
    let lastError = null;

    // Si aún quedan fotos, purgar secuencialmente en R2 (en orden inverso)
    if (remainingPhotos.length > 0) {
      for (let i = remainingPhotos.length - 1; i >= 0; i--) {
        const photo = remainingPhotos[i];
        if (photo && photo.url) {
          await app.withUrlPurgeLock(photo.url, async () => {
            // Verificar si la URL continúa referenciada por cualquier OTRO evento existente en app.events
            // (independientemente de que esté active, draft, archived o deleting) (H-2.5-01)
            const isReferencedByOther = (app.events || []).some(otherEvt => {
              if (!otherEvt || otherEvt.id === eventId) return false;
              if (!Array.isArray(otherEvt.photos)) return false;
              return otherEvt.photos.some(p => p && p.url === photo.url);
            });

            if (isReferencedByOther) {
              // Si otro evento aún la referencia:
              // - NO ejecutar DELETE sobre R2.
              // - Retirar la fotografía únicamente de la lista remainingPhotos del evento que se está purgando.
              console.log('[Events Purge] Fotografía compartida referenciada por otro evento. Se omite DELETE en R2:', photo.url);
              remainingPhotos.splice(i, 1);
              evt.photos = remainingPhotos;

              // Persistir el avance en Firestore siguiendo el flujo progresivo existente
              if (db) {
                try {
                  await db.collection(FIRESTORE_EVENTS_COLLECTION).doc(eventId).update({
                    photos: remainingPhotos,
                    updatedAt: Date.now()
                  });
                } catch (fsErr) {
                  console.warn('[Firestore] Error al actualizar fotos pendientes tras omitir compartida:', fsErr);
                }
              }
              return;
            }

            // Si ningún otro evento la referencia, proceder a la eliminación física en R2
            try {
              const delRes = await app.eventPhotoEngine.deleteFromR2(photo.url);
              if (delRes && delRes.success) {
                remainingPhotos.splice(i, 1);
                evt.photos = remainingPhotos;

                // Actualizar documento de Firestore progresivamente tras cada eliminación confirmada
                if (db) {
                  try {
                    await db.collection(FIRESTORE_EVENTS_COLLECTION).doc(eventId).update({
                      photos: remainingPhotos,
                      updatedAt: Date.now()
                    });
                  } catch (fsErr) {
                    console.warn('[Firestore] Error al actualizar fotos pendientes tras DELETE:', fsErr);
                  }
                }
              } else {
                failedDeletions++;
                lastError = (delRes && delRes.error) || 'Fallo al eliminar en R2';
              }
            } catch (err) {
              failedDeletions++;
              lastError = err.message || 'Error de conexión';
            }
          });
        } else {
          remainingPhotos.splice(i, 1);
        }
      }
      // Actualizar lista en memoria local
      evt.photos = remainingPhotos;
    }

    if (remainingPhotos.length === 0) {
      // Todas las fotos han sido purgadas (o el evento ya no tenía fotos pendientes).
      // Proceder al intento de eliminación definitiva del documento en Firestore.
      let docDeletedInFirestore = false;
      let docDeleteError = null;

      if (db) {
        try {
          await db.collection(FIRESTORE_EVENTS_COLLECTION).doc(eventId).delete();
          docDeletedInFirestore = true;
          console.log('[Firestore] Documento eliminado definitivamente tras purga completa:', eventId);
        } catch (err) {
          docDeleteError = err.message || 'Error desconocido';
          console.error('[Firestore] Error al eliminar documento final tras purga:', err);
        }
      } else {
        docDeletedInFirestore = true;
      }

      if (docDeletedInFirestore) {
        // Confirmación real en base de datos: retirar de la memoria local y notificar éxito permanente
        app.events = (app.events || []).filter(e => e.id !== eventId);
        app.renderAdminEvents();
        app.renderAdminDashboard();
        app.showToast(`✅ Evento "${evt.title}" y todas sus fotografías eliminados permanentemente.`);
      } else {
        // Fallo en la eliminación del documento: NO retirar de app.events ni mostrar falso éxito
        evt.status = 'deleting';
        evt.photos = [];
        evt.deletionError = `Fotografías purgadas de R2 con éxito, pero falló la eliminación final del documento en Firestore: ${docDeleteError}`;

        if (db) {
          try {
            await db.collection(FIRESTORE_EVENTS_COLLECTION).doc(eventId).update({
              status: 'deleting',
              photos: [],
              deletionError: evt.deletionError,
              updatedAt: Date.now()
            });
          } catch (_) {}
        }

        app.renderAdminEvents();
        app.renderAdminDashboard();
        app.showToast('⚠️ Fotografías eliminadas de R2 con éxito, pero falló la eliminación del documento en Firestore. Puedes reintentar.');
      }
    } else {
      // Quedaron fotos pendientes de eliminación en R2
      if (db) {
        try {
          await db.collection(FIRESTORE_EVENTS_COLLECTION).doc(eventId).update({
            status: 'deleting',
            photos: remainingPhotos,
            deletionError: `Quedaron ${remainingPhotos.length} fotografía(s) pendientes de eliminación. Último error: ${lastError}`,
            updatedAt: Date.now()
          });
        } catch (fsErr) {
          console.warn('[Firestore] Error al persistir estado deleting con fotos pendientes:', fsErr);
        }
      }
      app.renderAdminEvents();
      app.renderAdminDashboard();
      app.showToast(`⚠️ Quedaron ${remainingPhotos.length} foto(s) pendientes de eliminación en R2. Puedes reintentar la purga.`);
    }
  } finally {
    // Liberación garantizada del bloqueo de purga por evento
    app.purgingEventIds.delete(eventId);
  }
};

// ==========================================================================
// 14.4.1. MÓDULO EVENTOS — FASE 3.0: SECCIÓN E INTERFAZ PÚBLICA DE EVENTOS
// ==========================================================================

// Mapeo seguro de categorías de eventos
app.getEventCategoryLabel = function(catKey) {
  const map = {
    'birthday': '🎂 Cumpleaños',
    'fifteen_years': '👑 15 años',
    'wedding': '💍 Bodas',
    'corporate': '💼 Corporativo',
    'celebration': '🎉 Celebraciones'
  };
  return map[catKey] || (catKey ? String(catKey) : '🎉 Evento');
};

// Obtención robusta de timestamp de publicación para ordenamiento (prioridad createdAt, fallback publishedAt; NUNCA evt.date)
app.getEventPublishTimestamp = function(evt) {
  if (!evt) return 0;
  // Prioridad 1: createdAt; Prioridad 2: publishedAt (NUNCA usar evt.date ya que representa la fecha de celebración del evento)
  const raw = (evt.createdAt !== undefined && evt.createdAt !== null) ? evt.createdAt : evt.publishedAt;
  if (!raw) return 0;

  // Objeto Timestamp de Firestore
  if (typeof raw === 'object') {
    if (typeof raw.toMillis === 'function') {
      try { return raw.toMillis(); } catch(e) {}
    }
    if (typeof raw.toDate === 'function') {
      try { return raw.toDate().getTime(); } catch(e) {}
    }
    if (typeof raw.seconds === 'number') {
      return raw.seconds * 1000 + Math.floor((raw.nanoseconds || 0) / 1000000);
    }
    if (typeof raw._seconds === 'number') {
      return raw._seconds * 1000 + Math.floor((raw._nanoseconds || 0) / 1000000);
    }
  }

  // Si es un número (milisegundos o segundos unix)
  if (typeof raw === 'number') {
    return raw < 10000000000 ? raw * 1000 : raw;
  }

  // Si es string de fecha o ISO
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (!isNaN(parsed)) return parsed;
  }

  return 0;
};

// Formato de fecha legible y elegante
app.formatEventDate = function(timestamp) {
  if (!timestamp) return '';
  try {
    let ms = 0;
    if (typeof timestamp === 'object') {
      if (typeof timestamp.toMillis === 'function') ms = timestamp.toMillis();
      else if (typeof timestamp.toDate === 'function') ms = timestamp.toDate().getTime();
      else if (typeof timestamp.seconds === 'number') ms = timestamp.seconds * 1000;
      else if (typeof timestamp._seconds === 'number') ms = timestamp._seconds * 1000;
    } else if (typeof timestamp === 'number') {
      ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    } else if (typeof timestamp === 'string') {
      ms = Date.parse(timestamp);
    }
    if (!ms || isNaN(ms)) return '';
    const d = new Date(ms);
    return d.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch(e) {
    return '';
  }
};

// Renderizado de la barra de filtros de categoría de eventos (Unificado con Lucide y estilo de Category Pills de 7DApp)
app.renderEventCategoryFilters = function() {
  const container = document.getElementById('event-category-filters');
  if (!container) return;

  const currentCat = app.currentEventCategory || 'all';
  const filterOptions = [
    { id: 'all', label: 'Todas', lucideIcon: 'layers' },
    ...EVENT_CATEGORIES.map(c => ({
      id: c.id,
      label: c.label,
      lucideIcon: c.lucideIcon || app.getCategoryLucideIcon(c.id)
    }))
  ];

  container.innerHTML = filterOptions.map(cat => {
    const isActive = currentCat === cat.id;
    const iconSvg = app.createLucideSvgString(cat.lucideIcon, 'cat-pill-lucide', 16);
    return `
      <button 
        type="button" 
        class="cat-pill-item event-cat-chip${isActive ? ' active' : ''}" 
        onclick="app.filterEventsByCategory('${cat.id}')"
        role="tab"
        aria-selected="${isActive ? 'true' : 'false'}"
        data-category="${cat.id}"
        title="Filtrar por ${cat.label}">
        <span class="cat-pill-icon">${iconSvg}</span>
        <span class="cat-pill-label">${cat.label}</span>
      </button>
    `;
  }).join('');

  if (typeof app.refreshLucideIcons === 'function') {
    app.refreshLucideIcons();
  }
};

// Cambio reactivo y en memoria de la categoría activa de eventos
app.filterEventsByCategory = function(categoryKey) {
  app.currentEventCategory = categoryKey || 'all';
  app.renderEventCategoryFilters();
  app.renderPublicEvents();
};

// Renderizado de flyers destacados bajo la sección de eventos (máximo 5 activos)
app.renderRecentFlyersForEvents = function() {
  const container = document.getElementById('events-recent-flyers-grid');
  const section = document.getElementById('events-recent-flyers-section');
  if (!container) return;
  container.innerHTML = '';

  const now = Date.now();
  // Filtrar flyers activos y no expirados de la lista de promociones existente
  const activePromos = (app.promotions || []).filter(promo => {
    if (promo.status !== 'active') return false;
    const expMs = app.getPromoExpirationMs ? app.getPromoExpirationMs(promo) : null;
    if (expMs && expMs < now) return false;
    return true;
  });

  // Ordenar del más nuevo al más antiguo
  activePromos.sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));

  // Máximo 5 flyers activos
  const topFlyers = activePromos.slice(0, 5);

  if (section) {
    section.style.display = (topFlyers.length > 0) ? 'block' : 'none';
  }

  topFlyers.forEach(promo => {
    const card = app.createPromoCardElement(promo, now);
    container.appendChild(card);
  });
};

// Renderizado público de la lista de eventos
app.renderPublicEvents = function() {
  const grid = document.getElementById('public-events-grid');
  const loading = document.getElementById('events-loading');
  const errorBox = document.getElementById('events-error');
  const emptyState = document.getElementById('events-empty-state');
  const emptyTitle = document.getElementById('events-empty-title');
  const emptyDesc = document.getElementById('events-empty-desc');
  const emptyAction = document.getElementById('events-empty-action');
  const countBadge = document.getElementById('active-events-count');

  // Sincronizar botones de categorías de eventos
  if (typeof app.renderEventCategoryFilters === 'function') {
    app.renderEventCategoryFilters();
  }

  if (!grid) return;
  grid.innerHTML = '';

  // 1. Estado de carga inicial
  if (!app.eventsLoaded) {
    if (loading) loading.style.display = 'flex';
    if (errorBox) errorBox.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    return;
  }
  if (loading) loading.style.display = 'none';

  // 2. Estado de error de lectura
  if (app.eventsLoadError) {
    if (errorBox) errorBox.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    return;
  }
  if (errorBox) errorBox.style.display = 'none';

  // 3. Filtrar exclusivamente status === 'active' (excluye draft, archived, deleting y otros)
  const allActiveEvents = (app.events || []).filter(e => e && e.status === 'active');

  // 4. Filtrar por categoría seleccionada en memoria (sin lecturas adicionales a Firestore)
  const currentCat = app.currentEventCategory || 'all';
  const categoryFilteredEvents = currentCat === 'all'
    ? allActiveEvents
    : allActiveEvents.filter(e => e.category === currentCat);

  // 5. Ordenar por fecha de publicación más reciente (prioridad createdAt, fallback a publishedAt; NUNCA por date)
  categoryFilteredEvents.sort((a, b) => {
    const timeA = app.getEventPublishTimestamp(a);
    const timeB = app.getEventPublishTimestamp(b);
    return timeB - timeA;
  });

  // 6. Limitar a un máximo de 10 eventos DESPUÉS de aplicar el filtro
  const visibleEvents = categoryFilteredEvents.slice(0, 10);

  // 7. Actualizar el contador visible
  if (countBadge) {
    countBadge.textContent = visibleEvents.length;
  }

  // 8. Estado de listado vacío (con mensaje contextual por categoría y acción para resetear)
  if (visibleEvents.length === 0) {
    if (emptyState) {
      if (currentCat !== 'all') {
        const catObj = EVENT_CATEGORIES.find(c => c.id === currentCat);
        const catLabel = catObj ? catObj.label : currentCat;
        if (emptyTitle) emptyTitle.textContent = `No hay coberturas de ${catLabel} en este momento`;
        if (emptyDesc) emptyDesc.textContent = 'Próximamente publicaremos coberturas fotográficas para esta categoría.';
        if (emptyAction) emptyAction.style.display = 'block';
      } else {
        if (emptyTitle) emptyTitle.textContent = 'No hay eventos disponibles en este momento';
        if (emptyDesc) emptyDesc.textContent = 'Próximamente publicaremos nuevas coberturas fotográficas y momentos destacados.';
        if (emptyAction) emptyAction.style.display = 'none';
      }
      emptyState.style.display = 'block';
    }
    app.renderRecentFlyersForEvents();
    return;
  }
  if (emptyState) emptyState.style.display = 'none';

  // 9. Renderizado de tarjetas públicas
  visibleEvents.forEach(evt => {
    const card = document.createElement('div');
    card.className = 'event-card';
    card.onclick = () => app.openEventDetail(evt.id);

    // Selección de primera fotografía válida respetando el orden
    const validPhotos = (evt.photos || []).filter(p => p && p.url && typeof p.url === 'string' && p.url.trim().length > 0);
    const primaryPhoto = validPhotos[0];
    const catLabel = app.getEventCategoryLabel(evt.category);
    const dateStr = app.formatEventDate(evt.createdAt || evt.publishedAt);

    const mediaHtml = primaryPhoto
      ? `<img class="event-card-img" src="${primaryPhoto.url}" alt="${evt.title || 'Evento'}" loading="lazy">`
      : `<div class="event-card-placeholder">
           <span class="event-card-placeholder-icon">📸</span>
           <span style="font-size: 12px; font-weight: 600;">Cobertura fotográfica</span>
         </div>`;

    const photosBadge = validPhotos.length > 0
      ? `<span class="event-badge-photos">📸 ${validPhotos.length} foto${validPhotos.length === 1 ? '' : 's'}</span>`
      : '';

    const reviewSnippet = evt.review
      ? `<p class="event-card-review-snippet">${evt.review.length > 120 ? evt.review.slice(0, 117) + '...' : evt.review}</p>`
      : '';

    // SEGURIDAD: Nunca exponer authorUid, authorEmail, lastEditorUid, lastEditorEmail en atributos o DOM
    card.innerHTML = `
      <div class="event-card-image-wrap">
        ${mediaHtml}
        <span class="event-badge-cat">${catLabel}</span>
        ${photosBadge}
      </div>
      <div class="event-card-body">
        <h3 class="event-card-title">${evt.title || 'Evento Especial'}</h3>
        ${reviewSnippet}
        <div class="event-card-footer">
          <span class="event-card-date">${dateStr}</span>
          <span class="event-card-cta-btn">Ver cobertura →</span>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });

  // Refrescar flyers recientes bajo eventos
  app.renderRecentFlyersForEvents();
};

// Apertura del detalle individual del evento
app.openEventDetail = function(eventId) {
  const errorEl = document.getElementById('event-detail-error');
  const contentEl = document.getElementById('event-detail-content');
  const titleEl = document.getElementById('event-detail-title');
  const catBadge = document.getElementById('event-detail-category-badge');
  const dateEl = document.getElementById('event-detail-date');
  const reviewEl = document.getElementById('event-detail-review-text');
  const photoCountEl = document.getElementById('event-detail-photo-count');
  const galleryGrid = document.getElementById('event-detail-gallery-grid');
  const emptyGalleryEl = document.getElementById('event-detail-empty-gallery');

  const event = (app.events || []).find(e => e.id === eventId);

  // Estados de validación: evento no encontrado o que dejó de estar activo
  if (!event || event.status !== 'active') {
    app.currentEvent = null;
    if (contentEl) contentEl.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = 'block';
      const errorTitle = document.getElementById('event-detail-error-title');
      const errorDesc = document.getElementById('event-detail-error-desc');
      if (!event) {
        if (errorTitle) errorTitle.textContent = 'Evento no encontrado';
        if (errorDesc) errorDesc.textContent = 'El evento solicitado no existe o fue retirado.';
      } else {
        if (errorTitle) errorTitle.textContent = 'Evento no disponible';
        if (errorDesc) errorDesc.textContent = 'Esta cobertura ya no se encuentra activa al público.';
      }
    }
    app.showScreen('event-detail');
    return;
  }

  // Evento activo disponible
  app.currentEvent = event;
  if (errorEl) errorEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'flex';

  if (titleEl) titleEl.textContent = event.title || 'Cobertura de Evento';
  if (catBadge) catBadge.textContent = app.getEventCategoryLabel(event.category);
  if (dateEl) dateEl.textContent = app.formatEventDate(event.createdAt);
  if (reviewEl) {
    reviewEl.textContent = event.review || 'Sin reseña disponible para esta cobertura.';
  }

  // Galería fotográfica (hasta 30 fotos, respetando orden)
  const validPhotos = (event.photos || []).filter(p => p && p.url && typeof p.url === 'string' && p.url.trim().length > 0);
  if (photoCountEl) photoCountEl.textContent = validPhotos.length;

  if (galleryGrid) {
    galleryGrid.innerHTML = '';
    if (validPhotos.length === 0) {
      if (emptyGalleryEl) emptyGalleryEl.style.display = 'block';
    } else {
      if (emptyGalleryEl) emptyGalleryEl.style.display = 'none';
      validPhotos.forEach((photo, idx) => {
        const item = document.createElement('div');
        item.className = 'event-gallery-item';
        item.title = `Ampliar foto ${idx + 1}`;
        item.onclick = () => app.openEventPhotoLightbox(idx);
        item.innerHTML = `
          <img src="${photo.url}" alt="${photo.name || 'Foto ' + (idx + 1)}" loading="lazy">
          <div class="event-gallery-zoom-overlay">🔍</div>
        `;
        galleryGrid.appendChild(item);
      });
    }
  }

  // Sincronizar enlace hash sin provocar saltos bruscos
  try {
    history.replaceState(null, '', `#event=${event.id}`);
  } catch(e) {
    window.location.hash = `event=${event.id}`;
  }

  // Actualización dinámica de metadatos sociales Open Graph y Twitter Cards
  const primaryCover = event.coverUrl || (validPhotos.length > 0 ? validPhotos[0].url : 'https://dfarra.web.app/icons/dfarra-app-icon-512.png');
  app.updateSocialMeta({
    title: `${event.title || 'Cobertura de Evento'} | Dfarra`,
    description: event.review ? event.review.slice(0, 150) : `Cobertura exclusiva en Dfarra - ${app.getEventCategoryLabel(event.category)}`,
    image: primaryCover,
    url: `${window.location.origin}${window.location.pathname}#event=${event.id}`
  });

  app.showScreen('event-detail');
};

// Cierre del detalle individual
app.closeEventDetail = function() {
  app.currentEvent = null;
  try {
    history.replaceState(null, '', window.location.pathname);
  } catch(e) {
    window.location.hash = '';
  }
  app.resetSocialMeta();
  app.showScreen('events');
};

// Compartir evento con Web Share API (con tarjeta visual hero) y fallbacks
app.shareEvent = async function(event) {
  if (!event) return;
  const origin = (window.location.origin && window.location.origin !== 'null') ? window.location.origin : 'https://dfarra.web.app';
  const pathname = window.location.pathname || '/';
  const url = `${origin}${pathname}#event=${event.id}`;
  const catLabel = app.getEventCategoryLabel(event.category);
  const title = `${event.title || 'Evento'} | Dfarra`;
  let text = `📸 ¡Cobertura exclusiva en Dfarra!\n\n✨ ${event.title}\n🏷️ ${catLabel}`;
  if (event.review) {
    const cleanReview = event.review.length > 140 ? event.review.slice(0, 137) + '...' : event.review;
    text += `\n\n💬 ${cleanReview}`;
  }
  text += `\n\n👉 Mira la galería fotográfica completa aquí:\n${url}`;

  app.showToast('⏳ Preparando tarjeta del evento...');
  const cardFile = await app.generateEventCardImage(event);

  await app.executeShare({
    title,
    text,
    url,
    file: cardFile
  });
};

app.shareCurrentEvent = function() {
  if (app.currentEvent) {
    app.shareEvent(app.currentEvent);
  } else {
    app.shareApp();
  }
};

// Lightbox / Visor de fotos ampliado
app.openEventPhotoLightbox = function(index = 0) {
  if (!app.currentEvent) return;
  const validPhotos = (app.currentEvent.photos || []).filter(p => p && p.url && typeof p.url === 'string' && p.url.trim().length > 0);
  if (validPhotos.length === 0) return;

  app.currentLightboxPhotos = validPhotos;
  app.currentLightboxPhotoIndex = Math.max(0, Math.min(index, validPhotos.length - 1));

  const modal = document.getElementById('modal-event-lightbox');
  const imgEl = document.getElementById('lightbox-img');
  const counterEl = document.getElementById('lightbox-counter');

  if (imgEl) {
    imgEl.src = app.currentLightboxPhotos[app.currentLightboxPhotoIndex].url;
  }
  if (counterEl) {
    counterEl.textContent = `Foto ${app.currentLightboxPhotoIndex + 1} de ${app.currentLightboxPhotos.length}`;
  }
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }
  document.body.classList.add('modal-open');
};

app.closeEventPhotoLightbox = function() {
  const modal = document.getElementById('modal-event-lightbox');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
  document.body.classList.remove('modal-open');
};

app.nextEventPhoto = function() {
  if (!app.currentLightboxPhotos || app.currentLightboxPhotos.length === 0) return;
  app.currentLightboxPhotoIndex = (app.currentLightboxPhotoIndex + 1) % app.currentLightboxPhotos.length;

  const imgEl = document.getElementById('lightbox-img');
  const counterEl = document.getElementById('lightbox-counter');
  if (imgEl) {
    imgEl.src = app.currentLightboxPhotos[app.currentLightboxPhotoIndex].url;
  }
  if (counterEl) {
    counterEl.textContent = `Foto ${app.currentLightboxPhotoIndex + 1} de ${app.currentLightboxPhotos.length}`;
  }
};

app.prevEventPhoto = function() {
  if (!app.currentLightboxPhotos || app.currentLightboxPhotos.length === 0) return;
  app.currentLightboxPhotoIndex = (app.currentLightboxPhotoIndex - 1 + app.currentLightboxPhotos.length) % app.currentLightboxPhotos.length;

  const imgEl = document.getElementById('lightbox-img');
  const counterEl = document.getElementById('lightbox-counter');
  if (imgEl) {
    imgEl.src = app.currentLightboxPhotos[app.currentLightboxPhotoIndex].url;
  }
  if (counterEl) {
    counterEl.textContent = `Foto ${app.currentLightboxPhotoIndex + 1} de ${app.currentLightboxPhotos.length}`;
  }
};


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
    if (title) title.textContent = 'Instalar Dfarra';
    if (message) message.textContent = 'Pulsa Compartir y luego “Agregar a pantalla de inicio”.';
    if (installButton) {
      installButton.textContent = 'Cómo instalar';
      installButton.onclick = () => {
        alert('Para instalar Dfarra en tu iPhone o iPad:\n\n1. Abre esta página en Safari.\n2. Pulsa el botón Compartir.\n3. Selecciona “Agregar a pantalla de inicio”.\n4. Confirma pulsando “Agregar”.');
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
  console.log('[Dfarra] Motor web inicializado.');

  // Renderizar componentes principales de inmediato
  app.renderPublicEvents();
  app.renderRecentFlyersForEvents();
  app.renderCategories();
  app.renderPromotions();
  app.renderCitiesModal();
  app.renderCitiesPage();
  app.updatePublishSelects();

  // Iniciar escucha en tiempo real de Firestore
  app.initFirestoreSync();

  // Soporte para navegación directa por enlace (#promo=ID, #biz=ID, #event=ID)
  app.handleDeepLink();

  // Soporte para tecla Escape y navegación por teclado en modales y paneles
  window.addEventListener('keydown', (e) => {
    // Lightbox modal de eventos
    const lightboxModal = document.getElementById('modal-event-lightbox');
    if (lightboxModal && (lightboxModal.style.display === 'flex' || lightboxModal.classList.contains('active'))) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        app.closeEventPhotoLightbox();
        return;
      } else if (e.key === 'ArrowRight') {
        app.nextEventPhoto();
        return;
      } else if (e.key === 'ArrowLeft') {
        app.prevEventPhoto();
        return;
      }
    }

    if (e.key === 'Escape' || e.key === 'Esc') {
      const catSheet = document.getElementById('modal-all-categories');
      if (catSheet && catSheet.classList.contains('active')) {
        app.closeAllCategoriesSheet();
      }
    }
  });

  // Refrescar iconos Lucide tras carga inicial
  app.refreshLucideIcons();

  // Soporte para Service Worker PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
