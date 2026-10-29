(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let token = '', busy = false, selectedRunId = 'manual', loaded = false;

  function message(text, error = false) {
    $('message').textContent = text;
    $('message').classList.toggle('error', error);
  }
  function controls() {
    document.querySelectorAll('button, input').forEach((el) => { el.disabled = busy; });
    $('add-form').querySelectorAll('input, button').forEach((el) => { el.disabled = busy || !loaded; });
    $('tasks-screen').setAttribute('aria-busy', String(busy));
  }
  function logout() {
    token = ''; loaded = false; selectedRunId = 'manual';
    $('token').value = ''; $('author').textContent = '';
    $('task-list').replaceChildren(); $('run-id').value = 'manual'; $('new-title').value = '';
    $('empty').hidden = true; $('tasks-screen').hidden = true; $('login-screen').hidden = false;
  }
  async function api(path, method = 'GET', body) {
    let response;
    try {
      response = await fetch(path, {
        method, cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch { throw new Error('Нет связи с сервером. Проверьте соединение.'); }
    if (response.status === 401) { logout(); throw new Error('Токен не принят. Проверьте его и войдите снова.'); }
    if (!response.ok) {
      throw new Error(({ 400: 'Проверьте введённые данные.', 404: 'Задача не найдена. Обновите список.', 503: 'База данных недоступна. Повторите позже.' })[response.status] || 'Ошибка сервера. Повторите попытку.');
    }
    if (response.status === 204) return null;
    try { return await response.json(); } catch { throw new Error('Не удалось прочитать ответ сервера. Обновите список.'); }
  }
  async function operation(action) {
    if (busy) return;
    busy = true; controls(); message('Загрузка…');
    try { await action(); message('Готово.'); }
    catch (error) { message(error.message, true); }
    finally { busy = false; controls(); }
  }
  function titleValue(input) {
    const title = input.value.trim();
    if (!title || Array.from(title).length > 200) throw new Error('Название: от 1 до 200 символов после удаления пробелов по краям.');
    return title;
  }
  async function loadTasks(runId = selectedRunId) {
    const tasks = await api(`/api/tasks/?runId=${encodeURIComponent(runId)}`);
    selectedRunId = runId; loaded = true;
    $('group-heading').textContent = `Задачи группы ${runId}`;
    $('task-list').replaceChildren(...tasks.map(taskElement));
    $('empty').hidden = tasks.length !== 0;
    controls();
  }
  async function reloadAfterChange() {
    try { await loadTasks(); }
    catch (error) {
      loaded = false; $('task-list').replaceChildren(); $('empty').hidden = true;
      throw new Error(`Изменение сохранено, но список не загружен. ${error.message}`);
    }
  }
  async function mutate(task, method, body) {
    await api(`/api/tasks/${encodeURIComponent(task.id)}/`, method, body);
    await reloadAfterChange();
  }
  function button(text, className = 'secondary') {
    const el = document.createElement('button'); el.type = 'button'; el.className = className; el.textContent = text; return el;
  }
  function taskElement(task) {
    const item = document.createElement('li'); item.className = `task${task.done ? ' done' : ''}`;
    const row = document.createElement('div'); row.className = 'row';
    const label = document.createElement('label'); label.className = 'task-label';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = task.done;
    const details = document.createElement('span');
    const title = document.createElement('span'); title.className = 'task-title'; title.textContent = task.title;
    const status = document.createElement('span'); status.className = 'task-status'; status.textContent = task.done ? 'Выполнена' : 'Не выполнена';
    details.append(title, status); label.append(checkbox, details);
    checkbox.addEventListener('change', () => {
      const done = checkbox.checked; checkbox.checked = task.done;
      operation(() => mutate(task, 'PATCH', { done }));
    });
    const edit = button('Редактировать'), remove = button('Удалить', 'danger');
    const form = document.createElement('form'); form.hidden = true;
    const editLabel = document.createElement('label'); editLabel.textContent = 'Новое название';
    const input = document.createElement('input'); input.required = true; editLabel.append(input);
    const actions = document.createElement('div'); actions.className = 'row';
    const save = button('Сохранить'), cancel = button('Отмена'); save.type = 'submit';
    actions.append(save, cancel); form.append(editLabel, actions);
    edit.addEventListener('click', () => { input.value = task.title; form.hidden = false; input.focus(); });
    cancel.addEventListener('click', () => { form.hidden = true; edit.focus(); });
    form.addEventListener('submit', (event) => { event.preventDefault(); operation(() => mutate(task, 'PATCH', { title: titleValue(input) })); });
    remove.addEventListener('click', () => { if (!busy && window.confirm('Удалить эту задачу?')) operation(() => mutate(task, 'DELETE')); });
    row.append(label, edit, remove); item.append(row, form); return item;
  }
  $('login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    operation(async () => {
      token = $('token').value; $('token').value = '';
      const author = await api('/api/author/');
      $('author').textContent = `${author.fullName} · ${author.login}`;
      $('login-screen').hidden = true; $('tasks-screen').hidden = false;
      await loadTasks('manual');
    });
  });
  $('logout').addEventListener('click', () => { logout(); controls(); message('Вы вышли.'); $('token').focus(); });
  $('group-form').addEventListener('submit', (event) => {
    event.preventDefault();
    operation(async () => {
      const runId = $('run-id').value;
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) throw new Error('Проверьте формат runId.');
      await loadTasks(runId);
    });
  });
  $('refresh').addEventListener('click', () => operation(() => loadTasks()));
  $('add-form').addEventListener('submit', (event) => {
    event.preventDefault();
    operation(async () => {
      if (!loaded) return;
      await api('/api/tasks/', 'POST', { title: titleValue($('new-title')), runId: selectedRunId });
      $('new-title').value = '';
      await reloadAfterChange();
    });
  });
  controls();
})();
