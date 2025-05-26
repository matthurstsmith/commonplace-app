```markdown
# Commonplace - Smart Meeting Location Finder

Find the perfect meeting spot using intelligent isochrone mapping and multi-criteria optimization.

## 🚀 Quick Start

### Backend Deployment (Railway)

1. **Deploy to Railway**
   - Go to [railway.app](https://railway.app)
   - "New Project" → "Deploy from GitHub repo"
   - Select this repository
   - Choose the `backend` folder as root

2. **Add Environment Variables**
   ```
   MAPBOX_TOKEN=pk.eyJ1IjoibWF0dGhzIiwiYSI6ImNtOHU5eGNzZzBsMWQybXI1bWllc2g5MHcifQ.RquTyVYbChEvYMuQR0PsTg
   TFL_API_KEY=484cc7de4f594e23bd0798657f8cb8a3
   NODE_ENV=production
   ```

3. **Get Your API URL**
   - Note the Railway app URL (e.g., `https://your-app.railway.app`)

### Frontend Deployment (Vercel)

1. **Update API URL**
   - Edit `frontend/index.html`
   - Change `API_BASE_URL` to your Railway URL + `/api`

2. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - "New Project" → "Import Git Repository"
   - Select this repository
   - Set root directory to `frontend`

## 📋 Features

- **Isochrone Analysis**: Uses Mapbox to find travel-time zones
- **Real Journey Planning**: Integrates with TfL for accurate transport data
- **Multi-Criteria Optimization**: Balances fairness, convenience, and speed
- **Smart Caching**: Redis-powered caching for optimal performance
- **Rate Limiting**: Protects API quotas and prevents abuse

## 🏗️ Architecture

- **Backend**: Node.js + Express + Redis
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **APIs**: Mapbox (isochrones), TfL (journey planning)
- **Hosting**: Railway (backend), Vercel (frontend)

## 💰 Costs

- **Railway**: ~$5-20/month (includes Redis)
- **Vercel**: Free
- **APIs**: Mapbox free tier (100k requests/month), TfL free

## 🔧 Development

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
# Open index.html in browser or serve with local server
```

## 📖 API Documentation

### Search for Meeting Spots
```bash
POST /api/search/meeting-spots
{
  "location1": "London Bridge",
  "location2": "South Kensington",
  "venueTypes": ["cafe", "restaurant"]
}
```

### Get Location Suggestions
```bash
GET /api/locations/suggestions?q=london bridge
```

### Health Check
```bash
GET /api/health
```

## 🐛 Troubleshooting

1. **API Not Responding**: Check Railway logs and environment variables
2. **No Search Results**: Verify API keys are correct
3. **Slow Performance**: Check Redis connection and cache hit rates

## 📞 Support

Check the `/docs` folder for detailed guides:
- `DEPLOYMENT.md` - Step-by-step deployment
- `API.md` - Complete API documentation
- `TROUBLESHOOTING.md` - Common issues and solutions
```
