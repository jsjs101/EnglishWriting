// --- Web Audio API for Typing Sound ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playTypeSound() {
  if (!currentSettings.typingSound) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  // Create a subtle "thwack" sound
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300 + Math.random() * 50, audioCtx.currentTime); 
  
  gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
  
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.05);
}

// --- Default Data ---
const generateId = () => Math.random().toString(36).substr(2, 9);
const defaultSets = [
  {
    id: 'default_set',
    name: 'Default Set (기본)',
    date: new Date().toISOString().split('T')[0],
    sentences: [
      { ko: "사과는 빨갛다.", en: "Apples are red." },
      { ko: "나는 매일 아침 커피를 마신다.", en: "I drink coffee every morning." },
      { ko: "그녀는 피아노 치는 것을 좋아한다.", en: "She likes playing the piano." },
      { ko: "우리는 어제 공원에 갔다.", en: "We went to the park yesterday." },
      { ko: "별들이 밤하늘에서 반짝인다.", en: "The stars are twinkling in the night sky." }
    ]
  }
];

// --- State ---
let sets = [];
let currentSetId = null;
let currentIdx = 0;
let isTestMode = false;
let testAnswers = [];
let isAnimating = false;

let currentSettings = {
  theme: 'light',
  ignoreCase: true,
  ignorePunct: false,
  shuffle: false,
  typingSound: true,
  showErrorFeedback: true,
  displayMode: 'normal', // normal, ko-only, en-only, ko-partial, en-hint
  hintLevel: 1
};

// --- DOM Elements ---
const koreanTextEl = document.getElementById('korean-text');
const typingAreaEl = document.getElementById('typing-area');
const hiddenInputEl = document.getElementById('hidden-input');
const progressTextEl = document.getElementById('progress-text');
const setTitleEl = document.getElementById('set-title');
const prevSentenceEl = document.getElementById('prev-sentence');
const nextSentenceEl = document.getElementById('next-sentence');
const progressBarEl = document.getElementById('progress-bar');
const currentBlockEl = document.getElementById('current-block');

// Modals
const listModal = document.getElementById('list-modal');
const settingsModal = document.getElementById('settings-modal');
const resultModal = document.getElementById('result-modal');
const qrModal = document.getElementById('qr-modal');

// Buttons
const btnPractice = document.getElementById('btn-practice');
const btnTest = document.getElementById('btn-test');

// --- Initialization ---
function init() {
  loadData();
  applySettings();
  setupEventListeners();
  
  if (!currentSetId && sets.length > 0) {
    currentSetId = sets[0].id;
  }
  
  setPracticeMode();
  renderSetsList();
  
  // Check URL import AFTER everything is set up, giving time for CDN scripts to fully initialize
  setTimeout(checkUrlImport, 100);
}

function setPracticeMode() {
  isTestMode = false;
  btnPractice.classList.add('active-mode');
  btnTest.classList.remove('active-mode');
  document.getElementById('quick-display-mode').disabled = false;
  document.getElementById('display-mode').disabled = false;
  loadSentence(0);
}

function setTestMode() {
  isTestMode = true;
  testAnswers = [];
  btnTest.classList.add('active-mode');
  btnPractice.classList.remove('active-mode');
  document.getElementById('quick-display-mode').disabled = true;
  document.getElementById('display-mode').disabled = true;
  loadSentence(0);
}

// --- Data Management ---
function loadData() {
  const savedSets = localStorage.getItem('mem_sets_v2');
  if (savedSets) {
    sets = JSON.parse(savedSets);
  } else {
    sets = [...defaultSets];
    saveSets();
  }

  const savedSetId = localStorage.getItem('mem_current_set_id');
  if (savedSetId && sets.find(s => s.id === savedSetId)) {
    currentSetId = savedSetId;
  }

  const savedSettings = localStorage.getItem('mem_settings_v2');
  if (savedSettings) {
    currentSettings = { ...currentSettings, ...JSON.parse(savedSettings) };
  }
}

