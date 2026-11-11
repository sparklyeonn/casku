# Ampliación de craneometría y seguimiento: análisis

Recibido el 11 de noviembre de 2026. Especificación para incorporar al orden de trabajo existente; no representa fórmulas, rangos ni envíos ya implementados. El siguiente trabajo prioritario sigue siendo consentimiento, trazabilidad y privacidad.

## Fuentes y estado actual

Requisitos indicados por la responsable del proyecto y las dos páginas de `INDICES CRANEOMETRIAS.pdf`, revisadas visualmente. El PDF contiene las tablas propias de Casku y sus referencias bibliográficas; este análisis las transcribe como propuesta de protocolo del equipo, no como una validación clínica independiente. Archivo recibido: `/Users/constanzagonzalezlizama/Downloads/INDICES CRANEOMETRIAS.pdf`.

Actualmente se capturan AP, BP y dos diagonales. `src/lib/craneometria.ts` calcula índice craneal y diferencia absoluta de diagonales, con rangos anteriores. `src/lib/results/snapshot.ts` publica una copia de esas cuatro medidas. El envío clínico tiene una sola orden por publicación, intento al publicar y recuperación manual; no hay tres etapas ni un programador automático.

La migración de este alcance debe conservar las evaluaciones y publicaciones anteriores. No se rellenan perímetro o desviaciones inexistentes con cero ni se reinterpretan automáticamente con las tablas nuevas. Tampoco se envía una campaña retroactiva por aplicar una migración.

## Siete medidas de entrada

Todas se registran en milímetros, permitiendo la precisión que confirme el equipo:

| Campo | Significado indicado |
| --- | --- |
| AP | Distancia anteroposterior |
| BP | Distancia biparietal |
| Perímetro | Perímetro craneal |
| Diagonal frontal izquierda-occipital derecha | Distancia entre esos puntos |
| Diagonal frontal derecha-occipital izquierda | Distancia entre esos puntos |
| Occipital derecha | Desviación derecha en mm, provisionalmente; referencia inicial: punto rojo posterior al trago derecho |
| Occipital izquierda | Desviación izquierda en mm, provisionalmente; referencia inicial: punto rojo posterior al trago izquierdo |

Las diagonales deben tener etiquetas completas, no solo izquierda/derecha, y un esquema validado por el equipo para evitar invertirlas. También hace falta identificar el punto rojo posterior en el protocolo de medición: el PDF de tablas no aporta ese esquema. El perímetro queda como medida registrada; no se agrega a las fórmulas de CI o CVA ni se interpreta con una curva de crecimiento no solicitada.

## Indicadores separados y protocolo versionado

- Índice cefálico/craneal (CI o IC), compartido por braquicefalia y dolicocefalia: `BP / AP * 100`.
- CVA, en mm: diferencia absoluta entre ambas diagonales. Corresponde al cálculo que hoy se almacena bajo el nombre `indiceAsimetria`, pero sus categorías actuales no coinciden con las nuevas.
- CVAI, en porcentaje: falta confirmar con Casku el denominador. Hay formulaciones que usan la diagonal menor y otras la mayor; no se elegirá silenciosamente una. Ver el estudio sobre esta diferencia: https://pmc.ncbi.nlm.nih.gov/articles/PMC10205121/ .
- DPOE, en mm: por indicación posterior de la responsable, tratar provisionalmente ambos valores occipitales como desviaciones y calcular `max(desviacionDerecha, desviacionIzquierda)`. Esta interpretación está autorizada para preparar el desarrollo, pero sigue pendiente de confirmación clínica; no se presenta como un protocolo ya validado. No sustituir por una resta ni interpretar estos valores como distancias anatómicas completas sin esa confirmación.

Guardar medidas originales, indicadores, categoría de cada indicador, protocolo y revisión de cálculo. La clasificación por índice cefálico se mantiene separada de la clasificación de plagiocefalia, incluyendo la normalidad explícita. Para una clasificación conjunta de plagiocefalia falta definir si manda un indicador, una combinación o la decisión de la profesional; no asumir que manda el mayor grado. La recomendación que se comunica a la familia debe ser la revisada y publicada por la profesional.

### Tabla del PDF: plagiocefalia

