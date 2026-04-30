/**
 * Pomodoro Timer – app.js
 * Modes: Pomodoro (25 min) | Short Break (5 min) | Long Break (15 min)
 */

'use strict';

// ── Config ──────────────────────────────────────────────────────────
const MODES = {
  pomodoro: { label: 'Pomodoro',    minutes: 25, bodyClass: 'mode-pomodoro' },
  short:    { label: 'Short Break', minutes: 5,  bodyClass: 'mode-short'    },
  long:     { label: 'Long Break',  minutes: 15, bodyClass: 'mode-long'     },
};

const STORAGE_KEY = 'pomodoro_tasks';
const SESSIONS_KEY = 'pomodoro_sessions';
const SETTINGS_KEY = 'pomodoro_settings';
const BEEP_VOLUME = 0.4;

// Default settings
const DEFAULT_SETTINGS = {
  pomodoroMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStartBreaks: false,
  autoStartPomodoros: false,
  longBreakInterval: 4,
  autoCheckTasks: false,
  checkToBottom: true,
  alarmSound: 'kitchen',
  volume: 50,
  alarmRepeat: 1
};

// ── State ────────────────────────────────────────────────────────────
let currentMode = 'pomodoro';
let totalSeconds = MODES.pomodoro.minutes * 60;
let remainingSeconds = totalSeconds;
let timerId = null;
let isRunning = false;
let sessionCount = parseInt(localStorage.getItem(SESSIONS_KEY) || '1', 10);
let completedPomodoros = 0;
let settings = loadSettings();

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
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');

// ── Audio (simple beep via Web Audio API) ────────────────────────────
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playBeep(frequency = 880, duration = 0.6, volume = BEEP_VOLUME) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    const scaledVolume = (settings.volume / 100) * volume;
    gain.gain.setValueAtTime(scaledVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {
    // AudioContext not available – silently skip
  }
}

function playFinishSound() {
  const repeat = settings.alarmRepeat || 1;
  for (let i = 0; i < repeat; i++) {
    const delay = i * 1400;
    setTimeout(() => {
      playBeep(880, 0.4);
      setTimeout(() => playBeep(1100, 0.4), 450);
      setTimeout(() => playBeep(1320, 0.6), 900);
    }, delay);
  }
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
  
  // Use settings for timer durations
  let minutes;
  if (mode === 'pomodoro') {
    minutes = settings.pomodoroMinutes;
  } else if (mode === 'short') {
    minutes = settings.shortBreakMinutes;
  } else {
    minutes = settings.longBreakMinutes;
  }
  
  remainingSeconds = minutes * 60;

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
  let minutes;
  if (currentMode === 'pomodoro') {
    minutes = settings.pomodoroMinutes;
  } else if (currentMode === 'short') {
    minutes = settings.shortBreakMinutes;
  } else {
    minutes = settings.longBreakMinutes;
  }
  remainingSeconds = minutes * 60;
  renderTime();
}

