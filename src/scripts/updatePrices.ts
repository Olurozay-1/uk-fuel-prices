import { FuelPriceFetcher } from '../lib/fuelPriceFetcher';
import { supabase } from '../lib/supabase';
import { Station } from '../types/index';

/**
 * Check if a string is in the format: DD/MM/YYYY HH:mm:ss
 * Example: "23/02/2025 11:51:52"
 */
function isDmyDateString(str: string): boolean {
  const dmyRegex = /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}$/;
  return dmyRegex.test(str);
}

/**
 * Reformat "DD/MM/YYYY HH:mm:ss" -> "YYYY-MM-DD HH:mm:ss"
 */
function reformatDmyDate(str: string): string {
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
  if (!match) return str; // Fallback, if it doesn't match exactly
  const [, day, month, year, time] = match;
  // Return in a Postgres-friendly format
  return `${year}-${month}-${day} ${time}`;
}

/**
 * Reformat known date fields in the station object (or top-level).
 * In your JSON, the field is "last_updated" (NOT "last_update").
 */
function reformatDates(station: any): void {
  const dateFields = ['last_updated']; // Add more if needed

  for (const field of dateFields) {
    if (station[field] && typeof station[field] === 'string' && isDmyDateString(station[field])) {
      const original = station[field];
      station[field] = reformatDmyDate(station[field]);
      console.log(`Reformatted ${field}: "${original}" => "${station[field]}"`);
    }
  }
}

/**
 * Convert location strings to floats and produce the "SRID=4326;POINT(... ...)" format.
 */
function formatLocation(station: any): void {
  if (!station.location) return;
  
  // Some stations have location as { longitude: "123.456", latitude: "45.678" }
  // Convert them to numbers if needed
  const lon = parseFloat(station.location.longitude);
  const lat = parseFloat(station.location.latitude);
  
  // PostGIS-compatible point (lon lat)
  station.location = `SRID=4326;POINT(${lon} ${lat})`;
}

async function calculateNationalAverages(stations: Station[]) {
  const prices = {
    E5: [] as number[],
    E10: [] as number[],
    B7: [] as number[],
    SDV: [] as number[]
  };

  stations.forEach((station) => {
    Object.entries(station.current_prices).forEach(([type, price]) => {
      if (price && price > 0) {
        prices[type as keyof typeof prices].push(price);
      }
    });
  });

  const average = (arr: number[]) =>
    arr.length
      ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1))
      : null;

  return {
    date: new Date().toISOString().split('T')[0],
    unleaded_avg: average(prices.E5),
    diesel_avg: average(prices.B7),
    premium_avg: average(prices.SDV),
  };
}

export async function updateDatabase() {
  const fetcher = new FuelPriceFetcher();

  try {
    console.log('Starting price update...');
    const data = await fetcher.fetchAllRetailers();
    
    // 'data' might have a top-level "last_updated" field
    // If you want to store that globally somewhere, reformat it here:
    reformatDates(data);

    // If data.stations includes "last_updated" for each station, you can do that below too.
    const stations: Station[] = data.stations;

    // Deduplicate by site_id to avoid "ON CONFLICT DO UPDATE" errors
    const uniqueStations = Array.from(
      new Map(stations.map((s) => [s.site_id, s])).values()
    );

    // Upsert in batches
    const batchSize = 100;
    for (let i = 0; i < uniqueStations.length; i += batchSize) {
      const batch = uniqueStations.slice(i, i + batchSize);

      // Reformat each station's date fields and location
      const formattedBatch = batch.map((station) => {
        // Convert location to SRID=4326
        formatLocation(station);
        
        // If each station also has "last_updated", reformat it
        reformatDates(station);

        return {
          ...station,
        };
      });

      const { error } = await supabase
        .from('stations')
        .upsert(formattedBatch, { onConflict: 'site_id' });

      if (error) {
        console.error('Error updating batch:', error);
        continue;
      }
    }

    // Update national averages
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

// Run the update if this is the main module
if (import.meta.url === new URL(import.meta.url).href) {
  updateDatabase().then(() => process.exit(0));
}
