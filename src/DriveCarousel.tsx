import { useCallback, useEffect, useRef, useState } from "react";
import bgMusic from "./assets/orange.mp3";

interface DriveImage {
	id: string;
	name: string;
	thumbnailLink?: string;
	createdTime?: string;
	imageMediaMetadata?: {
		width?: number;
		height?: number;
	};
}

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const FOLDER_ID = import.meta.env.VITE_DRIVE_FOLDER_ID?.split("?")[0]?.trim();

// Center card takes 66% of the stage width so the previous & next cards peek in on both sides
const SLIDE_WIDTH_PCT = 66;
const SIDE_OFFSET_PCT = (100 - SLIDE_WIDTH_PCT) / 2;

export function DriveCarousel() {
	const [images, setImages] = useState<DriveImage[]>([]);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isPaused, setIsPaused] = useState(false);
	const [isMuted, setIsMuted] = useState(false);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		const unlockEvents = [
			"click",
			"keydown",
			"pointerdown",
			"pointermove",
			"touchstart",
			"wheel",
		];

		const removeUnlockListeners = () => {
			for (const evt of unlockEvents) {
				window.removeEventListener(evt, unlockAudio);
			}
		};

		const unlockAudio = () => {
			audio.muted = false;
			setIsMuted(false);
			audio
				.play()
				.then(() => {
					removeUnlockListeners();
				})
				.catch(() => {});
		};

		// Try unmuted autoplay first; if blocked by browser policy, start muted immediately
		// and unmute automatically on the very first interaction/gesture
		audio.muted = false;
		audio.play().catch(() => {
			audio.muted = true;
			setIsMuted(true);
			audio.play().catch(() => {});
			for (const evt of unlockEvents) {
				window.addEventListener(evt, unlockAudio, { passive: true });
			}
		});

		return removeUnlockListeners;
	}, []);

	const toggleMute = () => {
		const audio = audioRef.current;
		if (!audio) return;
		const nextMuted = !isMuted;
		audio.muted = nextMuted;
		setIsMuted(nextMuted);
		if (!nextMuted && audio.paused) {
			audio.play().catch(() => {});
		}
	};

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
					fields:
						"files(id, name, thumbnailLink, createdTime, imageMediaMetadata(width,height))",
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
				setImages(data.files ?? []);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load images");
			} finally {
				setLoading(false);
			}
		}

		fetchImages();
	}, []);

	const prevSlide = useCallback(() => {
		setCurrentIndex((i) => (i === 0 ? images.length - 1 : i - 1));
	}, [images.length]);

	const nextSlide = useCallback(() => {
		setCurrentIndex((i) => (i === images.length - 1 ? 0 : i + 1));
	}, [images.length]);

	// Keyboard arrow navigation
	useEffect(() => {
		if (images.length <= 1) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "ArrowLeft") prevSlide();
			if (e.key === "ArrowRight") nextSlide();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [images.length, prevSlide, nextSlide]);

	// Auto-advance every 3 seconds unless hovered
	useEffect(() => {
		if (images.length <= 1 || isPaused) return;
		const timer = setInterval(nextSlide, 3000);
		return () => clearInterval(timer);
	}, [images.length, isPaused, nextSlide]);

	const getHighResUrl = (img: DriveImage) =>
		img.thumbnailLink
			? img.thumbnailLink.replace(/=s\d+$/, "=s1600")
			: `https://drive.google.com/thumbnail?id=${img.id}&sz=w1600`;

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
				Loading photos from Google Drive...
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

	if (images.length === 0) {
		return (
			<div
				style={{
					textAlign: "center",
					padding: 60,
					color: "#64748b",
					fontFamily: "system-ui, -apple-system, sans-serif",
				}}
			>
				No images found in this Google Drive folder.
			</div>
		);
	}

	// Build a continuous tripled track [copy 0, copy 1 (middle), copy 2]
	// so even at the first or last slide, the previous & next images always appear seamlessly on both sides
	const displaySlides =
		images.length > 1
			? [
					...images.map((img, i) => ({ img, realIndex: i, copy: 0 })),
					...images.map((img, i) => ({ img, realIndex: i, copy: 1 })),
					...images.map((img, i) => ({ img, realIndex: i, copy: 2 })),
				]
			: [{ img: images[0], realIndex: 0, copy: 0 }];

	const activeDisplayIndex =
		images.length > 1 ? images.length + currentIndex : 0;

	const trackTranslatePct =
		images.length > 1
			? SIDE_OFFSET_PCT - activeDisplayIndex * SLIDE_WIDTH_PCT
			: 0;

	return (
		<div
			style={{
				position: "relative",
				maxWidth: 1920,
				margin: "2rem auto",
				padding: "0 1rem",
				fontFamily: "system-ui, -apple-system, sans-serif",
				userSelect: "none",
			}}
		>
			<audio ref={audioRef} src={bgMusic} autoPlay loop />
			{/* Continuous Stage with Soft Faded Left/Right Edges */}
			<div
				onMouseEnter={() => setIsPaused(true)}
				onMouseLeave={() => setIsPaused(false)}
				style={{
					position: "relative",
					overflow: "hidden",
					padding: "16px 0 24px",
					// Smooth fade mask on both left and right edges
					WebkitMaskImage:
						images.length > 1
							? "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.85) 12%, #000 22%, #000 78%, rgba(0,0,0,0.85) 88%, transparent 100%)"
							: undefined,
					maskImage:
						images.length > 1
							? "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.85) 12%, #000 22%, #000 78%, rgba(0,0,0,0.85) 88%, transparent 100%)"
							: undefined,
				}}
			>
				{/* Sliding Track */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						width: "100%",
						transform: `translate3d(${trackTranslatePct}%, 0, 0)`,
						transition: "transform 650ms cubic-bezier(0.22, 1, 0.36, 1)",
						willChange: "transform",
					}}
				>
					{displaySlides.map(({ img, realIndex, copy }, displayIdx) => {
						const offset = displayIdx - activeDisplayIndex;
						const isActive = offset === 0;
						const isAdjacent = Math.abs(offset) === 1;
						const isVisible = Math.abs(offset) <= 2;

						return (
							<div
								key={`${copy}-${img.id}`}
								onClick={() => {
									if (!isActive) setCurrentIndex(realIndex);
								}}
								style={{
									flex: `0 0 ${images.length > 1 ? SLIDE_WIDTH_PCT : 100}%`,
									display: "flex",
									justifyContent: "center",
									alignItems: "center",
									boxSizing: "border-box",
									padding: "0 10px",
									cursor: isActive ? "default" : "pointer",
									transform: isActive
										? "scale(1)"
										: isAdjacent
											? "scale(0.86)"
											: "scale(0.76)",
									opacity: isActive ? 1 : isAdjacent ? 0.55 : 0,
									filter: isActive ? "none" : "blur(1.5px)",
									transition:
										"transform 650ms cubic-bezier(0.22, 1, 0.36, 1), opacity 650ms ease, filter 650ms ease",
								}}
							>
								{/* Card Container that Tightly Fits Each Image */}
								<div
									style={{
										position: "relative",
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "center",
										borderRadius: 18,
										overflow: "hidden",
										boxShadow: isActive
											? "0 20px 45px -12px rgba(15, 23, 42, 0.38)"
											: "0 10px 25px -10px rgba(15, 23, 42, 0.22)",
										transition: "box-shadow 650ms ease",
									}}
								>
									{isVisible && (
										<img
											src={getHighResUrl(img)}
											alt={img.name}
											referrerPolicy="no-referrer"
											style={{
												display: "block",
												width: "auto",
												height: "auto",
												maxWidth: "100%",
												maxHeight: "68vh",
												borderRadius: 18,
											}}
										/>
									)}

									{isActive && (
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												toggleMute();
											}}
											aria-label={isMuted ? "Unmute music" : "Mute music"}
											style={{
												position: "absolute",
												top: 12,
												right: 12,
												zIndex: 5,
												background: "rgba(15, 23, 42, 0.65)",
												backdropFilter: "blur(10px)",
												color: "#fff",
												border: "1px solid rgba(255, 255, 255, 0.25)",
												borderRadius: "50%",
												width: 40,
												height: 40,
												cursor: "pointer",
												fontSize: 16,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
											}}
										>
											{isMuted ? "🔇" : "🔊"}
										</button>
									)}

									{/* Caption Overlay Fitted Inside the Active Image */}
								</div>
							</div>
						);
					})}
				</div>

				{/* Floating Navigation Arrows */}
				{images.length > 1 && (
					<>
						<button
							type="button"
							onClick={prevSlide}
							aria-label="Previous image"
							style={{
								position: "absolute",
								left: "14%",
								top: "50%",
								zIndex: 4,
								transform: "translateY(-50%)",
								background: "rgba(15, 23, 42, 0.65)",
								backdropFilter: "blur(10px)",
								color: "#fff",
								border: "1px solid rgba(255, 255, 255, 0.25)",
								borderRadius: "50%",
								width: 44,
								height: 44,
								cursor: "pointer",
								fontSize: 17,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								boxShadow: "0 8px 20px rgba(0, 0, 0, 0.25)",
							}}
						>
							❮
						</button>
						<button
							type="button"
							onClick={nextSlide}
							aria-label="Next image"
							style={{
								position: "absolute",
								right: "14%",
								top: "50%",
								zIndex: 4,
								transform: "translateY(-50%)",
								background: "rgba(15, 23, 42, 0.65)",
								backdropFilter: "blur(10px)",
								color: "#fff",
								border: "1px solid rgba(255, 255, 255, 0.25)",
								borderRadius: "50%",
								width: 44,
								height: 44,
								cursor: "pointer",
								fontSize: 17,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								boxShadow: "0 8px 20px rgba(0, 0, 0, 0.25)",
							}}
						>
							❯
						</button>
					</>
				)}
			</div>
		</div>
	);
}
