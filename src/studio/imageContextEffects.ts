import {
	CANVAS_HEIGHT,
	CANVAS_WIDTH,
	type ImageVisualContext,
	type SlideContextVibe,
	rgbaFromHex,
} from "./types";

function rgbToHex(r: number, g: number, b: number): string {
	const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
	return `#${[clamp(r), clamp(g), clamp(b)]
		.map((v) => v.toString(16).padStart(2, "0"))
		.join("")}`;
}

/**
 * Vision analysis on an HTMLImageElement + filename/ingredient label to determine
 * dominant colors, warmth, brightness, and the matching contextual atmospheric vibe.
 */
export function analyzeImageVisualContext(
	img: HTMLImageElement,
	labelText = "",
): ImageVisualContext {
	const sampleCanvas = document.createElement("canvas");
	const SW = 32;
	const SH = 32;
	sampleCanvas.width = SW;
	sampleCanvas.height = SH;
	const sctx = sampleCanvas.getContext("2d");

	let rSum = 0;
	let gSum = 0;
	let bSum = 0;
	let rWarm = 0;
	let gWarm = 0;
	let bWarm = 0;
	let warmCount = 0;
	let brightSum = 0;
	let satSum = 0;
	let count = 0;

	if (sctx) {
		try {
			sctx.drawImage(img, 0, 0, SW, SH);
			const data = sctx.getImageData(0, 0, SW, SH).data;
			for (let i = 0; i < data.length; i += 4) {
				const r = data[i];
				const g = data[i + 1];
				const b = data[i + 2];
				const a = data[i + 3];
				if (a < 40) continue;

				const max = Math.max(r, g, b);
				const min = Math.min(r, g, b);
				const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
				const sat = max === 0 ? 0 : (max - min) / max;

				rSum += r;
				gSum += g;
				bSum += b;
				brightSum += lum;
				satSum += sat;
				count++;

				// Track most saturated accent pixels
				if (sat > 0.28 && lum > 0.15 && lum < 0.9) {
					rWarm += r;
					gWarm += g;
					bWarm += b;
					warmCount++;
				}
			}
		} catch {
			// Fallback if canvas pixel read isn't available
		}
	}

	const avgR = count > 0 ? rSum / count : 59;
	const avgG = count > 0 ? gSum / count : 130;
	const avgB = count > 0 ? bSum / count : 246;

	const accR = warmCount > 0 ? rWarm / warmCount : Math.min(255, avgR * 1.25);
	const accG = warmCount > 0 ? gWarm / warmCount : Math.min(255, avgG * 1.15);
	const accB = warmCount > 0 ? bWarm / warmCount : Math.min(255, avgB * 1.25);

	const dominantHex = rgbToHex(accR, accG, accB);
	const secondaryHex = rgbToHex(
		(avgR + accB) * 0.5,
		(avgG + accR) * 0.5,
		(avgB + accG) * 0.5,
	);

	const brightness = count > 0 ? brightSum / count : 0.55;
	const avgSat = count > 0 ? satSum / count : 0.45;
	const warmth = (accR - accB) / 255; // positive = warm (reds/oranges/gold), negative = cool (blues/cyans)

	// Semantic keyword override from ingredient/filename if recognizable
	const lower = labelText.toLowerCase();
	let vibe: SlideContextVibe = "golden-bokeh";

	if (
		lower.includes("mint") ||
		lower.includes("herb") ||
		lower.includes("leaf") ||
		lower.includes("green") ||
		lower.includes("lime") ||
		lower.includes("matcha") ||
		lower.includes("basil") ||
		(accG > accR * 1.08 && accG > accB * 1.12)
	) {
		vibe = "botanical-petals";
	} else if (
		lower.includes("ice") ||
		lower.includes("water") ||
		lower.includes("berry") ||
		lower.includes("blue") ||
		lower.includes("milk") ||
		lower.includes("cream") ||
		warmth < -0.08
	) {
		vibe = "cool-mist";
	} else if (
		lower.includes("orange") ||
		lower.includes("fire") ||
		lower.includes("spice") ||
		lower.includes("chili") ||
		lower.includes("roast") ||
		lower.includes("coffee") ||
		lower.includes("cinnamon") ||
		warmth > 0.22
	) {
		vibe = "warm-embers";
	} else if (avgSat > 0.52) {
		vibe = "vibrant-prism";
	} else {
		vibe = "golden-bokeh";
	}

	return {
		dominantHex,
		secondaryHex,
		vibe,
		brightness,
		warmth,
	};
}

