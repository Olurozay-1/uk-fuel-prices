import axios from 'axios';
import { Station, RetailerSource } from '../types';

const RETAILERS: RetailerSource[] = [
    {
        name: 'APPLEGREEN',
        url: 'https://applegreenstores.com/fuel-prices/data.json'
    },
    {
        name: 'ASCONA',
        url: 'https://fuelprices.asconagroup.co.uk/newfuel.json'
    },
    {
        name: 'ASDA',
        url: 'https://storelocator.asda.com/fuel_prices_data.json'
    },
    {
        name: 'BP',
        url: 'https://www.bp.com/en_gb/united-kingdom/home/fuelprices/fuel_prices_data.json'
    },
    {
        name: 'ESSO',
        url: 'https://fuelprices.esso.co.uk/latestdata.json'
    },
    {
        name: 'JET',
        url: 'https://jetlocal.co.uk/fuel_prices_data.json'
    },
    {
        name: 'KARAN',
        url: 'https://api2.krlmedia.com/integration/live_price/krl'
    },
    {
        name: 'MORRISONS',
        url: 'https://www.morrisons.com/fuel-prices/fuel.json'
    },
    {
        name: 'MOTO',
        url: 'https://moto-way.com/fuel-price/fuel_prices.json'
    },
    {
        name: 'MFG',
        url: 'https://fuel.motorfuelgroup.com/fuel_prices_data.json'
    },
    {
        name: 'RONTEC',
        url: 'https://www.rontec-servicestations.co.uk/fuel-prices/data/fuel_prices_data.json'
    },
    {
        name: 'SAINSBURYS',
        url: 'https://api.sainsburys.co.uk/v1/exports/latest/fuel_prices_data.json'
    },
    {
        name: 'SGN',
        url: 'https://www.sgnretail.uk/files/data/SGN_daily_fuel_prices.json'
    },
    {
        name: 'SHELL',
        url: 'https://www.shell.co.uk/fuel-prices-data.html'
    },
    {
        name: 'TESCO',
        url: 'https://www.tesco.com/fuel_prices/fuel_prices_data.json'
    }
];

export class FuelPriceFetcher {
    private retailers: RetailerSource[];

    constructor() {
        this.retailers = RETAILERS;
    }

    // Helper to normalize price values
    private normalizePrice(price: any): number | null {
        if (price === null || price === undefined) return null;
        if (typeof price === 'number') return price;
        if (typeof price === 'string') {
            const parsed = parseFloat(price);
            return isNaN(parsed) ? null : parsed;
        }
        return null;
    }

    // Helper to validate and format coordinates
    private normalizeCoordinates(location: any): [number, number] {
        if (!location) return [0, 0];
        
        const longitude = location.longitude || location.lng || 0;
        const latitude = location.latitude || location.lat || 0;
        
        return [
            typeof longitude === 'string' ? parseFloat(longitude) : longitude,
            typeof latitude === 'string' ? parseFloat(latitude) : latitude
        ];
    }

    private normalizeData(data: any, retailerName: string): Station[] {
        try {
            // Handle different data structures
            let stations = [];
            
            if (Array.isArray(data)) {
                stations = data;
            } else if (data.stations && Array.isArray(data.stations)) {
                stations = data.stations;
            } else {
                console.error(`Unexpected data structure from ${retailerName}`);
                return [];
            }

            const lastUpdated = data.last_updated || new Date().toISOString();

            return stations.map((station: any) => {
                try {
                    // Handle different location formats
                    const coordinates = this.normalizeCoordinates(station.location);

                    // Handle different price formats
                    const prices = station.prices || station.fuel_prices || {};
                    
                    const normalizedStation = {
                        site_id: station.site_id || station.id || '',
                        brand: station.brand || retailerName,
                        postcode: station.postcode || station.post_code || '',
                        address: station.address || station.street_address || '',
                        location: {
                            type: 'Point',
                            coordinates
                        },
                        current_prices: {
                            E5: this.normalizePrice(prices.E5 || prices.UNLEADED || prices.unleaded),
                            E10: this.normalizePrice(prices.E10 || prices.e10),
                            B7: this.normalizePrice(prices.B7 || prices.DIESEL || prices.diesel),
                            SDV: this.normalizePrice(prices.SDV || prices.PREMIUM || prices.premium)
                        },
                        last_updated: lastUpdated
                    };

                    // Validate required fields
                    if (!normalizedStation.site_id || 
                        !normalizedStation.postcode || 
                        (normalizedStation.location.coordinates[0] === 0 && 
                         normalizedStation.location.coordinates[1] === 0)) {
                        return null;
                    }

                    return normalizedStation;
                } catch (error) {
                    console.error(`Error normalizing station data for ${retailerName}:`, error);
                    return null;
                }
            }).filter(station => station !== null) as Station[];

        } catch (error) {
            console.error(`Error processing data from ${retailerName}:`, error);
            return [];
        }
    }

    async fetchRetailerData(retailer: RetailerSource): Promise<Station[]> {
        try {
            console.log(`Fetching data from ${retailer.name}...`);
            
            const response = await axios.get(retailer.url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'UK-Fuel-Price-Comparison/1.0',
                    'Accept': 'application/json'
                }
            });

            // Add specific handling for Shell's HTML response
            if (retailer.name === 'SHELL' && response.headers['content-type']?.includes('text/html')) {
                console.log(`Received HTML from Shell, special handling required`);
                // You might need to implement HTML parsing here
                return [];
            }

            // Log the first part of the response for debugging
            const preview = JSON.stringify(response.data).substring(0, 200);
            console.log(`Received data from ${retailer.name} (preview): ${preview}...`);

            return this.normalizeData(response.data, retailer.name);
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error(`Network error fetching data from ${retailer.name}:`, {
                    message: error.message,
                    status: error.response?.status,
                    statusText: error.response?.statusText
                });
            } else {
                console.error(`Error fetching data from ${retailer.name}:`, error);
            }
            return [];
        }
    }

    async fetchAllRetailers(): Promise<{
        stations: Station[];
        timestamp: string;
        total_stations: number;
    }> {
        const allData: Station[] = [];
        const errors: string[] = [];
        
        for (const retailer of this.retailers) {
            try {
                const retailerData = await this.fetchRetailerData(retailer);
                console.log(`Retrieved ${retailerData.length} stations from ${retailer.name}`);
                allData.push(...retailerData);
            } catch (error) {
                errors.push(`${retailer.name}: ${error}`);
            }
        }

        if (errors.length > 0) {
            console.error('Errors encountered while fetching data:', errors);
        }

        return {
            stations: allData,
            timestamp: new Date().toISOString(),
            total_stations: allData.length
        };
    }
}