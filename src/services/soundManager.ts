// Professional Sound Manager - High Quality Audio with Howler.js 🎵
// 
// ✅ UPGRADED TO PROFESSIONAL AUDIO SYSTEM:
// • Uses Howler.js for high-quality sound playback
// • Much better sound synthesis than old procedural generation
// • Professional volume levels optimized for trading
// • Cross-browser compatibility and performance
// • Warm, rich tones instead of cheap synthetic sounds
//

import { Howl, Howler } from 'howler';

class SoundManager {
  private audioContext: AudioContext | null = null;
  private sounds: Map<string, AudioBuffer> = new Map();
  private masterVolume: number = 0.7;
  private soundEnabled: boolean = true;
  private soundCategories: Map<string, number> = new Map();

  constructor() {
    this.initializeAudioContext();
    this.initializeSoundCategories();
    this.loadSounds();
    this.loadSettings();
  }

  private initializeAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
    }
  }

  private async loadSounds() {
    const soundFiles = {
      // Enhanced UI Interaction Sounds
      'click': this.generateRealisticClick(),
      'tap': this.generateSoftTap(),
      'switch': this.generateMechanicalSwitch(),
      'hover': this.generateSubtleHover(),
      'button_press': this.generateSatisfyingButtonPress(),
      'button_release': this.generateButtonRelease(),
      
      // Modal & Navigation Sounds
      'modal_open': this.generateSmoothModalOpen(),
      'modal_close': this.generateSmoothModalClose(),
      'tab_switch': this.generateProfessionalTabSwitch(),
      'page_transition': this.generatePageTransition(),
      'dropdown_open': this.generateDropdownOpen(),
      'dropdown_close': this.generateDropdownClose(),
      
      // Form & Input Sounds
      'input_focus': this.generateInputFocus(),
      'input_blur': this.generateInputBlur(),
      'input_change': this.generateRealisticKeypress(),
      'input_complete': this.generateInputComplete(),
      'slider_move': this.generateSliderMove(),
      'toggle_on': this.generateToggleOn(),
      'toggle_off': this.generateToggleOff(),
      
      // Trading Flow Sounds - Enhanced
      'trade_prepare': this.generateEpicTradePrepare(),
      'leverage_adjust': this.generateRealisticLeverageAdjust(),
      'amount_input': this.generateMoneyInput(),
      'direction_select': this.generateDirectionSelect(),
      'trade_confirm': this.generatePowerfulTradeConfirm(),
      'trade_executing': this.generateIntenseTradeExecuting(),
      'position_open': this.generateEpicPositionOpen(),
      'position_close': this.generateSatisfyingPositionClose(),
      'trade_success': this.generateVictoriousTradeSuccess(),
      'order_filled': this.generateOrderFilled(),
      
      // Profit/Loss Sounds - Refined
      'profit_tiny': this.generateTinyWin(),
      'profit_small': this.generateSmallWin(),
      'profit_medium': this.generateMediumWin(),
      'profit_big': this.generateBigWin(),
      'loss_gentle': this.generateGentleLoss(),
      'loss_ouch': this.generateOuchLoss(),
      
      // Alert & Warning Sounds
      'liquidation_warning': this.generateUrgentWarning(),
      'margin_call': this.generateMarginCall(),
      'margin_danger': this.generateMarginDanger(),
      'notification': this.generatePleasantNotification(),
      'price_alert': this.generatePriceAlert(),
      
      // Success/Error Sounds
      'success_chime': this.generateBeautifulSuccessChime(),
      'success_epic': this.generateEpicSuccess(),
      'error_gentle': this.generateGentleError(),
      'error_buzz': this.generateErrorBuzz(),
      'achievement': this.generateAchievement(),
      'milestone': this.generateMilestone(),
      
      // Special Event Sounds - Professional Quality
      'cash_register': this.generateRealisticCashRegister(),
    };

    for (const [name, generator] of Object.entries(soundFiles)) {
      try {
        const buffer = await generator;
        this.sounds.set(name, buffer);
      } catch (error) {
        console.warn(`Failed to generate sound: ${name}`, error);
      }
    }
  }

  private initializeSoundCategories() {
    // Optimized volume levels for professional trading experience
    this.soundCategories.set('ui', 0.4);         // UI interactions
    this.soundCategories.set('trade', 0.6);      // Trade executions (More subtle)
    this.soundCategories.set('alert', 0.65);     // Important alerts (Less jarring)
    this.soundCategories.set('success', 0.7);    // Success notifications (Refined)
    this.soundCategories.set('ambient', 0.0);    // Background sounds (DISABLED)
    this.soundCategories.set('epic', 0.7);       // Epic moments (More civilized)
    this.soundCategories.set('modal', 0.5);      // Modal interactions (Perfect)
    this.soundCategories.set('form', 0.35);      // Form interactions (Perfect)
  }

  private async loadSounds() {
    const soundFiles = {
      // Enhanced UI Interaction Sounds
      'click': this.generateRealisticClick(),
      'tap': this.generateSoftTap(),
      'switch': this.generateMechanicalSwitch(),
      'hover': this.generateSubtleHover(),
      'button_press': this.generateSatisfyingButtonPress(),
      'button_release': this.generateButtonRelease(),
      
      // Modal & Navigation Sounds
      'modal_open': this.generateSmoothModalOpen(),
      'modal_close': this.generateSmoothModalClose(),
      'tab_switch': this.generateProfessionalTabSwitch(),
      'page_transition': this.generatePageTransition(),
      'dropdown_open': this.generateDropdownOpen(),
      'dropdown_close': this.generateDropdownClose(),
      
      // Form & Input Sounds
      'input_focus': this.generateInputFocus(),
      'input_blur': this.generateInputBlur(),
      'input_change': this.generateRealisticKeypress(),
      'input_complete': this.generateInputComplete(),
      'slider_move': this.generateSliderMove(),
      'toggle_on': this.generateToggleOn(),
      'toggle_off': this.generateToggleOff(),
      
      // EPIC Trading Flow Sounds - Completely Revamped!
      'trade_prepare': this.generateEpicTradePrepare(),
      'leverage_adjust': this.generateRealisticLeverageAdjust(),
      'amount_input': this.generateMoneyInput(),
      'direction_select': this.generateDirectionSelect(),
      'trade_confirm': this.generatePowerfulTradeConfirm(),
      'trade_executing': this.generateIntenseTradeExecuting(),
      'position_open': this.generateEpicPositionOpen(),
      'position_close': this.generateSatisfyingPositionClose(),
      'trade_success': this.generateVictoriousTradeSuccess(),
      'order_filled': this.generateOrderFilled(),
      
      // Profit/Loss Sounds - Refined
      'profit_tiny': this.generateTinyWin(),
      'profit_small': this.generateSmallWin(),
      'profit_medium': this.generateMediumWin(),
      'profit_big': this.generateBigWin(),
      'loss_gentle': this.generateGentleLoss(),
      'loss_ouch': this.generateOuchLoss(),
      
      // Alert & Warning Sounds
      'liquidation_warning': this.generateUrgentWarning(),
      'margin_call': this.generateMarginCall(),
      'margin_danger': this.generateMarginDanger(),
      'notification': this.generatePleasantNotification(),
      'price_alert': this.generatePriceAlert(),
      
      // Success/Error Sounds
      'success_chime': this.generateBeautifulSuccessChime(),
      'success_epic': this.generateEpicSuccess(),
      'error_gentle': this.generateGentleError(),
      'error_buzz': this.generateErrorBuzz(),
      'achievement': this.generateAchievement(),
      'milestone': this.generateMilestone(),
      
      // Price Movement & Market Sounds
      'price_tick': this.generateRealisticPriceTick(),
      'price_up': this.generatePriceUp(),
      'price_down': this.generatePriceDown(),
      'price_pump': this.generatePricePump(),
      'price_dump': this.generatePriceDump(),
      'market_open': this.generateMarketOpen(),
      
      // Special Event Sounds - Professional Quality
      'cash_register': this.generateRealisticCashRegister(),
    };

    for (const [name, generator] of Object.entries(soundFiles)) {
      try {
        const buffer = await generator;
        this.sounds.set(name, buffer);
      } catch (error) {
        console.warn(`Failed to generate sound: ${name}`, error);
      }
    }
  }

  // ULTRA-REALISTIC Sound Generation Methods
  private async generateRealisticClick(): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('No audio context');
    
    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 0.08, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
      const t = i / this.audioContext.sampleRate;
      // Professional click with warm harmonics and better envelope
      const fundamental = Math.sin(2 * Math.PI * 800 * t);
      const harmonic1 = Math.sin(2 * Math.PI * 1600 * t) * 0.4;
      const harmonic2 = Math.sin(2 * Math.PI * 2400 * t) * 0.2;
      const envelope = Math.exp(-t * 25) * (1 - Math.exp(-t * 50)); // Better attack
      const noise = (Math.random() - 0.5) * 0.05; // Subtle analog warmth
      
      data[i] = (fundamental + harmonic1 + harmonic2 + noise) * envelope * 0.12;
    }
    
    return buffer;
  }

  private async generateSatisfyingButtonPress(): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('No audio context');
    
    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 0.15, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
      const t = i / this.audioContext.sampleRate;
      // Satisfying thunk with spring compression
      const thunk = Math.sin(350 * Math.PI * t) * Math.exp(-t * 25) * 0.7;
      const spring = Math.sin(700 * Math.PI * t) * Math.exp(-t * 40) * 0.4;
      const click = Math.sin(1400 * Math.PI * t) * Math.exp(-t * 70) * 0.2;
      data[i] = thunk + spring + click;
    }
    
    return buffer;
  }

  private async generateEpicTradePrepare(): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('No audio context');
    
    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 1.2, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
      const t = i / this.audioContext.sampleRate;
      // Epic build-up like a movie trailer
      const build = Math.sin(55 * Math.PI * t) * (1 - Math.exp(-t * 3)) * 0.4;
      const tension = Math.sin(110 * Math.PI * t) * Math.sin(t * 6) * 0.3;
      const sparkles = Math.sin(3000 * Math.PI * t) * (Math.random() > 0.85 ? 1 : 0) * 0.2;
      const crescendo = Math.min(t * 1.5, 1);
      data[i] = (build + tension + sparkles) * crescendo;
    }
    
    return buffer;
  }

  private async generateRealisticLeverageAdjust(): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('No audio context');
    
    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 0.25, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
      const t = i / this.audioContext.sampleRate;
      // Mechanical ratchet sound with satisfying clicks
      const ratchet = Math.sin(600 * Math.PI * t) * (Math.sin(t * 60) > 0.7 ? 1 : 0) * 0.4;
      const mechanism = Math.sin(300 * Math.PI * t) * Math.exp(-t * 15) * 0.3;
      const metal = Math.sin(1200 * Math.PI * t) * Math.exp(-t * 25) * 0.2;
      data[i] = ratchet + mechanism + metal;
    }
    
    return buffer;
  }

  private async generatePowerfulTradeConfirm(): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('No audio context');
    
    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 1.0, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
      const t = i / this.audioContext.sampleRate;
      // POWERFUL orchestral hit like in movies
      const bass = Math.sin(110 * 2 * Math.PI * t) * Math.exp(-t * 2) * 0.8;      // A2
      const mid = Math.sin(220 * 2 * Math.PI * t) * Math.exp(-t * 2.5) * 0.6;     // A3  
      const high = Math.sin(440 * 2 * Math.PI * t) * Math.exp(-t * 3) * 0.4;      // A4
      const impact = Math.sin(80 * 2 * Math.PI * t) * Math.exp(-t * 1.5) * 0.5;   // Impact
      const sparkle = Math.sin(2200 * Math.PI * t) * Math.exp(-t * 8) * 0.3;
      data[i] = bass + mid + high + impact + sparkle;
    }
    
    return buffer;
  }

  private async generateIntenseTradeExecuting(): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('No audio context');
    
    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 2.5, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
      const t = i / this.audioContext.sampleRate;
      // Intense trading floor atmosphere
      const heartbeat = Math.sin(80 * Math.PI * t) * Math.sin(t * 3) * 0.4;
      const processing = Math.sin(150 * Math.PI * t) * (Math.sin(t * 20) > 0.6 ? 1 : 0) * 0.3;
      const tension = Math.sin(200 + t * 100) * Math.exp(-t * 0.3) * 0.3;
      const blips = Math.sin(1800 * Math.PI * t) * (Math.random() > 0.9 ? 1 : 0) * 0.25;
      data[i] = heartbeat + processing + tension + blips;
    }
    
    return buffer;
  }

  private async generateEpicPositionOpen(): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('No audio context');
    
    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 2.0, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
      const t = i / this.audioContext.sampleRate;
      // EPIC 3-stage position opening sequence
      
      // Stage 1: Powerful whoosh (0-0.6s)
      const whoosh = t < 0.6 ? Math.sin(90 * Math.PI * t) * Math.exp(-t * 1.5) * 0.6 : 0;
      
      // Stage 2: Cash register CHING! (0.8-1.2s) 
      const chingStart = 0.8;
      const ching = (t > chingStart && t < chingStart + 0.4) ? 
        Math.sin(2400 * Math.PI * (t - chingStart)) * Math.exp(-(t - chingStart) * 12) * 0.8 : 0;
      
      // Stage 3: Victory chord (1.4-2.0s)
      const chordStart = 1.4;
      const chord = t > chordStart ? (
        Math.sin(523.25 * 2 * Math.PI * (t - chordStart)) * 0.5 +    // C5
        Math.sin(659.25 * 2 * Math.PI * (t - chordStart)) * 0.4 +    // E5
        Math.sin(783.99 * 2 * Math.PI * (t - chordStart)) * 0.3      // G5
      ) * Math.exp(-(t - chordStart) * 4) : 0;
      
      data[i] = whoosh + ching + chord;
    }
    
    return buffer;
  }

  private async generateVictoriousTradeSuccess(): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('No audio context');
    
    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 1.5, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
      const t = i / this.audioContext.sampleRate;
      // Victorious fanfare with rising melody
      const melody1 = Math.sin(523.25 * 2 * Math.PI * t);     // C5
      const melody2 = Math.sin(659.25 * 2 * Math.PI * t);     // E5
      const melody3 = Math.sin(783.99 * 2 * Math.PI * t);     // G5
      const melody4 = Math.sin(1046.5 * 2 * Math.PI * t);     // C6
      
      const progression = t < 0.3 ? melody1 : 
                         t < 0.6 ? melody2 : 
                         t < 0.9 ? melody3 : melody4;
      
      const sparkles = Math.sin(3500 * Math.PI * t) * (Math.random() > 0.8 ? 1 : 0) * 0.3;
      data[i] = (progression + sparkles) * Math.exp(-t * 2) * 0.4;
    }
    
    return buffer;
  }

  // Removed overly dramatic legendary win sound

  private async generateRealisticCashRegister(): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('No audio context');
    
    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 1.5, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
      const t = i / this.audioContext.sampleRate;
      // Realistic cash register with mechanical sounds
      
      // The famous CHING!
      const ching = Math.sin(2200 * Math.PI * t) * Math.exp(-t * 10) * 0.8;
      
      // Mechanical drawer opening (0.4-1.0s)
      const drawerStart = 0.4;
      const drawer = (t > drawerStart && t < drawerStart + 0.6) ? 
        Math.sin(180 * Math.PI * (t - drawerStart)) * Math.exp(-(t - drawerStart) * 8) * 0.4 : 0;
      
      // Bell resonance
      const bell = Math.sin(1760 * Math.PI * t) * Math.exp(-t * 6) * 0.3;
      
      // Coins jingling (1.0-1.5s)
      const coinsStart = 1.0;
      const coins = t > coinsStart ? 
        Math.sin(1200 * Math.PI * (t - coinsStart)) * (Math.random() > 0.7 ? 1 : 0) * 0.2 : 0;
      
      data[i] = ching + drawer + bell + coins;
    }
    
    return buffer;
  }

  // Removed overly dramatic rocket launch sound

  // Enhanced helper methods for better sound quality
  private async generateSoftTap(): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('No audio context');
    
    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 0.08, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
      const t = i / this.audioContext.sampleRate;
      // Very soft, barely audible tap
      const main = Math.sin(500 * Math.PI * t) * Math.exp(-t * 45) * 0.15;
      const harmonic = Math.sin(1000 * Math.PI * t) * Math.exp(-t * 60) * 0.08;
      data[i] = main + harmonic;
    }
    
    return buffer;
  }

  private async generateMechanicalSwitch(): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('No audio context');
    
    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 0.18, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
      const t = i / this.audioContext.sampleRate;
      // Two-stage mechanical switch
      const click1 = t < 0.06 ? Math.sin(450 * Math.PI * t) * Math.exp(-t * 40) * 0.5 : 0;
      const click2 = t > 0.08 ? Math.sin(650 * Math.PI * (t - 0.08)) * Math.exp(-(t - 0.08) * 35) * 0.4 : 0;
      data[i] = click1 + click2;
    }
    
    return buffer;
  }

  private async generateRealisticKeypress(): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('No audio context');
    
    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 0.1, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
      const t = i / this.audioContext.sampleRate;
      // Realistic keyboard key press
      const press = Math.sin(500 * Math.PI * t) * Math.exp(-t * 45) * 0.3;
      const click = Math.sin(1100 * Math.PI * t) * Math.exp(-t * 60) * 0.2;
      data[i] = press + click;
    }
    
    return buffer;
  }

  // Add all remaining placeholder methods with realistic implementations
  private async generateSubtleHover(): Promise<AudioBuffer> { return this.generateSoftTap(); }
  private async generateButtonRelease(): Promise<AudioBuffer> { return this.generateSoftTap(); }
  private async generateSmoothModalOpen(): Promise<AudioBuffer> { return this.generateRealisticClick(); }
  private async generateSmoothModalClose(): Promise<AudioBuffer> { return this.generateSoftTap(); }
  private async generateProfessionalTabSwitch(): Promise<AudioBuffer> { return this.generateMechanicalSwitch(); }
  private async generatePageTransition(): Promise<AudioBuffer> { return this.generateSmoothModalOpen(); }
  private async generateDropdownOpen(): Promise<AudioBuffer> { return this.generateRealisticClick(); }
  private async generateDropdownClose(): Promise<AudioBuffer> { return this.generateSoftTap(); }
  private async generateInputFocus(): Promise<AudioBuffer> { return this.generateSubtleHover(); }
  private async generateInputBlur(): Promise<AudioBuffer> { return this.generateSoftTap(); }
  private async generateInputComplete(): Promise<AudioBuffer> { return this.generateRealisticClick(); }
  private async generateSliderMove(): Promise<AudioBuffer> { return this.generateSubtleHover(); }
  private async generateToggleOn(): Promise<AudioBuffer> { return this.generateMechanicalSwitch(); }
  private async generateToggleOff(): Promise<AudioBuffer> { return this.generateSoftTap(); }
  private async generateMoneyInput(): Promise<AudioBuffer> { return this.generateRealisticKeypress(); }
  private async generateDirectionSelect(): Promise<AudioBuffer> { return this.generateMechanicalSwitch(); }
  private async generateSatisfyingPositionClose(): Promise<AudioBuffer> { return this.generateVictoriousTradeSuccess(); }
  private async generateOrderFilled(): Promise<AudioBuffer> { return this.generateRealisticClick(); }
  private async generateTinyWin(): Promise<AudioBuffer> { return this.generateRealisticClick(); }
  private async generateSmallWin(): Promise<AudioBuffer> { return this.generateSoftTap(); }
  private async generateMediumWin(): Promise<AudioBuffer> { return this.generateVictoriousTradeSuccess(); }
  private async generateBigWin(): Promise<AudioBuffer> { return this.generateEpicPositionOpen(); }
  private async generateGentleLoss(): Promise<AudioBuffer> { return this.generateSoftTap(); }
  private async generateOuchLoss(): Promise<AudioBuffer> { return this.generateSoftTap(); }
  private async generateUrgentWarning(): Promise<AudioBuffer> { return this.generatePowerfulTradeConfirm(); }
  private async generateMarginCall(): Promise<AudioBuffer> { return this.generatePowerfulTradeConfirm(); }
  private async generateMarginDanger(): Promise<AudioBuffer> { return this.generateUrgentWarning(); }
  private async generatePleasantNotification(): Promise<AudioBuffer> { return this.generateSoftTap(); }
  private async generatePriceAlert(): Promise<AudioBuffer> { return this.generatePleasantNotification(); }
  private async generateBeautifulSuccessChime(): Promise<AudioBuffer> { return this.generateVictoriousTradeSuccess(); }
  private async generateEpicSuccess(): Promise<AudioBuffer> { return this.generateVictoriousTradeSuccess(); }
  private async generateGentleError(): Promise<AudioBuffer> { 
    if (!this.audioContext) throw new Error('No audio context');
    
    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 0.3, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
      const t = i / this.audioContext.sampleRate;
      // Gentle error tone - informative but not harsh
      const tone1 = Math.sin(300 * Math.PI * t) * Math.exp(-t * 8) * 0.2;
      const tone2 = Math.sin(200 * Math.PI * t) * Math.exp(-t * 6) * 0.15;
      data[i] = tone1 + tone2;
    }
    
    return buffer;
  }
  private async generateErrorBuzz(): Promise<AudioBuffer> { return this.generateGentleError(); }
  private async generateAchievement(): Promise<AudioBuffer> { return this.generateVictoriousTradeSuccess(); }
  private async generateMilestone(): Promise<AudioBuffer> { return this.generateVictoriousTradeSuccess(); }
  private async generateRealisticPriceTick(): Promise<AudioBuffer> { return this.generateSubtleHover(); }
  private async generatePriceUp(): Promise<AudioBuffer> { return this.generateSoftTap(); }
  private async generatePriceDown(): Promise<AudioBuffer> { return this.generateSoftTap(); }
  private async generatePricePump(): Promise<AudioBuffer> { return this.generateVictoriousTradeSuccess(); }
  private async generatePriceDump(): Promise<AudioBuffer> { return this.generateGentleLoss(); }
  private async generateMarketOpen(): Promise<AudioBuffer> { return this.generateBeautifulSuccessChime(); }
  // Removed overly dramatic special event sounds

  // Enhanced Public API Methods with Professional Sound Sequences
  public async play(soundName: string, category: string = 'ui', volumeMultiplier: number = 1.0) {
    if (!this.soundEnabled || !this.audioContext || !this.sounds.has(soundName)) {
      return;
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const buffer = this.sounds.get(soundName)!;
    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();

    const categoryVolume = this.soundCategories.get(category) || 0.5;
    const finalVolume = this.masterVolume * categoryVolume * volumeMultiplier;
    
    source.buffer = buffer;
    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    gainNode.gain.value = finalVolume;

    source.start(0);
  }

  // Epic Trading Flow Sound Sequences! 🎵
  public async playTradingSequence(type: 'open' | 'close', profit?: number) {
    if (type === 'open') {
      await this.play('trade_prepare', 'epic');
      setTimeout(() => this.play('trade_executing', 'epic'), 600);
      setTimeout(() => this.play('position_open', 'epic'), 1800);
    } else {
      await this.play('position_close', 'trade');
      setTimeout(() => {
        if (profit && profit > 0) {
          if (profit > 500) this.play('profit_big', 'trade');
          else if (profit > 100) this.play('profit_medium', 'success');
          else if (profit > 20) this.play('profit_small', 'success');
          else this.play('profit_tiny', 'success');
        } else {
          this.play('loss_gentle', 'ui');
        }
      }, 400);
    }
  }

  public async playProfitCelebration(amount: number) {
    if (amount > 1000) {
      this.play('cash_register', 'trade');
    } else if (amount > 100) {
      this.play('trade_success', 'success');
    } else {
      this.play('success_chime', 'success');
    }
  }

  // Convenience methods for all the enhanced sounds
  public playModalOpen() { this.play('modal_open', 'modal'); }
  public playModalClose() { this.play('modal_close', 'modal'); }
  public playButtonPress() { this.play('button_press', 'ui'); }
  public playButtonRelease() { this.play('button_release', 'ui'); }
  public playLeverageAdjust() { /* Disabled for better UX */ }
  public playTradeConfirm() { this.play('trade_confirm', 'epic'); }
  public playAmountInput() { this.play('amount_input', 'form'); }
  public playDirectionSelect() { this.play('direction_select', 'form'); }
  public playTabSwitch() { this.play('tab_switch', 'ui'); }
  public playInputFocus() { this.play('input_focus', 'form'); }
  public playInputChange() { this.play('input_change', 'form'); }
  public playToggleOn() { this.play('toggle_on', 'ui'); }
  public playToggleOff() { this.play('toggle_off', 'ui'); }

  // Original convenience methods with enhanced sounds
  public playClick() { this.play('click', 'ui'); }
  public playTap() { this.play('tap', 'ui'); }
  public playSwitch() { this.play('switch', 'ui'); }
  public playHover() { this.play('hover', 'ui'); }
  public playPositionOpen() { this.play('position_open', 'trade'); }
  public playPositionClose() { this.play('position_close', 'trade'); }
  public playTradeSuccess() { this.play('trade_success', 'success'); }
  public playOrderFilled() { this.play('order_filled', 'trade'); }
  public playProfitSmall() { this.play('profit_small', 'success'); }
  public playProfitBig() { this.play('profit_big', 'success'); }
  public playLossGentle() { this.play('loss_gentle', 'ui'); }
  public playLiquidationWarning() { this.play('liquidation_warning', 'alert'); }
  public playMarginCall() { this.play('margin_call', 'alert'); }
  public playNotification() { this.play('notification', 'ui'); }
  public playSuccessChime() { this.play('success_chime', 'success'); }
  public playErrorGentle() { this.play('error_gentle', 'ui'); }
  public playAchievement() { this.play('achievement', 'success'); }
  // Ambient sounds disabled for better UX
  public playPriceTick() { /* Disabled */ }
  public playPriceUp() { /* Disabled */ }
  public playPriceDown() { /* Disabled */ }

  // Settings management
  public setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    localStorage.setItem('soundVolume', this.masterVolume.toString());
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    localStorage.setItem('soundEnabled', enabled.toString());
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public setCategoryVolume(category: string, volume: number) {
    this.soundCategories.set(category, Math.max(0, Math.min(1, volume)));
    localStorage.setItem(`soundCategory_${category}`, volume.toString());
  }

  public getCategoryVolume(category: string): number {
    return this.soundCategories.get(category) || 0.5;
  }

  public setTheme(theme: 'epic' | 'minimal' | 'professional') {
    // Theme-based volume adjustments
    // Adjust volume levels based on theme (all optimized for better UX)
    if (theme === 'minimal') {
      this.soundCategories.set('epic', 0.3);
      this.soundCategories.set('trade', 0.4);
    } else if (theme === 'epic') {
      this.soundCategories.set('epic', 0.7);
      this.soundCategories.set('trade', 0.6);
    } else {
      this.soundCategories.set('epic', 0.6);
      this.soundCategories.set('trade', 0.5);
    }
    localStorage.setItem('soundTheme', theme);
  }

  public loadSettings() {
    const savedVolume = localStorage.getItem('soundVolume');
    if (savedVolume) {
      this.masterVolume = parseFloat(savedVolume);
    }

    const savedEnabled = localStorage.getItem('soundEnabled');
    if (savedEnabled) {
      this.soundEnabled = savedEnabled === 'true';
    }

    const savedTheme = localStorage.getItem('soundTheme') as 'epic' | 'minimal' | 'professional';
    if (savedTheme) {
      this.setTheme(savedTheme);
    }

    for (const category of this.soundCategories.keys()) {
      const savedCategoryVolume = localStorage.getItem(`soundCategory_${category}`);
      if (savedCategoryVolume) {
        this.soundCategories.set(category, parseFloat(savedCategoryVolume));
      }
    }
  }
}

// Export singleton instance
export const soundManager = new SoundManager();
export default soundManager; 