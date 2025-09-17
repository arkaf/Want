// Haptic feedback utility for mobile devices
// Supports modern Haptic Feedback API and fallback vibration

/**
 * Haptic feedback types
 */
export const HapticType = {
    LIGHT: 'light',           // Light tap - for buttons, toggles
    MEDIUM: 'medium',         // Medium tap - for confirmations
    HEAVY: 'heavy',          // Heavy tap - for important actions
    SUCCESS: 'success',       // Success feedback - for completed actions
    WARNING: 'warning',       // Warning feedback - for warnings
    ERROR: 'error',          // Error feedback - for errors
    SELECTION: 'selection'    // Selection feedback - for picker changes
};

/**
 * Check if haptic feedback is supported
 */
export function isHapticSupported() {
    return 'vibrate' in navigator || 
           ('hapticFeedback' in navigator) ||
           (window.DeviceMotionEvent && window.DeviceMotionEvent.requestPermission);
}

/**
 * Check if modern Haptic Feedback API is supported (iOS Safari 16.4+)
 */
function isModernHapticSupported() {
    return 'vibrate' in navigator && 
           typeof navigator.vibrate === 'function' &&
           /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/**
 * Trigger haptic feedback
 * @param {string} type - Type of haptic feedback (use HapticType constants)
 * @param {Object} options - Additional options
 */
export function triggerHaptic(type = HapticType.LIGHT, options = {}) {
    if (!isHapticSupported()) {
        console.log('Haptic feedback not supported');
        return;
    }

    try {
        // Modern Haptic Feedback API (iOS Safari 16.4+)
        if (window.navigator.vibrate) {
            const patterns = getVibrationPattern(type);
            if (patterns.length > 0) {
                navigator.vibrate(patterns);
                console.log(`Haptic feedback triggered: ${type}`);
                return;
            }
        }

        // Fallback for older devices
        if (navigator.vibrate) {
            const pattern = getVibrationPattern(type);
            navigator.vibrate(pattern);
            console.log(`Vibration feedback triggered: ${type}`);
        }

    } catch (error) {
        console.warn('Haptic feedback failed:', error);
    }
}

/**
 * Get vibration patterns for different haptic types
 * @param {string} type - Haptic type
 * @returns {number|number[]} Vibration pattern
 */
function getVibrationPattern(type) {
    const patterns = {
        [HapticType.LIGHT]: [10],                    // Very light tap
        [HapticType.MEDIUM]: [25],                   // Medium tap
        [HapticType.HEAVY]: [50],                    // Strong tap
        [HapticType.SUCCESS]: [25, 50, 25],          // Success pattern
        [HapticType.WARNING]: [50, 100, 50],         // Warning pattern
        [HapticType.ERROR]: [100, 50, 100, 50, 100], // Error pattern
        [HapticType.SELECTION]: [15]                 // Light selection
    };

    return patterns[type] || patterns[HapticType.LIGHT];
}

/**
 * Trigger haptic feedback for button interactions
 */
export function hapticButton() {
    triggerHaptic(HapticType.LIGHT);
}

/**
 * Trigger haptic feedback for successful actions
 */
export function hapticSuccess() {
    triggerHaptic(HapticType.SUCCESS);
}

/**
 * Trigger haptic feedback for errors
 */
export function hapticError() {
    triggerHaptic(HapticType.ERROR);
}

/**
 * Trigger haptic feedback for warnings
 */
export function hapticWarning() {
    triggerHaptic(HapticType.WARNING);
}

/**
 * Trigger haptic feedback for selections/toggles
 */
export function hapticSelection() {
    triggerHaptic(HapticType.SELECTION);
}

/**
 * Trigger haptic feedback for important actions
 */
export function hapticImportant() {
    triggerHaptic(HapticType.HEAVY);
}
