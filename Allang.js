import * as THREE from 'three';
import gsap from 'gsap';

export class Allang {
    constructor(scene) {
        this.scene = scene;
        this.baseColor = new THREE.Color('#F5A623');
        this.group = new THREE.Group();
        this.scene.add(this.group);

        // Idle behavior state
        this._lastInteraction = 0;
        this._nextIdleTime = 5 + Math.random() * 8;
        this._isDoingIdleBehavior = false;

        // Shake detection state
        this._shakeIntensity = 0;
        this._shakeDecay = 0.92;

        // Face & Vision state
        this._eyeOffset = { x: 0, y: 0 };
        this._eyeTarget = { x: 0.5, y: 0.5 };
        this._isAway = false;
        this._awayStartTime = 0;

        this.initCore();       // Layer 1: Inner Core
        this.initBody();       // Layer 2: Jelly Body
        this.initGlow();       // Layer 3: Outer Glow Aura
        this.initParticles();  // Layer 4: Floating Particles
        this.initFace();       // Dynamic Face Texture
        this.initShakeDetection(); // Shake → Wobble
    }

    // ─── Layer 1: Inner Core ───
    initCore() {
        const geo = new THREE.SphereGeometry(0.35, 32, 32);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xFFF3B0,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.core = new THREE.Mesh(geo, mat);
        this.group.add(this.core);
    }

