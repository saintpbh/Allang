// ─── Environment Awareness Manager (Location & IP) ───
export class LocationManager {
    constructor() {
        this.location = null; // { city, country, lat, lon }
        this.ip = null;
        this.weather = null;
    }

    async init() {
        try {
            // 1. IP Detection
            const ipData = await fetch('https://ipapi.co/json/').then(res => res.json());
            this.ip = ipData.ip;
            this.location = {
                city: ipData.city,
                country: ipData.country_name,
                lat: ipData.latitude,
                lon: ipData.longitude,
                region: ipData.region
            };
        } catch (err) {
            console.warn('IP-based location detection failed:', err);
        }

        // 2. High-precision GPS (Optional, if permission granted)
        if ("geolocation" in navigator) {
            // We don't automatically call getCurrentPosition here to avoid prompt spam.
            // main.js will trigger it if user enabled the setting.
        }
    }

    getGPS() {
        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                () => resolve(null),
                { timeout: 5000 }
            );
        });
    }

    getContextString() {
        if (!this.location) return '';
        return `[현재 환경 정보]
- 위치: ${this.location.city}, ${this.location.region}, ${this.location.country}
- IP: ${this.ip}
- 좌표: ${this.location.lat}, ${this.location.lon}
- 시간: ${new Date().toLocaleString('ko-KR')}
`;
    }
}
