import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, 'public');

// Middleware para procesar cuerpos JSON
app.use(express.json());

// Endpoint seguro del servidor para notificación automática vía Resend API
app.post('/api/business/register', async (req, res) => {
  try {
    const { business, representative } = req.body || {};

    if (!business || !business.name || !business.id) {
      return res.status(400).json({ ok: false, error: 'Datos comerciales incompletos.' });
    }

    if (!representative || !representative.name || !representative.phone || !representative.email) {
      return res.status(400).json({ ok: false, error: 'Datos del representante incompletos.' });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'josueco2023@gmail.com';

    if (!resendApiKey) {
      console.warn('[Resend] RESEND_API_KEY no configurada. Notificación en espera de credencial.');
      return res.json({
        ok: true,
        emailSent: false,
        warning: 'RESEND_API_KEY_NOT_CONFIGURED',
        message: 'Registro recibido en el servidor. El envío de correo está pendiente de configuración de la clave Resend.'
      });
    }

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
          <p style="font-size: 12px; color: #64748b; margin-top: -4px;">Estos datos NO están guardados en la base de datos pública de Firestore.</p>
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

    if (!resendResponse.ok) {
      console.error('[Resend] Error al enviar correo:', resendData);
      return res.status(502).json({
        ok: false,
        emailSent: false,
        error: resendData.message || 'Error en el servicio de correo Resend'
      });
    }

    console.log('[Resend] Correo enviado exitosamente con ID:', resendData.id);
    return res.json({
      ok: true,
      emailSent: true,
      emailId: resendData.id,
      message: 'Notificación de representante enviada exitosamente.'
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

// Servir archivos estáticos de la PWA original desde public/
app.use(express.static(publicDir));

// Ruta fallback a index.html para navegación SPA / PWA
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`7D App PWA escuchando en http://0.0.0.0:${PORT}`);
});
