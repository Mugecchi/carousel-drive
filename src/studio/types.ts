export interface DriveImage {
	id: string;
	name: string;
	thumbnailLink?: string;
	createdTime?: string;
}

export interface IngredientEntry {
	label: string;
	image?: HTMLCanvasElement | HTMLImageElement;
}

export type TransitionStyle =
	| "auto-mix"
	| "prism-shatter"
	| "vortex-spin"
	| "rgb-chromatic"
	| "kaleido-tiles"
	| "curtain-split"
	| "diagonal-shutter"
	| "circle-iris"
	| "split-blinds"
	| "flip-3d"
	| "glitch-slice"
	| "zoom"
	| "crossfade";

export type ConcreteTransition = Exclude<TransitionStyle, "auto-mix">;

export type SlideContextVibe =
	| "warm-embers"
	| "cool-mist"
	| "botanical-petals"
	| "golden-bokeh"
	| "vibrant-prism";

export interface ImageVisualContext {
	dominantHex: string;
	secondaryHex: string;
	vibe: SlideContextVibe;
	brightness: number;
	warmth: number;
}

export type IntroStyle =
	| "showcase-cards"
	| "orbital-burst"
	| "cinema-reel"
	| "ai-custom";

export interface AiChoreographySpec {
	name: string;
	backdropEffect:
		| "aurora-waves"
		| "laser-grid"
		| "vortex-rings"
		| "starburst-rays";
	particleMotion:
		| "vortex"
		| "rising-sparks"
		| "orbit-halo"
		| "meteor-shower";
	cardTrajectory:
		| "spiral-vortex"
		| "wave-cascade"
		| "carousel-3d"
		| "pendulum-fan"
		| "zoom-matrix";
	titleAnimation: "elastic-drop" | "cyber-split" | "zoom-shockwave";
	outroFormation:
		| "constellation-ring"
		| "expanding-fan"
		| "floating-pillars";
	motionSpeed: number;
	spinIntensity: number;
}

export type VideoResolutionKey = "720p" | "1080p" | "1440p" | "4k";

export interface ResolutionPreset {
	label: string;
	width: number;
	height: number;
	scale: number;
	driveSizeParam: number;
	bitrateMultiplier: number;
}

export const RESOLUTION_PRESETS: Record<VideoResolutionKey, ResolutionPreset> =
	{
		"720p": {
			label: "720p HD (1280×720)",
			width: 1280,
			height: 720,
			scale: 1,
			driveSizeParam: 1280,
			bitrateMultiplier: 1,
		},
		"1080p": {
			label: "1080p Full HD (1920×1080)",
			width: 1920,
			height: 1080,
			scale: 1.5,
			driveSizeParam: 1920,
			bitrateMultiplier: 1.8,
		},
		"1440p": {
			label: "1440p 2K QHD (2560×1440)",
			width: 2560,
			height: 1440,
			scale: 2,
			driveSizeParam: 2560,
			bitrateMultiplier: 2.8,
		},
		"4k": {
			label: "4K Ultra HD (3840×2160)",
			width: 3840,
			height: 2160,
			scale: 3,
			driveSizeParam: 3200,
			bitrateMultiplier: 4.5,
		},
	};

export interface StudioRenderConfig {
	resolution: VideoResolutionKey;
	enableIntro: boolean;
	introTitle: string;
	introSubtitle: string;
	introDuration: number;
	introStyle: IntroStyle;
	enableOutro: boolean;
	outroTitle: string;
	outroSubtitle: string;
	outroDuration: number;
	slideDuration: number;
	transitionDuration: number;
	transitionStyle: TransitionStyle;
	kenBurns: boolean;
	contextEffects: boolean;
	themePrimary: string;
	themeAccent: string;
	themeBg: string;
	useAiBackdrop: boolean;
	useAiOutroAnim: boolean;
	aiChoreography: AiChoreographySpec | null;
	aiIntroArt: HTMLImageElement | null;
	aiOutroArt: HTMLImageElement | null;
}

export const CONCRETE_TRANSITIONS: ConcreteTransition[] = [
	"prism-shatter",
	"vortex-spin",
	"rgb-chromatic",
	"kaleido-tiles",
	"curtain-split",
	"diagonal-shutter",
	"circle-iris",
	"split-blinds",
	"flip-3d",
	"glitch-slice",
	"zoom",
	"crossfade",
];

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

export function cleanIngredientName(filename: string): string {
	return filename
		.replace(/\.[^/.]+$/, "")
		.replace(/[_-]+/g, " ")
		.trim();
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const cleaned = hex.replace("#", "").trim();
	const full =
		cleaned.length === 3
			? cleaned
					.split("")
					.map((c) => c + c)
					.join("")
			: cleaned.padEnd(6, "0");
	const num = Number.parseInt(full.slice(0, 6), 16) || 0;
	return {
		r: (num >> 16) & 255,
		g: (num >> 8) & 255,
		b: num & 255,
	};
}

export function rgbaFromHex(hex: string, alpha: number): string {
	const { r, g, b } = hexToRgb(hex);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const easeInOutCubic = (t: number) =>
	t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeOutBack = (t: number) => {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
