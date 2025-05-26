class CommonplaceAPI {
  constructor(baseURL = 'http://localhost:3001/api') {
    this.baseURL = baseURL;
    this.cache = new Map();
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Location suggestions with caching
  async getLocationSuggestions(query) {
    if (query.length < 2) return { suggestions: [] };
    
    const cacheKey = `suggestions_${query}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const result = await this.request(`/locations/suggestions?q=${encodeURIComponent(query)}`);
    
    // Cache for 5 minutes
    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);
    
    return result;
  }

  // Main search function
  async findMeetingSpots(location1, location2, options = {}) {
    const { venueTypes = [], meetingTime = null } = options;
    
    return await this.request('/search/meeting-spots', {
      method: 'POST',
      body: JSON.stringify({
        location1,
        location2,
        venueTypes,
        meetingTime
      })
    });
  }

  // Health check
  async checkHealth() {
    return await this.request('/health');
  }
}

// Make it available globally
window.CommonplaceAPI = CommonplaceAPI;
