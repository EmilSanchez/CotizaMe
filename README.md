# Cotizador

Sistema de cotizaciones en HTML, CSS y JS, con Firestore como base de datos.

## Estructura

```
Cotizador/
├── index.html
├── css/
│   ├── base.css          Variables, botones, formularios, modal, notificaciones
│   ├── layout.css        Menú lateral y estructura general
│   ├── cotizar.css       Módulo Cotizar
│   ├── historial.css     Módulo Historial
│   ├── config.css        Módulo Configuración
│   └── pdf.css           Diseño de la cotización en PDF
└── js/
    ├── firebase-config.js  << Aquí pegas los datos de tu proyecto Firebase
    ├── utils.js            Formato de pesos, cálculos, imágenes, avisos
    ├── db.js               Lectura y escritura en Firestore (o modo local)
    ├── pdf.js              Plantilla, vista previa y descarga del PDF
    ├── mod-config.js       Módulo Configuración
    ├── mod-cotizar.js      Módulo Cotizar
    ├── mod-historial.js    Módulo Historial
    └── app.js              Arranque y navegación
```

## Cómo se calcula

1. Valor productos antes de IVA = suma de (cantidad × valor unitario)
2. Descuento = porcentaje o valor fijo en pesos
3. Valor con descuento = paso 1 − paso 2
4. Total IVA = paso 3 × IVA % (solo si "Calcular IVA" está activo)
5. Valor total = paso 3 + envío + IVA

El envío no lleva IVA. Cada valor se redondea a pesos enteros para que lo impreso sume exacto.

## Conectar Firestore

1. Entra a https://console.firebase.google.com y crea un proyecto.
2. Menú **Compilación > Firestore Database > Crear base de datos** (ubicación `southamerica-east1` o `us-central1`).
3. **Configuración del proyecto > Tus apps > Web (</>)**, registra la app y copia el objeto `firebaseConfig`.
4. Pega esos valores en `js/firebase-config.js`.
5. En **Firestore > Reglas**, pega esto y publica:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> Estas reglas dejan la base abierta a quien tenga la configuración. Sirven para arrancar;
> cuando agreguemos inicio de sesión se cambian por reglas con autenticación.

Mientras `apiKey` esté vacío, el sistema funciona en **modo local** (guarda en el navegador) para que puedas probarlo.

## Colecciones que crea

| Ruta | Contenido |
|---|---|
| `ajustes/empresa` | Logo, nombre, sub nombre, NIT, contacto, IVA, consecutivo |
| `cotizaciones/{id}` | Cliente, productos, valores, estado, fechas |
| `cotizaciones/{id}/imagenes/{producto}` | Foto de cada producto (comprimida) |

Las fotos van aparte porque Firestore limita cada documento a 1 MB; así una cotización con muchos productos no se bloquea.

## Abrirlo

Doble clic en `index.html`. Necesita internet para cargar Firebase, la fuente Poppins y la librería del PDF.
