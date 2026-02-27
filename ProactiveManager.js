/**
 * ProactiveManager: Handles AI-initiated conversation triggers.
 * Monitors context (vision, location, time) and emits events when it's time to speak.
 */
export class ProactiveManager extends EventTarget {
    constructor(allang, locationMgr, visionMgr, memory) {
        super();
        this.allang = allang;
        this.locationMgr = locationMgr;
        this.visionMgr = visionMgr;
        this.memory = memory;

        this.lastUserMessageTime = Date.now();
        this.lastProactiveTime = 0;
        this.lastWeatherCode = null;
        this.lastInteractionTime = Date.now(); // Mouse/Key activity
        this.isFallbackMode = false; // True if camera is inactive

        // Settings
        this.silenceThreshold = 10 * 60 * 1000; // 10 minutes
        this.fallbackSilenceThreshold = 3 * 60 * 1000; // 3 minutes when camera is off
        this.awayThreshold = 5 * 60 * 1000; // 5 minutes of no input = 'Away' in fallback mode
        this.minProactiveInterval = 5 * 60 * 1000; // 5 minutes between proactive messages
        this.dailyLimit = 10;
        this.proactiveCountToday = 0;

        this._wasAway = false;
    }

    resetUserTimer() {
        this.lastUserMessageTime = Date.now();
        this.lastInteractionTime = Date.now();
        this.proactiveCountToday = 0; // Simplified daily reset (on load)
    }

    registerInteraction() {
        const now = Date.now();
        const wasAwayFallback = this.isFallbackMode && (now - this.lastInteractionTime > this.awayThreshold);

        this.lastInteractionTime = now;

        if (wasAwayFallback) {
            console.log('User returned (Input Fallback)');
            this.trigger('사용자의 복귀 (입력 감지)');
        }
    }

    update(time) {
        const now = Date.now();

        // Check 1: User Return (Event-driven)
        const isVisionActive = this.visionMgr && this.visionMgr.isActive;
        this.isFallbackMode = !isVisionActive;

        if (isVisionActive) {
            if (this.visionMgr.isPresent && this._wasAway) {
                this._wasAway = false;
                this.trigger('사용자의 복과');
            } else if (!this.visionMgr.isPresent) {
                this._wasAway = true;
            }
        } else {
            // Fallback: Away detection based on lack of interaction
            if (now - this.lastInteractionTime > this.awayThreshold) {
                this._wasAway = true;
            } else {
                // Return is handled in registerInteraction()
            }
        }

        // Check 2: Weather Change (Event-driven)
        if (this.locationMgr && this.locationMgr.weather) {
            if (this.lastWeatherCode !== null && this.lastWeatherCode !== this.locationMgr.weather.code) {
                this.trigger('Weather has changed');
            }
            this.lastWeatherCode = this.locationMgr.weather.code;
        }

        // Check 3: Silence (Time-driven)
        const timeSinceLastUser = now - this.lastUserMessageTime;
        const timeSinceLastProactive = now - this.lastProactiveTime;
        const activeThreshold = this.isFallbackMode ? this.fallbackSilenceThreshold : this.silenceThreshold;
        const isPresent = isVisionActive ? this.visionMgr.isPresent : (now - this.lastInteractionTime < this.awayThreshold);

        if (timeSinceLastUser > activeThreshold &&
            timeSinceLastProactive > this.minProactiveInterval &&
            isPresent) {
            this.trigger('오랜 침묵 / 안부 묻기');
        }
    }

    trigger(reason) {
        if (this.proactiveCountToday >= this.dailyLimit) return;

        const now = Date.now();
        if (now - this.lastProactiveTime < this.minProactiveInterval) return;

        this.lastProactiveTime = now;
        this.proactiveCountToday++;

        console.log(`[ProactiveTrigger] Reason: ${reason}`);
        this.dispatchEvent(new CustomEvent('proactive-trigger', { detail: { reason } }));
    }
}