Transcripción literal de intervalos; NO constituye todavía intervalos completos y mutuamente excluyentes para código.

| Categoría | CVA (mm) | CVAI (%) | DPOE (mm) |
| --- | --- | --- | --- |
| Normal | < 3 | < 1,5 | 0-5 |
| Leve | 3-6 | 1,5-3,5 | 5-10 |
| Moderada | 7-12 | 3,6-6,0 | 10-15 |
| Severa | 13-18 | 6,1-8,0 | 15-20 |
| Muy severa | > 18 | > 8 | > 20 |

Se requiere una regla explícita para valores como CVA 6,5 o 12,5; CVAI 3,55 o 6,05; y DPOE exactamente 5, 10 o 15. No redondear primero para hacerlos entrar en una categoría sin aprobación. El valor calculado se debe conservar con su precisión; el redondeo de presentación es distinto de la regla de clasificación.

### Tabla del PDF: índice cefálico

| Condición | Categoría | CI (%) |
| --- | --- | --- |
| Dolicocefalia | Muy severa | < 62 |
| Dolicocefalia | Severa | 62-66 |
| Dolicocefalia | Moderada | 67-71 |
| Dolicocefalia | Leve | 72-75 |
| Normal | Normal | 76-83 |
| Braquicefalia | Leve | 84-87 |
| Braquicefalia | Moderada | 88-92 |
| Braquicefalia | Severa | 93-97 |
| Braquicefalia | Muy severa | > 97 |

También falta resolver los decimales entre los intervalos impresos, por ejemplo 75,5; 83,5; 87,5 o 92,5. Los rangos nuevos cambian resultados: un CI 84 hoy se etiqueta normal y en la tabla se ubica en braquicefalia leve; un CVA 12 hoy se etiqueta severo y en la tabla figura moderado. Esto exige validar los límites y guardar la versión de protocolo, no modificar solo los textos de pantalla.

## Tres correos clínicos por evaluación

| Etapa | Momento solicitado, desde la evaluación | Contenido |
| --- | --- | --- |
| Inicial | El día de atención | Resultado publicado y recomendación revisada |
| Seguimiento semanal | Una semana después | Resultados y recordatorio adaptado a las indicaciones publicadas |
| Seguimiento mensual | Un mes después | Resultados y cierre de seguimiento, con otro mensaje/formato |

Regla aclarada por la responsable: los tres correos deben enviarse si existe plagiocefalia alterada **o** braquicefalia/dolicocefalia alterada. Una plagiocefalia normal no excluye el seguimiento cuando el índice cefálico indica otra alteración. Se excluyen por normalidad los casos con ambas clasificaciones explícitamente normales, sin perjuicio de los controles de publicación, vinculación y autorización correspondientes.

La clasificación normal debe ser explícita, no inferida por ausencia de un texto en `diagnostico`. Un indicador incompleto, no calculable o pendiente de revisión no equivale a normal. La política de destinatarios ya está aclarada; la fórmula CVAI, los límites y la combinación de indicadores siguen pendientes de confirmación clínica antes de automatizar su clasificación.

La exclusión se aplica a estos correos clínicos, no a los códigos de acceso, comprobantes de inscripción, QR ni avisos de cupo. Los resultados normales siguen disponibles en la cuenta familiar tras publicarse.

Los recordatorios reutilizan la recomendación publicada y las plantillas aprobadas por Casku. No añaden una indicación de casco por su cuenta. El PDF plantea evaluar su uso en ciertas categorías; el sistema no debe convertir eso en una prescripción automática. Tampoco debe afirmar que el bebé no acudió a consulta si no hay ese dato registrado.

### Fechas y decisiones pendientes

- Propuesta: D+7 significa siete días calendario desde la evaluación, en `America/Santiago`. D+1 mes significa mes calendario, no treinta días; si el mes no tiene ese día, usar su último día. Falta confirmar calendario, hora y comportamiento ante fin de mes.
- El primer envío solo puede ocurrir el día de atención si la profesional publica y la familia queda vinculada ese día. No enviar borradores para cumplir un horario.
- Si la publicación o vinculación ocurre tarde, definir qué etapas se envían, se omiten o se reprograman. No enviar las tres juntas por estar vencidas. Nunca fingir una fecha de envío pasada.
- Propuesta de privacidad: autorización y preferencia de seguimiento explícitas, con la versión del texto, fecha y actor. Poder detener recordatorios futuros. Definir qué comunicación se considera entrega del resultado y cuál seguimiento opcional, con responsable de Casku; no presentar esta propuesta como una determinación legal.

