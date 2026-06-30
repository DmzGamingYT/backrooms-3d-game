/**
 * Mock SpeechRecognition injectable via page.addInitScript().
 *
 * Architecture :
 * - Window.SpeechRecognition est REPLACÉ par une fonction constructeur
 *   qui crée une MockSpeechRecognition ET l'enregistre comme instance
 *   active sur window.__mockSpeechController.
 * - MockSpeechRecognition étend EventTarget : dispatchEvent() propage
 *   vers tous les listeners (onstart, onresult, onend, addEventListener).
 * - Les propriétés onstart/onresult/onend sont aussi appelables
 *   directement (l'API historique reconnue par webkitSpeechRecognition).
 *
 * Côté script Playwright : window.__mockSpeechController.start() crée
 * et démarre une nouvelle recognition. deliverResult() récupère
 * l'instance active et déclenche son onresult avec un transcript.
 */
export const SPEECH_MOCK_INIT_SCRIPT = `
(() => {
  if (window.__mockSpeechController) return;

  class MockSpeechRecognition extends EventTarget {
    constructor() {
      super();
      this.continuous = false;
      this.interimResults = true;
      this.lang = 'fr-FR';
      this.onaudiostart = null;
      this.onaudioend   = null;
      this.onstart      = null;
      this.onend        = null;
      this.onresult     = null;
      this.onerror      = null;
      this.onnomatch    = null;
      if (window.__mockSpeechController) {
        window.__mockSpeechController._instance = this;
      }
    }

    start() {
      this.dispatchEvent(new Event('start'));
      if (typeof this.onstart === 'function') this.onstart(new Event('start'));
    }

    stop() {
      this.dispatchEvent(new Event('end'));
      if (typeof this.onend === 'function') this.onend(new Event('end'));
    }

    abort() {
      this.dispatchEvent(new Event('error'));
      this.dispatchEvent(new Event('end'));
      if (typeof this.onerror === 'function') this.onerror(new Event('error'));
      if (typeof this.onend   === 'function') this.onend(new Event('end'));
    }
  }

  // Patch du constructeur pour exposer l'instance courante au controller
  function MockCtor() { return new MockSpeechRecognition(); }
  window.SpeechRecognition = MockCtor;
  window.webkitSpeechRecognition = MockCtor;

  window.__mockSpeechController = {
    _instance: null,

    /** Crée ET démarre une nouvelle reconnaissance (transition idle → listening). */
    start() {
      const r = new window.SpeechRecognition();
      r.start();
      return r;
    },

    /** Injecte un transcript (transition listening/processing → processing). */
    deliverResult(transcript, confidence = 0.99) {
      const r = this._instance;
      if (!r) {
        throw new Error(
          "mock : aucune reconnaissance active — appelle \u2019start\u2019 d\u2019abord",
        );
      }
      const evt = {
        resultIndex: 0,
        results: [
          {
            isFinal: true,
            0: { transcript, confidence },
            length: 1,
          },
        ],
        length: 1,
      };
      if (typeof r.onresult === 'function') r.onresult(evt);
      r.dispatchEvent(Object.assign(new Event('result'), evt));
    },

    /** Termine la reconnaissance (transition → idle). */
    end() {
      const r = this._instance;
      if (r && typeof r.stop === 'function') r.stop();
      this._instance = null;
    },
  };
})();
`;
