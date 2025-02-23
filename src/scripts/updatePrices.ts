import { FuelPriceFetcher } from '../lib/fuelPriceFetcher';
import { supabase } from '../lib/supabase';
import { Station } from '../types/index';

async function calculateNationalAverages(stations: Station[]) {
    const prices = {
        E5: [] as number[],
        E10: [] as number[],
        B7: [] as number[],
        SDV: [] as number[]
    };

    stations.forEach(station => {
        Object.entries(station.current_prices).forEach(([type, price]) => {
            if (price && price > 0) {
                prices[type as keyof typeof prices].push(price);
            }
        });
    });

    const average = (arr: number[]) => 
        arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : null;

    return {
        date: new Date().toISOString().split('T')[0],
        unleaded_avg: average(prices.E5),
        diesel_avg: average(prices.B7),
        premium_avg: average(prices.SDV)
    };
}

export async function updateDatabase() {
    const fetcher = new FuelPriceFetcher();
    
    try {
        console.log('Starting price update...');
        const data = await fetcher.fetchAllRetailers();
        
        // Update stations in batches
        const batchSize = 100;
        const stations = data.stations;
        
        for (let i = 0; i < stations.length; i += batchSize) {
            const batch = stations.slice(i, i + batchSize);
            
            const { error } = await supabase
                .from('stations')
                .upsert(
                    batch.map(station => ({
                        ...station,
                        location: `SRID=4326;POINT(${station.location.coordinates[0]} ${station.location.coordinates[1]})`
                    })),
                    { onConflict: 'site_id' }
                );
                
            if (error) {
                console.error('Error updating batch:', error);
                continue;
            }
        }

        // Update national averages
        const averages = await calculateNationalAverages(stations);
        const { error: avgError } = await supabase
            .from('national_averages')
            .upsert(averages, { onConflict: 'date' });

        if (avgError) {
            console.error('Error updating national averages:', avgError);
        }

        console.log(`Updated ${stations.length} stations successfully`);
    } catch (error) {
        console.error('Failed to update prices:', error);
    }
}

// Run the update if this is the main module
if (import.meta.url === new URL(import.meta.url).href) {
    updateDatabase().then(() => process.exit(0));
}