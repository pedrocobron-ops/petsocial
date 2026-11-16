// Ditado (SpeechRecognition) e leitura (speechSynthesis) de mentira para os testes de tela: ctx.addInitScript(falsos).
// O teste faz o ditado "ouvir": window.__voz.ultimo._ouvir([[texto, final], …]); silêncio: window.__voz.ultimo._fim().
// Contagens em window.__voz (comecou, parou, falas…).
/** Ditado e leitura de mentira. localStorage "teste:voz" = "sem": navegador sem ditado. window.__vozModo = "negado": recusa. */
function falsos() {
  let sem = false;
  try { sem = localStorage.getItem('teste:voz') === 'sem'; } catch { /* sem armazenamento */ }
  const reg = (window.__voz = { instancias: [], falas: [], comecou: 0, parou: 0, cancelou: 0 });
  if (sem) {
    for (const k of ['SpeechRecognition', 'webkitSpeechRecognition']) {
      try { delete window[k]; } catch { /* segue */ }
      try { Object.defineProperty(window, k, { value: undefined, configurable: true, writable: true }); } catch { /* segue */ }
    }
  } else {
    class Falso {
      constructor() { Object.assign(this, { lang: '', continuous: null, interimResults: null, onresult: null, onend: null, onerror: null, ativo: false }); reg.instancias.push(this); reg.ultimo = this; }
      start() {
        if (this.ativo) throw new Error('InvalidStateError');
        this.ativo = true; reg.comecou++;
        if (window.__vozModo === 'negado') setTimeout(() => { if (this.onerror) this.onerror({ error: 'not-allowed' }); this._fim(); }, 60);
      }
      stop() { if (!this.ativo) return; reg.parou++; setTimeout(() => this._fim(), 40); }
      abort() { this._fim(); }
      _fim() { if (!this.ativo) return; this.ativo = false; if (this.onend) this.onend(); }
      _ouvir(partes) {
        const results = partes.map(([t, final]) => Object.assign([{ transcript: t, confidence: 0.9 }], { isFinal: final }));
        if (this.onresult) this.onresult({ resultIndex: 0, results });
      }
    }
    window.SpeechRecognition = Falso;
    window.webkitSpeechRecognition = Falso;
  }
  try {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speaking: false, pending: false, paused: false, getVoices: () => [], pause() {}, resume() {}, addEventListener() {}, removeEventListener() {},
      cancel() { reg.cancelou++; },
      speak(u) { reg.falas.push({ texto: u.text, lang: u.lang }); setTimeout(() => u.onend && u.onend(), 300); },
    } });
  } catch { /* segue */ }
}

module.exports = { falsos };