### Diseño técnico previsto

Una orden durable por evaluación/publicación y etapa, con fecha programada, destinatario verificado, versión de publicación y plantilla, estado, intentos e identificador del proveedor. La clave única debe impedir crear dos veces la misma etapa de la misma versión. Los reintentos mantienen contenido, destinatario y clave de idempotencia; una corrección clínica necesita una nueva versión y una política de reemplazo, no reutilizar el mensaje antiguo con contenido distinto.

Un proceso programado debe reclamar atómicamente órdenes vencidas, con bloqueo temporal, recuperación ante interrupciones, reintentos espaciados y límites por lote. No depender de que alguien visite una página. El proveedor puede aceptar un mensaje sin haberlo entregado: añadir webhooks verificados para entregas, rebotes y quejas. No prometer entrega exactamente una vez más allá de la garantía de idempotencia que conserve el proveedor.

Antes de cada intento se comprueba: publicación vigente, destinatario y vinculación actuales, cuenta activa, clasificación elegible y autorización/preferencia correspondiente. Ante cambios no se usa el destinatario anterior. No se publica ni se envía contenido clínico a partir de conocer solo correo o RUT.

El pendiente de corrección/retiro de resultados debe invalidar las órdenes futuras de una versión retirada o reemplazada y definir si corresponde un nuevo aviso. Registrar los motivos de omisión o cancelación, además de pendientes, en proceso, aceptados por el proveedor y fallidos. Recepción y administración no deben obtener diagnósticos por consultar el estado operativo del seguimiento.

## Integración con el orden acordado

1. Seguridad del equipo: sigue completada; no se reabre por este alcance.
2. Consentimiento, trazabilidad y privacidad: siguiente tarea. Incorporar autorización/preferencias para este seguimiento y su auditoría; definir permisos sobre medidas y resultados.
3. Compilación y pruebas técnicas: antes de cerrar este punto, incorporar el incremento de las siete medidas y el protocolo clínico ya confirmado, manteniendo compatibilidad con históricos y publicaciones. Probar cálculos en servidor, límites, datos inválidos y formularios antiguos, además de compilar producción.
4. Correos y fallos: integrar aquí las tres etapas, programación, plantillas revisadas, exclusión confirmada, idempotencia, reintentos y webhooks. El remitente y las pruebas de envío real siguen pendientes por separado.
5. Corrección/retiro de resultados: conectar nuevas versiones y retiros con cancelación/reemplazo de envíos futuros e historial.
6. Recuperación/cambio inicial de contraseña: conserva su lugar y alcance.
7. Pruebas integrales: añadir escenarios de indicadores discordantes, exclusión normal/casos mixtos, fechas y cambios de mes, publicación/vinculación tardías, revocación del seguimiento, correcciones, envíos simultáneos y recuperación de fallos.

## Estado de las decisiones antes de activar los cálculos y envíos

1. Confirmación clínica de la interpretación provisional de los valores occipitales como desviaciones y de DPOE como su máximo, además de la referencia anatómica del punto rojo.
2. Fórmula exacta de CVAI y protocolo de toma de las diagonales.
3. Intervalos continuos, inclusiones de fronteras y precisión aprobados para las dos tablas.
4. Regla de clasificación conjunta si CVA, CVAI y DPOE discrepan.
5. Caso mixto resuelto: se envían los tres correos si hay braquicefalia o dolicocefalia alterada, aunque la plagiocefalia sea normal. No requiere una nueva confirmación de la responsable.
6. Hora, significado de un mes y política ante publicación o vinculación fuera de fecha.
7. Plantillas y recomendaciones aprobadas, autorización de seguimiento y permisos de cada perfil.

En este análisis solo se documenta el alcance. No se modifica el motor clínico, no se aplican migraciones y no se programan ni envían mensajes.
