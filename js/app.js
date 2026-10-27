'use strict';

/** Cambia esta dirección si FastAPI se ejecuta en otro host o puerto. */
const API_BASE_URL = 'http://localhost:8000';
const TOKEN_KEY = 'smartcut_access_token';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
}

function formatCOP(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '$0 COP';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0
  }).format(number);
}

function explainError(error) {
  if (error instanceof TypeError) {
    return `No se pudo conectar con ${API_BASE_URL}. Comprueba que Docker esté ejecutándose.`;
  }
  return error?.message || 'Ocurrió un error inesperado.';
}

class ApiError extends Error {
  constructor(message, status = 0, detail = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/** Centraliza todas las solicitudes HTTP y el envío del token Bearer. */
class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = localStorage.getItem(TOKEN_KEY) || '';
  }

  setToken(token) {
    this.token = token || '';
    if (this.token) localStorage.setItem(TOKEN_KEY, this.token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async request(path, options = {}) {
    const { method = 'GET', body, form, headers = {} } = options;
    const requestHeaders = { Accept: 'application/json', ...headers };
    const config = { method, headers: requestHeaders };

    if (this.token) requestHeaders.Authorization = `Bearer ${this.token}`;
    if (form instanceof URLSearchParams) {
      requestHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      config.body = form;
    } else if (body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
      config.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, config);
    } catch (error) {
      throw new TypeError(`No se pudo conectar con la API: ${error.message}`);
    }

    const responseText = response.status === 204 ? '' : await response.text();
    let data = null;
    if (responseText) {
      try { data = JSON.parse(responseText); }
      catch { data = responseText; }
    }

    if (!response.ok) {
      const detail = data && typeof data === 'object' ? data.detail : null;
      let message = typeof detail === 'string' ? detail : '';
      if (Array.isArray(detail)) {
        message = detail.map((item) => item.msg || JSON.stringify(item)).join(' · ');
      }
      if (!message && response.status === 401) message = 'La sesión expiró o las credenciales no son válidas.';
      if (!message && response.status === 403) message = 'No tienes permiso para realizar esta operación.';
      if (!message) message = `La API respondió con el estado HTTP ${response.status}.`;
      throw new ApiError(message, response.status, detail);
    }
    return data;
  }

  get(path) { return this.request(path); }
  post(path, body) { return this.request(path, { method: 'POST', body }); }
  put(path, body) { return this.request(path, { method: 'PUT', body }); }
  delete(path) { return this.request(path, { method: 'DELETE' }); }
}

class ToastController {
  constructor(region) { this.region = region; }
  show(title, message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast${type === 'error' ? ' error' : ''}`;
    const icon = type === 'error' ? 'error_outline' : 'check_circle';
    toast.innerHTML = `<span class="material-icons">${icon}</span><div><strong>${escapeHTML(title)}</strong><p>${escapeHTML(message)}</p></div>`;
    this.region.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4800);
  }
}

class UIController {
  constructor(api, toast) {
    this.api = api;
    this.toast = toast;
    this.currentUser = null;
    this.currentPage = 'dashboard';
    this.modules = {};
    this.pageContent = $('#page-content');
    this.dialog = $('#record-dialog');
    this.confirmDialog = $('#confirm-dialog');
    this.activeModule = null;
    this.activeRecord = null;
    this.pendingDelete = null;
    this.simulatorImageUrl = '';
    this.selectedDemoService = null;
    this.selectedDemoTime = '';
    this.bindStaticEvents();
  }

  bindStaticEvents() {
    $$('[data-page]').forEach((button) => button.addEventListener('click', () => {
      this.navigate(button.dataset.page);
      $('#sidebar').classList.remove('mobile-open');
    }));
    $('#mobile-menu-button').addEventListener('click', () => $('#sidebar').classList.toggle('mobile-open'));
    $('#logout-button').addEventListener('click', () => window.authController.logout());
    $('#dialog-close').addEventListener('click', () => this.dialog.close());
    $('#dialog-cancel').addEventListener('click', () => this.dialog.close());
    $('#confirm-cancel').addEventListener('click', () => this.confirmDialog.close());
    $('#confirm-delete').addEventListener('click', () => this.executeDelete());
    $('#record-form').addEventListener('submit', (event) => this.submitRecord(event));
    $('#page-content').addEventListener('click', (event) => this.handlePageClick(event));
    $('#page-content').addEventListener('input', (event) => {
      if (event.target.matches('[data-table-search]')) {
        const module = this.modules[event.target.dataset.tableSearch];
        if (module) module.renderRows(event.target.value);
      }
    });
    $('#page-content').addEventListener('change', (event) => this.handlePageChange(event));
  }

  setCurrentUser(user) {
    this.currentUser = user;
    $('#current-user-name').textContent = user?.nombre || 'Usuario';
    $('#current-user-email').textContent = user?.email || 'Sesión activa';
    const initials = (user?.nombre || 'SC').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    $('#user-avatar').textContent = initials || 'SC';
  }

  showAuth() {
    $('#app-screen').classList.add('hidden');
    $('#auth-screen').classList.remove('hidden');
    $('#login-form').classList.remove('hidden');
    $('#register-form').classList.add('hidden');
    $('#login-error').classList.add('hidden');
  }

  showApp() {
    $('#auth-screen').classList.add('hidden');
    $('#app-screen').classList.remove('hidden');
  }

  setApiStatus(state, message) {
    const dot = $('#api-status-dot');
    dot.classList.remove('online', 'offline');
    if (state === 'online') dot.classList.add('online');
    if (state === 'offline') dot.classList.add('offline');
    $('#api-status-text').textContent = message;
  }

  registerModule(key, module) { this.modules[key] = module; }

  async navigate(page) {
    this.currentPage = page;
    $$('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
    const titles = { dashboard: 'Resumen', users: 'Usuarios', services: 'Servicios', products: 'Productos', simulator: 'Simulador IA', appointments: 'Agendamiento' };
    $('#page-title').textContent = titles[page] || 'SmartCut AI';
    if (this.modules[page]) {
      this.modules[page].renderPage();
      await this.modules[page].load();
    } else if (page === 'dashboard') {
      await this.renderDashboard();
    } else if (page === 'simulator') {
      this.renderSimulator();
    } else if (page === 'appointments') {
      await this.renderAppointments();
    }
    this.pageContent.focus({ preventScroll: true });
  }

  async renderDashboard() {
    this.pageContent.innerHTML = `
      <div class="page-heading"><div><span class="section-kicker">VISTA GENERAL</span><h2>Estado de tu barbería</h2><p>Resumen de los registros que existen en tu base de datos.</p></div><button class="secondary-button" data-action="refresh-dashboard"><span class="material-icons">refresh</span> Actualizar</button></div>
      <div id="dashboard-metrics" class="metric-grid"><div class="metric-card"><div class="loading-state"><span class="spinner"></span>Cargando datos...</div></div></div>
      <div class="dashboard-bottom-grid"><section class="panel"><div class="panel-heading"><div><h3>Accesos directos</h3><p>Gestiona los registros mediante la API REST.</p></div></div><div class="panel-body"><div class="quick-link-list"><button class="quick-link" data-page="users"><span class="quick-icon material-icons">group_add</span><span><strong>Gestionar usuarios</strong><small>Crear, consultar, editar y eliminar cuentas</small></span><span class="material-icons">chevron_right</span></button><button class="quick-link" data-page="services"><span class="quick-icon material-icons">content_cut</span><span><strong>Gestionar servicios</strong><small>Administra el catálogo y sus precios</small></span><span class="material-icons">chevron_right</span></button><button class="quick-link" data-page="products"><span class="quick-icon material-icons">inventory_2</span><span><strong>Gestionar inventario</strong><small>Controla productos, marcas y existencias</small></span><span class="material-icons">chevron_right</span></button></div></div></section>
      <aside class="notice-panel"><span class="material-icons">integration_instructions</span><h3>Conexión con el backend</h3><p>Los módulos de usuarios, servicios y productos consumen los endpoints CRUD de FastAPI. Los cambios exitosos se guardan en SQLite.</p><p>El simulador de IA y las reservas se conservan como demostraciones visuales porque el backend actual no tiene endpoints para esas funciones.</p><span class="notice-foot"><span class="material-icons">verified</span> API REST · SQLite</span></aside></div>`;
    try {
      const [users, services, products] = await Promise.all([
        this.api.get('/users/?skip=0&limit=100'), this.api.get('/services/?skip=0&limit=100'), this.api.get('/products/?skip=0&limit=100')
      ]);
      $('#dashboard-metrics').innerHTML = [
        { count: users.length, label: 'Usuarios registrados', icon: 'group', tone: '' },
        { count: services.length, label: 'Servicios en el catálogo', icon: 'content_cut', tone: 'teal' },
        { count: products.length, label: 'Productos de inventario', icon: 'inventory_2', tone: 'orange' }
      ].map((item) => `<article class="metric-card"><div class="metric-top"><div class="metric-label">${item.label}</div><span class="metric-icon ${item.tone}"><span class="material-icons">${item.icon}</span></span></div><div class="metric-value">${item.count}</div></article>`).join('');
      this.setApiStatus('online', 'API conectada');
    } catch (error) {
      $('#dashboard-metrics').innerHTML = `<section class="panel"><div class="empty-state"><span class="material-icons">cloud_off</span><h3>No se pudieron cargar las métricas</h3><p>${escapeHTML(explainError(error))}</p></div></section>`;
      this.setApiStatus('offline', 'API no disponible');
      this.toast.show('Error de conexión', explainError(error), 'error');
    }
  }

  showRecordDialog(module, record = null) {
    this.activeModule = module;
    this.activeRecord = record;
    const isEditing = Boolean(record);
    $('#dialog-eyebrow').textContent = module.title.toUpperCase();
    $('#dialog-title').textContent = `${isEditing ? 'Editar' : 'Crear'} ${module.singular}`;
    $('#dialog-description').textContent = isEditing ? 'Modifica los datos y guarda los cambios en el backend.' : 'Completa los campos para registrar un nuevo elemento.';
    $('#dialog-error').classList.add('hidden');
    const fields = isEditing ? module.fields.filter((field) => field.editable !== false && !field.createOnly) : module.fields.filter((field) => field.createOnly !== true || !isEditing);
    $('#dialog-fields').innerHTML = fields.map((field) => {
      const value = record?.[field.name] ?? field.defaultValue ?? '';
      const type = field.type || 'text';
      const required = field.required && (!isEditing || field.requiredOnEdit) ? 'required' : '';
      const min = field.min !== undefined ? `min="${field.min}"` : '';
      const max = field.max !== undefined && (type === 'number' || type === 'date') ? `max="${field.max}"` : '';
      const maxLength = field.max !== undefined && !['number', 'date'].includes(type) ? `maxlength="${field.max}"` : '';
      const step = field.step ? `step="${field.step}"` : '';
      const full = field.full ? ' full-span' : '';
      if (field.type === 'textarea') {
        return `<div class="dialog-field${full}"><label class="field-label" for="record-${field.name}">${escapeHTML(field.label)}${field.required ? ' *' : ''}</label><textarea id="record-${field.name}" class="form-textarea" name="${field.name}" rows="3" ${required} maxlength="2000">${escapeHTML(value)}</textarea>${field.help ? `<p class="field-help">${escapeHTML(field.help)}</p>` : ''}</div>`;
      }
      return `<div class="dialog-field${full}"><label class="field-label" for="record-${field.name}">${escapeHTML(field.label)}${field.required ? ' *' : ''}</label><input id="record-${field.name}" class="form-input" name="${field.name}" type="${type}" value="${escapeHTML(value)}" ${required} ${min} ${max} ${maxLength} ${step} ${field.autocomplete ? `autocomplete="${field.autocomplete}"` : ''} ${field.placeholder ? `placeholder="${escapeHTML(field.placeholder)}"` : ''}>${field.help ? `<p class="field-help">${escapeHTML(field.help)}</p>` : ''}</div>`;
    }).join('');
    $('#dialog-save').disabled = false;
    $('#dialog-save').innerHTML = `<span>${isEditing ? 'Guardar cambios' : 'Crear registro'}</span><span class="material-icons">save</span>`;
    this.dialog.showModal();
  }

  async submitRecord(event) {
    event.preventDefault();
    if (!this.activeModule) return;
    const module = this.activeModule;
    const isEditing = Boolean(this.activeRecord);
    const formData = new FormData(event.currentTarget);
    const body = {};
    const fields = isEditing ? module.fields.filter((field) => field.editable !== false && !field.createOnly) : module.fields;
    for (const field of fields) {
      const rawValue = formData.get(field.name);
      if (rawValue === null) continue;
      const value = String(rawValue).trim();
      if (isEditing && !value && !field.required) continue;
      if (field.type === 'number') {
        if (value === '' && !field.required) continue;
        body[field.name] = Number(value);
      } else {
        if (value === '' && !field.required) continue;
        body[field.name] = value;
      }
    }
    const saveButton = $('#dialog-save');
    saveButton.disabled = true;
    saveButton.innerHTML = '<span class="spinner"></span><span>Guardando...</span>';
    $('#dialog-error').classList.add('hidden');
    try {
      if (isEditing) await this.api.put(`${module.endpoint}${this.activeRecord.id}`, body);
      else await this.api.post(module.endpoint, body);
      this.dialog.close();
      this.toast.show(isEditing ? 'Registro actualizado' : 'Registro creado', `Los datos de ${module.singular} se guardaron en el backend.`);
      await module.load();
    } catch (error) {
      $('#dialog-error').textContent = explainError(error);
      $('#dialog-error').classList.remove('hidden');
    } finally {
      saveButton.disabled = false;
      saveButton.innerHTML = `<span>${isEditing ? 'Guardar cambios' : 'Crear registro'}</span><span class="material-icons">save</span>`;
    }
  }

  requestDelete(module, record) {
    this.pendingDelete = { module, record };
    $('#confirm-message').textContent = `Vas a eliminar ${module.singular} «${module.getRecordName(record)}» (ID ${record.id}). Esta acción se ejecutará en el backend y no se puede deshacer.`;
    this.confirmDialog.showModal();
  }

  async executeDelete() {
    if (!this.pendingDelete) return;
    const { module, record } = this.pendingDelete;
    const button = $('#confirm-delete');
    button.disabled = true;
    button.textContent = 'Eliminando...';
    try {
      await this.api.delete(`${module.endpoint}${record.id}`);
      this.confirmDialog.close();
      this.toast.show('Registro eliminado', `Se eliminó ${module.singular} del backend.`);
      await module.load();
    } catch (error) {
      this.toast.show('No se pudo eliminar', explainError(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Sí, eliminar';
      this.pendingDelete = null;
    }
  }

  handlePageClick(event) {
    const navButton = event.target.closest('[data-page]');
    if (navButton) {
      this.navigate(navButton.dataset.page);
      $('#sidebar').classList.remove('mobile-open');
      return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    const moduleKey = actionButton.dataset.module;
    const module = this.modules[moduleKey];
    if (action === 'refresh-dashboard') this.renderDashboard();
    if (action === 'create' && module) module.create();
    if (action === 'edit' && module) module.edit(Number(actionButton.dataset.id));
    if (action === 'delete' && module) module.confirmDelete(Number(actionButton.dataset.id));
    if (action === 'refresh-module' && module) module.load();
    if (action === 'demo-generate') this.generateDemoPreview();
    if (action === 'demo-clear') this.clearDemoPreview();
    if (action === 'demo-confirm') this.confirmDemoAppointment();
  }

  handlePageChange(event) {
    if (event.target.id === 'demo-service-select') {
      const module = this.modules.services;
      const selected = module?.records.find((record) => String(record.id) === event.target.value);
      this.selectedDemoService = selected || null;
      const label = $('#appointment-service-name');
      const price = $('#appointment-service-price');
      if (label) label.textContent = selected?.nombre || 'Ninguno seleccionado';
      if (price) price.textContent = selected ? formatCOP(selected.precio) : '—';
    }
    if (event.target.id === 'demo-photo-input') this.previewDemoPhoto(event.target.files?.[0]);
  }

  async renderAppointments() {
    this.pageContent.innerHTML = `<div class="page-heading"><div><span class="section-kicker">PROTOTIPO VISUAL</span><h2>Agendamiento de citas</h2><p>Interfaz ilustrativa para seleccionar un servicio, una fecha y una hora.</p></div></div><div class="demo-banner"><span class="material-icons">info</span><div><strong>Esta reserva no se guarda en la base de datos.</strong><p>El backend entregado no contiene un modelo ni un endpoint de citas. La confirmación solo demuestra el flujo visual.</p></div></div><div class="agenda-layout"><section class="panel"><div class="panel-heading"><div><h3>Detalles de la reserva</h3><p>Selecciona el servicio y horario de ejemplo.</p></div></div><div class="panel-body"><label class="field-label" for="demo-service-select">Servicio</label><select id="demo-service-select" class="form-select"><option value="">Cargando servicios...</option></select><label class="field-label" for="demo-appointment-date">Fecha</label><input id="demo-appointment-date" class="form-input" type="date" min="${new Date().toISOString().slice(0,10)}"><label class="field-label">Hora disponible</label><div class="time-grid"><button class="time-option" type="button" data-demo-time="10:00">10:00 a. m.</button><button class="time-option" type="button" data-demo-time="14:00">2:00 p. m.</button><button class="time-option" type="button" data-demo-time="17:00">5:00 p. m.</button></div><button class="primary-button full-button" data-action="demo-confirm" type="button"><span class="material-icons">event_available</span> Simular confirmación</button></div></section><aside class="panel"><div class="panel-heading"><div><h3>Resumen</h3><p>Información de la reserva de prueba.</p></div></div><div class="panel-body"><div class="appointment-summary"><div class="summary-row"><span>Servicio</span><strong id="appointment-service-name">Ninguno seleccionado</strong></div><div class="summary-row"><span>Precio</span><strong id="appointment-service-price">—</strong></div><div class="summary-row"><span>Fecha</span><strong id="appointment-date-label">Sin seleccionar</strong></div><div class="summary-row"><span>Hora</span><strong id="appointment-time-label">Sin seleccionar</strong></div></div><div id="appointment-demo-result" class="demo-results hidden">Simulación completada. No se creó una cita en el backend.</div></div></aside></div>`;
    this.selectedDemoService = null;
    this.selectedDemoTime = '';
    try {
      const services = await this.api.get('/services/?skip=0&limit=100');
      if (this.modules.services) this.modules.services.records = services;
      const select = $('#demo-service-select');
      select.innerHTML = '<option value="">Seleccionar servicio</option>' + services.map((item) => `<option value="${item.id}">${escapeHTML(item.nombre)} — ${formatCOP(item.precio)}</option>`).join('');
      this.setApiStatus('online', 'API conectada');
    } catch (error) {
      $('#demo-service-select').innerHTML = '<option value="">No se pudieron cargar servicios</option>';
      this.toast.show('Error al cargar servicios', explainError(error), 'error');
    }
    $('#demo-appointment-date').addEventListener('change', (event) => {
      $('#appointment-date-label').textContent = event.target.value || 'Sin seleccionar';
    });
    $$('.time-option', this.pageContent).forEach((button) => button.addEventListener('click', () => {
      $$('.time-option', this.pageContent).forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
      this.selectedDemoTime = button.dataset.demoTime;
      $('#appointment-time-label').textContent = button.textContent;
    }));
  }

  confirmDemoAppointment() {
    const date = $('#demo-appointment-date')?.value;
    if (!this.selectedDemoService || !date || !this.selectedDemoTime) {
      this.toast.show('Faltan datos', 'Selecciona un servicio, una fecha y una hora.', 'error');
      return;
    }
    $('#appointment-demo-result').classList.remove('hidden');
    this.toast.show('Demostración completada', 'No se guardó una cita: el backend aún no tiene ese endpoint.');
  }

  renderSimulator() {
    this.pageContent.innerHTML = `<div class="page-heading"><div><span class="section-kicker">PROTOTIPO VISUAL</span><h2>Simulador de estilo</h2><p>Selecciona una fotografía local y prueba el flujo de previsualización de SmartCut AI.</p></div></div><div class="demo-banner"><span class="material-icons">lightbulb</span><div><strong>La previsualización es simulada; no es una IA real.</strong><p>El backend actual no expone un endpoint para cargar fotografías ni generar imágenes. La foto seleccionada se procesa solo en tu navegador.</p></div></div><div class="simulator-grid"><section class="panel"><div class="panel-heading"><div><h3>1. Fotografía</h3><p>La imagen no se envía al backend.</p></div></div><div class="panel-body"><label class="upload-dropzone" for="demo-photo-input"><span class="material-icons">add_photo_alternate</span><strong>Seleccionar una fotografía</strong><small>Formatos de imagen compatibles con tu navegador</small><input id="demo-photo-input" class="hidden" type="file" accept="image/*"></label><div class="simulator-actions"><button class="primary-button" data-action="demo-generate" type="button"><span class="material-icons">auto_awesome</span> Generar vista de prueba</button><button class="secondary-button" data-action="demo-clear" type="button">Limpiar</button></div></div></section><section class="panel"><div class="panel-heading"><div><h3>2. Previsualización</h3><p>Vista local de ejemplo.</p></div></div><div class="panel-body"><div id="demo-preview-frame" class="preview-frame"><div class="preview-placeholder"><span class="material-icons">face</span><p>Selecciona una fotografía para verla aquí.</p></div></div><div id="demo-preview-result" class="demo-results hidden">Vista de prueba completada. No se aplicó ningún cambio de estilo mediante inteligencia artificial.</div><button class="primary-button full-button" data-page="appointments" type="button"><span class="material-icons">calendar_month</span> Continuar a agendamiento</button></div></section></div>`;
    this.setApiStatus('online', 'API configurada');
  }

  previewDemoPhoto(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.toast.show('Archivo no compatible', 'Selecciona un archivo de imagen.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.toast.show('Imagen demasiado grande', 'Para esta demostración selecciona una imagen menor de 10 MB.', 'error');
      return;
    }
    if (this.simulatorImageUrl) URL.revokeObjectURL(this.simulatorImageUrl);
    this.simulatorImageUrl = URL.createObjectURL(file);
    $('#demo-preview-frame').innerHTML = `<img class="preview-image" src="${this.simulatorImageUrl}" alt="Fotografía seleccionada para la demostración">`;
    $('#demo-preview-result').classList.add('hidden');
  }

  generateDemoPreview() {
    const frame = $('#demo-preview-frame');
    if (!frame) return;
    if (!this.simulatorImageUrl) {
      this.toast.show('Selecciona una foto', 'Primero elige una fotografía para realizar la demostración.', 'error');
      return;
    }
    const button = $('[data-action="demo-generate"]');
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> Procesando demo...';
    window.setTimeout(() => {
      if (!document.body.contains(button)) return;
      button.disabled = false;
      button.innerHTML = '<span class="material-icons">auto_awesome</span> Generar vista de prueba';
      $('#demo-preview-result')?.classList.remove('hidden');
      this.toast.show('Demostración terminada', 'No se ha ejecutado ningún modelo real de IA.');
    }, 900);
  }

  clearDemoPreview() {
    if (this.simulatorImageUrl) URL.revokeObjectURL(this.simulatorImageUrl);
    this.simulatorImageUrl = '';
    const input = $('#demo-photo-input');
    if (input) input.value = '';
    const frame = $('#demo-preview-frame');
    if (frame) frame.innerHTML = '<div class="preview-placeholder"><span class="material-icons">face</span><p>Selecciona una fotografía para verla aquí.</p></div>';
    $('#demo-preview-result')?.classList.add('hidden');
  }
}

/** Implementación reutilizable del patrón CRUD para cada entidad. */
class CrudModule {
  constructor(config, api, ui) {
    this.config = config;
    this.key = config.key;
    this.endpoint = config.endpoint;
    this.title = config.title;
    this.singular = config.singular;
    this.description = config.description;
    this.fields = config.fields;
    this.columns = config.columns;
    this.api = api;
    this.ui = ui;
    this.records = [];
    this.loadVersion = 0;
  }

  getRecordName(record) { return record.nombre || record.email || `ID ${record.id}`; }
  create() { this.ui.showRecordDialog(this); }
  edit(id) {
    const record = this.records.find((item) => item.id === id);
    if (record) this.ui.showRecordDialog(this, record);
    else this.ui.toast.show('Registro no encontrado', 'Actualiza la tabla e intenta nuevamente.', 'error');
  }
  confirmDelete(id) {
    const record = this.records.find((item) => item.id === id);
    if (record) this.ui.requestDelete(this, record);
  }

  renderPage() {
    this.ui.pageContent.innerHTML = `<div class="page-heading"><div><span class="section-kicker">GESTIÓN / ${escapeHTML(this.title.toUpperCase())}</span><h2>${escapeHTML(this.title)}</h2><p>${escapeHTML(this.description)}</p></div><button class="primary-button" data-action="create" data-module="${this.key}" type="button"><span class="material-icons">add</span> Crear ${escapeHTML(this.singular)}</button></div><div class="toolbar"><label class="search-box"><span class="material-icons">search</span><input class="form-input" type="search" placeholder="Buscar en ${escapeHTML(this.title.toLowerCase())}..." aria-label="Buscar" data-table-search="${this.key}"></label><button class="secondary-button" data-action="refresh-module" data-module="${this.key}" type="button"><span class="material-icons">refresh</span> Actualizar</button></div><section class="panel"><div id="table-wrap-${this.key}" class="table-wrap"><div class="loading-state"><span class="spinner"></span>Consultando la API...</div></div><div id="record-count-${this.key}" class="record-count">Consultando registros...</div></section>`;
  }

  async load() {
    const version = ++this.loadVersion;
    const wrap = $(`#table-wrap-${this.key}`);
    if (!wrap) return;
    wrap.innerHTML = '<div class="loading-state"><span class="spinner"></span>Consultando la API...</div>';
    try {
      const response = await this.api.get(`${this.endpoint}?skip=0&limit=100`);
      if (!Array.isArray(response)) throw new Error('La API no devolvió una lista de registros. Revisa el endpoint y su esquema.');
      if (version !== this.loadVersion) return;
      this.records = response;
      this.renderRows($(`[data-table-search="${this.key}"]`)?.value || '');
      this.ui.setApiStatus('online', 'API conectada');
    } catch (error) {
      if (version !== this.loadVersion) return;
      wrap.innerHTML = `<div class="empty-state"><span class="material-icons">cloud_off</span><h3>No se pudieron cargar los registros</h3><p>${escapeHTML(explainError(error))}</p><button class="secondary-button mt-4" data-action="refresh-module" data-module="${this.key}" type="button"><span class="material-icons">refresh</span> Reintentar</button></div>`;
      $(`#record-count-${this.key}`).textContent = 'La consulta no se completó.';
      this.ui.setApiStatus('offline', 'API no disponible');
    }
  }

