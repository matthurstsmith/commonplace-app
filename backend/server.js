const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

const LONDON_LOCATIONS_DATABASE = {
  // Major areas and their precise coordinates - EXPANDED VERSION
  areas: {
    // Central London boroughs
    'westminster': { coords: [-0.1276, 51.4994], type: 'borough', station: 'Westminster', postcodes: ['SW1'] },
    'city of london': { coords: [-0.0931, 51.5156], type: 'borough', station: 'Bank', postcodes: ['EC1', 'EC2', 'EC3', 'EC4'] },
    'camden': { coords: [-0.1426, 51.5390], type: 'borough', station: 'Camden Town', postcodes: ['NW1', 'NW3'] },
    'islington': { coords: [-0.1031, 51.5362], type: 'borough', station: 'Angel', postcodes: ['N1', 'N7'] },
    'hackney': { coords: [-0.0553, 51.5448], type: 'borough', station: 'Hackney Central', postcodes: ['E8', 'E9'] },
    'tower hamlets': { coords: [-0.0329, 51.5099], type: 'borough', station: 'Bethnal Green', postcodes: ['E1', 'E2', 'E3', 'E14'] },
    'southwark': { coords: [-0.0892, 51.4837], type: 'borough', station: 'London Bridge', postcodes: ['SE1', 'SE15', 'SE16'] },
    'lambeth': { coords: [-0.1173, 51.4612], type: 'borough', station: 'Waterloo', postcodes: ['SE11', 'SW2', 'SW4'] },
    'wandsworth': { coords: [-0.1914, 51.4571], type: 'borough', station: 'Clapham Junction', postcodes: ['SW11', 'SW12', 'SW15', 'SW17', 'SW18'] },
    'hammersmith and fulham': { coords: [-0.2239, 51.4916], type: 'borough', station: 'Hammersmith', postcodes: ['W6', 'W12', 'W14', 'SW6'] },
    'kensington and chelsea': { coords: [-0.1938, 51.4988], type: 'borough', station: 'South Kensington', postcodes: ['SW3', 'SW5', 'SW7', 'SW10', 'W8'] },
    
    // CRITICAL FIX: Richmond and other missing areas
    'richmond': { coords: [-0.3037, 51.4613], type: 'district', station: 'Richmond', postcodes: ['TW9', 'TW10'], borough: 'Richmond upon Thames' },
    'richmond upon thames': { coords: [-0.3037, 51.4613], type: 'borough', station: 'Richmond', postcodes: ['TW9', 'TW10'] },
    'kew': { coords: [-0.2876, 51.4879], type: 'district', station: 'Kew Gardens', postcodes: ['TW9'], borough: 'Richmond upon Thames' },
    'wimbledon': { coords: [-0.2044, 51.4214], type: 'district', station: 'Wimbledon', postcodes: ['SW19'], borough: 'Merton' },
    'greenwich': { coords: [-0.0088, 51.4825], type: 'district', station: 'Greenwich', postcodes: ['SE10'], borough: 'Greenwich' },
    'clapham': { coords: [-0.1376, 51.4618], type: 'district', station: 'Clapham Common', postcodes: ['SW4', 'SW11'], borough: 'Lambeth' },
    'shoreditch': { coords: [-0.0778, 51.5227], type: 'district', station: 'Old Street', postcodes: ['E1', 'E2'], borough: 'Hackney' },
    'notting hill': { coords: [-0.2058, 51.5090], type: 'district', station: 'Notting Hill Gate', postcodes: ['W11'], borough: 'Kensington and Chelsea' },
    'canary wharf': { coords: [-0.0235, 51.5054], type: 'business', station: 'Canary Wharf', postcodes: ['E14'], borough: 'Tower Hamlets' },
    'borough market': { coords: [-0.0909, 51.5055], type: 'landmark', station: 'London Bridge', postcodes: ['SE1'], borough: 'Southwark' },
    
    // Additional outer London areas
    'croydon': { coords: [-0.0982, 51.3762], type: 'district', station: 'Croydon Central', postcodes: ['CR0'], borough: 'Croydon' },
    'bromley': { coords: [0.0140, 51.4060], type: 'district', station: 'Bromley South', postcodes: ['BR1'], borough: 'Bromley' },
    'kingston': { coords: [-0.3064, 51.4120], type: 'district', station: 'Kingston', postcodes: ['KT1', 'KT2'], borough: 'Kingston upon Thames' },
    'kingston upon thames': { coords: [-0.3064, 51.4120], type: 'borough', station: 'Kingston', postcodes: ['KT1', 'KT2'] },
    'ealing': { coords: [-0.3089, 51.5130], type: 'district', station: 'Ealing Broadway', postcodes: ['W5'], borough: 'Ealing' },
    'acton': { coords: [-0.2674, 51.5089], type: 'area', station: 'Acton Central' },
    'angel': { coords: [-0.1057, 51.5322], type: 'area', station: 'Angel' }
  },
  
  // Major stations with precise coordinates - EXPANDED VERSION
  stations: {
    // Central London hubs
    'bank': [-0.0886, 51.5133],
    'liverpool street': [-0.0817, 51.5176],
    'london bridge': [-0.0864, 51.5049],
    'waterloo': [-0.1133, 51.5036],
    'victoria': [-0.1448, 51.4952],
    'paddington': [-0.1759, 51.5154],
    'kings cross': [-0.1240, 51.5308],
    'euston': [-0.1335, 51.5282],
    'oxford circus': [-0.1415, 51.5154],
    'bond street': [-0.1490, 51.5142],
    'tottenham court road': [-0.1308, 51.5165],
    'piccadilly circus': [-0.1347, 51.5098],
    'westminster': [-0.1276, 51.4994],
    'baker street': [-0.1574, 51.5226],
    
    // CRITICAL: London Richmond station
    'richmond': [-0.3037, 51.4613],
    
    // Other important stations
    'clapham junction': [-0.1706, 51.4646],
    'wimbledon': [-0.2044, 51.4214],
    'canary wharf': [-0.0235, 51.5054],
    'stratford': [-0.0042, 51.5416],
    'hammersmith': [-0.2239, 51.4916],
    'south kensington': [-0.1742, 51.4941],
    'high street kensington': [-0.1919, 51.5010],
    'notting hill gate': [-0.1966, 51.5090],
    'camden town': [-0.1426, 51.5390],
    'angel': [-0.1057, 51.5322],
    'old street': [-0.0878, 51.5259],
    'borough market': [-0.0909, 51.5055],
    'greenwich': [-0.0146, 51.4781],
    'ealing broadway': [-0.3019, 51.5152],
    'kingston': [-0.3064, 51.4120]
  },
  
  // Common name variations and aliases - EXPANDED VERSION
  aliases: {
    // CRITICAL: Richmond variations to prevent confusion
    'richmond london': 'richmond',
    'richmond surrey': 'richmond',
    'richmond uk': 'richmond',
    'richmond station': 'richmond',
    'richmond upon thames': 'richmond',
    
    // Other variations
    'king cross': 'kings cross',
    'kings x': 'kings cross',
    'kgx': 'kings cross',
    'kcx': 'kings cross',
    'tottenham court rd': 'tottenham court road',
    'tcr': 'tottenham court road',
    'oxford st': 'oxford circus',
    'oxford street': 'oxford circus',
    'bond st': 'bond street',
    'piccadilly': 'piccadilly circus',
    'vic': 'victoria',
    'waterloo station': 'waterloo',
    'london bridge station': 'london bridge',
    'clapham jct': 'clapham junction',
    'south ken': 'south kensington',
    'high street ken': 'high street kensington',
    'borough': 'borough market',
    'the borough': 'borough market',
    'borough market area': 'borough market'
  }
};

// Mock Redis - always works, no external dependencies
const redis = {
  get: () => Promise.resolve(null),
  setEx: () => Promise.resolve('OK'),
  ping: () => Promise.resolve('PONG')
};

console.log('Using mock Redis (no external cache)');

// API Configuration
const API_CONFIG = {
  MAPBOX_TOKEN: process.env.MAPBOX_TOKEN,
  TFL_API_KEY: process.env.TFL_API_KEY,
  CACHE_TTL: {
    GEOCODING: 24 * 60 * 60,
    ISOCHRONE: 60 * 60,
    JOURNEY: 5 * 60,
    SUGGESTIONS: 60 * 60
  }
};

// Pre-defined London meeting areas - ADD THIS AT THE TOP OF server.js after the API_CONFIG
const LONDON_MEETING_AREAS = [
  // Central London
  { name: "King's Cross", coordinates: [-0.1240, 51.5308], type: "major_station", zones: [1] },
  { name: "London Bridge", coordinates: [-0.0864, 51.5049], type: "major_station", zones: [1] },
  { name: "Victoria", coordinates: [-0.1448, 51.4952], type: "major_station", zones: [1] },
  { name: "Liverpool Street", coordinates: [-0.0817, 51.5176], type: "major_station", zones: [1] },
  { name: "Waterloo", coordinates: [-0.1133, 51.5036], type: "major_station", zones: [1] },
  { name: "Paddington", coordinates: [-0.1759, 51.5154], type: "major_station", zones: [1] },
  { name: "Oxford Circus", coordinates: [-0.1415, 51.5154], type: "major_station", zones: [1] },
  { name: "Bond Street", coordinates: [-0.1490, 51.5142], type: "major_station", zones: [1] },
  { name: "Tottenham Court Road", coordinates: [-0.1308, 51.5165], type: "major_station", zones: [1] },
  
  // Zone 1 Districts
  { name: "Shoreditch", coordinates: [-0.0778, 51.5227], type: "district", zones: [1] },
  { name: "Clerkenwell", coordinates: [-0.1102, 51.5217], type: "district", zones: [1] },
  { name: "Bloomsbury", coordinates: [-0.1276, 51.5220], type: "district", zones: [1] },
  { name: "Covent Garden", coordinates: [-0.1243, 51.5118], type: "district", zones: [1] },
  { name: "Soho", coordinates: [-0.1317, 51.5142], type: "district", zones: [1] },
  { name: "Borough Market", coordinates: [-0.0909, 51.5055], type: "district", zones: [1] },
  { name: "Canary Wharf", coordinates: [-0.0235, 51.5054], type: "major_station", zones: [2] },
  
  // Zone 2 Areas
  { name: "Camden", coordinates: [-0.1426, 51.5390], type: "district", zones: [2] },
  { name: "Islington", coordinates: [-0.1031, 51.5362], type: "district", zones: [2] },
  { name: "Clapham", coordinates: [-0.1376, 51.4618], type: "district", zones: [2] },
  { name: "Brixton", coordinates: [-0.1145, 51.4613], type: "district", zones: [2] },
  { name: "Greenwich", coordinates: [-0.0088, 51.4825], type: "district", zones: [2, 3] },
  { name: "Hampstead", coordinates: [-0.1786, 51.5560], type: "district", zones: [2] },
  { name: "Notting Hill", coordinates: [-0.2058, 51.5090], type: "district", zones: [2] },
  { name: "Angel", coordinates: [-0.1057, 51.5322], type: "major_station", zones: [1] },
  { name: "Old Street", coordinates: [-0.0878, 51.5259], type: "major_station", zones: [1] },
];

