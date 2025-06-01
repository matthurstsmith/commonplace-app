const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

const locationNameCache = new Map();

const LONDON_LOCATIONS_DATABASE = {
  // Major areas and their precise coordinates
  areas: {
    'acton': { coords: [-0.2674, 51.5089], type: 'area', station: 'Acton Central' },
    'angel': { coords: [-0.1057, 51.5322], type: 'area', station: 'Angel' },
    'borough market': { coords: [-0.0900, 51.5055], type: 'market', station: 'London Bridge' },
    'camden': { coords: [-0.1426, 51.5390], type: 'area', station: 'Camden Town' },
    'canary wharf': { coords: [-0.0235, 51.5054], type: 'business', station: 'Canary Wharf' },
    'clapham': { coords: [-0.1376, 51.4618], type: 'area', station: 'Clapham Junction' },
    'clerkenwell': { coords: [-0.1102, 51.5217], type: 'area', station: 'Farringdon' },
    'covent garden': { coords: [-0.1243, 51.5118], type: 'area', station: 'Covent Garden' },
    'greenwich': { coords: [-0.0088, 51.4825], type: 'area', station: 'Greenwich' },
    'hackney': { coords: [-0.0553, 51.5448], type: 'area', station: 'Hackney Central' },
    'hammersmith': { coords: [-0.2239, 51.4916], type: 'area', station: 'Hammersmith' },
    'islington': { coords: [-0.1031, 51.5362], type: 'area', station: 'Highbury & Islington' },
    'kensington': { coords: [-0.1938, 51.4988], type: 'area', station: 'High Street Kensington' },
    'notting hill': { coords: [-0.2058, 51.5090], type: 'area', station: 'Notting Hill Gate' },
    'shoreditch': { coords: [-0.0778, 51.5227], type: 'area', station: 'Old Street' },
    'soho': { coords: [-0.1317, 51.5142], type: 'area', station: 'Tottenham Court Road' },
    'victoria': { coords: [-0.1448, 51.4952], type: 'transport', station: 'Victoria' },
    'waterloo': { coords: [-0.1133, 51.5036], type: 'transport', station: 'Waterloo' },
    'westminster': { coords: [-0.1276, 51.4994], type: 'area', station: 'Westminster' }
  },
  
  // Major stations with precise coordinates
  stations: {
    'baker street': [-0.1574, 51.5226],
    'bank': [-0.0886, 51.5133],
    'bond street': [-0.1490, 51.5142],
    'canary wharf': [-0.0235, 51.5054],
    'euston': [-0.1335, 51.5282],
    'kings cross': [-0.1240, 51.5308],
    'liverpool street': [-0.0817, 51.5176],
    'london bridge': [-0.0864, 51.5049],
    'oxford circus': [-0.1415, 51.5154],
    'paddington': [-0.1759, 51.5154],
    'piccadilly circus': [-0.1347, 51.5098],
    'tottenham court road': [-0.1308, 51.5165],
    'victoria': [-0.1448, 51.4952],
    'waterloo': [-0.1133, 51.5036],
    'westminster': [-0.1276, 51.4994]
  },
  
  // Common name variations and aliases
  aliases: {
    'king cross': 'kings cross',
    'kcx': 'kings cross',
    'tottenham court rd': 'tottenham court road',
    'tcr': 'tottenham court road',
    'oxford st': 'oxford circus',
    'bond st': 'bond street',
    'piccadilly': 'piccadilly circus',
    'vic': 'victoria',
    'waterloo station': 'waterloo',
    'london bridge station': 'london bridge',
    'borough': 'borough market',
    'the borough': 'borough market'
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
  // Zone 1 - Central London Major Stations
  { name: "King's Cross", coordinates: [-0.1240, 51.5308], type: "major_station", zones: [1] },
  { name: "London Bridge", coordinates: [-0.0864, 51.5049], type: "major_station", zones: [1] },
  { name: "Victoria", coordinates: [-0.1448, 51.4952], type: "major_station", zones: [1] },
  { name: "Liverpool Street", coordinates: [-0.0817, 51.5176], type: "major_station", zones: [1] },
  { name: "Waterloo", coordinates: [-0.1133, 51.5036], type: "major_station", zones: [1] },
  { name: "Paddington", coordinates: [-0.1759, 51.5154], type: "major_station", zones: [1] },
  { name: "Oxford Circus", coordinates: [-0.1415, 51.5154], type: "major_station", zones: [1] },
  { name: "Bond Street", coordinates: [-0.1490, 51.5142], type: "major_station", zones: [1] },
  { name: "Tottenham Court Road", coordinates: [-0.1308, 51.5165], type: "major_station", zones: [1] },
  { name: "Bank", coordinates: [-0.0886, 51.5133], type: "major_station", zones: [1] },
  { name: "Leicester Square", coordinates: [-0.1281, 51.5118], type: "major_station", zones: [1] },
  { name: "Piccadilly Circus", coordinates: [-0.1347, 51.5098], type: "major_station", zones: [1] },
  { name: "Westminster", coordinates: [-0.1276, 51.4994], type: "major_station", zones: [1] },
  { name: "Embankment", coordinates: [-0.1223, 51.5074], type: "major_station", zones: [1] },
  { name: "Charing Cross", coordinates: [-0.1248, 51.5080], type: "major_station", zones: [1] },
  
  // Zone 1 - Districts and Areas
  { name: "Shoreditch", coordinates: [-0.0778, 51.5227], type: "district", zones: [1] },
  { name: "Clerkenwell", coordinates: [-0.1102, 51.5217], type: "district", zones: [1] },
  { name: "Bloomsbury", coordinates: [-0.1276, 51.5220], type: "district", zones: [1] },
  { name: "Covent Garden", coordinates: [-0.1243, 51.5118], type: "district", zones: [1] },
  { name: "Soho", coordinates: [-0.1317, 51.5142], type: "district", zones: [1] },
  { name: "Borough Market", coordinates: [-0.0909, 51.5055], type: "district", zones: [1] },
  { name: "Southwark", coordinates: [-0.1037, 51.5016], type: "district", zones: [1] },
  { name: "Fitzrovia", coordinates: [-0.1392, 51.5186], type: "district", zones: [1] },
  { name: "Holborn", coordinates: [-0.1200, 51.5174], type: "district", zones: [1] },
  { name: "Old Street", coordinates: [-0.0878, 51.5259], type: "major_station", zones: [1] },
  { name: "Angel", coordinates: [-0.1057, 51.5322], type: "major_station", zones: [1] },
  { name: "Farringdon", coordinates: [-0.1053, 51.5203], type: "major_station", zones: [1] },
  
  // Zone 2 - Inner London
  { name: "Canary Wharf", coordinates: [-0.0235, 51.5054], type: "major_station", zones: [2] },
  { name: "Camden", coordinates: [-0.1426, 51.5390], type: "district", zones: [2] },
  { name: "Islington", coordinates: [-0.1031, 51.5362], type: "district", zones: [2] },
  { name: "Clapham", coordinates: [-0.1376, 51.4618], type: "district", zones: [2] },
  { name: "Brixton", coordinates: [-0.1145, 51.4613], type: "district", zones: [2] },
  { name: "Greenwich", coordinates: [-0.0088, 51.4825], type: "district", zones: [2, 3] },
  { name: "Hampstead", coordinates: [-0.1786, 51.5560], type: "district", zones: [2] },
  { name: "Notting Hill", coordinates: [-0.2058, 51.5090], type: "district", zones: [2] },
  { name: "Hackney", coordinates: [-0.0553, 51.5448], type: "district", zones: [2] },
  { name: "Bethnal Green", coordinates: [-0.0549, 51.5273], type: "district", zones: [2] },
  { name: "Mile End", coordinates: [-0.0333, 51.5249], type: "district", zones: [2] },
  { name: "Bow", coordinates: [-0.0247, 51.5269], type: "district", zones: [2] },
  { name: "Dalston", coordinates: [-0.0750, 51.5461], type: "district", zones: [2] },
  { name: "London Fields", coordinates: [-0.0583, 51.5422], type: "district", zones: [2] },
  { name: "Victoria Park", coordinates: [-0.0439, 51.5355], type: "district", zones: [2] },
  { name: "Oval", coordinates: [-0.1133, 51.4816], type: "district", zones: [2] },
  { name: "Elephant & Castle", coordinates: [-0.0992, 51.4939], type: "district", zones: [1, 2] },
  { name: "Old Kent Road", coordinates: [-0.0617, 51.4819], type: "district", zones: [2] },
  { name: "New Cross", coordinates: [-0.0324, 51.4760], type: "district", zones: [2] },
  { name: "Deptford", coordinates: [-0.0255, 51.4777], type: "district", zones: [2] },
  { name: "Bermondsey", coordinates: [-0.0635, 51.4979], type: "district", zones: [2] },
  { name: "Rotherhithe", coordinates: [-0.0515, 51.5011], type: "district", zones: [2] },
  { name: "Wapping", coordinates: [-0.0563, 51.5043], type: "district", zones: [2] },
  { name: "Limehouse", coordinates: [-0.0396, 51.5123], type: "district", zones: [2] },
  { name: "Poplar", coordinates: [-0.0159, 51.5077], type: "district", zones: [2] },
  { name: "Whitechapel", coordinates: [-0.0607, 51.5196], type: "district", zones: [2] },
  { name: "Stepney", coordinates: [-0.0421, 51.5170], type: "district", zones: [2] },
  { name: "Hammersmith", coordinates: [-0.2239, 51.4916], type: "district", zones: [2] },
  { name: "Fulham", coordinates: [-0.1953, 51.4700], type: "district", zones: [2] },
  { name: "Chelsea", coordinates: [-0.1687, 51.4875], type: "district", zones: [1, 2] },
  { name: "Kensington", coordinates: [-0.1938, 51.4988], type: "district", zones: [1, 2] },
  { name: "Earls Court", coordinates: [-0.1939, 51.4908], type: "district", zones: [1, 2] },
  { name: "South Kensington", coordinates: [-0.1746, 51.4945], type: "district", zones: [1] },
  { name: "Knightsbridge", coordinates: [-0.1607, 51.5010], type: "district", zones: [1] },
  { name: "Belgravia", coordinates: [-0.1530, 51.4959], type: "district", zones: [1] },
  { name: "Pimlico", coordinates: [-0.1347, 51.4893], type: "district", zones: [1] },
  { name: "Vauxhall", coordinates: [-0.1236, 51.4861], type: "district", zones: [1, 2] },
  { name: "Stockwell", coordinates: [-0.1225, 51.4720], type: "district", zones: [2] },
  { name: "Camberwell", coordinates: [-0.0919, 51.4742], type: "district", zones: [2] },
  { name: "Peckham", coordinates: [-0.0690, 51.4739], type: "district", zones: [2] },
  
  // Zone 3 - Outer Inner London
  { name: "Stratford", coordinates: [0.0042, 51.5434], type: "major_station", zones: [2, 3] },
  { name: "Canary Wharf", coordinates: [-0.0235, 51.5054], type: "major_station", zones: [2] },
  { name: "Wimbledon", coordinates: [-0.2044, 51.4214], type: "major_station", zones: [3] },
  { name: "Richmond", coordinates: [-0.3019, 51.4613], type: "major_station", zones: [4] },
  { name: "Clapham Junction", coordinates: [-0.1700, 51.4642], type: "major_station", zones: [2] },
  { name: "East Croydon", coordinates: [-0.0559, 51.3756], type: "major_station", zones: [5] },
  { name: "Ealing Broadway", coordinates: [-0.3016, 51.5130], type: "major_station", zones: [3] },
  { name: "Acton", coordinates: [-0.2674, 51.5089], type: "district", zones: [3] },
  { name: "Putney", coordinates: [-0.2159, 51.4642], type: "district", zones: [2] },
  { name: "Wandsworth", coordinates: [-0.1885, 51.4567], type: "district", zones: [2, 3] },
  { name: "Battersea", coordinates: [-0.1755, 51.4816], type: "district", zones: [2] },
  { name: "Balham", coordinates: [-0.1530, 51.4431], type: "district", zones: [3] },
  { name: "Tooting", coordinates: [-0.1678, 51.4265], type: "district", zones: [3] },
  { name: "Mitcham", coordinates: [-0.1684, 51.4026], type: "district", zones: [4] },
  { name: "Morden", coordinates: [-0.1946, 51.4018], type: "district", zones: [4] },
  { name: "Raynes Park", coordinates: [-0.2291, 51.4095], type: "district", zones: [4] },
  { name: "New Malden", coordinates: [-0.2523, 51.4027], type: "district", zones: [4] },
  { name: "Kingston upon Thames", coordinates: [-0.3064, 51.4120], type: "district", zones: [6] },
  { name: "Surbiton", coordinates: [-0.2967, 51.3927], type: "district", zones: [6] },
  { name: "Barnes", coordinates: [-0.2420, 51.4685], type: "district", zones: [3] },
  { name: "Mortlake", coordinates: [-0.2654, 51.4697], type: "district", zones: [3] },
  { name: "Kew", coordinates: [-0.2882, 51.4879], type: "district", zones: [3] },
  { name: "Chiswick", coordinates: [-0.2536, 51.4921], type: "district", zones: [3] },
  { name: "Brentford", coordinates: [-0.3112, 51.4816], type: "district", zones: [4] },
  { name: "Hounslow", coordinates: [-0.3714, 51.4735], type: "district", zones: [5] },
  { name: "Twickenham", coordinates: [-0.3247, 51.4464], type: "district", zones: [5] },
  { name: "Feltham", coordinates: [-0.4119, 51.4485], type: "district", zones: [6] },
  { name: "Ashford", coordinates: [-0.4619, 51.4327], type: "district", zones: [6] },
  
  // Zone 4-6 - Outer London
  { name: "Heathrow", coordinates: [-0.4543, 51.4700], type: "major_station", zones: [6] },
  { name: "Uxbridge", coordinates: [-0.4781, 51.5462], type: "major_station", zones: [6] },
  { name: "Ruislip", coordinates: [-0.4213, 51.5730], type: "district", zones: [6] },
  { name: "Hillingdon", coordinates: [-0.4499, 51.5462], type: "district", zones: [6] },
  { name: "Hayes", coordinates: [-0.4192, 51.5049], type: "district", zones: [5] },
  { name: "Southall", coordinates: [-0.3822, 51.5061], type: "district", zones: [4] },
  { name: "Greenford", coordinates: [-0.3440, 51.5425], type: "district", zones: [4] },
  { name: "Perivale", coordinates: [-0.3232, 51.5365], type: "district", zones: [4] },
  { name: "Hanger Lane", coordinates: [-0.2932, 51.5303], type: "district", zones: [3] },
  { name: "Park Royal", coordinates: [-0.2840, 51.5270], type: "district", zones: [3] },
  { name: "Alperton", coordinates: [-0.2988, 51.5408], type: "district", zones: [4] },
  { name: "Wembley", coordinates: [-0.2964, 51.5523], type: "district", zones: [4] },
  { name: "Harrow", coordinates: [-0.3341, 51.5898], type: "district", zones: [5] },
  { name: "Pinner", coordinates: [-0.3808, 51.5938], type: "district", zones: [5] },
  { name: "Watford", coordinates: [-0.3962, 51.6562], type: "district", zones: [7] }, // Outside zone 6 but commonly accessed
  { name: "Stanmore", coordinates: [-0.3028, 51.6194], type: "district", zones: [5] },
  { name: "Edgware", coordinates: [-0.2750, 51.6137], type: "district", zones: [5] },
  { name: "Mill Hill", coordinates: [-0.2606, 51.6110], type: "district", zones: [4] },
  { name: "Hendon", coordinates: [-0.2257, 51.5848], type: "district", zones: [3, 4] },
  { name: "Golders Green", coordinates: [-0.1941, 51.5723], type: "district", zones: [3] },
  { name: "Finchley", coordinates: [-0.1933, 51.5975], type: "district", zones: [4] },
  { name: "Barnet", coordinates: [-0.2037, 51.6461], type: "district", zones: [5] },
  { name: "Muswell Hill", coordinates: [-0.1436, 51.5887], type: "district", zones: [3] },
  { name: "Crouch End", coordinates: [-0.1255, 51.5907], type: "district", zones: [3] },
  { name: "Hornsey", coordinates: [-0.1111, 51.5882], type: "district", zones: [3] },
  { name: "Wood Green", coordinates: [-0.1097, 51.5975], type: "district", zones: [3] },
  { name: "Tottenham", coordinates: [-0.0690, 51.5934], type: "district", zones: [3] },
  { name: "Edmonton", coordinates: [-0.0814, 51.6156], type: "district", zones: [4] },
  { name: "Enfield", coordinates: [-0.0824, 51.6528], type: "district", zones: [5] },
  { name: "Winchmore Hill", coordinates: [-0.1008, 51.6347], type: "district", zones: [4] },
  { name: "Palmers Green", coordinates: [-0.1085, 51.6186], type: "district", zones: [4] },
  { name: "Southgate", coordinates: [-0.1289, 51.6322], type: "district", zones: [4] },
  { name: "Cockfosters", coordinates: [-0.1496, 51.6518], type: "district", zones: [5] },
  { name: "Chingford", coordinates: [-0.0095, 51.6277], type: "district", zones: [5] },
  { name: "Walthamstow", coordinates: [-0.0194, 51.5831], type: "district", zones: [3] },
  { name: "Leyton", coordinates: [-0.0060, 51.5634], type: "district", zones: [3] },
  { name: "Leytonstone", coordinates: [0.0083, 51.5681], type: "district", zones: [3, 4] },
  { name: "Redbridge", coordinates: [0.0455, 51.5590], type: "district", zones: [4] },
  { name: "Ilford", coordinates: [0.0688, 51.5590], type: "district", zones: [4] },
  { name: "Barking", coordinates: [0.0813, 51.5396], type: "district", zones: [4] },
  { name: "Dagenham", coordinates: [0.1338, 51.5405], type: "district", zones: [5] },
  { name: "Romford", coordinates: [0.1821, 51.5750], type: "district", zones: [6] },
  { name: "Upminster", coordinates: [0.2511, 51.5588], type: "district", zones: [6] },
  { name: "Hornchurch", coordinates: [0.2182, 51.5515], type: "district", zones: [6] },
  { name: "Rainham", coordinates: [0.1902, 51.5156], type: "district", zones: [6] },
  { name: "Purfleet", coordinates: [0.2342, 51.4844], type: "district", zones: [6] },
  { name: "Grays", coordinates: [0.3224, 51.4756], type: "district", zones: [6] },
  { name: "Dartford", coordinates: [0.2137, 51.4470], type: "district", zones: [6] },
  { name: "Bexleyheath", coordinates: [0.1484, 51.4613], type: "district", zones: [6] },
  { name: "Sidcup", coordinates: [0.1037, 51.4326], type: "district", zones: [5] },
  { name: "Chislehurst", coordinates: [0.0751, 51.4177], type: "district", zones: [5] },
  { name: "Orpington", coordinates: [0.0977, 51.3727], type: "district", zones: [6] },
  { name: "Bromley", coordinates: [0.0140, 51.4067], type: "district", zones: [5] },
  { name: "Beckenham", coordinates: [-0.0252, 51.4085], type: "district", zones: [4] },
  { name: "Crystal Palace", coordinates: [-0.0728, 51.4184], type: "district", zones: [4] },
  { name: "West Norwood", coordinates: [-0.1028, 51.4322], type: "district", zones: [3] },
  { name: "Streatham", coordinates: [-0.1317, 51.4321], type: "district", zones: [3] },
  { name: "Thornton Heath", coordinates: [-0.1007, 51.3988], type: "district", zones: [4] },
  { name: "Croydon", coordinates: [-0.0982, 51.3762], type: "district", zones: [5] },
  { name: "Purley", coordinates: [-0.1132, 51.3368], type: "district", zones: [6] },
  { name: "Coulsdon", coordinates: [-0.1372, 51.3228], type: "district", zones: [6] },
  { name: "Banstead", coordinates: [-0.2062, 51.3213], type: "district", zones: [6] },
  { name: "Sutton", coordinates: [-0.1939, 51.3648], type: "district", zones: [5] },
  { name: "Cheam", coordinates: [-0.2147, 51.3618], type: "district", zones: [5] },
  { name: "Worcester Park", coordinates: [-0.2439, 51.3739], type: "district", zones: [4] },
  { name: "Epsom", coordinates: [-0.2696, 51.3304], type: "district", zones: [6] },
  { name: "Leatherhead", coordinates: [-0.3302, 51.2979], type: "district", zones: [6] }
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

app.get('/api/locations/enhanced-suggestions', async (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json({ suggestions: [] });
    }

    console.log(`Enhanced suggestions for: "${query}"`);
    
    const normalizedQuery = query.toLowerCase().trim();
    const suggestions = [];
    
    // 1. Check exact matches first (highest priority)
    const exactMatches = findExactMatches(normalizedQuery);
    suggestions.push(...exactMatches);
    
    // 2. Check partial matches in our database
    const partialMatches = findPartialMatches(normalizedQuery);
    suggestions.push(...partialMatches);
    
    // 3. Only use Mapbox if we don't have good local matches
    if (suggestions.length < 3) {
      console.log('Getting additional suggestions from Mapbox...');
      const mapboxSuggestions = await getMapboxSuggestions(query);
      suggestions.push(...mapboxSuggestions);
    }
    
    // 4. Remove duplicates and limit results
    const uniqueSuggestions = removeDuplicateSuggestions(suggestions).slice(0, 6);
    
    console.log(`Returning ${uniqueSuggestions.length} enhanced suggestions`);
    res.json({ suggestions: uniqueSuggestions });
    
  } catch (error) {
    console.error('Enhanced suggestions error:', error);
    res.json({ suggestions: [] }); // Fail gracefully
  }
});

