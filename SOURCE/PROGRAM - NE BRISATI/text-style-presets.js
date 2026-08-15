'use strict';

// TextStylePresetManager (sekcija 14 dodatka o tekstu na videu). 15 imenovanih, gotovih stilova
// koji pokrivaju najčešće potrebe (karaoke, diskretni titl, veliki animirani tekst, dvojezični
// prikaz, odjavna špica...). Svaki preset je kompletna createStyle() override kombinacija —
// NAPOMENA o createStyle(): spread na top-level ključevima znači da top-level objekat (npr.
// "font" ili "color") koji se prosledi u overrides POTPUNO zamenjuje podrazumevani, ne
// dopunjuje ga polje-po-polje — zato svaki preset ispod eksplicitno navodi SVA polja podobjekta
// koji override-uje, da ne bi tiho izgubio podrazumevane vrednosti.
//
// Fontovi navedeni ovde su PREFERIRANI izbori — render pipeline (FAZA 9) mora proći kroz
// FontManager.resolveFallbackFont() da bi dobio stvarno instaliran font na korisnikovoj mašini
// ako preferirani nedostaje (ne garantuje se da je npr. "Georgia" instalirana).

const { createStyle } = require('./text-overlay-models');

const PRESET_DEFINITIONS = {
  'karaoke-classic': {
    name: 'Karaoke Classic',
    description: 'Klasičan karaoke prikaz sa jasnim isticanjem aktivne reči.',
    font: { family: 'Inter', fallback: 'Arial', weight: 800, italic: false, underline: false, strikethrough: false, textCase: 'original' },
    outline: { enabled: true, color: '#000000', thickness: 3, opacity: 1 },
    karaoke: { inactiveColor: '#CCCCCC', activeColor: '#FFD447', completedColor: '#FFFFFF', preActiveColor: '#999999', activeGlowColor: '#FFD447' }
  },
  'minimal-discreet': {
    name: 'Minimal Discreet',
    description: 'Mali, diskretan titl pri dnu kadra — ne skreće pažnju sa slike.',
    size: { value: 3.5, unit: 'percent-height', min: 2, max: 15 },
    outline: { enabled: false, color: '#000000', thickness: 1, opacity: 0.5 },
    shadow: { enabled: true, color: '#000000', opacity: 0.5, offsetX: 0, offsetY: 1, blur: 2 },
    alignment: { horizontal: 'center', vertical: 'bottom', maxLineWidthPercent: 70, maxLines: 1, wordWrap: true }
  },
  'bold-impact': {
    name: 'Bold Impact',
    description: 'Veliki, udaran tekst velikim slovima za snažne linije/hook.',
    font: { family: 'Inter', fallback: 'Arial', weight: 900, italic: false, underline: false, strikethrough: false, textCase: 'uppercase' },
    size: { value: 10, unit: 'percent-height', min: 2, max: 15 },
    outline: { enabled: true, color: '#000000', thickness: 4, opacity: 1 }
  },
  'neon-glow': {
    name: 'Neon Glow',
    description: 'Neonski sjaj oko teksta, pogodno za noćne/urbane spotove.',
    color: { mode: 'solid', solid: '#00FFF0', opacity: 1 },
    glow: { enabled: true, color: '#00FFF0', intensity: 0.8, blur: 14, pulse: true },
    outline: { enabled: true, color: '#0A0A0A', thickness: 1, opacity: 0.8 }
  },
  'elegant-serif': {
    name: 'Elegant Serif',
    description: 'Tanak, elegantan serifni izgled za baladu ili sporiju numeru.',
    font: { family: 'Georgia', fallback: 'Times New Roman', weight: 400, italic: false, underline: false, strikethrough: false, textCase: 'original' },
    shadow: { enabled: true, color: '#000000', opacity: 0.4, offsetX: 0, offsetY: 2, blur: 6 },
    outline: { enabled: false, color: '#000000', thickness: 1, opacity: 0.5 }
  },
  'cinematic-subtitle': {
    name: 'Cinematic Subtitle',
    description: 'Standardan filmski titl sa poluprovidnom pozadinskom trakom.',
    size: { value: 5, unit: 'percent-height', min: 2, max: 15 },
    background: { mode: 'box', color: '#000000', opacity: 0.55, paddingX: 16, paddingY: 8, borderRadius: 4 },
    alignment: { horizontal: 'center', vertical: 'bottom', maxLineWidthPercent: 80, maxLines: 2, wordWrap: true }
  },
  'large-animated': {
    name: 'Large Animated',
    description: 'Veliki centralni tekst namenjen za kombinovanje sa TextAnimationEngine keyframe-ovima.',
    size: { value: 12, unit: 'percent-height', min: 2, max: 20 },
    alignment: { horizontal: 'center', vertical: 'center', maxLineWidthPercent: 85, maxLines: 2, wordWrap: true },
    font: { family: 'Inter', fallback: 'Arial', weight: 800, italic: false, underline: false, strikethrough: false, textCase: 'original' }
  },
  'retro-vhs': {
    name: 'Retro VHS',
    description: 'Retro televizijski izgled — široki razmak, jak outline, uglata slova.',
    font: { family: 'Courier New', fallback: 'Consolas', weight: 700, italic: false, underline: false, strikethrough: false, textCase: 'uppercase' },
    spacing: { letterSpacing: 4, wordSpacing: 2, lineHeight: 1.3, paragraphSpacing: 0 },
    outline: { enabled: true, color: '#FFFFFF', thickness: 2, opacity: 1 },
    color: { mode: 'solid', solid: '#FF2D95', opacity: 1 }
  },
  'handwritten': {
    name: 'Handwritten',
    description: 'Rukopisni, ličan ton — pogodno za intimne/emotivne stihove.',
    font: { family: 'Segoe Script', fallback: 'Comic Sans MS', weight: 400, italic: true, underline: false, strikethrough: false, textCase: 'original' },
    shadow: { enabled: true, color: '#000000', opacity: 0.35, offsetX: 1, offsetY: 1, blur: 3 }
  },
  'typewriter': {
    name: 'Typewriter',
    description: 'Fiksni razmak slova kao na pisaćoj mašini, bez pozadine.',
    font: { family: 'Courier New', fallback: 'Consolas', weight: 400, italic: false, underline: false, strikethrough: false, textCase: 'original' },
    spacing: { letterSpacing: 2, wordSpacing: 4, lineHeight: 1.2, paragraphSpacing: 0 },
    background: { mode: 'none', color: '#000000', opacity: 0, paddingX: 0, paddingY: 0, borderRadius: 0 }
  },
  'gradient-pop': {
    name: 'Gradient Pop',
    description: 'Živopisan gradijent teksta za pop/dance numere.',
    color: { mode: 'gradient', solid: '#FFFFFF', opacity: 1, gradientStart: '#FF6EC7', gradientEnd: '#7C4DFF', gradientAngleDeg: 45 },
    outline: { enabled: true, color: '#000000', thickness: 2, opacity: 0.9 }
  },
  'outline-only': {
    name: 'Outline Only',
    description: 'Samo kontura teksta bez ispune — minimalistički, moderan izgled.',
    color: { mode: 'solid', solid: '#FFFFFF', opacity: 0 },
    outline: { enabled: true, color: '#FFFFFF', thickness: 3, opacity: 1 }
  },
  'boxed-caption': {
    name: 'Boxed Caption',
    description: 'Tekst unutar jasno omeđene kutije — pogodno za citate/najave.',
    background: { mode: 'box', color: '#111111', opacity: 0.85, paddingX: 20, paddingY: 10, borderRadius: 10 },
    outline: { enabled: false, color: '#000000', thickness: 1, opacity: 0.5 }
  },
  'dual-language': {
    name: 'Dual Language',
    description: 'Manji, kompaktan stil za drugi (prevod) track prikazan ispod originala.',
    size: { value: 4, unit: 'percent-height', min: 2, max: 12 },
    color: { mode: 'solid', solid: '#E0E0E0', opacity: 0.95 },
    alignment: { horizontal: 'center', vertical: 'bottom', maxLineWidthPercent: 75, maxLines: 1, wordWrap: true }
  },
  'credits-endcard': {
    name: 'Credits End Card',
    description: 'Mirni, čitljiv stil za odjavnu špicu (autor, produkcija, zahvalnice).',
    font: { family: 'Inter', fallback: 'Arial', weight: 500, italic: false, underline: false, strikethrough: false, textCase: 'original' },
    size: { value: 4.5, unit: 'percent-height', min: 2, max: 12 },
    alignment: { horizontal: 'center', vertical: 'center', maxLineWidthPercent: 70, maxLines: 6, wordWrap: true }
  }
};

function listStylePresets() {
  return Object.entries(PRESET_DEFINITIONS).map(([presetId, def]) => ({ presetId, name: def.name, description: def.description }));
}

function getStylePreset(presetId) {
  const def = PRESET_DEFINITIONS[presetId];
  if (!def) throw new Error(`Nepoznat preset: "${presetId}". Dostupno: ${Object.keys(PRESET_DEFINITIONS).join(', ')}.`);
  return createStyle(def);
}

module.exports = { listStylePresets, getStylePreset, PRESET_DEFINITIONS };
