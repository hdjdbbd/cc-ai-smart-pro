/* ==========================================================================
   CC AI SMART PRO - Client Application Engine
   ========================================================================== */

// --- 1. STATE & STORAGE ---
const STATE = {
  language: 'Hindi', // Default
  langCode: 'hi-IN',
  isSpeaking: false,
  isListening: false,
  isMuted: false,
  textOnly: false,
  speechRate: 1.0,
  speechPitch: 1.0,
  selectedVoice: null,
  lastAIAnswer: '',
  wallet: {
    cash: 1000000.00,
    positions: [],
    history: []
  }
};

const LANG_CONFIG = {
  'Hindi': { code: 'hi-IN', label: 'HI', promptName: 'हिन्दी' },
  'Hinglish': { code: 'hi-IN', label: 'HING', promptName: 'Hinglish (Hindi written in Roman or Devanagari mix)' },
  'English': { code: 'en-IN', label: 'EN', promptName: 'Indian English' },
  'Bengali': { code: 'bn-IN', label: 'BN', promptName: 'Bengali' },
  'Bhojpuri': { code: 'hi-IN', label: 'BHOJ', promptName: 'Bhojpuri dialect' },
  'Marathi': { code: 'mr-IN', label: 'MR', promptName: 'Marathi' },
  'Tamil': { code: 'ta-IN', label: 'TA', promptName: 'Tamil' },
  'Telugu': { code: 'te-IN', label: 'TE', promptName: 'Telugu' }
};

// Initialize Storage
function loadStorage() {
  const savedWallet = localStorage.getItem('cc_ai_wallet');
  if (savedWallet) {
    try {
      STATE.wallet = JSON.parse(savedWallet);
    } catch (e) {
      console.error('Error parsing wallet storage', e);
    }
  }

  const savedLang = localStorage.getItem('cc_ai_lang');
  if (savedLang && LANG_CONFIG[savedLang]) {
    STATE.language = savedLang;
    STATE.langCode = LANG_CONFIG[savedLang].code;
  }

  const savedTextOnly = localStorage.getItem('cc_ai_textonly');
  if (savedTextOnly) {
    STATE.textOnly = savedTextOnly === 'true';
    document.getElementById('textOnlyToggle').checked = STATE.textOnly;
  }
}

function saveStorage() {
  localStorage.setItem('cc_ai_wallet', JSON.stringify(STATE.wallet));
  localStorage.setItem('cc_ai_lang', STATE.language);
  localStorage.setItem('cc_ai_textonly', STATE.textOnly);
}

// --- 2. VOICE RECOGNITION (STT) & SYNTHESIS (TTS) ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let recognition = null;
let synth = window.speechSynthesis;
let availableVoices = [];