// COMPREHENSIVE LONDON LOCATION RESOLUTION SYSTEM
class EnhancedLondonLocationResolver {
  constructor() {
    this.londonBounds = {
      strict: { minLat: 51.28, maxLat: 51.70, minLng: -0.51, maxLng: 0.33 },
      extended: { minLat: 51.20, maxLat: 51.80, minLng: -0.65, maxLng: 0.45 }
    };
    
    // Keep our manual database for areas/districts, but remove stations
    this.manualDatabase = {
      areas: LONDON_LOCATIONS_DATABASE.areas,
      aliases: LONDON_LOCATIONS_DATABASE.aliases,
      postcodes: {
        'SW1': 'westminster', 'SW3': 'kensington and chelsea', 'SW5': 'kensington and chelsea',
        'SW7': 'kensington and chelsea', 'SW10': 'kensington and chelsea', 'W8': 'kensington and chelsea',
        'W6': 'hammersmith and fulham', 'W12': 'hammersmith and fulham', 'W14': 'hammersmith and fulham',
        'TW9': 'richmond', 'TW10': 'richmond', 'SW19': 'wimbledon', 'SE10': 'greenwich',
        'E14': 'canary wharf', 'SW4': 'clapham', 'SW11': 'clapham', 'N1': 'islington',
        'E1': 'shoreditch', 'E2': 'shoreditch', 'W11': 'notting hill', 'SE1': 'borough market',
        'W5': 'ealing', 'CR0': 'croydon', 'BR1': 'bromley', 'KT1': 'kingston', 'KT2': 'kingston'
      }
    };
    
    // Cache for TfL station data
    this.stationCache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
  }

  // MAIN RESOLUTION FUNCTION - Enhanced with TfL Station Search
  async resolveLocation(locationInput) {
    console.log(`\n🔍 ENHANCED RESOLVING: "${locationInput}"`);
    
    const normalizedInput = this.normalizeInput(locationInput);
    
    // STAGE 1: Manual database lookup (areas, aliases, postcodes)
    const manualMatch = this.findManualMatch(normalizedInput);
    if (manualMatch) {
      console.log(`✅ MANUAL MATCH: ${manualMatch.name} [${manualMatch.confidence}]`);
      return manualMatch;
    }
    
    // STAGE 2: TfL Station Search (NEW!)
    const stationMatch = await this.findTfLStationMatch(normalizedInput);
    if (stationMatch) {
      console.log(`✅ TfL STATION MATCH: ${stationMatch.name} [${stationMatch.confidence}]`);
      return stationMatch;
    }
    
    // STAGE 3: Fuzzy matching within manual database
    const fuzzyMatch = this.findFuzzyMatch(normalizedInput);
    if (fuzzyMatch) {
      console.log(`✅ FUZZY MATCH: ${fuzzyMatch.name} [${fuzzyMatch.confidence}]`);
      return fuzzyMatch;
    }
    
    // STAGE 4: London-constrained geocoding (fallback)
    const geocodedMatch = await this.findGeocodedMatch(normalizedInput);
    if (geocodedMatch) {
      console.log(`✅ GEOCODED MATCH: ${geocodedMatch.name} [${geocodedMatch.confidence}]`);
      return geocodedMatch;
    }
    
    // STAGE 5: Failure with helpful message
    console.log(`❌ NO VALID LONDON LOCATION FOUND for "${locationInput}"`);
    throw new Error(`Could not find "${locationInput}" in London. Please try being more specific or check the spelling.`);
  }

