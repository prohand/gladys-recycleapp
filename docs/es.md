# RecycleApp para Gladys Assistant

Esta integración lee el calendario de recogida de residuos que
[RecycleApp](https://www.recycleapp.be) (Fost Plus) publica para una dirección
en Bélgica, y lo hace utilizable en Gladys: dispositivos, escenas y un widget
del panel.

Sin cuenta ni clave: la integración consulta la misma API pública que el sitio
recycleapp.be. Solo necesita acceso a Internet (insignia **cloud**).

## Instalación

1. Instale **RecycleApp** desde el catálogo de integraciones de Gladys (Gladys
   5.3.0 o posterior).
2. En **Configuración**, indique:
   - **Código postal**: por ejemplo `5000`;
   - **Calle**: el nombre de la calle en francés, neerlandés o alemán, tal como
     lo escribe RecycleApp (mayúsculas y acentos dan igual);
   - **Número**.
3. Pulse **Probar la conexión**: la respuesta indica la dirección encontrada,
   los tipos de residuos y la próxima recogida.
4. En la pestaña **Descubrimiento**, añada los dispositivos que desee.

¿No encuentra su calle? Use **Buscar mi calle**: escriba parte del nombre (por
ejemplo `fer`), la respuesta lista las calles que RecycleApp conoce en su código
postal. Copie el nombre correcto en el campo **Calle**.

> Algunos municipios (en particular Bruselas-Capital) no publican su calendario
> en RecycleApp. Si **Probar la conexión** no encuentra ninguna recogida,
> compruebe en recycleapp.be que su dirección tiene allí un calendario.

## Ajustes

| Ajuste                                  | Por defecto | Función                                                                                            |
| --------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| Idioma de los tipos de residuos         | Francés     | Idioma de los nombres de los dispositivos, sus estados y las variables de escena (fr, nl, de, en). |
| Hora del aviso (la víspera)             | 19:00       | Hora belga del disparador «Recogida de residuos mañana».                                           |
| Hora del disparador del día de recogida | 07:00       | Hora belga del disparador «Recogida de residuos hoy».                                              |
| Días leídos por adelantado              | 60          | Hasta dónde se lee el calendario (7 a 365 días).                                                   |
| Intervalo de actualización (h)          | 12          | Horas entre dos lecturas de RecycleApp (1 a 48).                                                   |

Las horas se escriben `19:00`, `19h00` o `7:00`.

## Dispositivos

Los nombres de los dispositivos y de los residuos usan el idioma elegido en el
ajuste (francés, neerlandés, alemán o inglés: RecycleApp no ofrece español). En
inglés, por ejemplo:

- **Next waste collection** (resumen):
  - _Days until the collection_: días hasta la recogida, 0 = hoy, 1 = mañana…;
  - _Collection day_: el día, por ejemplo «Friday 23 October»;
  - _Waste collected_: lo que se recoge, por ejemplo «PMD and Paper-cardboard».
- **PMD collection**, **Paper-cardboard collection**… (uno por tipo de residuo):
  - _Days until the collection_;
  - _Collection day_.

Un tipo de residuo sin recogida en el periodo leído (árboles de Navidad en
verano) muestra **-1** y «Ninguna recogida prevista».

Los valores cambian a medianoche (hora belga). Si RecycleApp deja de responder,
se sigue usando el último calendario leído: la insignia cloud pasa a modo
degradado (punto naranja) e indica la fecha de la última lectura.

## Escenas

### Disparadores

| Disparador                          | Cuándo                                                | Variables                    |
| ----------------------------------- | ----------------------------------------------------- | ---------------------------- |
| Recogida de residuos mañana         | La víspera, a la hora del aviso, una vez para el día  | `fractions`, `count`, `date` |
| Un tipo de residuo se recoge mañana | La víspera, a la hora del aviso, para el tipo elegido | `fraction`, `date`           |
| Recogida de residuos hoy            | Por la mañana, a la hora elegida, una vez para el día | `fractions`, `count`, `date` |

Ejemplo: «Recogida de residuos mañana» → enviar un mensaje
`Mañana: {{triggerEvent.data.fractions}}, ¡saque los contenedores!`

Cada disparador se activa una vez al día, incluso tras un reinicio. Si Gladys o
la integración se reinicia después de la hora fijada, el disparador se activa
igualmente, hasta 4 horas después.

### Acciones

- **Obtener la próxima recogida**: para un tipo de residuo (o todos si el campo
  está vacío), devuelve `found`, `days` (-1 si no hay), `date` (AAAA-MM-DD) y
  `fractions`, para las acciones y condiciones siguientes.
- **Volver a leer el calendario**: consulta RecycleApp ahora y devuelve
  `collections`, `next_date` y `next_fractions`.

## Widget del panel

El widget **Recogida de residuos** muestra la próxima recogida, las siguientes
con su logotipo RecycleApp y los días que faltan, la dirección y la fecha de la
última lectura. El botón **Actualizar** vuelve a leer el calendario. Ajuste:
número de recogidas mostradas (1 a 8).

## Solución de problemas

- **«RecycleApp no conoce el código postal»**: compruebe el código postal.
- **«No hay ninguna calle …»** o **«Varias calles coinciden»**: use **Buscar mi
  calle** y copie el nombre exacto.
- **Ninguna recogida**: compruebe el número, o si su municipio publica su
  calendario en RecycleApp.
- **«No se pudo leer RecycleApp»**: RecycleApp o Internet no responde. La
  integración lo reintenta cada 15 minutos y conserva el último calendario.

El calendario leído y los disparadores ya enviados se guardan en `/data`, la
única carpeta en la que el contenedor puede escribir.
