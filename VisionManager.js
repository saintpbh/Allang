// ─── Vision Manager (Face Tracking & Presence) ───
// Uses basic camera stream + can be extended with a face-tracking library.
// For now, we'll implement the camera logic and presence detection.

export class VisionManager {
    constructor(allang) {
        this.allang = allang;
        this.stream = null;
        this.video = document.createElement('video');
        this.video.width = 160;
        this.video.height = 120;
        this.isActive = false;

        this.facePos = { x: 0.5, y: 0.5 }; // Normalized 0-1
        this.isPresent = false;
        this.lastDetectedTime = 0;
        this._awayTriggered = false;
    }

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 160, height: 120 }
            });
            this.video.srcObject = this.stream;
            this.video.play();
            this.isActive = true;
            this._initFaceTracking();
        } catch (err) {
            console.error('Camera access failed:', err);
            this.isActive = false;
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        this.isActive = false;
    }

    _initFaceTracking() {
        // Here we would ideally use a library like FaceMesh.
        // For the sake of this implementation, we simulate detection 
        // until a specific tracking library is chosen or if we use a basic pixel-diff.

        // Note: Real face tracking code would go here.
        // We will mock the eye following logic for now by hooking into the update loop.
    }

    update(time) {
        if (!this.isActive) return;

        // Simulate face movement or check actual detector results
        // If face is found:
        // this.allang.lookAtFace(this.facePos.x, this.facePos.y);

        const now = Date.now();
        const faceDetected = true; // Placeholder for real detection logic

        if (faceDetected) {
            this.isPresent = true;
            this.lastDetectedTime = now;
            this._awayTriggered = false;

            // Slow sway the "detection" point for demo/idle
            const trackX = 0.5 + Math.sin(time * 0.5) * 0.2;
            const trackY = 0.4 + Math.cos(time * 0.3) * 0.1;
            this.allang.setEyeTarget(trackX, trackY);
        } else {
            // Presence timeout
            if (now - this.lastDetectedTime > 5000 && !this._awayTriggered) {
                this.isPresent = false;
                this._awayTriggered = true;
                this.allang.triggerAwayBehavior();
            }
        }
    }
}