  renderCell(record, column) {
    const value = record[column.key];
    if (column.format === 'currency') return `<span class="price-text">${formatCOP(value)}</span>`;
    if (column.format === 'stock') return `<span class="inline-badge">${Number(value) || 0} unidades</span>`;
    if (column.format === 'duration') return `${escapeHTML(value)} min`;
    if (column.format === 'email') return `<span>${escapeHTML(value)}</span>`;
    if (column.format === 'description') return `<span>${escapeHTML(value || 'Sin descripción')}</span>`;
    return `<span>${escapeHTML(value ?? '—')}</span>`;
  }

  renderRows(searchTerm = '') {
    const wrap = $(`#table-wrap-${this.key}`);
    if (!wrap) return;
    const query = searchTerm.trim().toLocaleLowerCase('es');
    const filtered = this.records.filter((record) => this.columns.some((column) => String(record[column.key] ?? '').toLocaleLowerCase('es').includes(query)) || String(record.id).includes(query));
    if (filtered.length === 0) {
      const title = this.records.length ? 'No hay coincidencias' : `Todavía no hay ${this.title.toLowerCase()}`;
      const description = this.records.length ? 'Prueba con otro término de búsqueda.' : 'Crea el primer registro; se enviará a la API y quedará guardado en SQLite.';
      wrap.innerHTML = `<div class="empty-state"><span class="material-icons">${this.records.length ? 'search_off' : 'inbox'}</span><h3>${title}</h3><p>${description}</p>${this.records.length ? '' : `<button class="primary-button mt-4" data-action="create" data-module="${this.key}" type="button"><span class="material-icons">add</span> Crear ${escapeHTML(this.singular)}</button>`}</div>`;
    } else {
      const headers = this.columns.map((column) => `<th>${escapeHTML(column.label)}</th>`).join('');
      const rows = filtered.map((record) => `<tr><td class="table-primary">#${record.id}</td>${this.columns.map((column) => `<td>${this.renderCell(record, column)}</td>`).join('')}<td><div class="row-actions"><button class="row-action" data-action="edit" data-module="${this.key}" data-id="${record.id}" title="Editar" aria-label="Editar ${escapeHTML(this.getRecordName(record))}" type="button"><span class="material-icons">edit</span></button><button class="row-action delete" data-action="delete" data-module="${this.key}" data-id="${record.id}" title="Eliminar" aria-label="Eliminar ${escapeHTML(this.getRecordName(record))}" type="button"><span class="material-icons">delete</span></button></div></td></tr>`).join('');
      wrap.innerHTML = `<table class="data-table"><thead><tr><th>ID</th>${headers}<th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    const count = $(`#record-count-${this.key}`);
    if (count) count.textContent = `${filtered.length} de ${this.records.length} registro(s) · API ${this.endpoint}`;
  }
}

class AuthController {
  constructor(api, ui, toast) {
    this.api = api;
    this.ui = ui;
    this.toast = toast;
    $('#login-form').addEventListener('submit', (event) => this.login(event));
    $('#register-form').addEventListener('submit', (event) => this.register(event));
    $('#show-register').addEventListener('click', () => {
      $('#login-form').classList.add('hidden');
      $('#register-form').classList.remove('hidden');
      $('#register-error').classList.add('hidden');
    });
    $('#show-login').addEventListener('click', () => this.ui.showAuth());
  }