function saveSets() {
  localStorage.setItem('mem_sets_v2', JSON.stringify(sets));
}

function saveSettings() {
  localStorage.setItem('mem_settings_v2', JSON.stringify(currentSettings));
  localStorage.setItem('mem_current_set_id', currentSetId);
  applySettings();
}

function getCurrentSet() {
  return sets.find(s => s.id === currentSetId) || sets[0];
}

// --- Core Logic ---
function getSentences() {
  const set = getCurrentSet();
  return set ? set.sentences : [];
}

function loadSentence(idx) {
  if (isAnimating) return;
  
  const sentences = getSentences();
  const set = getCurrentSet();
  
  if (sentences.length === 0) {
    koreanTextEl.textContent = "문장 목록이 비어있습니다.";
    typingAreaEl.innerHTML = '<span class="cursor"></span>';
    hiddenInputEl.value = '';
    progressTextEl.textContent = "0 / 0";
    progressBarEl.style.width = '0%';
    setTitleEl.textContent = set ? set.name : "No Set";
    prevSentenceEl.textContent = '';
    nextSentenceEl.textContent = '';
    return;
  }
  
  if (idx >= sentences.length) idx = 0;
  if (idx < 0) idx = sentences.length - 1;
  
  isAnimating = true;
  
  // Fade out current block
  currentBlockEl.classList.add('fade-out');
  
  setTimeout(() => {
    currentIdx = idx;
    const current = sentences[currentIdx];
    
    setTitleEl.textContent = set.name + (isTestMode ? ' [TEST]' : '');
    progressTextEl.textContent = `${currentIdx + 1} / ${sentences.length}`;
    
    // Progress Bar Update
    const progressPct = ((currentIdx) / sentences.length) * 100;
    progressBarEl.style.width = `${progressPct}%`;
    
    prevSentenceEl.textContent = currentIdx > 0 ? sentences[currentIdx - 1].ko : '';
    nextSentenceEl.textContent = currentIdx < sentences.length - 1 ? sentences[currentIdx + 1].ko : '';
    
    let displayKo = current.ko;
    if (!isTestMode && currentSettings.displayMode === 'ko-partial') {
      displayKo = applyKoPartial(displayKo);
    }
    koreanTextEl.textContent = displayKo;
    
    hiddenInputEl.value = isTestMode ? (testAnswers[currentIdx] || '') : '';
    hiddenInputEl.removeAttribute('maxLength'); 
    
    renderTypingArea();
    
    // Fade in
    currentBlockEl.classList.remove('fade-out');
    currentBlockEl.classList.add('fade-in');
    
    setTimeout(() => {
      currentBlockEl.classList.remove('fade-in');
      isAnimating = false;
      hiddenInputEl.focus();
    }, 100); // small delay to clear transition state
    
  }, 100); // Wait for fade-out
}

function applyKoPartial(text) {
  const words = text.split(' ');
  const maskedWords = words.map(w => {
    if (Math.random() < 0.3 && w.length > 0) {
      return '○'.repeat(w.length);
    }
    return w;
  });
  return maskedWords.join(' ');
}

function isHintChar(targetText, index, level) {
  if (targetText[index] === ' ') return false;
  let wordStart = index;
  while (wordStart > 0 && targetText[wordStart - 1] !== ' ') {
    wordStart--;
  }
  return (index - wordStart) < level;
}