function initSpeechRecognition() {
  if (!SpeechRecognition) {
    console.warn('SpeechRecognition API is not supported on this browser.');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = STATE.langCode;

  recognition.onstart = () => {
    STATE.isListening = true;
    updateVoiceUI('listening', 'सुन रहा हूँ... बोलिए');
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    const currentText = finalTranscript || interimTranscript;
    document.getElementById('speechInterim').innerText = `"${currentText}"`;

    if (finalTranscript.trim().length > 0) {
      handleUserVoiceQuery(finalTranscript.trim());
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    STATE.isListening = false;
    let errMessage = 'माइक्रोफ़ोन त्रुटि: ' + event.error;
    if (event.error === 'not-allowed') {
      errMessage = 'माइक अनुमति अस्वीकार कर दी गई। कृपया ब्राउज़र सेटिंग्स में अनुमति दें।';
    }
    updateVoiceUI('idle', errMessage);
  };

  recognition.onend = () => {
    STATE.isListening = false;
    if (!STATE.isSpeaking) {
      updateVoiceUI('idle', 'माइक दबाकर फिर से बोलें');
    }
  };
}

function startListening() {
  if (!recognition) {
    alert('आपके ब्राउज़र में SpeechRecognition समर्थित नहीं है। कृपया Google Chrome का उपयोग करें।');
    return;
  }
  if (STATE.isSpeaking) stopSpeaking();

  try {
    recognition.lang = STATE.langCode;
    recognition.start();
  } catch (err) {
    console.warn('Recognition start caught error:', err);
    recognition.stop();
  }
}

function stopListening() {
  if (recognition && STATE.isListening) {
    recognition.stop();
  }
}

// Populate & Filter Voices (Prioritize Hindi Female Voice)
function populateVoices() {
  if (!synth) return;
  availableVoices = synth.getVoices();
  const voiceSelect = document.getElementById('settingVoiceSelect');
  const voiceNotice = document.getElementById('voiceNotice');
  if (!voiceSelect) return;

  voiceSelect.innerHTML = '';

  let femaleHindiFound = false;
  let preferredVoice = null;

  availableVoices.forEach((voice, index) => {
    const opt = document.createElement('option');
    opt.value = index;
    opt.textContent = `${voice.name} (${voice.lang}) ${voice.default ? ' [डिफ़ॉल्ट]' : ''}`;

    // Detection logic for Hindi Female voice
    const isHindi = voice.lang.includes('hi') || voice.lang.includes('HI');
    const isFemaleName = /(swara|kalpana|geeta|female|aditi|priya|zira)/i.test(voice.name);

    if (isHindi && isFemaleName && !preferredVoice) {
      preferredVoice = voice;
      femaleHindiFound = true;
      opt.textContent += ' ⭐ (Female Hindi)';
    }

    voiceSelect.appendChild(opt);
  });

  // Fallback to any Hindi voice if female is absent
  if (!preferredVoice) {
    preferredVoice = availableVoices.find(v => v.lang.includes('hi') || v.lang.includes('HI'));
  }

  // Fallback to default or Indian English voice
  if (!preferredVoice) {
    preferredVoice = availableVoices.find(v => v.lang.includes('en-IN') || v.default) || availableVoices[0];
  }

  if (preferredVoice) {
    STATE.selectedVoice = preferredVoice;
    const idx = availableVoices.indexOf(preferredVoice);
    if (idx !== -1) voiceSelect.value = idx;
  }

  if (!femaleHindiFound) {
    voiceNotice.textContent = 'सूचना: आपके डिवाइस पर समर्पित फ़ीमेल हिंदी आवाज़ मौजूद नहीं है। उपलब्ध सर्वोत्तम आवाज़ का उपयोग किया जा रहा है।';
  } else {
    voiceNotice.textContent = 'सर्वोत्तम फ़ीमेल हिंदी आवाज़ सक्रिय है।';
  }
}

if (synth) {
  populateVoices();
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = populateVoices;
  }
}

function speakText(text) {
  if (STATE.isMuted || STATE.textOnly || !synth) return;

  stopSpeaking();

  // Strip excessive markdown asterisks for voice cleanliness
  const cleanSpoken = text.replace(/[*#_`]/g, '');

  const utterance = new SpeechSynthesisUtterance(cleanSpoken);
  utterance.lang = STATE.langCode;
  utterance.rate = STATE.speechRate;
  utterance.pitch = STATE.speechPitch;

  if (STATE.selectedVoice) {
    utterance.voice = STATE.selectedVoice;
  }

  utterance.onstart = () => {
    STATE.isSpeaking = true;
    updateVoiceUI('speaking', 'AI बोल रहा है...');
  };

  utterance.onend = () => {
    STATE.isSpeaking = false;
    updateVoiceUI('idle', 'सुनने के लिए माइक दबाएं');
  };

  utterance.onerror = (err) => {
    console.error('Speech synthesis error:', err);
    STATE.isSpeaking = false;
    updateVoiceUI('idle', 'तैयार');
  };

  synth.speak(utterance);
}

function stopSpeaking() {
  if (synth && (synth.speaking || synth.pending)) {
    synth.cancel();
  }
  STATE.isSpeaking = false;
  updateVoiceUI('idle', 'तैयार');
}

function updateVoiceUI(status, label) {
  const pill = document.getElementById('voiceStatusPill');
  const ring = document.getElementById('pulseRing');

  if (pill) {
    pill.className = `status-pill ${status}`;
    pill.innerText = label;
  }

  if (ring) {
    if (status === 'listening' || status === 'speaking') {
      ring.classList.add('active');
    } else {
      ring.classList.remove('active');
    }
  }
}

// --- 3. BACKEND API CLIENT ---
async function callGeminiChatAPI(userText, mode = 'Assistant', context = null) {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userText,
        language: STATE.language,
        mode: mode,
        context: context
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.reply || data.error || 'Server request failed');
    }
    return data.reply;
  } catch (err) {
    console.error('API Error:', err);
    return `त्रुटि: ${err.message || 'AI सर्वर से संपर्क नहीं हो पाया।'}`;
  }
}

