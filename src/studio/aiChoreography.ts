import {
	type AiChoreographySpec,
	CANVAS_HEIGHT,
	CANVAS_WIDTH,
	rgbaFromHex,
} from "./types";

export function synthesizeAiHeadlines(activeLabels: string[]) {
	const lead = activeLabels[0] || "Signature";
	const second = activeLabels[1];
	const topList = activeLabels.slice(0, 3).join(" · ");

	const introTemplates = [
		{
			title: second ? `${lead} & ${second}` : `${lead} Showcase`,
			sub: topList
				? `Crafted with ${topList}`
				: "Curated Visual Showcase & Selection",
		},
		{
			title: `The ${lead} Collection`,
			sub: topList
				? `Featuring ${topList}`
				: "Freshly Selected & Artfully Presented",
		},
		{
			title: "Artisan Ingredients",
			sub: topList
				? `Highlighting ${topList}`
				: "Pure Flavor & Visual Harmony",
		},
		{
			title: `Pure ${lead} Essence`,
			sub: topList
				? `Blended with ${topList}`
				: "Handpicked Quality in Every Frame",
		},
	];

	const outroTemplates = [
		{
			title: "Crafted to Perfection",
			sub: topList ? `Made with ${topList}` : "Thank You for Watching",
		},
		{
			title: "Taste the Craft",
			sub: topList
				? `Featuring ${topList}`
				: "Freshly Prepared with Finest Ingredients",
		},
		{
			title: "Thank You for Watching",
			sub: topList
				? `A Showcase of ${topList}`
				: "Artisan Quality & Visual Storytelling",
		},
	];

	return {
		intro: introTemplates[Math.floor(Math.random() * introTemplates.length)],
		outro: outroTemplates[Math.floor(Math.random() * outroTemplates.length)],
	};
}

export async function synthesizeProceduralBackdrops(
	primaryHex: string,
	accentHex: string,
	bgHex: string,
): Promise<{ introImg: HTMLImageElement; outroImg: HTMLImageElement }> {
	const createProceduralArt = (
		pHex: string,
		aHex: string,
		bHex: string,
		seedOffset: number,
	): Promise<HTMLImageElement> => {
		const off = document.createElement("canvas");
		off.width = CANVAS_WIDTH;
		off.height = CANVAS_HEIGHT;
		const octx = off.getContext("2d")!;

		octx.fillStyle = bHex;
		octx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

		for (let i = 0; i < 9; i++) {
			const angle = ((i + seedOffset) * 1.37) % (Math.PI * 2);
			const cx =
				CANVAS_WIDTH * (0.15 + ((Math.sin(angle * 2.1) + 1) / 2) * 0.7);
			const cy =
				CANVAS_HEIGHT * (0.15 + ((Math.cos(angle * 1.7) + 1) / 2) * 0.7);
			const r = 180 + (i % 4) * 110;
			const g = octx.createRadialGradient(cx, cy, 10, cx, cy, r);
			g.addColorStop(0, rgbaFromHex(i % 2 === 0 ? pHex : aHex, 0.42));
			g.addColorStop(1, "rgba(0,0,0,0)");
			octx.fillStyle = g;
			octx.beginPath();
			octx.arc(cx, cy, r, 0, Math.PI * 2);
			octx.fill();
		}

		for (let w = 0; w < 5; w++) {
			octx.beginPath();
			const baseY = 120 + w * 125;
			octx.moveTo(0, baseY);
			for (let x = 0; x <= CANVAS_WIDTH; x += 24) {
				const y =
					baseY +
					Math.sin(x * 0.0045 + w * 1.3 + seedOffset) * (45 + w * 12) +
					Math.cos(x * 0.009 - seedOffset) * 25;
				octx.lineTo(x, y);
			}
			octx.strokeStyle = rgbaFromHex(w % 2 === 0 ? pHex : aHex, 0.32);
			octx.lineWidth = 3 + (w % 3) * 2;
			octx.stroke();
		}

		const dataUrl = off.toDataURL("image/png");
		return new Promise<HTMLImageElement>((resolve, reject) => {
			const el = new Image();
			el.onload = () => resolve(el);
			el.onerror = reject;
			el.src = dataUrl;
		});
	};

	const seed = Math.random() * 100;
	const [introImg, outroImg] = await Promise.all([
		createProceduralArt(primaryHex, accentHex, bgHex, seed),
		createProceduralArt(accentHex, primaryHex, bgHex, seed + 7.5),
	]);

	return { introImg, outroImg };
}

export function synthesizeAiChoreography(
	promptText: string,
	previous?: AiChoreographySpec | null,
): AiChoreographySpec {
	const backdrops: AiChoreographySpec["backdropEffect"][] = [
		"aurora-waves",
		"laser-grid",
		"vortex-rings",
		"starburst-rays",
	];
	const particles: AiChoreographySpec["particleMotion"][] = [
		"vortex",
		"rising-sparks",
		"orbit-halo",
		"meteor-shower",
	];
	const trajectories: AiChoreographySpec["cardTrajectory"][] = [
		"spiral-vortex",
		"wave-cascade",
		"carousel-3d",
		"pendulum-fan",
		"zoom-matrix",
	];
	const titles: AiChoreographySpec["titleAnimation"][] = [
		"elastic-drop",
		"cyber-split",
		"zoom-shockwave",
	];
	const outros: AiChoreographySpec["outroFormation"][] = [
		"constellation-ring",
		"expanding-fan",
		"floating-pillars",
	];

	const lower = promptText.toLowerCase();
	const pickOther = <T,>(arr: T[], current?: T): T => {
		const pool = current ? arr.filter((x) => x !== current) : arr;
		return pool[Math.floor(Math.random() * pool.length)] ?? arr[0];
	};

	return {
		name: promptText.trim()
			? `AI: ${promptText.trim().slice(0, 26)}`
			: "AI Kinetic Choreography",
		backdropEffect:
			lower.includes("grid") || lower.includes("laser")
				? "laser-grid"
				: lower.includes("ray") ||
					  lower.includes("burst") ||
					  lower.includes("star")
					? "starburst-rays"
					: lower.includes("ring") || lower.includes("vortex")
						? "vortex-rings"
						: lower.includes("aurora") || lower.includes("wave")
							? "aurora-waves"
							: pickOther(backdrops, previous?.backdropEffect),
		particleMotion: lower.includes("spark")
			? "rising-sparks"
			: lower.includes("meteor")
				? "meteor-shower"
				: pickOther(particles, previous?.particleMotion),
		cardTrajectory:
			lower.includes("spiral") || lower.includes("vortex")
				? "spiral-vortex"
				: lower.includes("wave") || lower.includes("cascade")
					? "wave-cascade"
					: lower.includes("3d") || lower.includes("carousel")
						? "carousel-3d"
						: lower.includes("fan") || lower.includes("pendulum")
							? "pendulum-fan"
							: lower.includes("matrix") || lower.includes("zoom")
								? "zoom-matrix"
								: pickOther(trajectories, previous?.cardTrajectory),
		titleAnimation: pickOther(titles, previous?.titleAnimation),
		outroFormation:
			lower.includes("ring") || lower.includes("constellation")
				? "constellation-ring"
				: lower.includes("fan")
					? "expanding-fan"
					: lower.includes("pillar") || lower.includes("float")
						? "floating-pillars"
						: pickOther(outros, previous?.outroFormation),
		motionSpeed: Number((1.05 + Math.random() * 0.75).toFixed(2)),
		spinIntensity: Number((0.85 + Math.random() * 0.85).toFixed(2)),
	};
}
