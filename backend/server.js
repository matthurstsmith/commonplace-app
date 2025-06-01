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
    // FIX: Use more precise Borough Market coordinates and distinguish from Bank
    'borough market': { coords: [-0.0909, 51.5055], type: 'market', station: 'London Bridge', description: 'Borough Market Food Market' },
    'borough': { coords: [-0.0909, 51.5055], type: 'market', station: 'London Bridge', description: 'Borough Market Area' }, // Point to market, not Bank
    'bank area': { coords: [-0.0886, 51.5133], type: 'financial', station: 'Bank', description: 'Bank Financial District' }, // Separate Bank area
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
    'bank': [-0.0886, 51.5133], // Keep Bank station separate
    'bond street': [-0.1490, 51.5142],
    'borough market': [-0.0909, 51.5055], // Add Borough Market as a station-like location
    'london bridge': [-0.0864, 51.5049], // Nearest actual station to Borough Market
    'canary wharf': [-0.0235, 51.5054],
    'euston': [-0.1335, 51.5282],
    'kings cross': [-0.1240, 51.5308],
    'liverpool street': [-0.0817, 51.5176],
    'oxford circus': [-0.1415, 51.5154],
    'paddington': [-0.1759, 51.5154],
    'piccadilly circus': [-0.1347, 51.5098],
    'tottenham court road': [-0.1308, 51.5165],
    'victoria': [-0.1448, 51.4952],
    'waterloo': [-0.1133, 51.5036],
    'westminster': [-0.1276, 51.4994]
  },
  
  // FIXED: Updated aliases to prevent Borough Market -> Bank confusion
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
    
    // ADD explicit aliases for Borough Market area
    'borough market area': 'borough market',
    'borough food market': 'borough market',
    'the borough market': 'borough market'
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
  return await getOptimizedJourneyDetails(fromCoords, toCoords, meetingTime);
}

async function getOptimizedJourneyDetails(fromCoords, toCoords, meetingTime = null) {
  console.log(`Getting optimized journey from [${fromCoords}] to [${toCoords}]`);
  
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
    `journeyPreference=LeastTime&` +
    `walkingSpeed=Fast&` +
    `accessibilityPreference=NoRequirements&` +
    `maxTransferMinutes=5&` +
    `walkingOptimization=true&` +
    `app_key=${API_CONFIG.TFL_API_KEY}`;
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(tflUrl);

    if (!response.ok) {
      console.error('Optimized TfL API Error:', response.status);
      return await getSpeedOptimizedFallback(fromCoords, toCoords, meetingTime);
    }

    const data = await response.json();
    
    if (!data.journeys || data.journeys.length === 0) {
      return await getSpeedOptimizedFallback(fromCoords, toCoords, meetingTime);
    }

    const optimizedJourney = selectFastestJourney(data.journeys);
    const correctedTime = applyGoogleMapsTimeCorrection(optimizedJourney);
    
    return {
      duration: correctedTime.duration,
      changes: correctedTime.changes,
      route: formatJourneyRoute(optimizedJourney),
      modes: getJourneyModes(optimizedJourney),
      rawTflTime: optimizedJourney.duration,
      correctedTime: correctedTime.duration,
      optimizationApplied: correctedTime.optimizationApplied,
      confidence: correctedTime.confidence
    };

  } catch (error) {
    console.error('Optimized TfL journey request failed:', error.message);
    return await getSpeedOptimizedFallback(fromCoords, toCoords, meetingTime);
  }
}
// NEW: Journey optimization functions
function selectOptimalJourney(journeys) {
  if (journeys.length === 1) return journeys[0];
  
  // Score journeys based on time, changes, and walking
  const scoredJourneys = journeys.map(journey => {
    const changes = countJourneyChanges(journey);
    const walkingTime = calculateWalkingTime(journey);
    const elizabethLine = checkElizabethLineUsage(journey);
    
    // Scoring: prioritize time, then changes, with bonus for Elizabeth Line
    let score = (120 - journey.duration) * 2; // Time factor (higher is better)
    score -= changes * 15; // Change penalty
    score -= walkingTime * 0.5; // Walking penalty
    score += elizabethLine ? 20 : 0; // Elizabeth Line bonus
    
    return { journey, score };
  });
  
  scoredJourneys.sort((a, b) => b.score - a.score);
  
  console.log('Journey optimization scores:', scoredJourneys.map((s, i) => 
    `Journey ${i + 1}: ${s.score} (${s.journey.duration}min, ${countJourneyChanges(s.journey)} changes)`
  ));
  
  return scoredJourneys[0].journey;
}

