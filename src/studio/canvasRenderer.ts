import { drawImageContextEffects } from "./imageContextEffects";
import {
	CANVAS_HEIGHT,
	CANVAS_WIDTH,
	CONCRETE_TRANSITIONS,
	type ConcreteTransition,
	type DriveImage,
	type ImageVisualContext,
	type IngredientEntry,
	RESOLUTION_PRESETS,
	type StudioRenderConfig,
	easeInOutCubic,
	easeOutBack,
	rgbaFromHex,
} from "./types";

// Reusable singleton offscreen buffers sized to the target output resolution
let sharedFromBuffer: HTMLCanvasElement | null = null;
let sharedToBuffer: HTMLCanvasElement | null = null;

function getSharedBuffers(
	targetWidth: number,
	targetHeight: number,
): {
	fromBuf: HTMLCanvasElement;
	toBuf: HTMLCanvasElement;
} {
	if (
		!sharedFromBuffer ||
		sharedFromBuffer.width !== targetWidth ||
		sharedFromBuffer.height !== targetHeight
	) {
		sharedFromBuffer = document.createElement("canvas");
		sharedFromBuffer.width = targetWidth;
		sharedFromBuffer.height = targetHeight;
	}
	if (
		!sharedToBuffer ||
		sharedToBuffer.width !== targetWidth ||
		sharedToBuffer.height !== targetHeight
	) {
		sharedToBuffer = document.createElement("canvas");
		sharedToBuffer.width = targetWidth;
		sharedToBuffer.height = targetHeight;
	}
	return { fromBuf: sharedFromBuffer, toBuf: sharedToBuffer };
}

function withLogicalScale(
	ctx: CanvasRenderingContext2D,
	scale: number,
	fn: () => void,
) {
	ctx.save();
	if (scale !== 1) {
		ctx.scale(scale, scale);
	}
	fn();
	ctx.restore();
}

// Pre-bake a slide's expensive blurred backdrop + normalized foreground image once when loaded.
// This eliminates real-time `ctx.filter = "blur(28px)"` on every animation frame, preventing frame drops & memory crashes on 3+ min videos.
export interface PreparedSlide {
	backdropCanvas: HTMLCanvasElement;
	sourceImage: HTMLImageElement;
}

export function createPrebakedSlideCanvas(
	img: HTMLImageElement,
	themeBg: string,
): HTMLCanvasElement {
	const buf = document.createElement("canvas");
	buf.width = CANVAS_WIDTH;
	buf.height = CANVAS_HEIGHT;
	const bctx = buf.getContext("2d")!;

	bctx.fillStyle = themeBg;
	bctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	const bgScale =
		Math.max(CANVAS_WIDTH / img.width, CANVAS_HEIGHT / img.height) * 1.15;
	const bgW = img.width * bgScale;
	const bgH = img.height * bgScale;

	bctx.save();
	bctx.filter = "blur(28px) brightness(0.42) saturate(1.25)";
	bctx.drawImage(
		img,
		(CANVAS_WIDTH - bgW) / 2,
		(CANVAS_HEIGHT - bgH) / 2,
		bgW,
		bgH,
	);
	bctx.restore();

	return buf;
}

// Auto-fit & word-wrap text inside `maxWidth` so long headlines or subtitles never overflow the canvas
export function drawFittedWrappedText(
	ctx: CanvasRenderingContext2D,
	text: string,
	centerX: number,
	startY: number,
	maxWidth: number,
	initialFontSize: number,
	minFontSize: number,
	fontWeight: number,
	maxLines: number,
	lineHeightMultiplier = 1.2,
): number {
	const cleaned = text.trim();
	if (!cleaned) return startY;

	let fontSize = initialFontSize;
	let lines: string[] = [];

	const computeLines = (size: number): string[] => {
		ctx.font = `${fontWeight} ${size}px system-ui, -apple-system, sans-serif`;
		const words = cleaned.split(/\s+/);
		const result: string[] = [];
		let currentLine = "";

		for (const word of words) {
			if (ctx.measureText(word).width > maxWidth) {
				if (currentLine) {
					result.push(currentLine);
					currentLine = "";
				}
				let chunk = "";
				for (const ch of word) {
					const testChunk = chunk + ch;
					if (ctx.measureText(testChunk).width > maxWidth && chunk) {
						result.push(chunk);
						chunk = ch;
					} else {
						chunk = testChunk;
					}
				}
				currentLine = chunk;
				continue;
			}

			const testLine = currentLine ? `${currentLine} ${word}` : word;
			if (ctx.measureText(testLine).width > maxWidth && currentLine) {
				result.push(currentLine);
				currentLine = word;
			} else {
				currentLine = testLine;
			}
		}
		if (currentLine) result.push(currentLine);
		return result;
	};

	while (fontSize >= minFontSize) {
		lines = computeLines(fontSize);
		if (lines.length <= maxLines) break;
		fontSize -= 2;
	}

	if (lines.length > maxLines) {
		const kept = lines.slice(0, maxLines);
		let last = `${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`;
		while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
			last = last.slice(0, -1).trimEnd();
		}
		kept[maxLines - 1] = `${last}…`;
		lines = kept;
	}

	const lineHeight = fontSize * lineHeightMultiplier;
	for (let i = 0; i < lines.length; i++) {
		ctx.fillText(lines[i], centerX, startY + i * lineHeight, maxWidth);
	}

	return startY + lines.length * lineHeight;
}

function drawThemedBackdrop(
	ctx: CanvasRenderingContext2D,
	progressRatio: number,
	prebakedBackdrops: HTMLCanvasElement[],
	aiArt: HTMLImageElement | null,
	cfg: StudioRenderConfig,
) {
	const angle = progressRatio * Math.PI * 0.4;
	const gx = CANVAS_WIDTH * (0.5 + Math.cos(angle) * 0.35);
	const gy = CANVAS_HEIGHT * (0.5 + Math.sin(angle) * 0.35);
	const grad = ctx.createRadialGradient(
		gx,
		gy,
		40,
		CANVAS_WIDTH / 2,
		CANVAS_HEIGHT / 2,
		CANVAS_WIDTH * 0.85,
	);
	grad.addColorStop(0, rgbaFromHex(cfg.themeAccent, 0.48));
	grad.addColorStop(0.5, cfg.themeBg);
	grad.addColorStop(1, "#020617");
	ctx.fillStyle = cfg.themeBg;
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	if (cfg.useAiBackdrop && aiArt) {
		ctx.save();
		const zoom = 1.02 + progressRatio * 0.08;
		const dw = CANVAS_WIDTH * zoom;
		const dh = CANVAS_HEIGHT * zoom;
		ctx.globalAlpha = 0.42;
		ctx.drawImage(
			aiArt,
			(CANVAS_WIDTH - dw) / 2,
			(CANVAS_HEIGHT - dh) / 2,
			dw,
			dh,
		);
		ctx.restore();
	} else if (prebakedBackdrops.length > 0) {
		// Use pre-blurred backdrop canvas instead of live CSS blur filter
		ctx.save();
		ctx.globalAlpha = 0.35;
		ctx.drawImage(prebakedBackdrops[0], 0, 0);
		ctx.restore();
	}

	for (let i = 0; i < 16; i++) {
		const px =
			((i * 197 + progressRatio * 180 * (i % 2 === 0 ? 1 : -1)) %
				CANVAS_WIDTH +
				CANVAS_WIDTH) %
			CANVAS_WIDTH;
		const py =
			((i * 113 - progressRatio * 140) % CANVAS_HEIGHT + CANVAS_HEIGHT) %
			CANVAS_HEIGHT;
		const radius = 2 + (i % 4) * 1.5;
		ctx.save();
		ctx.beginPath();
		ctx.arc(px, py, radius, 0, Math.PI * 2);
		ctx.fillStyle =
			i % 2 === 0
				? rgbaFromHex(cfg.themePrimary, 0.45)
				: rgbaFromHex(cfg.themeAccent, 0.45);
		ctx.fill();
		ctx.restore();
	}
}

