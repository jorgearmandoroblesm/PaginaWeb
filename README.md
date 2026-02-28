# Logística — Municipalidad Distrital Veintisiete de Noviembre

Panel web para consultar y exportar órdenes importadas desde Excel (hoja **REPORTE**).

## Funciones
- Sidebar colapsable
- Filtros: EXP SIAF, TIPO DE ORDEN, N° ORDEN, FECHA (rango), RAZÓN SOCIAL / RUC, ESTADO, búsqueda general
- Formateo:
  - **SIAF** → `00000`
  - **N° ORDEN** → `000` o `000.0` (si viene con punto)
- Concepto tomado de **CONCEPTO DETALLADO** (solo se muestra en el **detalle**, no en el listado)
- **Total** desde la columna **PRECIO X ORDEN**
- Razón Social muestra **RUC debajo**
- Oficina muestra **Solicitante arriba** y **Oficina abajo**
- Abrir/Descargar redirige al link del Excel (columna **SCRIPT**)
- Exportar filtrado a Excel
- Vista detalle al hacer click en una fila
- SQLite persistente (WAL)

## Requisitos
- Node.js 18+ (recomendado 20+)

## Ejecutar en tu PC / servidor
```bash
cd server
cp .env.example .env
npm.cmd install
npm.cmd run dev
```

Abrir:
- Inicio: `http://localhost:3000`
- Admin: `http://localhost:3000/admin.html`
- Órdenes: `http://localhost:3000/ordenes.html`

## Importar Excel (SIN subir archivos)
1) Copia tu Excel `.xlsx` o `.xlsm` a:
`server/inbox/`
2) Entra a **Admin**, escribe tu `ADMIN_KEY`, actualiza lista y presiona **Importar**.

> Importante: si cambiaste el Excel (nuevas columnas), vuelve a importar para refrescar la base.

## Ver desde otra PC (misma red)
- Asegúrate de ejecutar el servidor en una PC que esté encendida.
- Abre el puerto `3000` en el firewall de Windows/Linux.
- En otra PC, entra con la IP del servidor:
`http://IP_DEL_SERVIDOR:3000`

## Publicar en Internet (como SUNAT)
Opción recomendada (pro):
1) Contrata un VPS (Ubuntu) + dominio
2) Instala Node.js, configura firewall
3) Levanta con **PM2** y pon **Nginx** como proxy (HTTPS con Let’s Encrypt)

Notas:
- Este proyecto ya escucha en `0.0.0.0` (acepta conexiones externas).
- Cambia `ADMIN_KEY` por una clave larga (mín. 24 chars).
- Si publicas a internet, usa HTTPS sí o sí.

## Logo
Coloca tu logo aquí:
`/web/assets/logo.png`

Recomendación:
- PNG/SVG
- 512×512 o menos
- ideal < 300KB