function checkElizabethLineUsage(journey) {
  if (!journey.legs) return false;
  
  return journey.legs.some(leg => {
    if (!leg.routeOptions || leg.routeOptions.length === 0) return false;
    const route = leg.routeOptions[0];
    const routeName = (route.name || '').toLowerCase();
    const lineId = (route.lineIdentifier?.id || '').toLowerCase();
    
    return routeName.includes('elizabeth') || 
           lineId.includes('elizabeth') ||
           routeName.includes('crossrail');
  });
}

async function getOptimizedJourneyFallback(fromCoords, toCoords, meetingTime) {
  console.log('Using optimized fallback journey planning...');
  
  // Simplified request with core London transport modes
  const tflUrl = `https://api.tfl.gov.uk/Journey/JourneyResults/${fromCoords[1]},${fromCoords[0]}/to/${toCoords[1]},${toCoords[0]}?` +
    `mode=tube,elizabeth-line,national-rail,dlr,overground&` +
    `journeyPreference=LeastTime&` +
    `app_key=${API_CONFIG.TFL_API_KEY}`;
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(tflUrl);

    if (!response.ok) {
      console.error('Fallback TfL API also failed:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (!data.journeys || data.journeys.length === 0) {
      return null;
    }

    const journey = data.journeys[0];
    return {
      duration: journey.duration || 30,
      changes: countJourneyChanges(journey),
      route: formatJourneyRoute(journey),
      modes: getJourneyModes(journey),
      optimizationUsed: 'fallback_core_modes'
    };

  } catch (error) {
    console.error('Fallback journey request failed:', error.message);
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
  
  if (locationNameCache && locationNameCache.has(cacheKey)) {
    return locationNameCache.get(cacheKey);
  }

  try {
    // ENHANCED: First check for exact matches in our London database
    const exactMatch = findExactLocationMatch(coordinates);
    if (exactMatch) {
      console.log(`Exact location match found: ${exactMatch}`);
      if (locationNameCache) locationNameCache.set(cacheKey, exactMatch);
      return exactMatch;
    }
    
    // ENHANCED: Then check for nearby known locations with strict thresholds
    const nearbyMatch = findNearbyLocationMatch(coordinates);
    if (nearbyMatch) {
      console.log(`Nearby location match found: ${nearbyMatch}`);
      if (locationNameCache) locationNameCache.set(cacheKey, nearbyMatch);
      return nearbyMatch;
    }
    
    // Fallback to Mapbox with London-specific parameters
    const fetch = (await import('node-fetch')).default;
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
      if (locationNameCache) locationNameCache.set(cacheKey, fallbackName);
      return fallbackName;
    }

    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const bestFeature = selectBestLocationFeature(data.features);
      let name = cleanLocationName(bestFeature.text || bestFeature.place_name);
      
      // ENHANCED: Post-process to prevent Borough Market/Bank confusion
      name = disambiguateLocationName(name, coordinates);
      
      if (locationNameCache) locationNameCache.set(cacheKey, name);
      return name;
    }
    
    const fallbackName = await generateFallbackLocationName(coordinates);
    if (locationNameCache) locationNameCache.set(cacheKey, fallbackName);
    return fallbackName;
    
  } catch (error) {
    console.warn('Enhanced geocoding failed:', error);
    const fallbackName = await generateFallbackLocationName(coordinates);
    if (locationNameCache) locationNameCache.set(cacheKey, fallbackName);
    return fallbackName;
  }
}

function findExactLocationMatch(coordinates) {
  const [lng, lat] = coordinates;
  const exactThreshold = 0.0001; // ~10m tolerance for exact matches
  
  // Check stations first (higher priority)
  for (const [name, [sLng, sLat]] of Object.entries(LONDON_LOCATIONS_DATABASE.stations)) {
    if (Math.abs(lng - sLng) < exactThreshold && Math.abs(lat - sLat) < exactThreshold) {
      return toTitleCase(name);
    }
  }
  
  // Check areas
  for (const [name, data] of Object.entries(LONDON_LOCATIONS_DATABASE.areas)) {
    const [aLng, aLat] = data.coords;
    if (Math.abs(lng - aLng) < exactThreshold && Math.abs(lat - aLat) < exactThreshold) {
      return toTitleCase(name);
    }
  }
  
  return null;
}