    // ─── Layer 2: Jelly Body (Main Character) ───
    initBody() {
        const geo = new THREE.SphereGeometry(1, 128, 128);
        this.bodyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color('#F5A623') },
                uColor2: { value: new THREE.Color('#FFD700') },
                uWobble: { value: 0.08 },
                uGlow: { value: 0.4 },
                uBreath: { value: 0.0 },
                uPetStrength: { value: 0.0 },
                uRecall: { value: 0.0 }
            },
            vertexShader: /* glsl */ `
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vWorldPos;
                varying vec3 vViewDir;
                uniform float uTime;
                uniform float uWobble;
                uniform float uBreath;
                uniform vec3 uPetPoint;
                uniform float uPetStrength;

                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);

                    // Organic multi-frequency wobble
                    float wobble1 = sin(position.x * 3.0 + uTime * 1.5) * 
                                   sin(position.y * 4.0 + uTime * 1.8) * 0.6;
                    float wobble2 = sin(position.z * 5.0 + uTime * 2.2) * 
                                   cos(position.x * 2.0 + uTime * 1.2) * 0.4;
                    float displacement = (wobble1 + wobble2) * uWobble;

                    // Breathing pulse
                    float breath = sin(uTime * 0.8) * uBreath;

                    vec3 newPos = position * (1.0 + breath) + normal * displacement;

                    // Petting deformation: vertices near pet point bulge outward
                    float petDist = distance(position, uPetPoint);
                    float petInfluence = smoothstep(0.8, 0.0, petDist) * uPetStrength;
                    newPos += normal * petInfluence * 0.3;

                    vWorldPos = (modelMatrix * vec4(newPos, 1.0)).xyz;
                    vViewDir = normalize(cameraPosition - vWorldPos);

                    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vWorldPos;
                varying vec3 vViewDir;
                uniform vec3 uColor;
                uniform vec3 uColor2;
                uniform float uGlow;
                uniform float uRecall;

                // Hash for particles
                float hash(vec3 p) {
                    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
                }

                void main() {
                    vec3 baseNormal = normalize(vNormal);
                    float fresnel = pow(1.0 - dot(baseNormal, vViewDir), 2.5);
                    
                    // Base gradient
                    vec3 color = mix(uColor, uColor2, vUv.y);

                    // Recall effect: shift towards cyan/purple hue
                    vec3 recallColor = vec3(0.2, 0.8, 0.9); // Cyan
                    color = mix(color, recallColor, uRecall * 0.7);
                    
                    // Interior depth glow
                    float internalGlow = pow(1.0 - dot(baseNormal, vec3(0,0,1)), 3.0) * 0.4;

                    // Subsurface scattering simulation
                    float sss = pow(max(dot(vNormal, vec3(0.0, 1.0, 0.5)), 0.0), 2.0) * 0.3;

                    // Iridescence: subtle hue shift at edges
                    float iriAngle = dot(vViewDir, vNormal);
                    vec3 iriColor = vec3(
                        0.5 + 0.5 * cos(iriAngle * 6.28 + 0.0),
                        0.5 + 0.5 * cos(iriAngle * 6.28 + 2.09),
                        0.5 + 0.5 * cos(iriAngle * 6.28 + 4.18)
                    );

                    // Internal sparkle particles
                    float sparkle = 0.0;
                    vec3 pCoord = vWorldPos * 6.0 + vec3(uTime * 0.3);
                    vec3 cell = floor(pCoord);
                    vec3 frac_p = fract(pCoord);
                    float h = hash(cell);
                    if (h > 0.96) {
                        float dist = length(frac_p - 0.5);
                        float twinkle = sin(uTime * 3.0 + h * 100.0) * 0.5 + 0.5;
                        sparkle = smoothstep(0.3, 0.0, dist) * twinkle;
                    }

                    // Compose final color
                    vec3 finalCol = color + sss * color;
                    finalCol += internalGlow * color;
                    finalCol += iriColor * fresnel * 0.15;           // iridescence
                    finalCol += sparkle * vec3(1.0, 0.98, 0.9) * 1.5; // sparkles
                    finalCol = mix(finalCol, vec3(1.0, 0.95, 0.8), fresnel * uGlow); // Rim glow

                    // Opacity: more translucent at edges
                    float alpha = mix(0.92, 0.5, fresnel * 0.6);

                    gl_FragColor = vec4(finalCol, alpha);
                }
            `,
            transparent: true,
            side: THREE.FrontSide,
            depthWrite: false
        });

        this.body = new THREE.Mesh(geo, this.bodyMaterial);
        this.group.add(this.body);
    }

    // ─── Layer 3: Outer Glow Aura ───
    initGlow() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        gradient.addColorStop(0, 'rgba(255, 220, 100, 0.35)');
        gradient.addColorStop(0.4, 'rgba(255, 180, 60, 0.15)');
        gradient.addColorStop(1, 'rgba(255, 150, 30, 0.0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.7
        });
        this.glowSprite = new THREE.Sprite(mat);
        this.glowSprite.scale.set(4, 4, 1);
        this.group.add(this.glowSprite);
    }

    // ─── Layer 4: Floating Particles ───
    initParticles() {
        const count = 60;
        const positions = new Float32Array(count * 3);
        const speeds = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 0.3 + Math.random() * 0.5;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
            speeds[i] = 0.3 + Math.random() * 0.7;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this._particleSpeeds = speeds;
        this._particleBasePositions = new Float32Array(positions);

        const mat = new THREE.PointsMaterial({
            color: 0xFFFACD,
            size: 0.04,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.particles = new THREE.Points(geo, mat);
        this.group.add(this.particles);
    }

    // ─── Dynamic Face (Canvas2D Texture) ───
    initFace() {
        this.faceCanvas = document.createElement('canvas');
        this.faceCanvas.width = 256;
        this.faceCanvas.height = 256;
        this.faceCtx = this.faceCanvas.getContext('2d');
        this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
        this.faceTexture.minFilter = THREE.LinearFilter;

        const faceMat = new THREE.MeshBasicMaterial({
            map: this.faceTexture,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const faceGeo = new THREE.PlaneGeometry(0.8, 0.8);
        this.faceMesh = new THREE.Mesh(faceGeo, faceMat);
        this.faceMesh.position.set(0, 0.05, 0.95);
        this.group.add(this.faceMesh);

        this.currentExpression = 'default';
        this._eyeOffset = new THREE.Vector2(0, 0);
        this._eyeTarget = new THREE.Vector2(0, 0);
        this._isAway = false;
        this._awayStartTime = 0;
        this.drawFace('default');
    }

    drawFace(expression) {
        if (expression) this.currentExpression = expression;

        const ctx = this.faceCtx;
        const w = 256, h = 256;
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = '#1a1a1a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Eye positions with dynamic offset
        // Normal pupil range is roughly +/- 15px
        const ox = this._eyeOffset.x * 30;
        const oy = this._eyeOffset.y * 20;

        switch (this.currentExpression) {
            case 'happy': // ∧∧ eye smile
                ctx.font = 'bold 50px Outfit, sans-serif';
                ctx.fillText('∧', w * 0.35 + ox, h * 0.42 + oy);
                ctx.fillText('∧', w * 0.65 + ox, h * 0.42 + oy);
                // Blush cheeks
                ctx.fillStyle = 'rgba(255, 100, 100, 0.3)';
                ctx.beginPath(); ctx.arc(w * 0.22, h * 0.55, 18, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(w * 0.78, h * 0.55, 18, 0, Math.PI * 2); ctx.fill();
                break;
            case 'sad': // _ _ closed eyes
                ctx.font = 'bold 60px Outfit, sans-serif';
                ctx.fillText('_', w * 0.35 + ox, h * 0.45 + oy);
                ctx.fillText('_', w * 0.65 + ox, h * 0.45 + oy);
                ctx.font = '30px Outfit, sans-serif';
                ctx.fillText('︵', w * 0.5, h * 0.65);
                break;
            case 'angry': // > <
                ctx.font = 'bold 45px Outfit, sans-serif';
                ctx.fillText('>', w * 0.35 + ox, h * 0.45 + oy);
                ctx.fillText('<', w * 0.65 + ox, h * 0.45 + oy);
                ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.moveTo(w * 0.22, h * 0.28); ctx.lineTo(w * 0.4, h * 0.33); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(w * 0.78, h * 0.28); ctx.lineTo(w * 0.6, h * 0.33); ctx.stroke();
                break;
            case 'surprise': // O O
                ctx.font = 'bold 55px Outfit, sans-serif';
                ctx.fillText('O', w * 0.35 + ox, h * 0.42 + oy);
                ctx.fillText('O', w * 0.65 + ox, h * 0.42 + oy);
                ctx.font = '35px Outfit, sans-serif';
                ctx.fillText('o', w * 0.5, h * 0.66);
                break;
            case 'curious': // ? +
                ctx.font = 'bold 45px Outfit, sans-serif';
                ctx.fillText('?', w * 0.35 + ox, h * 0.42 + oy);
                ctx.fillText('+', w * 0.65 + ox, h * 0.42 + oy);
                break;
            case 'tired': // ~ ~
                ctx.font = 'bold 55px Outfit, sans-serif';
                ctx.fillText('~', w * 0.35 + ox, h * 0.45 + oy);
                ctx.fillText('~', w * 0.65 + ox, h * 0.45 + oy);
                break;
            case 'waiting': // puppy waiting (◕_◕)
                ctx.font = 'bold 55px Outfit, sans-serif';
                ctx.fillText('●', w * 0.35 + ox, h * 0.42 + oy);
                ctx.fillText('●', w * 0.65 + ox, h * 0.42 + oy);
                ctx.font = '30px Outfit, sans-serif';
                ctx.fillText('_', w * 0.5, h * 0.5);
                break;
            case 'default':
            default: // + +
                ctx.font = 'bold 50px Outfit, sans-serif';
                ctx.fillText('+', w * 0.35 + ox, h * 0.42 + oy);
                ctx.fillText('+', w * 0.65 + ox, h * 0.42 + oy);
                break;
        }

        this.faceTexture.needsUpdate = true;
    }

    // ─── Vision Hooks ───
    setEyeTarget(x, y) {
        this._eyeTarget.x = x;
        this._eyeTarget.y = y;
        this._isAway = false;
    }

    triggerAwayBehavior() {
        if (this._isAway) return;
        this._isAway = true;
        this._awayStartTime = this.bodyMaterial.uniforms.uTime.value;

        // Initial transition: puppy waiting
        this.drawFace('waiting');
        gsap.to(this.body.scale, { x: 0.95, y: 1.05, z: 0.95, duration: 1.2, ease: "power1.inOut" });
        gsap.to(this.group.rotation, { x: -0.1, duration: 1.5 }); // looking up/forward
    }

    triggerRecallEffect(duration = 2.0) {
        const tl = gsap.timeline();

        // Flash glow and shift color
        tl.to(this.bodyMaterial.uniforms.uRecall, { value: 1.0, duration: 0.4, ease: "power2.out" });
        tl.to(this.bodyMaterial.uniforms.uGlow, { value: 0.8, duration: 0.4 }, 0);

        // Particles intensify
        tl.to(this.particles.material, { size: 0.08, opacity: 1.0, duration: 0.4 }, 0);

        // Revert
        tl.to(this.bodyMaterial.uniforms.uRecall, { value: 0.0, duration: 1.5, ease: "power1.inOut" }, duration);
        tl.to(this.bodyMaterial.uniforms.uGlow, { value: 0.4, duration: 1.2 }, duration);
        tl.to(this.particles.material, { size: 0.04, opacity: 0.8, duration: 1.5 }, duration);
    }

    // ─── Petting System (Multi-Phase Reactions) ───
    startPet() {
        this._isPetting = true;
        this._petDuration = 0;
        this._petPhase = 'pleased';
        this._petPhaseChanged = true;
        this._origColor = this.bodyMaterial.uniforms.uColor.value.clone();
        this.drawFace('happy');
        gsap.to(this.bodyMaterial.uniforms.uGlow, { value: 0.5, duration: 0.5 });
    }

    updatePet(localPoint) {
        if (!this._isPetting) return;
        this.bodyMaterial.uniforms.uPetPoint.value.copy(localPoint);

        // Pet strength ramp
        const target = Math.min(0.5 + this._petDuration * 0.08, 1.0);
        this.bodyMaterial.uniforms.uPetStrength.value +=
            (target - this.bodyMaterial.uniforms.uPetStrength.value) * 0.1;
        this._petDuration += 0.016;

        // ── Phase transitions based on duration ──
        let newPhase = this._petPhase;
        if (this._petDuration < 2.0) newPhase = 'pleased';
        else if (this._petDuration < 5.0) newPhase = 'joyful';
        else if (this._petDuration < 8.0) newPhase = 'ticklish';
        else if (this._petDuration < 12.0) newPhase = 'annoyed';
        else newPhase = 'fedUp';

        if (newPhase !== this._petPhase) {
            this._petPhase = newPhase;
            this._petPhaseChanged = true;
        }

        // ── Apply phase-specific reactions ──
        switch (this._petPhase) {
            case 'pleased': {
                // Gentle happiness: warm glow brightens
                if (this._petPhaseChanged) {
                    this.drawFace('happy');
                    gsap.to(this.bodyMaterial.uniforms.uGlow, { value: 0.55, duration: 0.8 });
                    this._petPhaseChanged = false;
                }
                break;
            }
            case 'joyful': {
                // Color shifts to bright gold, stronger glow, subtle wiggle
                if (this._petPhaseChanged) {
                    this.drawFace('happy');
                    gsap.to(this.bodyMaterial.uniforms.uColor.value,
                        { r: 1.0, g: 0.84, b: 0.0, duration: 1.0 });
                    gsap.to(this.bodyMaterial.uniforms.uColor2.value,
                        { r: 1.0, g: 0.55, b: 0.0, duration: 1.0 });
                    gsap.to(this.bodyMaterial.uniforms.uGlow, { value: 0.7, duration: 0.6 });
                    this._petPhaseChanged = false;
                }
                // Continuous gentle sway (joyful wiggle)
                this.group.rotation.z = Math.sin(this._petDuration * 6) * 0.04;
                break;
            }
            case 'ticklish': {
                // Pink color flicker, body trembles, surprise eyes
                if (this._petPhaseChanged) {
                    this.drawFace('surprise');
                    gsap.to(this.bodyMaterial.uniforms.uGlow, { value: 0.8, duration: 0.3 });
                    this._petPhaseChanged = false;
                }
                // Flickering pink tint
                const pinkAmount = Math.sin(this._petDuration * 12) * 0.5 + 0.5;
                this.bodyMaterial.uniforms.uColor.value.setRGB(
                    0.96 + pinkAmount * 0.04,
                    0.65 - pinkAmount * 0.15,
                    0.1 + pinkAmount * 0.35
                );
                // Quick tremble
                this.group.position.x = (Math.random() - 0.5) * 0.02;
                this.bodyMaterial.uniforms.uWobble.value = 0.12 + Math.sin(this._petDuration * 15) * 0.05;
                break;
            }
            case 'annoyed': {
                // Red tint, angry face, stops wobbling
                if (this._petPhaseChanged) {
                    this.drawFace('angry');
                    gsap.to(this.bodyMaterial.uniforms.uColor.value,
                        { r: 0.9, g: 0.35, b: 0.15, duration: 0.6 });
                    gsap.to(this.bodyMaterial.uniforms.uGlow, { value: 0.5, duration: 0.5 });
                    gsap.to(this.bodyMaterial.uniforms.uWobble, { value: 0.03, duration: 0.5 });
                    this._petPhaseChanged = false;
                }
                // Stiff body, subtle reject flinch
                this.group.rotation.z = Math.sin(this._petDuration * 2) * 0.02;
                break;
            }
            case 'fedUp': {
                // Shrinks away, tired face, dark color
                if (this._petPhaseChanged) {
                    this.drawFace('tired');
                    gsap.to(this.body.scale, { x: 0.88, y: 0.88, z: 0.88, duration: 1, ease: 'power2.out' });
                    gsap.to(this.bodyMaterial.uniforms.uColor.value,
                        { r: 0.55, g: 0.55, b: 0.58, duration: 1 });
                    gsap.to(this.bodyMaterial.uniforms.uGlow, { value: 0.2, duration: 1 });
                    gsap.to(this.bodyMaterial.uniforms.uWobble, { value: 0.01, duration: 1 });
                    this._petPhaseChanged = false;
                }
                break;
            }
        }
    }

    endPet() {
        this._isPetting = false;
        const wasPhase = this._petPhase || 'pleased';

        // Smoothly release deformation
        gsap.to(this.bodyMaterial.uniforms.uPetStrength, { value: 0, duration: 0.8, ease: 'power2.out' });

        // Restore original colors and state
        const origColor = this._origColor || new THREE.Color('#F5A623');
        gsap.to(this.bodyMaterial.uniforms.uColor.value,
            { r: origColor.r, g: origColor.g, b: origColor.b, duration: 1.2 });
        gsap.to(this.bodyMaterial.uniforms.uColor2.value,
            { r: 1.0, g: 0.84, b: 0.0, duration: 1.2 });
        gsap.to(this.bodyMaterial.uniforms.uGlow, { value: 0.4, duration: 1.0 });
        gsap.to(this.bodyMaterial.uniforms.uWobble, { value: 0.06, duration: 1.0 });
        gsap.to(this.body.scale, { x: 1, y: 1, z: 1, duration: 1, ease: 'power2.out' });
        gsap.to(this.group.rotation, { z: 0, duration: 0.8 });
        this.group.position.x = 0;

        // Post-pet expression based on phase
        const recoverDelay = wasPhase === 'fedUp' ? 4.0 : wasPhase === 'annoyed' ? 3.0 : 2.0;
        gsap.delayedCall(recoverDelay, () => {
            if (!this._isPetting) this.drawFace('default');
        });
    }

    // ─── Shake Detection (Phone + Desktop) ───
    initShakeDetection() {
        this._prevMouseX = 0;
        this._prevMouseY = 0;
        this._mouseVelocity = 0;

        // Mobile: DeviceMotion API (accelerometer)
        if (typeof DeviceMotionEvent !== 'undefined') {
            // iOS 13+ requires permission
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                document.addEventListener('click', () => {
                    DeviceMotionEvent.requestPermission().then(state => {
                        if (state === 'granted') this._bindDeviceMotion();
                    }).catch(() => { });
                }, { once: true });
            } else {
                this._bindDeviceMotion();
            }
        }

        // Desktop: Mouse velocity detection
        window.addEventListener('mousemove', (e) => {
            const dx = e.clientX - this._prevMouseX;
            const dy = e.clientY - this._prevMouseY;
            this._mouseVelocity = Math.sqrt(dx * dx + dy * dy);
            this._prevMouseX = e.clientX;
            this._prevMouseY = e.clientY;

            // Fast mouse movement → shake
            if (this._mouseVelocity > 40) {
                const shakeAmount = Math.min(this._mouseVelocity / 300, 0.5);
                this._shakeIntensity = Math.max(this._shakeIntensity, shakeAmount);
            }
        });
    }

    _bindDeviceMotion() {
        window.addEventListener('devicemotion', (e) => {
            const acc = e.accelerationIncludingGravity;
            if (!acc) return;
            const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
            // Threshold: above ~15 m/s² is a shake (gravity ≈ 9.8)
            if (magnitude > 15) {
                const shakeAmount = Math.min((magnitude - 15) / 30, 0.5);
                this._shakeIntensity = Math.max(this._shakeIntensity, shakeAmount);
            }
        });
    }

    // ─── Update Loop ───
    update(time) {
        this.bodyMaterial.uniforms.uTime.value = time;
        this.bodyMaterial.uniforms.uBreath.value = 0.015;

        // Shake physics: gentle wobble boost + micro-jitter (clamped)
        if (this._shakeIntensity > 0.01) {
            const baseWobble = this.bodyMaterial.uniforms.uWobble.value;
            // Add a small controlled amount, never exceed 0.2 total
            this.bodyMaterial.uniforms.uWobble.value = Math.min(baseWobble + this._shakeIntensity * 0.04, 0.2);
            // Tiny position jitter
            this.group.position.x += (Math.random() - 0.5) * this._shakeIntensity * 0.03;
            // Surprise face when strongly shaken
            if (this._shakeIntensity > 0.25 && this.currentExpression !== 'surprise') {
                this.drawFace('surprise');
                this._shakeExpTimer = time;
            }
            this._shakeIntensity *= this._shakeDecay; // natural decay
        } else {
            this._shakeIntensity = 0;
            // Return face to default after shake settles
            if (this._shakeExpTimer && time - this._shakeExpTimer > 1.5) {
                this.drawFace('default');
                this._shakeExpTimer = null;
            }
            // Wobble slowly returns to idle baseline
            const wobble = this.bodyMaterial.uniforms.uWobble.value;
            if (wobble > 0.06) {
                this.bodyMaterial.uniforms.uWobble.value += (0.06 - wobble) * 0.05;
            }
        }

        // Gentle idle float (slow, subtle)
        this.group.position.y += (Math.sin(time * 0.4) * 0.06 - this.group.position.y) * 0.02;

        // Core pulse (very subtle)
        const corePulse = 1.0 + Math.sin(time * 0.9) * 0.04;
        this.core.scale.set(corePulse, corePulse, corePulse);
        this.core.material.opacity = 0.45 + Math.sin(time * 1.0) * 0.08;

        // Glow pulse (gentle)
        this.glowSprite.material.opacity = 0.4 + Math.sin(time * 0.5) * 0.1;

        // Particle orbit (slow drift)
        const posAttr = this.particles.geometry.getAttribute('position');
        for (let i = 0; i < posAttr.count; i++) {
            const speed = this._particleSpeeds[i];
            const bx = this._particleBasePositions[i * 3];
            const by = this._particleBasePositions[i * 3 + 1];
            const bz = this._particleBasePositions[i * 3 + 2];
            posAttr.setXYZ(i,
                bx + Math.sin(time * speed * 0.5 + i) * 0.05,
                by + Math.cos(time * speed * 0.35 + i * 2) * 0.05,
                bz + Math.sin(time * speed * 0.25 + i * 3) * 0.04
            );
        }
        posAttr.needsUpdate = true;

        // ─── Vision Eye Tracking & Away Logic ───
        if (!this._isAway) {
            // Target face center (0.5, 0.5) is neutral.
            // Map face position to eye offset (-1 to 1 range)
            const targetOX = (this._eyeTarget.x - 0.5) * 2;
            const targetOY = (this._eyeTarget.y - 0.5) * 2;

            // Smooth interpolation
            this._eyeOffset.x += (targetOX - this._eyeOffset.x) * 0.1;
            this._eyeOffset.y += (targetOY - this._eyeOffset.y) * 0.1;

            // Redraw only if there's meaningful movement
            if (Math.abs(targetOX - this._eyeOffset.x) > 0.01 || Math.abs(targetOY - this._eyeOffset.y) > 0.01) {
                this.drawFace();
            }
        } else {
            // Away behavior cycles
            const awayTime = time - this._awayStartTime;
            if (awayTime > 15 && this.currentExpression === 'waiting') {
                this.drawFace('tired'); // Bored
                gsap.to(this.body.scale, { y: 0.9, duration: 2 });
            } else if (awayTime > 30 && this.currentExpression !== 'sad') {
                this.drawFace('sad'); // Lonely
            }
            // Continuous tiny float when alone
            this.group.position.y += Math.sin(time * 0.5) * 0.001;
        }

        // ─── Autonomous Idle Behaviors ───
        const timeSinceInteraction = time - this._lastInteraction;
        if (timeSinceInteraction > this._nextIdleTime && !this._isDoingIdleBehavior) {
            this._isDoingIdleBehavior = true;
            this._performIdleBehavior(time);
        }
    }

    // ─── Idle Behavior System ───
    _performIdleBehavior(time) {
        const behaviors = [
            'lookAround',
            'blink',
            'stretch',
            'tiltHead',
            'peekDown',
            'gentleSpin'
        ];
        const choice = behaviors[Math.floor(Math.random() * behaviors.length)];

        const onComplete = () => {
            this._isDoingIdleBehavior = false;
            this._nextIdleTime = time + 6 + Math.random() * 12;
            // Return to default pose
            gsap.to(this.group.rotation, { x: 0, y: 0, z: 0, duration: 1.5, ease: 'power1.inOut' });
            gsap.to(this.faceMesh.position, { x: 0, duration: 1 });
            this.drawFace('default');
        };

        switch (choice) {
            case 'lookAround': {
                // Gently look left, then right
                const dir = Math.random() > 0.5 ? 1 : -1;
                gsap.to(this.faceMesh.position, { x: 0.1 * dir, duration: 1, ease: 'power1.inOut' });
                gsap.to(this.group.rotation, { z: 0.06 * dir, duration: 1, ease: 'power1.inOut' });
                this.drawFace('curious');
                gsap.delayedCall(2.5, () => {
                    gsap.to(this.faceMesh.position, { x: -0.08 * dir, duration: 1.2, ease: 'power1.inOut' });
                    gsap.to(this.group.rotation, { z: -0.04 * dir, duration: 1.2, ease: 'power1.inOut' });
                    gsap.delayedCall(2, onComplete);
                });
                break;
            }
            case 'blink': {
                // Quick blink (close eyes momentarily)
                this.drawFace('tired');
                gsap.delayedCall(0.3, () => {
                    this.drawFace('default');
                    gsap.delayedCall(0.8, () => {
                        // Sometimes double blink
                        if (Math.random() > 0.5) {
                            this.drawFace('tired');
                            gsap.delayedCall(0.2, () => {
                                this.drawFace('default');
                                gsap.delayedCall(1, onComplete);
                            });
                        } else {
                            onComplete();
                        }
                    });
                });
                break;
            }
            case 'stretch': {
                // Gently squash then stretch vertically
                gsap.to(this.body.scale, { x: 1.04, y: 0.95, z: 1.04, duration: 1, ease: 'power1.inOut' });
                gsap.delayedCall(1.2, () => {
                    gsap.to(this.body.scale, { x: 0.97, y: 1.05, z: 0.97, duration: 1.2, ease: 'power1.inOut' });
                    this.drawFace('happy');
                    gsap.delayedCall(1.5, () => {
                        gsap.to(this.body.scale, { x: 1, y: 1, z: 1, duration: 1, ease: 'power1.inOut' });
                        onComplete();
                    });
                });
                break;
            }
            case 'tiltHead': {
                // Curious head tilt
                const tilt = (Math.random() > 0.5 ? 1 : -1) * 0.1;
                this.drawFace('curious');
                gsap.to(this.group.rotation, { z: tilt, duration: 1.5, ease: 'power1.inOut' });
                gsap.delayedCall(3, onComplete);
                break;
            }
            case 'peekDown': {
                // Look downward as if checking something
                gsap.to(this.faceMesh.position, { y: -0.05, duration: 1, ease: 'power1.inOut' });
                gsap.to(this.group.rotation, { x: 0.08, duration: 1, ease: 'power1.inOut' });
                gsap.delayedCall(2.5, () => {
                    gsap.to(this.faceMesh.position, { y: 0.05, duration: 0.8 });
                    gsap.to(this.group.rotation, { x: 0, duration: 0.8 });
                    gsap.delayedCall(1, onComplete);
                });
                break;
            }
            case 'gentleSpin': {
                // Very slow partial spin (like drifting in zero gravity)
                this.drawFace('happy');
                gsap.to(this.group.rotation, {
                    y: Math.PI * 0.4 * (Math.random() > 0.5 ? 1 : -1),
                    duration: 3, ease: 'power1.inOut'
                });
                gsap.delayedCall(3.5, onComplete);
                break;
            }
        }
    }

    // ─── Emotion Presets ───
    applyPreset(command, colorHex) {
        const parts = command.split('_');
        const emotion = parts[0] || '평온';
        const action = parts[1] || '기본';
        const intensityStr = parts[2] || '중';
        const durationStr = parts[3] || '보통';

        // Mark interaction time to pause idle behaviors
        this._lastInteraction = this.bodyMaterial.uniforms.uTime.value;
        this._isDoingIdleBehavior = false;

        // Toned-down intensity (jelly-realistic)
        const intensityMap = { '약': 0.4, '중': 0.7, '강': 1.2 };
        const durationMap = { '짧게': 0.6, '보통': 1.2, '길게': 2.5 };
        const intensity = intensityMap[intensityStr] || 1.0;
        const duration = durationMap[durationStr] || 1.0;
        const color = new THREE.Color(colorHex);

        // Map emotion to expression
        const expressionMap = {
            '기쁨': 'happy', '슬픔': 'sad', '화남': 'angry',
            '놀람': 'surprise', '궁금함': 'curious', '피곤': 'tired',
            '평온': 'default'
        };
        this.drawFace(expressionMap[emotion] || 'default');

        // Apply glow (subtle)
        gsap.to(this.glowSprite.material, {
            opacity: Math.min(0.35 + intensity * 0.15, 0.7),
            duration: duration
        });

        // Toned-down, physically grounded presets
        switch (action) {
            case '기본':
                this.animateTo({ scale: 1.0, wobble: 0.04 * intensity, glow: 0.35, color, duration });
                break;
            case '흔들림': // gentle lateral sway
                this.animateTo({ scale: 1.03, wobble: 0.15 * intensity, glow: 0.5, color, duration });
                gsap.to(this.group.rotation, { z: 0.06, duration: 0.25, yoyo: true, repeat: 4, ease: 'power1.inOut' });
                break;
            case '응시': // subtle tilt + eye shift
                this.animateTo({ scale: 1.0, wobble: 0.06 * intensity, glow: 0.4, color, rotationZ: 0.1, duration });
                gsap.to(this.faceMesh.position, { x: 0.1, duration: duration, ease: 'power1.inOut' });
                break;
            case '확장': // quick puff, not too large
                this.animateTo({ scale: 1.0 + 0.15 * intensity, wobble: 0.2, glow: 0.7, color, duration: 0.4 });
                gsap.to(this.core.scale, { x: 1.15, y: 1.15, z: 1.15, duration: 0.3, yoyo: true, repeat: 1 });
                break;
            case '움츠림': // slight shrink, sinks a little
                this.animateTo({ scale: 0.9, wobble: 0.03, glow: 0.2, color, yOffset: -0.08, duration });
                break;
            case '하품': // gentle vertical stretch
                this.animateTo({ scale: 1.02, wobble: 0.04, glow: 0.25, color, squash: 1.1, duration });
                break;
            case '회전': // slow graceful turn
                gsap.to(this.group.rotation, { y: Math.PI * 2, duration: Math.max(duration, 1.5), ease: 'power1.inOut' });
                this.animateTo({ scale: 1.0, wobble: 0.1 * intensity, glow: 0.5, color, duration });
                break;
            case '떨림': // small tremor, not extreme
                this.animateTo({ scale: 1.0, wobble: 0.3 * intensity, glow: 0.55, color, duration });
                gsap.to(this.group.position, { x: 0.02, duration: 0.06, yoyo: true, repeat: 12 });
                break;
            case '인사': // soft nod
                gsap.to(this.group.position, { y: -0.06, duration: 0.35, yoyo: true, repeat: 1, ease: 'power1.out' });
                this.animateTo({ scale: 1.0, wobble: 0.08, glow: 0.45, color, duration: 0.8 });
                break;
            case '속삭임': // barely moves
                this.animateTo({ scale: 0.98, wobble: 0.02, glow: 0.25, color, duration });
                break;
            default:
                this.animateTo({ scale: 1.0, wobble: 0.06, glow: 0.35, color, duration });
        }
    }

    animateTo({ scale = 1, wobble = 0.06, glow = 0.35, color, rotationZ = 0, squash = 1, yOffset = 0, duration = 1 }) {
        // Body scale — smooth, jelly-like easing
        gsap.to(this.body.scale, {
            x: scale * (1 / squash),
            y: scale * squash,
            z: scale * (1 / squash),
            duration, ease: "power2.out"
        });

        // Shader uniforms
        gsap.to(this.bodyMaterial.uniforms.uWobble, { value: wobble, duration });
        gsap.to(this.bodyMaterial.uniforms.uGlow, { value: glow, duration });
        gsap.to(this.bodyMaterial.uniforms.uColor.value, { r: color.r, g: color.g, b: color.b, duration });

        // Rotation tilt
        gsap.to(this.group.rotation, { z: rotationZ, duration });

        // Face follows tilt
        gsap.to(this.faceMesh.position, { x: 0, duration: duration * 0.5 });

        // Core color
        const coreColor = color.clone().lerp(new THREE.Color('#ffffff'), 0.5);
        gsap.to(this.core.material.color, { r: coreColor.r, g: coreColor.g, b: coreColor.b, duration });
    }
}