  async login(event) {
    event.preventDefault();
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    const button = $('#login-submit');
    const errorBox = $('#login-error');
    errorBox.classList.add('hidden');
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span><span>Validando...</span>';
    const form = new URLSearchParams({ username: email, password });
    try {
      const data = await this.api.request('/auth/login', { method: 'POST', form });
      if (!data?.access_token) throw new Error('La respuesta de la API no contiene access_token.');
      this.api.setToken(data.access_token);
      const user = await this.api.get('/auth/verify');
      this.ui.setCurrentUser(user);
      this.ui.showApp();
      this.ui.setApiStatus('online', 'API conectada');
      await this.ui.navigate('dashboard');
      this.toast.show('Sesión iniciada', `Bienvenido/a, ${user.nombre || user.email}.`);
    } catch (error) {
      this.api.setToken('');
      errorBox.textContent = explainError(error);
      errorBox.classList.remove('hidden');
    } finally {
      button.disabled = false;
      button.innerHTML = '<span>Ingresar</span><span class="material-icons">arrow_forward</span>';
    }
  }

  async register(event) {
    event.preventDefault();
    const button = $('#register-submit');
    const errorBox = $('#register-error');
    errorBox.classList.add('hidden');
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span><span>Creando cuenta...</span>';
    const userData = {
      nombre: $('#register-name').value.trim(),
      email: $('#register-email').value.trim(),
      password: $('#register-password').value
    };
    try {
      await this.api.post('/users/', userData);
      // Tras registrar, autentica inmediatamente con el formato que exige OAuth2PasswordRequestForm.
      const form = new URLSearchParams({ username: userData.email, password: userData.password });
      const tokenData = await this.api.request('/auth/login', { method: 'POST', form });
      if (!tokenData?.access_token) throw new Error('La cuenta se creó, pero la API no devolvió access_token. Vuelve al inicio de sesión.');
      this.api.setToken(tokenData.access_token);
      const user = await this.api.get('/auth/verify');
      this.ui.setCurrentUser(user);
      this.ui.showApp();
      await this.ui.navigate('dashboard');
      this.toast.show('Cuenta creada', 'El usuario se guardó en SQLite y la sesión se inició.');
      $('#register-form').reset();
    } catch (error) {
      errorBox.textContent = explainError(error);
      errorBox.classList.remove('hidden');
    } finally {
      button.disabled = false;
      button.innerHTML = '<span>Crear cuenta</span><span class="material-icons">person_add</span>';
    }
  }