function findNearbyLocationMatch(coordinates) {
  const [lng, lat] = coordinates;
  const nearbyThreshold = 0.003; // ~300m tolerance for nearby matches
  
  let closestMatch = null;
  let closestDistance = Infinity;
  
  // Check stations first
  for (const [name, [sLng, sLat]] of Object.entries(LONDON_LOCATIONS_DATABASE.stations)) {
    const distance = Math.sqrt(Math.pow(lng - sLng, 2) + Math.pow(lat - sLat, 2));
    if (distance < nearbyThreshold && distance < closestDistance) {
      closestMatch = toTitleCase(name);
      closestDistance = distance;
    }
  }
  
  // Only check areas if no close station found
  if (!closestMatch) {
    for (const [name, data] of Object.entries(LONDON_LOCATIONS_DATABASE.areas)) {
      const [aLng, aLat] = data.coords;
      const distance = Math.sqrt(Math.pow(lng - aLng, 2) + Math.pow(lat - aLat, 2));
      if (distance < nearbyThreshold && distance < closestDistance) {
        closestMatch = toTitleCase(name);
        closestDistance = distance;
      }
    }
  }
  
  return closestMatch;
}

function disambiguateLocationName(name, coordinates) {
  const [lng, lat] = coordinates;
  
  // Specific fixes for Borough Market vs Bank confusion
  const boroughMarketCoords = [-0.0909, 51.5055];
  const bankCoords = [-0.0886, 51.5133];
  
  const distanceToBoroughMarket = Math.sqrt(
    Math.pow(lng - boroughMarketCoords[0], 2) + Math.pow(lat - boroughMarketCoords[1], 2)
  );
  const distanceToBank = Math.sqrt(
    Math.pow(lng - bankCoords[0], 2) + Math.pow(lat - bankCoords[1], 2)
  );
  
  // If the location name suggests Borough but coordinates are closer to Borough Market
  if ((name.toLowerCase().includes('borough') || name.toLowerCase().includes('market')) &&
      distanceToBoroughMarket < distanceToBank) {
    return 'Borough Market';
  }
  
  // If coordinates suggest Bank area but name is ambiguous
  if (name.toLowerCase().includes('bank') && distanceToBank < 0.002) {
    return 'Bank';
  }
  
  return name;
}

// Initialize the location name cache if it doesn't exist
// COMPREHENSIVE LONDON LOCATION RESOLUTION SYSTEM
// This replaces the existing resolveLocationToCoordinates function with a bulletproof system

class LondonLocationResolver {
  constructor() {
    // Expanded London database with comprehensive coverage
    this.londonDatabase = this.buildComprehensiveLondonDatabase();
    this.londonBounds = {
      strict: { minLat: 51.28, maxLat: 51.70, minLng: -0.51, maxLng: 0.33 }, // Greater London
      extended: { minLat: 51.20, maxLat: 51.80, minLng: -0.65, maxLng: 0.45 } // London commuter belt
    };
  }