// --- 4. VOICE ASSISTANT FLOW ---
async function handleUserVoiceQuery(spokenText) {
  updateVoiceUI('processing', 'सोच रहा हूँ...');
  appendChatMessage(spokenText, 'user');

  const reply = await callGeminiChatAPI(spokenText, 'Voice Conversation');
  
  STATE.lastAIAnswer = reply;
  document.getElementById('voiceAnswerText').innerText = reply;
  appendChatMessage(reply, 'ai');

  speakText(reply);
}

// --- 5. TEXT CHAT FLOW ---
function appendChatMessage(text, sender = 'ai') {
  const feed = document.getElementById('chatMessages');
  if (!feed) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `msg ${sender}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerText = text;
  msgDiv.appendChild(bubble);

  if (sender === 'ai') {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    const ttsBtn = document.createElement('button');
    ttsBtn.innerText = '🔊';
    ttsBtn.title = 'सुने';
    ttsBtn.onclick = () => speakText(text);

    const copyBtn = document.createElement('button');
    copyBtn.innerText = '📋';
    copyBtn.title = 'कॉपी करें';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(text);
      copyBtn.innerText = '✓';
      setTimeout(() => copyBtn.innerText = '📋', 1500);
    };

    meta.appendChild(ttsBtn);
    meta.appendChild(copyBtn);
    msgDiv.appendChild(meta);
  }

  feed.appendChild(msgDiv);
  feed.scrollTop = feed.scrollHeight;
}

// --- 6. TRADING ASSISTANT (Technical OHLC Engine) ---
let selectedAsset = 'NIFTY50';
let selectedHorizon = 'INTRADAY';

function calculateTechnicalIndicators(O, H, L, C) {
  // Classical Floor Pivot Points
  const PP = (H + L + C) / 3;
  const R1 = (2 * PP) - L;
  const S1 = (2 * PP) - H;
  const R2 = PP + (H - L);
  const S2 = PP - (H - L);

  // Price Action / Candle Dynamics
  const range = H - L;
  const body = Math.abs(C - O);
  const isBullishCandle = C > O;
  const closePosition = range > 0 ? ((C - L) / range) * 100 : 50;

  let signal = 'WAIT';
  let reasoning = '';
  let sl = 0;
  let target = 0;

  if (C > PP && closePosition > 65) {
    signal = 'BUY';
    sl = Math.min(L, S1);
    target = R1;
    reasoning = `मूल्य पाइवॉट पॉइंट (${PP.toFixed(2)}) के ऊपर और कैंडल की ऊपरी रेंज में बंद हुआ है। बुलिश मोमेंटम सक्रिय है।`;
  } else if (C < PP && closePosition < 35) {
    signal = 'SELL';
    sl = Math.max(H, R1);
    target = S1;
    reasoning = `मूल्य पाइवॉट पॉइंट (${PP.toFixed(2)}) के नीचे कमजोर स्थिति में है। बेयरिश दबाव देखा जा रहा है।`;
  } else {
    signal = 'WAIT';
    sl = S1;
    target = R1;
    reasoning = `बाजार एक सीमित दायरे (Sideways/Range-bound) में है। निर्णायक ब्रेकआउट या सपोर्ट रीटेस्ट की प्रतीक्षा करें।`;
  }

  return { PP, R1, S1, R2, S2, signal, reasoning, sl, target };
}

// --- 7. PAPER TRADING ENGINE (Accurate Formulas) ---
/*
  FORMULAS IMPLEMENTED:
  BUY gross P&L  = (exit price - entry price) * quantity
  SELL gross P&L = (entry price - exit price) * quantity
  Net P&L        = gross P&L - transaction costs
*/

function updateWalletUI() {
  document.getElementById('homeBalance').innerText = `₹${STATE.wallet.cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  document.getElementById('paperCash').innerText = `₹${STATE.wallet.cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  document.getElementById('homeOpenPositions').innerText = STATE.wallet.positions.length;

  // Calculate Net P&L of closed trades
  const netHistoricalPnL = STATE.wallet.history.reduce((acc, trade) => acc + trade.netPnL, 0);
  const pnlElem = document.getElementById('paperTotalPnL');
  pnlElem.innerText = `₹${netHistoricalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  pnlElem.className = netHistoricalPnL > 0 ? 'profit' : netHistoricalPnL < 0 ? 'loss' : 'neutral';

  renderPositions();
  renderHistory();
  saveStorage();
}

function renderPositions() {
  const container = document.getElementById('positionsList');
  if (!container) return;

  if (STATE.wallet.positions.length === 0) {
    container.innerHTML = '<p class="empty-state">कोई ओपन पोजीशन नहीं है।</p>';
    return;
  }

  container.innerHTML = '';
  STATE.wallet.positions.forEach((pos, idx) => {
    const row = document.createElement('div');
    row.className = 'table-row';
    row.innerHTML = `
      <div class="pos-info">
        <b>${pos.symbol} [${pos.type}]</b>
        <span>प्रवेश: ₹${pos.entryPrice.toFixed(2)} | मात्रा: ${pos.quantity}</span>
        <span>लागत: ₹${(pos.entryPrice * pos.quantity).toFixed(2)}</span>
      </div>
      <div>
        <button class="mini-btn danger" onclick="closePosition(${idx})">एग्जिट (Exit)</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function renderHistory() {
  const container = document.getElementById('tradeHistoryList');
  if (!container) return;

  if (STATE.wallet.history.length === 0) {
    container.innerHTML = '<p class="empty-state">कोई समाप्त ट्रेड दर्ज नहीं है।</p>';
    return;
  }

  container.innerHTML = '';
  STATE.wallet.history.slice(-15).reverse().forEach((trade) => {
    const row = document.createElement('div');
    row.className = 'table-row';
    const isProfitable = trade.netPnL >= 0;
    row.innerHTML = `
      <div class="pos-info">
        <b>${trade.symbol} (${trade.type})</b>
        <span>Entry: ₹${trade.entryPrice} | Exit: ₹${trade.exitPrice} | Qty: ${trade.quantity}</span>
        <span>सकल (Gross): ₹${trade.grossPnL.toFixed(2)} | शुल्क: ₹${trade.costs.toFixed(2)}</span>
      </div>
      <div style="text-align: right;">
        <b class="${isProfitable ? 'profit' : 'loss'}">
          ${isProfitable ? '+' : ''}₹${trade.netPnL.toFixed(2)}
        </b>
      </div>
    `;
    container.appendChild(row);
  });
}

function executeOrder(symbol, type, entryPrice, quantity, transactionCosts = 0) {
  if (entryPrice <= 0 || quantity <= 0) {
    alert('कृपया मान्य मूल्य और धनात्मक मात्रा दर्ज करें।');
    return false;
  }

  const requiredMargin = entryPrice * quantity;
  if (type === 'BUY' && STATE.wallet.cash < (requiredMargin + transactionCosts)) {
    alert(`अपर्याप्त वर्चुअल बैलेंस! आवश्यक: ₹${(requiredMargin + transactionCosts).toFixed(2)}, उपलब्ध: ₹${STATE.wallet.cash.toFixed(2)}`);
    return false;
  }

  // Deduct margin on BUY
  if (type === 'BUY') {
    STATE.wallet.cash -= (requiredMargin + transactionCosts);
  }

  STATE.wallet.positions.push({
    id: Date.now(),
    symbol,
    type,
    entryPrice,
    quantity,
    costs: transactionCosts,
    timestamp: new Date().toLocaleTimeString()
  });

  updateWalletUI();
  return true;
}

window.closePosition = function(index) {
  const pos = STATE.wallet.positions[index];
  if (!pos) return;

  const currentPriceInput = prompt(`'${pos.symbol}' का एग्जिट मूल्य दर्ज करें:`, pos.entryPrice);
  if (!currentPriceInput) return;

  const exitPrice = parseFloat(currentPriceInput);
  if (isNaN(exitPrice) || exitPrice <= 0) {
    alert('अमान्य एग्जिट मूल्य दर्ज किया गया!');
    return;
  }

  let grossPnL = 0;
  if (pos.type === 'BUY') {
    // BUY gross P&L = (exit price - entry price) * quantity
    grossPnL = (exitPrice - pos.entryPrice) * pos.quantity;
    // Return margin + gross PnL
    STATE.wallet.cash += (pos.entryPrice * pos.quantity) + grossPnL;
  } else if (pos.type === 'SELL') {
    // SELL gross P&L = (entry price - exit price) * quantity
    grossPnL = (pos.entryPrice - exitPrice) * pos.quantity;
    STATE.wallet.cash += grossPnL;
  }

  // Net P&L = gross P&L - transaction costs (strictly once)
  const netPnL = grossPnL - pos.costs;

  STATE.wallet.history.push({
    symbol: pos.symbol,
    type: pos.type,
    entryPrice: pos.entryPrice,
    exitPrice: exitPrice,
    quantity: pos.quantity,
    costs: pos.costs,
    grossPnL: grossPnL,
    netPnL: netPnL,
    closedAt: new Date().toLocaleTimeString()
  });

  // Remove from open positions
  STATE.wallet.positions.splice(index, 1);
  updateWalletUI();

  alert(`ट्रेड समाप्त!\nसकल P&L: ₹${grossPnL.toFixed(2)}\nशुल्क: ₹${pos.costs.toFixed(2)}\nनेट P&L: ₹${netPnL.toFixed(2)}`);
};

// --- 8. EVENT LISTENERS & SETUP ---
function setupEventListeners() {
  // Tab Navigation
  const navTabs = document.querySelectorAll('.nav-tab');
  const viewPanels = document.querySelectorAll('.view-panel');

  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      navTabs.forEach(t => t.classList.remove('active'));
      viewPanels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // Home Hero Quick Button
  document.getElementById('heroStartVoice').addEventListener('click', () => {
    const voiceTab = document.querySelector('.nav-tab[data-tab="tab-voice"]');
    if (voiceTab) voiceTab.click();
    startListening();
  });

  // Action chips on home
  document.querySelectorAll('.action-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      const chatTab = document.querySelector('.nav-tab[data-tab="tab-chat"]');
      if (chatTab) chatTab.click();
      document.getElementById('chatInput').value = prompt;
      document.getElementById('sendBtn').click();
    });
  });

  // Main Voice Mic Toggle
  const micBtn = document.getElementById('mainMicBtn');
  micBtn.addEventListener('click', () => {
    if (STATE.isListening) {
      stopListening();
    } else {
      startListening();
    }
  });

  // Voice Controls
  document.getElementById('stopSpeakBtn').addEventListener('click', stopSpeaking);

  document.getElementById('repeatAnswerBtn').addEventListener('click', () => {
    if (STATE.lastAIAnswer) {
      speakText(STATE.lastAIAnswer);
    } else {
      speakText('अभी दोहराने के लिए कोई उत्तर उपलब्ध नहीं है।');
    }
  });

  document.getElementById('voiceLangToggle').addEventListener('click', () => {
    const settingsTab = document.querySelector('.nav-tab[data-tab="tab-settings"]');
    if (settingsTab) settingsTab.click();
  });

  document.getElementById('voiceAnswerCopy').addEventListener('click', () => {
    const text = document.getElementById('voiceAnswerText').innerText;
    navigator.clipboard.writeText(text);
    alert('उत्तर कॉपी हो गया!');
  });

  // Top Mute Button
  const muteBtn = document.getElementById('quickMuteBtn');
  muteBtn.addEventListener('click', () => {
    STATE.isMuted = !STATE.isMuted;
    muteBtn.innerText = STATE.isMuted ? '🔇' : '🔊';
    if (STATE.isMuted) stopSpeaking();
  });

  // Text Chat Submit
  const chatForm = document.getElementById('chatForm');
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    input.value = '';
    appendChatMessage(msg, 'user');

    const reply = await callGeminiChatAPI(msg, 'Text Chat Conversation');
    appendChatMessage(reply, 'ai');
    STATE.lastAIAnswer = reply;

    if (!STATE.textOnly) {
      speakText(reply);
    }
  });

  // Trading Segments (Asset & Horizon)
  document.querySelectorAll('[data-asset]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-asset]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAsset = btn.getAttribute('data-asset');
    });
  });

  document.querySelectorAll('[data-horizon]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-horizon]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedHorizon = btn.getAttribute('data-horizon');
    });
  });

  // OHLC Analyze Button
  document.getElementById('analyzeOHLCBtn').addEventListener('click', async () => {
    const O = parseFloat(document.getElementById('ohlcOpen').value);
    const H = parseFloat(document.getElementById('ohlcHigh').value);
    const L = parseFloat(document.getElementById('ohlcLow').value);
    const C = parseFloat(document.getElementById('ohlcClose').value);

    if (isNaN(O) || isNaN(H) || isNaN(L) || isNaN(C)) {
      alert('कृपया Open, High, Low, और Close सभी मान्य संख्याएं दर्ज करें।');
      return;
    }

    if (H < L || H < O || H < C || L > O || L > C) {
      alert('अमान्य डेटा! High हमेशा सबसे बड़ा और Low सबसे छोटा होना चाहिए।');
      return;
    }

    const tech = calculateTechnicalIndicators(O, H, L, C);

    // Show result card
    const card = document.getElementById('tradingSignalCard');
    card.classList.remove('hidden');

    const badge = document.getElementById('signalBadge');
    badge.className = `signal-badge ${tech.signal.toLowerCase()}`;
    badge.innerText = `${tech.signal} (${selectedAsset} - ${selectedHorizon})`;

    document.getElementById('valPP').innerText = `₹${tech.PP.toFixed(2)}`;
    document.getElementById('valR1').innerText = `₹${tech.R1.toFixed(2)}`;
    document.getElementById('valS1').innerText = `₹${tech.S1.toFixed(2)}`;
    document.getElementById('valSL').innerText = `₹${tech.sl.toFixed(2)}`;
    document.getElementById('valTarget').innerText = `₹${tech.target.toFixed(2)}`;
    document.getElementById('analysisReasonText').innerText = 'AI से विस्तृत तकनीकी रिपोर्ट तैयार हो रही है...';

    // Enrich with Gemini AI validation
    const prompt = `विश्लेषण करें: ${selectedAsset} (${selectedHorizon}). दिए गए मैनुअल डेटा: Open=${O}, High=${H}, Low=${L}, Close=${C}, Pivot=${tech.PP.toFixed(2)}, R1=${tech.R1.toFixed(2)}, S1=${tech.S1.toFixed(2)}. सिग्नल=${tech.signal}. संक्षिप्त और सटीक ट्रेडिंग दृष्टिकोण दें।`;
    const aiInsight = await callGeminiChatAPI(prompt, 'Trading Technical Analysis');
    
    document.getElementById('analysisReasonText').innerText = `${tech.reasoning}\n\n[CC AI Insights]: ${aiInsight}`;
  });

  // Paper Trade Form Submit
  document.getElementById('orderForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const symbol = document.getElementById('tradeSymbol').value;
    const type = document.getElementById('tradeType').value;
    const price = parseFloat(document.getElementById('tradePrice').value);
    const qty = parseInt(document.getElementById('tradeQty').value, 10);
    const costs = parseFloat(document.getElementById('tradeCost').value) || 0;

    const ok = executeOrder(symbol, type, price, qty, costs);
    if (ok) {
      alert(`सफलतापूर्वक आर्डर निष्पादित: ${type} ${qty} ${symbol} @ ₹${price}`);
      document.getElementById('tradePrice').value = '';
    }
  });

  // Clear History
  document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    if (confirm('क्या आप सच में सारा ट्रेड इतिहास मिटाना चाहते हैं?')) {
      STATE.wallet.history = [];
      updateWalletUI();
    }
  });

  // Settings: Language Selector
  document.getElementById('settingLanguage').addEventListener('change', (e) => {
    const val = e.target.value;
    if (LANG_CONFIG[val]) {
      STATE.language = val;
      STATE.langCode = LANG_CONFIG[val].code;
      document.getElementById('activeLangTag').innerText = LANG_CONFIG[val].label;
      if (recognition) recognition.lang = STATE.langCode;
      saveStorage();
      alert(`भाषा बदलकर ${val} कर दी गई है।`);
    }
  });

  // Settings: Voice Selector
  document.getElementById('settingVoiceSelect').addEventListener('change', (e) => {
    const idx = parseInt(e.target.value, 10);
    if (!isNaN(idx) && availableVoices[idx]) {
      STATE.selectedVoice = availableVoices[idx];
    }
  });

  // Voice Test Button
  document.getElementById('testVoiceBtn').addEventListener('click', () => {
    speakText('नमस्ते! यह CC AI SMART PRO की परीक्षण आवाज़ है।');
  });

  // Speech Rate & Pitch
  const rateSlider = document.getElementById('speechRate');
  rateSlider.addEventListener('input', (e) => {
    STATE.speechRate = parseFloat(e.target.value);
    document.getElementById('rateVal').innerText = STATE.speechRate.toFixed(1);
  });

  const pitchSlider = document.getElementById('speechPitch');
  pitchSlider.addEventListener('input', (e) => {
    STATE.speechPitch = parseFloat(e.target.value);
    document.getElementById('pitchVal').innerText = STATE.speechPitch.toFixed(1);
  });

  // Text-Only Mode Toggle
  document.getElementById('textOnlyToggle').addEventListener('change', (e) => {
    STATE.textOnly = e.target.checked;
    saveStorage();
  });

  // Reset Balance
  document.getElementById('resetBalanceBtn').addEventListener('click', () => {
    if (confirm('क्या आप वर्चुअल बैलेंस ₹10,00,000 पर रीसेट करना चाहते हैं?')) {
      STATE.wallet.cash = 1000000.00;
      STATE.wallet.positions = [];
      updateWalletUI();
    }
  });
}

// --- 9. APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  loadStorage();
  initSpeechRecognition();
  setupEventListeners();
  updateWalletUI();

  // Sync setting inputs to state
  const langSelect = document.getElementById('settingLanguage');
  if (langSelect) langSelect.value = STATE.language;
  document.getElementById('activeLangTag').innerText = LANG_CONFIG[STATE.language]?.label || 'HI';
});