  async restoreSession() {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (!savedToken) {
      this.ui.showAuth();
      return;
    }
    this.api.setToken(savedToken);
    try {
      const user = await this.api.get('/auth/verify');
      this.ui.setCurrentUser(user);
      this.ui.showApp();
      this.ui.setApiStatus('online', 'API conectada');
      await this.ui.navigate('dashboard');
    } catch {
      this.api.setToken('');
      this.ui.showAuth();
      this.toast.show('Vuelve a iniciar sesión', 'La sesión guardada ya no es válida.', 'error');
    }
  }

  async logout() {
    try {
      if (this.api.token) await this.api.delete('/auth/logout');
    } catch {
      // Aunque el endpoint falle, siempre se borra el token local.
    } finally {
      this.api.setToken('');
      this.ui.setCurrentUser(null);
      this.ui.showAuth();
      this.toast.show('Sesión cerrada', 'El token se eliminó del navegador.');
    }
  }
}

function createModules(api, ui) {
  const users = new CrudModule({
    key: 'users', endpoint: '/users/', title: 'Usuarios', singular: 'usuario',
    description: 'Administra las cuentas registradas. Las contraseñas nunca se muestran ni se incluyen en la respuesta del backend.',
    fields: [
      { name: 'nombre', label: 'Nombre completo', required: true, type: 'text', max: 120, autocomplete: 'name' },
      { name: 'email', label: 'Correo electrónico', required: true, type: 'email', autocomplete: 'email' },
      { name: 'password', label: 'Contraseña', required: true, type: 'password', createOnly: true, autocomplete: 'new-password', help: 'Solo se solicita al crear un usuario.' }
    ],
    columns: [{ key: 'nombre', label: 'Nombre' }, { key: 'email', label: 'Correo electrónico', format: 'email' }]
  }, api, ui);

  const services = new CrudModule({
    key: 'services', endpoint: '/services/', title: 'Servicios', singular: 'servicio',
    description: 'Gestiona el catálogo de cortes y sus datos. Cada cambio se envía al backend FastAPI y se persiste en SQLite.',
    fields: [
      { name: 'nombre', label: 'Nombre del servicio', required: true, type: 'text', max: 160 },
      { name: 'descripcion', label: 'Descripción', required: true, type: 'textarea', full: true },
      { name: 'precio', label: 'Precio (COP)', required: true, type: 'number', min: 0, step: '0.01' },
      { name: 'duracion_minutos', label: 'Duración (minutos)', required: true, type: 'number', min: 1, step: '1' }
    ],
    columns: [{ key: 'nombre', label: 'Servicio' }, { key: 'descripcion', label: 'Descripción', format: 'description' }, { key: 'precio', label: 'Precio', format: 'currency' }, { key: 'duracion_minutos', label: 'Duración', format: 'duration' }]
  }, api, ui);

  const products = new CrudModule({
    key: 'products', endpoint: '/products/', title: 'Productos', singular: 'producto',
    description: 'Administra el inventario de barbería con las operaciones CRUD disponibles en el backend.',
    fields: [
      { name: 'nombre', label: 'Nombre del producto', required: true, type: 'text', max: 160 },
      { name: 'marca', label: 'Marca', required: true, type: 'text', max: 120 },
      { name: 'precio', label: 'Precio (COP)', required: true, type: 'number', min: 0, step: '0.01' },
      { name: 'stock', label: 'Unidades en stock', required: true, type: 'number', min: 0, step: '1' }
    ],
    columns: [{ key: 'nombre', label: 'Producto' }, { key: 'marca', label: 'Marca' }, { key: 'precio', label: 'Precio', format: 'currency' }, { key: 'stock', label: 'Stock', format: 'stock' }]
  }, api, ui);

  [users, services, products].forEach((module) => ui.registerModule(module.key, module));
}

const api = new ApiClient(API_BASE_URL);
const toast = new ToastController($('#toast-region'));
const ui = new UIController(api, toast);
createModules(api, ui);
const authController = new AuthController(api, ui, toast);
window.authController = authController;
window.smartCutApp = { api, ui, authController };

document.addEventListener('DOMContentLoaded', () => authController.restoreSession());
window.addEventListener('beforeunload', () => {
  if (ui.simulatorImageUrl) URL.revokeObjectURL(ui.simulatorImageUrl);
});