function renderTypingArea() {
  const sentences = getSentences();
  const current = sentences[currentIdx];
  if (!current) return;
  
  const targetText = current.en;
  const typedText = hiddenInputEl.value;
  const mode = isTestMode ? 'ko-only' : currentSettings.displayMode;
  const showError = !isTestMode && currentSettings.showErrorFeedback;
  
  let html = '';
  const maxLength = Math.max(targetText.length, typedText.length);
  
  for (let i = 0; i < maxLength; i++) {
    const targetChar = targetText[i] || ''; 
    const typedChar = typedText[i];
    
    let className = 'letter';
    let displayChar = '';

    if (i === typedText.length) {
      className += ' cursor';
    }

    if (typedChar !== undefined) {
      if (checkCharMatch(typedChar, targetChar)) {
        className += ' correct';
        displayChar = targetChar;
      } else {
        if (showError) {
          className += ' incorrect';
          displayChar = typedChar;
        } else {
          className += ' correct'; // Visual override for no error
          displayChar = typedChar;
        }
      }
    } else {
      if (mode === 'ko-only') {
        if (i === typedText.length) {
           displayChar = ' '; 
        } else {
           continue; 
        }
      } else if (mode === 'en-hint') {
        if (targetChar === ' ') {
          displayChar = ' ';
        } else if (isHintChar(targetText, i, currentSettings.hintLevel)) {
          displayChar = targetChar;
        } else {
          displayChar = '_';
        }
      } else {
        displayChar = targetChar; 
      }
    }
    
    if (displayChar === ' ') displayChar = '&nbsp;';
    html += `<span class="${className}">${displayChar}</span>`;
  }
  
  if (typedText.length === maxLength && !html.includes('cursor')) {
     html += `<span class="cursor"></span>`;
  }
  
  typingAreaEl.innerHTML = html;
  
  if (!isTestMode) {
    if (typedText.length === targetText.length && checkCompletion(typedText, targetText)) {
      setTimeout(() => {
        loadSentence(currentIdx + 1);
      }, 300);
    }
  }
}

