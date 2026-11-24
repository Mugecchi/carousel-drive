import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { DriveCarousel } from "./DriveCarousel";
import { DriveVideoStudio } from "./DriveVideoStudio";

function App() {
	const [activeModule, setActiveModule] = useState<"carousel" | "studio">(
		"carousel",
	);

	return (
		<div>
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					gap: 10,
					padding: "16px 16px 0",
					fontFamily: "system-ui, -apple-system, sans-serif",
				}}
			>
				<button
					type="button"
					onClick={() => setActiveModule("carousel")}
					style={{
						padding: "9px 18px",
						borderRadius: 999,
						border: "none",
						fontWeight: 600,
						fontSize: 14,
						cursor: "pointer",
						background:
							activeModule === "carousel" ? "#0f172a" : "#e2e8f0",
						color: activeModule === "carousel" ? "#ffffff" : "#334155",
					}}
				>
					🖼️ Live Carousel
				</button>
				<button
					type="button"
					onClick={() => setActiveModule("studio")}
					style={{
						padding: "9px 18px",
						borderRadius: 999,
						border: "none",
						fontWeight: 600,
						fontSize: 14,
						cursor: "pointer",
						background:
							activeModule === "studio" ? "#2563eb" : "#e2e8f0",
						color: activeModule === "studio" ? "#ffffff" : "#334155",
					}}
				>
					🎬 Video Presentation Studio
				</button>
			</div>

			{activeModule === "carousel" ? <DriveCarousel /> : <DriveVideoStudio />}
		</div>
	);
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
