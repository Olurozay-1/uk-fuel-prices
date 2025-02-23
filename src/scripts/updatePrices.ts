import { FuelPriceFetcher } from '../lib/fuelPriceFetcher';
import { supabase } from '../lib/supabase';
import { Station } from '../types/index';

// Helper function to convert "DD/MM/YYYY HH:mm:ss" to "YYYY-MM-DD HH:mm:ss"
function reformatDate(dateStr: string): string {
  // If the date string contains a slash, assume it's in DD/MM/YYYY format.
  if (dateStr.includes('/')) {
    const parts = dateStr.split(' ');
    if (parts.length < 2) return dateStr; // safeguard
    const datePart = parts[0]; // e.g. "23/02/2025"
    const timePart = parts[1]; // e.g. "11:51:52"
    const dateParts = datePart.split('/');
    if (dateParts.length !== 3) return dateStr;
    const [day, month, year] = dateParts;
    return `${year}-${month}-${day} ${timePart}`;
  }
  // If already in the expected format, just return it.
  return dateStr;
}

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

    // Deduplicate stations based on unique site_id, if necessary.
    const stations: Station[] = data.stations;
    const uniqueStations = Array.from(new Map(stations.map(station => [station.site_id, station])).values());

    // Process stations in batches.
    const batchSize = 100;
    
    for (let i = 0; i < uniqueStations.length; i += batchSize) {
      const batch = uniqueStations.slice(i, i + batchSize);

      // Reformat the date fields and location data.
      const formattedBatch = batch.map(station => {
        const formattedStation: any = {
          ...station,
          location: `SRID=4326;POINT(${station.location.coordinates[0]} ${station.location.coordinates[1]})`
        };

        // Convert the date field if present (adjust field name if necessary)
        if (station.last_update && typeof station.last_update === 'string') {
          formattedStation.last_update = reformatDate(station.last_update);
        }
        return formattedStation;
      });
      
      const { error } = await supabase
        .from('stations')
        .upsert(formattedBatch, { onConflict: 'site_id' });
        
      if (error) {
        console.error('Error updating batch:', error);
        continue;
      }
    }

    // Update national averages using the deduplicated station list.
    const averages = await calculateNationalAverages(uniqueStations);
    const { error: avgError } = await supabase
      .from('national_averages')
      .upsert(averages, { onConflict: 'date' });

    if (avgError) {
      console.error('Error updating national averages:', avgError);
    }

    console.log(`Updated ${uniqueStations.length} stations successfully`);
  } catch (error) {
    console.error('Failed to update prices:', error);
  }
}

// Run the update if this is the main module.
if (import.meta.url === new URL(import.meta.url).href) {
  updateDatabase().then(() => process.exit(0));
}