function checkCharMatch(typed, target) {
  if (!target) return false; 
  let typeCmp = typed;
  let targetCmp = target;

  // Normalize smart quotes to straight quotes (common on mobile keyboards)
  const normalizeQuotes = (str) => {
    if (!str) return str;
    return str.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  };
  
  typeCmp = normalizeQuotes(typeCmp);
  targetCmp = normalizeQuotes(targetCmp);

  if (currentSettings.ignoreCase) {
    typeCmp = typeCmp.toLowerCase();
    targetCmp = targetCmp.toLowerCase();
  }
  
  if (currentSettings.ignorePunct) {
    const punctRegex = /[.,!?'"()]/g;
    typeCmp = typeCmp.replace(punctRegex, '');
    targetCmp = targetCmp.replace(punctRegex, '');
    if (typeCmp === '' && targetCmp === '') return typed === target; 
  }
  
  return typeCmp === targetCmp;
}

function checkCompletion(typedText, targetText) {
  if (typedText.length !== targetText.length) return false;
  for (let i = 0; i < targetText.length; i++) {
    if (!checkCharMatch(typedText[i], targetText[i])) {
      return false;
    }
  }
  return true;
}

// --- Test Results ---
function showTestResult() {
  // Complete the progress bar since test is done
  progressBarEl.style.width = '100%';
  
  openModal(resultModal);
  const sentences = getSentences();
  let correctCount = 0;
  
  const detailsHtml = sentences.map((s, i) => {
    const userAns = testAnswers[i] || '';
    const isCorrect = checkCompletion(userAns, s.en) && userAns.length === s.en.length;
    if (isCorrect) correctCount++;
    
    return `
      <div class="result-item">
        <div class="ko">${s.ko}</div>
        <div class="answer-row">
          <span class="label">Yours:</span>
          <span class="value ${isCorrect ? 'correct' : 'wrong'}">${userAns || '(Empty)'}</span>
          <span class="status ${isCorrect ? 'pass' : 'fail'}">${isCorrect ? 'O' : 'X'}</span>
        </div>
        ${!isCorrect ? `
        <div class="answer-row">
          <span class="label">Answer:</span>
          <span class="value correct">${s.en}</span>
        </div>
        ` : ''}
      </div>
    `;
  }).join('');
  
  document.getElementById('result-details').innerHTML = detailsHtml;
  const scorePct = Math.round((correctCount / sentences.length) * 100);
  document.getElementById('result-score').textContent = `Score: ${correctCount} / ${sentences.length} (${scorePct}%)`;
}

// --- Event Listeners ---
function setupEventListeners() {
  hiddenInputEl.addEventListener('input', (e) => {
    if (e.inputType !== 'insertCompositionText') {
       playTypeSound();
    }
    renderTypingArea();
  });
  
  document.querySelector('.main-container').addEventListener('click', () => {
    hiddenInputEl.focus();
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
      hiddenInputEl.focus();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      loadSentence(currentIdx);
    }
    if (e.key === 'Enter' && !document.querySelector('.modal.active')) {
      e.preventDefault();
      if (isTestMode) {
        testAnswers[currentIdx] = hiddenInputEl.value;
        if (currentIdx === getSentences().length - 1) {
          showTestResult();
        } else {
          loadSentence(currentIdx + 1);
        }
      } else {
        loadSentence(currentIdx + 1);
      }
    }
  });
  
  document.getElementById('btn-restart').addEventListener('click', () => loadSentence(currentIdx));
  document.getElementById('btn-next').addEventListener('click', () => {
    if (isTestMode) testAnswers[currentIdx] = hiddenInputEl.value;
    loadSentence(currentIdx + 1);
  });
  
  btnPractice.addEventListener('click', () => {
    closeAllModals();
    setPracticeMode();
  });
  
  btnTest.addEventListener('click', () => {
    closeAllModals();
    setTestMode();
  });
  
  document.getElementById('btn-list').addEventListener('click', () => {
    renderSetsList();
    renderSentenceList();
    openModal(listModal);
  });
  
  document.getElementById('btn-settings').addEventListener('click', () => {
    syncSettingsUI();
    openModal(settingsModal);
  });
  
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      closeAllModals();
      hiddenInputEl.focus();
    });
  });
  
  // Result Modals Buttons
  document.getElementById('btn-copy-link').addEventListener('click', () => {
    const code = currentShareCode;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('btn-copy-link');
      const original = btn.textContent;
      btn.textContent = 'Copied! ✓';
      setTimeout(() => { btn.textContent = original; }, 2000);
    }).catch(() => {
      // Fallback: select the textarea so user can copy manually
      const ta = document.getElementById('qr-share-code');
      if (ta) { ta.select(); ta.setSelectionRange(0, 99999); }
    });
  });

  document.getElementById('btn-import-code').addEventListener('click', () => {
    const code = document.getElementById('import-code-input').value;
    const success = importFromCode(code);
    if (success) {
      document.getElementById('import-code-input').value = '';
    }
  });

  document.getElementById('btn-web-share').addEventListener('click', () => {
    if (!navigator.share || !currentShareCode) return;
    navigator.share({
      title: '\uc601\uc791 \uc138\ud2b8 \uacf5\uc720',
      text: `\uc601\uc791 \ubb38\uc7a5 \uc138\ud2b8\ub97c \uacf5\uc720\ud569\ub2c8\ub2e4!\n\n[\ubc1b\ub294 \ubc29\ubc95]\n1. \uc601\uc791 \uc571 \uc5f4\uae30\n2. Sets & Sentences \ud074\ub9ad\n3. "Import from QR Code" \uc5d0 \uc544\ub798 \ucf54\ub4dc \ubd99\uc5ec\ub123\uae30\n4. Import Set \ud074\ub9ad\n\n\ucf54\ub4dc:\n${currentShareCode}`
    }).catch(() => {});
  });


  document.getElementById('btn-save-result').addEventListener('click', () => {
    alert("테스트 결과가 저장되었습니다. (추후 기록 뷰에 연동)");
  });

  
  document.getElementById('btn-retry-test').addEventListener('click', () => {
    closeAllModals();
    setTestMode();
  });
  
  document.getElementById('btn-result-practice').addEventListener('click', () => {
    closeAllModals();
    setPracticeMode();
  });
  
  // Sets & Sentences Management
  document.getElementById('btn-add-sentence').addEventListener('click', () => {
    const koInput = document.getElementById('new-ko');
    const enInput = document.getElementById('new-en');
    const koText = koInput.value.trim();
    const enText = enInput.value.trim();
    
    if (koText && enText) {
      const set = getCurrentSet();
      if (set) {
        set.sentences.push({ ko: koText, en: enText });
        saveSets();
        renderSentenceList();
        loadSentence(currentIdx); 
        koInput.value = '';
        enInput.value = '';
      }
    }
  });
  
  document.getElementById('btn-upload-set').addEventListener('click', handleSetUpload);
  
  // Settings Management
  const bindToggle = (id, key) => {
    document.getElementById(id).addEventListener('change', (e) => {
      currentSettings[key] = e.target.checked;
      saveSettings();
      if (key === 'shuffle') {
        loadSentence(0);
      } else {
        renderTypingArea();
      }
    });
  };
  
  bindToggle('theme-toggle', 'theme');
  bindToggle('ignore-case', 'ignoreCase');
  bindToggle('ignore-punct', 'ignorePunct');
  bindToggle('shuffle-mode', 'shuffle');
  bindToggle('typing-sound', 'typingSound');
  bindToggle('show-error-feedback', 'showErrorFeedback');
  
  document.getElementById('display-mode').addEventListener('change', (e) => {
    currentSettings.displayMode = e.target.value;
    document.getElementById('quick-display-mode').value = e.target.value;
    saveSettings();
    syncSettingsUI();
    loadSentence(currentIdx);
  });
  
  document.getElementById('quick-display-mode').addEventListener('change', (e) => {
    currentSettings.displayMode = e.target.value;
    saveSettings();
    syncSettingsUI();
    loadSentence(currentIdx);
  });
  
  document.getElementById('hint-level').addEventListener('input', (e) => {
    const val = parseInt(e.target.value) || 1;
    document.getElementById('hint-level-val').textContent = val;
    currentSettings.hintLevel = val;
    saveSettings();
    renderTypingArea();
  });
}

