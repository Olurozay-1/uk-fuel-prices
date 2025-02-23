export interface FuelPrices {
    E5?: number;
    E10?: number;
    B7?: number;
    SDV?: number;
}

export interface Station {
    site_id: string;
    brand: string;
    name?: string;
    address: string;
    postcode: string;
    location: {
        type: 'Point';
        coordinates: [number, number]; // [longitude, latitude]
    };
    current_prices: FuelPrices;
    last_updated: string;
}

export interface NationalAverages {
    date: string;
    unleaded_avg: number | null;
    diesel_avg: number | null;
    premium_avg: number | null;
}

export interface RetailerSource {
    name: string;
    url: string;
}