/**
 * Renders eye-catching contextual visual effects tailored to the current image's palette and vibe:
 * - Dynamic color-matched corner light leaks & lens flare sweeps
 * - Contextual particle physics (rising warm embers, drifting botanical leaves, crystalline frost sparkles, prism rays, or golden bokeh orbs)
 * - Subtle floating light frame around the active image
 */
export function drawImageContextEffects(
	ctx: CanvasRenderingContext2D,
	context: ImageVisualContext,
	slideIndex: number,
	slideProgress: number,
	imgBounds: { x: number; y: number; w: number; h: number },
) {
	ctx.save();

	const { dominantHex, secondaryHex, vibe } = context;

	// 1. Dynamic Color-Matched Light Leak / Sunbeam in opposite corners
	const leakX =
		slideIndex % 2 === 0
			? CANVAS_WIDTH * (0.12 + slideProgress * 0.15)
			: CANVAS_WIDTH * (0.88 - slideProgress * 0.15);
	const leakY = CANVAS_HEIGHT * (0.14 + Math.sin(slideProgress * Math.PI) * 0.08);
	const leakGrad = ctx.createRadialGradient(
		leakX,
		leakY,
		15,
		leakX,
		leakY,
		420,
	);
	leakGrad.addColorStop(0, rgbaFromHex(dominantHex, 0.34));
	leakGrad.addColorStop(0.5, rgbaFromHex(secondaryHex, 0.14));
	leakGrad.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = leakGrad;
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	// 2. Glowing Color-Matched Rim Aura around the photo frame
	ctx.save();
	ctx.strokeStyle = rgbaFromHex(dominantHex, 0.65);
	ctx.lineWidth = 2.5;
	ctx.shadowColor = dominantHex;
	ctx.shadowBlur = 22;
	ctx.beginPath();
	ctx.roundRect(imgBounds.x, imgBounds.y, imgBounds.w, imgBounds.h, 18);
	ctx.stroke();
	ctx.restore();

	// 3. Diagonal Specular Sheen Sweep across the image surface
	const sheenPos = -0.35 + slideProgress * 1.7;
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(imgBounds.x, imgBounds.y, imgBounds.w, imgBounds.h, 18);
	ctx.clip();

	const sheenX = imgBounds.x + imgBounds.w * sheenPos;
	const sheenGrad = ctx.createLinearGradient(
		sheenX - 90,
		imgBounds.y,
		sheenX + 90,
		imgBounds.y + imgBounds.h,
	);
	sheenGrad.addColorStop(0, "rgba(255,255,255,0)");
	sheenGrad.addColorStop(0.5, rgbaFromHex(dominantHex, 0.16));
	sheenGrad.addColorStop(0.55, "rgba(255,255,255,0.18)");
	sheenGrad.addColorStop(1, "rgba(255,255,255,0)");
	ctx.fillStyle = sheenGrad;
	ctx.fillRect(imgBounds.x, imgBounds.y, imgBounds.w, imgBounds.h);
	ctx.restore();

	// 4. Contextual Particle & Atmosphere Layer based on analyzed Image Vibe
	if (vibe === "warm-embers") {
		// Rising glowing spice/citrus embers & warm sparkles
		for (let i = 0; i < 22; i++) {
			const seed = (i * 173 + slideIndex * 47) % 1000;
			const normX = (seed % 100) / 100;
			const startY = ((seed * 7) % 100) / 100;
			const px =
				normX * CANVAS_WIDTH +
				Math.sin(slideProgress * Math.PI * 3 + i) * 28;
			const py =
				((startY - slideProgress * (0.35 + (i % 3) * 0.12) + 1) % 1) *
				CANVAS_HEIGHT;
			const r = 2.5 + (i % 4) * 2.2;

			ctx.save();
			const g = ctx.createRadialGradient(px, py, 0.5, px, py, r * 3);
			g.addColorStop(0, "#fff7ed");
			g.addColorStop(0.4, rgbaFromHex(dominantHex, 0.85));
			g.addColorStop(1, "rgba(0,0,0,0)");
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(px, py, r * 3, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
	} else if (vibe === "botanical-petals") {
		// Floating organic leaf/petal silhouettes & dewdrops
		for (let i = 0; i < 16; i++) {
			const seed = (i * 211 + slideIndex * 31) % 1000;
			const px =
				(((seed % 100) / 100) * CANVAS_WIDTH +
					slideProgress * 120 * (i % 2 === 0 ? 1 : -1) +
					CANVAS_WIDTH) %
				CANVAS_WIDTH;
			const py =
				((((seed * 13) % 100) / 100) * CANVAS_HEIGHT +
					Math.sin(slideProgress * Math.PI * 2 + i) * 35 +
					CANVAS_HEIGHT) %
				CANVAS_HEIGHT;
			const rot = slideProgress * Math.PI * (i % 2 === 0 ? 1.4 : -1.4) + i;
			const size = 7 + (i % 4) * 3.5;

			ctx.save();
			ctx.translate(px, py);
			ctx.rotate(rot);
			ctx.fillStyle =
				i % 2 === 0
					? rgbaFromHex(dominantHex, 0.45)
					: rgbaFromHex(secondaryHex, 0.38);
			ctx.beginPath();
			ctx.ellipse(0, 0, size, size * 0.48, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
	} else if (vibe === "cool-mist") {
		// Shimmering starlight crystals & cool mist rings
		for (let i = 0; i < 18; i++) {
			const seed = (i * 157 + slideIndex * 61) % 1000;
			const px = ((seed % 100) / 100) * CANVAS_WIDTH;
			const py =
				((((seed * 11) % 100) / 100) * CANVAS_HEIGHT +
					Math.cos(slideProgress * Math.PI * 2 + i) * 20) %
				CANVAS_HEIGHT;
			const pulse =
				0.4 + 0.6 * Math.abs(Math.sin(slideProgress * Math.PI * 3 + i));
			const size = (5 + (i % 3) * 4) * pulse;

			ctx.save();
			ctx.translate(px, py);
			ctx.rotate(slideProgress * Math.PI + i);
			ctx.strokeStyle = rgbaFromHex(dominantHex, 0.65 * pulse);
			ctx.lineWidth = 1.8;
			ctx.beginPath();
			ctx.moveTo(-size, 0);
			ctx.lineTo(size, 0);
			ctx.moveTo(0, -size);
			ctx.lineTo(0, size);
			ctx.stroke();
			ctx.restore();
		}
	} else if (vibe === "vibrant-prism") {
		// Anamorphic light streaks & prism flares
		for (let i = 0; i < 10; i++) {
			const seed = (i * 193 + slideIndex * 29) % 1000;
			const py = (0.12 + ((seed % 80) / 100)) * CANVAS_HEIGHT;
			const px =
				(((seed * 9) % 100) / 100) * CANVAS_WIDTH +
				(slideProgress - 0.5) * 220 * (i % 2 === 0 ? 1 : -1);
			const w = 95 + (i % 4) * 55;

			ctx.save();
			const streak = ctx.createLinearGradient(px - w, py, px + w, py);
			streak.addColorStop(0, "rgba(255,255,255,0)");
			streak.addColorStop(
				0.5,
				rgbaFromHex(i % 2 === 0 ? dominantHex : secondaryHex, 0.35),
			);
			streak.addColorStop(1, "rgba(255,255,255,0)");
			ctx.fillStyle = streak;
			ctx.fillRect(px - w, py - 2, w * 2, 4);
			ctx.restore();
		}
	} else {
		// Golden / Soft Luxury Bokeh Orbs
		for (let i = 0; i < 16; i++) {
			const seed = (i * 139 + slideIndex * 53) % 1000;
			const px =
				(((seed % 100) / 100) * CANVAS_WIDTH +
					Math.sin(slideProgress * Math.PI * 1.5 + i) * 32 +
					CANVAS_WIDTH) %
				CANVAS_WIDTH;
			const py =
				((((seed * 17) % 100) / 100) * CANVAS_HEIGHT -
					slideProgress * 55 +
					CANVAS_HEIGHT) %
				CANVAS_HEIGHT;
			const r = 12 + (i % 5) * 9;

			ctx.save();
			const bokeh = ctx.createRadialGradient(px, py, r * 0.1, px, py, r);
			bokeh.addColorStop(0, rgbaFromHex(dominantHex, 0.12));
			bokeh.addColorStop(0.75, rgbaFromHex(dominantHex, 0.25));
			bokeh.addColorStop(1, "rgba(0,0,0,0)");
			ctx.fillStyle = bokeh;
			ctx.beginPath();
			ctx.arc(px, py, r, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
	}

	ctx.restore();
}
