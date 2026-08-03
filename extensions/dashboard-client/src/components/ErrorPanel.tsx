/**
 * dashboard-client/src/components/ErrorPanel.tsx — shared error display.
 *
 * Renders a dashboard error card. When the error is an `ApiError`, surfaces
 * the HTTP status code alongside the message so a 500 vs 404 vs network
 * failure is immediately visible (e.g. "dashboard API 500: snapshot failed").
 */

import { ApiError } from "../api/client";

export interface ErrorPanelProps {
	/** Card heading, e.g. "Failed to load providers". */
	title: string;
	/** The error to render. */
	error: Error;
}

export function ErrorPanel({ title, error }: ErrorPanelProps): React.ReactElement {
	const status = error instanceof ApiError ? error.status : null;
	return (
		<div className="error-fallback">
			<h2>{title}</h2>
			<p>
				{status !== null && (
					<span className="badge warn" style={{ marginRight: "0.5rem" }}>
						{status}
					</span>
				)}
				{error.message}
			</p>
		</div>
	);
}
