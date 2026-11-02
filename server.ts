import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { initializeApp, getApps, cert, type App as FirebaseAdminApp } from 'firebase-admin/app';
import { getAuth, type Auth as FirebaseAuth, type DecodedIdToken } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const privateRegistrationsFile = path.join(dataDir, 'private_registrations.json');

// Middleware para procesar cuerpos JSON
app.use(express.json());

// ============================================================================
// MODELOS DE DATOS: AUTORIZACIÓN COMERCIAL Y CUPONES (FASE 2 Y 3)
// ============================================================================

/**
 * 1. Modelo de Autorización y Representación Comercial
 * Vincula inequívocamente el comercio (businessId) con la identidad autenticada (uid de Firebase Auth).
 */
export interface BusinessRepresentativeAuthorization {
  id: string; // Identificador único: auth_${businessId}_${uid}
  businessId: string; // ID inequívoco del comercio (ej. biz_1729350000000)
  businessName: string; // Nombre comercial para auditoría
  uid: string; // UID inmutable emitido por Firebase Authentication
  email: string; // Correo verificado por Google Auth
  emailVerified: boolean; // Validación criptográfica de Google
  status: 'pending_binding' | 'pending_approval' | 'verified' | 'rejected' | 'revoked';
  requestedAt: string; // ISO 8601
  reviewedAt: string | null; // ISO 8601
  reviewedByAdminUid: string | null; // UID del administrador aprobador/rechazador
  reviewedByAdminEmail: string | null; // Email del admin
  rejectionReason: string | null; // Justificación del rechazo administrativo si aplica
  revokedAt: string | null; // ISO 8601 si aplica
  revocationReason: string | null; // Justificación del admin
  permissions: Array<'coupons:create' | 'coupons:edit' | 'coupons:view_metrics' | 'coupons:redeem'>;
  verificationMetadata: {
    contactPhone: string;
    legalRepresentativeName: string;
    registrationSource: 'business_registration' | 'manual_claim';
    notes?: string;
  };
}

/**
 * 2. Modelo Técnico de Cupones Comerciales
 * Estructura protegida donde cada cupón pertenece estrictamente a un comercio y su creador.
 */
export interface BusinessCoupon {
  id: string; // cpn_${businessId}_${timestamp}
  businessId: string; // ID del comercio propietario (Aislamiento multi-inquilino)
  businessName: string;
  cityId: string; // Ciudad de validez territorial
  createdByUid: string; // UID del representante que lo emitió (debe estar en 'verified')
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  
  // Contenido y Términos
  title: string;
  description: string;
  termsAndConditions: string[];
  
  // Vigencia
  startDate: string; // ISO 8601
  expirationDate: string; // ISO 8601
  
  // Estados y Operación
  status: 'draft' | 'pending_review' | 'active' | 'paused' | 'expired' | 'revoked';
  redemptionType: 'in_store_qr' | 'promo_code' | 'whatsapp_order';
  code: string; // Código alfanumérico único para redención en caja
  
  // Límites y Anti-fraude
  maxRedemptionsPerUser: number;
  totalMaxRedemptions: number | null;
  currentRedemptionsCount: number;
  securityHash: string; // Firma para validación de autenticidad en servidor
}

/**
 * 3. Registro Privado y Persistente de Comercios (Etapa 1)
 * Almacenado fuera de /public para garantizar confidencialidad absoluta frente a consultas del cliente.
 */
export interface PrivateBusinessRegistration {
  businessId: string;
  businessName: string;
  representative: {
    name: string;
    phone: string;
    email: string;
  };
  submittedAt: string; // ISO 8601
  status: 'pending_binding' | 'pending_approval' | 'verified' | 'rejected' | 'revoked';
  associatedUid: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  emailNotification: {
    sent: boolean;
    sentAt: string | null;
    service: string;
    resendId?: string;
    warning?: string;
    error?: string;
  };
}

// ============================================================================
// ESQUEMA SQL OFICIAL PARA CLOUDFLARE D1 (SQLITE SERVERLESS)
// ============================================================================
export const D1_SCHEMA_SQL = `
-- 1. Tabla: Registros privados y confidenciales de representantes
CREATE TABLE IF NOT EXISTS representative_registrations (
  business_id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  representative_name TEXT NOT NULL,
  representative_phone TEXT NOT NULL,
  representative_email TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending_binding', 'pending_approval', 'verified', 'rejected', 'revoked')),
  associated_uid TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  email_sent INTEGER DEFAULT 0,
  email_id TEXT,
  email_warning TEXT,
  email_error TEXT
);

-- 2. Tabla: Vinculaciones y autorizaciones verificadas por Firebase Auth UID
CREATE TABLE IF NOT EXISTS business_authorizations (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  business_name TEXT NOT NULL,
  uid TEXT NOT NULL,
  email TEXT NOT NULL,
  email_verified INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('pending_binding', 'pending_approval', 'verified', 'rejected', 'revoked')),
  requested_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by_admin_uid TEXT,
  reviewed_by_admin_email TEXT,
  rejection_reason TEXT,
  revoked_at TEXT,
  revocation_reason TEXT,
  permissions TEXT NOT NULL,
  metadata TEXT
);

-- Índice único para garantizar unicidad por par (comercio, representante)
CREATE UNIQUE INDEX IF NOT EXISTS idx_authorizations_biz_uid
ON business_authorizations(business_id, uid);

-- 3. Tabla: Catálogo técnico de cupones por comercio
CREATE TABLE IF NOT EXISTS business_coupons (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  business_name TEXT NOT NULL,
  city_id TEXT NOT NULL,
  created_by_uid TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  terms_and_conditions TEXT NOT NULL,
  start_date TEXT NOT NULL,
  expiration_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft', 'pending_review', 'active', 'paused', 'expired', 'revoked')),
  redemption_type TEXT NOT NULL CHECK(redemption_type IN ('in_store_qr', 'promo_code', 'whatsapp_order')),
  code TEXT NOT NULL UNIQUE,
  max_redemptions_per_user INTEGER DEFAULT 1,
  total_max_redemptions INTEGER,
  current_redemptions_count INTEGER DEFAULT 0,
  security_hash TEXT NOT NULL
);

-- 4. Tabla: Registro de canjes auditados
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  redeemed_at TEXT NOT NULL,
  redeemed_by_user_id TEXT,
  redemption_method TEXT NOT NULL,
  cashier_uid TEXT,
  FOREIGN KEY (coupon_id) REFERENCES business_coupons(id)
);
`;

/**
 * Comprueba si la base de datos Cloudflare D1 está configurada con sus 3 credenciales obligatorias.
 */
export function isD1StorageConfigured(): boolean {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  return Boolean(accountId && databaseId && apiToken);
}

