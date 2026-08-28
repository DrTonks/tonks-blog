const CLIENT_ID_KEY = "sleepy-blog-client-id";

export function getBlogClientId(): string {
	let clientId = localStorage.getItem(CLIENT_ID_KEY);
	if (!clientId) {
		clientId =
			typeof crypto.randomUUID === "function"
				? crypto.randomUUID()
				: `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		localStorage.setItem(CLIENT_ID_KEY, clientId);
	}
	return clientId;
}