export function renderIntroScene(
	ctx: CanvasRenderingContext2D,
	loadedSlides: HTMLImageElement[],
	prebakedBackdrops: HTMLCanvasElement[],
	entries: IngredientEntry[],
	introProgress: number,
	cfg: StudioRenderConfig,
) {
	ctx.save();
	drawThemedBackdrop(
		ctx,
		introProgress,
		prebakedBackdrops,
		cfg.aiIntroArt,
		cfg,
	);

	const hasEntries = entries.length > 0;
	const titleT = Math.min(1, introProgress / 0.28);
	const titleEase = easeOutBack(titleT);

	ctx.save();
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	if (hasEntries) {
		ctx.globalAlpha = Math.min(1, introProgress * 4);
		ctx.fillStyle = rgbaFromHex(cfg.themePrimary, 0.25);
		ctx.strokeStyle = rgbaFromHex(cfg.themePrimary, 0.65);
		ctx.lineWidth = 1.5;
		const badgeW = 240;
		const badgeH = 32;
		ctx.beginPath();
		ctx.roundRect(
			(CANVAS_WIDTH - badgeW) / 2,
			58 - (1 - titleEase) * 20,
			badgeW,
			badgeH,
			999,
		);
		ctx.fill();
		ctx.stroke();

		ctx.font = "600 13px system-ui, -apple-system, sans-serif";
		ctx.fillStyle = "#f8fafc";
		ctx.fillText(
			`${entries.length} SELECTED INGREDIENT${entries.length === 1 ? "" : "S"}`,
			CANVAS_WIDTH / 2,
			74 - (1 - titleEase) * 20,
		);
	}

	const safeMaxWidth = CANVAS_WIDTH - 140;
	const titleStartY =
		(hasEntries ? 118 : CANVAS_HEIGHT / 2 - 40) - (1 - titleEase) * 28;
	ctx.fillStyle = "#f8fafc";
	ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
	ctx.shadowBlur = 22;
	const afterTitleY = drawFittedWrappedText(
		ctx,
		cfg.introTitle || "Featured Ingredients",
		CANVAS_WIDTH / 2,
		titleStartY,
		safeMaxWidth,
		hasEntries ? 48 : 60,
		24,
		800,
		2,
		1.15,
	);

	let afterHeaderY = afterTitleY;
	if (cfg.introSubtitle) {
		ctx.fillStyle = "#cbd5e1";
		ctx.shadowBlur = 8;
		afterHeaderY = drawFittedWrappedText(
			ctx,
			cfg.introSubtitle,
			CANVAS_WIDTH / 2,
			afterTitleY + 6,
			safeMaxWidth,
			20,
			14,
			500,
			2,
			1.25,
		);
	}

	if (!hasEntries) {
		const barW = 140 * titleEase;
		ctx.fillStyle = cfg.themePrimary;
		ctx.beginPath();
		ctx.roundRect(
			(CANVAS_WIDTH - barW) / 2,
			afterHeaderY + 18,
			barW,
			5,
			999,
		);
		ctx.fill();
	}
	ctx.restore();

	if (hasEntries && cfg.introStyle === "showcase-cards") {
		const maxCards = Math.min(8, entries.length);
		const cols = Math.min(4, maxCards);
		const rows = Math.ceil(maxCards / cols);
		const cardW = cols >= 4 ? 235 : 260;
		const cardH = rows > 1 ? 195 : 250;
		const gapX = 24;
		const gapY = 22;
		const totalGridW = cols * cardW + (cols - 1) * gapX;
		const totalGridH = rows * cardH + (rows - 1) * gapY;
		const startX = (CANVAS_WIDTH - totalGridW) / 2;
		const startY = 225 + Math.max(0, (430 - totalGridH) / 2);

		for (let i = 0; i < maxCards; i++) {
			const entry = entries[i];
			const staggerStart = 0.1 + (i / maxCards) * 0.42;
			const localT = Math.max(
				0,
				Math.min(1, (introProgress - staggerStart) / 0.32),
			);
			if (localT <= 0) continue;
			const pop = easeOutBack(localT);

			const col = i % cols;
			const row = Math.floor(i / cols);
			const cx = startX + col * (cardW + gapX) + cardW / 2;
			const cy = startY + row * (cardH + gapY) + cardH / 2;

			const floatY = Math.sin(introProgress * Math.PI * 2.5 + i * 0.9) * 5;
			const tilt = (i % 2 === 0 ? 1 : -1) * 0.025 * (1 - localT * 0.5);

			ctx.save();
			ctx.translate(cx, cy + (1 - pop) * 55 + floatY);
			ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
			ctx.rotate(tilt);
			ctx.globalAlpha = Math.min(1, localT * 1.4);

			ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
			ctx.shadowBlur = 24;
			ctx.shadowOffsetY = 10;
			ctx.fillStyle = rgbaFromHex(cfg.themeBg, 0.9);
			ctx.strokeStyle = rgbaFromHex(cfg.themePrimary, 0.55);
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
			ctx.fill();
			ctx.stroke();

			const slideImg =
				entry.image ?? loadedSlides[i % Math.max(1, loadedSlides.length)];
			if (slideImg) {
				const imgBoxW = cardW - 20;
				const imgBoxH = cardH - 58;
				const imgX = -cardW / 2 + 10;
				const imgY = -cardH / 2 + 10;

				ctx.save();
				ctx.beginPath();
				ctx.roundRect(imgX, imgY, imgBoxW, imgBoxH, 10);
				ctx.clip();

				const scale = Math.max(
					imgBoxW / slideImg.width,
					imgBoxH / slideImg.height,
				);
				const dw = slideImg.width * scale;
				const dh = slideImg.height * scale;
				ctx.drawImage(
					slideImg,
					imgX + (imgBoxW - dw) / 2,
					imgY + (imgBoxH - dh) / 2,
					dw,
					dh,
				);
				ctx.restore();
			}

			ctx.font = "700 15px system-ui, -apple-system, sans-serif";
			ctx.fillStyle = "#f8fafc";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			const truncated =
				entry.label.length > 22
					? `${entry.label.slice(0, 20)}…`
					: entry.label;
			ctx.fillText(truncated, 0, cardH / 2 - 24);

			ctx.restore();
		}
	} else if (hasEntries && cfg.introStyle === "orbital-burst") {
		const centerX = CANVAS_WIDTH / 2;
		const centerY = 445;

		if (loadedSlides[0]) {
			const heroImg =
				entries[Math.floor(introProgress * entries.length) % entries.length]
					?.image ?? loadedSlides[0];
			const heroR = 110 * easeOutBack(Math.min(1, introProgress * 2.5));
			ctx.save();
			ctx.shadowColor = rgbaFromHex(cfg.themePrimary, 0.65);
			ctx.shadowBlur = 35;
			ctx.beginPath();
			ctx.arc(centerX, centerY, Math.max(1, heroR), 0, Math.PI * 2);
			ctx.clip();
			const s = Math.max(
				(heroR * 2) / heroImg.width,
				(heroR * 2) / heroImg.height,
			);
			ctx.drawImage(
				heroImg,
				centerX - (heroImg.width * s) / 2,
				centerY - (heroImg.height * s) / 2,
				heroImg.width * s,
				heroImg.height * s,
			);
			ctx.restore();

			ctx.save();
			ctx.strokeStyle = cfg.themePrimary;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(centerX, centerY, Math.max(1, heroR), 0, Math.PI * 2);
			ctx.stroke();
			ctx.restore();
		}

		const count = Math.min(10, entries.length);
		for (let i = 0; i < count; i++) {
			const entry = entries[i];
			const delay = 0.08 + (i / count) * 0.35;
			const localT = Math.max(0, Math.min(1, (introProgress - delay) / 0.35));
			if (localT <= 0) continue;
			const pop = easeOutBack(localT);

			const baseAngle =
				(i / count) * Math.PI * 2 + introProgress * 0.85 - Math.PI / 2;
			const rx = 360 * pop;
			const ry = 175 * pop;
			const bx = centerX + Math.cos(baseAngle) * rx;
			const by = centerY + Math.sin(baseAngle) * ry;

			ctx.save();
			ctx.translate(bx, by);
			ctx.scale(pop, pop);
			ctx.globalAlpha = Math.min(1, localT * 1.5);

			ctx.font = "700 15px system-ui, -apple-system, sans-serif";
			const textW = ctx.measureText(entry.label).width;
			const pillW = Math.min(240, textW + 62);
			const pillH = 46;

			ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
			ctx.shadowBlur = 16;
			ctx.fillStyle = rgbaFromHex(cfg.themeBg, 0.92);
			ctx.strokeStyle = cfg.themePrimary;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 999);
			ctx.fill();
			ctx.stroke();

			const thumb = entry.image;
			if (thumb) {
				ctx.save();
				ctx.beginPath();
				ctx.arc(-pillW / 2 + 23, 0, 16, 0, Math.PI * 2);
				ctx.clip();
				ctx.drawImage(thumb, -pillW / 2 + 7, -16, 32, 32);
				ctx.restore();
			}

			ctx.fillStyle = "#f8fafc";
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			const truncated =
				entry.label.length > 18
					? `${entry.label.slice(0, 16)}…`
					: entry.label;
			ctx.fillText(truncated, -pillW / 2 + (thumb ? 46 : 20), 1);

			ctx.restore();
		}
	} else if (cfg.introStyle === "cinema-reel") {
		const stripY = hasEntries ? 235 : 275;
		const stripH = hasEntries ? 260 : 340;
		const cardW = hasEntries ? 310 : 380;
		const gap = 20;
		const count = Math.max(1, loadedSlides.length);
		const scrollOffset = introProgress * 320;

		for (let i = 0; i < count * 2; i++) {
			const img = loadedSlides[i % count];
			if (!img) continue;
			const x = 60 + i * (cardW + gap) - scrollOffset;
			if (x + cardW < -50 || x > CANVAS_WIDTH + 50) continue;

			ctx.save();
			ctx.shadowColor = "rgba(0,0,0,0.5)";
			ctx.shadowBlur = 20;
			ctx.beginPath();
			ctx.roundRect(x, stripY, cardW, stripH, 16);
			ctx.clip();
			const s = Math.max(cardW / img.width, stripH / img.height);
			ctx.drawImage(
				img,
				x + (cardW - img.width * s) / 2,
				stripY + (stripH - img.height * s) / 2,
				img.width * s,
				img.height * s,
			);
			ctx.restore();
		}

		if (hasEntries) {
			const tagY = 565;
			const maxTags = Math.min(7, entries.length);
			const pills: { label: string; w: number }[] = [];
			ctx.font = "700 16px system-ui, -apple-system, sans-serif";
			for (let i = 0; i < maxTags; i++) {
				const lbl = entries[i].label;
				const w = Math.min(210, ctx.measureText(lbl).width + 36);
				pills.push({ label: lbl, w });
			}
			const totalW =
				pills.reduce((acc, p) => acc + p.w, 0) +
				Math.max(0, pills.length - 1) * 12;
			let curX = (CANVAS_WIDTH - totalW) / 2;

			for (let i = 0; i < pills.length; i++) {
				const delay = 0.15 + i * 0.07;
				const localT = Math.max(
					0,
					Math.min(1, (introProgress - delay) / 0.25),
				);
				if (localT <= 0) continue;
				const p = pills[i];

				ctx.save();
				ctx.globalAlpha = localT;
				ctx.fillStyle = rgbaFromHex(cfg.themePrimary, 0.32);
				ctx.strokeStyle = cfg.themePrimary;
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.roundRect(curX, tagY + (1 - localT) * 20, p.w, 42, 999);
				ctx.fill();
				ctx.stroke();

				ctx.fillStyle = "#f8fafc";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText(
					p.label,
					curX + p.w / 2,
					tagY + 21 + (1 - localT) * 20,
				);
				ctx.restore();

				curX += p.w + 12;
			}
		}
	} else if (cfg.introStyle === "ai-custom" && cfg.aiChoreography) {
		const aiChoreography = cfg.aiChoreography;
		const spd = aiChoreography.motionSpeed;
		const spin = aiChoreography.spinIntensity;

		ctx.save();
		if (aiChoreography.backdropEffect === "aurora-waves") {
			for (let w = 0; w < 3; w++) {
				ctx.beginPath();
				const baseY = 260 + w * 130;
				ctx.moveTo(0, CANVAS_HEIGHT);
				for (let x = 0; x <= CANVAS_WIDTH; x += 32) {
					const y =
						baseY +
						Math.sin(x * 0.006 + introProgress * Math.PI * 3 * spd + w) *
							55 *
							spin;
					ctx.lineTo(x, y);
				}
				ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
				ctx.closePath();
				ctx.fillStyle =
					w % 2 === 0
						? rgbaFromHex(cfg.themePrimary, 0.14)
						: rgbaFromHex(cfg.themeAccent, 0.14);
				ctx.fill();
			}
		} else if (aiChoreography.backdropEffect === "vortex-rings") {
			for (let r = 1; r <= 6; r++) {
				const radius = ((r * 110 + introProgress * 260 * spd) % 720) + 40;
				ctx.beginPath();
				ctx.arc(
					CANVAS_WIDTH / 2,
					CANVAS_HEIGHT / 2 + 40,
					radius,
					0,
					Math.PI * 2,
				);
				ctx.strokeStyle =
					r % 2 === 0
						? rgbaFromHex(cfg.themePrimary, 0.25)
						: rgbaFromHex(cfg.themeAccent, 0.25);
				ctx.lineWidth = 2.5;
				ctx.stroke();
			}
		} else if (aiChoreography.backdropEffect === "starburst-rays") {
			ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
			ctx.rotate(introProgress * 0.9 * spd);
			for (let i = 0; i < 16; i++) {
				ctx.rotate((Math.PI * 2) / 16);
				ctx.fillStyle =
					i % 2 === 0
						? rgbaFromHex(cfg.themePrimary, 0.1)
						: rgbaFromHex(cfg.themeAccent, 0.08);
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.lineTo(-45, 800);
				ctx.lineTo(45, 800);
				ctx.closePath();
				ctx.fill();
			}
		} else if (aiChoreography.backdropEffect === "laser-grid") {
			const horizonY = 260;
			ctx.strokeStyle = rgbaFromHex(cfg.themePrimary, 0.26);
			ctx.lineWidth = 1.5;
			for (let i = -8; i <= 8; i++) {
				ctx.beginPath();
				ctx.moveTo(CANVAS_WIDTH / 2 + i * 35, horizonY);
				ctx.lineTo(CANVAS_WIDTH / 2 + i * 190, CANVAS_HEIGHT);
				ctx.stroke();
			}
			for (let j = 0; j < 8; j++) {
				const p = (j / 8 + introProgress * spd) % 1;
				const y = horizonY + Math.pow(p, 1.8) * (CANVAS_HEIGHT - horizonY);
				ctx.beginPath();
				ctx.moveTo(0, y);
				ctx.lineTo(CANVAS_WIDTH, y);
				ctx.stroke();
			}
		}
		ctx.restore();

		const visualCount = hasEntries
			? Math.min(8, entries.length)
			: Math.min(6, loadedSlides.length);

		for (let i = 0; i < visualCount; i++) {
			const entry = hasEntries ? entries[i] : undefined;
			const slideImg =
				entry?.image ?? loadedSlides[i % Math.max(1, loadedSlides.length)];
			const delay = (i / Math.max(1, visualCount)) * 0.35;
			const localT = Math.max(
				0,
				Math.min(1, (introProgress - delay) / 0.45),
			);
			if (localT <= 0) continue;
			const pop = easeOutBack(localT);

			let cx = CANVAS_WIDTH / 2;
			let cy = 455;
			let scale = pop;
			let rot = 0;

			if (aiChoreography.cardTrajectory === "spiral-vortex") {
				const angle =
					(i / visualCount) * Math.PI * 2 +
					(1 - localT) * Math.PI * 1.8 * spin +
					introProgress * 0.7 * spd;
				const rad = (1 - localT) * 420 + 250;
				cx = CANVAS_WIDTH / 2 + Math.cos(angle) * rad;
				cy = 455 + Math.sin(angle) * (rad * 0.46);
				rot = Math.sin(angle) * 0.14 * spin;
			} else if (aiChoreography.cardTrajectory === "wave-cascade") {
				const spread = Math.min(
					220,
					(CANVAS_WIDTH - 220) / Math.max(1, visualCount),
				);
				const startX =
					CANVAS_WIDTH / 2 - ((visualCount - 1) * spread) / 2;
				cx = startX + i * spread;
				cy =
					450 +
					Math.sin(introProgress * Math.PI * 3 * spd + i * 0.85) * 48 * spin +
					(1 - pop) * 140;
				rot = Math.cos(introProgress * Math.PI * 2 * spd + i) * 0.08 * spin;
			} else if (aiChoreography.cardTrajectory === "carousel-3d") {
				const angle =
					(i / visualCount) * Math.PI * 2 +
					introProgress * Math.PI * 1.2 * spd;
				const depth = Math.sin(angle);
				cx = CANVAS_WIDTH / 2 + Math.cos(angle) * 370;
				cy = 455 + depth * 55;
				scale = pop * (0.72 + (depth + 1) * 0.22);
			} else if (aiChoreography.cardTrajectory === "pendulum-fan") {
				const norm = visualCount > 1 ? i / (visualCount - 1) - 0.5 : 0;
				const fanAngle =
					norm * 0.95 * pop +
					Math.sin(introProgress * Math.PI * 2 * spd) * 0.06;
				cx = CANVAS_WIDTH / 2 + Math.sin(fanAngle) * 420;
				cy = 560 - Math.cos(fanAngle) * 165;
				rot = fanAngle * 0.65;
			} else {
				const cols = Math.min(4, visualCount);
				const col = i % cols;
				const row = Math.floor(i / cols);
				cx = CANVAS_WIDTH / 2 + (col - (cols - 1) / 2) * 245;
				cy = 365 + row * 185;
				scale =
					pop *
					(0.92 + Math.sin(introProgress * Math.PI * 3 * spd + i) * 0.08);
			}

			const cardW = 210;
			const cardH = entry ? 185 : 155;

			ctx.save();
			ctx.translate(cx, cy);
			ctx.scale(scale, scale);
			ctx.rotate(rot);
			ctx.globalAlpha = Math.min(1, localT * 1.35);

			ctx.shadowColor = rgbaFromHex(cfg.themePrimary, 0.55);
			ctx.shadowBlur = 24;
			ctx.fillStyle = rgbaFromHex(cfg.themeBg, 0.9);
			ctx.strokeStyle = i % 2 === 0 ? cfg.themePrimary : cfg.themeAccent;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
			ctx.fill();
			ctx.stroke();

			if (slideImg) {
				const imgW = cardW - 16;
				const imgH = entry ? cardH - 48 : cardH - 16;
				ctx.save();
				ctx.beginPath();
				ctx.roundRect(-cardW / 2 + 8, -cardH / 2 + 8, imgW, imgH, 10);
				ctx.clip();
				const s = Math.max(imgW / slideImg.width, imgH / slideImg.height);
				ctx.drawImage(
					slideImg,
					-cardW / 2 + 8 + (imgW - slideImg.width * s) / 2,
					-cardH / 2 + 8 + (imgH - slideImg.height * s) / 2,
					slideImg.width * s,
					slideImg.height * s,
				);
				ctx.restore();
			}

			if (entry) {
				ctx.font = "700 14px system-ui, -apple-system, sans-serif";
				ctx.fillStyle = "#f8fafc";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				const truncated =
					entry.label.length > 20
						? `${entry.label.slice(0, 18)}…`
						: entry.label;
				ctx.fillText(truncated, 0, cardH / 2 - 20);
			}

			ctx.restore();
		}
	}

	ctx.restore();
}