// Helper: Ejecución de consultas en Cloudflare D1 vía Cloudflare Client v4 REST API
export async function executeD1Query(sql: string, params: any[] = []): Promise<any[] | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  // Si no están configuradas las 3 credenciales de Cloudflare D1, retornar null (activar compuerta de seguridad)
  if (!isD1StorageConfigured()) {
    return null;
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, params })
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Cloudflare D1] Error en consulta HTTP:', res.status, errorText);
    throw new Error(`Cloudflare D1 HTTP Error: ${res.status}`);
  }

  const data: any = await res.json().catch(() => ({}));
  if (!data.success || !data.result?.[0]?.success) {
    console.error('[Cloudflare D1] Error devuelto por D1:', data.errors);
    throw new Error('Cloudflare D1 falló al ejecutar la consulta SQL.');
  }

  return data.result[0].results || [];
}

// Helper: lectura segura de registros privados en fallback local
async function getPrivateRegistrations(): Promise<PrivateBusinessRegistration[]> {
  try {
    if (!fs.existsSync(dataDir)) {
      await fsPromises.mkdir(dataDir, { recursive: true });
    }
    if (!fs.existsSync(privateRegistrationsFile)) {
      await fsPromises.writeFile(privateRegistrationsFile, '[]', 'utf-8');
      return [];
    }
    const raw = await fsPromises.readFile(privateRegistrationsFile, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Storage] Error al leer archivo de registros privados:', err);
    return [];
  }
}

// Repositorio Principal: Guardado persistente con idempotencia y protección de estados
export async function savePrivateRegistration(
  reg: PrivateBusinessRegistration
): Promise<{ storageEngine: 'cloudflare_d1' | 'local_fs' }> {
  // 1. Cuando D1 esté configurado, guardar mediante executeD1Query
  if (isD1StorageConfigured()) {
    const d1Sql = `
      INSERT INTO representative_registrations (
        business_id, business_name, representative_name, representative_phone, representative_email,
        submitted_at, status, associated_uid, reviewed_by, reviewed_at, email_sent, email_id, email_warning, email_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(business_id) DO UPDATE SET
        business_name = excluded.business_name,
        representative_name = excluded.representative_name,
        representative_phone = excluded.representative_phone,
        representative_email = excluded.representative_email,
        email_sent = excluded.email_sent,
        email_id = excluded.email_id,
        email_warning = excluded.email_warning,
        email_error = excluded.email_error,
        status = CASE 
          WHEN representative_registrations.status IN ('verified', 'revoked', 'pending_approval', 'rejected') 
          THEN representative_registrations.status 
          ELSE excluded.status 
        END;
    `;

    const d1Params = [
      reg.businessId,
      reg.businessName,
      reg.representative.name,
      reg.representative.phone,
      reg.representative.email,
      reg.submittedAt,
      reg.status,
      reg.associatedUid,
      reg.reviewedBy,
      reg.reviewedAt,
      reg.emailNotification.sent ? 1 : 0,
      reg.emailNotification.resendId || null,
      reg.emailNotification.warning || null,
      reg.emailNotification.error || null
    ];

    // Si D1 falla, executeD1Query arroja un error y este SE PROPAGA directamente sin fallback
    const d1Result = await executeD1Query(d1Sql, d1Params);
    if (d1Result !== null) {
      console.log(`[Cloudflare D1] Registro privado persistido en D1 para comercio: ${reg.businessId}`);
      return { storageEngine: 'cloudflare_d1' };
    }
  }

  // 2. Si D1 no está configurado en producción (NODE_ENV !== 'test'), NO guardar en JSON ni memoria
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('PERSISTENT_STORAGE_NOT_CONFIGURED');
  }

  // 3. Almacenamiento JSON mantenido EXCLUSIVAMENTE para desarrollo local y pruebas controladas (NODE_ENV === 'test'):
  if (!fs.existsSync(dataDir)) {
    await fsPromises.mkdir(dataDir, { recursive: true });
  }
  const current = await getPrivateRegistrations();
  const existingIdx = current.findIndex(r => r.businessId === reg.businessId);

  if (existingIdx !== -1) {
    const existing = current[existingIdx];
    // Protección estricta contra restablecimiento de autorizaciones:
    // Un nuevo envío o reintento de registro NO puede degradar un estado verificado, revocado o en aprobación
    const isProtectedStatus = existing.status === 'verified' || existing.status === 'revoked' || existing.status === 'pending_approval' || existing.status === 'rejected';
    const finalStatus = isProtectedStatus ? existing.status : (reg.status || 'pending_binding');

    current[existingIdx] = {
      ...existing,
      ...reg,
      submittedAt: existing.submittedAt || reg.submittedAt,
      status: finalStatus,
      associatedUid: existing.associatedUid || reg.associatedUid,
      reviewedBy: existing.reviewedBy || reg.reviewedBy,
      reviewedAt: existing.reviewedAt || reg.reviewedAt
    };
  } else {
    current.push(reg);
  }

  await fsPromises.writeFile(privateRegistrationsFile, JSON.stringify(current, null, 2), 'utf-8');
  return { storageEngine: 'local_fs' };
}

// ============================================================================
// ARQUITECTURA DE AUTORIZACIÓN Y MÁQUINA DE ESTADOS (ETAPA 3)
// ============================================================================

export type BindingStatus = 'pending_binding' | 'pending_approval' | 'verified' | 'rejected' | 'revoked';

/**
 * Matriz estricta de transiciones de estado permitidas en el servidor.
 * Protege contra aprobaciones directas de registros revocados y transiciones arbitrarias.
 */
export const PERMITTED_STATUS_TRANSITIONS: Record<BindingStatus, BindingStatus[]> = {
  'pending_binding': ['pending_approval', 'verified', 'rejected'],
  'pending_approval': ['verified', 'rejected'],
  'verified': ['revoked'],
  'rejected': ['pending_approval'], // Una solicitud rechazada puede reiniciarse como pending_approval
  'revoked': ['pending_approval']   // Una autorización revocada requiere una nueva solicitud antes de poder ser evaluada
};

export function isValidStatusTransition(currentStatus: BindingStatus, nextStatus: BindingStatus): boolean {
  const allowed = PERMITTED_STATUS_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
}

export interface BusinessBindingInfo {
  id: string;
  name: string;
  representativeEmail: string;
  representativeName?: string;
  representativePhone?: string;
}

// Almacén seguro en memoria para pruebas automáticas y validaciones de esquema (sin contaminar producción)
export const inMemoryAuthorizationsStore = new Map<string, BusinessRepresentativeAuthorization>();
export const testMockBusinessesStore = new Map<string, BusinessBindingInfo>();

/**
 * Busca un comercio para verificar su existencia y recuperar el correo de su representante legal (H-02).
 * - Si Cloudflare D1 está configurado, consulta directamente la tabla representative_registrations.
 *   Si D1 devuelve un error, se propaga para evitar fallbacks silenciosos.
 * - Si D1 no está configurado, solo permite resolver comercios en desarrollo local o entorno de pruebas.
 */
