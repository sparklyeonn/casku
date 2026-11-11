// Aceptaciones expresas ficticias de las familias usadas por los recorridos previos.
// Las pruebas específicas de privacidad construyen peticiones sin estas opciones.
export const familyConsent = { privacidad: { version: "2026-11-11.1", datos: true, correoResultados: true, seguimiento: false } }
export const paperConsent = { privacidad: { version: "2026-11-11.1", datos: true, correoResultados: false, seguimiento: false }, declaracion: { documentada: true, declarante: "Apoderado ficticio", referencia: "DOC-FICTICIO-001" } }
