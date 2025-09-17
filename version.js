// App version configuration
// Update this file when deploying new versions to GitHub

export const APP_VERSION = '1.0.1';
export const BUILD_DATE = '2025-01-17';
export const BUILD_INFO = {
    version: APP_VERSION,
    buildDate: BUILD_DATE,
    features: [
        'Smart caching strategy',
        'Haptic feedback',
        'Cross-device sync',
        'Version tracking'
    ]
};

// Helper to get version string
export function getVersionString() {
    return `v${APP_VERSION}`;
}

// Helper to get full build info
export function getBuildInfo() {
    return `${getVersionString()} (${BUILD_DATE})`;
}