// --- Upload Logic ---
async function handleSetUpload() {
  const nameInput = document.getElementById('new-set-name');
  const fileKo = document.getElementById('file-ko').files[0];
  const fileEn = document.getElementById('file-en').files[0];
  
  if (!fileKo || !fileEn) {
    alert("한국어와 영어 텍스트 파일을 모두 업로드해주세요.");
    return;
  }
  
  let setName = nameInput.value.trim() || `New Set (${new Date().toLocaleDateString()})`;
  
  const koText = await fileKo.text();
  const enText = await fileEn.text();
  
  const koLines = koText.split('\n').map(l => l.trim()).filter(l => l);
  const enLines = enText.split('\n').map(l => l.trim()).filter(l => l);
  
  const minLen = Math.min(koLines.length, enLines.length);
  if (minLen === 0) {
    alert("파일에 문장이 없습니다.");
    return;
  }
  
  const newSentences = [];
  for (let i = 0; i < minLen; i++) {
    newSentences.push({ ko: koLines[i], en: enLines[i] });
  }
  
  const newSet = {
    id: generateId(),
    name: setName,
    date: new Date().toISOString().split('T')[0],
    sentences: newSentences
  };
  
  sets.push(newSet);
  currentSetId = newSet.id;
  saveSets();
  
  nameInput.value = '';
  document.getElementById('file-ko').value = '';
  document.getElementById('file-en').value = '';
  
  renderSetsList();
  renderSentenceList();
  loadSentence(0);
}

