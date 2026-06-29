# Proposal — whatsapp-media-outbound

## Problema (confirmado en producción)

Jack preguntó "me puedes enviar imágenes?" — el bot dijo que no. Correcto para ahora, pero limita la capacidad de ventas. El bot podría enviar:

- PDF del temario del GH-600
- Imagen con testimonios de alumnos
- Brochure del bootcamp

Actualmente `index.js` solo expone `sendText()`. No hay soporte para media outbound.

## Qué cambia

1. Subir archivos de material de ventas a un storage accesible (URL pública)
2. Agregar `sendImage(to, url, caption)` y `sendDocument(to, url, filename, caption)` en `index.js`
3. Nueva tool de Claude: `send_material(type)` — Claude la llama cuando el prospecto pide el temario, brochure, o testimonios

## Materiales a preparar (prerequisito, no código)

- `temario-gh600.pdf` — temario completo del bootcamp
- `testimonios-gh600.jpg` — imagen con testimonios reales
- Subir a un storage con URL pública (S3, Cloudinary, o simplemente un URL de Notion/Drive)

## Por qué ahora es importante

Jack perdió a su propio prospecto en parte porque el bot no podía mostrar evidencia del bootcamp. "Como me demuestra que el me enseñará eso" — el bot no pudo enviar el temario.

## Fuera de scope

- Audio/video outbound — complejidad alta, bajo valor para ventas
- Recibir y procesar imágenes del usuario — spec separado
