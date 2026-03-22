const networkRetryCounters = new Map<string, number>();
let consecutiveTransientErrors = 0;

export function getNetworkRetryCount(key: string): number {
	return networkRetryCounters.get(key) ?? 0;
}

export function setNetworkRetryCount(key: string, count: number): void {
	networkRetryCounters.set(key, count);
}

export function deleteNetworkRetryCount(key: string): void {
	networkRetryCounters.delete(key);
}

export function clearNetworkRetryCounts(): void {
	networkRetryCounters.clear();
}

export function getConsecutiveTransientErrors(): number {
	return consecutiveTransientErrors;
}

export function setConsecutiveTransientErrors(count: number): void {
	consecutiveTransientErrors = count;
}

export function resetProviderRecoveryState(): void {
	consecutiveTransientErrors = 0;
	networkRetryCounters.clear();
}
