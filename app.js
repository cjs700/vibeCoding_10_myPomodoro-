/**
 * FocusFlow Pomodoro Timer - Modern Vanilla JS Implementation
 * Features:
 * - 25m Focus / 5m Break Auto-switching
 * - Circular SVG Progress Ring & Digital Timer
 * - Real-time Browser Tab Title Updates
 * - Procedural Web Audio API Ambient Sounds (Waves, Rain, Birds) & Session Alarm
 * - LocalStorage Persistence (Sessions, Sound, Volume, Mute)
 * - Dynamic Theme Transitions & Keyboard Shortcuts
 */

(() => {
  'use strict';

  // --- Constants & Config ---
  const CONFIG = {
    FOCUS_SECONDS: 25 * 60,  // 25분
    BREAK_SECONDS: 5 * 60,   // 5분
    CIRCUMFERENCE: 880,      // 2 * π * 140 ≈ 879.645
    STORAGE_KEYS: {
      SESSIONS: 'focusflow_completed_sessions',
      SOUND: 'focusflow_sound_type',
      VOLUME: 'focusflow_volume',
      MUTED: 'focusflow_muted'
    }
  };

  // --- State ---
  const state = {
    mode: 'focus', // 'focus' | 'break'
    timeLeft: CONFIG.FOCUS_SECONDS,
    totalDuration: CONFIG.FOCUS_SECONDS,
    isRunning: false,
    timerId: null,
    endTime: null,
    completedSessions: 0,
    currentSound: 'off',
    volume: 70,
    isMuted: false
  };

  // --- DOM Elements ---
  const dom = {
    body: document.body,
    timeDisplay: document.getElementById('timeDisplay'),
    timerModeTag: document.getElementById('timerModeTag'),
    timerSubtext: document.getElementById('timerSubtext'),
    modeBadge: document.getElementById('modeBadge'),
    modeBadgeText: document.getElementById('modeBadgeText'),
    ringProgress: document.getElementById('ringProgress'),
    
    // Controls
    btnToggle: document.getElementById('btnToggle'),
    btnToggleIcon: document.getElementById('btnToggleIcon'),
    btnToggleText: document.getElementById('btnToggleText'),
    btnReset: document.getElementById('btnReset'),
    btnSkip: document.getElementById('btnSkip'),

    // Audio & Noise
    soundChips: document.querySelectorAll('.sound-chip'),
    volumeSlider: document.getElementById('volumeSlider'),
    volumeValue: document.getElementById('volumeValue'),
    btnMute: document.getElementById('btnMute'),
    muteIcon: document.getElementById('muteIcon'),

    // Stats
    completedCount: document.getElementById('completedCount'),
    totalFocusTime: document.getElementById('totalFocusTime'),
    tomatoBadges: document.getElementById('tomatoBadges'),
    btnResetSessions: document.getElementById('btnResetSessions')
  };

  // --- Web Audio API Engine (Procedural Sound & Alarm) ---
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.currentNoiseNodes = [];
      this.birdInterval = null;
      this.rainInterval = null;
    }

    init() {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.updateMasterVolume();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    updateMasterVolume() {
      if (!this.masterGain || !this.ctx) return;
      const targetGain = state.isMuted ? 0 : (state.volume / 100);
      this.masterGain.gain.setValueAtTime(targetGain, this.ctx.currentTime);
    }

    stopCurrentSound() {
      if (this.birdInterval) {
        clearInterval(this.birdInterval);
        this.birdInterval = null;
      }
      if (this.rainInterval) {
        clearTimeout(this.rainInterval);
        this.rainInterval = null;
      }
      this.currentNoiseNodes.forEach(node => {
        try {
          if (node.stop) node.stop();
          node.disconnect();
        } catch (_) {}
      });
      this.currentNoiseNodes = [];
    }

    // White Noise Buffer Generator
    createNoiseBuffer(type = 'white') {
      const bufferSize = this.ctx.sampleRate * 3;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        if (type === 'pink') {
          // Paul Kellet's Pink Noise algorithm
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
        } else {
          data[i] = white * 0.15;
        }
      }
      return buffer;
    }

    // Custom Rain Patter Buffer Generator for Soft Cozy Drizzle (부드러운 보슬비 텍스처)
    createRainPatterBuffer() {
      const bufferSize = this.ctx.sampleRate * 4;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Warm, silk-soft pink/brown noise for misty drizzle
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.995 * b0 + white * 0.04;
        b1 = 0.96 * b1 + white * 0.08;
        b2 = 0.88 * b2 + white * 0.15;
        b3 = 0.72 * b3 + white * 0.22;
        let sample = (b0 + b1 + b2 + b3 + white * 0.15) * 0.14;

        // Extremely soft micro-mist variations (자극 없는 고운 입자감)
        if (Math.random() < 0.008) {
          sample += (Math.random() * 2 - 1) * 0.07;
        }
        data[i] = sample;
      }
      return buffer;
    }

    // Play Ocean Waves
    playWaves() {
      this.init();
      this.stopCurrentSound();

      const noiseBuffer = this.createNoiseBuffer('pink');
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      // Filter to simulate deep water sound
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, this.ctx.currentTime);

      // LFO for rhythmic swells of waves
      const lfo = this.ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.12, this.ctx.currentTime); // ~8 sec wave cycle
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(260, this.ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      const waveGain = this.ctx.createGain();
      waveGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      noiseSource.connect(filter);
      filter.connect(waveGain);
      waveGain.connect(this.masterGain);

      noiseSource.start();
      lfo.start();

      this.currentNoiseNodes.push(noiseSource, lfo, lfoGain, filter, waveGain);
    }

    // Play Cozy Gentle Drizzle (아늑한 보슬비 소리)
    playRain() {
      this.init();
      this.stopCurrentSound();

      // --- Layer 1: Cozy Under-roof Ambient Rain (처마 밑에서 듣는 포근하고 따뜻한 빗소리 바디) ---
      const baseNoise = this.createNoiseBuffer('pink');
      const baseSource = this.ctx.createBufferSource();
      baseSource.buffer = baseNoise;
      baseSource.loop = true;

      const baseFilter = this.ctx.createBiquadFilter();
      baseFilter.type = 'lowpass';
      baseFilter.frequency.setValueAtTime(650, this.ctx.currentTime); // 따뜻하고 귀가 편안한 650Hz 저역 통과

      // Slow gentle breathing swell (산들바람에 부드럽게 흔들리는 보슬비의 자연스러운 호흡)
      const rainLfo = this.ctx.createOscillator();
      rainLfo.frequency.setValueAtTime(0.038, this.ctx.currentTime); // ~26초 주기 아주 은은한 변화
      const rainLfoGain = this.ctx.createGain();
      rainLfoGain.gain.setValueAtTime(120, this.ctx.currentTime);
      rainLfo.connect(rainLfoGain);
      rainLfoGain.connect(baseFilter.frequency);

      const baseGain = this.ctx.createGain();
      baseGain.gain.setValueAtTime(0.52, this.ctx.currentTime);

      baseSource.connect(baseFilter);
      baseFilter.connect(baseGain);
      baseGain.connect(this.masterGain);

      baseSource.start();
      rainLfo.start();
      this.currentNoiseNodes.push(baseSource, rainLfo, rainLfoGain, baseFilter, baseGain);

      // --- Layer 2: Soft Misty Air Texture (사르르 내리는 고운 이슬비 안개 질감) ---
      const patterBuffer = this.createRainPatterBuffer();
      const patterSource = this.ctx.createBufferSource();
      patterSource.buffer = patterBuffer;
      patterSource.loop = true;

      // Bandpass around 1500Hz with gentle curve to avoid any harsh treble
      const patterFilter = this.ctx.createBiquadFilter();
      patterFilter.type = 'bandpass';
      patterFilter.frequency.setValueAtTime(1550, this.ctx.currentTime);
      patterFilter.Q.setValueAtTime(0.7, this.ctx.currentTime);

      const patterHighCut = this.ctx.createBiquadFilter();
      patterHighCut.type = 'lowpass';
      patterHighCut.frequency.setValueAtTime(2400, this.ctx.currentTime);

      const patterGain = this.ctx.createGain();
      patterGain.gain.setValueAtTime(0.24, this.ctx.currentTime);

      patterSource.connect(patterFilter);
      patterFilter.connect(patterHighCut);
      patterHighCut.connect(patterGain);
      patterGain.connect(this.masterGain);

      patterSource.start();
      this.currentNoiseNodes.push(patterSource, patterFilter, patterHighCut, patterGain);

      // --- Layer 3: Velvet Micro Drips (풀잎과 창가에 살포시 닿는 몽환적이고 부드러운 이슬방울) ---
      const triggerDroplet = () => {
        if (!this.ctx || state.currentSound !== 'rain') return;
        const now = this.ctx.currentTime;
        
        const osc = this.ctx.createOscillator();
        const dropGain = this.ctx.createGain();
        // Warm lower pitch range (1.1kHz ~ 1.7kHz) for round, soft drops
        const startFreq = 1100 + Math.random() * 600;
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(startFreq * 0.55, now + 0.035);

        // Very soft, whisper-quiet gentle envelope
        dropGain.gain.setValueAtTime(0.0001, now);
        dropGain.gain.exponentialRampToValueAtTime(0.032 + Math.random() * 0.018, now + 0.005);
        dropGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);

        if (this.ctx.createStereoPanner) {
          const panner = this.ctx.createStereoPanner();
          panner.pan.setValueAtTime((Math.random() * 1.4) - 0.7, now);
          osc.connect(dropGain);
          dropGain.connect(panner);
          panner.connect(this.masterGain);
        } else {
          osc.connect(dropGain);
          dropGain.connect(this.masterGain);
        }

        osc.start(now);
        osc.stop(now + 0.045);
      };

      const scheduleDroplets = () => {
        if (state.currentSound !== 'rain') return;
        triggerDroplet();
        if (Math.random() > 0.6) {
          setTimeout(triggerDroplet, 120 + Math.random() * 150);
        }
        // Relaxed, unhurried interval for cozy drizzle
        const nextTime = 250 + Math.random() * 550;
        this.rainInterval = setTimeout(scheduleDroplets, nextTime);
      };

      scheduleDroplets();
    }

    // Play Forest Birds (Ambient breeze + procedural bird chirps)
    playBirds() {
      this.init();
      this.stopCurrentSound();

      // Background soft gentle wind
      const breezeBuffer = this.createNoiseBuffer('pink');
      const breezeSource = this.ctx.createBufferSource();
      breezeSource.buffer = breezeBuffer;
      breezeSource.loop = true;

      const breezeFilter = this.ctx.createBiquadFilter();
      breezeFilter.type = 'bandpass';
      breezeFilter.frequency.setValueAtTime(400, this.ctx.currentTime);
      breezeFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

      const breezeGain = this.ctx.createGain();
      breezeGain.gain.setValueAtTime(0.18, this.ctx.currentTime);

      breezeSource.connect(breezeFilter);
      breezeFilter.connect(breezeGain);
      breezeGain.connect(this.masterGain);
      breezeSource.start();
      this.currentNoiseNodes.push(breezeSource, breezeFilter, breezeGain);

      // Single Bird Chirp Generator
      const triggerChirp = () => {
        if (!this.ctx || state.currentSound !== 'birds') return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const chirpGain = this.ctx.createGain();

        const baseFreq = 2200 + Math.random() * 1400; // 2.2kHz ~ 3.6kHz
        osc.type = 'sine';

        // Frequency sweep for realistic chirp
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq + 600, now + 0.06);
        osc.frequency.exponentialRampToValueAtTime(baseFreq - 300, now + 0.14);

        chirpGain.gain.setValueAtTime(0.001, now);
        chirpGain.gain.exponentialRampToValueAtTime(0.25, now + 0.04);
        chirpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        osc.connect(chirpGain);
        chirpGain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.18);
      };

      // Periodic natural random bird tweets
      const scheduleNextBird = () => {
        if (state.currentSound !== 'birds') return;
        triggerChirp();
        // Occasionally double tweet
        if (Math.random() > 0.4) {
          setTimeout(triggerChirp, 180 + Math.random() * 120);
        }
        const delay = 1500 + Math.random() * 3500;
        this.birdInterval = setTimeout(scheduleNextBird, delay);
      };

      scheduleNextBird();
    }

    // Harmonious Session Completion Chime
    playAlarm() {
      this.init();
      const notes = state.mode === 'focus' 
        ? [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6 (Bright Victory)
        : [783.99, 659.25, 523.25];         // G5, E5, C5 (Gentle Relax)

      notes.forEach((freq, idx) => {
        const startTime = this.ctx.currentTime + (idx * 0.18);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.4, startTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 1.3);
      });
    }

    setSound(type) {
      state.currentSound = type;
      switch (type) {
        case 'waves': this.playWaves(); break;
        case 'rain': this.playRain(); break;
        case 'birds': this.playBirds(); break;
        case 'off':
        default:
          this.stopCurrentSound();
          break;
      }
    }
  }

  const audio = new AudioEngine();

  // --- LocalStorage Manager ---
  const storage = {
    load() {
      try {
        const savedSessions = localStorage.getItem(CONFIG.STORAGE_KEYS.SESSIONS);
        if (savedSessions !== null) {
          state.completedSessions = parseInt(savedSessions, 10) || 0;
        }

        const savedSound = localStorage.getItem(CONFIG.STORAGE_KEYS.SOUND);
        if (savedSound) {
          state.currentSound = savedSound;
        }

        const savedVol = localStorage.getItem(CONFIG.STORAGE_KEYS.VOLUME);
        if (savedVol !== null) {
          state.volume = parseInt(savedVol, 10) || 70;
        }

        const savedMuted = localStorage.getItem(CONFIG.STORAGE_KEYS.MUTED);
        if (savedMuted !== null) {
          state.isMuted = savedMuted === 'true';
        }
      } catch (e) {
        console.warn('LocalStorage load failed:', e);
      }
    },

    saveSessions() {
      try {
        localStorage.setItem(CONFIG.STORAGE_KEYS.SESSIONS, state.completedSessions);
      } catch (_) {}
    },

    saveSound() {
      try {
        localStorage.setItem(CONFIG.STORAGE_KEYS.SOUND, state.currentSound);
      } catch (_) {}
    },

    saveVolume() {
      try {
        localStorage.setItem(CONFIG.STORAGE_KEYS.VOLUME, state.volume);
        localStorage.setItem(CONFIG.STORAGE_KEYS.MUTED, state.isMuted);
      } catch (_) {}
    }
  };

  // --- UI Update Functions ---
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function updateTimerDisplay() {
    const formatted = formatTime(state.timeLeft);
    dom.timeDisplay.textContent = formatted;

    // SVG Circular Progress Ring Update
    const fraction = state.timeLeft / state.totalDuration;
    // Circular offset: 0 is full, 880 is empty
    const offset = CONFIG.CIRCUMFERENCE * (1 - fraction);
    dom.ringProgress.style.strokeDashoffset = offset;

    // Document Title Update
    const modeIcon = state.mode === 'focus' ? '🔥' : '☕';
    const modeLabel = state.mode === 'focus' ? '집중 중' : '휴식 중';
    const statusText = state.isRunning ? '' : '(일시정지) ';
    document.title = `${statusText}(${formatted}) ${modeIcon} ${modeLabel} | FocusFlow`;
  }

  function updateThemeUI() {
    const isFocus = state.mode === 'focus';

    // Body Class
    dom.body.classList.toggle('mode-focus', isFocus);
    dom.body.classList.toggle('mode-break', !isFocus);

    // Badges & Labels
    if (isFocus) {
      dom.modeBadgeText.textContent = '🔥 집중 세션';
      dom.timerModeTag.textContent = '집중 시간';
      dom.timerSubtext.textContent = '목표에 온전히 몰입하세요';
    } else {
      dom.modeBadgeText.textContent = '☕ 휴식 세션';
      dom.timerModeTag.textContent = '휴식 시간';
      dom.timerSubtext.textContent = '스트레칭과 심호흡으로 재충전하세요';
    }

    // Toggle Button Style
    if (state.isRunning) {
      dom.btnToggleIcon.textContent = '⏸';
      dom.btnToggleText.textContent = '일시정지';
    } else {
      dom.btnToggleIcon.textContent = '▶';
      dom.btnToggleText.textContent = '시작';
    }
  }

  function updateStatsUI() {
    dom.completedCount.textContent = state.completedSessions;
    const totalMinutes = state.completedSessions * 25;
    dom.totalFocusTime.textContent = `${totalMinutes}분`;

    // Render Tomato Badges
    dom.tomatoBadges.innerHTML = '';
    if (state.completedSessions === 0) {
      dom.tomatoBadges.innerHTML = '<span class="empty-badge-text">첫 번째 집중 세션을 완료해 보세요! 🔥</span>';
    } else {
      for (let i = 1; i <= state.completedSessions; i++) {
        const badge = document.createElement('div');
        badge.className = 'tomato-badge-item';
        badge.innerHTML = `<span>🍅</span> #${i}`;
        dom.tomatoBadges.appendChild(badge);
      }
    }
  }

  function updateSoundUI() {
    dom.soundChips.forEach(chip => {
      const chipSound = chip.dataset.sound;
      const isActive = chipSound === state.currentSound;
      chip.classList.toggle('active', isActive);
      chip.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });

    dom.volumeSlider.value = state.volume;
    dom.volumeValue.textContent = `${state.volume}%`;
    dom.muteIcon.textContent = (state.isMuted || state.volume === 0) ? '🔇' : '🔊';
  }

  // --- Timer Operations ---
  function tick() {
    if (!state.isRunning) return;

    const now = Date.now();
    const remainingMs = state.endTime - now;
    state.timeLeft = Math.max(0, Math.ceil(remainingMs / 1000));

    updateTimerDisplay();

    if (state.timeLeft <= 0) {
      handleSessionComplete();
    }
  }

  function startTimer() {
    audio.init();
    state.isRunning = true;
    state.endTime = Date.now() + (state.timeLeft * 1000);
    clearInterval(state.timerId);
    state.timerId = setInterval(tick, 250);

    // If noise is enabled, resume/start noise
    if (state.currentSound !== 'off') {
      audio.setSound(state.currentSound);
    }

    updateThemeUI();
    updateTimerDisplay();
  }

  function pauseTimer() {
    state.isRunning = false;
    clearInterval(state.timerId);
    updateThemeUI();
    updateTimerDisplay();
  }

  function toggleTimer() {
    if (state.isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  }

  function resetTimer() {
    pauseTimer();
    state.timeLeft = state.mode === 'focus' ? CONFIG.FOCUS_SECONDS : CONFIG.BREAK_SECONDS;
    state.totalDuration = state.timeLeft;
    document.title = 'FocusFlow - 포모도로 타이머';
    updateTimerDisplay();
  }

  function switchMode(newMode, autoStart = true) {
    pauseTimer();
    state.mode = newMode;
    state.timeLeft = newMode === 'focus' ? CONFIG.FOCUS_SECONDS : CONFIG.BREAK_SECONDS;
    state.totalDuration = state.timeLeft;

    updateThemeUI();
    updateTimerDisplay();

    if (autoStart) {
      startTimer();
    }
  }

  function handleSessionComplete() {
    pauseTimer();
    audio.playAlarm();

    // Browser Notification support
    if ('Notification' in window && Notification.permission === 'granted') {
      const msg = state.mode === 'focus'
        ? '축하합니다! 25분 집중 세션이 완료되었습니다. 5분 휴식을 시작합니다.'
        : '휴식이 완료되었습니다! 다음 25분 집중을 시작할 준비가 되셨나요?';
      new Notification('🍅 FocusFlow 포모도로', { body: msg, icon: '🍅' });
    }

    if (state.mode === 'focus') {
      // 집중 세션 완료 기록
      state.completedSessions++;
      storage.saveSessions();
      updateStatsUI();

      // 자동 5분 휴식 전환
      switchMode('break', true);
    } else {
      // 휴식 완료 후 다시 25분 집중으로 자동 전환
      switchMode('focus', true);
    }
  }

  function skipSession() {
    const nextMode = state.mode === 'focus' ? 'break' : 'focus';
    switchMode(nextMode, state.isRunning);
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // Timer Buttons
    dom.btnToggle.addEventListener('click', toggleTimer);
    dom.btnReset.addEventListener('click', resetTimer);
    dom.btnSkip.addEventListener('click', skipSession);

    // Sound Chip Selection
    dom.soundChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const soundType = chip.dataset.sound;
        audio.setSound(soundType);
        storage.saveSound();
        updateSoundUI();
      });
    });

    // Volume Slider
    dom.volumeSlider.addEventListener('input', (e) => {
      state.volume = parseInt(e.target.value, 10);
      state.isMuted = false;
      audio.updateMasterVolume();
      storage.saveVolume();
      updateSoundUI();
    });

    // Mute Toggle
    dom.btnMute.addEventListener('click', () => {
      state.isMuted = !state.isMuted;
      audio.updateMasterVolume();
      storage.saveVolume();
      updateSoundUI();
    });

    // Stats Reset
    dom.btnResetSessions.addEventListener('click', () => {
      if (confirm('오늘의 집중 세션 기록을 초기화하시겠습니까?')) {
        state.completedSessions = 0;
        storage.saveSessions();
        updateStatsUI();
      }
    });

    // Request Notification Permission on first user interaction
    window.addEventListener('click', () => {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }, { once: true });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // Ignore if user is interacting with form elements
      if (e.target.tagName === 'INPUT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        toggleTimer();
      } else if (e.code === 'KeyR') {
        resetTimer();
      } else if (e.code === 'KeyS') {
        skipSession();
      }
    });
  }

  // --- App Initialization ---
  function initApp() {
    storage.load();
    updateThemeUI();
    updateTimerDisplay();
    updateStatsUI();
    updateSoundUI();
    setupEventListeners();

    // If a noise preference was saved other than off, ready to play upon user interaction
    if (state.currentSound !== 'off') {
      const resumeOnFirstGesture = () => {
        audio.setSound(state.currentSound);
        window.removeEventListener('click', resumeOnFirstGesture);
      };
      window.addEventListener('click', resumeOnFirstGesture, { once: true });
    }
  }

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