export async function findBusinessForBinding(businessId: string): Promise<BusinessBindingInfo | null> {
  const cleanId = (businessId || '').trim();
  if (!cleanId) return null;

  // 1. Si Cloudflare D1 está configurado, consultar exclusivamente la persistencia real
  if (isD1StorageConfigured()) {
    try {
      const sql = `
        SELECT business_id, business_name, representative_email, representative_name, representative_phone
        FROM representative_registrations
        WHERE business_id = ?
        LIMIT 1
      `;
      const rows = await executeD1Query(sql, [cleanId]);
      if (rows && rows.length > 0) {
        const row = rows[0];
        return {
          id: row.business_id,
          name: row.business_name,
          representativeEmail: String(row.representative_email || '').trim().toLowerCase(),
          representativeName: row.representative_name,
          representativePhone: row.representative_phone
        };
      }
      return null;
    } catch (err: any) {
      console.error('[Cloudflare D1] Error al consultar registro de comercio:', err.message);
      // No hacer fallback silencioso a JSON ni Firestore en producción
      throw new Error(`D1_QUERY_ERROR: ${err.message}`);
    }
  }

  // 2. Si D1 no está configurado en producción (NODE_ENV !== 'test'), lanzar PERSISTENT_STORAGE_NOT_CONFIGURED
  // Bloquear categóricamente lecturas de archivos JSON o memoria como alternativa en producción
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('PERSISTENT_STORAGE_NOT_CONFIGURED');
  }

  // 3. Entorno de pruebas automáticas controladas (exclusivamente NODE_ENV === 'test')
  if (testMockBusinessesStore.has(cleanId)) {
    return testMockBusinessesStore.get(cleanId)!;
  }
  if (cleanId.startsWith('biz_test') || cleanId.startsWith('biz_')) {
    return {
      id: cleanId,
      name: `Comercio Validado ${cleanId}`,
      representativeEmail: 'representante@negocio.com'
    };
  }

  // 4. Fallback local seguro únicamente para desarrollo y pruebas controladas (NODE_ENV === 'test')
  const registrations = await getPrivateRegistrations();
  const found = registrations.find(r => r.businessId === cleanId);
  if (found) {
    return {
      id: found.businessId,
      name: found.businessName,
      representativeEmail: String(found.representative?.email || '').trim().toLowerCase(),
      representativeName: found.representative?.name,
      representativePhone: found.representative?.phone
    };
  }

  return null;
}

/**
 * Obtiene un registro de autorización por su identificador único (auth_${businessId}_${uid}).
 */
export async function getAuthorizationById(id: string): Promise<BusinessRepresentativeAuthorization | null> {
  if (process.env.NODE_ENV === 'test') {
    return inMemoryAuthorizationsStore.get(id) || null;
  }

  if (isD1StorageConfigured()) {
    try {
      const rows = await executeD1Query(
        'SELECT * FROM business_authorizations WHERE id = ? LIMIT 1',
        [id]
      );
      if (rows && rows.length > 0) {
        const row = rows[0];
        return {
          id: row.id,
          businessId: row.business_id,
          businessName: row.business_name,
          uid: row.uid,
          email: row.email,
          emailVerified: Boolean(row.email_verified),
          status: row.status as BindingStatus,
          requestedAt: row.requested_at,
          reviewedAt: row.reviewed_at || null,
          reviewedByAdminUid: row.reviewed_by_admin_uid || null,
          reviewedByAdminEmail: row.reviewed_by_admin_email || null,
          rejectionReason: row.rejection_reason || null,
          revokedAt: row.revoked_at || null,
          revocationReason: row.revocation_reason || null,
          permissions: JSON.parse(row.permissions || '[]'),
          verificationMetadata: JSON.parse(row.metadata || '{}')
        };
      }
    } catch (err: any) {
      console.error('[Cloudflare D1] Error al consultar autorización por ID:', err.message);
      throw new Error(`D1_QUERY_ERROR: ${err.message}`);
    }
  }

  return null;
}

/**
 * Consulta todas las autorizaciones, con filtro opcional por estado.
 */
export async function getAllAuthorizations(statusFilter?: BindingStatus): Promise<BusinessRepresentativeAuthorization[]> {
  if (process.env.NODE_ENV === 'test') {
    const list = Array.from(inMemoryAuthorizationsStore.values());
    if (statusFilter) {
      return list.filter(a => a.status === statusFilter);
    }
    return list;
  }

  if (isD1StorageConfigured()) {
    try {
      let sql = 'SELECT * FROM business_authorizations ORDER BY requested_at DESC';
      const params: any[] = [];
      if (statusFilter) {
        sql = 'SELECT * FROM business_authorizations WHERE status = ? ORDER BY requested_at DESC';
        params.push(statusFilter);
      }
      const rows = await executeD1Query(sql, params);
      if (rows) {
        return rows.map((row: any) => ({
          id: row.id,
          businessId: row.business_id,
          businessName: row.business_name,
          uid: row.uid,
          email: row.email,
          emailVerified: Boolean(row.email_verified),
          status: row.status as BindingStatus,
          requestedAt: row.requested_at,
          reviewedAt: row.reviewed_at || null,
          reviewedByAdminUid: row.reviewed_by_admin_uid || null,
          reviewedByAdminEmail: row.reviewed_by_admin_email || null,
          rejectionReason: row.rejection_reason || null,
          revokedAt: row.revoked_at || null,
          revocationReason: row.revocation_reason || null,
          permissions: JSON.parse(row.permissions || '[]'),
          verificationMetadata: JSON.parse(row.metadata || '{}')
        }));
      }
    } catch (err: any) {
      console.error('[Cloudflare D1] Error al consultar autorizaciones:', err.message);
      throw new Error(`D1_QUERY_ERROR: ${err.message}`);
    }
  }

  return [];
}

/**
 * Guarda o actualiza un registro de autorización.
 * Si Cloudflare D1 no está configurado y no estamos en entorno de prueba, arroja un error controlado
 * para impedir escrituras en almacenamiento efímero de producción.
 */
