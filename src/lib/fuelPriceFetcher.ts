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

    async fetchRetailerData(retailer: RetailerSource): Promise<Station[]> {
        try {
            console.log(`Fetching data from ${retailer.name}...`);
            
            const response = await axios.get(retailer.url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'UK-Fuel-Price-Comparison/1.0'
                }
            });

            // Handle Shell's HTML response
            if (retailer.name === 'SHELL' && response.headers['content-type']?.includes('text/html')) {
                console.log(`Skipping Shell HTML response`);
                return [];
            }

            return this.normalizeData(response.data, retailer.name);
        } catch (error) {
            console.error(`Error fetching data from ${retailer.name}:`, error);
            return [];
        }
    }

    private normalizeData(data: any, retailerName: string): Station[] {
        try {
            // Get stations array with fallback
            const stations = data.stations || [];
            
            return stations.map((station: any) => {
                try {
                    // Extract prices safely
                    const prices = station.prices || {};
                    
                    return {
                        site_id: station.site_id,
                        brand: station.brand || retailerName,
                        postcode: station.postcode,
                        address: station.address,
                        location: {
                            type: 'Point',
                            coordinates: [
                                station.location?.longitude || 0,
                                station.location?.latitude || 0
                            ]
                        },
                        current_prices: {
                            E5: prices.E5 || prices.UNLEADED || null,
                            E10: prices.E10 || null,
                            B7: prices.B7 || prices.DIESEL || null,
                            SDV: prices.SDV || prices.PREMIUM || null
                        },
                        last_updated: data.last_updated || new Date().toISOString()
                    };
                } catch (error) {
                    console.error(`Error processing station from ${retailerName}:`, error);
                    return null;
                }
            }).filter(station => 
                station !== null && 
                station.site_id && 
                station.postcode
            );
        } catch (error) {
            console.error(`Error normalizing data from ${retailerName}:`, error);
            return [];
        }
    }

    async fetchAllRetailers(): Promise<{
        stations: Station[];
        timestamp: string;
        total_stations: number;
    }> {
        const allData: Station[] = [];
        
        for (const retailer of this.retailers) {
            const retailerData = await this.fetchRetailerData(retailer);
            console.log(`Retrieved ${retailerData.length} stations from ${retailer.name}`);
            allData.push(...retailerData);
        }

        return {
            stations: allData,
            timestamp: new Date().toISOString(),
            total_stations: allData.length
        };
    }
}