// Helper functions for enhanced suggestions
function findExactMatches(query) {
  const matches = [];
  
  // Check stations
  if (LONDON_LOCATIONS_DATABASE.stations[query]) {
    matches.push({
      name: toTitleCase(query),
      description: `${toTitleCase(query)} Station`,
      type: 'station',
      coordinates: LONDON_LOCATIONS_DATABASE.stations[query],
      confidence: 'high',
      source: 'database'
    });
  }
  
  // Check areas
  if (LONDON_LOCATIONS_DATABASE.areas[query]) {
    const area = LONDON_LOCATIONS_DATABASE.areas[query];
    matches.push({
      name: toTitleCase(query),
      description: `${toTitleCase(query)} (${area.type})`,
      type: area.type,
      coordinates: area.coords,
      confidence: 'high',
      source: 'database'
    });
  }
  
  // Check aliases
  if (LONDON_LOCATIONS_DATABASE.aliases[query]) {
    const aliasTarget = LONDON_LOCATIONS_DATABASE.aliases[query];
    const resolved = findExactMatches(aliasTarget);
    matches.push(...resolved);
  }
  
  return matches;
}

function findPartialMatches(query) {
  const matches = [];
  const words = query.split(' ').filter(word => word.length > 2);
  
  // Score-based matching for stations
  for (const [stationName, coords] of Object.entries(LONDON_LOCATIONS_DATABASE.stations)) {
    const score = calculateMatchScore(query, stationName);
    if (score > 0.3) {
      matches.push({
        name: toTitleCase(stationName),
        description: `${toTitleCase(stationName)} Station`,
        type: 'station',
        coordinates: coords,
        confidence: score > 0.7 ? 'high' : 'medium',
        source: 'database',
        score: score
      });
    }
  }
  
  // Score-based matching for areas
  for (const [areaName, data] of Object.entries(LONDON_LOCATIONS_DATABASE.areas)) {
    const score = calculateMatchScore(query, areaName);
    if (score > 0.3) {
      matches.push({
        name: toTitleCase(areaName),
        description: `${toTitleCase(areaName)} (${data.type})`,
        type: data.type,
        coordinates: data.coords,
        confidence: score > 0.7 ? 'high' : 'medium',
        source: 'database',
        score: score
      });
    }
  }
  
  // Sort by score and return top matches
  return matches
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 4);
}

