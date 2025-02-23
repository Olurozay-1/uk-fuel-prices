import axios from 'axios';
import { Station, RetailerSource } from '../types';

const RETAILERS: RetailerSource[] = [
    {
        name: 'RONTEC',
        url: 'https://www.rontec-servicestations.co.uk/fuel-prices/data/fuel_prices_data.json'
    },
    {
        name: 'ESSO',
        url: 'https://fuelprices.esso.co.uk/latestdata.json'
    }
    // Add other retailers here
];

export class FuelPriceFetcher {
    private retailers: RetailerSource[];

    constructor() {
        this.retailers = RETAILERS;
    }

    async fetchRetailerData(retailer: RetailerSource): Promise<Station[]> {
        try {
            const response = await axios.get(retailer.url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'UK-Fuel-Price-Comparison/1.0'
                }
            });

            return this.normalizeData(response.data, retailer.name);
        } catch (error) {
            console.error(`Error fetching data from ${retailer.name}:`, error);
            return [];
        }
    }

    private normalizeData(data: any, retailerName: string): Station[] {
        const stations = data.stations || [];
        
        return stations.map((station: any) => ({
            site_id: station.site_id,
            brand: station.brand || retailerName,
            postcode: station.postcode,
            address: station.address,
            location: {
                type: 'Point',
                coordinates: [
                    station.location.longitude,
                    station.location.latitude
                ]
            },
            current_prices: {
                E5: station.prices.E5 || null,
                E10: station.prices.E10 || null,
                B7: station.prices.B7 || null,
                SDV: station.prices.SDV || null
            },
            last_updated: new Date().toISOString()
        }));
    }

    async fetchAllRetailers(): Promise<{
        stations: Station[];
        timestamp: string;
        total_stations: number;
    }> {
        const allData: Station[] = [];
        
        for (const retailer of this.retailers) {
            console.log(`Fetching data from ${retailer.name}...`);
            const retailerData = await this.fetchRetailerData(retailer);
            allData.push(...retailerData);
        }

        return {
            stations: allData,
            timestamp: new Date().toISOString(),
            total_stations: allData.length
        };
    }
}