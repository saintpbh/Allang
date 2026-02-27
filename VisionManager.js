// ─── Vision Manager (MediaPipe Face Tracking & Presence) ───
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export class VisionManager {
    constructor(allang) {
        this.allang = allang;
        this.stream = null;
        this.video = document.createElement('video');
        this.video.style.display = 'none'; // Keep hidden
        document.body.appendChild(this.video);

        this.isActive = false;
        this.faceLandmarker = null;
        this.facePos = { x: 0.5, y: 0.5 }; // Normalized 0-1
        this.isPresent = false;
        this.lastDetectedTime = 0;
        this._awayTriggered = false;
        this.lastVideoTime = -1;
    }

    async start() {
        try {
            // 1. Initialize MediaPipe
            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
            );
            this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                    delegate: "GPU"
                },
                outputFaceBlendshapes: true,
                runningMode: "VIDEO",
                numFaces: 1
            });

            // 2. Start Camera
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 }
            });
            this.video.srcObject = this.stream;
            this.video.play();
            this.isActive = true;
            this.isPresent = false;
            this.lastDetectedTime = Date.now();
        } catch (err) {
            console.error('Camera or MediaPipe initialization failed:', err);
            this.isActive = false;
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
        this.isActive = false;
    }

    update(time) {
        if (!this.isActive || !this.faceLandmarker) return;

        const now = Date.now();

        // Only run detection if there's a new video frame
        if (this.video.currentTime !== this.lastVideoTime && this.video.readyState >= 2) {
            this.lastVideoTime = this.video.currentTime;

            const results = this.faceLandmarker.detectForVideo(this.video, now);

            if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
                const landmarks = results.faceLandmarks[0];
                this.isPresent = true;
                this.lastDetectedTime = now;
                this._awayTriggered = false;

                // Index 4 is nose tip in Face Landmarker (or 1 in some models, but 4 is usually better)
                // Let's use landmark 4 (mid nose tip)
                const nose = landmarks[4];
                this.facePos.x = 1.0 - nose.x;
                this.facePos.y = nose.y;

                this.allang.setEyeTarget(this.facePos.x, this.facePos.y);

                // Check blendshapes for smiles
                if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
                    const shapes = results.faceBlendshapes[0].categories;
                    const mouthSmileLeft = shapes.find(s => s.categoryName === "mouthSmileLeft")?.score || 0;
                    const mouthSmileRight = shapes.find(s => s.categoryName === "mouthSmileRight")?.score || 0;

                    if (mouthSmileLeft > 0.4 || mouthSmileRight > 0.4) {
                        if (this.allang.currentExpression !== 'happy') {
                            this.allang.drawFace('happy');
                        }
                    } else if (this.allang.currentExpression === 'happy' && !this.allang._isPetting) {
                        // Return to default if smile stops
                        this.allang.drawFace('default');
                    }
                }
            } else {
                // Presence timeout logic
                if (now - this.lastDetectedTime > 8000 && !this._awayTriggered) {
                    this.isPresent = false;
                    this._awayTriggered = true;
                    this.allang.triggerAwayBehavior();
                }
            }
        }
    }
}
