# Craneometría: base de revisión con Casku

Fuente: INDICES CRANEOMETRIAS.pdf, dos páginas entregadas por Casku. Versión de referencia: `casku-pdf-borrador-v1`. No constituye un protocolo clínico confirmado.

## Actualización: seis medidas y autorización presencial

Por solicitud de Casku se retiró el perímetro de los formularios nuevos. No se borra el valor si ya pertenece a una evaluación o versión histórica. La columna de medidas complementarias existente admite las dos desviaciones sin perímetro; este cambio no requiere otra migración.

Los indicadores aparecen de forma independiente: CI con anterior posterior y biparietal, CVA con ambas diagonales y DPOE con ambas desviaciones (cero es un valor válido). No se espera a completar toda la ficha para mostrar los resultados disponibles. Se requieren las seis medidas válidas al guardar una ficha nueva. CVAI y las decisiones clínicas pendientes permanecen sin activar.

En la evaluación sin inscripción, el apoderado presente acepta mediante una única casilla. No se pide nuevamente nombre ni referencia documental. El servidor reutiliza el declarante previamente registrado de ese bebé cuando existe; si no hay nombre, deja constancia explícita de que no estaba registrado, sin inventar identidad ni vincular cuentas por coincidencia de correo. El evento de consentimiento registra fecha, profesional, texto vigente y canal `CASILLA_PRESENCIAL`, sin afirmar que hubo un documento físico y sin habilitar correos. El flujo de autorización documental de recepción se conserva separado.

Las secciones siguientes documentan la base original de siete medidas y su migración; el perímetro allí descrito corresponde al formato anterior.

## Registro

Siete mediciones en mm: anterior posterior, biparietal, perímetro, diagonal izquierda frontal a derecha occipital, diagonal derecha frontal a izquierda occipital, desviación del punto rojo posterior (POE) al trago derecho y al izquierdo. Las cinco dimensiones deben ser positivas; las desviaciones admiten cero. Estas últimas se interpretan como desviaciones, no como distancias anatómicas completas, según la definición provisional acordada.

CI = biparietal / anterior posterior × 100, compartido por braquicefalia y dolicocefalia. CVA = diferencia absoluta de diagonales. DPOE = mayor de las dos desviaciones; 5 y 8 producen 8 mm. Perímetro queda registrado, sin utilizarlo en esos índices. CVAI no se calcula hasta confirmar su denominador. No se determina una severidad global combinando estos indicadores.

## Rangos de referencia del PDF

| Categoría | CVA (mm) | CVAI (%) — pendiente de fórmula | DPOE (mm) |
|---|---|---|---|
| Normal | <3 | <1,5 | 0–5 |
| Leve | 3–6 | 1,5–3,5 | 5–10 |
| Moderada | 7–12 | 3,6–6,0 | 10–15 |
| Severa | 13–18 | 6,1–8,0 | 15–20 |
| Muy severa | >18 | >8 | >20 |

| Categoría | CI braquicefalia (%) | CI dolicocefalia (%) |
|---|---|---|
| Leve | 84–87 | 72–75 |
| Moderada | 88–92 | 67–71 |
| Severa | 93–97 | 62–66 |
| Muy severa | >97 | <62 |

Proporción normal: CI 76–83 %. Los intervalos se trasladan literalmente. Un CI de 83,5 o un CVA de 6,5 queda «por confirmar», sin redondeo para clasificar. Los límites DPOE 5, 10 y 15 están en dos filas del PDF: quedan pendientes. DPOE 20 pertenece a severa, pues muy severa es estrictamente >20. Los valores mostrados se formatean a dos decimales; la clasificación usa el valor completo.

## Preguntas pendientes para Casku

1. ¿CVAI = diferencia absoluta de diagonales / diagonal menor ×100, o / diagonal mayor ×100? ¿Qué precisión y redondeo debe aplicarse?
2. ¿Cómo se resuelven huecos decimales entre intervalos de CI, CVA y CVAI? ¿Cuál es la categoría exacta para DPOE 5, 10 y 15?
3. Si CVA, CVAI y DPOE difieren, ¿cuál define la clasificación de plagiocefalia? ¿La mayor, un indicador prioritario o la revisión profesional?
4. Confirmar el procedimiento anatómico para registrar las dos desviaciones desde la protuberancia occipital externa y su unidad. ¿Los números ya son desviaciones?
5. Confirmar los textos clínicos y las indicaciones de seguimiento y tratamiento antes de automatizarlos.