function onTimerComplete() {
  playFinishSound();

  if (currentMode === 'pomodoro') {
    sessionCount += 1;
    completedPomodoros += 1;
    localStorage.setItem(SESSIONS_KEY, String(sessionCount));
    sessionEl.textContent = sessionCount;
    showBanner('🍅 Pomodoro complete! Time for a break.');
    
    // Auto-check task if enabled
    if (settings.autoCheckTasks) {
      autoCheckCurrentTask();
    }
    
    // Auto-start break if enabled
    if (settings.autoStartBreaks) {
      // Determine if it's time for a long break
      const isLongBreak = completedPomodoros % settings.longBreakInterval === 0;
      setTimeout(() => {
        setMode(isLongBreak ? 'long' : 'short');
        startTimer();
      }, 1000);
    }
  } else {
    showBanner('⏰ Break over! Ready for the next session?');
    
    // Auto-start pomodoro if enabled
    if (settings.autoStartPomodoros) {
      setTimeout(() => {
        setMode('pomodoro');
        startTimer();
      }, 1000);
    }
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

function sortTasks(tasks) {
  if (settings.checkToBottom) {
    // Move completed tasks to bottom - single pass
    const incomplete = [];
    const complete = [];
    tasks.forEach(t => (t.done ? complete : incomplete).push(t));
    return [...incomplete, ...complete];
  }
  return tasks;
}

function renderTasks() {
  const tasks = sortTasks(loadTasks());
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

function autoCheckCurrentTask() {
  const tasks = loadTasks();
  const firstUnchecked = tasks.find(t => !t.done);
  if (firstUnchecked) {
    toggleTask(firstUnchecked.id);
  }
}

// ── Settings management ───────────────────────────────────────────────
function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch (_) {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function openSettingsModal() {
  // Populate form with current settings
  document.getElementById('pomodoroMinutes').value = settings.pomodoroMinutes;
  document.getElementById('shortBreakMinutes').value = settings.shortBreakMinutes;
  document.getElementById('longBreakMinutes').value = settings.longBreakMinutes;
  document.getElementById('autoStartBreaks').checked = settings.autoStartBreaks;
  document.getElementById('autoStartPomodoros').checked = settings.autoStartPomodoros;
  document.getElementById('longBreakInterval').value = settings.longBreakInterval;
  document.getElementById('autoCheckTasks').checked = settings.autoCheckTasks;
  document.getElementById('checkToBottom').checked = settings.checkToBottom;
  document.getElementById('alarmSound').value = settings.alarmSound;
  document.getElementById('volumeSlider').value = settings.volume;
  document.getElementById('volumeValue').textContent = settings.volume;
  document.getElementById('alarmRepeat').value = settings.alarmRepeat;
  
  settingsModal.hidden = false;
}

function closeSettingsModal() {
  settingsModal.hidden = true;
}

function applySettings() {
  const newSettings = {
    pomodoroMinutes: parseInt(document.getElementById('pomodoroMinutes').value, 10),
    shortBreakMinutes: parseInt(document.getElementById('shortBreakMinutes').value, 10),
    longBreakMinutes: parseInt(document.getElementById('longBreakMinutes').value, 10),
    autoStartBreaks: document.getElementById('autoStartBreaks').checked,
    autoStartPomodoros: document.getElementById('autoStartPomodoros').checked,
    longBreakInterval: parseInt(document.getElementById('longBreakInterval').value, 10),
    autoCheckTasks: document.getElementById('autoCheckTasks').checked,
    checkToBottom: document.getElementById('checkToBottom').checked,
    alarmSound: document.getElementById('alarmSound').value,
    volume: parseInt(document.getElementById('volumeSlider').value, 10),
    alarmRepeat: parseInt(document.getElementById('alarmRepeat').value, 10)
  };
  
  saveSettings(newSettings);
  
  // Update current timer if it matches the changed duration
  if (!isRunning) {
    resetTimer();
  }
  
  // Re-render tasks if sorting changed
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

// Settings modal
settingsBtn.addEventListener('click', openSettingsModal);
closeSettingsBtn.addEventListener('click', () => {
  applySettings();
  closeSettingsModal();
});

// Close modal when clicking outside
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    applySettings();
    closeSettingsModal();
  }
});

// Volume slider real-time update (display only, doesn't apply settings yet)
document.getElementById('volumeSlider').addEventListener('input', (e) => {
  document.getElementById('volumeValue').textContent = e.target.value;
});

// Apply settings when any input changes
const settingsInputs = [
  'pomodoroMinutes', 'shortBreakMinutes', 'longBreakMinutes',
  'autoStartBreaks', 'autoStartPomodoros', 'longBreakInterval',
  'autoCheckTasks', 'checkToBottom', 'alarmSound', 'alarmRepeat'
];

settingsInputs.forEach(id => {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener('change', applySettings);
  }
});

// Volume slider applies settings on change (after user releases)
document.getElementById('volumeSlider').addEventListener('change', applySettings);

// ── Init ──────────────────────────────────────────────────────────────
sessionEl.textContent = sessionCount;
renderTime();
renderTasks();