// --- Modals UI Helpers ---
function openModal(modal) {
  closeAllModals();
  modal.classList.add('active');
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function renderSetsList() {
  const ul = document.getElementById('set-list-ul');
  ul.innerHTML = '';
  
  sets.forEach(set => {
    const li = document.createElement('li');
    if (set.id === currentSetId) li.classList.add('active');
    
    li.innerHTML = `
      <div class="set-info">
        <span class="set-name">${set.name}</span>
        <span class="set-date">${set.date} (${set.sentences.length} sentences)</span>
      </div>
      <div class="set-actions">
        <button class="share-btn" data-id="${set.id}" title="Share via QR">QR</button>
        <button class="delete-btn" data-id="${set.id}" title="Delete Set">&times;</button>
      </div>
    `;
    
    li.querySelector('.set-info').addEventListener('click', () => {
      currentSetId = set.id;
      saveSettings();
      renderSetsList();
      renderSentenceList();
      loadSentence(0);
    });

    li.querySelector('.share-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openQrModal(set);
    });
    
    li.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`'${set.name}' 세트를 삭제하시겠습니까?`)) {
        sets = sets.filter(s => s.id !== set.id);
        if (currentSetId === set.id) {
          currentSetId = sets.length > 0 ? sets[0].id : null;
        }
        saveSets();
        renderSetsList();
        renderSentenceList();
        loadSentence(0);
      }
    });
    
    ul.appendChild(li);
  });
}

// --- QR Code Share Logic ---
let currentShareCode = '';

// Guard: returns true only if LZString library is loaded
function isLZStringReady() {
  return typeof LZString !== 'undefined';
}

function openQrModal(set) {
  if (!isLZStringReady()) {
    alert('공유 기능을 위한 라이브러리가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.');
    return;
  }

  const lines = [set.name];
  set.sentences.forEach(s => lines.push(`${s.ko}|||${s.en}`));
  currentShareCode = LZString.compressToBase64(lines.join('\n'));

  document.getElementById('qr-set-name').textContent = `"${set.name}" (${set.sentences.length}개 문장)`;
  document.getElementById('qr-share-code').value = currentShareCode;

  const container = document.getElementById('qr-code-container');
  const notice = document.getElementById('qr-size-notice');
  const webShareBtn = document.getElementById('btn-web-share');
  container.innerHTML = '';

  // QR codes become too dense to scan reliably above ~350 chars at 300x300px
  const QR_CHAR_LIMIT = 350;

  if (currentShareCode.length <= QR_CHAR_LIMIT) {
    notice.style.display = 'none';
    container.style.display = 'flex';
    new QRCode(container, {
      text: currentShareCode,
      width: 300,
      height: 300,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.L
    });
  } else {
    container.style.display = 'none';
    notice.style.display = 'block';
    notice.textContent = `현재 세트가 너무 커서 (${set.sentences.length}개 문장) QR 코드로 만듄 수 없습니다.\n아래 코드를 복사해서 카특/메시지로 공유하세요.`;
  }

  // Show Web Share button only when the browser API is available (most mobile browsers)
  webShareBtn.style.display = navigator.share ? 'block' : 'none';

  openModal(qrModal);
}

