/** @type {import('tailwindcss').Config} */
export default {
	darkMode: ["class"],
	content: ["./src/index.html", "./src/**/*.{ts,tsx}"],
	theme: {
		container: {
			center: true,
			padding: "1.5rem",
			screens: { "2xl": "100%" },
		},
		extend: {
			colors: {
				background: "hsl(var(--bg))",
				"bg-card": "hsl(var(--bg-card))",
				"bg-elevated": "hsl(var(--bg-elevated))",
				border: "hsl(var(--border))",
				foreground: "hsl(var(--foreground))",
				muted: {
					DEFAULT: "hsl(var(--muted))",
					foreground: "hsl(var(--muted-fg))",
				},
				primary: {
					DEFAULT: "hsl(var(--primary))",
					foreground: "hsl(var(--primary-fg))",
					glow: "hsl(var(--primary-glow))",
				},
				success: "hsl(var(--success))",
				warning: "hsl(var(--warning))",
				danger: "hsl(var(--danger))",
				accent: {
					DEFAULT: "hsl(var(--accent))",
					foreground: "hsl(var(--accent-fg))",
				},
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
			},
			fontFamily: {
				sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
				mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
				heading: ['"JetBrains Mono"', "ui-monospace", "monospace"],
			},
			boxShadow: {
				glow: "0 0 20px -4px hsl(var(--primary-glow) / 0.5)",
				panel: "0 8px 30px -12px hsl(var(--bg) / 0.6)",
			},
		},
	},
	plugins: [],
};