  // NEW: TfL STATION SEARCH INTEGRATION
  async findTfLStationMatch(normalizedInput) {
    if (!API_CONFIG.TFL_API_KEY) {
      console.log('⚠️ No TfL API key available for station search');
      return null;
    }

    try {
      console.log(`🚇 SEARCHING TfL STATIONS: "${normalizedInput}"`);
      
      // First check cache
      const cacheKey = `station_search_${normalizedInput}`;
      const cached = this.stationCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
        console.log('📦 Using cached TfL station data');
        return cached.data;
      }
      
      // Search TfL StopPoint API
      const stations = await this.searchTfLStations(normalizedInput);
      
      if (stations.length === 0) {
        console.log('🔍 No TfL stations found, trying broader search...');
        // Try partial search for multi-word inputs
        const words = normalizedInput.split(' ');
        if (words.length > 1) {
          const partialStations = await this.searchTfLStations(words[0]);
          const filteredStations = partialStations.filter(station => 
            this.stationNameMatches(station.commonName, normalizedInput)
          );
          if (filteredStations.length > 0) {
            return this.selectBestStation(filteredStations, normalizedInput);
          }
        }
        return null;
      }
      
      const bestStation = this.selectBestStation(stations, normalizedInput);
      
      // Cache the result
      this.stationCache.set(cacheKey, {
        data: bestStation,
        timestamp: Date.now()
      });
      
      return bestStation;
      
    } catch (error) {
      console.error('🚨 TfL station search failed:', error.message);
      return null;
    }
  }

  // Search TfL StopPoint API for stations
  async searchTfLStations(query) {
    const fetch = (await import('node-fetch')).default;
    
    // TfL StopPoint Search API
    const searchUrl = `https://api.tfl.gov.uk/StopPoint/Search/${encodeURIComponent(query)}?` +
      `modes=tube,dlr,overground,elizabeth-line,national-rail&` +
      `app_key=${API_CONFIG.TFL_API_KEY}`;
    
    console.log('🔍 TfL StopPoint search:', searchUrl);
    
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      throw new Error(`TfL StopPoint API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.matches || data.matches.length === 0) {
      return [];
    }
    
    // Filter for London area and valid stations
    const londonStations = data.matches.filter(station => {
      const coords = [parseFloat(station.lon), parseFloat(station.lat)];
      return this.isInLondonBounds(coords) && 
             station.modes && 
             station.modes.some(mode => ['tube', 'dlr', 'overground', 'elizabeth-line', 'national-rail'].includes(mode));
    });
    
    console.log(`📍 Found ${londonStations.length} London stations matching "${query}"`);
    
    return londonStations;
  }

  // Select the best matching station from TfL results
  selectBestStation(stations, originalQuery) {
    if (stations.length === 0) return null;
    if (stations.length === 1) {
      return this.formatStationResult(stations[0]);
    }
    
    // Score stations based on name matching and station importance
    const scoredStations = stations.map(station => {
      let score = 0;
      
      const stationName = station.commonName.toLowerCase();
      const query = originalQuery.toLowerCase();
      
      // Exact match bonus
      if (stationName === query) score += 100;
      
      // Starts with query bonus
      if (stationName.startsWith(query)) score += 50;
      
      // Contains all words bonus
      const queryWords = query.split(' ');
      const stationWords = stationName.split(' ');
      const wordMatches = queryWords.filter(qw => 
        stationWords.some(sw => sw.includes(qw) || qw.includes(sw))
      ).length;
      score += (wordMatches / queryWords.length) * 30;
      
      // Station type bonuses
      if (station.modes.includes('tube')) score += 15;
      if (station.modes.includes('elizabeth-line')) score += 12;
      if (station.modes.includes('national-rail')) score += 10;
      if (station.modes.includes('overground')) score += 8;
      
      // Interchange station bonus (multiple modes)
      if (station.modes.length > 1) score += 20;
      
      // Zone bonus (prefer central stations)
      if (station.zone && station.zone <= 2) score += 10;
      
      return { station, score };
    });
    
    scoredStations.sort((a, b) => b.score - a.score);
    
    console.log(`🏆 Station scoring for "${originalQuery}":`, 
      scoredStations.slice(0, 3).map(s => `${s.station.commonName}: ${s.score.toFixed(1)}`));
    
    return this.formatStationResult(scoredStations[0].station);
  }

  // Format TfL station data to our standard format
  formatStationResult(station) {
  // Handle missing station data
  if (!station) {
    console.error('❌ formatStationResult received null station');
    return null;
  }
  
  const stationName = station.commonName || station.name || 'Unknown Station';
  const longitude = parseFloat(station.lon || station.longitude || 0);
  const latitude = parseFloat(station.lat || station.latitude || 0);
  
  console.log(`📍 Formatting station: ${stationName} at [${longitude}, ${latitude}]`);
  
  return {
    coordinates: [longitude, latitude],
    name: this.cleanStationName(stationName),
    type: 'station',
    confidence: 'very_high',
    source: 'tfl_station_api',
    tflData: {
      id: station.id || station.naptanId,
      naptanId: station.naptanId,
      modes: station.modes || [],
      zone: station.zone,
      lines: station.lines || []
    }
  };
}

  // Check if station name matches query
  stationNameMatches(stationName, query) {
    const station = stationName.toLowerCase();
    const q = query.toLowerCase();
    
    // Direct match
    if (station.includes(q) || q.includes(station)) return true;
    
    // Word-by-word matching
    const stationWords = station.split(' ');
    const queryWords = q.split(' ');
    
    return queryWords.every(qw => 
      stationWords.some(sw => sw.includes(qw) || qw.includes(sw))
    );
  }

  // EXISTING METHODS (updated to use manual database instead of full database)
  findManualMatch(normalizedInput) {
    // Check areas
    if (this.manualDatabase.areas[normalizedInput]) {
      const area = this.manualDatabase.areas[normalizedInput];
      return {
        coordinates: area.coords,
        name: this.toTitleCase(normalizedInput),
        type: area.type,
        confidence: 'very_high',
        source: 'manual_area_match',
        nearestStation: area.station
      };
    }
    
    // Check aliases
    if (this.manualDatabase.aliases[normalizedInput]) {
      const aliasTarget = this.manualDatabase.aliases[normalizedInput];
      console.log(`🔄 ALIAS REDIRECT: "${normalizedInput}" → "${aliasTarget}"`);
      return this.findManualMatch(aliasTarget);
    }
    
    // Check postcodes
    const postcodePattern = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/gi;
    const matches = normalizedInput.match(postcodePattern);
    
    if (matches) {
      for (const postcode of matches) {
        const postcodeUpper = postcode.toUpperCase();
        const shortPostcode = postcodeUpper.replace(/\d[A-Z]{2}$/, '');
        
        if (this.manualDatabase.postcodes[postcodeUpper] || this.manualDatabase.postcodes[shortPostcode]) {
          const targetArea = this.manualDatabase.postcodes[postcodeUpper] || this.manualDatabase.postcodes[shortPostcode];
          console.log(`📮 POSTCODE REDIRECT: "${postcodeUpper}" → "${targetArea}"`);
          return this.findManualMatch(targetArea);
        }
      }
    }
    
    return null;
  }

  findFuzzyMatch(normalizedInput) {
    const words = normalizedInput.split(' ');
    
    const allLocations = [
      ...Object.keys(this.manualDatabase.areas),
      ...Object.keys(this.manualDatabase.aliases)
    ];
    
    // Look for locations that contain all the input words
    for (const location of allLocations) {
      const locationWords = location.split(' ');
      
      const allWordsMatch = words.every(word => 
        word.length > 2 && locationWords.some(locWord => 
          locWord.includes(word) || word.includes(locWord)
        )
      );
      
      if (allWordsMatch && words.length >= 2) {
        console.log(`🎯 FUZZY MATCH: "${normalizedInput}" → "${location}"`);
        return this.findManualMatch(location);
      }
    }
    
    return null;
  }

  // Keep existing geocoding methods unchanged
  async findGeocodedMatch(normalizedInput) {
    // ... existing implementation
    if (!API_CONFIG.MAPBOX_TOKEN) {
      console.log('⚠️ No Mapbox token available for geocoding');
      return null;
    }
    
    try {
      console.log(`🌍 GEOCODING: "${normalizedInput}" with London constraints`);
      
      const fetch = (await import('node-fetch')).default;
      
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(normalizedInput)}.json?` +
        `access_token=${API_CONFIG.MAPBOX_TOKEN}&` +
        `country=GB&` +
        `bbox=-0.51,51.28,0.33,51.70&` +
        `proximity=-0.1278,51.5074&` +
        `types=place,postcode,address,poi,neighborhood&` +
        `limit=10`;
      
      const response = await fetch(url);
      if (!response.ok) return null;
      
      const data = await response.json();
      const londonResult = this.findBestLondonResult(data.features, normalizedInput);
      
      return londonResult;
      
    } catch (error) {
      console.error('🚨 Geocoding failed:', error.message);
      return null;
    }
  }

  // Keep existing helper methods
  normalizeInput(input) {
    return input.toLowerCase()
      .trim()
      .replace(/[^\w\s'-]/g, '')
      .replace(/\s+/g, ' ');
  }

  cleanStationName(name) {
  // Handle undefined/null names
  if (!name || typeof name !== 'string') {
    console.warn('⚠️ cleanStationName received invalid name:', name);
    return 'Unknown Station';
  }
  
  return name
    .replace(/ Station$/, '')
    .replace(/ Underground Station$/, '')
    .replace(/ Rail Station$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

  isInLondonBounds(coordinates) {
    const [lng, lat] = coordinates;
    const bounds = this.londonBounds.strict;
    
    return lat >= bounds.minLat && 
           lat <= bounds.maxLat &&
           lng >= bounds.minLng && 
           lng <= bounds.maxLng;
  }

  toTitleCase(str) {
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }

  findBestLondonResult(features, originalInput) {
    // ... existing implementation from previous version
    if (!features || features.length === 0) return null;
    
    const scoredResults = features
      .map(feature => this.scoreGeocodingResult(feature, originalInput))
      .filter(result => result.isLondon)
      .sort((a, b) => b.score - a.score);
    
    if (scoredResults.length === 0) return null;
    
    const best = scoredResults[0];
    
    return {
      coordinates: best.feature.center,
      name: this.cleanLocationName(best.feature.text || best.feature.place_name),
      type: 'geocoded',
      confidence: best.score > 80 ? 'high' : (best.score > 60 ? 'medium' : 'low'),
      source: 'mapbox_geocoding',
      fullData: best.feature
    };
  }

  scoreGeocodingResult(feature, originalInput) {
    let score = 0;
    let isLondon = false;
    
    const [lng, lat] = feature.center;
    const name = (feature.place_name || '').toLowerCase();
    
    if (this.isInLondonBounds(feature.center)) {
      isLondon = true;
      score += 50;
    }
    
    const context = feature.context || [];
    const londonIndicators = ['london', 'greater london', 'england', 'united kingdom'];
    for (const ctx of context) {
      const ctxText = (ctx.text || '').toLowerCase();
      if (londonIndicators.some(indicator => ctxText.includes(indicator))) {
        isLondon = true;
        score += 20;
      }
    }
    
    score += (feature.relevance || 0) * 20;
    
    if (name.includes('brentwood') || name.includes('essex') || name.includes('hertfordshire')) {
      score = 0;
      isLondon = false;
    }
    
    return { feature, score, isLondon };
  }

  cleanLocationName(name) {
    if (!name) return 'Unknown Location';
    
    return name
      .replace(/,.*$/, '')
      .replace(/\b(Station|Underground|Tube|Rail)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Initialize the resolver
const enhancedLondonResolver = new EnhancedLondonLocationResolver();
const locationNameCache = new Map();

// Middleware
app.use(helmet());
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Access-Control-Allow-Origin'],
  optionsSuccessStatus: 200
}));
// Additional CORS handling for preflight requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many search requests, please try again in a minute.',
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const redisStatus = await redis.ping();
    const hasMapboxKey = !!API_CONFIG.MAPBOX_TOKEN;
    const hasTflKey = !!API_CONFIG.TFL_API_KEY;
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        redis: 'mock (no cache)',
        mapbox: hasMapboxKey ? 'configured' : 'missing key',
        tfl: hasTflKey ? 'configured' : 'missing key'
      },
      version: '1.0.0'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Location suggestions endpoint
app.get('/api/locations/suggestions', async (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json({ suggestions: [] });
    }

    if (!API_CONFIG.MAPBOX_TOKEN) {
      return res.status(500).json({ error: 'Mapbox API key not configured' });
    }

    // Call Mapbox Geocoding API (no caching for now)
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?` +
      `access_token=${API_CONFIG.MAPBOX_TOKEN}&` +
      `country=GB&` +
      `proximity=-0.1278,51.5074&` +
      `bbox=-0.51,51.28,0.33,51.70&` +
      `types=place,postcode,address,poi&` +
      `limit=5`
    );

    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.status}`);
    }

    const data = await response.json();
    const suggestions = data.features.map(feature => ({
      name: feature.place_name,
      coordinates: feature.center,
      type: feature.place_type[0]
    }));

    const result = { suggestions };
    res.json(result);

  } catch (error) {
    console.error('Location suggestions error:', error);
    res.status(500).json({ 
      error: 'Failed to get location suggestions',
      details: error.message 
    });
  }
});