function importFromCode(code) {
  if (!code || !code.trim()) {
    alert('코드를 입력해주세요.');
    return;
  }
  if (!isLZStringReady()) {
    alert('가져오기 기능을 위한 라이브러리가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  try {
    const raw = code.trim();

    // Try new compact Base64 format first, then fall back to old URI-encoded JSON
    let name, sentences;
    const decompressedB64 = LZString.decompressFromBase64(raw);

    if (decompressedB64 && decompressedB64.includes('|||')) {
      // --- New compact format ---
      const lines = decompressedB64.split('\n');
      name = lines[0].trim();
      sentences = lines.slice(1)
        .map(line => {
          const idx = line.indexOf('|||');
          if (idx === -1) return null;
          return { ko: line.slice(0, idx).trim(), en: line.slice(idx + 3).trim() };
        })
        .filter(s => s && s.ko && s.en);
    } else {
      // --- Fallback: old JSON format ---
      const decompressedUri = LZString.decompressFromEncodedURIComponent(raw);
      if (!decompressedUri) throw new Error('Decompression failed - invalid code');
      const parsed = JSON.parse(decompressedUri);
      name = parsed.name;
      sentences = parsed.sentences;
    }

    if (!name || !Array.isArray(sentences) || sentences.length === 0) {
      throw new Error('Invalid set structure');
    }

    // Check for duplicate
    const isDuplicate = sets.some(s => s.name === name && s.sentences.length === sentences.length);
    if (isDuplicate) {
      alert(`"${name}" 세트는 이미 존재합니다.`);
      return;
    }

    const newSet = {
      id: generateId(),
      name,
      date: new Date().toISOString().split('T')[0],
      sentences
    };

    sets.push(newSet);
    currentSetId = newSet.id;
    saveSets();
    renderSetsList();
    renderSentenceList();
    loadSentence(0);

    alert(`✅ "${newSet.name}" 세트가 성공적으로 추가되었습니다! (${newSet.sentences.length}개 문장)`);
    return true;
  } catch (err) {
    console.error('Import failed:', err);
    alert('가져오기 실패: 코드가 올바르지 않습니다.');
    return false;
  }
}

function checkUrlImport() {
  // URL-based import: works when app is hosted on a web server.
  // The QR code now encodes pure data, but we still support the ?import= URL param
  // for hosted deployments that generate URL-based QR codes.
  if (!isLZStringReady()) return;

  const params = new URLSearchParams(window.location.search);
  const importData = params.get('import');
  if (!importData) return;

  // Clean URL immediately
  history.replaceState({}, '', window.location.pathname);

  const success = importFromCode(importData);
  if (success) {
    setTimeout(() => {
      renderSetsList();
      renderSentenceList();
    }, 100);
  }
}

function renderSentenceList() {
  const ul = document.getElementById('sentence-list-ul');
  const header = document.getElementById('current-set-header');
  ul.innerHTML = '';
  
  const set = getCurrentSet();
  if (!set) {
    header.textContent = "No Set Selected";
    return;
  }
  
  header.textContent = `Sentences in '${set.name}'`;
  
  set.sentences.forEach((sentence, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="texts">
        <div class="ko">${sentence.ko}</div>
        <div class="en">${sentence.en}</div>
      </div>
      <button class="delete-btn" data-index="${index}">&times;</button>
    `;
    
    li.querySelector('.delete-btn').addEventListener('click', () => {
      set.sentences.splice(index, 1);
      saveSets();
      renderSentenceList();
      if (currentIdx >= set.sentences.length) currentIdx = Math.max(0, set.sentences.length - 1);
      loadSentence(currentIdx);
    });
    ul.appendChild(li);
  });
}

function syncSettingsUI() {
  document.getElementById('theme-toggle').checked = currentSettings.theme === 'dark';
  document.getElementById('ignore-case').checked = currentSettings.ignoreCase;
  document.getElementById('ignore-punct').checked = currentSettings.ignorePunct;
  document.getElementById('shuffle-mode').checked = currentSettings.shuffle;
  document.getElementById('typing-sound').checked = currentSettings.typingSound;
  document.getElementById('show-error-feedback').checked = currentSettings.showErrorFeedback;
  
  document.getElementById('display-mode').value = currentSettings.displayMode;
  document.getElementById('quick-display-mode').value = currentSettings.displayMode;
  document.getElementById('hint-level').value = currentSettings.hintLevel;
  document.getElementById('hint-level-val').textContent = currentSettings.hintLevel;
  
  const hintRow = document.getElementById('hint-config-row');
  if (currentSettings.displayMode === 'en-hint') {
    hintRow.style.display = 'flex';
  } else {
    hintRow.style.display = 'none';
  }
}

function applySettings() {
  if (currentSettings.theme === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
  } else {
    document.body.removeAttribute('data-theme');
  }
  document.body.setAttribute('data-mode', isTestMode ? 'ko-only' : currentSettings.displayMode);
}

// Start
init();
