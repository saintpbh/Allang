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

        // Settings
        this.silenceThreshold = 10 * 60 * 1000; // 10 minutes
        this.minProactiveInterval = 5 * 60 * 1000; // 5 minutes between proactive messages
        this.dailyLimit = 10;
        this.proactiveCountToday = 0;

        this._wasAway = false;
    }

    resetUserTimer() {
        this.lastUserMessageTime = Date.now();
        this.proactiveCountToday = 0; // Simplified daily reset (on load)
    }

    update(time) {
        const now = Date.now();

        // Check 1: User Return (Event-driven)
        if (this.visionMgr && this.visionMgr.isPresent && this._wasAway) {
            this._wasAway = false;
            this.trigger('User returned after being away');
        } else if (this.visionMgr && !this.visionMgr.isPresent) {
            this._wasAway = true;
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

        if (timeSinceLastUser > this.silenceThreshold &&
            timeSinceLastProactive > this.minProactiveInterval &&
            this.visionMgr.isPresent) {
            this.trigger('Long silence / Check-in');
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
