import type { OAuthProviderInterface } from "@gsd/pi-ai";
import { getOAuthProviders } from "@gsd/pi-ai/oauth";
import { Container, getEditorKeybindings, Spacer, TruncatedText } from "@gsd/pi-tui";
import type { AuthStorage } from "../../../core/auth-storage.js";
import { theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

/**
 * Component that renders a login/logout provider selector.
 */
export interface AuthSelectorProvider {
	id: string;
	name: string;
	authMode: "oauth" | "externalCli";
}

export class OAuthSelectorComponent extends Container {
	private listContainer: Container;
	private allProviders: AuthSelectorProvider[] = [];
	private selectedIndex: number = 0;
	private mode: "login" | "logout";
	private authStorage: AuthStorage;
	private onSelectCallback: (providerId: string) => void;
	private onCancelCallback: () => void;

	constructor(
		mode: "login" | "logout",
		authStorage: AuthStorage,
		onSelect: (providerId: string) => void,
		onCancel: () => void,
		providers?: AuthSelectorProvider[],
	) {
		super();

		this.mode = mode;
		this.authStorage = authStorage;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;

		// Load all OAuth providers
		this.loadProviders(providers);

		// Add top border
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));

		// Add title
		const title = mode === "login" ? "Select provider to login:" : "Select provider to logout:";
		this.addChild(new TruncatedText(theme.bold(title)));
		this.addChild(new Spacer(1));

		// Create list container
		this.listContainer = new Container();
		this.addChild(this.listContainer);

		this.addChild(new Spacer(1));

		// Add bottom border
		this.addChild(new DynamicBorder());

		// Initial render
		this.updateList();
	}

	private loadProviders(providers?: AuthSelectorProvider[]): void {
		if (providers) {
			this.allProviders = providers;
			return;
		}

		this.allProviders = getOAuthProviders().map((provider: OAuthProviderInterface) => ({
			id: provider.id,
			name: provider.name,
			authMode: "oauth",
		}));
	}

	private updateList(): void {
		this.listContainer.clear();

		for (let i = 0; i < this.allProviders.length; i++) {
			const provider = this.allProviders[i];
			if (!provider) continue;

			const isSelected = i === this.selectedIndex;

			// Check if user is configured for this provider
			const credentials = this.authStorage.get(provider.id);
			const isConfigured = provider.authMode === "oauth" ? credentials?.type === "oauth" : Boolean(credentials);
			const statusIndicator = isConfigured
				? theme.fg("success", provider.authMode === "oauth" ? " ✓ logged in" : " ✓ configured")
				: "";

			let line = "";
			if (isSelected) {
				const prefix = theme.fg("accent", "→ ");
				const text = theme.fg("accent", provider.name);
				line = prefix + text + statusIndicator;
			} else {
				const text = `  ${provider.name}`;
				line = text + statusIndicator;
			}

			this.listContainer.addChild(new TruncatedText(line, 0, 0));
		}

		// Show "no providers" if empty
		if (this.allProviders.length === 0) {
			const message =
				this.mode === "login" ? "No login providers available" : "No providers logged in. Use /login first.";
			this.listContainer.addChild(new TruncatedText(theme.fg("muted", `  ${message}`), 0, 0));
		}
	}

	handleInput(keyData: string): void {
		if (this.allProviders.length === 0) {
			if (getEditorKeybindings().matches(keyData, "selectCancel")) {
				this.onCancelCallback();
			}
			return;
		}

		const kb = getEditorKeybindings();
		// Up arrow (wrap)
		if (kb.matches(keyData, "selectUp")) {
			this.selectedIndex = this.selectedIndex === 0 ? this.allProviders.length - 1 : this.selectedIndex - 1;
			this.updateList();
		}
		// Down arrow (wrap)
		else if (kb.matches(keyData, "selectDown")) {
			this.selectedIndex = this.selectedIndex === this.allProviders.length - 1 ? 0 : this.selectedIndex + 1;
			this.updateList();
		}
		// Enter
		else if (kb.matches(keyData, "selectConfirm")) {
			const selectedProvider = this.allProviders[this.selectedIndex];
			if (selectedProvider) {
				this.onSelectCallback(selectedProvider.id);
			}
		}
		// Escape or Ctrl+C
		else if (kb.matches(keyData, "selectCancel")) {
			this.onCancelCallback();
		}
	}
}
