const COMMUNITY_IDENTITY_KEY = "tonks_community_identity";
const COMMUNITY_PROFILE_KEY = "tonks_community_profile";
const LEGACY_PROFILE_KEYS = ["sleepy-blog-comment-profile"] as const;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

export type CommunityProfile = {
	nickname: string;
	email: string;
	website: string;
};

function sharedCookieAttributes(maxAge = 31536000): string[] {
	const hostname = window.location.hostname.toLowerCase();
	const sharedDomain =
		hostname === "tonks.top" || hostname.endsWith(".tonks.top");
	return [
		"Path=/",
		`Max-Age=${maxAge}`,
		"SameSite=Lax",
		...(sharedDomain ? ["Domain=.tonks.top", "Secure"] : []),
	];
}

function readNamedCookie(name: string): string {
	const prefix = `${name}=`;
	const entry = document.cookie
		.split("; ")
		.find((item) => item.startsWith(prefix));
	if (!entry) return "";
	try {
		return decodeURIComponent(entry.slice(prefix.length));
	} catch {
		return "";
	}
}

function readCookie(): string {
	const value = readNamedCookie(COMMUNITY_IDENTITY_KEY);
	return TOKEN_RE.test(value) ? value : "";
}

function writeCookie(token: string): void {
	// biome-ignore lint/suspicious/noDocumentCookie: this opaque token intentionally spans tonks.top subdomains.
	document.cookie = `${COMMUNITY_IDENTITY_KEY}=${encodeURIComponent(token)}; ${sharedCookieAttributes().join("; ")}`;
}

function normalizeProfile(value: unknown): CommunityProfile | null {
	if (!value || typeof value !== "object") return null;
	const source = value as Record<string, unknown>;
	const profile = {
		nickname:
			typeof source.nickname === "string"
				? source.nickname.trim().slice(0, 30)
				: "",
		email:
			typeof source.email === "string"
				? source.email.trim().toLowerCase().slice(0, 254)
				: "",
		website:
			typeof source.website === "string"
				? source.website.trim().slice(0, 300)
				: "",
	};
	return profile.nickname || profile.email || profile.website ? profile : null;
}

function parseProfile(raw: string): CommunityProfile | null {
	if (!raw) return null;
	try {
		return normalizeProfile(JSON.parse(raw));
	} catch {
		return null;
	}
}

function writeProfileCookie(profile: CommunityProfile | null): void {
	const value = profile ? JSON.stringify(profile) : "";
	// biome-ignore lint/suspicious/noDocumentCookie: this remembered visitor profile intentionally spans the two first-party tonks.top sites.
	document.cookie = `${COMMUNITY_PROFILE_KEY}=${encodeURIComponent(value)}; ${sharedCookieAttributes(profile ? 31536000 : 0).join("; ")}`;
}

function generateToken(): string {
	if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

export function getCommunityIdentityToken(): string {
	const cookieToken = readCookie();
	let localToken = "";
	try {
		const candidate = localStorage.getItem(COMMUNITY_IDENTITY_KEY) || "";
		if (TOKEN_RE.test(candidate)) localToken = candidate;
	} catch {
		/* Cookie remains available when local storage is restricted. */
	}

	const token = cookieToken || localToken || generateToken();
	try {
		localStorage.setItem(COMMUNITY_IDENTITY_KEY, token);
	} catch {
		/* The shared cookie is the primary cross-site store. */
	}
	if (cookieToken !== token) writeCookie(token);
	return token;
}

export function getCommunityProfile(): CommunityProfile {
	const cookieProfile = parseProfile(readNamedCookie(COMMUNITY_PROFILE_KEY));
	if (cookieProfile) {
		try {
			localStorage.setItem(
				COMMUNITY_PROFILE_KEY,
				JSON.stringify(cookieProfile),
			);
		} catch {
			/* The shared cookie remains the primary cross-site store. */
		}
		return cookieProfile;
	}

	let profile: CommunityProfile | null = null;
	try {
		profile = parseProfile(localStorage.getItem(COMMUNITY_PROFILE_KEY) || "");
		if (!profile) {
			for (const key of LEGACY_PROFILE_KEYS) {
				profile = parseProfile(localStorage.getItem(key) || "");
				if (profile) break;
			}
		}
	} catch {
		/* Return an empty profile when storage is unavailable. */
	}

	if (profile) saveCommunityProfile(profile);
	return profile || { nickname: "", email: "", website: "" };
}

export function saveCommunityProfile(value: CommunityProfile): void {
	const profile = normalizeProfile(value);
	if (!profile) {
		clearCommunityProfile();
		return;
	}
	try {
		localStorage.setItem(COMMUNITY_PROFILE_KEY, JSON.stringify(profile));
	} catch {
		/* The shared cookie remains available when local storage is restricted. */
	}
	writeProfileCookie(profile);
}

export function clearCommunityProfile(): void {
	try {
		localStorage.removeItem(COMMUNITY_PROFILE_KEY);
		for (const key of LEGACY_PROFILE_KEYS) localStorage.removeItem(key);
	} catch {
		/* Ignore storage cleanup failures. */
	}
	writeProfileCookie(null);
}
