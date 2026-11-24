import { useEffect, useMemo, useRef, useState } from "react";
import defaultMusic from "./assets/orange.mp3";
import {
	synthesizeAiChoreography,
	synthesizeAiHeadlines,
	synthesizeProceduralBackdrops,
} from "./studio/aiChoreography";
import {
	createPrebakedSlideCanvas,
	renderCompositeFrame,
} from "./studio/canvasRenderer";
import { analyzeImageVisualContext } from "./studio/imageContextEffects";
import {
	type AiChoreographySpec,
	type DriveImage,
	type ImageVisualContext,
	type IngredientEntry,
	type IntroStyle,
	RESOLUTION_PRESETS,
	type StudioRenderConfig,
	type TransitionStyle,
	type VideoResolutionKey,
	cleanIngredientName,
	rgbaFromHex,
} from "./studio/types";

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const FOLDER_ID = import.meta.env.VITE_DRIVE_FOLDER_ID?.split("?")[0]?.trim();

export function DriveVideoStudio() {
	const [images, setImages] = useState<DriveImage[]>([]);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [ingredientTags, setIngredientTags] = useState<Record<string, string>>(
		{},
	);
	const [hiddenTagIds, setHiddenTagIds] = useState<string[]>([]);
	const [showSlideTags, setShowSlideTags] = useState(true);
	const [sortBy, setSortBy] = useState<
		"date-desc" | "date-asc" | "name-asc" | "name-desc"
	>("date-desc");
	const [customIngredientInput, setCustomIngredientInput] = useState("");
	const [extraIngredients, setExtraIngredients] = useState<string[]>([]);

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Theme Color Picker State
	const [themePrimary, setThemePrimary] = useState("#2563eb");
	const [themeAccent, setThemeAccent] = useState("#7c3aed");
	const [themeBg, setThemeBg] = useState("#0f172a");

	// Intro Generator Settings
	const [enableIntro, setEnableIntro] = useState(true);
	const [introTitle, setIntroTitle] = useState("Featured Ingredients");
	const [introSubtitle, setIntroSubtitle] = useState(
		"Crafted Selection & Visual Showcase",
	);
	const [introDuration, setIntroDuration] = useState(4.0);
	const [introStyle, setIntroStyle] = useState<IntroStyle>("showcase-cards");

	// Outro Generator Settings
	const [enableOutro, setEnableOutro] = useState(true);
	const [outroTitle, setOutroTitle] = useState("Thank You for Watching");
	const [outroSubtitle, setOutroSubtitle] = useState(
		"Freshly Crafted with Finest Ingredients",
	);
	const [outroDuration, setOutroDuration] = useState(3.5);

	// Optional AI Animation & Backdrop Generator State
	const [useAiBackdrop, setUseAiBackdrop] = useState(false);
	const [aiGeneratingText, setAiGeneratingText] = useState(false);
	const [aiGeneratingArt, setAiGeneratingArt] = useState(false);
	const [aiGeneratingAnim, setAiGeneratingAnim] = useState(false);
	const [aiPromptInput, setAiPromptInput] = useState(
		"Dynamic 3D spiral vortex with glowing aurora waves and floating cards",
	);
	const [useAiOutroAnim, setUseAiOutroAnim] = useState(false);
	const [aiChoreography, setAiChoreography] =
		useState<AiChoreographySpec | null>(null);
	const [aiIntroArt, setAiIntroArt] = useState<HTMLImageElement | null>(null);
	const [aiOutroArt, setAiOutroArt] = useState<HTMLImageElement | null>(null);

	// Presentation & Video Settings
	const [resolution, setResolution] = useState<VideoResolutionKey>("1080p");
	const [slideDuration, setSlideDuration] = useState(3.5);
	const [transitionDuration, setTransitionDuration] = useState(1.0);
	const [transitionStyle, setTransitionStyle] =
		useState<TransitionStyle>("auto-mix");
	const [kenBurns, setKenBurns] = useState(true);
	const [contextEffects, setContextEffects] = useState(true);

	// Music Selection
	const [musicSource, setMusicSource] = useState<"asset" | "custom">("asset");
	const [customAudioUrl, setCustomAudioUrl] = useState<string | null>(null);
	const [customAudioName, setCustomAudioName] = useState<string>("");

	// Rendering / Live Preview State
	const [isGenerating, setIsGenerating] = useState(false);
	const [isPreviewing, setIsPreviewing] = useState(false);
	const [progress, setProgress] = useState(0);
	const [statusText, setStatusText] = useState("");
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	const [videoExt, setVideoExt] = useState("webm");

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const cancelRef = useRef<boolean>(false);
	const loadedImagesCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
	const prebakedBackdropCacheRef = useRef<Map<string, HTMLCanvasElement>>(
		new Map(),
	);
	const visualContextCacheRef = useRef<Map<string, ImageVisualContext>>(
		new Map(),
	);

	// Clear prebaked backdrops when themeBg changes
	useEffect(() => {
		prebakedBackdropCacheRef.current.clear();
	}, [themeBg]);

	useEffect(() => {
		async function fetchImages() {
			if (
				!API_KEY ||
				!FOLDER_ID ||
				API_KEY === "your_api_key_here" ||
				FOLDER_ID === "your_folder_id_here"
			) {
				setError(
					"Please set your VITE_GOOGLE_API_KEY and VITE_DRIVE_FOLDER_ID in the .env file.",
				);
				setLoading(false);
				return;
			}

			try {
				const query = `'${FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`;
				const params = new URLSearchParams({
					q: query,
					fields: "files(id, name, thumbnailLink, createdTime)",
					orderBy: "createdTime desc",
					pageSize: "100",
					key: API_KEY,
				});

				const response = await fetch(
					`https://www.googleapis.com/drive/v3/files?${params.toString()}`,
				);

				if (!response.ok) {
					const errData = await response.json().catch(() => null);
					throw new Error(
						errData?.error?.message || `HTTP Error ${response.status}`,
					);
				}

				const data = await response.json();
				const files: DriveImage[] = data.files ?? [];
				setImages(files);
				setSelectedIds(files.map((f) => f.id));

				const initialTags: Record<string, string> = {};
				for (const f of files) {
					initialTags[f.id] = cleanIngredientName(f.name);
				}
				setIngredientTags(initialTags);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load images");
			} finally {
				setLoading(false);
			}
		}

		fetchImages();
	}, []);

	useEffect(() => {
		return () => {
			if (customAudioUrl) URL.revokeObjectURL(customAudioUrl);
			if (videoUrl) URL.revokeObjectURL(videoUrl);
		};
	}, [customAudioUrl, videoUrl]);

	// Clear loaded image cache when switching to a higher resolution so sharp images are fetched
	useEffect(() => {
		loadedImagesCacheRef.current.clear();
	}, [resolution]);

	const getThumbUrl = (img: DriveImage) =>
		img.thumbnailLink
			? img.thumbnailLink.replace(/=s\d+$/, "=s400")
			: `https://drive.google.com/thumbnail?id=${img.id}&sz=w400`;

	// Request Google Drive image sized to match the selected output resolution (720p / 1080p / 1440p / 4K)
	const getHighResUrl = (img: DriveImage) => {
		const sizeParam = RESOLUTION_PRESETS[resolution].driveSizeParam;
		return img.thumbnailLink
			? img.thumbnailLink.replace(/=s\d+$/, `=s${sizeParam}`)
			: `https://drive.google.com/thumbnail?id=${img.id}&sz=w${sizeParam}`;
	};

	const loadCanvasSafeImage = async (
		img: DriveImage,
	): Promise<HTMLImageElement> => {
		const cached = loadedImagesCacheRef.current.get(img.id);
		if (cached) return cached;

		const candidates = [
			getHighResUrl(img),
			`https://www.googleapis.com/drive/v3/files/${img.id}?alt=media&key=${API_KEY}`,
		];

		for (const url of candidates) {
			try {
				const res = await fetch(url, { referrerPolicy: "no-referrer" });
				if (!res.ok) continue;
				const blob = await res.blob();
				const objectUrl = URL.createObjectURL(blob);
				const htmlImg = await new Promise<HTMLImageElement>(
					(resolve, reject) => {
						const el = new Image();
						el.onload = () => resolve(el);
						el.onerror = reject;
						el.src = objectUrl;
					},
				);
				loadedImagesCacheRef.current.set(img.id, htmlImg);
				return htmlImg;
			} catch {
				// Try next fallback URL
			}
		}

		const fallbackImg = await new Promise<HTMLImageElement>(
			(resolve, reject) => {
				const el = new Image();
				el.crossOrigin = "anonymous";
				el.referrerPolicy = "no-referrer";
				el.onload = () => resolve(el);
				el.onerror = () =>
					reject(new Error(`Could not load image: ${img.name}`));
				el.src = getHighResUrl(img);
			},
		);
		loadedImagesCacheRef.current.set(img.id, fallbackImg);
		return fallbackImg;
	};

	const getOrCreatePrebakedBackdrop = (
		id: string,
		img: HTMLImageElement,
	): HTMLCanvasElement => {
		const key = `${id}-${themeBg}`;
		const existing = prebakedBackdropCacheRef.current.get(key);
		if (existing) return existing;
		const created = createPrebakedSlideCanvas(img, themeBg);
		prebakedBackdropCacheRef.current.set(key, created);
		return created;
	};

	const getOrCreateVisualContext = (
		slide: DriveImage,
		img: HTMLImageElement,
	): ImageVisualContext => {
		const label = ingredientTags[slide.id] ?? cleanIngredientName(slide.name);
		const key = `${slide.id}-${label}`;
		const existing = visualContextCacheRef.current.get(key);
		if (existing) return existing;
		const analyzed = analyzeImageVisualContext(img, label);
		visualContextCacheRef.current.set(key, analyzed);
		return analyzed;
	};

	const buildActiveIngredientEntries = (
		selectedSlides: DriveImage[],
		loadedSlides: HTMLImageElement[],
	): IngredientEntry[] => {
		const entries: IngredientEntry[] = [];
		for (let i = 0; i < selectedSlides.length; i++) {
			const slide = selectedSlides[i];
			if (hiddenTagIds.includes(slide.id)) continue;
			const label = (
				ingredientTags[slide.id] ?? cleanIngredientName(slide.name)
			).trim();
			if (!label) continue;
			entries.push({
				label,
				image: loadedSlides[i],
			});
		}
		for (const extra of extraIngredients) {
			const trimmed = extra.trim();
			if (!trimmed) continue;
			entries.push({
				label: trimmed,
				image:
					loadedSlides.length > 0
						? loadedSlides[entries.length % loadedSlides.length]
						: undefined,
			});
		}
		return entries;
	};

	const getSlideIngredientLabel = (slide?: DriveImage): string | undefined => {
		if (!slide || !showSlideTags || hiddenTagIds.includes(slide.id)) {
			return undefined;
		}
		const text = (
			ingredientTags[slide.id] ?? cleanIngredientName(slide.name)
		).trim();
		return text || undefined;
	};

	const renderConfig: StudioRenderConfig = useMemo(
		() => ({
			resolution,
			enableIntro,
			introTitle,
			introSubtitle,
			introDuration,
			introStyle,
			enableOutro,
			outroTitle,
			outroSubtitle,
			outroDuration,
			slideDuration,
			transitionDuration,
			transitionStyle,
			kenBurns,
			contextEffects,
			themePrimary,
			themeAccent,
			themeBg,
			useAiBackdrop,
			useAiOutroAnim,
			aiChoreography,
			aiIntroArt,
			aiOutroArt,
		}),
		[
			resolution,
			enableIntro,
			introTitle,
			introSubtitle,
			introDuration,
			introStyle,
			enableOutro,
			outroTitle,
			outroSubtitle,
			outroDuration,
			slideDuration,
			transitionDuration,
			transitionStyle,
			kenBurns,
			contextEffects,
			themePrimary,
			themeAccent,
			themeBg,
			useAiBackdrop,
			useAiOutroAnim,
			aiChoreography,
			aiIntroArt,
			aiOutroArt,
		],
	);

	const handleGenerateAiCopy = () => {
		const selectedSlides = images.filter((img) => selectedIds.includes(img.id));
		const activeLabels = selectedSlides
			.filter((s) => !hiddenTagIds.includes(s.id))
			.map((s) => (ingredientTags[s.id] ?? cleanIngredientName(s.name)).trim())
			.filter(Boolean)
			.concat(extraIngredients);

		setAiGeneratingText(true);
		const { intro, outro } = synthesizeAiHeadlines(activeLabels);
		setIntroTitle(intro.title);
		setIntroSubtitle(intro.sub);
		setOutroTitle(outro.title);
		setOutroSubtitle(outro.sub);
		setStatusText("✨ Generated Intro & Outro headlines from your ingredients!");
		setAiGeneratingText(false);
	};

	const handleGenerateAiBackdrops = async () => {
		setAiGeneratingArt(true);
		setStatusText("🎨 Synthesizing procedural AI Intro & Outro backdrops...");
		try {
			const { introImg, outroImg } = await synthesizeProceduralBackdrops(
				themePrimary,
				themeAccent,
				themeBg,
			);
			setAiIntroArt(introImg);
			setAiOutroArt(outroImg);
			setUseAiBackdrop(true);
			setStatusText("🎨 Procedural AI Intro & Outro backdrops applied!");
		} finally {
			setAiGeneratingArt(false);
		}
	};

	const handleGenerateAiAnimation = () => {
		setAiGeneratingAnim(true);
		const spec = synthesizeAiChoreography(aiPromptInput, aiChoreography);
		setAiChoreography(spec);
		setIntroStyle("ai-custom");
		setUseAiOutroAnim(true);
		setStatusText(
			`🤖 AI Animation generated: ${spec.cardTrajectory} + ${spec.backdropEffect} (Outro: ${spec.outroFormation})!`,
		);
		setAiGeneratingAnim(false);
	};

	const activeAudioSrc =
		musicSource === "custom" && customAudioUrl ? customAudioUrl : defaultMusic;

	// Long-Video Safe Renderer (Supports 3+ minute videos without crashes or background tab throttling)
	const runPresentation = async (recordVideo: boolean) => {
		const selectedSlides = images.filter((img) => selectedIds.includes(img.id));
		if (selectedSlides.length === 0) return;

		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		cancelRef.current = false;
		if (recordVideo) {
			setIsGenerating(true);
			if (videoUrl) {
				URL.revokeObjectURL(videoUrl);
				setVideoUrl(null);
			}
		} else {
			setIsPreviewing(true);
		}
		setProgress(0);
		setStatusText("Initializing audio & preparing photos...");

		// IMPORTANT: Create and unlock AudioContext + audio element IMMEDIATELY inside the user click gesture
		// before awaiting image batch downloads. Otherwise the browser's user-gesture token expires during the
		// image downloads, causing AudioContext/audioEl.play() to be suspended and recording silent video!
		const audioCtx = new AudioContext();
		await audioCtx.resume().catch(() => {});

		try {
			// Decode the selected audio file into an AudioBuffer up front so Web Audio API can stream it
			// directly via AudioBufferSourceNode into MediaStreamDestination (100% reliable, never muted by gesture timeouts)
			setStatusText("Decoding audio track & preparing photos...");
			const audioRes = await fetch(activeAudioSrc);
			const audioArrayBuf = await audioRes.arrayBuffer();
			const decodedAudioBuffer = await audioCtx.decodeAudioData(audioArrayBuf);

			// Load images in parallel batches of 6, pre-bake their blurred backdrops, and analyze visual context
			const loadedSlides: HTMLImageElement[] = new Array(selectedSlides.length);
			const prebakedBackdrops: HTMLCanvasElement[] = new Array(
				selectedSlides.length,
			);
			const visualContexts: ImageVisualContext[] = new Array(
				selectedSlides.length,
			);

			const BATCH_SIZE = 6;
			for (let start = 0; start < selectedSlides.length; start += BATCH_SIZE) {
				if (cancelRef.current) throw new Error("Cancelled");
				const end = Math.min(selectedSlides.length, start + BATCH_SIZE);
				setStatusText(
					`Loading & analyzing photos ${start + 1}–${end} of ${selectedSlides.length}...`,
				);
				await Promise.all(
					selectedSlides.slice(start, end).map(async (slide, offset) => {
						const idx = start + offset;
						const loaded = await loadCanvasSafeImage(slide);
						loadedSlides[idx] = loaded;
						prebakedBackdrops[idx] = getOrCreatePrebakedBackdrop(
							slide.id,
							loaded,
						);
						visualContexts[idx] = getOrCreateVisualContext(slide, loaded);
					}),
				);
			}

			const entries = buildActiveIngredientEntries(
				selectedSlides,
				loadedSlides,
			);

			renderCompositeFrame(
				ctx,
				loadedSlides,
				prebakedBackdrops,
				visualContexts,
				selectedSlides,
				entries,
				0,
				renderConfig,
				getSlideIngredientLabel,
			);

			const activeIntroDur = enableIntro ? introDuration : 0;
			const slidesTotalDur = loadedSlides.length * slideDuration;
			const activeOutroDur = enableOutro ? outroDuration : 0;
			const totalDurationSec =
				activeIntroDur + slidesTotalDur + activeOutroDur;

			await audioCtx.resume().catch(() => {});

			const bufferSource = audioCtx.createBufferSource();
			bufferSource.buffer = decodedAudioBuffer;
			bufferSource.loop = true;

			const gainNode = audioCtx.createGain();
			gainNode.gain.setValueAtTime(1, audioCtx.currentTime);

			const streamDest = audioCtx.createMediaStreamDestination();
			bufferSource.connect(gainNode);
			gainNode.connect(streamDest);
			gainNode.connect(audioCtx.destination);

			let recorder: MediaRecorder | null = null;
			const chunks: BlobPart[] = [];

			if (recordVideo) {
				const canvasStream = canvas.captureStream(30);
				const combinedStream = new MediaStream([
					...canvasStream.getVideoTracks(),
					...streamDest.stream.getAudioTracks(),
				]);

				// Prefer MP4 (H.264 + AAC) first when supported by the browser, then WebM (VP8/VP9 + Opus)
				const mimeCandidates = [
					{ mime: "video/mp4;codecs=avc1,mp4a.40.2", ext: "mp4" },
					{ mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
					{ mime: "video/mp4", ext: "mp4" },
					{ mime: "video/webm;codecs=vp8,opus", ext: "webm" },
					{ mime: "video/webm;codecs=vp9,opus", ext: "webm" },
					{ mime: "video/webm", ext: "webm" },
				];

				const supported = mimeCandidates.find((c) =>
					MediaRecorder.isTypeSupported(c.mime),
				) ?? { mime: "", ext: "webm" };

				const baseBitrate =
					totalDurationSec > 120
						? 2_500_000
						: totalDurationSec > 60
							? 3_500_000
							: 5_000_000;
				const adaptiveBitrate = Math.round(
					baseBitrate * RESOLUTION_PRESETS[resolution].bitrateMultiplier,
				);

				setVideoExt(supported.ext);
				recorder = supported.mime
					? new MediaRecorder(combinedStream, {
							mimeType: supported.mime,
							videoBitsPerSecond: adaptiveBitrate,
							audioBitsPerSecond: 128_000,
						})
					: new MediaRecorder(combinedStream);

				recorder.ondataavailable = (e) => {
					if (e.data && e.data.size > 0) chunks.push(e.data);
				};

				recorder.start(1000);
			}

			bufferSource.start(0);

			const startTime = performance.now();

			// Use a 33ms (30 FPS) timer loop rather than requestAnimationFrame alone so recording never freezes if you switch tabs during a 3-minute render
			await new Promise<void>((resolve) => {
				let lastRenderedFrame = -1;
				const intervalId = window.setInterval(() => {
					if (cancelRef.current) {
						window.clearInterval(intervalId);
						resolve();
						return;
					}

					const elapsedSec = (performance.now() - startTime) / 1000;
					const currentFrame = Math.floor(elapsedSec * 30);
					if (currentFrame === lastRenderedFrame) return;
					lastRenderedFrame = currentFrame;

					const pct = Math.min(
						100,
						Math.round((elapsedSec / totalDurationSec) * 100),
					);
					setProgress(pct);

					let phaseLabel = "";
					if (enableIntro && elapsedSec < activeIntroDur) {
						phaseLabel = "Intro Showcase";
					} else if (
						enableOutro &&
						elapsedSec >= activeIntroDur + slidesTotalDur
					) {
						phaseLabel = "Outro Finale";
					} else {
						phaseLabel = `Slide ${Math.min(loadedSlides.length, Math.floor((elapsedSec - activeIntroDur) / slideDuration) + 1)} / ${loadedSlides.length}`;
					}

					setStatusText(
						`${recordVideo ? "Rendering video" : "Playing preview"} (${phaseLabel}) · ${Math.floor(elapsedSec)}s / ${Math.round(totalDurationSec)}s (${pct}%)`,
					);

					if (totalDurationSec - elapsedSec <= 1.5) {
						const remaining = Math.max(
							0,
							(totalDurationSec - elapsedSec) / 1.5,
						);
						gainNode.gain.setValueAtTime(remaining, audioCtx.currentTime);
					}

					renderCompositeFrame(
						ctx,
						loadedSlides,
						prebakedBackdrops,
						visualContexts,
						selectedSlides,
						entries,
						elapsedSec,
						renderConfig,
						getSlideIngredientLabel,
					);

					if (elapsedSec >= totalDurationSec) {
						window.clearInterval(intervalId);
						resolve();
					}
				}, 33);
			});

			try {
				bufferSource.stop();
			} catch {
				// Already stopped
			}

			if (recorder && recorder.state !== "inactive") {
				const finalBlob = await new Promise<Blob>((resolve) => {
					recorder!.onstop = () => {
						resolve(
							new Blob(chunks, {
								type: recorder!.mimeType || "video/webm",
							}),
						);
					};
					recorder!.stop();
				});

				if (!cancelRef.current) {
					const url = URL.createObjectURL(finalBlob);
					setVideoUrl(url);
					const sizeMb = (finalBlob.size / (1024 * 1024)).toFixed(1);
					setStatusText(
						`✓ Video presentation generated (${sizeMb} MB) and ready to download!`,
					);
				}
			} else {
				setStatusText(
					cancelRef.current ? "Stopped." : "Live preview finished.",
				);
			}

			await audioCtx.close().catch(() => {});
		} catch (err) {
			if (!cancelRef.current) {
				setStatusText(
					err instanceof Error ? `Error: ${err.message}` : "Generation failed",
				);
			} else {
				setStatusText("Cancelled.");
			}
		} finally {
			await audioCtx.close().catch(() => {});
			setIsGenerating(false);
			setIsPreviewing(false);
		}
	};

	const stopCurrentRun = () => {
		cancelRef.current = true;
	};

	const toggleSelectSlide = (id: string) => {
		setSelectedIds((prev) =>
			prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
		);
	};

	const moveSlideOrder = (id: string, dir: -1 | 1) => {
		setImages((prev) => {
			const idx = prev.findIndex((img) => img.id === id);
			if (idx < 0) return prev;
			const target = idx + dir;
			if (target < 0 || target >= prev.length) return prev;
			const copy = [...prev];
			const [moved] = copy.splice(idx, 1);
			copy.splice(target, 0, moved);
			return copy;
		});
	};

	const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		if (customAudioUrl) URL.revokeObjectURL(customAudioUrl);
		const url = URL.createObjectURL(file);
		setCustomAudioUrl(url);
		setCustomAudioName(file.name);
		setMusicSource("custom");
	};

	const toggleHideSlideTag = (id: string) => {
		setHiddenTagIds((prev) =>
			prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
		);
	};

	const applySortOrder = (
		mode: "date-desc" | "date-asc" | "name-asc" | "name-desc",
	) => {
		setSortBy(mode);
		setImages((prev) => {
			const sorted = [...prev];
			sorted.sort((a, b) => {
				if (mode === "name-asc") {
					return a.name.localeCompare(b.name, undefined, {
						numeric: true,
						sensitivity: "base",
					});
				}
				if (mode === "name-desc") {
					return b.name.localeCompare(a.name, undefined, {
						numeric: true,
						sensitivity: "base",
					});
				}
				const timeA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
				const timeB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
				return mode === "date-asc" ? timeA - timeB : timeB - timeA;
			});
			return sorted;
		});
	};

	const addCustomIngredient = () => {
		const trimmed = customIngredientInput.trim();
		if (!trimmed) return;
		if (!extraIngredients.includes(trimmed)) {
			setExtraIngredients((prev) => [...prev, trimmed]);
		}
		setCustomIngredientInput("");
	};

	// Idle canvas preview
	useEffect(() => {
		const selectedSlides = images.filter((img) => selectedIds.includes(img.id));
		if (selectedSlides.length === 0 || isGenerating || isPreviewing) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		let active = true;
		const previewSubset = selectedSlides.slice(0, 8);
		Promise.all(previewSubset.map((s) => loadCanvasSafeImage(s)))
			.then((loaded) => {
				if (active && !isGenerating && !isPreviewing) {
					const backdrops = loaded.map((img, i) =>
						getOrCreatePrebakedBackdrop(previewSubset[i].id, img),
					);
					const contexts = loaded.map((img, i) =>
						getOrCreateVisualContext(previewSubset[i], img),
					);
					const entries = buildActiveIngredientEntries(previewSubset, loaded);
					renderCompositeFrame(
						ctx,
						loaded,
						backdrops,
						contexts,
						previewSubset,
						entries,
						enableIntro ? introDuration * 0.55 : 0,
						renderConfig,
						getSlideIngredientLabel,
					);
				}
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [
		images,
		selectedIds,
		ingredientTags,
		hiddenTagIds,
		showSlideTags,
		extraIngredients,
		renderConfig,
	]);

	if (loading) {
		return (
			<div
				style={{
					maxWidth: 1100,
					margin: "2.5rem auto",
					padding: "0 1rem",
					fontFamily: "system-ui, -apple-system, sans-serif",
					textAlign: "center",
					color: "#64748b",
				}}
			>
				Loading Drive files for Presentation Studio...
			</div>
		);
	}

	if (error) {
		return (
			<div
				style={{
					maxWidth: 640,
					margin: "3rem auto",
					padding: "1.5rem",
					borderRadius: 16,
					backgroundColor: "#fef2f2",
					border: "1px solid #fecaca",
					color: "#dc2626",
					textAlign: "center",
					fontFamily: "system-ui, -apple-system, sans-serif",
				}}
			>
				<strong>Error:</strong> {error}
			</div>
		);
	}

	const busy = isGenerating || isPreviewing;
	const selectedSlides = images.filter((img) => selectedIds.includes(img.id));
	const totalDuration =
		(enableIntro ? introDuration : 0) +
		selectedIds.length * slideDuration +
		(enableOutro ? outroDuration : 0);

	return (
		<div
			style={{
				maxWidth: 1320,
				margin: "1.5rem auto 3rem",
				padding: "0 1.25rem",
				fontFamily: "system-ui, -apple-system, sans-serif",
				color: "#0f172a",
			}}
		>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
					gap: 24,
					alignItems: "start",
				}}
			>
				{/* Left Column: 16:9 Presentation Stage & Exported Video */}
				<div
					style={{
						background: "#ffffff",
						borderRadius: 20,
						padding: 20,
						boxShadow: "0 12px 32px -12px rgba(15, 23, 42, 0.12)",
						border: "1px solid #e2e8f0",
						position: "sticky",
						top: 16,
					}}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginBottom: 12,
							flexWrap: "wrap",
							gap: 8,
						}}
					>
						<h3 style={{ margin: 0, fontSize: 18 }}>
							Slide Presentation Stage ({RESOLUTION_PRESETS[resolution].label})
						</h3>
						<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
							<select
								disabled={busy}
								value={resolution}
								onChange={(e) =>
									setResolution(e.target.value as VideoResolutionKey)
								}
								aria-label="Output video resolution"
								style={{
									fontSize: 12,
									fontWeight: 700,
									padding: "4px 10px",
									borderRadius: 999,
									border: `1.5px solid ${themePrimary}`,
									background: "#eff6ff",
									color: "#1e3a8a",
									cursor: busy ? "not-allowed" : "pointer",
								}}
							>
								{(
									Object.keys(RESOLUTION_PRESETS) as VideoResolutionKey[]
								).map((key) => (
									<option key={key} value={key}>
										🎥 {RESOLUTION_PRESETS[key].label}
									</option>
								))}
							</select>
							<span
								style={{
									fontSize: 12,
									fontWeight: 600,
									padding: "4px 10px",
									borderRadius: 999,
									background: "#f1f5f9",
									color: "#475569",
								}}
							>
								{enableIntro ? `Intro (${introDuration}s) + ` : ""}
								{selectedIds.length} slides
								{enableOutro ? ` + Outro (${outroDuration}s)` : ""} ·{" "}
								{totalDuration.toFixed(1)}s total
							</span>
						</div>
					</div>

					<div
						style={{
							position: "relative",
							borderRadius: 14,
							overflow: "hidden",
							background: themeBg,
							aspectRatio: "16 / 9",
						}}
					>
						<canvas
							ref={canvasRef}
							width={RESOLUTION_PRESETS[resolution].width}
							height={RESOLUTION_PRESETS[resolution].height}
							style={{
								width: "100%",
								height: "100%",
								display: "block",
							}}
						/>
					</div>

					{(busy || statusText) && (
						<div style={{ marginTop: 14 }}>
							{busy && (
								<div
									style={{
										height: 8,
										borderRadius: 999,
										background: "#e2e8f0",
										overflow: "hidden",
										marginBottom: 8,
									}}
								>
									<div
										style={{
											width: `${progress}%`,
											height: "100%",
											background: `linear-gradient(90deg, ${themePrimary}, ${themeAccent})`,
											transition: "width 150ms linear",
										}}
									/>
								</div>
							)}
							<div
								style={{
									fontSize: 13,
									color: "#475569",
									display: "flex",
									justifyContent: "space-between",
								}}
							>
								<span>{statusText}</span>
								{busy && <strong>{progress}%</strong>}
							</div>
						</div>
					)}

					<div
						style={{
							display: "flex",
							gap: 10,
							marginTop: 16,
							flexWrap: "wrap",
						}}
					>
						{!busy ? (
							<>
								<button
									type="button"
									disabled={selectedIds.length === 0}
									onClick={() => runPresentation(false)}
									style={{
										flex: 1,
										padding: "11px 16px",
										borderRadius: 12,
										border: "1px solid #cbd5e1",
										background: "#f8fafc",
										color: "#0f172a",
										fontWeight: 600,
										cursor:
											selectedIds.length === 0 ? "not-allowed" : "pointer",
									}}
								>
									▶ Play Live Preview
								</button>
								<button
									type="button"
									disabled={selectedIds.length === 0}
									onClick={() => runPresentation(true)}
									style={{
										flex: 1.4,
										padding: "11px 18px",
										borderRadius: 12,
										border: "none",
										background: `linear-gradient(135deg, ${themePrimary}, ${themeAccent})`,
										color: "#ffffff",
										fontWeight: 600,
										cursor:
											selectedIds.length === 0 ? "not-allowed" : "pointer",
										boxShadow: `0 8px 20px -6px ${rgbaFromHex(themePrimary, 0.55)}`,
									}}
								>
									🎬 Generate Presentation Video
								</button>
							</>
						) : (
							<button
								type="button"
								onClick={stopCurrentRun}
								style={{
									flex: 1,
									padding: "11px 16px",
									borderRadius: 12,
									border: "none",
									background: "#ef4444",
									color: "#ffffff",
									fontWeight: 600,
									cursor: "pointer",
								}}
							>
								⏹ Stop
							</button>
						)}
					</div>

					{videoUrl && (
						<div
							style={{
								marginTop: 20,
								padding: 16,
								borderRadius: 14,
								background: "#f0fdf4",
								border: "1px solid #bbf7d0",
							}}
						>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									marginBottom: 10,
									gap: 10,
									flexWrap: "wrap",
								}}
							>
								<strong style={{ color: "#166534", fontSize: 14 }}>
									✓ Video Ready
								</strong>
								<a
									href={videoUrl}
									download={`drive-presentation.${videoExt}`}
									style={{
										display: "inline-block",
										padding: "8px 16px",
										borderRadius: 10,
										background: "#16a34a",
										color: "#fff",
										textDecoration: "none",
										fontWeight: 600,
										fontSize: 13,
									}}
								>
									⬇ Download Video (.{videoExt})
								</a>
							</div>
							<video
								src={videoUrl}
								controls
								style={{
									width: "100%",
									borderRadius: 10,
									background: "#000",
									display: "block",
								}}
							/>
						</div>
					)}
				</div>

				{/* Right Column: Controls */}
				<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
					{/* 1. Theme Color Picker & Optional AI Animation Generator */}
					<div
						style={{
							background: "#ffffff",
							borderRadius: 20,
							padding: 20,
							boxShadow: "0 12px 32px -12px rgba(15, 23, 42, 0.12)",
							border: "1px solid #e2e8f0",
						}}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: 12,
								flexWrap: "wrap",
								gap: 8,
							}}
						>
							<h3 style={{ margin: 0, fontSize: 17 }}>
								1. Video Theme Colors & Optional AI
							</h3>
							<div style={{ display: "flex", gap: 6 }}>
								{[
									{
										name: "Ocean",
										p: "#2563eb",
										a: "#7c3aed",
										bg: "#0f172a",
									},
									{
										name: "Citrus",
										p: "#f97316",
										a: "#eab308",
										bg: "#1c1917",
									},
									{
										name: "Emerald",
										p: "#10b981",
										a: "#06b6d4",
										bg: "#062019",
									},
									{
										name: "Berry",
										p: "#ec4899",
										a: "#8b5cf6",
										bg: "#1e1024",
									},
								].map((preset) => (
									<button
										key={preset.name}
										type="button"
										disabled={busy}
										onClick={() => {
											setThemePrimary(preset.p);
											setThemeAccent(preset.a);
											setThemeBg(preset.bg);
										}}
										style={{
											fontSize: 11,
											fontWeight: 600,
											padding: "4px 9px",
											borderRadius: 999,
											border: "1px solid #cbd5e1",
											background: "#f8fafc",
											cursor: "pointer",
											display: "inline-flex",
											alignItems: "center",
											gap: 5,
										}}
									>
										<span
											style={{
												width: 10,
												height: 10,
												borderRadius: "50%",
												background: `linear-gradient(135deg, ${preset.p}, ${preset.a})`,
											}}
										/>
										{preset.name}
									</button>
								))}
							</div>
						</div>

						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(3, 1fr)",
								gap: 10,
								marginBottom: 14,
							}}
						>
							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									padding: "8px 10px",
									borderRadius: 10,
									border: "1px solid #e2e8f0",
									background: "#f8fafc",
									fontSize: 12,
									fontWeight: 600,
									cursor: "pointer",
								}}
							>
								<input
									type="color"
									disabled={busy}
									value={themePrimary}
									onChange={(e) => setThemePrimary(e.target.value)}
									style={{
										width: 28,
										height: 28,
										border: "none",
										background: "none",
										cursor: "pointer",
										padding: 0,
									}}
								/>
								<div>
									<div>Primary Color</div>
									<div style={{ fontSize: 11, color: "#64748b" }}>
										{themePrimary}
									</div>
								</div>
							</label>

							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									padding: "8px 10px",
									borderRadius: 10,
									border: "1px solid #e2e8f0",
									background: "#f8fafc",
									fontSize: 12,
									fontWeight: 600,
									cursor: "pointer",
								}}
							>
								<input
									type="color"
									disabled={busy}
									value={themeAccent}
									onChange={(e) => setThemeAccent(e.target.value)}
									style={{
										width: 28,
										height: 28,
										border: "none",
										background: "none",
										cursor: "pointer",
										padding: 0,
									}}
								/>
								<div>
									<div>Accent Glow</div>
									<div style={{ fontSize: 11, color: "#64748b" }}>
										{themeAccent}
									</div>
								</div>
							</label>

							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									padding: "8px 10px",
									borderRadius: 10,
									border: "1px solid #e2e8f0",
									background: "#f8fafc",
									fontSize: 12,
									fontWeight: 600,
									cursor: "pointer",
								}}
							>
								<input
									type="color"
									disabled={busy}
									value={themeBg}
									onChange={(e) => setThemeBg(e.target.value)}
									style={{
										width: 28,
										height: 28,
										border: "none",
										background: "none",
										cursor: "pointer",
										padding: 0,
									}}
								/>
								<div>
									<div>Stage Backdrop</div>
									<div style={{ fontSize: 11, color: "#64748b" }}>
										{themeBg}
									</div>
								</div>
							</label>
						</div>

						{/* Optional AI Animation Choreography Generator */}
						<div
							style={{
								padding: 12,
								borderRadius: 12,
								background: "#f8fafc",
								border: "1px solid #e2e8f0",
							}}
						>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									marginBottom: 8,
									gap: 8,
									flexWrap: "wrap",
								}}
							>
								<span
									style={{
										fontSize: 12,
										fontWeight: 700,
										color: "#0f172a",
									}}
								>
									🤖 Optional AI Intro & Outro Animation Generator
								</span>
								{aiChoreography && (
									<span
										style={{
											fontSize: 11,
											fontWeight: 600,
											padding: "2px 8px",
											borderRadius: 999,
											background: rgbaFromHex(themePrimary, 0.14),
											color: themePrimary,
										}}
									>
										Active: {aiChoreography.cardTrajectory} ·{" "}
										{aiChoreography.backdropEffect}
									</span>
								)}
							</div>

							<div
								style={{
									display: "flex",
									gap: 8,
									marginBottom: 8,
									flexWrap: "wrap",
								}}
							>
								<input
									type="text"
									disabled={busy || aiGeneratingAnim}
									value={aiPromptInput}
									onChange={(e) => setAiPromptInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleGenerateAiAnimation();
									}}
									placeholder="Describe desired animation (e.g. 3D spiral vortex, neon laser grid, wave cascade)..."
									style={{
										flex: 1,
										minWidth: 200,
										padding: "8px 10px",
										borderRadius: 8,
										border: "1px solid #cbd5e1",
										fontSize: 12,
									}}
								/>
								<button
									type="button"
									disabled={busy || aiGeneratingAnim}
									onClick={handleGenerateAiAnimation}
									style={{
										padding: "8px 14px",
										borderRadius: 8,
										border: "none",
										background: `linear-gradient(135deg, ${themePrimary}, ${themeAccent})`,
										color: "#fff",
										fontWeight: 600,
										fontSize: 12,
										cursor: "pointer",
									}}
								>
									🤖 AI Generate Intro & Outro Animation
								</button>
							</div>

							<div
								style={{
									display: "flex",
									gap: 8,
									flexWrap: "wrap",
									alignItems: "center",
								}}
							>
								<button
									type="button"
									disabled={busy || aiGeneratingText}
									onClick={handleGenerateAiCopy}
									style={{
										padding: "6px 10px",
										borderRadius: 8,
										border: "1px solid #cbd5e1",
										background: "#ffffff",
										color: "#0f172a",
										fontWeight: 600,
										fontSize: 11,
										cursor: "pointer",
									}}
								>
									✨ AI Suggest Headlines
								</button>

								<button
									type="button"
									disabled={busy || aiGeneratingArt}
									onClick={handleGenerateAiBackdrops}
									style={{
										padding: "6px 10px",
										borderRadius: 8,
										border: "1px solid #cbd5e1",
										background: "#ffffff",
										color: "#0f172a",
										fontWeight: 600,
										fontSize: 11,
										cursor: "pointer",
									}}
								>
									🎨 AI Generate Nebula Backdrop
								</button>

								{(aiIntroArt || aiOutroArt) && (
									<label
										style={{
											display: "flex",
											alignItems: "center",
											gap: 5,
											fontSize: 11,
											fontWeight: 600,
											cursor: "pointer",
										}}
									>
										<input
											type="checkbox"
											checked={useAiBackdrop}
											onChange={(e) => setUseAiBackdrop(e.target.checked)}
										/>
										Show AI Backdrop
									</label>
								)}
							</div>
						</div>
					</div>

					{/* 2. Intro & Outro Generator Card */}
					<div
						style={{
							background: "#ffffff",
							borderRadius: 20,
							padding: 20,
							boxShadow: "0 12px 32px -12px rgba(15, 23, 42, 0.12)",
							border: "1px solid #e2e8f0",
						}}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: 14,
								flexWrap: "wrap",
								gap: 10,
							}}
						>
							<h3 style={{ margin: 0, fontSize: 17 }}>
								2. Intro & Outro Generator
							</h3>
							<div style={{ display: "flex", gap: 14 }}>
								<label
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										fontSize: 13,
										fontWeight: 600,
										cursor: "pointer",
										color: themePrimary,
									}}
								>
									<input
										type="checkbox"
										disabled={busy}
										checked={enableIntro}
										onChange={(e) => setEnableIntro(e.target.checked)}
									/>
									Enable Intro
								</label>
								<label
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										fontSize: 13,
										fontWeight: 600,
										cursor: "pointer",
										color: themeAccent,
									}}
								>
									<input
										type="checkbox"
										disabled={busy}
										checked={enableOutro}
										onChange={(e) => setEnableOutro(e.target.checked)}
									/>
									Enable Outro
								</label>
							</div>
						</div>

						{enableIntro && (
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: 10,
									marginBottom: 12,
								}}
							>
								<label
									style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}
								>
									Intro Headline
									<input
										type="text"
										disabled={busy}
										value={introTitle}
										onChange={(e) => setIntroTitle(e.target.value)}
										placeholder="Featured Ingredients"
										style={{
											width: "100%",
											marginTop: 4,
											padding: "8px 10px",
											borderRadius: 8,
											border: "1px solid #cbd5e1",
											fontSize: 13,
											boxSizing: "border-box",
										}}
									/>
								</label>
								<label
									style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}
								>
									Intro Subtitle
									<input
										type="text"
										disabled={busy}
										value={introSubtitle}
										onChange={(e) => setIntroSubtitle(e.target.value)}
										placeholder="Crafted Selection..."
										style={{
											width: "100%",
											marginTop: 4,
											padding: "8px 10px",
											borderRadius: 8,
											border: "1px solid #cbd5e1",
											fontSize: 13,
											boxSizing: "border-box",
										}}
									/>
								</label>
							</div>
						)}

						{enableOutro && (
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: 10,
									marginBottom: 12,
								}}
							>
								<label
									style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}
								>
									Outro Headline
									<input
										type="text"
										disabled={busy}
										value={outroTitle}
										onChange={(e) => setOutroTitle(e.target.value)}
										placeholder="Thank You for Watching"
										style={{
											width: "100%",
											marginTop: 4,
											padding: "8px 10px",
											borderRadius: 8,
											border: "1px solid #cbd5e1",
											fontSize: 13,
											boxSizing: "border-box",
										}}
									/>
								</label>
								<label
									style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}
								>
									Outro Subtitle
									<input
										type="text"
										disabled={busy}
										value={outroSubtitle}
										onChange={(e) => setOutroSubtitle(e.target.value)}
										placeholder="Freshly Crafted..."
										style={{
											width: "100%",
											marginTop: 4,
											padding: "8px 10px",
											borderRadius: 8,
											border: "1px solid #cbd5e1",
											fontSize: 13,
											boxSizing: "border-box",
										}}
									/>
								</label>
							</div>
						)}

						{enableIntro && (
							<div style={{ marginBottom: 14 }}>
								<div
									style={{
										fontSize: 12,
										fontWeight: 600,
										color: "#475569",
										marginBottom: 6,
									}}
								>
									Intro Animation Template
								</div>
								<div
									style={{
										display: "grid",
										gridTemplateColumns: "repeat(4, 1fr)",
										gap: 8,
									}}
								>
									{(
										[
											{
												id: "showcase-cards",
												label: "🃏 Ingredient Cards",
											},
											{
												id: "orbital-burst",
												label: "🪐 Orbital Ring",
											},
											{
												id: "cinema-reel",
												label: "🎞️ Cinema Reel",
											},
											{
												id: "ai-custom",
												label: "🤖 AI Choreography",
											},
										] as const
									).map((tpl) => (
										<button
											key={tpl.id}
											type="button"
											disabled={busy}
											onClick={() => {
												if (tpl.id === "ai-custom" && !aiChoreography) {
													handleGenerateAiAnimation();
												} else {
													setIntroStyle(tpl.id);
												}
											}}
											style={{
												padding: "8px 10px",
												borderRadius: 10,
												border:
													introStyle === tpl.id
														? `2px solid ${themePrimary}`
														: "1px solid #cbd5e1",
												background:
													introStyle === tpl.id ? "#eff6ff" : "#ffffff",
												color: "#0f172a",
												fontWeight: 600,
												fontSize: 12,
												cursor: "pointer",
											}}
										>
											{tpl.label}
										</button>
									))}
								</div>
							</div>
						)}

						<div>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									marginBottom: 6,
									flexWrap: "wrap",
									gap: 6,
								}}
							>
								<span
									style={{
										fontSize: 12,
										fontWeight: 600,
										color: "#475569",
									}}
								>
									Ingredient Tags (Hiding a tag completely removes its card/pill
									space)
								</span>
								<div style={{ display: "flex", gap: 6 }}>
									<button
										type="button"
										disabled={busy}
										onClick={() => setHiddenTagIds([])}
										style={{
											fontSize: 11,
											padding: "2px 8px",
											borderRadius: 6,
											border: "1px solid #cbd5e1",
											background: "#f8fafc",
											cursor: "pointer",
										}}
									>
										Show All Tags
									</button>
									<button
										type="button"
										disabled={busy}
										onClick={() => {
											setHiddenTagIds(images.map((i) => i.id));
											setExtraIngredients([]);
										}}
										style={{
											fontSize: 11,
											padding: "2px 8px",
											borderRadius: 6,
											border: "1px solid #cbd5e1",
											background: "#f8fafc",
											cursor: "pointer",
										}}
									>
										Hide All Tags
									</button>
								</div>
							</div>

							<div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
								<input
									type="text"
									disabled={busy}
									value={customIngredientInput}
									onChange={(e) => setCustomIngredientInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") addCustomIngredient();
									}}
									placeholder="Add custom ingredient tag (e.g. Fresh Orange Zest)..."
									style={{
										flex: 1,
										padding: "7px 10px",
										borderRadius: 8,
										border: "1px solid #cbd5e1",
										fontSize: 13,
									}}
								/>
								<button
									type="button"
									disabled={busy}
									onClick={addCustomIngredient}
									style={{
										padding: "7px 14px",
										borderRadius: 8,
										border: "none",
										background: "#0f172a",
										color: "#fff",
										fontWeight: 600,
										fontSize: 12,
										cursor: "pointer",
									}}
								>
									+ Add Tag
								</button>
							</div>

							<div
								style={{
									display: "flex",
									flexWrap: "wrap",
									gap: 6,
									maxHeight: 120,
									overflowY: "auto",
								}}
							>
								{selectedSlides.map((slide) => {
									const isTagHidden = hiddenTagIds.includes(slide.id);
									return (
										<div
											key={slide.id}
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: 6,
												background: isTagHidden ? "#f1f5f9" : "#eff6ff",
												border: isTagHidden
													? "1px dashed #cbd5e1"
													: "1px solid #bfdbfe",
												opacity: isTagHidden ? 0.55 : 1,
												borderRadius: 999,
												padding: "3px 8px 3px 4px",
												fontSize: 12,
											}}
										>
											<img
												src={getThumbUrl(slide)}
												alt=""
												referrerPolicy="no-referrer"
												style={{
													width: 20,
													height: 20,
													borderRadius: "50%",
													objectFit: "cover",
												}}
											/>
											<input
												type="text"
												disabled={busy || isTagHidden}
												value={
													ingredientTags[slide.id] ??
													cleanIngredientName(slide.name)
												}
												onChange={(e) =>
													setIngredientTags((prev) => ({
														...prev,
														[slide.id]: e.target.value,
													}))
												}
												title="Click to edit ingredient name"
												style={{
													border: "none",
													background: "transparent",
													fontWeight: 600,
													fontSize: 12,
													textDecoration: isTagHidden
														? "line-through"
														: "none",
													color: isTagHidden ? "#64748b" : "#1e3a8a",
													width: Math.max(
														65,
														(
															ingredientTags[slide.id] ??
															cleanIngredientName(slide.name)
														).length * 7.2,
													),
													outline: "none",
												}}
											/>
											<button
												type="button"
												disabled={busy}
												onClick={() => toggleHideSlideTag(slide.id)}
												title={
													isTagHidden
														? "Restore ingredient tag"
														: "Hide/remove ingredient tag"
												}
												style={{
													border: "none",
													background: "transparent",
													cursor: "pointer",
													color: isTagHidden ? "#2563eb" : "#64748b",
													fontWeight: 700,
													fontSize: 13,
													padding: "0 2px",
													lineHeight: 1,
												}}
											>
												{isTagHidden ? "+" : "×"}
											</button>
										</div>
									);
								})}

								{extraIngredients.map((tag) => (
									<span
										key={tag}
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 6,
											background: "#fef3c7",
											border: "1px solid #fde68a",
											color: "#92400e",
											borderRadius: 999,
											padding: "4px 10px",
											fontSize: 12,
											fontWeight: 600,
										}}
									>
										✨ {tag}
										<button
											type="button"
											disabled={busy}
											onClick={() =>
												setExtraIngredients((prev) =>
													prev.filter((t) => t !== tag),
												)
											}
											style={{
												border: "none",
												background: "transparent",
												cursor: "pointer",
												color: "#92400e",
												fontWeight: 700,
												padding: 0,
											}}
										>
											×
										</button>
									</span>
								))}
							</div>
						</div>
					</div>

					{/* 3. Music & Modern Transitions Card */}
					<div
						style={{
							background: "#ffffff",
							borderRadius: 20,
							padding: 20,
							boxShadow: "0 12px 32px -12px rgba(15, 23, 42, 0.12)",
							border: "1px solid #e2e8f0",
						}}
					>
						<h3 style={{ margin: "0 0 14px", fontSize: 17 }}>
							3. Music & Modern Slide Transitions
						</h3>

						<div style={{ marginBottom: 16 }}>
							<div
								style={{
									fontSize: 13,
									fontWeight: 600,
									color: "#334155",
									marginBottom: 8,
								}}
							>
								Background Music
							</div>
							<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
								<button
									type="button"
									disabled={busy}
									onClick={() => setMusicSource("asset")}
									style={{
										padding: "8px 14px",
										borderRadius: 10,
										border:
											musicSource === "asset"
												? `2px solid ${themePrimary}`
												: "1px solid #cbd5e1",
										background:
											musicSource === "asset" ? "#eff6ff" : "#ffffff",
										color: "#0f172a",
										fontWeight: 600,
										fontSize: 13,
										cursor: "pointer",
									}}
								>
									🎵 Asset Music (orange.mp3)
								</button>

								<label
									style={{
										padding: "8px 14px",
										borderRadius: 10,
										border:
											musicSource === "custom"
												? `2px solid ${themePrimary}`
												: "1px solid #cbd5e1",
										background:
											musicSource === "custom" ? "#eff6ff" : "#ffffff",
										color: "#0f172a",
										fontWeight: 600,
										fontSize: 13,
										cursor: busy ? "not-allowed" : "pointer",
									}}
								>
									📂 {customAudioName ? customAudioName : "Upload New Music..."}
									<input
										type="file"
										accept="audio/*"
										disabled={busy}
										onChange={handleAudioUpload}
										style={{ display: "none" }}
									/>
								</label>
							</div>
						</div>

						<div style={{ marginBottom: 16 }}>
							<div
								style={{
									fontSize: 13,
									fontWeight: 600,
									color: "#334155",
									marginBottom: 8,
								}}
							>
								Modern Transition Effect
							</div>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "repeat(4, 1fr)",
									gap: 8,
								}}
							>
								{(
									[
										{ id: "auto-mix", label: "✨ Auto Mix All" },
										{ id: "prism-shatter", label: "💎 Prism Shatter" },
										{ id: "vortex-spin", label: "🌀 Vortex Spin" },
										{ id: "rgb-chromatic", label: "🌈 RGB Pulse" },
										{ id: "kaleido-tiles", label: "🧩 Mosaic Tiles" },
										{ id: "curtain-split", label: "🎭 Split Curtain" },
										{ id: "diagonal-shutter", label: "⚡ Diagonal Sweep" },
										{ id: "circle-iris", label: "⭕ Circle Portal" },
										{ id: "split-blinds", label: "🪟 Split Blinds" },
										{ id: "flip-3d", label: "🔄 3D Card Flip" },
										{ id: "glitch-slice", label: "🎞️ Glitch Slice" },
										{ id: "zoom", label: "🚀 Zoom Warp" },
									] as const
								).map((opt) => (
									<button
										key={opt.id}
										type="button"
										disabled={busy}
										onClick={() => setTransitionStyle(opt.id)}
										style={{
											padding: "8px 8px",
											borderRadius: 10,
											border:
												transitionStyle === opt.id
													? `2px solid ${themePrimary}`
													: "1px solid #cbd5e1",
											background:
												transitionStyle === opt.id ? "#eff6ff" : "#ffffff",
											color: "#0f172a",
											fontWeight: 600,
											fontSize: 12,
											cursor: "pointer",
										}}
									>
										{opt.label}
									</button>
								))}
							</div>
						</div>

						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(4, 1fr)",
								gap: 10,
								marginBottom: 12,
							}}
						>
							<label style={{ fontSize: 12, color: "#334155" }}>
								<div style={{ fontWeight: 600, marginBottom: 4 }}>
									Intro: {introDuration}s
								</div>
								<input
									type="range"
									min={2.5}
									max={7}
									step={0.5}
									disabled={busy || !enableIntro}
									value={introDuration}
									onChange={(e) => setIntroDuration(Number(e.target.value))}
									style={{ width: "100%" }}
								/>
							</label>

							<label style={{ fontSize: 12, color: "#334155" }}>
								<div style={{ fontWeight: 600, marginBottom: 4 }}>
									Slide: {slideDuration}s
								</div>
								<input
									type="range"
									min={2}
									max={8}
									step={0.5}
									disabled={busy}
									value={slideDuration}
									onChange={(e) => setSlideDuration(Number(e.target.value))}
									style={{ width: "100%" }}
								/>
							</label>

							<label style={{ fontSize: 12, color: "#334155" }}>
								<div style={{ fontWeight: 600, marginBottom: 4 }}>
									Transition: {transitionDuration}s
								</div>
								<input
									type="range"
									min={0.5}
									max={2}
									step={0.1}
									disabled={busy}
									value={transitionDuration}
									onChange={(e) =>
										setTransitionDuration(Number(e.target.value))
									}
									style={{ width: "100%" }}
								/>
							</label>

							<label style={{ fontSize: 12, color: "#334155" }}>
								<div style={{ fontWeight: 600, marginBottom: 4 }}>
									Outro: {outroDuration}s
								</div>
								<input
									type="range"
									min={2}
									max={6}
									step={0.5}
									disabled={busy || !enableOutro}
									value={outroDuration}
									onChange={(e) => setOutroDuration(Number(e.target.value))}
									style={{ width: "100%" }}
								/>
							</label>
						</div>

						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 8,
							}}
						>
							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									fontSize: 13,
									fontWeight: 600,
									color: "#334155",
									cursor: "pointer",
								}}
							>
								<input
									type="checkbox"
									disabled={busy}
									checked={kenBurns}
									onChange={(e) => setKenBurns(e.target.checked)}
								/>
								Enable Ken Burns Motion (Cinematic slow pan & zoom)
							</label>

							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									fontSize: 13,
									fontWeight: 600,
									color: "#334155",
									cursor: "pointer",
								}}
							>
								<input
									type="checkbox"
									disabled={busy}
									checked={contextEffects}
									onChange={(e) => setContextEffects(e.target.checked)}
								/>
								✨ Enable Smart Image-Context Effects (Auto palette light leaks,
								sheen & vibe particles)
							</label>

							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									fontSize: 13,
									fontWeight: 600,
									color: "#334155",
									cursor: "pointer",
								}}
							>
								<input
									type="checkbox"
									disabled={busy}
									checked={showSlideTags}
									onChange={(e) => setShowSlideTags(e.target.checked)}
								/>
								Show Lower-Third Ingredient Tag on Slides
							</label>
						</div>
					</div>

					{/* 4. Drive Files Manager Card */}
					<div
						style={{
							background: "#ffffff",
							borderRadius: 20,
							padding: 20,
							boxShadow: "0 12px 32px -12px rgba(15, 23, 42, 0.12)",
							border: "1px solid #e2e8f0",
						}}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: 12,
								flexWrap: "wrap",
								gap: 8,
							}}
						>
							<h3 style={{ margin: 0, fontSize: 17 }}>
								4. Select Ingredient Photos ({selectedIds.length}/
								{images.length})
							</h3>
							<div
								style={{
									display: "flex",
									gap: 6,
									flexWrap: "wrap",
									alignItems: "center",
								}}
							>
								<select
									disabled={busy}
									value={sortBy}
									onChange={(e) =>
										applySortOrder(
											e.target.value as
												| "date-desc"
												| "date-asc"
												| "name-asc"
												| "name-desc",
										)
									}
									aria-label="Sort photos"
									style={{
										fontSize: 12,
										padding: "4px 8px",
										borderRadius: 8,
										border: "1px solid #cbd5e1",
										background: "#f8fafc",
										color: "#0f172a",
										fontWeight: 600,
										cursor: "pointer",
									}}
								>
									<option value="date-desc">Sort: Newest Date</option>
									<option value="date-asc">Sort: Oldest Date</option>
									<option value="name-asc">Sort: Name (A → Z)</option>
									<option value="name-desc">Sort: Name (Z → A)</option>
								</select>
								<button
									type="button"
									disabled={busy}
									onClick={() => setSelectedIds(images.map((i) => i.id))}
									style={{
										fontSize: 12,
										padding: "4px 10px",
										borderRadius: 8,
										border: "1px solid #cbd5e1",
										background: "#f8fafc",
										cursor: "pointer",
									}}
								>
									Select All
								</button>
								<button
									type="button"
									disabled={busy}
									onClick={() => setSelectedIds([])}
									style={{
										fontSize: 12,
										padding: "4px 10px",
										borderRadius: 8,
										border: "1px solid #cbd5e1",
										background: "#f8fafc",
										cursor: "pointer",
									}}
								>
									Clear
								</button>
							</div>
						</div>

						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fill, minmax(115px, 1fr))",
								gap: 10,
								maxHeight: 310,
								overflowY: "auto",
								padding: 4,
							}}
						>
							{images.map((img, idx) => {
								const isSelected = selectedIds.includes(img.id);
								return (
									<div
										key={img.id}
										style={{
											position: "relative",
											borderRadius: 12,
											overflow: "hidden",
											border: isSelected
												? `2px solid ${themePrimary}`
												: "2px solid #e2e8f0",
											opacity: isSelected ? 1 : 0.45,
											background: "#0f172a",
											aspectRatio: "4 / 3",
										}}
									>
										<img
											src={getThumbUrl(img)}
											alt={img.name}
											referrerPolicy="no-referrer"
											onClick={() => !busy && toggleSelectSlide(img.id)}
											style={{
												width: "100%",
												height: "100%",
												objectFit: "cover",
												cursor: busy ? "not-allowed" : "pointer",
												display: "block",
											}}
										/>

										<span
											style={{
												position: "absolute",
												top: 6,
												left: 6,
												background: isSelected
													? themePrimary
													: "rgba(15, 23, 42, 0.7)",
												color: "#fff",
												fontSize: 11,
												fontWeight: 700,
												padding: "2px 7px",
												borderRadius: 999,
												pointerEvents: "none",
											}}
										>
											#{idx + 1}
										</span>

										<div
											style={{
												position: "absolute",
												bottom: 4,
												right: 4,
												display: "flex",
												gap: 3,
											}}
										>
											<button
												type="button"
												disabled={busy || idx === 0}
												onClick={() => moveSlideOrder(img.id, -1)}
												title="Move earlier"
												style={{
													background: "rgba(15, 23, 42, 0.75)",
													color: "#fff",
													border: "none",
													borderRadius: 6,
													width: 22,
													height: 22,
													fontSize: 11,
													cursor: "pointer",
												}}
											>
												◀
											</button>
											<button
												type="button"
												disabled={busy || idx === images.length - 1}
												onClick={() => moveSlideOrder(img.id, 1)}
												title="Move later"
												style={{
													background: "rgba(15, 23, 42, 0.75)",
													color: "#fff",
													border: "none",
													borderRadius: 6,
													width: 22,
													height: 22,
													fontSize: 11,
													cursor: "pointer",
												}}
											>
												▶
											</button>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
