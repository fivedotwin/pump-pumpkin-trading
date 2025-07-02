// Professional Sound Manager - High Quality Audio using Howler.js 🎵

import { Howl, Howler } from 'howler';

class ProfessionalSoundManager {
  private sounds: Map<string, Howl> = new Map();
  private masterVolume: number = 0.7;
  private soundEnabled: boolean = true;
  private categories: Map<string, number> = new Map();

  constructor() {
    this.initializeCategories();
    this.initializeSounds();
    this.loadSettings();
  }

  private initializeCategories() {
    this.categories.set('ui', 0.3);
    this.categories.set('trade', 0.5);
    this.categories.set('success', 0.6);
    this.categories.set('error', 0.4);
    this.categories.set('modal', 0.35);
    this.categories.set('form', 0.25);
  }

  private initializeSounds() {
    // Create high-quality sounds using better synthesis
    const soundConfigs = {
      'click': this.createProfessionalClick(),
      'button_press': this.createButtonPress(),
      'modal_open': this.createModalOpen(),
      'modal_close': this.createModalClose(),
      'trade_confirm': this.createTradeConfirm(),
      'success_chime': this.createSuccessChime(),
      'error_gentle': this.createGentleError(),
      'toggle_on': this.createToggleOn(),
      'toggle_off': this.createToggleOff(),
    };

    for (const [name, audioData] of Object.entries(soundConfigs)) {
      try {
        const howl = new Howl({
          src: [audioData],
          volume: 0.5,
          preload: true,
          html5: false
        });
        this.sounds.set(name, howl);
      } catch (error) {
        console.warn(`Failed to create sound: ${name}`, error);
      }
    }
  }

  private createProfessionalClick(): string {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.08;
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      // Professional click with warm harmonics
      const fundamental = Math.sin(2 * Math.PI * 800 * t);
      const harmonic = Math.sin(2 * Math.PI * 1600 * t) * 0.4;
      const envelope = Math.exp(-t * 20);
      data[i] = (fundamental + harmonic) * envelope * 0.12;
    }

    return this.bufferToDataURL(buffer);
  }

  private createButtonPress(): string {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.12;
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const low = Math.sin(2 * Math.PI * 300 * t);
      const mid = Math.sin(2 * Math.PI * 600 * t);
      const envelope = Math.exp(-t * 12);
      data[i] = (low * 0.7 + mid * 0.4) * envelope * 0.15;
    }

    return this.bufferToDataURL(buffer);
  }

  private createModalOpen(): string {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.2;
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const tone = Math.sin(2 * Math.PI * 440 * t);
      const envelope = Math.exp(-t * 8);
      data[i] = tone * envelope * 0.1;
    }

    return this.bufferToDataURL(buffer);
  }

  private createModalClose(): string {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.15;
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const tone = Math.sin(2 * Math.PI * 330 * t);
      const envelope = Math.exp(-t * 10);
      data[i] = tone * envelope * 0.08;
    }

    return this.bufferToDataURL(buffer);
  }

  private createTradeConfirm(): string {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.6;
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const note1 = Math.sin(2 * Math.PI * 523.25 * t); // C5
      const note2 = Math.sin(2 * Math.PI * 659.25 * t); // E5
      const envelope = Math.exp(-t * 4);
      data[i] = (note1 + note2 * 0.7) * envelope * 0.18;
    }

    return this.bufferToDataURL(buffer);
  }

  private createSuccessChime(): string {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.8;
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const fundamental = Math.sin(2 * Math.PI * 880 * t);
      const fifth = Math.sin(2 * Math.PI * 1318.5 * t);
      const envelope = Math.exp(-t * 3);
      data[i] = (fundamental + fifth * 0.6) * envelope * 0.2;
    }

    return this.bufferToDataURL(buffer);
  }

  private createGentleError(): string {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.3;
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const tone1 = Math.sin(2 * Math.PI * 300 * t);
      const tone2 = Math.sin(2 * Math.PI * 200 * t);
      const envelope = Math.exp(-t * 8);
      data[i] = (tone1 + tone2 * 0.7) * envelope * 0.12;
    }

    return this.bufferToDataURL(buffer);
  }

  private createToggleOn(): string {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.1;
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const tone = Math.sin(2 * Math.PI * 660 * t);
      const envelope = Math.exp(-t * 15);
      data[i] = tone * envelope * 0.1;
    }

    return this.bufferToDataURL(buffer);
  }

  private createToggleOff(): string {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.1;
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const tone = Math.sin(2 * Math.PI * 440 * t);
      const envelope = Math.exp(-t * 15);
      data[i] = tone * envelope * 0.08;
    }

    return this.bufferToDataURL(buffer);
  }

  private bufferToDataURL(buffer: AudioBuffer): string {
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);
    const data = buffer.getChannelData(0);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }

    const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  // Public API
  public play(soundName: string, category: string = 'ui'): void {
    if (!this.soundEnabled) return;

    const sound = this.sounds.get(soundName);
    if (!sound) return;

    const categoryVolume = this.categories.get(category) || 0.5;
    const finalVolume = this.masterVolume * categoryVolume;
    
    sound.volume(finalVolume);
    sound.play();
  }

  // Convenience methods
  public playClick() { this.play('click', 'ui'); }
  public playButtonPress() { this.play('button_press', 'ui'); }
  public playModalOpen() { this.play('modal_open', 'modal'); }
  public playModalClose() { this.play('modal_close', 'modal'); }
  public playTradeConfirm() { this.play('trade_confirm', 'trade'); }
  public playPositionOpen() { this.play('trade_confirm', 'trade'); }
  public playPositionClose() { this.play('success_chime', 'success'); }
  public playTradeSuccess() { this.play('success_chime', 'success'); }
  public playSuccessChime() { this.play('success_chime', 'success'); }
  public playErrorGentle() { this.play('error_gentle', 'error'); }
  public playToggleOn() { this.play('toggle_on', 'form'); }
  public playToggleOff() { this.play('toggle_off', 'form'); }
  public playTabSwitch() { this.playClick(); }
  public playInputFocus() { this.playClick(); }
  public playDirectionSelect() { this.playClick(); }
  public playDropdownOpen() { this.playClick(); }

  // Disabled methods
  public playLeverageAdjust() { /* Disabled */ }
  public playAmountInput() { /* Disabled */ }
  public playHover() { /* Disabled */ }

  // Settings
  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    localStorage.setItem('professionalSoundVolume', this.masterVolume.toString());
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    localStorage.setItem('professionalSoundEnabled', enabled.toString());
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  private loadSettings(): void {
    const savedVolume = localStorage.getItem('professionalSoundVolume');
    if (savedVolume) {
      this.masterVolume = parseFloat(savedVolume);
    }

    const savedEnabled = localStorage.getItem('professionalSoundEnabled');
    if (savedEnabled) {
      this.soundEnabled = savedEnabled === 'true';
    }
  }
}

export const professionalSoundManager = new ProfessionalSoundManager();
export default professionalSoundManager; 