  buildComprehensiveLondonDatabase() {
    return {
      // MAJOR AREAS - covers all London boroughs and major districts
      areas: {
        // Central London
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
        
        // Specific districts that users commonly reference
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
        
        // Outer London areas that users might reference
        'croydon': { coords: [-0.0982, 51.3762], type: 'district', station: 'Croydon Central', postcodes: ['CR0'], borough: 'Croydon' },
        'bromley': { coords: [0.0140, 51.4060], type: 'district', station: 'Bromley South', postcodes: ['BR1'], borough: 'Bromley' },
        'kingston': { coords: [-0.3064, 51.4120], type: 'district', station: 'Kingston', postcodes: ['KT1', 'KT2'], borough: 'Kingston upon Thames' },
        'kingston upon thames': { coords: [-0.3064, 51.4120], type: 'borough', station: 'Kingston', postcodes: ['KT1', 'KT2'] },
        'ealing': { coords: [-0.3089, 51.5130], type: 'district', station: 'Ealing Broadway', postcodes: ['W5'], borough: 'Ealing' },
        'harrow': { coords: [-0.3947, 51.5898], type: 'district', station: 'Harrow-on-the-Hill', postcodes: ['HA1'], borough: 'Harrow' },
        'barnet': { coords: [-0.2089, 51.6455], type: 'district', station: 'High Barnet', postcodes: ['EN5'], borough: 'Barnet' },
      },
      
      // MAJOR STATIONS - comprehensive list
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
        'leicester square': [-0.1281, 51.5115],
        'covent garden': [-0.1243, 51.5118],
        'westminster': [-0.1276, 51.4994],
        'embankment': [-0.1223, 51.5074],
        'charing cross': [-0.1263, 51.5080],
        'baker street': [-0.1574, 51.5226],
        
        // Zone 2 major stations
        'clapham junction': [-0.1706, 51.4646],
        'richmond': [-0.3037, 51.4613], // CRITICAL: London Richmond
        'wimbledon': [-0.2044, 51.4214],
        'canary wharf': [-0.0235, 51.5054],
        'stratford': [-0.0042, 51.5416],
        'hammersmith': [-0.2239, 51.4916],
        'earl\'s court': [-0.1940, 51.4920],
        'south kensington': [-0.1742, 51.4941],
        'high street kensington': [-0.1919, 51.5010],
        'notting hill gate': [-0.1966, 51.5090],
        'camden town': [-0.1426, 51.5390],
        'angel': [-0.1057, 51.5322],
        'old street': [-0.0878, 51.5259],
        'moorgate': [-0.0886, 51.5186],
        'barbican': [-0.0978, 51.5205],
        'farringdon': [-0.1053, 51.5203],
        'king\'s cross st pancras': [-0.1240, 51.5308],
        
        // Outer London important stations
        'ealing broadway': [-0.3019, 51.5152],
        'croydon central': [-0.0982, 51.3762],
        'bromley south': [0.0173, 51.4001],
        'kingston': [-0.3064, 51.4120],
        'greenwich': [-0.0146, 51.4781],
        'woolwich': [0.0635, 51.4934],
        'harrow-on-the-hill': [-0.3766, 51.5826],
      },
      
      // ALIASES AND COMMON VARIATIONS
      aliases: {
        // Richmond variations
        'richmond london': 'richmond',
        'richmond surrey': 'richmond',
        'richmond uk': 'richmond',
        'richmond station': 'richmond',
        'richmond upon thames': 'richmond',
        
        // Other common variations
        'king cross': 'kings cross',
        'kings x': 'kings cross',
        'kgx': 'kings cross',
        'st pancras': 'kings cross',
        'kcx': 'kings cross',
        'tottenham court rd': 'tottenham court road',
        'tcr': 'tottenham court road',
        'oxford st': 'oxford circus',
        'oxford street': 'oxford circus',
        'bond st': 'bond street',
        'piccadilly': 'piccadilly circus',
        'waterloo station': 'waterloo',
        'london bridge station': 'london bridge',
        'clapham jct': 'clapham junction',
        'clapham junction station': 'clapham junction',
        'earls court': 'earl\'s court',
        'south ken': 'south kensington',
        'high street ken': 'high street kensington',
        'canary wharf station': 'canary wharf',
        'borough': 'borough market',
        'the borough': 'borough market',
        'borough market area': 'borough market',
        
        // Area variations
        'the city': 'city of london',
        'square mile': 'city of london',
        'financial district': 'city of london',
        'west end': 'oxford circus',
        'central london': 'oxford circus',
        'south london': 'waterloo',
        'north london': 'camden',
        'east london': 'stratford',
        'west london': 'hammersmith',
      },
      
      // POSTCODE MAPPINGS
      postcodes: {
        'SW1': 'westminster',
        'SW3': 'kensington and chelsea', 
        'SW5': 'kensington and chelsea',
        'SW7': 'kensington and chelsea',
        'SW10': 'kensington and chelsea',
        'W8': 'kensington and chelsea',
        'W6': 'hammersmith and fulham',
        'W12': 'hammersmith and fulham',
        'W14': 'hammersmith and fulham',
        'SW6': 'hammersmith and fulham',
        'TW9': 'richmond',
        'TW10': 'richmond',
        'SW19': 'wimbledon',
        'SE10': 'greenwich',
        'E14': 'canary wharf',
        'SW4': 'clapham',
        'SW11': 'clapham',
        'N1': 'islington',
        'E1': 'shoreditch',
        'E2': 'shoreditch',
        'W11': 'notting hill',
        'SE1': 'borough market',
        'W5': 'ealing',
        'CR0': 'croydon',
        'BR1': 'bromley',
        'KT1': 'kingston',
        'KT2': 'kingston',
        'HA1': 'harrow',
        'EN5': 'barnet'
      }
    };
  }

  // MAIN RESOLUTION FUNCTION - replaces resolveLocationToCoordinates
  async resolveLocation(locationInput) {
    console.log(`\n🔍 RESOLVING LOCATION: "${locationInput}"`);
    
    const normalizedInput = this.normalizeInput(locationInput);
    
    // STAGE 1: Direct database lookup (highest confidence)
    const directMatch = this.findDirectMatch(normalizedInput);
    if (directMatch) {
      console.log(`✅ DIRECT MATCH: ${directMatch.name} [${directMatch.confidence}]`);
      return directMatch;
    }
    
    // STAGE 2: Postcode pattern matching
    const postcodeMatch = this.findPostcodeMatch(normalizedInput);
    if (postcodeMatch) {
      console.log(`✅ POSTCODE MATCH: ${postcodeMatch.name} [${postcodeMatch.confidence}]`);
      return postcodeMatch;
    }
    
    // STAGE 3: Fuzzy matching within London database
    const fuzzyMatch = this.findFuzzyMatch(normalizedInput);
    if (fuzzyMatch) {
      console.log(`✅ FUZZY MATCH: ${fuzzyMatch.name} [${fuzzyMatch.confidence}]`);
      return fuzzyMatch;
    }
    
    // STAGE 4: London-constrained geocoding
    const geocodedMatch = await this.findGeocodedMatch(normalizedInput);
    if (geocodedMatch) {
      console.log(`✅ GEOCODED MATCH: ${geocodedMatch.name} [${geocodedMatch.confidence}]`);
      return geocodedMatch;
    }
    
    // STAGE 5: Disambiguation or failure
    console.log(`❌ NO VALID LONDON LOCATION FOUND for "${locationInput}"`);
    throw new Error(`Could not find "${locationInput}" in London. Please try being more specific (e.g., "Richmond London" or include a postcode).`);
  }

  normalizeInput(input) {
    return input.toLowerCase()
      .trim()
      .replace(/[^\w\s'-]/g, '') // Remove special chars except apostrophes and hyphens
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  findDirectMatch(normalizedInput) {
    const db = this.londonDatabase;
    
    // Check stations first (highest priority)
    if (db.stations[normalizedInput]) {
      return {
        coordinates: db.stations[normalizedInput],
        name: this.toTitleCase(normalizedInput),
        type: 'station',
        confidence: 'very_high',
        source: 'direct_station_match'
      };
    }
    
    // Check areas
    if (db.areas[normalizedInput]) {
      const area = db.areas[normalizedInput];
      return {
        coordinates: area.coords,
        name: this.toTitleCase(normalizedInput),
        type: area.type,
        confidence: 'very_high',
        source: 'direct_area_match',
        nearestStation: area.station
      };
    }
    
    // Check aliases
    if (db.aliases[normalizedInput]) {
      const aliasTarget = db.aliases[normalizedInput];
      console.log(`🔄 ALIAS REDIRECT: "${normalizedInput}" → "${aliasTarget}"`);
      return this.findDirectMatch(aliasTarget);
    }
    
    return null;
  }

  findPostcodeMatch(normalizedInput) {
    const db = this.londonDatabase;
    
    // Extract potential postcode patterns
    const postcodePattern = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/gi;
    const matches = normalizedInput.match(postcodePattern);
    
    if (matches) {
      for (const postcode of matches) {
        const postcodeUpper = postcode.toUpperCase();
        const shortPostcode = postcodeUpper.replace(/\d[A-Z]{2}$/, ''); // Remove last part (e.g., SW1A → SW1)
        
        if (db.postcodes[postcodeUpper] || db.postcodes[shortPostcode]) {
          const targetArea = db.postcodes[postcodeUpper] || db.postcodes[shortPostcode];
          console.log(`📮 POSTCODE REDIRECT: "${postcodeUpper}" → "${targetArea}"`);
          return this.findDirectMatch(targetArea);
        }
      }
    }
    
    return null;
  }

  findFuzzyMatch(normalizedInput) {
    const db = this.londonDatabase;
    const words = normalizedInput.split(' ');
    
    // Try partial matching for multi-word locations
    const allLocations = [
      ...Object.keys(db.stations),
      ...Object.keys(db.areas),
      ...Object.keys(db.aliases)
    ];
    
    // Look for locations that contain all the input words
    for (const location of allLocations) {
      const locationWords = location.split(' ');
      
      // Check if all input words are contained in location name
      const allWordsMatch = words.every(word => 
        word.length > 2 && locationWords.some(locWord => 
          locWord.includes(word) || word.includes(locWord)
        )
      );
      
      if (allWordsMatch && words.length >= 2) {
        console.log(`🎯 FUZZY MATCH: "${normalizedInput}" → "${location}"`);
        return this.findDirectMatch(location);
      }
    }
    
    // Try single word matching for distinctive words
    for (const word of words) {
      if (word.length > 4) { // Only try longer words
        for (const location of allLocations) {
          if (location.includes(word) && this.isDistinctiveMatch(word, location)) {
            console.log(`🎯 PARTIAL MATCH: "${word}" → "${location}"`);
            return this.findDirectMatch(location);
          }
        }
      }
    }
    
    return null;
  }

  isDistinctiveMatch(word, location) {
    // Avoid matching very common words that could cause false positives
    const commonWords = ['street', 'road', 'lane', 'avenue', 'square', 'park', 'hill', 'green', 'common', 'the', 'and', 'of'];
    return !commonWords.includes(word) && word.length > 4;
  }

  async findGeocodedMatch(normalizedInput) {
    if (!API_CONFIG.MAPBOX_TOKEN) {
      console.log('⚠️ No Mapbox token available for geocoding');
      return null;
    }
    
    try {
      console.log(`🌍 GEOCODING: "${normalizedInput}" with London constraints`);
      
      const fetch = (await import('node-fetch')).default;
      
      // ENHANCED: Multiple geocoding strategies
      const strategies = [
        // Strategy 1: London-constrained search
        this.buildMapboxUrl(normalizedInput, 'london_constrained'),
        // Strategy 2: UK search with London proximity
        this.buildMapboxUrl(normalizedInput, 'uk_london_proximity'),
        // Strategy 3: London area search
        this.buildMapboxUrl(`${normalizedInput} London`, 'london_area')
      ];
      
      for (const [strategyName, url] of strategies) {
        console.log(`🔍 Trying ${strategyName}...`);
        
        const response = await fetch(url);
        if (!response.ok) continue;
        
        const data = await response.json();
        const londonResult = this.findBestLondonResult(data.features, normalizedInput);
        
        if (londonResult) {
          console.log(`✅ GEOCODING SUCCESS with ${strategyName}`);
          return londonResult;
        }
      }
      
      console.log('❌ No valid London results from geocoding');
      return null;
      
    } catch (error) {
      console.error('🚨 Geocoding failed:', error.message);
      return null;
    }
  }

  buildMapboxUrl(query, strategy) {
    const baseUrl = 'https://api.mapbox.com/geocoding/v5/mapbox.places/';
    const token = API_CONFIG.MAPBOX_TOKEN;
    
    const strategies = {
      london_constrained: [
        `${baseUrl}${encodeURIComponent(query)}.json?`,
        `access_token=${token}&`,
        `country=GB&`,
        `bbox=-0.51,51.28,0.33,51.70&`, // London bounding box
        `proximity=-0.1278,51.5074&`, // Central London
        `types=place,postcode,address,poi,neighborhood&`,
        `limit=10`
      ].join(''),
      
      uk_london_proximity: [
        `${baseUrl}${encodeURIComponent(query)}.json?`,
        `access_token=${token}&`,
        `country=GB&`,
        `proximity=-0.1278,51.5074&`, // Central London proximity
        `types=place,postcode,address,poi,neighborhood&`,
        `limit=10`
      ].join(''),
      
      london_area: [
        `${baseUrl}${encodeURIComponent(query)}.json?`,
        `access_token=${token}&`,
        `country=GB&`,
        `proximity=-0.1278,51.5074&`,
        `types=place,neighborhood,poi&`,
        `limit=5`
      ].join('')
    };
    
    return [strategy, strategies[strategy]];
  }

  findBestLondonResult(features, originalInput) {
    if (!features || features.length === 0) return null;
    
    // Score and filter results
    const scoredResults = features
      .map(feature => this.scoreGeocodingResult(feature, originalInput))
      .filter(result => result.isLondon)
      .sort((a, b) => b.score - a.score);
    
    if (scoredResults.length === 0) return null;
    
    const best = scoredResults[0];
    console.log(`🏆 Best geocoding result: ${best.feature.place_name} (score: ${best.score})`);
    
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
    const text = (feature.text || '').toLowerCase();
    const context = feature.context || [];
    
    // CRITICAL: London boundary check
    if (this.isInLondonBounds(feature.center)) {
      isLondon = true;
      score += 50; // Base London bonus
    }
    
    // Context analysis for London indicators
    const londonIndicators = ['london', 'greater london', 'england', 'united kingdom'];
    for (const ctx of context) {
      const ctxText = (ctx.text || '').toLowerCase();
      if (londonIndicators.some(indicator => ctxText.includes(indicator))) {
        isLondon = true;
        score += 20;
      }
    }
    
    // Name matching score
    const inputWords = originalInput.split(' ');
    const nameWords = text.split(' ');
    
    for (const inputWord of inputWords) {
      if (inputWord.length > 2) {
        for (const nameWord of nameWords) {
          if (nameWord.includes(inputWord) || inputWord.includes(nameWord)) {
            score += 15;
          }
        }
      }
    }
    
    // Relevance score from Mapbox
    score += (feature.relevance || 0) * 20;
    
    // Type preferences
    const types = feature.place_type || [];
    if (types.includes('place')) score += 10;
    if (types.includes('neighborhood')) score += 8;
    if (types.includes('poi')) score += 6;
    
    // Penalize obviously wrong locations
    if (name.includes('brentwood') || name.includes('essex') || name.includes('hertfordshire')) {
      score = 0;
      isLondon = false;
    }
    
    console.log(`📊 Scored "${feature.place_name}": ${score} (London: ${isLondon})`);
    
    return { feature, score, isLondon };
  }

  isInLondonBounds(coordinates) {
    const [lng, lat] = coordinates;
    const bounds = this.londonBounds.strict;
    
    return lat >= bounds.minLat && 
           lat <= bounds.maxLat &&
           lng >= bounds.minLng && 
           lng <= bounds.maxLng;
  }

  cleanLocationName(name) {
    if (!name) return 'Unknown Location';
    
    return name
      .replace(/,.*$/, '') // Remove everything after first comma
      .replace(/\b(Station|Underground|Tube|Rail)\b/gi, '') // Remove transport type words
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  toTitleCase(str) {
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }
}

// INTEGRATION: Replace the existing resolveLocationToCoordinates function
const londonResolver = new LondonLocationResolver();

async function resolveLocationToCoordinates(locationInput) {
  try {
    return await londonResolver.resolveLocation(locationInput);
  } catch (error) {
    console.error(`Location resolution failed for "${locationInput}":`, error.message);
    throw error;
  }
}

// TESTING: Add this function to validate the resolver
async function testLocationResolution() {
  const testCases = [
    'Richmond', // Should resolve to London Richmond, not Brentwood
    'Richmond London',
    'Richmond upon Thames',
    'Kensington',
    'Borough Market',
    'Borough',
    'Bank',
    'Kings Cross',
    'TW9', // Richmond postcode
    'SW1', // Westminster postcode
    'Canary Wharf',
    'E14', // Canary Wharf postcode
    'Wimbledon',
    'Angel',
    'Shoreditch',
    'Invalid Location XYZ' // Should fail gracefully
  ];
  
  console.log('\n🧪 TESTING LOCATION RESOLUTION...\n');
  
  for (const testCase of testCases) {
    try {
      const result = await resolveLocationToCoordinates(testCase);
      console.log(`✅ "${testCase}" → ${result.name} [${result.coordinates}] (${result.confidence})`);
    } catch (error) {
      console.log(`❌ "${testCase}" → ERROR: ${error.message}`);
    }
  }
}

function findKnownLondonLocation(coordinates) {
  const [lng, lat] = coordinates;
  const threshold = 0.002; // Reduced from 0.008 to ~200m tolerance (was ~800m)
  
  let bestMatch = null;
  let closestDistance = Infinity;
  
  // Check areas first (Borough Market is an area, not a station)
  for (const [name, data] of Object.entries(LONDON_LOCATIONS_DATABASE.areas)) {
    const [aLng, aLat] = data.coords;
    const distance = Math.abs(lng - aLng) + Math.abs(lat - aLat); // Manhattan distance
    
    if (distance < threshold && distance < closestDistance) {
      bestMatch = toTitleCase(name);
      closestDistance = distance;
    }
  }
  
  // Only check stations if no area found (prevents Borough Market → Bank confusion)
  if (!bestMatch) {
    for (const [name, [sLng, sLat]] of Object.entries(LONDON_LOCATIONS_DATABASE.stations)) {
      const distance = Math.abs(lng - sLng) + Math.abs(lat - sLat);
      
      if (distance < threshold && distance < closestDistance) {
        bestMatch = toTitleCase(name);
        closestDistance = distance;
      }
    }
  }
  
  console.log(`Location lookup for [${lng}, ${lat}]: found "${bestMatch}" at distance ${closestDistance}`);
  return bestMatch;
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
  
  // NEW WEIGHTS: Heavily prioritize speed
  const speedWeight = 0.70;      // 70% - absolute travel time matters most
  const fairnessWeight = 0.15;   // 15% - fairness is secondary
  const convenienceWeight = 0.10; // 10% - changes matter less
  const locationWeight = 0.05;   // 5% - location type is minor
  
  // SPEED SCORE: Exponential penalty for slow journeys
  let speedScore = 100;
  if (averageTime > 20) {
    speedScore = Math.max(0, 100 - Math.pow((averageTime - 20) / 20, 1.5) * 100);
  }
  
  // FAIRNESS SCORE: More tolerant of time differences
  const fairnessScore = Math.max(0, 100 - (timeDifference / 15) * 100);
  
  // CONVENIENCE SCORE: Less penalty for changes
  const totalChanges = journey1.changes + journey2.changes;
  const convenienceScore = Math.max(0, 100 - totalChanges * 20);
  
  // LOCATION SCORE: Minimal impact
  let locationScore = 60;
  if (type === 'major_station') locationScore += 15;
  if (zones.includes(1)) locationScore += 10;
  
  const finalScore = (
    speedScore * speedWeight +
    fairnessScore * fairnessWeight + 
    convenienceScore * convenienceWeight +
    locationScore * locationWeight
  );
  
  console.log(`Score breakdown for ${area.name}: Speed=${speedScore.toFixed(1)} (${averageTime}min avg), ` +
             `Fairness=${fairnessScore.toFixed(1)} (${timeDifference}min diff), ` +
             `Final=${finalScore.toFixed(1)}`);
  
  return Math.round(finalScore * 10) / 10;
}

function selectFastestJourney(journeys) {
  if (journeys.length === 1) return journeys[0];
  
  const speedScored = journeys.map(journey => {
    const changes = countJourneyChanges(journey);
    const walkingTime = calculateWalkingTime(journey);
    const elizabethLine = checkElizabethLineUsage(journey);
    const directRoute = changes === 0;
    
    let score = 120 - journey.duration;
    score += directRoute ? 15 : 0;
    score += elizabethLine ? 12 : 0;
    score -= changes * 8;
    score -= walkingTime * 0.3;
    
    return { journey, score, duration: journey.duration };
  });
  
  speedScored.sort((a, b) => b.score - a.score);
  
  console.log('Speed-optimized journey selection:', 
    speedScored.map((s, i) => `${i + 1}: ${s.duration}min (score: ${s.score})`).join(', '));
  
  return speedScored[0].journey;
}

function applyGoogleMapsTimeCorrection(journey) {
  if (!journey || !journey.legs) {
    return { duration: 45, changes: 0, optimizationApplied: 'fallback', confidence: 'low' };
  }

  let correctedDuration = journey.duration;
  let optimizations = [];
  
  const walkingTime = calculateWalkingTime(journey);
  if (walkingTime > 5) {
    const walkingReduction = Math.min(walkingTime * 0.25, 8);
    correctedDuration -= walkingReduction;
    optimizations.push(`walking_reduction_${Math.round(walkingReduction)}min`);
  }
  
  const changes = countJourneyChanges(journey);
  if (changes > 0) {
    const connectionReduction = Math.min(changes * 3, 10);
    correctedDuration -= connectionReduction;
    optimizations.push(`connection_reduction_${connectionReduction}min`);
  }
  
  const hasElizabethLine = checkElizabethLineUsage(journey);
  if (hasElizabethLine) {
    const elizabethBonus = Math.min(correctedDuration * 0.15, 12);
    correctedDuration -= elizabethBonus;
    optimizations.push(`elizabeth_line_bonus_${Math.round(elizabethBonus)}min`);
  }
  
  if (changes === 0) {
    const directBonus = Math.min(correctedDuration * 0.1, 5);
    correctedDuration -= directBonus;
    optimizations.push(`direct_route_bonus_${Math.round(directBonus)}min`);
  }
  
  correctedDuration = Math.max(correctedDuration, 8);
  
  console.log(`Time correction: ${journey.duration}min → ${Math.round(correctedDuration)}min (${optimizations.join(', ')})`);
  
  return {
    duration: Math.round(correctedDuration),
    changes: changes,
    optimizationApplied: optimizations.join(', '),
    confidence: optimizations.length > 2 ? 'high' : 'medium'
  };
}

async function getSpeedOptimizedFallback(fromCoords, toCoords, meetingTime) {
  console.log('Using speed-optimized fallback journey estimation...');
  
  const distance = getDistance(fromCoords, toCoords);
  
  let estimatedTime;
  if (distance < 2000) {
    estimatedTime = 15 + (distance / 1000) * 3;
  } else if (distance < 5000) {
    estimatedTime = 20 + (distance / 1000) * 4;
  } else {
    estimatedTime = 25 + (distance / 1000) * 5;
  }
  
  const estimatedChanges = distance > 3000 ? (distance > 8000 ? 2 : 1) : 0;
  
  return {
    duration: Math.round(estimatedTime),
    changes: estimatedChanges,
    route: `Estimated ${Math.round(distance/1000, 1)}km journey`,
    modes: ['tube', 'walking'],
    optimizationApplied: 'distance_estimation',
    confidence: 'low'
  };
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

async function debugLocationResolution(locationInput) {
  console.log(`\n=== DEBUGGING LOCATION: "${locationInput}" ===`);
  
  // Step 1: Resolve to coordinates
  const resolved = await resolveLocationToCoordinates(locationInput);
  console.log(`Step 1 - Resolved to:`, resolved);
  
  // Step 2: Convert coordinates back to name
  const locationName = await getLocationName(resolved.coordinates);
  console.log(`Step 2 - Location name for coordinates:`, locationName);
  
  // Step 3: Check what happens in journey planning
  console.log(`Step 3 - Journey planning will use: "${locationName}" at [${resolved.coordinates}]`);
  
  return { resolved, locationName };
}

module.exports = app;
