class GeohashServiceClass {
  private initialized = false;
  private readonly base32 = '0123456789bcdefghjkmnpqrstuvwxyz';

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  encode(latitude: number, longitude: number, precision: number = 7): string {
    let geohash = '';
    let latRange = [-90.0, 90.0];
    let lonRange = [-180.0, 180.0];
    let isEven = true;
    let bit = 0;
    let ch = 0;

    while (geohash.length < precision) {
      if (isEven) {
        const mid = (lonRange[0] + lonRange[1]) / 2;
        if (longitude >= mid) {
          ch = (ch << 1) | 1;
          lonRange[0] = mid;
        } else {
          ch = ch << 1;
          lonRange[1] = mid;
        }
      } else {
        const mid = (latRange[0] + latRange[1]) / 2;
        if (latitude >= mid) {
          ch = (ch << 1) | 1;
          latRange[0] = mid;
        } else {
          ch = ch << 1;
          latRange[1] = mid;
        }
      }
      isEven = !isEven;
      bit++;
      if (bit === 5) {
        geohash += this.base32[ch];
        bit = 0;
        ch = 0;
      }
    }
    return geohash;
  }

  decode(geohash: string): { latitude: number; longitude: number } {
    let latRange = [-90.0, 90.0];
    let lonRange = [-180.0, 180.0];
    let isEven = true;

    for (const char of geohash) {
      const idx = this.base32.indexOf(char);
      for (let i = 4; i >= 0; i--) {
        const bit = (idx >> i) & 1;
        if (isEven) {
          const mid = (lonRange[0] + lonRange[1]) / 2;
          if (bit) lonRange[0] = mid;
          else lonRange[1] = mid;
        } else {
          const mid = (latRange[0] + latRange[1]) / 2;
          if (bit) latRange[0] = mid;
          else latRange[1] = mid;
        }
        isEven = !isEven;
      }
    }

    return {
      latitude: (latRange[0] + latRange[1]) / 2,
      longitude: (lonRange[0] + lonRange[1]) / 2
    };
  }

  distance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  adjacent(geohash: string, direction: string): string {
    return geohash;
  }
}

export const GeohashService = new GeohashServiceClass();
