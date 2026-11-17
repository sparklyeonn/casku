# Logos oficiales de Casku

Los seis SVG entregados por Casku están disponibles en `public/brand/`. Se conservaron los trazados y colores originales; únicamente se ajustó el `viewBox` para quitar los márgenes vacíos, con un pequeño espacio de protección.

| Archivo recibido | Recurso del sistema | Variante |
| --- | --- | --- |
| casku 2026 SVG-37.svg | casku-wordmark-calipso.svg | Nombre Casku 3D, calipso |
| casku 2026 SVG-38.svg | casku-wordmark-azul.svg | Nombre Casku 3D, azul |
| casku 2026 SVG-23.svg | casku-sello-calipso.svg | Sello completo, calipso |
| casku 2026 SVG-16.svg | casku-sello-azul.svg | Sello completo, azul |
| casku 2026 SVG-22.svg | casku-simbolo-calipso.svg | Símbolo sin texto, calipso |
| casku 2026 SVG-15.svg | casku-simbolo-azul.svg | Símbolo sin texto, azul |

Los colores propios de los archivos son azul `#144772`, calipso `#00899A` y, en los símbolos y sellos, marfil `#F4F3F2`. No se aplican filtros ni cambios de color al logo.

## Uso en las pantallas

`CaskuBrand` muestra el nombre azul en modo claro y calipso cuando el dispositivo prefiere modo oscuro. Una superficie marfil `#FFFEF8` permite conservar la legibilidad del arte original en ambos casos. La selección se realiza con `picture`, sin depender de JavaScript. El enlace conserva su nombre accesible y la imagen incluye texto alternativo.

El componente se comparte entre inicio, acceso, inscripción, familias, recepción, kinesiología, administración, privacidad y cambio inicial de contraseña. El cambio inicial mantiene sus restricciones de acceso y navegación.

## Iconos

El símbolo calipso se utiliza en `src/app/icon.svg`, `src/app/favicon.ico` y `src/app/apple-icon.png`. El último tiene 180 × 180 píxeles y fondo marfil para accesos directos de Apple. Las versiones de mapa de bits se derivaron del SVG, manteniendo sus proporciones.

Los logos y los iconos se sirven desde el propio sistema. Esta integración no modifica permisos, datos clínicos ni la configuración de envío de correos.