## Persistencia y compatibilidad

Migración aditiva: `20261118000100_mediciones_craneometria`. Agrega una columna JSONB nullable; no rellena ni recalcula evaluaciones existentes. Se validó primero en una base temporal y posteriormente se aplicó, con autorización de la responsable del proyecto, a la base configurada del sistema. En otros entornos debe aplicarse antes de usar el código actualizado.

Las nuevas siete medidas se recalculan en el servidor y se guardan con versión de referencia. Los datos adicionales pasan a borradores, publicaciones, versiones, historial, portal y contenido de correos. No se permite eliminarlos enviando una edición antigua de solo cuatro medidas. Repetir una atención con datos complementarios distintos se rechaza.

Las fichas históricas de cuatro medidas conservan el comportamiento anterior y no reciben medidas inventadas. Pueden completarse mediante edición: al incorporar las tres mediciones adicionales pasan a la referencia nueva, conservando el historial previo. Los envíos clínicos y el protocolo de seguimiento no se activan con este cambio.

## Verificación realizada

Pasaron 72 pruebas unitarias, lint, TypeScript y el recorrido HTTP completo de familias, recepción, evaluación, edición, publicación, versiones, retiro, privacidad y recuperación en una base temporal con proveedor de correo ficticio. Se verificó guardar y editar las siete medidas, conservarlas en la publicación y cada versión, y rechazar una edición que omita datos adicionales ya registrados.

La compilación de producción pasó al repetirla según la indicación de Next.js. Las pruebas visuales de la evaluación pasaron en Chromium y WebKit de escritorio, Pixel 7 emulado, iPad emulado y Chromium de 320 px en modo oscuro, incluyendo DPOE 5/8 = 8, guardado y ausencia de desborde. No equivalen a pruebas en hardware físico.

`npm run check` se intentó dos veces y quedó interrumpido en la prueba de seguridad por el aviso de actualización de seguridad de Next.js 16.4.3. No se modificaron dependencias ni se desactivó esa comprobación. Los recorridos relevantes se ejecutaron por separado, y queda pendiente resolver la actualización y repetir el comando integral.

## Aplicación en la base del sistema

Se comprobó que `20261118000100_mediciones_craneometria` era la única migración pendiente y que las huellas de las migraciones aplicadas coincidían con los archivos locales. Se ejecutó `npm run db:deploy` y se regeneró el cliente Prisma.

La comprobación posterior confirmó la columna JSONB nullable, sin valor predeterminado, y cero migraciones pendientes. Las huellas anteriores y posteriores de las tres evaluaciones existentes coincidieron exactamente, excluyendo únicamente la columna nueva. Sus medidas complementarias permanecen vacías. No se crearon evaluaciones de prueba en esta base ni se enviaron correos.

### Verificación de la actualización a seis medidas

Pasaron 73 pruebas unitarias, lint, TypeScript y el recorrido integral HTTP sobre una base temporal, incluidos el consentimiento presencial con correos desactivados, la reutilización del nombre previamente registrado y la conservación del perímetro histórico al corregir mediante seis medidas. La compilación de producción y los recorridos visuales pasaron en los cinco perfiles de navegador descritos arriba.

La prueba visual comprueba CI visible al ingresar solo anterior posterior y biparietal, DPOE pendiente mientras falte un lado, seis campos sin perímetro, autorización de una sola casilla, bloqueo si no se acepta, guardado y limpieza de la aceptación después de guardar. No se modificó la base real.

Durante la verificación se detectaron excepciones síncronas de consulta al navegar en WebKit. La carga y actualización de kinesiología ahora capturan también esas excepciones y difieren la consulta del efecto hasta después de su ejecución. Se añadió una prueba explícita de fallo síncrono y recuperación, manteniendo la comprobación de ausencia de excepciones de navegador. El aviso de actualización de seguridad de Next.js continúa pendiente; no se actualizaron dependencias en este cambio.