function calculateMatchScore(query, target) {
  const normalizedQuery = query.toLowerCase();
  const normalizedTarget = target.toLowerCase();
  
  // Exact match
  if (normalizedQuery === normalizedTarget) return 1.0;
  
  // Target contains query
  if (normalizedTarget.includes(normalizedQuery)) return 0.8;
  
  // Query contains target
  if (normalizedQuery.includes(normalizedTarget)) return 0.7;
  
  // Word-based matching
  const queryWords = normalizedQuery.split(' ');
  const targetWords = normalizedTarget.split(' ');
  
  let matchingWords = 0;
  for (const qWord of queryWords) {
    for (const tWord of targetWords) {
      if (qWord.length > 2 && (tWord.includes(qWord) || qWord.includes(tWord))) {
        matchingWords++;
        break;
      }
    }
  }
  
  const wordScore = matchingWords / Math.max(queryWords.length, targetWords.length);
  
  // Fuzzy matching for common typos
  const fuzzyScore = calculateFuzzyScore(normalizedQuery, normalizedTarget);
  
  return Math.max(wordScore, fuzzyScore);
}

function calculateFuzzyScore(query, target) {
  // Simple Levenshtein-inspired fuzzy matching
  if (Math.abs(query.length - target.length) > 3) return 0;
  
  let matches = 0;
  const minLength = Math.min(query.length, target.length);
  
  for (let i = 0; i < minLength; i++) {
    if (query[i] === target[i]) matches++;
  }
  
  return matches / Math.max(query.length, target.length);
}