export function renderOutroScene(
	ctx: CanvasRenderingContext2D,
	loadedSlides: HTMLImageElement[],
	prebakedBackdrops: HTMLCanvasElement[],
	entries: IngredientEntry[],
	outroProgress: number,
	cfg: StudioRenderConfig,
) {
	ctx.save();
	drawThemedBackdrop(
		ctx,
		outroProgress,
		prebakedBackdrops,
		cfg.aiOutroArt,
		cfg,
	);

	const titleT = Math.min(1, outroProgress / 0.32);
	const pop = easeOutBack(titleT);
	const hasEntries = entries.length > 0;

	const maxThumbs = Math.min(6, loadedSlides.length);
	if (maxThumbs > 0) {
		const r = 46;
		const spacing = 82;
		const startX = CANVAS_WIDTH / 2 - ((maxThumbs - 1) * spacing) / 2;
		const baseCy = hasEntries ? 210 : 245;

		for (let i = 0; i < maxThumbs; i++) {
			const img = loadedSlides[i];
			const itemT = Math.max(
				0,
				Math.min(1, (outroProgress - i * 0.05) / 0.35),
			);
			if (itemT <= 0) continue;
			const s = easeOutBack(itemT);

			let cx = startX + i * spacing;
			let cy = baseCy;
			let rot = 0;

			if (cfg.useAiOutroAnim && cfg.aiChoreography) {
				const spd = cfg.aiChoreography.motionSpeed;
				if (cfg.aiChoreography.outroFormation === "constellation-ring") {
					const ang =
						(i / maxThumbs) * Math.PI * 2 +
						outroProgress * Math.PI * 0.9 * spd;
					cx = CANVAS_WIDTH / 2 + Math.cos(ang) * 260 * s;
					cy = baseCy + Math.sin(ang) * 48 * s;
				} else if (cfg.aiChoreography.outroFormation === "expanding-fan") {
					const norm = maxThumbs > 1 ? i / (maxThumbs - 1) - 0.5 : 0;
					cx = CANVAS_WIDTH / 2 + norm * 520 * s;
					cy =
						baseCy +
						Math.abs(norm) * 65 -
						Math.sin(outroProgress * Math.PI * 2 * spd + i) * 12;
					rot = norm * 0.45;
				} else {
					cy =
						baseCy +
						Math.sin(outroProgress * Math.PI * 3 * spd + i * 1.1) * 26;
				}
			}

			ctx.save();
			ctx.translate(cx, cy);
			ctx.scale(s, s);
			ctx.rotate(rot);
			ctx.shadowColor = "rgba(0,0,0,0.5)";
			ctx.shadowBlur = 18;
			ctx.beginPath();
			ctx.arc(0, 0, r, 0, Math.PI * 2);
			ctx.clip();
			const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
			ctx.drawImage(
				img,
				-(img.width * scale) / 2,
				-(img.height * scale) / 2,
				img.width * scale,
				img.height * scale,
			);
			ctx.restore();

			ctx.save();
			ctx.translate(cx, cy);
			ctx.scale(s, s);
			ctx.strokeStyle =
				i % 2 === 0 ? cfg.themePrimary : cfg.themeAccent;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(0, 0, r, 0, Math.PI * 2);
			ctx.stroke();
			ctx.restore();
		}
	}

	const safeMaxWidth = CANVAS_WIDTH - 140;
	const headlineY = (hasEntries ? 330 : 365) + (1 - pop) * 25;
	ctx.save();
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillStyle = "#f8fafc";
	ctx.shadowColor = "rgba(0,0,0,0.65)";
	ctx.shadowBlur = 22;
	const afterOutroTitleY = drawFittedWrappedText(
		ctx,
		cfg.outroTitle || "Thank You for Watching",
		CANVAS_WIDTH / 2,
		headlineY,
		safeMaxWidth,
		50,
		24,
		800,
		2,
		1.15,
	);

	let afterOutroTextY = afterOutroTitleY;
	if (cfg.outroSubtitle) {
		ctx.fillStyle = "#cbd5e1";
		ctx.shadowBlur = 8;
		afterOutroTextY = drawFittedWrappedText(
			ctx,
			cfg.outroSubtitle,
			CANVAS_WIDTH / 2,
			afterOutroTitleY + 6,
			safeMaxWidth,
			21,
			14,
			500,
			2,
			1.25,
		);
	}

	const barW = 180 * Math.min(1, outroProgress * 2.5);
	const barGrad = ctx.createLinearGradient(
		(CANVAS_WIDTH - barW) / 2,
		0,
		(CANVAS_WIDTH + barW) / 2,
		0,
	);
	barGrad.addColorStop(0, cfg.themePrimary);
	barGrad.addColorStop(1, cfg.themeAccent);
	ctx.fillStyle = barGrad;
	ctx.beginPath();
	ctx.roundRect(
		(CANVAS_WIDTH - barW) / 2,
		afterOutroTextY + 14,
		barW,
		5,
		999,
	);
	ctx.fill();
	ctx.restore();

	if (hasEntries) {
		const maxTags = Math.min(6, entries.length);
		ctx.font = "700 15px system-ui, -apple-system, sans-serif";
		const pills: { label: string; w: number }[] = [];
		for (let i = 0; i < maxTags; i++) {
			const lbl = entries[i].label;
			pills.push({
				label: lbl,
				w: Math.min(200, ctx.measureText(lbl).width + 34),
			});
		}
		const totalW =
			pills.reduce((acc, p) => acc + p.w, 0) +
			Math.max(0, pills.length - 1) * 10;
		let curX = (CANVAS_WIDTH - totalW) / 2;
		const tagY = 515;

		for (let i = 0; i < pills.length; i++) {
			const localT = Math.max(
				0,
				Math.min(1, (outroProgress - (0.18 + i * 0.05)) / 0.25),
			);
			if (localT <= 0) continue;
			const p = pills[i];
			ctx.save();
			ctx.globalAlpha = localT;
			ctx.fillStyle = rgbaFromHex(cfg.themeAccent, 0.28);
			ctx.strokeStyle = rgbaFromHex(cfg.themePrimary, 0.7);
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.roundRect(curX, tagY + (1 - localT) * 16, p.w, 38, 999);
			ctx.fill();
			ctx.stroke();

			ctx.fillStyle = "#f8fafc";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(
				p.label,
				curX + p.w / 2,
				tagY + 19 + (1 - localT) * 16,
			);
			ctx.restore();
			curX += p.w + 10;
		}
	}

	ctx.restore();
}

