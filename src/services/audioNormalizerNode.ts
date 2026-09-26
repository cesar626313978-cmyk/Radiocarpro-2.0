/**
 * audioNormalizerNode.ts
 * Nivelación Dinámica y Control Automático de Ganancia (AGC) en tiempo real para Web Audio API.
 * 
 * Diseñado específicamente para compensar saltos bruscos de volumen (Loudness War vs grabaciones dinámicas)
 * en bibliotecas heterogéneas (Google Drive) y transmisiones de audio sin requerir decodificación previa pesada,
 * protegiendo el procesador en entornos vehiculares (Tesla Chromium) y dispositivos móviles.
 */

export interface NormalizerConfig {
  threshold: number;  // Umbral en dBFS a partir del cual comprime
  knee: number;       // Curvatura de transición suave en dB
  ratio: number;      // Ratio de compresión dinámica
  attack: number;     // Tiempo de ataque en segundos (reacción ante transitorios)
  release: number;    // Tiempo de relajación en segundos (evita el "bombeo" o pumping)
  makeupGain: number; // Compensación de volumen perceptivo en dB
}

export const CAR_AUDIO_PROFILE: NormalizerConfig = {
  threshold: -24,    // Captura la mayoría de pistas dinámicas sin distorsionar
  knee: 12,          // Transición suave de compresión
  ratio: 4,          // Compresión moderada para uniformar picos
  attack: 0.003,     // 3 ms: contención instantánea de transitorios
  release: 0.25,     // 250 ms: relajación natural del volumen
  makeupGain: 3.5,   // +3.5 dB para compensar la pérdida por compresión
};

export class AudioNormalizer {
  private compressor: DynamicsCompressorNode | null = null;
  private makeupGainNode: GainNode | null = null;
  private isEnabled: boolean = true;

  constructor(private ctx: AudioContext) {
    this.initNodes();
  }

  private initNodes(): void {
    // 1. Compresor de dinámica RMS y control automático de ganancia
    this.compressor = this.ctx.createDynamicsCompressor();
    this.setProfile(CAR_AUDIO_PROFILE);

    // 2. Ganancia de compensación estática (Makeup Gain)
    this.makeupGainNode = this.ctx.createGain();
    const gainLinear = Math.pow(10, CAR_AUDIO_PROFILE.makeupGain / 20);
    this.makeupGainNode.gain.value = gainLinear;

    // Enrutar: Compresor -> Makeup Gain
    this.compressor.connect(this.makeupGainNode);
  }

  public getInputNode(): DynamicsCompressorNode {
    if (!this.compressor) throw new Error('[AudioNormalizer] Nodos no instanciados.');
    return this.compressor;
  }

  public getOutputNode(): GainNode {
    if (!this.makeupGainNode) throw new Error('[AudioNormalizer] Nodos no instanciados.');
    return this.makeupGainNode;
  }

  public setProfile(config: NormalizerConfig): void {
    if (!this.compressor) return;
    const now = this.ctx.currentTime;

    this.compressor.threshold.setValueAtTime(config.threshold, now);
    this.compressor.knee.setValueAtTime(config.knee, now);
    this.compressor.ratio.setValueAtTime(config.ratio, now);
    this.compressor.attack.setValueAtTime(config.attack, now);
    this.compressor.release.setValueAtTime(config.release, now);

    if (this.makeupGainNode) {
      const targetGain = this.isEnabled ? Math.pow(10, config.makeupGain / 20) : 1.0;
      this.makeupGainNode.gain.setTargetAtTime(targetGain, now, 0.05);
    }
  }

  public toggleNormalizer(enable: boolean): void {
    this.isEnabled = enable;
    const now = this.ctx.currentTime;
    if (!this.makeupGainNode || !this.compressor) return;

    if (enable) {
      this.compressor.ratio.setTargetAtTime(CAR_AUDIO_PROFILE.ratio, now, 0.05);
      const targetGain = Math.pow(10, CAR_AUDIO_PROFILE.makeupGain / 20);
      this.makeupGainNode.gain.setTargetAtTime(targetGain, now, 0.05);
    } else {
      // Modo bypass transparente: ratio 1:1 y ganancia 0 dB (1.0 lineal)
      this.compressor.ratio.setTargetAtTime(1, now, 0.05);
      this.makeupGainNode.gain.setTargetAtTime(1.0, now, 0.05);
    }
  }

  public isNormalizerEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Monitoriza en tiempo real cuántos decibelios está atenuando el compresor.
   * Útil para telemetría acústica o vúmetro en la UI.
   */
  public getReduction(): number {
    return this.compressor ? this.compressor.reduction : 0;
  }
}
