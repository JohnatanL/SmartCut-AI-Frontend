# SmartCut AI — Aplicación frontend

**SmartCut AI** es una aplicación web de demostración y administración para una barbería. Este proyecto corresponde al frontend de la evidencia **GA4-220501096-AA1-EV02 — Aplicación web funcional** del SENA y está diseñado para consumir la API REST desarrollada con FastAPI.

La interfaz permite iniciar sesión, consultar información de la barbería y administrar usuarios, servicios y productos. El proyecto separa la estructura HTML, los estilos CSS y la lógica JavaScript, y emplea clases de JavaScript para organizar las responsabilidades del frontend.

> **Alcance:** la gestión de usuarios, servicios y productos se realiza mediante solicitudes a la API. El simulador de inteligencia artificial y el agendamiento son demostraciones visuales: el backend entregado no incluye endpoints para generar una transformación de imagen con IA ni para guardar citas.

## Tabla de contenido

- [Objetivo](#objetivo)
- [Características principales](#características-principales)
- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Arquitectura del frontend](#arquitectura-del-frontend)
- [Comunicación con la API](#comunicación-con-la-api)
- [Requisitos previos](#requisitos-previos)
- [Configuración y ejecución](#configuración-y-ejecución)
- [Pruebas manuales recomendadas](#pruebas-manuales-recomendadas)
- [Solución de problemas](#solución-de-problemas)
- [Consideraciones de seguridad](#consideraciones-de-seguridad)
- [Limitaciones conocidas](#limitaciones-conocidas)

## Objetivo

Construir una interfaz web separada en HTML, CSS y JavaScript que consuma el backend existente de SmartCut AI. El proyecto demuestra la integración entre frontend, API REST y persistencia de datos, así como el uso de programación orientada a objetos (POO) en el navegador.

## Características principales

### Inicio de sesión y registro

- Formulario de inicio de sesión con correo electrónico y contraseña.
- Registro de una cuenta mediante el endpoint de usuarios.
- Envío del login como `application/x-www-form-urlencoded`, formato utilizado por `OAuth2PasswordRequestForm` de FastAPI.
- Recepción y almacenamiento local del JWT devuelto por la API.
- Verificación de la sesión existente y cierre de sesión.
- Mensajes de error cuando las credenciales no son válidas o no es posible conectar con el backend.

### Panel de resumen

- Presenta un resumen del número de usuarios, servicios y productos consultados desde la API.
- Incluye accesos directos a los módulos de administración.
- Muestra el estado de la conexión y mensajes cuando la consulta no se puede completar.

### Gestión de usuarios

Permite registrar, consultar, buscar, editar y eliminar usuarios mediante las rutas del backend. La contraseña se solicita al crear una cuenta, pero no se muestra en la tabla ni se incluye en la edición normal del perfil.

### Gestión de servicios

Permite administrar el catálogo de servicios de la barbería. La interfaz contempla los campos utilizados por el frontend: nombre, descripción, precio y duración en minutos. El catálogo y la tabla se alimentan con información obtenida de la API.

### Gestión de productos

Permite administrar productos de inventario mediante los campos utilizados por la interfaz: nombre, marca, precio y existencias (`stock`). La estructura exacta de los campos debe coincidir con los esquemas del backend.

### Simulador de estilo

- Permite seleccionar una imagen desde el equipo y mostrar una vista previa local.
- Valida que el archivo sea una imagen y que tenga un tamaño máximo de 10 MB.
- Ofrece una acción visual de demostración.
- La imagen seleccionada permanece en el navegador y no se envía al backend.
- No se ejecuta un modelo real de inteligencia artificial ni se modifica la fotografía.

### Agendamiento de demostración

- Permite escoger uno de los servicios consultados desde la API.
- Permite seleccionar una fecha y una hora de ejemplo.
- Muestra un resumen de la selección.
- Informa que la confirmación es una simulación y que la cita no se guarda.

## Tecnologías utilizadas

- **HTML5:** estructura de las pantallas, formularios, navegación y diálogos.
- **CSS3:** estilos personalizados, diseño adaptable, estados visuales y animaciones.
- **JavaScript (ES6+):** eventos, clases, validación, renderización dinámica y consumo de la API.
- **Fetch API:** comunicación HTTP con FastAPI.
- **Tailwind CSS mediante CDN:** utilidades de estilos utilizadas por la interfaz.
- **Google Material Icons e Inter mediante CDN:** iconografía y tipografía.
- **FastAPI:** backend REST consumido por el frontend.
- **SQLite:** persistencia gestionada por el backend.
- **Visual Studio Code y Live Server:** entorno local recomendado para abrir el frontend.
- **Docker Compose:** mecanismo previsto para ejecutar el backend cuando el proyecto backend está configurado para Docker.

No se requiere Node.js ni un proceso de compilación para ejecutar el frontend. Se necesita conexión a internet para cargar Tailwind CSS, Material Icons y la fuente desde sus CDN.

## Estructura del proyecto

```text
SmartCut_AI_Frontend/
├── index.html                # Estructura de las vistas y componentes
├── css/
│   └── styles.css            # Estilos propios y diseño adaptable
├── js/
│   └── app.js                # POO, autenticación, eventos y peticiones HTTP
├── .gitignore                # Archivos y carpetas ignorados por Git
└── README.md                 # Documentación del frontend
```

## Arquitectura del frontend

La lógica de `js/app.js` está organizada mediante clases para separar responsabilidades:

- **`ApiClient`:** concentra las solicitudes HTTP, convierte los cuerpos JSON, agrega el token Bearer cuando existe y traduce respuestas HTTP fallidas a errores manejables.
- **`AuthController`:** coordina el inicio de sesión, el registro, la restauración de la sesión y el cierre de sesión.
- **`UIController`:** administra la navegación, el contenido de cada pantalla, los formularios modales, las confirmaciones y los mensajes de interfaz.
- **`CrudModule`:** implementa el comportamiento reutilizable de consulta, búsqueda, creación, edición y eliminación de cada entidad.
- **`ToastController`:** muestra notificaciones temporales de éxito o error.
- **`ApiError`:** representa errores de la API, conservando el estado HTTP y los detalles disponibles.

Los módulos de usuarios, servicios y productos se configuran con sus rutas, campos y columnas. De esta forma comparten la lógica CRUD sin repetir toda la implementación para cada entidad.

## Comunicación con la API

La URL base está definida al comienzo de `js/app.js`:

```javascript
const API_BASE_URL = 'http://localhost:8000';
```

Modifica ese valor si el backend se ejecuta en otra dirección o puerto.

### Endpoints utilizados

| Módulo | Método | Ruta | Propósito |
|---|---|---|---|
| Autenticación | `POST` | `/auth/login` | Iniciar sesión y obtener el JWT |
| Autenticación | `GET` | `/auth/verify` | Comprobar el token y recuperar el usuario actual |
| Autenticación | `DELETE` | `/auth/logout` | Solicitar cierre de sesión al backend |
| Usuarios | `POST` | `/users/` | Crear un usuario |
| Usuarios | `GET` | `/users/?skip=0&limit=100` | Consultar usuarios |
| Usuarios | `PUT` | `/users/{user_id}` | Actualizar un usuario |
| Usuarios | `DELETE` | `/users/{user_id}` | Eliminar un usuario |
| Servicios | `POST` | `/services/` | Crear un servicio |
| Servicios | `GET` | `/services/?skip=0&limit=100` | Consultar servicios |
| Servicios | `PUT` | `/services/{service_id}` | Actualizar un servicio |
| Servicios | `DELETE` | `/services/{service_id}` | Eliminar un servicio |
| Productos | `POST` | `/products/` | Crear un producto |
| Productos | `GET` | `/products/?skip=0&limit=100` | Consultar productos |
| Productos | `PUT` | `/products/{product_id}` | Actualizar un producto |
| Productos | `DELETE` | `/products/{product_id}` | Eliminar un producto |

Las rutas para consultar un registro individual (`GET /users/{user_id}`, `GET /services/{service_id}` y `GET /products/{product_id}`) existen en el contrato del backend, pero las tablas del frontend cargan los listados y utilizan sus identificadores para editar o eliminar registros.

### Formatos de solicitud

- **Login:** `application/x-www-form-urlencoded`, con los campos `username` (correo electrónico) y `password`.
- **Registro y operaciones CRUD:** JSON, conforme a los esquemas Pydantic del backend.
- **Autenticación Bearer:** cuando hay un token local, `ApiClient` lo agrega a las solicitudes como `Authorization: Bearer <token>`.

El backend es la autoridad sobre los campos aceptados, la validación, los permisos y la persistencia. Si cambian sus modelos o esquemas, será necesario actualizar la configuración de campos y columnas de `js/app.js`.

## Requisitos previos

1. Windows con Visual Studio Code instalado.
2. La carpeta del backend de SmartCut AI.
3. Python y las dependencias requeridas por el backend, o Docker Desktop si el proyecto se ejecutará con Docker Compose.
4. La extensión **Live Server** de Visual Studio Code.
5. Conexión a internet para los recursos CSS, iconos y tipografía cargados por CDN.

## Configuración y ejecución

### 1. Preparar el backend

Abre una terminal en la raíz del backend.

Revisa y ajusta CORS en `app/main.py`. Como el frontend de Live Server y FastAPI usan puertos diferentes, FastAPI debe permitir el origen exacto del frontend.

En la configuración de CORS de `app/main.py` en el backend, asegúrate de permitir los siguientes orígenes de desarrollo:

- `http://127.0.0.1:5500`
- `http://localhost:5500`
- `http://127.0.0.1:5501`
- `http://localhost:5501`

Si Live Server muestra un origen diferente, agrega ese origen concreto a `allow_origins`. No es necesario habilitar `allow_credentials=True` para el flujo actual basado en un token Bearer enviado en una cabecera.

Después, si utilizas Docker Compose, ejecuta:

```powershell
docker compose up --build -d
```

Comprueba la respuesta de FastAPI en `http://localhost:8000/` y abre `http://localhost:8000/docs` para consultar la documentación interactiva de la API.

### 2. Abrir el frontend

1. Extrae la carpeta del frontend en tu equipo.
2. Abre `SmartCut_AI_Frontend` en Visual Studio Code.
3. Instala la extensión Live Server si todavía no la tienes.
4. Haz clic derecho en `index.html` y selecciona **Open with Live Server**.
5. Comprueba que el origen que muestra el navegador esté permitido en CORS.
6. Crea una cuenta de prueba o inicia sesión con credenciales válidas del backend.

### 3. Verificar la conexión

Si la aplicación no puede consultar los datos, comprueba lo siguiente:

- FastAPI está en ejecución y responde en `http://localhost:8000/`.
- `API_BASE_URL` en `js/app.js` apunta a la dirección correcta.
- CORS permite el origen exacto de Live Server.
- Los endpoints y los esquemas del backend coinciden con los usados por el frontend.

## Pruebas manuales recomendadas

Realiza las siguientes pruebas con registros de prueba, evitando eliminar datos importantes:

1. **Registro:** crea una cuenta con un correo que no esté registrado y una contraseña conocida.
2. **Inicio de sesión:** cierra la sesión y vuelve a ingresar con las mismas credenciales.
3. **Restauración de sesión:** recarga el frontend mientras la sesión siga vigente.
4. **Usuarios:** crea, consulta, edita y elimina una cuenta de prueba.
5. **Servicios:** crea un servicio de prueba, verifica sus datos, modifícalo y elimínalo.
6. **Productos:** crea un producto de prueba, verifica sus datos, modifícalo y elimínalo.
7. **Persistencia:** actualiza la página y confirma que los registros creados sigan presentes en la API.
8. **Validaciones:** intenta crear un registro con datos inválidos o un correo ya registrado y verifica que el mensaje de error sea comprensible.
9. **Conectividad:** detén temporalmente el backend en un entorno de pruebas y observa el mensaje de conexión; luego vuelve a iniciarlo.
10. **Simulaciones:** confirma que el simulador y el agendamiento indiquen que no se procesa IA ni se guarda una cita en el backend.

Para inspeccionar solicitudes y respuestas, abre las herramientas de desarrollador del navegador con `F12` y consulta la pestaña **Network / Red**. También puedes utilizar `http://localhost:8000/docs`.

## Solución de problemas

### La aplicación informa que no puede conectar con la API

Confirma que FastAPI esté activo, que la URL base sea correcta y que CORS permita el origen de Live Server. Revisa la consola del navegador y la pestaña Network/Red para encontrar el error exacto.

### El inicio de sesión devuelve `401 Unauthorized`

Comprueba el correo y la contraseña. Las contraseñas se almacenan como hashes y no se pueden recuperar en texto plano desde SQLite. Las credenciales de las cuentas iniciales deben conocerse por separado; crea una cuenta nueva con una contraseña conocida para probar el flujo. Si una cuenta recién creada tampoco funciona, prueba `POST /users/` y luego `POST /auth/login` desde `/docs` y revisa los logs del backend.

### La API devuelve un error `422`

FastAPI no pudo validar los datos enviados. Comprueba los campos requeridos, sus tipos y las restricciones definidas en los esquemas Pydantic. Los nombres de los campos deben coincidir exactamente con el backend.

### La interfaz se abre, pero las tablas no cargan

Comprueba que las rutas `/users/`, `/services/` y `/products/` devuelvan listas JSON. El frontend espera una lista para construir las tablas y utiliza los campos definidos en la configuración de cada módulo.

### Los cambios no se conservan después de reiniciar

Comprueba la configuración de persistencia de SQLite y los volúmenes de Docker Compose del backend. No elimines el archivo de base de datos ni volúmenes como intento inicial de solución, pues podrías perder información.

## Consideraciones de seguridad

- El token JWT se almacena en `localStorage` para mantener la sesión entre recargas. Este enfoque es sencillo para un proyecto académico, pero cualquier vulnerabilidad XSS puede exponer el token.
- Las contraseñas no deben guardarse en texto plano. El backend debe aplicar hashing y verificar las contraseñas mediante su mecanismo de autenticación.
- La interfaz no sustituye la autorización del servidor. En el backend recibido, los routers CRUD de usuarios, servicios y productos deben revisarse porque se observó que no exigían una dependencia de autenticación. Si continúan públicos, sus operaciones pueden invocarse directamente sin iniciar sesión en esta interfaz.
- Antes de publicar la aplicación, protege los endpoints en el backend, define permisos adecuados y revisa la configuración CORS para el entorno definitivo.
- No utilices datos personales o contraseñas reales para las pruebas si no es necesario.

## Limitaciones conocidas

- El simulador de estilo es una demostración local; no usa un modelo de IA.
- El agendamiento es visual; no registra citas ni reservas en SQLite.
- El frontend no contiene roles administrativos. La interfaz de administración no debe considerarse un control de permisos.
- Los módulos dependen del contrato actual de FastAPI. Si los esquemas del backend cambian, será necesario adaptar los formularios y la renderización.
- Tailwind CSS, Google Material Icons y la fuente Inter se descargan desde CDN y requieren conexión a internet.

---

**Proyecto académico:** SmartCut AI  
**Evidencia:** GA4-220501096-AA1-EV02 — Aplicación web funcional  
**Propósito:** demostrar la integración de un frontend web con una API REST y la gestión de datos mediante operaciones CRUD.