async function getMapboxSuggestions(query) {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?` +
      `access_token=${API_CONFIG.MAPBOX_TOKEN}&` +
      `country=GB&` +
      `bbox=-0.51,51.28,0.33,51.70&` + // London bounding box
      `types=poi,place,address,neighborhood&` +
      `limit=3`
    );

    if (!response.ok) {
      console.warn('Mapbox suggestions failed:', response.status);
      return [];
    }

    const data = await response.json();
    
    if (!data.features || data.features.length === 0) {
      return [];
    }

    return data.features
      .filter(feature => {
        // Filter out irrelevant results
        const text = (feature.text || feature.place_name || '').toLowerCase();
        return !text.includes('real estate') && 
               !text.includes('estate agent') &&
               !text.includes('lettings') &&
               !text.includes('property');
      })
      .map(feature => ({
        name: feature.text || feature.place_name,
        description: cleanMapboxDescription(feature),
        type: determineFeatureType(feature),
        coordinates: feature.center,
        confidence: 'medium',
        source: 'mapbox'
      }));
      
  } catch (error) {
    console.warn('Mapbox suggestions error:', error);
    return [];
  }
}

function cleanMapboxDescription(feature) {
  const text = feature.text || '';
  const placeName = feature.place_name || '';
  
  // Extract meaningful context
  if (placeName.includes('Station')) {
    return `${text} Station`;
  } else if (placeName.includes('Underground')) {
    return `${text} (Underground)`;
  } else if (feature.place_type?.includes('poi')) {
    return `${text} (Place)`;
  } else if (feature.place_type?.includes('neighborhood')) {
    return `${text} (Area)`;
  }
  
  return text;
}

function determineFeatureType(feature) {
  const text = (feature.text || feature.place_name || '').toLowerCase();
  
  if (text.includes('station') || text.includes('underground') || text.includes('tube')) {
    return 'station';
  } else if (feature.place_type?.includes('neighborhood')) {
    return 'area';
  } else if (feature.place_type?.includes('poi')) {
    return 'place';
  }
  
  return 'location';
}

function removeDuplicateSuggestions(suggestions) {
  const seen = new Set();
  return suggestions.filter(suggestion => {
    const key = suggestion.name.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

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
    
    // Run the algorithm with precise coordinates
    const results = await findOptimalMeetingSpots(
      resolvedLocation1.coordinates,
      resolvedLocation2.coordinates,
      null // meetingTime
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
// REPLACE the existing findOptimalMeetingSpots function with this:
async function findOptimalMeetingSpots(coords1, coords2, meetingTime = null) {
  console.log('Starting enhanced algorithm with precise location resolution...');
  
  // Validate coordinates are actually coordinates, not location names
  if (!Array.isArray(coords1) || !Array.isArray(coords2)) {
    throw new Error('Algorithm requires coordinate arrays, not location names');
  }
  
  console.log('Using coordinates:', { coords1, coords2 });
  
  // Continue with existing algorithm...
  const timeIntervals = [20, 30, 45, 60];
  let accessibleAreas = new Set();

  for (const timeMinutes of timeIntervals) {
    console.log(`Checking ${timeMinutes}-minute accessibility...`);
    
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

      console.log(`Found ${mutuallyAccessible.length} mutually accessible areas within ${timeMinutes} minutes`);
      
      if (accessibleAreas.size >= 15) break;
      
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

async function getJourneyDetails(fromCoords, toCoords, meetingTime = null) {
  console.log(`Getting journey details from [${fromCoords}] to [${toCoords}]`);
  
  // Try the complex version first
  let result = await getEnhancedJourneyDetails(fromCoords, toCoords, meetingTime);
  
  if (!result) {
    console.log('Enhanced journey details failed, trying simple version...');
    result = await getJourneyDetailsSimple(fromCoords, toCoords);
  }
  
  if (!result) {
    console.log('Both journey detail methods failed, creating fallback...');
    // Create a very basic fallback to prevent complete failure
    const distance = getDistance(fromCoords, toCoords);
    const estimatedTime = Math.round(distance / 1000 * 3 + 10); // Rough estimate: 3 min per km + 10 min base
    
    result = {
      duration: Math.min(estimatedTime, 60), // Cap at 60 minutes
      changes: 1,
      route: 'Estimated route via public transport',
      modes: ['tube', 'walking']
    };
  }
  
  console.log('Journey details result:', result);
  return result;
}

async function fallbackGeographicAnalysis(coords1, coords2, meetingTime) {
  console.log('🔄 Running fallback geographic analysis...');
  console.log('Input coordinates:', { coords1, coords2 });
  
  // Create a broader search around the midpoint
  const midpoint = [
    (coords1[0] + coords2[0]) / 2,
    (coords1[1] + coords2[1]) / 2
  ];
  
  console.log('Calculated midpoint:', midpoint);
  
  // Find nearest predefined areas to the midpoint
  const nearbyAreas = LONDON_MEETING_AREAS
    .map(area => ({
      ...area,
      distanceFromMidpoint: getDistance(area.coordinates, midpoint)
    }))
    .sort((a, b) => a.distanceFromMidpoint - b.distanceFromMidpoint)
    .slice(0, 15); // Increased from 10 to 15
  
  console.log('Nearby areas to analyze:', nearbyAreas.map(a => `${a.name} (${Math.round(a.distanceFromMidpoint)}m away)`));
  
  const analyzedAreas = [];
  for (const area of nearbyAreas) {
    try {
      console.log(`Analyzing area: ${area.name}...`);
      const journeyDetails = await analyzeJourneyDetailsWithIntegration(coords1, coords2, area, meetingTime);
      
      if (journeyDetails) {
        const maxDuration = Math.max(journeyDetails.journey1.duration, journeyDetails.journey2.duration);
        console.log(`✅ ${area.name}: Journey 1: ${journeyDetails.journey1.duration}min, Journey 2: ${journeyDetails.journey2.duration}min`);
        
        // Increased time threshold from 60 to 90 minutes for fallback
        if (maxDuration <= 90) {
          analyzedAreas.push({
            name: area.name,
            coordinates: area.coordinates,
            type: area.type,
            zones: area.zones,
            ...journeyDetails
          });
        } else {
          console.log(`❌ ${area.name}: Too long (${maxDuration} minutes)`);
        }
      } else {
        console.log(`❌ ${area.name}: No journey details returned`);
      }
    } catch (error) {
      console.warn(`Failed to analyze fallback area ${area.name}:`, error.message);
    }
    
    // Stop after finding a reasonable number
    if (analyzedAreas.length >= 10) break;
  }
  
  console.log(`Fallback analysis found ${analyzedAreas.length} viable areas:`, analyzedAreas.map(a => a.name));
  
  if (analyzedAreas.length === 0) {
    // Last resort: create some basic results using the nearest areas with estimated journey times
    console.log('🆘 Creating emergency fallback results...');
    const emergencyResults = nearbyAreas.slice(0, 3).map(area => {
      const distance1 = getDistance(coords1, area.coordinates);
      const distance2 = getDistance(coords2, area.coordinates);
      
      // Very rough time estimates
      const duration1 = Math.min(Math.round(distance1 / 1000 * 4 + 15), 75);
      const duration2 = Math.min(Math.round(distance2 / 1000 * 4 + 15), 75);
      
      return {
        name: area.name,
        coordinates: area.coordinates,
        type: area.type,
        zones: area.zones || [1],
        journey1: {
          duration: duration1,
          changes: 1,
          route: 'Estimated route',
          modes: ['tube', 'walking']
        },
        journey2: {
          duration: duration2,
          changes: 1,
          route: 'Estimated route',
          modes: ['tube', 'walking']
        },
        timeDifference: Math.abs(duration1 - duration2),
        averageTime: (duration1 + duration2) / 2,
        integrationData: {
          area: area,
          journey1: {
            startCoords: coords1,
            endCoords: area.coordinates,
            startName: 'Your location',
            endName: area.name,
            googleMapsUrl: generateGoogleMapsUrl(coords1, area.coordinates, 'Your location', area.name),
            citymapperUrl: generateCitymapperUrl(coords1, area.coordinates, 'Your location', area.name)
          },
          journey2: {
            startCoords: coords2,
            endCoords: area.coordinates,
            startName: 'Their location',
            endName: area.name,
            googleMapsUrl: generateGoogleMapsUrl(coords2, area.coordinates, 'Their location', area.name),
            citymapperUrl: generateCitymapperUrl(coords2, area.coordinates, 'Their location', area.name)
          }
        }
      };
    });
    
    console.log('Emergency fallback created:', emergencyResults.map(r => r.name));
    return emergencyResults;
  }
  
  const scoredAreas = analyzedAreas.map(area => ({
    ...area,
    score: calculateAreaConvenienceScore(area)
  }));
  
  scoredAreas.sort((a, b) => b.score - a.score);
  return selectDiverseAreas(scoredAreas, 3);
}

// 4. ADD debugging to the main algorithm
async function findOptimalMeetingSpots(coords1, coords2, meetingTime = null) {
  console.log('🚀 Starting enhanced algorithm with precise location resolution...');
  console.log('Input coordinates:', { coords1, coords2 });
  
  // Validate coordinates are actually coordinates, not location names
  if (!Array.isArray(coords1) || !Array.isArray(coords2)) {
    throw new Error('Algorithm requires coordinate arrays, not location names');
  }
  
  if (coords1.length !== 2 || coords2.length !== 2) {
    throw new Error('Invalid coordinate format - need [lng, lat] arrays');
  }
  
  console.log('✅ Coordinates validated');
  
  // Continue with existing algorithm...
  const timeIntervals = [20, 30, 45, 60];
  let accessibleAreas = new Set();

  for (const timeMinutes of timeIntervals) {
    console.log(`🔍 Checking ${timeMinutes}-minute accessibility...`);
    
    try {
      const [isochrone1, isochrone2] = await Promise.all([
        getIsochrone(coords1, timeMinutes),
        getIsochrone(coords2, timeMinutes)
      ]);

      console.log(`✅ Got isochrones for ${timeMinutes} minutes`);

      const mutuallyAccessible = LONDON_MEETING_AREAS.filter(area => {
        const point = area.coordinates;
        const in1 = isPointInPolygon(point, isochrone1.geometry.coordinates[0]);
        const in2 = isPointInPolygon(point, isochrone2.geometry.coordinates[0]);
        return in1 && in2;
      });

      mutuallyAccessible.forEach(area => {
        accessibleAreas.add(`${area.name}:${timeMinutes}`);
      });

      console.log(`Found ${mutuallyAccessible.length} mutually accessible areas within ${timeMinutes} minutes:`, 
        mutuallyAccessible.map(a => a.name));
      
      if (accessibleAreas.size >= 15) {
        console.log('✅ Sufficient accessible areas found, proceeding to analysis');
        break;
      }
      
    } catch (error) {
      console.error(`❌ Error checking ${timeMinutes}-minute accessibility:`, error);
      continue;
    }
  }

  console.log(`📊 Total accessible area entries: ${accessibleAreas.size}`);

  if (accessibleAreas.size === 0) {
    console.log('⚠️ No mutually accessible predefined areas found, trying fallback...');
    return await fallbackGeographicAnalysis(coords1, coords2, meetingTime);
  }

  // Extract unique areas and analyze journey details
  const uniqueAreas = [...new Set(Array.from(accessibleAreas).map(item => item.split(':')[0]))];
  const areaObjects = uniqueAreas.map(name => 
    LONDON_MEETING_AREAS.find(area => area.name === name)
  ).filter(Boolean);

  console.log(`🔍 Analyzing ${areaObjects.length} unique accessible areas:`, 
    areaObjects.map(a => a.name));

  const analyzedAreas = [];
  
  for (const area of areaObjects) {
    try {
      console.log(`Analyzing ${area.name}...`);
      const journeyDetails = await analyzeJourneyDetailsWithIntegration(coords1, coords2, area, meetingTime);
      if (journeyDetails) {
        analyzedAreas.push({
          name: area.name,
          coordinates: area.coordinates,
          type: area.type,
          zones: area.zones,
          ...journeyDetails
        });
        console.log(`✅ ${area.name}: Average ${Math.round(journeyDetails.averageTime)}min`);
      } else {
        console.log(`❌ ${area.name}: No journey details`);
      }
    } catch (error) {
      console.warn(`Failed to analyze area ${area.name}:`, error.message);
      continue;
    }

    if (analyzedAreas.length >= 25) break;
  }

  console.log(`📊 Successfully analyzed ${analyzedAreas.length} areas`);

  if (analyzedAreas.length === 0) {
    console.log('⚠️ No viable meeting areas from isochrone analysis, trying fallback...');
    return await fallbackGeographicAnalysis(coords1, coords2, meetingTime);
  }

  // Score and rank areas
  const scoredAreas = analyzedAreas.map(area => ({
    ...area,
    score: calculateAreaConvenienceScore(area)
  }));

  scoredAreas.sort((a, b) => b.score - a.score);

  console.log(`🏆 Scored areas:`, scoredAreas.map(a => `${a.name}: ${a.score}`));

  // Apply geographic and type diversity
  const diverseResults = selectDiverseAreas(scoredAreas, 3);
  
  console.log(`✅ Final diverse areas selected:`, diverseResults.map(a => a.name));
  return diverseResults;
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

async function resolveLocationToCoordinates(locationInput) {
  console.log(`Resolving location: "${locationInput}"`);
  
  const normalizedInput = locationInput.toLowerCase().trim();
  
  // 1. Check direct station matches
  if (LONDON_LOCATIONS_DATABASE.stations[normalizedInput]) {
    const coords = LONDON_LOCATIONS_DATABASE.stations[normalizedInput];
    console.log(`✅ Found station: ${locationInput} -> ${coords}`);
    return {
      coordinates: coords,
      name: toTitleCase(normalizedInput),
      type: 'station',
      confidence: 'high'
    };
  }
  
  // 2. Check area matches
  if (LONDON_LOCATIONS_DATABASE.areas[normalizedInput]) {
    const area = LONDON_LOCATIONS_DATABASE.areas[normalizedInput];
    console.log(`✅ Found area: ${locationInput} -> ${area.coords}`);
    return {
      coordinates: area.coords,
      name: toTitleCase(normalizedInput),
      type: area.type,
      confidence: 'high'
    };
  }
  
  // 3. Check aliases
  if (LONDON_LOCATIONS_DATABASE.aliases[normalizedInput]) {
    const aliasTarget = LONDON_LOCATIONS_DATABASE.aliases[normalizedInput];
    return await resolveLocationToCoordinates(aliasTarget);
  }
  
  // 4. Partial matching for common variations
  const partialMatch = findPartialMatch(normalizedInput);
  if (partialMatch) {
    console.log(`✅ Found partial match: ${locationInput} -> ${partialMatch}`);
    return await resolveLocationToCoordinates(partialMatch);
  }
  
  // 5. Fallback to Mapbox with London-focused parameters
  console.log(`🔍 Using Mapbox geocoding for: ${locationInput}`);
  return await geocodeWithMapbox(locationInput);
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

app.listen(PORT, () => {
  console.log(`Commonplace API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

async function analyzeJourneyDetailsWithIntegration(coords1, coords2, area, meetingTime = null) {
  try {
    console.log(`Analyzing journey integration for ${area.name}...`);
    
    // Get enhanced journey details for both routes
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
      // Enhanced integration data with better naming
      integrationData: {
        area: area,
        journey1: {
          startCoords: coords1,
          endCoords: area.coordinates,
          startName: journey1Details.startLocationName,
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
          startName: journey2Details.startLocationName,
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

async function getJourneyDetailsWithIntegration(fromCoords, toCoords, meetingTime = null) {
  const startLocationName = await getLocationName(fromCoords);
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
