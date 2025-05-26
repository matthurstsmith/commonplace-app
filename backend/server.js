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
async function findOptimalMeetingSpots(coords1, coords2, meetingTime = null) {
  console.log('findOptimalMeetingSpots called with:', { coords1, coords2, meetingTime });
  
  if (!coords1 || !coords2) {
    throw new Error('Invalid coordinates provided to algorithm');
  }
  
  if (!Array.isArray(coords1) || !Array.isArray(coords2)) {
    throw new Error('Coordinates must be arrays [lng, lat]');
  }
  
  console.log('Starting isochrone algorithm...');
  
  const timeIntervals = [20, 30, 40, 50, 60];
  let allIntersectionPoints = [];

  for (const timeMinutes of timeIntervals) {
    console.log(`Generating ${timeMinutes}-minute isochrones...`);
    
    try {
      const [isochrone1, isochrone2] = await Promise.all([
        getIsochrone(coords1, timeMinutes),
        getIsochrone(coords2, timeMinutes)
      ]);

      const intersectionPoints = findIsochroneIntersections(isochrone1, isochrone2);
      console.log(`Found ${intersectionPoints.length} intersection points for ${timeMinutes} minutes`);
      
      allIntersectionPoints.push(...intersectionPoints);

      if (allIntersectionPoints.length >= 50) {
        console.log('Sufficient intersection points found');
        break;
      }
    } catch (error) {
      console.error(`Error generating ${timeMinutes}-minute isochrones:`, error);
      continue; // Try next time interval
    }
  }

  if (allIntersectionPoints.length === 0) {
    throw new Error('No overlapping areas found within 60 minutes travel time');
  }

  // Sort by distance from center
  const center = [
    (coords1[0] + coords2[0]) / 2,
    (coords1[1] + coords2[1]) / 2
  ];

  allIntersectionPoints.sort((a, b) => 
    getDistance(a, center) - getDistance(b, center)
  );

  // Analyze candidates
  const candidatePoints = allIntersectionPoints.slice(0, 20);
  const analyzedPoints = [];

  for (const point of candidatePoints) {
    try {
      const journeyDetails = await analyzeJourneyDetails(coords1, coords2, point, meetingTime);
      if (journeyDetails) {
        analyzedPoints.push({
          coordinates: point,
          ...journeyDetails
        });
      }
    } catch (error) {
      console.warn(`Failed to analyze point ${point}:`, error.message);
      continue;
    }

    if (analyzedPoints.length >= 10) break;
  }

  if (analyzedPoints.length === 0) {
    throw new Error('No viable meeting locations found');
  }

  // Score and rank
  const scoredPoints = analyzedPoints.map(point => ({
    ...point,
    score: calculateConvenienceScore(point)
  }));

  scoredPoints.sort((a, b) => b.score - a.score);
  return scoredPoints.slice(0, 3);
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
    const [journey1, journey2] = await Promise.all([
      getJourneyDetails(coords1, meetingPoint, meetingTime),
      getJourneyDetails(coords2, meetingPoint, meetingTime)
    ]);

    if (!journey1 || !journey2) {
      return null;
    }

    return {
      journey1,
      journey2,
      timeDifference: Math.abs(journey1.duration - journey2.duration),
      averageTime: (journey1.duration + journey2.duration) / 2
    };
  } catch (error) {
    return null;
  }
}

async function getJourneyDetails(fromCoords, toCoords, meetingTime = null) {
  const time = meetingTime || new Date().toISOString();
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(
      `https://api.tfl.gov.uk/Journey/JourneyResults/${fromCoords[1]},${fromCoords[0]}/to/${toCoords[1]},${toCoords[0]}?` +
      `mode=tube,bus,national-rail,dlr,overground,tflrail,walking&` +
      `time=${encodeURIComponent(time)}&` +
      `timeIs=Departing&` +
      `app_key=${API_CONFIG.TFL_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`TfL API failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.journeys || data.journeys.length === 0) {
      return null;
    }

    const journey = data.journeys[0];
    const details = {
      duration: journey.duration,
      changes: countJourneyChanges(journey),
      route: formatJourneyRoute(journey),
      modes: getJourneyModes(journey)
    };

    return details;

  } catch (error) {
    console.warn('TfL journey request failed:', error.message);
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
      `types=poi,address,neighborhood,place`
    );

    if (!response.ok) {
      return `Location ${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`;
    }

    const data = await response.json();
    
    let locationName = `Location ${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`;
    
    if (data.features && data.features.length > 0) {
      const feature = data.features.find(f => 
        f.place_type.includes('poi') || 
        f.place_type.includes('neighborhood')
      ) || data.features[0];
      
      const name = feature.text || feature.place_name;
      const area = feature.context ? 
        feature.context.find(c => c.id.startsWith('neighborhood') || c.id.startsWith('place'))?.text : 
        null;
      
      locationName = area && area !== name ? `${name}, ${area}` : name;
    }

    return locationName;
    
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

module.exports = app;