export async function saveAuthorization(
  authRecord: BusinessRepresentativeAuthorization
): Promise<{ success: boolean; storageEngine: 'cloudflare_d1' | 'in_memory_test' }> {
  if (process.env.NODE_ENV === 'test') {
    const existing = inMemoryAuthorizationsStore.get(authRecord.id);
    if (existing && existing.status === 'verified' && authRecord.status === 'pending_approval') {
      // Proteger contra degradación de estado o pérdida de permisos en autorizaciones previamente verificadas
      return { success: true, storageEngine: 'in_memory_test' };
    }
    inMemoryAuthorizationsStore.set(authRecord.id, authRecord);
    return { success: true, storageEngine: 'in_memory_test' };
  }

  if (!isD1StorageConfigured()) {
    throw new Error('PERSISTENT_STORAGE_NOT_CONFIGURED');
  }

  const sql = `
    INSERT INTO business_authorizations (
      id, business_id, business_name, uid, email, email_verified, status,
      requested_at, reviewed_at, reviewed_by_admin_uid, reviewed_by_admin_email,
      rejection_reason, revoked_at, revocation_reason, permissions, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      business_name = excluded.business_name,
      status = CASE
        WHEN business_authorizations.status = 'verified' AND excluded.status = 'pending_approval'
        THEN business_authorizations.status
        ELSE excluded.status
      END,
      permissions = CASE
        WHEN business_authorizations.status = 'verified' AND excluded.status = 'pending_approval'
        THEN business_authorizations.permissions
        ELSE excluded.permissions
      END,
      reviewed_at = excluded.reviewed_at,
      reviewed_by_admin_uid = excluded.reviewed_by_admin_uid,
      reviewed_by_admin_email = excluded.reviewed_by_admin_email,
      rejection_reason = excluded.rejection_reason,
      revoked_at = excluded.revoked_at,
      revocation_reason = excluded.revocation_reason,
      metadata = excluded.metadata;
  `;

  const params = [
    authRecord.id,
    authRecord.businessId,
    authRecord.businessName,
    authRecord.uid,
    authRecord.email,
    authRecord.emailVerified ? 1 : 0,
    authRecord.status,
    authRecord.requestedAt,
    authRecord.reviewedAt,
    authRecord.reviewedByAdminUid,
    authRecord.reviewedByAdminEmail,
    authRecord.rejectionReason || null,
    authRecord.revokedAt,
    authRecord.revocationReason,
    JSON.stringify(authRecord.permissions),
    JSON.stringify(authRecord.verificationMetadata)
  ];

  await executeD1Query(sql, params);
  return { success: true, storageEngine: 'cloudflare_d1' };
}

/**
 * Función de verificación de autorización para futuras operaciones protegidas (ej. creación de cupones).
 * Comprueba que el usuario tenga un registro verificado vigente ('verified') con los permisos requeridos.
 */
export async function verifyRepresentativeAuthorization(
  businessId: string,
  uid: string,
  requiredPermission: 'coupons:create' | 'coupons:edit' | 'coupons:view_metrics' | 'coupons:redeem' = 'coupons:create'
): Promise<{ authorized: boolean; reason?: string; binding?: BusinessRepresentativeAuthorization }> {
  const authId = `auth_${businessId}_${uid}`;
  const record = await getAuthorizationById(authId);

  if (!record) {
    return { authorized: false, reason: 'NO_BINDING_FOUND' };
  }

  if (record.status !== 'verified') {
    return { authorized: false, reason: `STATUS_${record.status.toUpperCase()}`, binding: record };
  }

  if (!record.permissions.includes(requiredPermission)) {
    return { authorized: false, reason: 'PERMISSION_DENIED', binding: record };
  }

  return { authorized: true, binding: record };
}

