// Thin wrapper around the browser's built-in speech synthesis so the rest of
// the app doesn't need to know it's optional/best-effort. Whether this
// actually produces natural Japanese audio depends entirely on voices
// installed in the user's OS/browser — there is no bundled audio.

export function canSpeak() {
  return 'speechSynthesis' in window;
}

export function speak(text, { lang = 'ja-JP', rate = 0.9 } = {}) {
  if (!text || !canSpeak()) return false;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = rate;
    window.speechSynthesis.speak(utter);
    return true;
  } catch {
    return false;
  }
}

export function hasJapaneseVoice() {
  if (!canSpeak()) return false;
  return window.speechSynthesis.getVoices().some((v) => v.lang && v.lang.toLowerCase().startsWith('ja'));
}
