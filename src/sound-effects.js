/**
 * @callback SoundEffect
 * @param {AudioContext} audioContext
 * @returns {void}
 */

/**
 * @type {SoundEffect}
 */
export const tick = audioContext => {
	const gain = audioContext.createGain();
	ramp(gain.gain, audioContext.currentTime, [
		[zero, 0],
		[0.4, 0.01],
		[0.8, 0.02],
		[zero, 0.1],
	]);
	const filter = createFilter(audioContext, 'highpass', 4000);
	const oscillator = createOscillator(audioContext, 'square', 20, audioContext.currentTime, 0.1);
	oscillator.connect(filter);
	filter.connect(gain);
	gain.connect(audioContext.destination);
};

/**
 * @type {SoundEffect}
 */
export const tack = audioContext => {
	const gain = audioContext.createGain();
	ramp(gain.gain, audioContext.currentTime, [
		[zero, 0],
		[1, 0.016],
		[0.9, 0.032],
		[zero, 0.4],
	]);
	const filter = createFilter(audioContext, 'highpass', 2000);
	const oscillator = createOscillator(audioContext, 'square', 20, audioContext.currentTime, 0.4);
	oscillator.connect(filter);
	filter.connect(gain);
	gain.connect(audioContext.destination);
};

/**
 * @type {SoundEffect}
 */
export const buzz = audioContext => {
	for (const delay of [0, 0.06, 0.12]) {
		const startTime = audioContext.currentTime + delay;
		const gain = audioContext.createGain();
		ramp(gain.gain, startTime, [
			[zero, 0],
			[1, 0.12],
		]);
		const filter = createFilter(audioContext, 'highpass', 3000);
		const oscillator = createOscillator(audioContext, 'square', 30, startTime, 0.12);
		oscillator.connect(filter);
		filter.connect(gain);
		gain.connect(audioContext.destination);
	}
};

/**
 * @type {SoundEffect}
 */
export const plop = audioContext => {
	const gain = audioContext.createGain();
	ramp(gain.gain, audioContext.currentTime, [
		[zero, 0],
		[1, 0.02],
		[0.9, 0.04],
		[zero, 0.6],
	]);
	const filter = createFilter(audioContext, 'bandpass', 4000);
	const oscillator = createOscillator(audioContext, 'sine', 300, audioContext.currentTime, 0.6);
	ramp(oscillator.frequency, audioContext.currentTime, [
		[700, 0.1],
		[100, 0.4],
		[200, 0.6],
	]);
	oscillator.connect(filter);
	filter.connect(gain);
	gain.connect(audioContext.destination);
};

/**
 * @type {SoundEffect}
 */
export const fanfare = audioContext => {
	for (const [delay, duration] of [[0.14, 0.15], [0.3, 0.5]]) {
		const gain = audioContext.createGain();
		ramp(gain.gain, audioContext.currentTime + delay, [
			[zero, 0],
			[0.05, duration * 0.05],
			[0.04, duration * 0.1],
			[0.03, duration * 0.7],
			[0.02, duration * 0.95],
			[zero, duration],
		]);
		for (const frequency of [523.25, 587.33, 783.99]) {
			const oscillator = createOscillator(audioContext, 'sawtooth', frequency, audioContext.currentTime + delay, duration);
			oscillator.connect(gain);
			gain.connect(audioContext.destination);
		}
	}
};

/**
 * `0` cannot be used in {@link AudioParam.exponentialRampToValueAtTime}.
 */
const zero = 1e-10;

/**
 * @param {AudioContext} audioContext
 * @param {BiquadFilterType} type
 * @param {number} frequency
 * @returns {BiquadFilterNode}
 */
const createFilter = (audioContext, type, frequency) => {
	const filter = audioContext.createBiquadFilter();
	filter.type = type;
	filter.frequency.setValueAtTime(frequency, audioContext.currentTime);
	return filter;
};

/**
 * @param {AudioContext} audioContext
 * @param {OscillatorType} type
 * @param {number} frequency
 * @param {number} startTime
 * @param {number} duration
 * @returns {OscillatorNode}
 */
const createOscillator = (audioContext, type, frequency, startTime, duration) => {
	const oscillator = audioContext.createOscillator();
	oscillator.type = type;
	oscillator.frequency.setValueAtTime(frequency, startTime);
	oscillator.start(startTime);
	oscillator.stop(startTime + duration);
	return oscillator;
};

/**
 * @param {AudioParam} audioParam
 * @param {number} startTime
 * @param {Parameters<AudioParam['exponentialRampToValueAtTime']>[]} values
 */
const ramp = (audioParam, startTime, values) => {
	for (const [value, offset] of values) {
		audioParam.exponentialRampToValueAtTime(value, startTime + offset);
	}
};