// ============================================================================
// ENDPOINT SEGURO DE REGISTRO COMERCIAL (ETAPA 1: ALMACENAMIENTO PERSISTENTE + RESEND)
// ============================================================================
app.post('/api/business/register', async (req, res) => {
  try {
    const { business, representative } = req.body || {};

    if (!business || !business.name || !business.id) {
      return res.status(400).json({ ok: false, error: 'Datos comerciales incompletos.' });
    }

    if (!representative || !representative.name || !representative.phone || !representative.email) {
      return res.status(400).json({ ok: false, error: 'Datos del representante incompletos.' });
    }

    // 1. Envío opcional vía Resend API si está configurada la credencial
    const resendApiKey = process.env.RESEND_API_KEY;
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'josueco2023@gmail.com';
    let emailSent = false;
    let emailId: string | undefined;
    let emailWarning: string | undefined;
    let emailError: string | undefined;

    if (!resendApiKey) {
      console.warn('[Resend] RESEND_API_KEY no configurada. Notificación en espera de credencial.');
      emailWarning = 'RESEND_API_KEY_NOT_CONFIGURED';
    } else {
      try {
        const emailSubject = `[7D App] Nuevo Registro Comercial: ${business.name}`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e1b4b; line-height: 1.5;">
            <div style="background: #4f46e5; color: white; padding: 18px 24px; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0; font-size: 20px;">Nueva Solicitud de Registro Comercial</h2>
              <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9;">7D App - Directorio Comercial</p>
            </div>

            <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 8px 8px; background: #ffffff;">
              <h3 style="color: #4f46e5; margin-top: 0; border-bottom: 2px solid #eef2ff; padding-bottom: 8px;">1. Datos Comerciales (Públicos)</h3>
              <ul style="list-style: none; padding: 0; margin: 0 0 20px 0;">
                <li style="padding: 6px 0;"><strong>ID Comercio:</strong> <code>${business.id}</code></li>
                <li style="padding: 6px 0;"><strong>Nombre Comercial:</strong> ${business.name}</li>
                <li style="padding: 6px 0;"><strong>Categoría:</strong> ${business.categoryName || business.categoryId || 'No especificada'}</li>
                <li style="padding: 6px 0;"><strong>Ciudad:</strong> ${business.cityName || business.cityId || 'No especificada'}</li>
                <li style="padding: 6px 0;"><strong>Tipo:</strong> ${business.businessType === 'virtual' ? 'Comercio Virtual' : 'Local Físico'}</li>
                ${business.address ? `<li style="padding: 6px 0;"><strong>Dirección:</strong> ${business.address}</li>` : ''}
                <li style="padding: 6px 0;"><strong>WhatsApp Comercial:</strong> ${business.whatsapp || 'No especificado'}</li>
                ${business.instagram ? `<li style="padding: 6px 0;"><strong>Instagram:</strong> ${business.instagram}</li>` : ''}
                ${business.tiktok ? `<li style="padding: 6px 0;"><strong>TikTok:</strong> ${business.tiktok}</li>` : ''}
                <li style="padding: 6px 0;"><strong>Estado en Firestore:</strong> <span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-weight: bold;">pending_approval</span></li>
                ${business.logoUrl ? `<li style="padding: 6px 0;"><strong>Logotipo (R2):</strong> <a href="${business.logoUrl}" target="_blank">Ver Imagen</a></li>` : ''}
                ${business.coverUrl ? `<li style="padding: 6px 0;"><strong>Portada (R2):</strong> <a href="${business.coverUrl}" target="_blank">Ver Imagen</a></li>` : ''}
              </ul>

              <h3 style="color: #b91c1c; margin-top: 20px; border-bottom: 2px solid #fee2e2; padding-bottom: 8px;">2. Datos Privados del Representante Legal (CONFIDENCIAL)</h3>
              <p style="font-size: 12px; color: #64748b; margin-top: -4px;">Estos datos se almacenan de forma segura y privada en el servidor backend para verificación de identidad y cupones.</p>
              <ul style="list-style: none; padding: 0; margin: 0 0 20px 0; background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 4px;">
                <li style="padding: 6px 0;"><strong>Nombre Completo:</strong> ${representative.name}</li>
                <li style="padding: 6px 0;"><strong>Teléfono / WhatsApp Personal:</strong> <a href="tel:${representative.phone}">${representative.phone}</a></li>
                <li style="padding: 6px 0;"><strong>Correo Electrónico Personal:</strong> <a href="mailto:${representative.email}">${representative.email}</a></li>
              </ul>

              <div style="font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 12px; text-align: center;">
                Fecha del registro: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })} (Hora de Venezuela)
              </div>
            </div>
          </div>
        `;

        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: '7D App <onboarding@resend.dev>',
            to: [adminEmail],
            subject: emailSubject,
            html: emailHtml
          })
        });

        const resendData = await resendResponse.json().catch(() => ({}));
        if (resendResponse.ok) {
          emailSent = true;
          emailId = resendData.id;
          console.log('[Resend] Correo enviado exitosamente con ID:', emailId);
        } else {
          emailError = resendData.message || 'Error en el servicio de correo Resend';
          console.error('[Resend] Error al enviar correo:', resendData);
        }
      } catch (mailErr: any) {
        emailError = mailErr.message || 'Error de red con Resend';
        console.error('[Resend] Excepción al procesar correo:', mailErr);
      }
    }

    // 2. Almacenamiento seguro, estructurado y persistente en el servidor
    const privateRecord: PrivateBusinessRegistration = {
      businessId: String(business.id).trim(),
      businessName: String(business.name).trim(),
      representative: {
        name: String(representative.name).trim(),
        phone: String(representative.phone).trim(),
        email: String(representative.email).trim()
      },
      submittedAt: new Date().toISOString(),
      status: 'pending_binding',
      associatedUid: null,
      reviewedBy: null,
      reviewedAt: null,
      emailNotification: {
        sent: emailSent,
        sentAt: emailSent ? new Date().toISOString() : null,
        service: 'resend',
        resendId: emailId,
        warning: emailWarning,
        error: emailError
      }
    };

    let storageResult: { storageEngine: string } | null = null;
    let storageError: string | null = null;
    try {
      storageResult = await savePrivateRegistration(privateRecord);
      console.log(`[Seguridad] Registro privado almacenado persistentemente para el comercio: ${business.id} (Engine: ${storageResult.storageEngine})`);
    } catch (saveErr: any) {
      console.warn('[Seguridad] Almacenamiento privado no disponible:', saveErr.message);
      storageError = saveErr.message || 'Error al persistir registro';
    }

    // Conservar las notificaciones de Resend cuando sea técnicamente posible,
    // sin afirmar que el registro privado quedó guardado si no ocurrió (Objetivo 1, requisito 5).
    if (storageError) {
      const isMissingD1 = storageError === 'PERSISTENT_STORAGE_NOT_CONFIGURED';
      return res.status(isMissingD1 ? 503 : 500).json({
        ok: false,
        stored: false,
        code: isMissingD1 ? 'PERSISTENT_STORAGE_NOT_CONFIGURED' : 'STORAGE_ERROR',
        businessId: business.id,
        emailSent,
        emailId,
        warning: isMissingD1 ? 'PERSISTENT_STORAGE_NOT_CONFIGURED' : emailWarning,
        message: isMissingD1
          ? 'Notificación del representante enviada, pero el almacenamiento privado persistente (Cloudflare D1) no está configurado en el servidor. Los datos no se almacenaron en almacenamiento efímero.'
          : 'Error al persistir el registro privado en la base de datos.'
      });
    }

    return res.json({
      ok: true,
      stored: true,
      storageEngine: storageResult!.storageEngine,
      businessId: business.id,
      emailSent,
      emailId,
      warning: emailWarning,
      message: 'Registro comercial y datos privados almacenados de forma segura en el servidor.'
    });

  } catch (err: any) {
    console.error('[API /api/business/register] Error interno:', err);
    return res.status(500).json({
      ok: false,
      emailSent: false,
      error: err.message || 'Error interno del servidor al procesar el registro.'
    });
  }
});

// ============================================================================
// FIREBASE ADMIN SDK & SEGURIDAD DE AUTENTICACIÓN BACKEND (ETAPA 2)
// ============================================================================
export const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'dapp-f5e40';

let firebaseAdminApp: FirebaseAdminApp | null = null;
let firebaseAuth: FirebaseAuth | null = null;

/**
 * Inicialización segura del SDK Firebase Admin.
 * - Modo 1 (Credencial Completa): Si FIREBASE_SERVICE_ACCOUNT_KEY está configurada,
 *   se valida mediante clave de servicio privada con capacidad de verificar revocación.
 * - Modo 2 (Verificación Pública Criptográfica): Si no hay clave de servicio,
 *   se inicializa con el projectId ('dapp-f5e40') y valida los ID tokens usando
 *   los certificados x509 públicos oficiales de Google.
 */
export function getFirebaseAuth(): FirebaseAuth {
  if (firebaseAuth) return firebaseAuth;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseAdminApp = existingApps[0];
  } else {
    const serviceAccountKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKeyEnv) {
      try {
        let creds: any;
        const trimmed = serviceAccountKeyEnv.trim();
        if (trimmed.startsWith('{')) {
          creds = JSON.parse(trimmed);
        } else if (fs.existsSync(trimmed)) {
          creds = JSON.parse(fs.readFileSync(trimmed, 'utf-8'));
        } else {
          // Intentar decodificar como Base64
          const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
          creds = JSON.parse(decoded);
        }
        firebaseAdminApp = initializeApp({
          credential: cert(creds),
          projectId: FIREBASE_PROJECT_ID
        });
        console.log('[Firebase Admin] Inicializado con Service Account Key privada (soporte completo de revocación).');
      } catch (keyErr: any) {
        console.warn('[Firebase Admin] No se pudo parsear FIREBASE_SERVICE_ACCOUNT_KEY, aplicando modo público x509:', keyErr.message);
        firebaseAdminApp = initializeApp({ projectId: FIREBASE_PROJECT_ID });
      }
    } else {
      firebaseAdminApp = initializeApp({ projectId: FIREBASE_PROJECT_ID });
      console.log(`[Firebase Admin] Inicializado en modo de verificación pública x509 para el proyecto: ${FIREBASE_PROJECT_ID}`);
    }
  }

  firebaseAuth = getAuth(firebaseAdminApp);
  return firebaseAuth;
}

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
  claims: Record<string, any>;
  decodedToken: DecodedIdToken;
}

export interface AuthenticatedRequest extends express.Request {
  user?: AuthenticatedUser;
}

const DEFAULT_ADMIN_EMAILS = ['josueco2023@gmail.com', 'josueco@gmail.com'];

/**
 * Obtiene la lista blanca de correos autorizados como administradores desde variables de entorno.
 */
export function getAuthorizedAdminEmails(): string[] {
  const envEmails = [
    process.env.ADMIN_AUTHORIZED_EMAILS || '',
    process.env.ADMIN_NOTIFICATION_EMAIL || ''
  ].join(',');

  const parsed = envEmails
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  const set = new Set([...parsed, ...DEFAULT_ADMIN_EMAILS]);
  return Array.from(set);
}

/**
 * Comprueba privilegios de administración del servidor:
 * 1. Custom Claims en el token de Firebase Auth (admin === true o role === 'admin')
 * 2. Correo verificado por Google Auth perteneciente a la lista blanca del servidor
 */
export function checkIsAdminUser(decodedToken: DecodedIdToken): boolean {
  if (decodedToken.admin === true || decodedToken.role === 'admin') {
    return true;
  }

  const userEmail = (decodedToken.email || '').toLowerCase().trim();
  const isEmailVerified = decodedToken.email_verified === true;

  if (userEmail && isEmailVerified) {
    const authorized = getAuthorizedAdminEmails();
    if (authorized.includes(userEmail)) {
      return true;
    }
  }

  return false;
}

/**
 * Middleware: requireAuth
 * Valida criptográficamente el ID Token de Firebase Authentication en el encabezado Authorization.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  const authHeader = (req.headers.authorization || '').trim();
  if (!authHeader) {
    res.status(401).json({
      ok: false,
      code: 'AUTH_REQUIRED',
      error: 'Acceso no autorizado: Se requiere el encabezado Authorization: Bearer <ID_TOKEN>.'
    });
    return;
  }

  if (!authHeader.toLowerCase().startsWith('bearer')) {
    res.status(401).json({
      ok: false,
      code: 'AUTH_INVALID_SCHEME',
      error: 'Acceso no autorizado: El esquema de autenticación debe ser Bearer.'
    });
    return;
  }

  const token = authHeader.replace(/^bearer\s*/i, '').trim();
  if (!token) {
    res.status(401).json({
      ok: false,
      code: 'AUTH_INVALID_HEADER',
      error: 'Acceso no autorizado: Token no proporcionado en el encabezado Authorization.'
    });
    return;
  }

  try {
    const auth = getFirebaseAuth();
    const hasServiceAccount = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    // Solo se exige checkRevoked si disponemos de credenciales de servicio completas
    const decodedToken = await auth.verifyIdToken(token, hasServiceAccount);

    // Validación rigurosa de proyecto y emisor
    const expectedIss = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
    if (decodedToken.aud !== FIREBASE_PROJECT_ID || (decodedToken.iss && decodedToken.iss !== expectedIss)) {
      res.status(401).json({
        ok: false,
        code: 'AUTH_PROJECT_MISMATCH',
        error: 'Acceso denegado: El token no pertenece al proyecto autorizado de 7DApp.'
      });
      return;
    }

    const isAdmin = checkIsAdminUser(decodedToken);

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      emailVerified: Boolean(decodedToken.email_verified),
      isAdmin,
      claims: decodedToken,
      decodedToken
    };

    next();
  } catch (error: any) {
    const errCode = error?.code || 'AUTH_TOKEN_ERROR';
    let message = 'Acceso no autorizado: Token inválido o no reconocido.';

    if (errCode === 'auth/id-token-expired') {
      message = 'Acceso no autorizado: El token de sesión ha expirado.';
    } else if (errCode === 'auth/id-token-revoked') {
      message = 'Acceso no autorizado: El token ha sido revocado.';
    } else if (errCode === 'auth/argument-error' || errCode === 'auth/invalid-id-token') {
      message = 'Acceso no autorizado: Formato de token inválido.';
    }

    res.status(401).json({
      ok: false,
      code: errCode,
      error: message
    });
  }
}

/**
 * Middleware: requireAdmin
 * Garantiza que la solicitud provenga de un administrador autenticado y verificado por el servidor.
 */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      ok: false,
      code: 'AUTH_REQUIRED',
      error: 'Acceso no autorizado: Se requiere autenticación previa.'
    });
    return;
  }

  if (!req.user.isAdmin) {
    res.status(403).json({
      ok: false,
      code: 'FORBIDDEN_ADMIN_ONLY',
      error: 'Acceso denegado: Se requieren privilegios administrativos en el servidor para realizar esta acción.'
    });
    return;
  }

  next();
}

// ============================================================================
// ENDPOINTS PREPARATORIOS DE AUTENTICACIÓN Y AUTORIZACIÓN (ETAPA 2)
// (Sin activación operativa de creación o canje de cupones para usuarios finales)
// ============================================================================

/**
 * GET /api/auth/me
 * Valida el ID Token del usuario y devuelve su identidad criptográfica verificada por Firebase
 */
app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: express.Response) => {
  const user = req.user!;
  res.json({
    ok: true,
    user: {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      isAdmin: user.isAdmin
    }
  });
});

/**
 * GET /api/admin/verify
 * Verifica si el usuario autenticado tiene autorización administrativa en el servidor
 */
app.get('/api/admin/verify', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: express.Response) => {
  const user = req.user!;
  res.json({
    ok: true,
    admin: true,
    message: 'Usuario autenticado y autorizado con privilegios de administrador en el servidor.',
    user: {
      uid: user.uid,
      email: user.email
    }
  });
});

// ============================================================================
// ENDPOINTS DE VINCULACIÓN COMERCIAL Y GESTIÓN ADMINISTRATIVA (ETAPA 3)
// ============================================================================

/**
 * POST /api/business/binding/request
 * Permite a un representante autenticado con Google solicitar vinculación con un comercio.
 * - Verifica identidad criptográfica mediante requireAuth
 * - Valida existencia del comercio en el servidor
 * - Sanitiza campos: el cliente no puede asignarse estado ni permisos
 * - Aplica compuerta de persistencia: detiene escrituras si Cloudflare D1 no está configurado
 */
app.post('/api/business/binding/request', requireAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const user = req.user!;
    const { businessId, contactPhone, notes } = req.body || {};

    if (!businessId || typeof businessId !== 'string' || !businessId.trim()) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_BUSINESS_ID',
        error: 'Debe especificar un identificador de comercio válido.'
      });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        ok: false,
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Su cuenta de Google debe tener un correo electrónico verificado para solicitar la representación de un comercio.'
      });
    }

    // 1. Compuerta estricta de persistencia privada (H-02)
    // Si D1 no está configurado, conserva la compuerta de seguridad en producción y responde 503 sin guardar solicitudes
    if (!isD1StorageConfigured() && process.env.NODE_ENV !== 'test') {
      return res.status(503).json({
        ok: false,
        code: 'PERSISTENT_STORAGE_NOT_CONFIGURED',
        error: 'El almacenamiento persistente privado (Cloudflare D1) no está configurado en el servidor. Por razones de seguridad e integridad técnica, no se permite almacenar solicitudes de autorización en almacenamiento efímero ni en Firestore.',
        missingConfig: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN']
      });
    }

    const cleanBizId = businessId.trim();

    // 2. Verificación de existencia del comercio y recuperación del registro privado (H-02)
    let business: BusinessBindingInfo | null = null;
    try {
      business = await findBusinessForBinding(cleanBizId);
    } catch (err: any) {
      console.error('[API /api/business/binding/request] Error al buscar comercio en almacenamiento:', err.message);
      if (err.message === 'PERSISTENT_STORAGE_NOT_CONFIGURED') {
        return res.status(503).json({
          ok: false,
          code: 'PERSISTENT_STORAGE_NOT_CONFIGURED',
          error: 'El almacenamiento persistente privado (Cloudflare D1) no está configurado en el servidor. No se pueden procesar vinculaciones sin la base de datos segura.',
          missingConfig: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN']
        });
      }
      return res.status(500).json({
        ok: false,
        code: 'STORAGE_QUERY_ERROR',
        error: 'Error interno al consultar el registro privado del comercio.'
      });
    }

    if (!business) {
      return res.status(404).json({
        ok: false,
        code: 'BUSINESS_NOT_FOUND',
        error: 'El comercio indicado no existe o no cuenta con registro previo en el sistema.'
      });
    }

    // 3. Validación estricta de identidad del representante (H-01)
    // Se compara el correo autenticado de Google con el correo privado del representante registrado originalmente
    const authEmail = (user.email || '').trim().toLowerCase();
    const registeredEmail = (business.representativeEmail || '').trim().toLowerCase();

    if (!authEmail || !registeredEmail || authEmail !== registeredEmail) {
      return res.status(403).json({
        ok: false,
        code: 'IDENTITY_MISMATCH',
        error: 'El correo electrónico de la cuenta autenticada no coincide con el correo del representante registrado para este comercio. La vinculación requiere revisión.'
      });
    }

    const authId = `auth_${cleanBizId}_${user.uid}`;
    const existing = await getAuthorizationById(authId);

    // 4. Control de solicitudes duplicadas o activas
    if (existing) {
      if (existing.status === 'verified') {
        return res.status(409).json({
          ok: false,
          code: 'ALREADY_VERIFIED',
          error: 'Usted ya cuenta con una autorización activa y verificada para este comercio.'
        });
      }
      if (existing.status === 'pending_approval' || existing.status === 'pending_binding') {
        return res.status(409).json({
          ok: false,
          code: 'REQUEST_ALREADY_PENDING',
          error: 'Ya existe una solicitud de vinculación en proceso de revisión administrativa para este comercio.'
        });
      }
    }

    // 5. Construcción sanitizada de la solicitud (inmunidad contra manipulación del cliente)
    // No se concede acceso automático por coincidencia de correo; el estado es siempre pending_approval
    const newRecord: BusinessRepresentativeAuthorization = {
      id: authId,
      businessId: business.id,
      businessName: business.name,
      uid: user.uid,
      email: user.email || '',
      emailVerified: user.emailVerified,
      status: 'pending_approval',
      requestedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedByAdminUid: null,
      reviewedByAdminEmail: null,
      rejectionReason: null,
      revokedAt: null,
      revocationReason: null,
      permissions: [],
      verificationMetadata: {
        contactPhone: String(contactPhone || '').trim(),
        legalRepresentativeName: String(user.decodedToken.name || '').trim(),
        registrationSource: 'manual_claim',
        notes: String(notes || '').trim()
      }
    };

    await saveAuthorization(newRecord);

    return res.status(201).json({
      ok: true,
      message: 'Solicitud de vinculación recibida exitosamente. Se encuentra pendiente de revisión administrativa.',
      binding: {
        id: newRecord.id,
        businessId: newRecord.businessId,
        businessName: newRecord.businessName,
        status: newRecord.status,
        requestedAt: newRecord.requestedAt
      }
    });

  } catch (err: any) {
    console.error('[API /api/business/binding/request] Error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error interno al procesar la solicitud de vinculación.'
    });
  }
});

/**
 * GET /api/admin/bindings
 * Consulta el listado de vinculaciones para revisión administrativa.
 * Protegido por requireAuth y requireAdmin.
 */
app.get('/api/admin/bindings', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    if (!isD1StorageConfigured() && process.env.NODE_ENV !== 'test') {
      return res.status(503).json({
        ok: false,
        code: 'PERSISTENT_STORAGE_NOT_CONFIGURED',
        error: 'Cloudflare D1 no está configurado. La consulta de autorizaciones persistentes requiere la base de datos D1 conectada.',
        missingConfig: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN']
      });
    }

    const statusFilter = req.query.status as BindingStatus | undefined;
    const list = await getAllAuthorizations(statusFilter);

    // Retorna datos de auditoría seguros sin filtrar secretos o datos innecesarios
    const sanitized = list.map(b => ({
      id: b.id,
      businessId: b.businessId,
      businessName: b.businessName,
      uid: b.uid,
      email: b.email,
      emailVerified: b.emailVerified,
      status: b.status,
      requestedAt: b.requestedAt,
      reviewedAt: b.reviewedAt,
      reviewedByAdminEmail: b.reviewedByAdminEmail,
      rejectionReason: b.rejectionReason,
      revokedAt: b.revokedAt,
      revocationReason: b.revocationReason,
      permissions: b.permissions,
      verificationMetadata: b.verificationMetadata
    }));

    return res.json({
      ok: true,
      count: sanitized.length,
      bindings: sanitized
    });
  } catch (err: any) {
    console.error('[API /api/admin/bindings] Error:', err);
    return res.status(500).json({ ok: false, error: 'Error al consultar vinculaciones.' });
  }
});

/**
 * POST /api/admin/bindings/:id/approve
 * Aprobación de una vinculación comercial por parte de un administrador.
 * Requisitos estrictos:
 * - Anti-auto-aprobación: un representante no puede aprobar su propia vinculación
 * - Transición de estado validada en servidor (pending_approval -> verified)
 * - Registro de auditoría (UID, email del admin y timestamp)
 * - Asignación de permisos controlada exclusivamente por el servidor
 */
app.post('/api/admin/bindings/:id/approve', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const admin = req.user!;
    const bindingId = req.params.id;

    const binding = await getAuthorizationById(bindingId);
    if (!binding) {
      return res.status(404).json({
        ok: false,
        code: 'BINDING_NOT_FOUND',
        error: 'La solicitud de vinculación comercial no existe.'
      });
    }

    // 1. Anti-auto-aprobación
    if (binding.uid === admin.uid) {
      return res.status(403).json({
        ok: false,
        code: 'FORBIDDEN_SELF_APPROVAL',
        error: 'Un representante no puede aprobar su propia solicitud de representación comercial.'
      });
    }

    // 2. Validación de transición en la máquina de estados
    if (!isValidStatusTransition(binding.status, 'verified')) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_TRANSITION',
        error: `Transición de estado inválida: no se puede aprobar una vinculación en estado '${binding.status}'.`
      });
    }

    // 3. Compuerta de persistencia privada
    if (!isD1StorageConfigured() && process.env.NODE_ENV !== 'test') {
      return res.status(503).json({
        ok: false,
        code: 'PERSISTENT_STORAGE_NOT_CONFIGURED',
        error: 'Cloudflare D1 no está configurado. No se pueden persistir aprobaciones sin la base de datos segura.',
        missingConfig: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN']
      });
    }

    // 4. Actualización controlada por el servidor
    const updatedRecord: BusinessRepresentativeAuthorization = {
      ...binding,
      status: 'verified',
      reviewedAt: new Date().toISOString(),
      reviewedByAdminUid: admin.uid,
      reviewedByAdminEmail: admin.email || 'admin@7dapp.com',
      revokedAt: null,
      revocationReason: null,
      permissions: ['coupons:create', 'coupons:edit', 'coupons:view_metrics', 'coupons:redeem']
    };

    await saveAuthorization(updatedRecord);

    return res.json({
      ok: true,
      message: 'Vinculación comercial aprobada exitosamente.',
      binding: {
        id: updatedRecord.id,
        businessId: updatedRecord.businessId,
        businessName: updatedRecord.businessName,
        status: updatedRecord.status,
        reviewedAt: updatedRecord.reviewedAt,
        reviewedByAdminEmail: updatedRecord.reviewedByAdminEmail,
        permissions: updatedRecord.permissions
      }
    });

  } catch (err: any) {
    console.error('[API /api/admin/bindings/:id/approve] Error:', err);
    return res.status(500).json({ ok: false, error: 'Error al aprobar la vinculación comercial.' });
  }
});

/**
 * POST /api/admin/bindings/:id/reject
 * Rechazo administrativo de una solicitud de vinculación comercial (H-03).
 * Requisitos:
 * - Exige requireAuth y requireAdmin
 * - Solo admite estados pendientes (pending_approval o pending_binding)
 * - Exige justificación no vacía (5 a 500 caracteres)
 * - Registra rejectionReason, reviewedAt, reviewedByAdminUid, reviewedByAdminEmail
 * - Mantiene permisos vacíos (permissions: [])
 * - Impide rechazar vinculaciones activas ('verified') o revocadas ('revoked')
 * - Mantiene compuerta de persistencia D1
 */
app.post('/api/admin/bindings/:id/reject', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const admin = req.user!;
    const bindingId = req.params.id;
    const { reason } = req.body || {};

    const cleanReason = typeof reason === 'string' ? reason.trim() : '';
    if (!cleanReason || cleanReason.length < 5 || cleanReason.length > 500) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_REJECTION_REASON',
        error: 'Debe proporcionar una justificación válida para el rechazo (entre 5 y 500 caracteres).'
      });
    }

    const binding = await getAuthorizationById(bindingId);
    if (!binding) {
      return res.status(404).json({
        ok: false,
        code: 'BINDING_NOT_FOUND',
        error: 'La solicitud de vinculación comercial no existe.'
      });
    }

    // 1. Validación de transición en la máquina de estados
    // Solo vinculaciones en estado pendiente (pending_approval o pending_binding) pueden pasar a 'rejected'
    if (!isValidStatusTransition(binding.status, 'rejected')) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_TRANSITION',
        error: `Transición de estado inválida: no se puede rechazar una vinculación en estado '${binding.status}'. Solo solicitudes pendientes pueden ser rechazadas.`
      });
    }

    // 2. Compuerta de persistencia privada
    if (!isD1StorageConfigured() && process.env.NODE_ENV !== 'test') {
      return res.status(503).json({
        ok: false,
        code: 'PERSISTENT_STORAGE_NOT_CONFIGURED',
        error: 'Cloudflare D1 no está configurado. No se pueden persistir decisiones administrativas sin la base de datos segura.',
        missingConfig: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN']
      });
    }

    // 3. Actualización controlada por el servidor
    const updatedRecord: BusinessRepresentativeAuthorization = {
      ...binding,
      status: 'rejected',
      reviewedAt: new Date().toISOString(),
      reviewedByAdminUid: admin.uid,
      reviewedByAdminEmail: admin.email || 'admin@7dapp.com',
      rejectionReason: cleanReason,
      permissions: [] // Sin permisos
    };

    await saveAuthorization(updatedRecord);

    return res.json({
      ok: true,
      message: 'Solicitud de vinculación comercial rechazada exitosamente.',
      binding: {
        id: updatedRecord.id,
        businessId: updatedRecord.businessId,
        businessName: updatedRecord.businessName,
        status: updatedRecord.status,
        reviewedAt: updatedRecord.reviewedAt,
        reviewedByAdminEmail: updatedRecord.reviewedByAdminEmail,
        rejectionReason: updatedRecord.rejectionReason,
        permissions: []
      }
    });

  } catch (err: any) {
    console.error('[API /api/admin/bindings/:id/reject] Error:', err);
    return res.status(500).json({ ok: false, error: 'Error al rechazar la vinculación comercial.' });
  }
});

/**
 * POST /api/admin/bindings/:id/revoke
 * Revocación de una autorización comercial por parte de un administrador.
 * Requisitos estrictos:
 * - Transición de estado validada (verified -> revoked)
 * - Registro de causa/justificación y fecha
 * - Retirada inmediata de todos los permisos operativos
 */
app.post('/api/admin/bindings/:id/revoke', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const admin = req.user!;
    const bindingId = req.params.id;
    const { reason } = req.body || {};

    const binding = await getAuthorizationById(bindingId);
    if (!binding) {
      return res.status(404).json({
        ok: false,
        code: 'BINDING_NOT_FOUND',
        error: 'La autorización comercial no existe.'
      });
    }

    // 1. Validación de transición en la máquina de estados
    if (!isValidStatusTransition(binding.status, 'revoked')) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_TRANSITION',
        error: `Transición de estado inválida: no se puede revocar una vinculación en estado '${binding.status}'. Solo autorizaciones verificadas ('verified') pueden ser revocadas.`
      });
    }

    // 2. Compuerta de persistencia privada
    if (!isD1StorageConfigured() && process.env.NODE_ENV !== 'test') {
      return res.status(503).json({
        ok: false,
        code: 'PERSISTENT_STORAGE_NOT_CONFIGURED',
        error: 'Cloudflare D1 no está configurado. No se pueden persistir revocaciones sin la base de datos segura.',
        missingConfig: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN']
      });
    }

    // 3. Actualización controlada por el servidor
    const updatedRecord: BusinessRepresentativeAuthorization = {
      ...binding,
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      revocationReason: String(reason || 'Revocación por decisión administrativa').trim(),
      reviewedByAdminUid: admin.uid,
      reviewedByAdminEmail: admin.email || 'admin@7dapp.com',
      permissions: []
    };

    await saveAuthorization(updatedRecord);

    return res.json({
      ok: true,
      message: 'Autorización comercial revocada exitosamente.',
      binding: {
        id: updatedRecord.id,
        businessId: updatedRecord.businessId,
        status: updatedRecord.status,
        revokedAt: updatedRecord.revokedAt,
        revocationReason: updatedRecord.revocationReason
      }
    });

  } catch (err: any) {
    console.error('[API /api/admin/bindings/:id/revoke] Error:', err);
    return res.status(500).json({ ok: false, error: 'Error al revocar la autorización comercial.' });
  }
});

// Servir archivos estáticos de la PWA original desde public/
app.use(express.static(publicDir));

// Ruta fallback a index.html para navegación SPA / PWA
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`7D App PWA escuchando en http://0.0.0.0:${PORT}`);
  });
}