export function drawSlideContents(
	ctx: CanvasRenderingContext2D,
	img: HTMLImageElement,
	prebakedBackdrop: HTMLCanvasElement | undefined,
	visualContext: ImageVisualContext | undefined,
	slideIndex: number,
	slideProgress: number,
	ingredientLabel: string | undefined,
	cfg: StudioRenderConfig,
) {
	// Draw pre-baked 1280x720 blurred backdrop into the logical 1280x720 coordinate space
	if (prebakedBackdrop) {
		ctx.drawImage(prebakedBackdrop, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
	} else {
		ctx.fillStyle = cfg.themeBg;
		ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
	}

	ctx.save();
	ctx.fillStyle = rgbaFromHex(cfg.themeBg, 0.28);
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
	ctx.restore();

	// 2. Foreground contained image with optional Ken Burns zoom, pan & subtle 3D breathing tilt
	const baseScale =
		Math.min(CANVAS_WIDTH / img.width, CANVAS_HEIGHT / img.height) * 0.92;
	const zoomDir = slideIndex % 2 === 0 ? 1 : -1;
	const kbScale = cfg.kenBurns
		? zoomDir === 1
			? 1 + 0.1 * slideProgress
			: 1.1 - 0.1 * slideProgress
		: 1;
	const panX = cfg.kenBurns
		? (slideIndex % 3 === 0 ? 1 : -1) * 18 * (slideProgress - 0.5)
		: 0;
	const panY = cfg.kenBurns
		? (slideIndex % 2 === 0 ? -1 : 1) * 12 * (slideProgress - 0.5)
		: 0;

	const finalScale = baseScale * kbScale;
	const drawW = img.width * finalScale;
	const drawH = img.height * finalScale;
	const drawX = (CANVAS_WIDTH - drawW) / 2 + panX;
	const drawY = (CANVAS_HEIGHT - drawH) / 2 + panY;

	ctx.save();
	ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
	ctx.shadowBlur = 24;
	ctx.shadowOffsetY = 10;

	const radius = 18;
	ctx.beginPath();
	ctx.roundRect(drawX, drawY, drawW, drawH, radius);
	ctx.clip();
	ctx.drawImage(img, drawX, drawY, drawW, drawH);
	ctx.restore();

	// 3. Context-aware visual effects based on the image's extracted colors & semantic vibe
	if (cfg.contextEffects && visualContext) {
		drawImageContextEffects(ctx, visualContext, slideIndex, slideProgress, {
			x: drawX,
			y: drawY,
			w: drawW,
			h: drawH,
		});
	}

	// 4. Modern lower-third ingredient badge (only drawn when non-hidden)
	if (ingredientLabel) {
		const badgeEnter = Math.min(1, slideProgress / 0.18);
		const badgeExit = Math.min(1, (1 - slideProgress) / 0.15);
		const badgeAlpha = Math.max(0, Math.min(badgeEnter, badgeExit));
		const accentHex =
			cfg.contextEffects && visualContext
				? visualContext.dominantHex
				: cfg.themePrimary;

		ctx.save();
		ctx.globalAlpha = badgeAlpha;
		ctx.font = "700 18px system-ui, -apple-system, sans-serif";
		const textW = ctx.measureText(ingredientLabel).width;
		const boxW = textW + 44;
		const boxH = 44;
		const boxX = 48;
		const boxY = CANVAS_HEIGHT - 82 + (1 - badgeAlpha) * 16;

		ctx.fillStyle = rgbaFromHex(cfg.themeBg, 0.84);
		ctx.strokeStyle = rgbaFromHex(accentHex, 0.68);
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.roundRect(boxX, boxY, boxW, boxH, 12);
		ctx.fill();
		ctx.stroke();

		ctx.fillStyle = accentHex;
		ctx.beginPath();
		ctx.roundRect(boxX + 10, boxY + 10, 4, boxH - 20, 4);
		ctx.fill();

		ctx.fillStyle = "#f8fafc";
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		ctx.fillText(ingredientLabel, boxX + 24, boxY + boxH / 2 + 1);
		ctx.restore();
	}
}

export function drawModernTransition(
	ctx: CanvasRenderingContext2D,
	fromBuf: HTMLCanvasElement,
	toBuf: HTMLCanvasElement,
	rawT: number,
	mode: ConcreteTransition,
	cfg: StudioRenderConfig,
) {
	const t = easeInOutCubic(Math.max(0, Math.min(1, rawT)));

	if (mode === "crossfade") {
		ctx.drawImage(fromBuf, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		ctx.save();
		ctx.globalAlpha = t;
		ctx.drawImage(toBuf, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		ctx.restore();
	} else if (mode === "zoom") {
		ctx.save();
		const s1 = 1 + t * 0.45;
		ctx.globalAlpha = 1 - t;
		ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
		ctx.scale(s1, s1);
		ctx.drawImage(
			fromBuf,
			-CANVAS_WIDTH / 2,
			-CANVAS_HEIGHT / 2,
			CANVAS_WIDTH,
			CANVAS_HEIGHT,
		);
		ctx.restore();

		ctx.save();
		const s2 = 0.72 + t * 0.28;
		ctx.globalAlpha = t;
		ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
		ctx.scale(s2, s2);
		ctx.drawImage(
			toBuf,
			-CANVAS_WIDTH / 2,
			-CANVAS_HEIGHT / 2,
			CANVAS_WIDTH,
			CANVAS_HEIGHT,
		);
		ctx.restore();
	} else if (mode === "circle-iris") {
		ctx.drawImage(fromBuf, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		const maxRadius = Math.hypot(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
		const r = t * maxRadius;

		ctx.save();
		ctx.beginPath();
		ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, r, 0, Math.PI * 2);
		ctx.clip();
		ctx.drawImage(toBuf, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		ctx.restore();

		ctx.save();
		ctx.strokeStyle = cfg.themePrimary;
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, r, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	} else if (mode === "diagonal-shutter") {
		ctx.drawImage(fromBuf, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		const slant = 260;
		const sweepX = -slant + t * (CANVAS_WIDTH + slant * 2);

		ctx.save();
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(sweepX, 0);
		ctx.lineTo(sweepX - slant, CANVAS_HEIGHT);
		ctx.lineTo(0, CANVAS_HEIGHT);
		ctx.closePath();
		ctx.clip();
		ctx.drawImage(toBuf, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		ctx.restore();

		ctx.save();
		ctx.strokeStyle = cfg.themePrimary;
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.moveTo(sweepX, 0);
		ctx.lineTo(sweepX - slant, CANVAS_HEIGHT);
		ctx.stroke();
		ctx.restore();
	} else if (mode === "split-blinds") {
		ctx.drawImage(fromBuf, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		const numBlinds = 8;
		const blindW = CANVAS_WIDTH / numBlinds;

		for (let i = 0; i < numBlinds; i++) {
			const delay = (i / numBlinds) * 0.35;
			const localT = easeInOutCubic(
				Math.max(0, Math.min(1, (rawT - delay) / 0.65)),
			);
			if (localT <= 0) continue;

			const curW = blindW * localT;
			const x = i * blindW;
			ctx.save();
			ctx.beginPath();
			ctx.rect(x, 0, curW, CANVAS_HEIGHT);
			ctx.clip();
			ctx.drawImage(toBuf, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
			ctx.restore();
		}
	} else if (mode === "flip-3d") {
		ctx.fillStyle = cfg.themeBg;
		ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

		if (t < 0.5) {
			const phase = t * 2;
			const scaleX = Math.max(0.02, Math.cos((phase * Math.PI) / 2));
			ctx.save();
			ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
			ctx.scale(scaleX, 1 - phase * 0.08);
			ctx.drawImage(
				fromBuf,
				-CANVAS_WIDTH / 2,
				-CANVAS_HEIGHT / 2,
				CANVAS_WIDTH,
				CANVAS_HEIGHT,
			);
			ctx.fillStyle = `rgba(0, 0, 0, ${phase * 0.55})`;
			ctx.fillRect(
				-CANVAS_WIDTH / 2,
				-CANVAS_HEIGHT / 2,
				CANVAS_WIDTH,
				CANVAS_HEIGHT,
			);
			ctx.restore();
		} else {
			const phase = (t - 0.5) * 2;
			const scaleX = Math.max(0.02, Math.sin((phase * Math.PI) / 2));
			ctx.save();
			ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
			ctx.scale(scaleX, 0.92 + phase * 0.08);
			ctx.drawImage(
				toBuf,
				-CANVAS_WIDTH / 2,
				-CANVAS_HEIGHT / 2,
				CANVAS_WIDTH,
				CANVAS_HEIGHT,
			);
			ctx.fillStyle = `rgba(0, 0, 0, ${(1 - phase) * 0.55})`;
			ctx.fillRect(
				-CANVAS_WIDTH / 2,
				-CANVAS_HEIGHT / 2,
				CANVAS_WIDTH,
				CANVAS_HEIGHT,
			);
			ctx.restore();
		}
	} else if (mode === "glitch-slice") {
		const slices = 10;
		const sliceH = CANVAS_HEIGHT / slices;
		const intensity = Math.sin(t * Math.PI);

		for (let i = 0; i < slices; i++) {
			const dir = i % 2 === 0 ? 1 : -1;
			const shift =
				dir * intensity * (45 + (i % 3) * 25) * (1 - Math.abs(t - 0.5));
			const sy = i * sliceH;
			const sourceBuf = t < 0.5 ? fromBuf : toBuf;

			ctx.save();
			ctx.beginPath();
			ctx.rect(0, sy, CANVAS_WIDTH, sliceH + 1);
			ctx.clip();
			ctx.drawImage(sourceBuf, shift, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
			ctx.restore();
		}
	} else if (mode === "prism-shatter") {
		// Eye-catching Diamond / Prism Glass Shatter Reveal
		ctx.drawImage(fromBuf, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		const cols = 6;
		const rows = 4;
		const cellW = CANVAS_WIDTH / cols;
		const cellH = CANVAS_HEIGHT / rows;

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const distFromCenter =
					Math.hypot(c - (cols - 1) / 2, r - (rows - 1) / 2) /
					Math.hypot(cols / 2, rows / 2);
				const delay = distFromCenter * 0.38;
				const localT = easeInOutCubic(
					Math.max(0, Math.min(1, (rawT - delay) / 0.62)),
				);
				if (localT <= 0) continue;

				const cx = c * cellW + cellW / 2;
				const cy = r * cellH + cellH / 2;
				const rx = (cellW * 0.78) * localT;
				const ry = (cellH * 0.78) * localT;

				ctx.save();
				ctx.beginPath();
				ctx.moveTo(cx, cy - ry);
				ctx.lineTo(cx + rx, cy);
				ctx.lineTo(cx, cy + ry);
				ctx.lineTo(cx - rx, cy);
				ctx.closePath();
				ctx.clip();
				ctx.drawImage(toBuf, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
				ctx.restore();

				if (localT < 0.96) {
					ctx.save();
					ctx.strokeStyle = rgbaFromHex(cfg.themePrimary, (1 - localT) * 0.85);
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.moveTo(cx, cy - ry);
					ctx.lineTo(cx + rx, cy);
					ctx.lineTo(cx, cy + ry);
					ctx.lineTo(cx - rx, cy);
					ctx.closePath();
					ctx.stroke();
					ctx.restore();
				}
			}
		}
	} else if (mode === "vortex-spin") {
		// Dynamic Spiral Swirl Zoom Portal
		ctx.fillStyle = cfg.themeBg;
		ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

		ctx.save();
		ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
		ctx.rotate(t * Math.PI * 0.55);
		ctx.scale(1 - t * 0.65, 1 - t * 0.65);
		ctx.globalAlpha = 1 - t;
		ctx.drawImage(
			fromBuf,
			-CANVAS_WIDTH / 2,
			-CANVAS_HEIGHT / 2,
			CANVAS_WIDTH,
			CANVAS_HEIGHT,
		);
		ctx.restore();

		ctx.save();
		ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
		ctx.rotate(-(1 - t) * Math.PI * 0.55);
		const s2 = 0.35 + easeOutBack(t) * 0.65;
		ctx.scale(s2, s2);
		ctx.globalAlpha = t;
		ctx.drawImage(
			toBuf,
			-CANVAS_WIDTH / 2,
			-CANVAS_HEIGHT / 2,
			CANVAS_WIDTH,
			CANVAS_HEIGHT,
		);
		ctx.restore();
	} else if (mode === "rgb-chromatic") {
		// Cyberpunk Chromatic Split + Flash Pulse
		const pulse = Math.sin(t * Math.PI);
		const offset = pulse * 38;
		const baseBuf = t < 0.5 ? fromBuf : toBuf;

		ctx.drawImage(baseBuf, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

		ctx.save();
		ctx.globalCompositeOperation = "screen";
		ctx.globalAlpha = pulse * 0.65;
		ctx.drawImage(toBuf, -offset, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		ctx.drawImage(fromBuf, offset, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		ctx.restore();

		// Subtle light flash at the midpoint
		if (pulse > 0.6) {
			ctx.save();
			ctx.fillStyle = rgbaFromHex(cfg.themePrimary, (pulse - 0.6) * 0.45);
			ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
			ctx.restore();
		}
	} else if (mode === "kaleido-tiles") {
		// 3D Cascading Tile Mosaic Flip
		ctx.drawImage(fromBuf, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		const cols = 5;
		const rows = 3;
		const tileW = CANVAS_WIDTH / cols;
		const tileH = CANVAS_HEIGHT / rows;

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const order = (r + c) / (rows + cols - 2);
				const localT = easeOutBack(
					Math.max(0, Math.min(1, (rawT - order * 0.35) / 0.65)),
				);
				if (localT <= 0) continue;

				const tx = c * tileW;
				const ty = r * tileH;
				const w = tileW * Math.min(1, localT);
				const h = tileH * Math.min(1, localT);

				ctx.save();
				ctx.beginPath();
				ctx.roundRect(
					tx + (tileW - w) / 2,
					ty + (tileH - h) / 2,
					w,
					h,
					(1 - Math.min(1, localT)) * 18,
				);
				ctx.clip();
				ctx.drawImage(toBuf, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
				ctx.restore();
			}
		}
	} else if (mode === "curtain-split") {
		// Cinematic Dual Split Curtain Reveal (outgoing splits apart to reveal incoming)
		ctx.drawImage(toBuf, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		const slideOffset = t * (CANVAS_WIDTH / 2 + 20);

		// Left half of outgoing slide moving left
		ctx.save();
		ctx.beginPath();
		ctx.rect(0, 0, CANVAS_WIDTH / 2 - slideOffset, CANVAS_HEIGHT);
		ctx.clip();
		ctx.drawImage(fromBuf, -slideOffset, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		ctx.restore();

		// Right half of outgoing slide moving right
		ctx.save();
		ctx.beginPath();
		ctx.rect(
			CANVAS_WIDTH / 2 + slideOffset,
			0,
			CANVAS_WIDTH / 2 - slideOffset,
			CANVAS_HEIGHT,
		);
		ctx.clip();
		ctx.drawImage(fromBuf, slideOffset, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		ctx.restore();

		// Glowing seam edges
		ctx.save();
		ctx.strokeStyle = cfg.themePrimary;
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(CANVAS_WIDTH / 2 - slideOffset, 0);
		ctx.lineTo(CANVAS_WIDTH / 2 - slideOffset, CANVAS_HEIGHT);
		ctx.moveTo(CANVAS_WIDTH / 2 + slideOffset, 0);
		ctx.lineTo(CANVAS_WIDTH / 2 + slideOffset, CANVAS_HEIGHT);
		ctx.stroke();
		ctx.restore();
	}
}

function pickTransitionForSlide(
	slideIdx: number,
	style: StudioRenderConfig["transitionStyle"],
): ConcreteTransition {
	if (style !== "auto-mix") return style;
	return CONCRETE_TRANSITIONS[slideIdx % CONCRETE_TRANSITIONS.length];
}

export function renderCompositeFrame(
	ctx: CanvasRenderingContext2D,
	loadedSlides: HTMLImageElement[],
	prebakedBackdrops: HTMLCanvasElement[],
	visualContexts: ImageVisualContext[],
	selectedSlides: DriveImage[],
	entries: IngredientEntry[],
	elapsedSec: number,
	cfg: StudioRenderConfig,
	getSlideLabel: (slide?: DriveImage) => string | undefined,
) {
	const resPreset = RESOLUTION_PRESETS[cfg.resolution] ?? RESOLUTION_PRESETS["720p"];
	const scale = resPreset.scale;
	const { fromBuf, toBuf } = getSharedBuffers(resPreset.width, resPreset.height);

	withLogicalScale(ctx, scale, () => {
		ctx.fillStyle = cfg.themeBg;
		ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

		const activeIntroDur = cfg.enableIntro ? cfg.introDuration : 0;
		const slidesTotalDur = loadedSlides.length * cfg.slideDuration;
		const activeOutroDur = cfg.enableOutro ? cfg.outroDuration : 0;

		// 1. Inside Intro Phase
		if (cfg.enableIntro && elapsedSec < activeIntroDur) {
			const introProgress = Math.max(
				0,
				Math.min(1, elapsedSec / activeIntroDur),
			);
			const transStart = Math.max(0.2, activeIntroDur - cfg.transitionDuration);

			if (loadedSlides.length > 0 && elapsedSec >= transStart) {
				const rawT = (elapsedSec - transStart) / (activeIntroDur - transStart);
				withLogicalScale(fromBuf.getContext("2d")!, scale, () => {
					renderIntroScene(
						fromBuf.getContext("2d")!,
						loadedSlides,
						prebakedBackdrops,
						entries,
						introProgress,
						cfg,
					);
				});

				const firstLabel = getSlideLabel(selectedSlides[0]);
				withLogicalScale(toBuf.getContext("2d")!, scale, () => {
					drawSlideContents(
						toBuf.getContext("2d")!,
						loadedSlides[0],
						prebakedBackdrops[0],
						visualContexts[0],
						0,
						(elapsedSec - transStart) / Math.max(0.1, cfg.slideDuration),
						firstLabel,
						cfg,
					);
				});

				drawModernTransition(
					ctx,
					fromBuf,
					toBuf,
					rawT,
					pickTransitionForSlide(0, cfg.transitionStyle),
					cfg,
				);
			} else {
				renderIntroScene(
					ctx,
					loadedSlides,
					prebakedBackdrops,
					entries,
					introProgress,
					cfg,
				);
			}
			return;
		}

		// 2. Inside Outro Phase
		if (cfg.enableOutro && elapsedSec >= activeIntroDur + slidesTotalDur) {
			const outroElapsed = elapsedSec - (activeIntroDur + slidesTotalDur);
			const outroProgress = Math.max(
				0,
				Math.min(1, outroElapsed / Math.max(0.1, activeOutroDur)),
			);
			renderOutroScene(
				ctx,
				loadedSlides,
				prebakedBackdrops,
				entries,
				outroProgress,
				cfg,
			);
			return;
		}

		// 3. Inside Main Slides Phase
		const count = loadedSlides.length;
		if (count === 0) return;

		const slideElapsed = Math.max(
			0,
			Math.min(elapsedSec - activeIntroDur, slidesTotalDur - 0.001),
		);
		const rawIdx = Math.floor(slideElapsed / cfg.slideDuration);
		const idx = Math.min(rawIdx, count - 1);
		const timeInSlide = slideElapsed - idx * cfg.slideDuration;
		const slideProgress = Math.min(1, timeInSlide / cfg.slideDuration);

		const currentImg = loadedSlides[idx];
		const currentLabel = getSlideLabel(selectedSlides[idx]);

		const nextImg = idx + 1 < count ? loadedSlides[idx + 1] : null;
		const nextLabel =
			idx + 1 < count ? getSlideLabel(selectedSlides[idx + 1]) : undefined;

		const transStart = Math.max(0.2, cfg.slideDuration - cfg.transitionDuration);

		if (nextImg && timeInSlide >= transStart) {
			const rawT =
				(timeInSlide - transStart) / (cfg.slideDuration - transStart);
			const nextInitialProgress =
				(timeInSlide - transStart) / Math.max(0.1, cfg.slideDuration);

			withLogicalScale(fromBuf.getContext("2d")!, scale, () => {
				drawSlideContents(
					fromBuf.getContext("2d")!,
					currentImg,
					prebakedBackdrops[idx],
					visualContexts[idx],
					idx,
					slideProgress,
					currentLabel,
					cfg,
				);
			});
			withLogicalScale(toBuf.getContext("2d")!, scale, () => {
				drawSlideContents(
					toBuf.getContext("2d")!,
					nextImg,
					prebakedBackdrops[idx + 1],
					visualContexts[idx + 1],
					idx + 1,
					nextInitialProgress,
					nextLabel,
					cfg,
				);
			});

			drawModernTransition(
				ctx,
				fromBuf,
				toBuf,
				rawT,
				pickTransitionForSlide(idx + 1, cfg.transitionStyle),
				cfg,
			);
		} else if (!nextImg && cfg.enableOutro && timeInSlide >= transStart) {
			const rawT =
				(timeInSlide - transStart) / (cfg.slideDuration - transStart);
			withLogicalScale(fromBuf.getContext("2d")!, scale, () => {
				drawSlideContents(
					fromBuf.getContext("2d")!,
					currentImg,
					prebakedBackdrops[idx],
					visualContexts[idx],
					idx,
					slideProgress,
					currentLabel,
					cfg,
				);
			});
			withLogicalScale(toBuf.getContext("2d")!, scale, () => {
				renderOutroScene(
					toBuf.getContext("2d")!,
					loadedSlides,
					prebakedBackdrops,
					entries,
					(timeInSlide - transStart) / Math.max(0.1, activeOutroDur),
					cfg,
				);
			});

			drawModernTransition(
				ctx,
				fromBuf,
				toBuf,
				rawT,
				pickTransitionForSlide(idx + 1, cfg.transitionStyle),
				cfg,
			);
		} else {
			drawSlideContents(
				ctx,
				currentImg,
				prebakedBackdrops[idx],
				visualContexts[idx],
				idx,
				slideProgress,
				currentLabel,
				cfg,
			);
		}
	});
}