// Main search endpoint - FIXED VERSION
app.post('/api/search/meeting-spots', async (req, res) => {
  console.log('\n=== NEW SEARCH REQUEST ===');
  console.log('Request body:', req.body);

  try {
    const { location1, location2, venueTypes = [] } = req.body;

    if (!location1 || !location2) {
      return res.status(400).json({
        success: false,
        error: 'Both location1 and location2 are required'
      });
    }

    console.log('Step 1: Resolving input locations...');
    console.log(`Input: "${location1}" and "${location2}"`);

    // ENHANCED: Resolve both locations to precise coordinates
    const [resolvedLocation1, resolvedLocation2] = await Promise.all([
      resolveLocationToCoordinates(location1),
      resolveLocationToCoordinates(location2)
    ]);

    console.log('Step 2: Location resolution results:');
    console.log(`Location 1: "${location1}" -> ${resolvedLocation1.name} at [${resolvedLocation1.coordinates}] (${resolvedLocation1.confidence} confidence)`);
    console.log(`Location 2: "${location2}" -> ${resolvedLocation2.name} at [${resolvedLocation2.coordinates}] (${resolvedLocation2.confidence} confidence)`);

    // Validate that coordinates are in London
    if (!isInLondon(resolvedLocation1.coordinates) || !isInLondon(resolvedLocation2.coordinates)) {
      throw new Error('One or both locations are outside London area');
    }

    console.log('Step 3: Running algorithm with resolved coordinates...');
console.log(`Coordinates 1: [${resolvedLocation1.coordinates}]`);
console.log(`Coordinates 2: [${resolvedLocation2.coordinates}]`);

// Run the algorithm with precise coordinates and original location names
const results = await findOptimalMeetingSpots(
  resolvedLocation1.coordinates,
  resolvedLocation2.coordinates,
  null, // meetingTime
  location1, // Pass original input
  location2  // Pass original input
);

    console.log('Step 4: Processing results...');
    
    // Add metadata about the resolved locations
    const enhancedResults = results.map((result, index) => ({
      ...result,
      rank: index + 1,
      // Include resolved location names for better journey planning
      resolvedLocations: {
        location1: resolvedLocation1,
        location2: resolvedLocation2
      }
    }));

    console.log('Step 5: Sending successful response');
    console.log(`Found ${enhancedResults.length} meeting spots:`, enhancedResults.map(r => r.name));

    res.json({
      success: true,
      results: enhancedResults,
      metadata: {
        searchLocations: {
          input1: location1,
          resolved1: resolvedLocation1.name,
          input2: location2,
          resolved2: resolvedLocation2.name
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    
    // Provide specific error messages for common issues
    let errorMessage = error.message;
    if (error.message.includes('Could not find location')) {
      errorMessage = `Could not find one of the locations. Please try being more specific (e.g., "Acton Central" instead of "Acton" or include postcode).`;
    } else if (error.message.includes('outside London')) {
      errorMessage = 'Please enter locations within the London area.';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});



// ADD this helper function to validate London boundaries
function isInLondon(coordinates) {
  const [lng, lat] = coordinates;
  
  // Greater London bounds with some tolerance
  const londonBounds = {
    minLat: 51.28,   // South London
    maxLat: 51.70,   // North London  
    minLng: -0.51,   // West London
    maxLng: 0.33     // East London
  };
  
  return lat >= londonBounds.minLat && 
         lat <= londonBounds.maxLat &&
         lng >= londonBounds.minLng && 
         lng <= londonBounds.maxLng;
}

// FIXED: Move geocodeLocation function outside the endpoint where it belongs
async function geocodeLocation(locationName) {
  console.log('Geocoding location:', locationName);
  const cacheKey = `geocode:${locationName.toLowerCase()}`;
  
  const cached = await redis.get(cacheKey);
  if (cached) {
    const data = JSON.parse(cached);
    return data.coordinates;
  }

  const fetch = (await import('node-fetch')).default;
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locationName)}.json?` +
    `access_token=${API_CONFIG.MAPBOX_TOKEN}&` +
    `country=GB&` +
    `proximity=-0.1278,51.5074&` +  // Central London
    `bbox=-0.51,51.28,0.33,51.70&` +  // London bounding box
    `limit=1`
  );

  if (!response.ok) {
    throw new Error(`Failed to geocode ${locationName}`);
  }

  const data = await response.json();
  if (data.features.length === 0) {
    throw new Error(`Could not find location: ${locationName} in London area`);
  }

  // Validate result is in London area
  const coords = data.features[0].center;
  const londonBounds = {
    minLat: 51.28, maxLat: 51.70,
    minLng: -0.51, maxLng: 0.33
  };
  
  if (coords[1] < londonBounds.minLat || coords[1] > londonBounds.maxLat ||
      coords[0] < londonBounds.minLng || coords[0] > londonBounds.maxLng) {
    throw new Error(`${locationName} appears to be outside the London area. Please use a London location.`);
  }

  const result = {
    name: data.features[0].place_name,
    coordinates: coords
  };
  
  await redis.setEx(cacheKey, API_CONFIG.CACHE_TTL.GEOCODING, JSON.stringify(result));
  return result.coordinates;
}

// Algorithm implementation
// PERFORMANCE-OPTIMIZED MEETING SPOT ALGORITHM
// This replaces the existing findOptimalMeetingSpots function

// HYBRID MEETING POINT ALGORITHM
// Combines intersection-based and direct-route-based meeting point discovery

async function findOptimalMeetingSpots(coords1, coords2, meetingTime = null, originalLocation1 = null, originalLocation2 = null) {
  console.log('Starting HYBRID algorithm (intersection + direct route)...');
  const startTime = Date.now();
  
  if (!Array.isArray(coords1) || !Array.isArray(coords2)) {
    throw new Error('Algorithm requires coordinate arrays, not location names');
  }
  
  console.log('Using coordinates:', { coords1, coords2 });
  
  // PHASE 1: DIRECT ROUTE ANALYSIS (New!)
  console.log('🚂 PHASE 1: Analyzing direct route between starting points...');
  const directRouteCandidates = await findDirectRouteMeetingPoints(coords1, coords2);
  
  // PHASE 2: INTERSECTION ANALYSIS (Existing, but optimized)
  console.log('🔄 PHASE 2: Finding mutually accessible areas...');
  const intersectionCandidates = await collectAreasWithEarlyTermination(coords1, coords2);
  
  // PHASE 3: COMBINE AND DEDUPLICATE CANDIDATES
  const allCandidates = combineAndDeduplicateCandidates(directRouteCandidates, intersectionCandidates);
  console.log(`🎯 Combined candidates: ${allCandidates.length} areas (${directRouteCandidates.length} direct + ${intersectionCandidates.length} intersection)`);
  
  if (allCandidates.length === 0) {
    console.log('No candidates found, trying fallback...');
    return await fallbackGeographicAnalysis(coords1, coords2, meetingTime, originalLocation1, originalLocation2);
  }
  
  // PHASE 4: SMART PRE-FILTERING
  const preFilteredAreas = await preFilterAreas(allCandidates, coords1, coords2);
  
  // PHASE 5: PARALLEL JOURNEY ANALYSIS
  const analyzedAreas = await parallelJourneyAnalysis(preFilteredAreas, coords1, coords2, meetingTime, originalLocation1, originalLocation2);
  
  if (analyzedAreas.length === 0) {
    throw new Error('No viable meeting areas found after analysis');
  }
  
  // PHASE 6: ENHANCED SCORING (considers route type)
  const scoredAreas = analyzedAreas.map(area => ({
    ...area,
    score: calculateEnhancedAreaScore(area),
    routeType: area.routeType || 'intersection' // Track how we found this area
  }));
  
  scoredAreas.sort((a, b) => b.score - a.score);
  const diverseResults = selectDiverseAreas(scoredAreas, 3);
  
  const totalTime = Date.now() - startTime;
  console.log(`🚀 Hybrid algorithm completed in ${totalTime}ms`);
  console.log('Final results:', diverseResults.map(r => `${r.name} (${r.routeType}, ${r.averageTime}min avg)`));
  
  return diverseResults;
}

// NEW: DIRECT ROUTE MEETING POINT DISCOVERY
async function findDirectRouteMeetingPoints(coords1, coords2) {
  console.log('🗺️ Analyzing direct route between starting points...');
  
  try {
    // Step 1: Get the direct journey between the two points
    const directJourney = await getDirectJourney(coords1, coords2);
    
    if (!directJourney || !directJourney.legs) {
      console.log('❌ No direct journey found');
      return [];
    }
    
    console.log(`📍 Direct journey found: ${directJourney.duration} minutes, ${directJourney.legs.length} legs`);
    
    // Step 2: Extract stations along the route
    const routeStations = extractStationsFromJourney(directJourney);
    console.log(`🚉 Found ${routeStations.length} stations along direct route:`, routeStations.map(s => s.name));
    
    // Step 3: Find optimal midpoint stations
    const midpointCandidates = findOptimalMidpointStations(routeStations, directJourney.duration);
    console.log(`🎯 Selected ${midpointCandidates.length} midpoint candidates:`, midpointCandidates.map(s => s.name));
    
    // Step 4: Convert to meeting area format
    const meetingAreas = await convertStationsToMeetingAreas(midpointCandidates);
    
    return meetingAreas.map(area => ({ ...area, routeType: 'direct_route' }));
    
  } catch (error) {
    console.error('❌ Direct route analysis failed:', error.message);
    return [];
  }
}

// Get direct journey using TfL API
async function getDirectJourney(fromCoords, toCoords) {
  if (!API_CONFIG.TFL_API_KEY) {
    console.log('⚠️ No TfL API key available');
    return null;
  }
  
  try {
    const tflUrl = `https://api.tfl.gov.uk/Journey/JourneyResults/${fromCoords[1]},${fromCoords[0]}/to/${toCoords[1]},${toCoords[0]}?` +
      `mode=tube,bus,national-rail,dlr,overground,elizabeth-line&` +
      `journeyPreference=LeastTime&` +
      `app_key=${API_CONFIG.TFL_API_KEY}`;
    
    console.log('🔍 Getting direct journey from TfL...');
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(tflUrl);
    
    if (!response.ok) {
      throw new Error(`TfL API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.journeys || data.journeys.length === 0) {
      return null;
    }
    
    // Return the fastest journey
    return data.journeys[0];
    
  } catch (error) {
    console.error('Direct journey request failed:', error.message);
    return null;
  }
}

// Extract stations from a TfL journey
function extractStationsFromJourney(journey) {
  const stations = [];
  
  if (!journey.legs) return stations;
  
  journey.legs.forEach(leg => {
    // Add departure point
    if (leg.departurePoint && leg.departurePoint.commonName) {
      stations.push({
        name: leg.departurePoint.commonName,
        coordinates: [leg.departurePoint.lat, leg.departurePoint.lon],
        naptanId: leg.departurePoint.naptanId,
        legDuration: leg.duration,
        mode: leg.mode?.name
      });
    }
    
    // Add arrival point
    if (leg.arrivalPoint && leg.arrivalPoint.commonName) {
      stations.push({
        name: leg.arrivalPoint.commonName,
        coordinates: [leg.arrivalPoint.lat, leg.arrivalPoint.lon],
        naptanId: leg.arrivalPoint.naptanId,
        legDuration: leg.duration,
        mode: leg.mode?.name
      });
    }
    
    // Add intermediate stops if available
    if (leg.path && leg.path.stopPoints) {
      leg.path.stopPoints.forEach(stop => {
        if (stop.name && stop.lat && stop.lon) {
          stations.push({
            name: stop.name,
            coordinates: [stop.lat, stop.lon],
            naptanId: stop.naptanId,
            legDuration: leg.duration,
            mode: leg.mode?.name,
            isIntermediate: true
          });
        }
      });
    }
  });
  
  // Remove duplicates and clean up
  const uniqueStations = [];
  const seen = new Set();
  
  stations.forEach(station => {
    const key = `${station.name}_${station.coordinates[0].toFixed(4)}_${station.coordinates[1].toFixed(4)}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueStations.push(station);
    }
  });
  
  return uniqueStations;
}

// Find optimal midpoint stations along the route
function findOptimalMidpointStations(stations, totalJourneyTime) {
  if (stations.length < 3) return []; // Need at least start, middle, end
  
  const targetTime = totalJourneyTime / 2; // Aim for midpoint in time
  const candidates = [];
  
  // Score stations based on how close they are to the temporal midpoint
  stations.forEach((station, index) => {
    // Estimate time to this station (rough approximation)
    const estimatedTimeToStation = (index / stations.length) * totalJourneyTime;
    const timeDeviation = Math.abs(estimatedTimeToStation - targetTime);
    
    // Prefer major stations/interchanges
    const isMajorStation = checkIfMajorStation(station.name);
    const isInterchange = station.mode && ['tube', 'national-rail', 'elizabeth-line'].includes(station.mode);
    
    let score = 100 - timeDeviation; // Closer to midpoint = higher score
    if (isMajorStation) score += 20;
    if (isInterchange) score += 15;
    if (station.isIntermediate) score -= 5; // Slight preference for terminus stations
    
    candidates.push({
      ...station,
      score,
      estimatedTimeToStation,
      timeDeviation
    });
  });
  
  // Sort by score and return top candidates
  candidates.sort((a, b) => b.score - a.score);
  
  // Return top 3-5 candidates, but ensure they're spread out
  const selected = [];
  const minDistance = 0.01; // ~1km minimum separation
  
  for (const candidate of candidates) {
    const tooClose = selected.some(s => 
      Math.abs(s.coordinates[0] - candidate.coordinates[0]) < minDistance &&
      Math.abs(s.coordinates[1] - candidate.coordinates[1]) < minDistance
    );
    
    if (!tooClose) {
      selected.push(candidate);
      if (selected.length >= 5) break;
    }
  }
  
  console.log('🎯 Midpoint station scoring:', selected.map(s => `${s.name}: ${s.score.toFixed(1)}`));
  
  return selected;
}

// Check if a station name indicates a major station
function checkIfMajorStation(stationName) {
  const majorStations = [
    'paddington', 'victoria', 'waterloo', 'london bridge', 'liverpool street',
    'kings cross', 'euston', 'marylebone', 'charing cross', 'cannon street',
    'moorgate', 'bank', 'oxford circus', 'bond street', 'green park',
    'piccadilly circus', 'leicester square', 'tottenham court road',
    'warren street', 'baker street', 'edgware road', 'westminster'
  ];
  
  const lowerName = stationName.toLowerCase();
  return majorStations.some(major => lowerName.includes(major));
}

// Convert stations to meeting area format
async function convertStationsToMeetingAreas(stations) {
  const meetingAreas = [];
  
  for (const station of stations) {
    // Try to match with existing LONDON_MEETING_AREAS first
    const existingArea = LONDON_MEETING_AREAS.find(area => 
      area.name.toLowerCase().includes(station.name.toLowerCase()) ||
      station.name.toLowerCase().includes(area.name.toLowerCase())
    );
    
    if (existingArea) {
      meetingAreas.push(existingArea);
    } else {
      // Create new meeting area from station
      meetingAreas.push({
        name: cleanStationName(station.name),
        coordinates: [station.coordinates[1], station.coordinates[0]], // Swap to [lng, lat]
        type: 'station',
        zones: estimateZoneFromCoordinates(station.coordinates),
        routeType: 'direct_route'
      });
    }
  }
  
  return meetingAreas;
}

function cleanStationName(name) {
  return name
    .replace(/ Station$/, '')
    .replace(/ Underground Station$/, '')
    .replace(/ Rail Station$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function estimateZoneFromCoordinates(coords) {
  const [lat, lng] = coords;
  
  // Very rough zone estimation based on distance from central London
  const centralLondon = [51.5074, -0.1278];
  const distance = Math.sqrt(
    Math.pow(lat - centralLondon[0], 2) + Math.pow(lng - centralLondon[1], 2)
  );
  
  if (distance < 0.05) return [1];        // ~5km from center
  if (distance < 0.15) return [1, 2];     // ~15km from center  
  if (distance < 0.25) return [2, 3];     // ~25km from center
  return [3, 4];                          // Further out
}

// COMBINE AND DEDUPLICATE CANDIDATES
function combineAndDeduplicateCandidates(directCandidates, intersectionCandidates) {
  console.log(`🔀 Combining candidates: ${directCandidates.length} direct + ${intersectionCandidates.length} intersection`);
  
  const combined = [...directCandidates];
  const seenNames = new Set(directCandidates.map(c => c.name.toLowerCase()));
  
  // Add intersection candidates that aren't already included
  intersectionCandidates.forEach(candidate => {
    const nameLower = candidate.name.toLowerCase();
    if (!seenNames.has(nameLower)) {
      seenNames.add(nameLower);
      combined.push({ ...candidate, routeType: 'intersection' });
    }
  });
  
  console.log(`✅ Combined ${combined.length} unique candidates`);
  return combined;
}

// ENHANCED SCORING that considers route type
function calculateEnhancedAreaScore(area) {
  const baseScore = calculateAreaConvenienceScore(area);
  
  // Bonus for direct route solutions (they're often more intuitive)
  if (area.routeType === 'direct_route') {
    // Bigger bonus for faster average times (direct routes should be fast)
    if (area.averageTime <= 20) {
      return baseScore + 15; // Significant bonus for fast direct routes
    } else if (area.averageTime <= 30) {
      return baseScore + 8;  // Moderate bonus
    } else {
      return baseScore + 3;  // Small bonus (direct but slow)
    }
  }
  
  return baseScore;
}

// PHASE 1: SMART EARLY TERMINATION ISOCHRONE COLLECTION
async function collectAreasWithEarlyTermination(coords1, coords2) {
  const timeIntervals = [20, 30, 45, 60];
  let accessibleAreas = new Set();
  
  for (const timeMinutes of timeIntervals) {
    console.log(`🔍 Checking ${timeMinutes}-minute accessibility...`);
    
    try {
      const [isochrone1, isochrone2] = await Promise.all([
        getIsochrone(coords1, timeMinutes),
        getIsochrone(coords2, timeMinutes)
      ]);

      const mutuallyAccessible = LONDON_MEETING_AREAS.filter(area => {
        const point = area.coordinates;
        return isPointInPolygon(point, isochrone1.geometry.coordinates[0]) &&
               isPointInPolygon(point, isochrone2.geometry.coordinates[0]);
      });

      mutuallyAccessible.forEach(area => {
        accessibleAreas.add(`${area.name}:${timeMinutes}`);
      });

      console.log(`📍 Found ${mutuallyAccessible.length} new areas (${accessibleAreas.size} total)`);
      
      // SMART EARLY TERMINATION LOGIC
      if (timeMinutes === 20 && accessibleAreas.size >= 6) {
        console.log(`🚀 EARLY TERMINATION: Found ${accessibleAreas.size} areas in 20 minutes - sufficient for analysis`);
        break;
      }
      
      if (timeMinutes === 30 && accessibleAreas.size >= 8) {
        console.log(`🚀 EARLY TERMINATION: Found ${accessibleAreas.size} areas in 30 minutes - sufficient for analysis`);
        break;
      }
      
      if (timeMinutes === 45 && accessibleAreas.size >= 12) {
        console.log(`🚀 EARLY TERMINATION: Found ${accessibleAreas.size} areas in 45 minutes - more than sufficient`);
        break;
      }
      
      // If we have very few results, continue to next time interval
      if (accessibleAreas.size < 3) {
        console.log(`⏭️ Only ${accessibleAreas.size} areas found, continuing to next time interval...`);
        continue;
      }
      
    } catch (error) {
      console.error(`❌ Error checking ${timeMinutes}-minute accessibility:`, error);
      continue;
    }
  }
  
  // Extract unique areas
  const uniqueAreas = [...new Set(Array.from(accessibleAreas).map(item => item.split(':')[0]))];
  return uniqueAreas.map(name => 
    LONDON_MEETING_AREAS.find(area => area.name === name)
  ).filter(Boolean);
}

// PHASE 2: FAST PRE-FILTERING USING DISTANCE ESTIMATION
async function preFilterAreas(areas, coords1, coords2) {
  console.log(`🎯 Pre-filtering ${areas.length} areas using distance estimation...`);
  
  const scoredAreas = areas.map(area => {
    const distance1 = getDistance(coords1, area.coordinates);
    const distance2 = getDistance(coords2, area.coordinates);
    
    // Fast estimation: 2km = ~15min by public transport in London
    const estimatedTime1 = Math.min(8 + (distance1 / 1000) * 7, 60);
    const estimatedTime2 = Math.min(8 + (distance2 / 1000) * 7, 60);
    const avgTime = (estimatedTime1 + estimatedTime2) / 2;
    const timeDiff = Math.abs(estimatedTime1 - estimatedTime2);
    
    // Quick scoring for pre-filtering
    let quickScore = 100 - avgTime; // Prefer shorter average times
    quickScore -= timeDiff * 0.5;   // Small fairness penalty
    
    // Zone bonus (central areas are generally better connected)
    if (area.zones && area.zones.includes(1)) quickScore += 10;
    if (area.type === 'major_station') quickScore += 8;
    
    return {
      area,
      quickScore,
      estimatedAvgTime: avgTime,
      estimatedTimeDiff: timeDiff
    };
  });
  
  // Sort by quick score and take top candidates
  scoredAreas.sort((a, b) => b.quickScore - a.quickScore);
  
  // Take top 8-12 areas, but ensure we have some variety
  const maxAreas = Math.min(Math.max(8, Math.floor(areas.length * 0.6)), 12);
  const selectedAreas = scoredAreas.slice(0, maxAreas).map(item => item.area);
  
  console.log(`✅ Pre-filtering selected ${selectedAreas.length} areas:`, 
    selectedAreas.map(a => a.name).join(', '));
  
  return selectedAreas;
}

// PHASE 3: PARALLEL JOURNEY ANALYSIS
async function parallelJourneyAnalysis(areas, coords1, coords2, meetingTime, originalLocation1, originalLocation2) {
  console.log(`🚀 Starting PARALLEL analysis of ${areas.length} areas...`);
  const startTime = Date.now();
  
  // Process areas in parallel batches to avoid overwhelming the TfL API
  const BATCH_SIZE = 3; // Analyze 3 areas simultaneously
  const batches = chunkArray(areas, BATCH_SIZE);
  const analyzedAreas = [];
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batch.map(a => a.name).join(', ')})...`);
    
    // Analyze areas in this batch in parallel
    const batchPromises = batch.map(async (area) => {
      try {
        const journeyDetails = await analyzeJourneyDetailsWithIntegration(
          coords1, 
          coords2, 
          area, 
          meetingTime,
          originalLocation1,
          originalLocation2
        );
        
        if (journeyDetails && journeyDetails.journey1.duration <= 60 && journeyDetails.journey2.duration <= 60) {
          return {
            name: area.name,
            coordinates: area.coordinates,
            type: area.type,
            zones: area.zones,
            ...journeyDetails
          };
        }
        return null;
      } catch (error) {
        console.warn(`⚠️ Failed to analyze ${area.name}:`, error.message);
        return null;
      }
    });
    
    // Wait for all areas in this batch to complete
    const batchResults = await Promise.all(batchPromises);
    const validResults = batchResults.filter(result => result !== null);
    
    analyzedAreas.push(...validResults);
    console.log(`✅ Batch ${i + 1} completed: ${validResults.length}/${batch.length} areas analyzed successfully`);
    
    // Small delay between batches to be respectful to TfL API
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
    }
  }
  
  const analysisTime = Date.now() - startTime;
  console.log(`🎯 Parallel analysis completed in ${analysisTime}ms: ${analyzedAreas.length} viable areas found`);
  
  return analyzedAreas;
}

// UTILITY: Chunk array into batches
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// ENHANCED FALLBACK WITH PERFORMANCE OPTIMIZATION
async function fallbackGeographicAnalysis(coords1, coords2, meetingTime, originalLocation1 = null, originalLocation2 = null) {
  console.log('🔄 Running OPTIMIZED fallback geographic analysis...');
  
  const midpoint = [
    (coords1[0] + coords2[0]) / 2,
    (coords1[1] + coords2[1]) / 2
  ];
  
  // Get nearest areas to midpoint, but limit to reasonable number
  const nearbyAreas = LONDON_MEETING_AREAS
    .map(area => ({
      ...area,
      distanceFromMidpoint: getDistance(area.coordinates, midpoint)
    }))
    .sort((a, b) => a.distanceFromMidpoint - b.distanceFromMidpoint)
    .slice(0, 8); // Only analyze top 8 nearest areas
  
  console.log('🎯 Analyzing nearest areas to midpoint:', nearbyAreas.map(a => a.name));
  
  // Use parallel analysis for fallback too
  return await parallelJourneyAnalysis(nearbyAreas, coords1, coords2, meetingTime, originalLocation1, originalLocation2);
}

// PERFORMANCE MONITORING: Add timing logs to key functions
const originalAnalyzeJourneyDetails = analyzeJourneyDetailsWithIntegration;
analyzeJourneyDetailsWithIntegration = async function(...args) {
  const start = Date.now();
  const result = await originalAnalyzeJourneyDetails.apply(this, args);
  const duration = Date.now() - start;
  console.log(`⏱️ Journey analysis for ${args[2]?.name || 'unknown'}: ${duration}ms`);
  return result;
};

async function getIsochrone(coordinates, timeMinutes) {
  console.log(`Getting ${timeMinutes}-minute isochrone for:`, coordinates);
  const fetch = (await import('node-fetch')).default;
  // Use driving isochrone as a proxy for public transport accessibility in London
const response = await fetch(
  `https://api.mapbox.com/isochrone/v1/mapbox/driving/${coordinates[0]},${coordinates[1]}?` +
  `contours_minutes=${timeMinutes}&` +
  `polygons=true&` +
  `access_token=${API_CONFIG.MAPBOX_TOKEN}`
);

console.log(`Isochrone request for ${timeMinutes} mins from [${coordinates}]: ${response.status}`);

  if (!response.ok) {
    throw new Error(`Isochrone API failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data.features || data.features.length === 0) {
    throw new Error('No isochrone data returned');
  }

  return data.features[0];
}

function findIsochroneIntersections(isochrone1, isochrone2) {
  const coords1 = isochrone1.geometry.coordinates[0];
  const coords2 = isochrone2.geometry.coordinates[0];

  const intersections = [];
  const gridSize = 0.001;

  const bounds1 = getBounds(coords1);
  const bounds2 = getBounds(coords2);

  const intersectBounds = {
    minLng: Math.max(bounds1.minLng, bounds2.minLng),
    maxLng: Math.min(bounds1.maxLng, bounds2.maxLng),
    minLat: Math.max(bounds1.minLat, bounds2.minLat),
    maxLat: Math.min(bounds1.maxLat, bounds2.maxLat)
  };

  if (intersectBounds.minLng >= intersectBounds.maxLng || 
      intersectBounds.minLat >= intersectBounds.maxLat) {
    return [];
  }

  for (let lng = intersectBounds.minLng; lng <= intersectBounds.maxLng; lng += gridSize) {
    for (let lat = intersectBounds.minLat; lat <= intersectBounds.maxLat; lat += gridSize) {
      if (isPointInPolygon([lng, lat], coords1) && isPointInPolygon([lng, lat], coords2)) {
        intersections.push([lng, lat]);
      }
    }
  }

  return intersections;
}

async function analyzeJourneyDetails(coords1, coords2, meetingPoint, meetingTime = null) {
  try {
    console.log('Analyzing journey details for meeting point:', meetingPoint);
    
    // Try the complex version first, fall back to simple
    let journey1 = await getJourneyDetails(coords1, meetingPoint, meetingTime);
    let journey2 = await getJourneyDetails(coords2, meetingPoint, meetingTime);
    
    // If complex version failed, try simple version
    if (!journey1 || !journey2) {
      console.log('Complex TfL request failed, trying simple version...');
      journey1 = await getJourneyDetailsSimple(coords1, meetingPoint);
      journey2 = await getJourneyDetailsSimple(coords2, meetingPoint);
    }

    if (!journey1 || !journey2) {
      console.log('Both TfL requests failed, skipping this point');
      return null;
    }

    const result = {
      journey1,
      journey2,
      timeDifference: Math.abs(journey1.duration - journey2.duration),
      averageTime: (journey1.duration + journey2.duration) / 2
    };
    
    console.log('Journey analysis result:', result);
    return result;
  } catch (error) {
    console.error('Journey analysis failed:', error);
    return null;
  }
}

async function getEnhancedJourneyDetails(fromCoords, toCoords, meetingTime = null) {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const time = meetingTime ? 
    new Date(meetingTime).getHours().toString().padStart(2, '0') + 
    new Date(meetingTime).getMinutes().toString().padStart(2, '0') :
    hours + minutes;
  
  const tflUrl = `https://api.tfl.gov.uk/Journey/JourneyResults/${fromCoords[1]},${fromCoords[0]}/to/${toCoords[1]},${toCoords[0]}?` +
    `mode=tube,bus,national-rail,dlr,overground,elizabeth-line,walking&` +
    `time=${encodeURIComponent(time)}&` +
    `timeIs=Departing&` +
    `app_key=${API_CONFIG.TFL_API_KEY}`;
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(tflUrl);

    if (!response.ok) {
      console.error('TfL API Error:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (!data.journeys || data.journeys.length === 0) {
      return null;
    }

    const journey = data.journeys[0];
    
    return {
      duration: journey.duration,
      changes: countJourneyChanges(journey),
      route: formatJourneyRoute(journey),
      modes: getJourneyModes(journey),
      fullData: journey,
      // NEW: Enhanced journey breakdown
      steps: extractJourneySteps(journey),
      lines: extractTransportLines(journey),
      walkingTime: calculateWalkingTime(journey)
    };

  } catch (error) {
    console.error('TfL journey request failed:', error.message);
    return null;
  }
}

function extractJourneySteps(journey) {
  if (!journey.legs) return [];
  
  return journey.legs.map(leg => {
    const step = {
      mode: leg.mode.name,
      duration: Math.round(leg.duration),
      instruction: leg.instruction?.summary || '',
      departurePoint: leg.departurePoint?.commonName || '',
      arrivalPoint: leg.arrivalPoint?.commonName || ''
    };
    
    // Add line information for rail/tube modes
    if (leg.routeOptions && leg.routeOptions.length > 0) {
      const route = leg.routeOptions[0];
      step.lineName = route.name || '';
      step.lineId = route.lineIdentifier?.id || '';
      step.direction = route.directions && route.directions.length > 0 ? route.directions[0] : '';
    }
    
    return step;
  });
}

function extractTransportLines(journey) {
  if (!journey.legs) return [];
  
  const lines = [];
  journey.legs.forEach(leg => {
    if (leg.routeOptions && leg.routeOptions.length > 0) {
      const route = leg.routeOptions[0];
      if (route.name && route.name !== 'walking') {
        lines.push({
          name: route.name,
          mode: leg.mode.name,
          id: route.lineIdentifier?.id || ''
        });
      }
    }
  });
  
  return lines;
}

function calculateWalkingTime(journey) {
  if (!journey.legs) return 0;
  
  return journey.legs
    .filter(leg => leg.mode.name === 'walking')
    .reduce((total, leg) => total + leg.duration, 0);
}

async function getJourneyDetailsSimple(fromCoords, toCoords) {
  // Simplified TfL request without time and with basic modes
  const tflUrl = `https://api.tfl.gov.uk/Journey/JourneyResults/${fromCoords[1]},${fromCoords[0]}/to/${toCoords[1]},${toCoords[0]}?` +
    `app_key=${API_CONFIG.TFL_API_KEY}`;
  
  console.log('TfL Simple API Request URL:', tflUrl);
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(tflUrl);

    console.log('TfL Simple API Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('TfL Simple API Error:', errorText);
      return null;
    }

    const data = await response.json();
    console.log('TfL Simple API Success - Journey count:', data.journeys?.length || 0);
    
    if (!data.journeys || data.journeys.length === 0) {
      return null;
    }

    const journey = data.journeys[0];
    return {
      duration: journey.duration || 30, // Fallback duration
      changes: countJourneyChanges(journey),
      route: formatJourneyRoute(journey),
      modes: getJourneyModes(journey)
    };

  } catch (error) {
    console.error('TfL simple request failed:', error.message);
    return null;
  }
}

// Utility functions
function getBounds(coordinates) {
  const lngs = coordinates.map(c => c[0]);
  const lats = coordinates.map(c => c[1]);
  return {
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats)
  };
}

function isPointInPolygon(point, polygon) {
  const x = point[0], y = point[1];
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

function countJourneyChanges(journey) {
  if (!journey.legs) return 0;
  
  let changes = 0;
  for (let i = 1; i < journey.legs.length; i++) {
    const prevLeg = journey.legs[i - 1];
    const currentLeg = journey.legs[i];
    
    if (prevLeg.mode.name !== currentLeg.mode.name && 
        !(prevLeg.mode.name === 'walking' && i === 1) &&
        !(currentLeg.mode.name === 'walking' && i === journey.legs.length - 1)) {
      changes++;
    }
  }
  
  return Math.max(0, changes);
}

function formatJourneyRoute(journey) {
  if (!journey.legs) return 'Route unavailable';
  
  const routeParts = journey.legs
    .filter(leg => leg.mode.name !== 'walking' || leg.duration > 5)
    .map(leg => {
      if (leg.mode.name === 'walking') {
        return `Walk ${Math.round(leg.duration)}min`;
      }
      return `${leg.mode.name} ${Math.round(leg.duration)}min`;
    });
    
  return routeParts.join(' → ') || 'Direct route';
}

function getJourneyModes(journey) {
  if (!journey.legs) return [];
  return [...new Set(journey.legs.map(leg => leg.mode.name))];
}

function calculateConvenienceScore(point) {
  const { journey1, journey2, timeDifference, averageTime } = point;
  
  const totalChanges = journey1.changes + journey2.changes;
  
  const timeWeight = 0.4;
  const fairnessWeight = 0.3; 
  const convenienceWeight = 0.3;
  
  const timeScore = Math.max(0, (60 - averageTime) / 60 * 100);
  const fairnessScore = Math.max(0, (30 - timeDifference) / 30 * 100);
  const convenienceScore = Math.max(0, (4 - totalChanges) / 4 * 100);
  
  const finalScore = (
    timeScore * timeWeight +
    fairnessScore * fairnessWeight + 
    convenienceScore * convenienceWeight
  );
  
  return Math.round(finalScore * 10) / 10;
}

function selectDiverseLocations(scoredPoints, maxResults) {
  console.log(`Starting diversity selection from ${scoredPoints.length} points`);
  
  if (scoredPoints.length <= maxResults) {
    return scoredPoints;
  }

  // Step 1: Sort by score (best first)
  const sortedPoints = [...scoredPoints].sort((a, b) => b.score - a.score);
  
  // Step 2: Apply geographic clustering prevention
  const selected = [];
  const minDistance = 0.008; // ~800m - slightly smaller than the other algorithm for London density
  
  for (const candidate of sortedPoints) {
    // Check if this point is too close to any already selected point
    const isTooClose = selected.some(selectedPoint => {
      const latDiff = Math.abs(candidate.coordinates[1] - selectedPoint.coordinates[1]);
      const lonDiff = Math.abs(candidate.coordinates[0] - selectedPoint.coordinates[0]);
      
      // Use simple lat/lon difference for speed (like the other algorithm)
      return latDiff < minDistance && lonDiff < minDistance;
    });
    
    if (!isTooClose) {
      selected.push(candidate);
      console.log(`Selected diverse location ${selected.length}: [${candidate.coordinates.join(', ')}] (score: ${candidate.score})`);
      
      // Stop when we have enough
      if (selected.length >= maxResults) {
        break;
      }
    } else {
      console.log(`Skipped location [${candidate.coordinates.join(', ')}] - too close to existing selection`);
    }
  }
  
  // Step 3: If we still don't have enough, gradually relax the distance requirement
  if (selected.length < maxResults) {
    console.log(`Only found ${selected.length} diverse locations, relaxing distance requirement...`);
    
    const relaxedDistance = minDistance * 0.6; // Reduce to ~500m
    
    for (const candidate of sortedPoints) {
      if (selected.some(s => s.coordinates === candidate.coordinates)) {
        continue; // Skip already selected
      }
      
      const isTooClose = selected.some(selectedPoint => {
        const latDiff = Math.abs(candidate.coordinates[1] - selectedPoint.coordinates[1]);
        const lonDiff = Math.abs(candidate.coordinates[0] - selectedPoint.coordinates[0]);
        return latDiff < relaxedDistance && lonDiff < relaxedDistance;
      });
      
      if (!isTooClose) {
        selected.push(candidate);
        console.log(`Selected with relaxed distance ${selected.length}: [${candidate.coordinates.join(', ')}] (score: ${candidate.score})`);
        
        if (selected.length >= maxResults) {
          break;
        }
      }
    }
  }
  
  // Step 4: Final fallback - just take the best remaining if still not enough
  while (selected.length < maxResults && selected.length < sortedPoints.length) {
    const remaining = sortedPoints.find(p => 
      !selected.some(s => s.coordinates[0] === p.coordinates[0] && s.coordinates[1] === p.coordinates[1])
    );
    
    if (remaining) {
      selected.push(remaining);
      console.log(`Fallback selection ${selected.length}: [${remaining.coordinates.join(', ')}] (score: ${remaining.score})`);
    } else {
      break;
    }
  }
  
  return selected;
}

function getDistance(coord1, coord2) {
  const R = 6371e3;
  const φ1 = coord1[1] * Math.PI/180;
  const φ2 = coord2[1] * Math.PI/180;
  const Δφ = (coord2[1]-coord1[1]) * Math.PI/180;
  const Δλ = (coord2[0]-coord1[0]) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

async function getLocationName(coordinates) {
  const cacheKey = `${coordinates[0].toFixed(4)},${coordinates[1].toFixed(4)}`;
  
  if (locationNameCache.has(cacheKey)) {
    return locationNameCache.get(cacheKey);
  }

  try {
    const fetch = (await import('node-fetch')).default;
    
    // First try to match against our London database
    const knownLocation = findKnownLondonLocation(coordinates);
    if (knownLocation) {
      locationNameCache.set(cacheKey, knownLocation);
      return knownLocation;
    }
    
    // Fallback to Mapbox with London-specific parameters
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${coordinates[0]},${coordinates[1]}.json?` +
      `access_token=${API_CONFIG.MAPBOX_TOKEN}&` +
      `types=poi,address,neighborhood,place,postcode&` +
      `country=GB&` +
      `proximity=${coordinates[0]},${coordinates[1]}&` +
      `limit=5`
    );

    if (!response.ok) {
      const fallbackName = await generateFallbackLocationName(coordinates);
      locationNameCache.set(cacheKey, fallbackName);
      return fallbackName;
    }

    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      // Prioritize transport hubs and well-known locations
      const bestFeature = selectBestLocationFeature(data.features);
      let name = cleanLocationName(bestFeature.text || bestFeature.place_name);
      
      locationNameCache.set(cacheKey, name);
      return name;
    }
    
    const fallbackName = await generateFallbackLocationName(coordinates);
    locationNameCache.set(cacheKey, fallbackName);
    return fallbackName;
    
  } catch (error) {
    console.warn('Enhanced geocoding failed:', error);
    const fallbackName = await generateFallbackLocationName(coordinates);
    locationNameCache.set(cacheKey, fallbackName);
    return fallbackName;
  }
}

// MAIN LOCATION RESOLUTION FUNCTION - Uses the new comprehensive system
async function resolveLocationToCoordinates(locationInput) {
  try {
    return await enhancedLondonResolver.resolveLocation(locationInput);
  } catch (error) {
    console.error(`Location resolution failed for "${locationInput}":`, error.message);
    throw error;
  }
}

function findKnownLondonLocation(coordinates) {
  const [lng, lat] = coordinates;
  const threshold = 0.008; // ~800m tolerance
  
  // Check stations first
  for (const [name, [sLng, sLat]] of Object.entries(LONDON_LOCATIONS_DATABASE.stations)) {
    if (Math.abs(lng - sLng) < threshold && Math.abs(lat - sLat) < threshold) {
      return toTitleCase(name);
    }
  }
  
  // Check areas
  for (const [name, data] of Object.entries(LONDON_LOCATIONS_DATABASE.areas)) {
    const [aLng, aLat] = data.coords;
    if (Math.abs(lng - aLng) < threshold && Math.abs(lat - aLat) < threshold) {
      return toTitleCase(name);
    }
  }
  
  return null;
}

function findPartialMatch(input) {
  const words = input.split(' ');
  
  // Try matching with station names
  for (const stationName of Object.keys(LONDON_LOCATIONS_DATABASE.stations)) {
    if (stationName.includes(input) || input.includes(stationName)) {
      return stationName;
    }
    
    // Check if any word matches
    for (const word of words) {
      if (word.length > 3 && stationName.includes(word)) {
        return stationName;
      }
    }
  }
  
  // Try matching with area names
  for (const areaName of Object.keys(LONDON_LOCATIONS_DATABASE.areas)) {
    if (areaName.includes(input) || input.includes(areaName)) {
      return areaName;
    }
    
    for (const word of words) {
      if (word.length > 3 && areaName.includes(word)) {
        return areaName;
      }
    }
  }
  
  return null;
}

async function geocodeWithMapbox(locationInput) {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locationInput)}.json?` +
      `access_token=${API_CONFIG.MAPBOX_TOKEN}&` +
      `country=GB&` +
      `bbox=-0.51,51.28,0.33,51.70&` + // London bounding box
      `types=poi,address,neighborhood,place,postcode&` +
      `limit=5`
    );

    if (!response.ok) {
      throw new Error(`Mapbox geocoding failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.features || data.features.length === 0) {
      throw new Error('No locations found');
    }

    // Select the best feature (prioritize transport hubs)
    const bestFeature = selectBestLocationFeature(data.features);
    
    return {
      coordinates: bestFeature.center,
      name: cleanLocationName(bestFeature.text || bestFeature.place_name),
      type: 'geocoded',
      confidence: 'medium',
      fullData: bestFeature
    };
    
  } catch (error) {
    console.error('Mapbox geocoding failed:', error);
    throw new Error(`Could not find location: ${locationInput}`);
  }
}

function selectBestLocationFeature(features) {
  // Prioritize features by type
  const priorities = {
    'poi': 10,
    'address': 8,
    'neighborhood': 6,
    'place': 5,
    'postcode': 3
  };
  
  // Bonus for transport-related terms
  const transportTerms = ['station', 'tube', 'underground', 'rail', 'bus', 'stop'];
  
  let bestFeature = features[0];
  let bestScore = 0;
  
  for (const feature of features) {
    let score = 0;
    
    // Base score from type
    for (const type of feature.place_type) {
      score += priorities[type] || 1;
    }
    
    // Transport bonus
    const text = (feature.text || feature.place_name || '').toLowerCase();
    for (const term of transportTerms) {
      if (text.includes(term)) {
        score += 15;
        break;
      }
    }
    
    // Relevance score from Mapbox
    score += (feature.relevance || 0) * 5;
    
    if (score > bestScore) {
      bestScore = score;
      bestFeature = feature;
    }
  }
  
  return bestFeature;
}

function cleanLocationName(name) {
  if (!name) return 'Unknown Location';
  
  // Remove common suffixes that aren't useful
  const cleanName = name
    .replace(/,.*$/, '') // Remove everything after first comma
    .replace(/\b(Station|Underground|Tube|Rail)\b/gi, '') // Remove transport type words
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  return cleanName || name; // Fallback to original if cleaning resulted in empty string
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

async function generateFallbackLocationName(coordinates) {
  // Try to find nearest known location
  const [lng, lat] = coordinates;
  let nearestLocation = null;
  let minDistance = Infinity;
  
  // Check against known stations and areas
  const allLocations = {
    ...LONDON_LOCATIONS_DATABASE.stations,
    ...Object.fromEntries(
      Object.entries(LONDON_LOCATIONS_DATABASE.areas).map(([name, data]) => [name, data.coords])
    )
  };
  
  for (const [name, [nLng, nLat]] of Object.entries(allLocations)) {
    const distance = Math.sqrt(Math.pow(lng - nLng, 2) + Math.pow(lat - nLat, 2));
    if (distance < minDistance) {
      minDistance = distance;
      nearestLocation = name;
    }
  }
  
  if (nearestLocation && minDistance < 0.02) { // ~2km
    return `Near ${toTitleCase(nearestLocation)}`;
  }
  
  return `Location ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

// Error handling
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(error.status || 500).json({
    error: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// TESTING FUNCTION - Add this to test location resolution
async function testLocationResolution() {
  const testCases = [
    'Richmond',           // Should resolve to London Richmond, not Brentwood
    'Richmond London',    // Should resolve to London Richmond with high confidence
    'TW9',               // Richmond postcode
    'Borough Market',     // Should resolve correctly
    'Borough',           // Should resolve to Borough Market, not Bank
    'Bank',              // Should resolve to Bank station
    'Kensington',        // Should resolve to London Kensington
    'Kings Cross',       // Should resolve with alias
    'Angel',             // Should resolve to Angel area/station
    'Canary Wharf',      // Should resolve correctly
    'E14',               // Canary Wharf postcode
    'SW1',               // Westminster postcode
    'Wimbledon',         // Should resolve correctly
    'Invalid Location XYZ' // Should fail gracefully
  ];
  
  console.log('\n🧪 TESTING LOCATION RESOLUTION...\n');
  
  for (const testCase of testCases) {
    try {
      const result = await resolveLocationToCoordinates(testCase);
      console.log(`✅ "${testCase}" → ${result.name} [${result.coordinates}] (${result.confidence}) - ${result.source}`);
    } catch (error) {
      console.log(`❌ "${testCase}" → ERROR: ${error.message}`);
    }
  }
  
  console.log('\n🧪 TESTING COMPLETE\n');
}

// Add a simple endpoint to trigger the test
app.get('/api/test-locations', async (req, res) => {
  try {
    await testLocationResolution();
    res.json({ 
      success: true, 
      message: 'Location resolution test completed. Check server logs for results.' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Commonplace API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

async function analyzeJourneyDetailsWithIntegration(coords1, coords2, area, meetingTime = null, originalLocation1 = null, originalLocation2 = null) {
  try {
    console.log(`Analyzing journey integration for ${area.name}...`);
    
    // Use original location names if provided, otherwise resolve from coordinates
const location1Name = originalLocation1 || await getLocationName(coords1);
const location2Name = originalLocation2 || await getLocationName(coords2);

const [journey1Details, journey2Details] = await Promise.all([
  getJourneyDetailsWithIntegration(coords1, area.coordinates, meetingTime, location1Name),
  getJourneyDetailsWithIntegration(coords2, area.coordinates, meetingTime, location2Name)
]);

    if (!journey1Details || !journey2Details) {
      return null;
    }

    return {
      journey1: journey1Details,
      journey2: journey2Details,
      timeDifference: Math.abs(journey1Details.duration - journey2Details.duration),
      averageTime: (journey1Details.duration + journey2Details.duration) / 2,
      // Enhanced integration data with better naming
      integrationData: {
        area: area,
        journey1: {
          startCoords: coords1,
          endCoords: area.coordinates,
          startName: location1Name,
          endName: area.name,
          // Enhanced URL generation with proper station names
          googleMapsUrl: generateGoogleMapsUrl(
            coords1, 
            area.coordinates, 
            journey1Details.startLocationName, 
            area.name
          ),
          citymapperUrl: generateCitymapperUrl(
            coords1, 
            area.coordinates, 
            journey1Details.startLocationName, 
            area.name
          ),
          tflJourneyData: journey1Details.tflData
        },
        journey2: {
          startCoords: coords2,
          endCoords: area.coordinates,
          startName: location2Name,
          endName: area.name,
          // Enhanced URL generation with proper station names
          googleMapsUrl: generateGoogleMapsUrl(
            coords2, 
            area.coordinates, 
            journey2Details.startLocationName, 
            area.name
          ),
          citymapperUrl: generateCitymapperUrl(
            coords2, 
            area.coordinates, 
            journey2Details.startLocationName, 
            area.name
          ),
          tflJourneyData: journey2Details.tflData
        }
      }
    };

  } catch (error) {
    console.error('Journey integration analysis failed:', error);
    return null;
  }
}

async function getJourneyDetailsWithIntegration(fromCoords, toCoords, meetingTime = null, startLocationName = null) {
  const resolvedStartLocationName = startLocationName || await getLocationName(fromCoords);
  // Get enhanced TfL journey data with line details
  const journey = await getEnhancedJourneyDetails(fromCoords, toCoords, meetingTime);
  
  if (!journey) {
    return null;
  }

  return {
    duration: journey.duration,
    changes: journey.changes,
    route: journey.route,
    modes: journey.modes,
    startLocationName: resolvedStartLocationName,
    tflData: journey,
    // NEW: Add detailed journey steps for preview
    journeySteps: journey.steps,
    transportLines: journey.lines,
    walkingTime: journey.walkingTime
  };
}

function generateGoogleMapsUrl(fromCoords, toCoords, fromName, toName) {
  // Use resolved location names when available, with station context
  let origin = fromName;
  let destination = toName;
  
  // Enhance names with station context if they're transport hubs
  if (LONDON_LOCATIONS_DATABASE.stations[fromName?.toLowerCase()]) {
    origin = `${fromName} Station, London`;
  } else if (LONDON_LOCATIONS_DATABASE.areas[fromName?.toLowerCase()]?.type === 'transport') {
    origin = `${fromName} Station, London`;
  }
  
  if (LONDON_LOCATIONS_DATABASE.stations[toName?.toLowerCase()]) {
    destination = `${toName} Station, London`;
  } else if (LONDON_LOCATIONS_DATABASE.areas[toName?.toLowerCase()]?.type === 'transport') {
    destination = `${toName} Station, London`;
  }
  
  // Fallback to coordinates if names aren't available
  if (!origin || origin === 'undefined') {
    origin = `${fromCoords[1]},${fromCoords[0]}`;
  }
  if (!destination || destination === 'undefined') {
    destination = `${toCoords[1]},${toCoords[0]}`;
  }
  
  // Create clean, working Google Maps URL
  const encodedOrigin = encodeURIComponent(origin);
  const encodedDestination = encodeURIComponent(destination);
  
  return `https://www.google.com/maps/dir/${encodedOrigin}/${encodedDestination}`;
}
function generateCitymapperUrl(fromCoords, toCoords, fromName, toName) {
  const baseUrl = 'https://citymapper.com/directions';
  
  const params = new URLSearchParams({
    startcoord: `${fromCoords[1]},${fromCoords[0]}`,
    endcoord: `${toCoords[1]},${toCoords[0]}`,
    startname: fromName || 'Your Location',
    endname: toName || 'Meeting Point',
    region_id: 'uk-london'
  });
  
  return `${baseUrl}?${params.toString()}`;
}

function calculateAreaConvenienceScore(area) {
  const { journey1, journey2, timeDifference, averageTime, type, zones } = area;
  
  const totalChanges = journey1.changes + journey2.changes;
  const maxZone = Math.max(...zones);
  
  // Scoring weights
  const timeWeight = 0.35;
  const fairnessWeight = 0.25;
  const convenienceWeight = 0.25;
  const locationWeight = 0.15;
  
  // Time score (faster is better, penalty after 45 minutes)
  const timeScore = Math.max(0, (60 - averageTime) / 60 * 100);
  
  // Fairness score (smaller difference is better)
  const fairnessScore = Math.max(0, (20 - timeDifference) / 20 * 100);
  
  // Convenience score (fewer changes is better)
  const convenienceScore = Math.max(0, (4 - totalChanges) / 4 * 100);
  
  // Location score (major stations and Zone 1 get bonuses)
  let locationScore = 50;
  if (type === 'major_station') locationScore += 30;
  if (maxZone === 1) locationScore += 20;
  else if (maxZone === 2) locationScore += 10;
  
  const finalScore = (
    timeScore * timeWeight +
    fairnessScore * fairnessWeight + 
    convenienceScore * convenienceWeight +
    locationScore * locationWeight
  );
  
  return Math.round(finalScore * 10) / 10;
}

function selectDiverseAreas(scoredAreas, maxResults) {
  console.log(`Selecting diverse areas from ${scoredAreas.length} candidates`);
  
  if (scoredAreas.length <= maxResults) {
    return scoredAreas;
  }

  const selected = [];
  const minDistance = 0.02; // ~2km minimum distance between areas
  
  // Priority order: major stations > districts, higher scores first
  const prioritized = [...scoredAreas].sort((a, b) => {
    if (Math.abs(a.score - b.score) > 5) {
      return b.score - a.score;
    }
    if (a.type === 'major_station' && b.type !== 'major_station') return -1;
    if (b.type === 'major_station' && a.type !== 'major_station') return 1;
    return b.score - a.score;
  });

  for (const candidate of prioritized) {
    // Check geographic diversity
    const isTooClose = selected.some(selectedArea => {
      const distance = getDistance(candidate.coordinates, selectedArea.coordinates);
      return distance < 2000; // 2km minimum distance
    });
    
    // Check type diversity
    const sameTypeCount = selected.filter(s => s.type === candidate.type).length;
    const shouldSkipForTypeVariety = sameTypeCount >= 2 && selected.length >= 2;
    
    if (!isTooClose && !shouldSkipForTypeVariety) {
      selected.push(candidate);
      console.log(`Selected area: ${candidate.name} (${candidate.type}, score: ${candidate.score})`);
      
      if (selected.length >= maxResults) {
        break;
      }
    } else {
      const reason = isTooClose ? 'too close' : 'type diversity';
      console.log(`Skipped ${candidate.name}: ${reason}`);
    }
  }
  
  // If still need more, relax constraints
  if (selected.length < maxResults) {
    console.log(`Only found ${selected.length} diverse areas, relaxing constraints...`);
    
    for (const candidate of prioritized) {
      if (selected.some(s => s.name === candidate.name)) continue;
      
      const isTooClose = selected.some(selectedArea => {
        const distance = getDistance(candidate.coordinates, selectedArea.coordinates);
        return distance < 1000; // Relax to 1km
      });
      
      if (!isTooClose) {
        selected.push(candidate);
        console.log(`Added with relaxed constraints: ${candidate.name}`);
        
        if (selected.length >= maxResults) break;
      }
    }
  }
  
  return selected;
}

async function fallbackGeographicAnalysis(coords1, coords2, meetingTime) {
  console.log('Running fallback geographic analysis...');
  
  // Create a broader search around the midpoint
  const midpoint = [
    (coords1[0] + coords2[0]) / 2,
    (coords1[1] + coords2[1]) / 2
  ];
  
  // Find nearest predefined areas to the midpoint
  const nearbyAreas = LONDON_MEETING_AREAS
    .map(area => ({
      ...area,
      distanceFromMidpoint: getDistance(area.coordinates, midpoint)
    }))
    .sort((a, b) => a.distanceFromMidpoint - b.distanceFromMidpoint)
    .slice(0, 10);
  
  console.log('Analyzing areas near midpoint:', nearbyAreas.map(a => a.name));
  
  const analyzedAreas = [];
  for (const area of nearbyAreas) {
    try {
      const journeyDetails = await analyzeJourneyDetailsWithIntegration(coords1, coords2, area, meetingTime);
      if (journeyDetails && journeyDetails.journey1.duration <= 60 && journeyDetails.journey2.duration <= 60) {
        analyzedAreas.push({
          name: area.name,
          coordinates: area.coordinates,
          type: area.type,
          zones: area.zones,
          ...journeyDetails
        });
      }
    } catch (error) {
      console.warn(`Failed to analyze fallback area ${area.name}:`, error.message);
    }
  }
  
  if (analyzedAreas.length === 0) {
    throw new Error('No viable meeting areas found even with fallback analysis');
  }
  
  const scoredAreas = analyzedAreas.map(area => ({
    ...area,
    score: calculateAreaConvenienceScore(area)
  }));
  
  scoredAreas.sort((a, b) => b.score - a.score);
  return selectDiverseAreas(scoredAreas, 3);
}

module.exports = app;
