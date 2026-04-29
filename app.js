/**
 * Pomodoro Timer – app.js
 * Modes: Pomodoro (25 min) | Short Break (5 min) | Long Break (15 min)
 */

'use strict';

// ── Config ──────────────────────────────────────────────────────────
const MODES = {
  pomodoro: { label: 'Kromodoro',    minutes: 25, bodyClass: 'mode-pomodoro' },
  short:    { label: 'Short Break', minutes: 5,  bodyClass: 'mode-short'    },
  long:     { label: 'Long Break',  minutes: 15, bodyClass: 'mode-long'     },
};

const STORAGE_KEY = 'pomodoro_tasks';
const SESSIONS_KEY = 'pomodoro_sessions';
const BEEP_VOLUME = 0.4;

// ── State ────────────────────────────────────────────────────────────
let currentMode = 'pomodoro';
let totalSeconds = MODES.pomodoro.minutes * 60;
let remainingSeconds = totalSeconds;
let timerId = null;
let isRunning = false;
let sessionCount = parseInt(localStorage.getItem(SESSIONS_KEY) || '1', 10);

// ── DOM refs ─────────────────────────────────────────────────────────
const minutesEl   = document.getElementById('minutes');
const secondsEl   = document.getElementById('seconds');
const startBtn    = document.getElementById('startBtn');
const resetBtn    = document.getElementById('resetBtn');
const sessionEl   = document.getElementById('sessionCount');
const taskList    = document.getElementById('taskList');
const taskForm    = document.getElementById('taskForm');
const taskInput   = document.getElementById('taskInput');
const banner      = document.getElementById('notificationBanner');
const bannerMsg   = document.getElementById('notificationMessage');
const tabs        = document.querySelectorAll('.tab');

// ── Audio (simple beep via Web Audio API) ────────────────────────────
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playBeep(frequency = 880, duration = 0.6) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(BEEP_VOLUME, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {
    // AudioContext not available – silently skip
  }
}

function playFinishSound() {
  playBeep(880, 0.4);
  setTimeout(() => playBeep(1100, 0.4), 450);
  setTimeout(() => playBeep(1320, 0.6), 900);
}

// ── Timer helpers ─────────────────────────────────────────────────────
function pad(n) {
  return String(n).padStart(2, '0');
}

function renderTime() {
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  minutesEl.textContent = pad(m);
  secondsEl.textContent = pad(s);
  document.title = `${pad(m)}:${pad(s)} – ${MODES[currentMode].label}`;
}

function setMode(mode) {
  if (isRunning) stopTimer();

  currentMode = mode;
  remainingSeconds = MODES[mode].minutes * 60;

  // Update body class for background colour
  document.body.className = MODES[mode].bodyClass;

  // Update tabs
  tabs.forEach((tab) => {
    const isActive = tab.dataset.mode === mode;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  renderTime();
  startBtn.textContent = 'START';
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;
  startBtn.textContent = 'PAUSE';

  timerId = setInterval(() => {
    remainingSeconds -= 1;
    renderTime();

    if (remainingSeconds <= 0) {
      clearInterval(timerId);
      timerId = null;
      isRunning = false;
      startBtn.textContent = 'START';
      onTimerComplete();
    }
  }, 1000);
}

function pauseTimer() {
  if (!isRunning) return;
  clearInterval(timerId);
  timerId = null;
  isRunning = false;
  startBtn.textContent = 'START';
}

function stopTimer() {
  pauseTimer();
}

function resetTimer() {
  stopTimer();
  remainingSeconds = MODES[currentMode].minutes * 60;
  renderTime();
}

function onTimerComplete() {
  playFinishSound();

  if (currentMode === 'pomodoro') {
    sessionCount += 1;
    localStorage.setItem(SESSIONS_KEY, String(sessionCount));
    sessionEl.textContent = sessionCount;
    showBanner('🍅 Kromodoro complete! Time for a break.');
  } else {
    showBanner('⏰ Break over! Ready for the next session?');
  }
}

// ── Notification banner ───────────────────────────────────────────────
let bannerTimer = null;

function showBanner(message, duration = 4000) {
  bannerMsg.textContent = message;
  banner.hidden = false;

  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    banner.hidden = true;
  }, duration);
}

// ── Task management ───────────────────────────────────────────────────
function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (_) {
    return [];
  }
}

function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function renderTasks() {
  const tasks = loadTasks();
  taskList.innerHTML = '';

  tasks.forEach((task) => {
    const li = document.createElement('li');
    li.className = `task-item${task.done ? ' done' : ''}`;
    li.dataset.id = task.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = task.done;
    checkbox.setAttribute('aria-label', `Mark "${task.text}" as done`);
    checkbox.addEventListener('change', () => toggleTask(task.id));

    const span = document.createElement('span');
    span.className = 'task-text';
    span.textContent = task.text;

    const del = document.createElement('button');
    del.className = 'task-delete';
    del.textContent = '✕';
    del.setAttribute('aria-label', `Delete task "${task.text}"`);
    del.addEventListener('click', () => deleteTask(task.id));

    li.append(checkbox, span, del);
    taskList.appendChild(li);
  });
}

function addTask(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  const tasks = loadTasks();
  tasks.push({ id: Date.now() + Math.random(), text: trimmed, done: false });
  saveTasks(tasks);
  renderTasks();
}

function toggleTask(id) {
  const tasks = loadTasks().map((t) =>
    t.id === id ? { ...t, done: !t.done } : t
  );
  saveTasks(tasks);
  renderTasks();
}

function deleteTask(id) {
  const tasks = loadTasks().filter((t) => t.id !== id);
  saveTasks(tasks);
  renderTasks();
}

// ── Event listeners ───────────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  if (isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
});

resetBtn.addEventListener('click', () => resetTimer());

tabs.forEach((tab) => {
  tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addTask(taskInput.value);
  taskInput.value = '';
});

// ── Init ──────────────────────────────────────────────────────────────
sessionEl.textContent = sessionCount;
renderTime();
renderTasks();
