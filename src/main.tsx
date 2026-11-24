import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DriveCarousel } from "./DriveCarousel";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<DriveCarousel />
	</StrictMode>
);
