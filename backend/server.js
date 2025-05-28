const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

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

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'https://commonplace-app-ten.vercel.app',
    'https://commonplace-48ym45np0-matthurstsmith-gmailcoms-projects.vercel.app',
    'http://localhost:3000',
    '*'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
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
app.post('/api/search/meeting-spots', searchLimiter, async (req, res) => {
  try {
    const { location1, location2, venueTypes = [], meetingTime } = req.body;

    console.log('=== SEARCH REQUEST START ===');
    console.log('Search request received:', { location1, location2, venueTypes, meetingTime });
    
    if (!location1 || !location2) {
      return res.status(400).json({ error: 'Both locations are required' });
    }

    if (!API_CONFIG.MAPBOX_TOKEN || !API_CONFIG.TFL_API_KEY) {
      return res.status(500).json({ error: 'API keys not configured' });
    }

    console.log(`Finding meeting spots between ${location1} and ${location2}`);
    
    // Step 1: Geocode locations - FIXED: Actually call the geocoding function
    console.log('Step 1: Geocoding location1:', location1);
    const coords1 = typeof location1 === 'string' ? 
      await geocodeLocation(location1) : location1;
    console.log('coords1 result:', coords1);
    
    console.log('Step 2: Geocoding location2:', location2);
    const coords2 = typeof location2 === 'string' ? 
      await geocodeLocation(location2) : location2;
    console.log('coords2 result:', coords2);

    // Step 3: Run the algorithm
    console.log('Step 3: Starting algorithm with coordinates:', { coords1, coords2 });
    const meetingSpots = await findOptimalMeetingSpots(coords1, coords2, meetingTime);
    
    // Step 4: Get location names
    console.log('Step 4: Processing results...');
    const resultsWithNames = await Promise.all(
      meetingSpots.map(async (spot, index) => ({
        ...spot,
        rank: index + 1,
        locationName: await getLocationName(spot.coordinates)
      }))
    );

    console.log('Step 5: Sending successful response');
    res.json({
      success: true,
      results: resultsWithNames,
      metadata: {
        searchTime: new Date().toISOString(),
        location1: coords1,
        location2: coords2,
        venueTypes
      }
    });

  } catch (error) {
    console.error('=== SEARCH ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({ 
      error: 'Failed to find meeting spots',
      details: error.message 
    });
  }
});

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
// REPLACE the existing findOptimalMeetingSpots function with this:
async function findOptimalMeetingSpots(coords1, coords2, meetingTime = null) {
  console.log('Starting area-based algorithm for coordinates:', { coords1, coords2 });
  
  if (!coords1 || !coords2) {
    throw new Error('Invalid coordinates provided to algorithm');
  }
  
  if (!Array.isArray(coords1) || !Array.isArray(coords2)) {
    throw new Error('Coordinates must be arrays [lng, lat]');
  }
  
  console.log('Starting isochrone algorithm...');
  
  const timeIntervals = [20, 30, 45, 60];
  let accessibleAreas = new Set();

  for (const timeMinutes of timeIntervals) {
    console.log(`Checking ${timeMinutes}-minute accessibility...`);
    
    try {
      const [isochrone1, isochrone2] = await Promise.all([
        getIsochrone(coords1, timeMinutes),
        getIsochrone(coords2, timeMinutes)
      ]);

      // Find which predefined areas fall within both isochrones
      const mutuallyAccessible = LONDON_MEETING_AREAS.filter(area => {
        const point = area.coordinates;
        return isPointInPolygon(point, isochrone1.geometry.coordinates[0]) &&
               isPointInPolygon(point, isochrone2.geometry.coordinates[0]);
      });

      mutuallyAccessible.forEach(area => {
        accessibleAreas.add(`${area.name}:${timeMinutes}`);
      });

      console.log(`Found ${mutuallyAccessible.length} mutually accessible areas within ${timeMinutes} minutes`);
      
      if (accessibleAreas.size >= 15) {
        console.log('Sufficient accessible areas found');
        break;
      }
      
    } catch (error) {
      console.error(`Error checking ${timeMinutes}-minute accessibility:`, error);
      continue;
    }
  }

  if (accessibleAreas.size === 0) {
    console.log('No mutually accessible predefined areas found, trying fallback...');
    return await fallbackGeographicAnalysis(coords1, coords2, meetingTime);
  }

  // Extract unique areas and analyze journey details
  const uniqueAreas = [...new Set(Array.from(accessibleAreas).map(item => item.split(':')[0]))];
  const areaObjects = uniqueAreas.map(name => 
    LONDON_MEETING_AREAS.find(area => area.name === name)
  ).filter(Boolean);

  console.log(`Analyzing ${areaObjects.length} unique accessible areas:`, 
    areaObjects.map(a => a.name));

  const analyzedAreas = [];
  
  for (const area of areaObjects) {
    try {
      const journeyDetails = await analyzeJourneyDetailsWithIntegration(coords1, coords2, area, meetingTime);
      if (journeyDetails) {
        analyzedAreas.push({
          name: area.name,
          coordinates: area.coordinates,
          type: area.type,
          zones: area.zones,
          ...journeyDetails
        });
      }
    } catch (error) {
      console.warn(`Failed to analyze area ${area.name}:`, error.message);
      continue;
    }

    if (analyzedAreas.length >= 25) break;
  }

  if (analyzedAreas.length === 0) {
    throw new Error('No viable meeting areas found with journey data');
  }

  // Score and rank areas
  const scoredAreas = analyzedAreas.map(area => ({
    ...area,
    score: calculateAreaConvenienceScore(area)
  }));

  scoredAreas.sort((a, b) => b.score - a.score);

  console.log(`Scored areas:`, scoredAreas.map(a => `${a.name}: ${a.score}`));

  // Apply geographic and type diversity
  const diverseResults = selectDiverseAreas(scoredAreas, 3);
  
  console.log(`Final diverse areas selected:`, diverseResults.map(a => a.name));
  return diverseResults;
}
async function getIsochrone(coordinates, timeMinutes) {
  console.log(`Getting ${timeMinutes}-minute isochrone for:`, coordinates);
  const fetch = (await import('node-fetch')).default;
  const response = await fetch(
    `https://api.mapbox.com/isochrone/v1/mapbox/walking/${coordinates[0]},${coordinates[1]}?` +
    `contours_minutes=${timeMinutes}&` +
    `polygons=true&` +
    `access_token=${API_CONFIG.MAPBOX_TOKEN}`
  );

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
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${coordinates[0]},${coordinates[1]}.json?` +
      `access_token=${API_CONFIG.MAPBOX_TOKEN}&` +
      `types=poi,address,neighborhood,place&` +
      `limit=3`
    );

    if (!response.ok) {
      return `Location ${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`;
    }

    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      // Try to get the most specific location first
      const poi = data.features.find(f => f.place_type.includes('poi'));
      const address = data.features.find(f => f.place_type.includes('address'));
      const neighborhood = data.features.find(f => f.place_type.includes('neighborhood'));
      
      // Prefer POI, then address, then neighborhood
      const feature = poi || address || neighborhood || data.features[0];
      
      let name = feature.text || feature.place_name;
      
      // If it's just "Victoria" or similar, make it more specific
      if (name.length < 8 || name === 'Victoria') {
        // Add nearby street or area information
        const context = feature.context || [];
        const street = context.find(c => c.id.includes('address') || c.id.includes('street'));
        const area = context.find(c => c.id.includes('neighborhood') || c.id.includes('place'));
        
        if (street && street.text !== name) {
          name = `${name} (${street.text})`;
        } else if (area && area.text !== name && !area.text.includes('London')) {
          name = `${name} (${area.text})`;
        } else {
          // Add coordinates to make it unique
          name = `${name} Area (${coordinates[1].toFixed(3)}, ${coordinates[0].toFixed(3)})`;
        }
      }
      
      return name;
    }
    
    return `Meeting Point ${coordinates[1].toFixed(3)}, ${coordinates[0].toFixed(3)}`;
    
  } catch (error) {
    console.warn('Reverse geocoding failed:', error);
    return `Meeting Point ${coordinates[1].toFixed(3)}, ${coordinates[0].toFixed(3)}`;
  }
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

app.listen(PORT, () => {
  console.log(`Commonplace API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

async function analyzeJourneyDetailsWithIntegration(coords1, coords2, area, meetingTime = null) {
  try {
    console.log(`Analyzing journey integration for ${area.name}...`);
    
    // Get journey details for both routes
    const [journey1Details, journey2Details] = await Promise.all([
      getJourneyDetailsWithIntegration(coords1, area.coordinates, meetingTime),
      getJourneyDetailsWithIntegration(coords2, area.coordinates, meetingTime)
    ]);

    if (!journey1Details || !journey2Details) {
      return null;
    }

    return {
      journey1: journey1Details,
      journey2: journey2Details,
      timeDifference: Math.abs(journey1Details.duration - journey2Details.duration),
      averageTime: (journey1Details.duration + journey2Details.duration) / 2,
      // Integration data for frontend
      integrationData: {
        area: area,
        journey1: {
          startCoords: coords1,
          endCoords: area.coordinates,
          startName: journey1Details.startLocationName,
          endName: area.name,
          googleMapsUrl: generateGoogleMapsUrl(coords1, area.coordinates, journey1Details.startLocationName, area.name),
          citymapperUrl: generateCitymapperUrl(coords1, area.coordinates, journey1Details.startLocationName, area.name),
          tflJourneyData: journey1Details.tflData
        },
        journey2: {
          startCoords: coords2,
          endCoords: area.coordinates,
          startName: journey2Details.startLocationName,
          endName: area.name,
          googleMapsUrl: generateGoogleMapsUrl(coords2, area.coordinates, journey2Details.startLocationName, area.name),
          citymapperUrl: generateCitymapperUrl(coords2, area.coordinates, journey2Details.startLocationName, area.name),
          tflJourneyData: journey2Details.tflData
        }
      }
    };

  } catch (error) {
    console.error('Journey integration analysis failed:', error);
    return null;
  }
}

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
    startLocationName: startLocationName,
    tflData: journey,
    // NEW: Add detailed journey steps for preview
    journeySteps: journey.steps,
    transportLines: journey.lines,
    walkingTime: journey.walkingTime
  };
}

function generateGoogleMapsUrl(fromCoords, toCoords, fromName, toName) {
  const baseUrl = 'https://www.google.com/maps/dir/';
  
  // Use location names if available, fallback to coordinates
  const origin = fromName ? encodeURIComponent(fromName) : `${fromCoords[1]},${fromCoords[0]}`;
  const destination = toName ? encodeURIComponent(toName) : `${toCoords[1]},${toCoords[0]}`;
  
  // Add transit preference and current time
  const params = new URLSearchParams({
    api: '1',
    origin: origin,
    destination: destination,
    travelmode: 'transit',
    dir_action: 'navigate'
  });
  
  return `${baseUrl}?${params.toString()}`;
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
