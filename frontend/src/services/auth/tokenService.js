export const tokenService = {
  getToken: () => {
    try {
      return localStorage.getItem('access_token');
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  },

  getRefreshToken: () => {
    try {
      return localStorage.getItem('refresh_token');
    } catch (error) {
      console.error('Error getting refresh token:', error);
      return null;
    }
  },
  
  setTokens: (accessToken, refreshToken) => {
    try {
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
    } catch (error) {
      console.error('Error setting tokens:', error);
    }
  },
  
  clearTokens: () => {
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } catch (error) {
      console.error('Error clearing tokens:', error);
    }
  },
  
  isAuthenticated: () => {
    try {
      return !!localStorage.getItem('access_token');
    } catch (error) {
      console.error('Error checking authentication:', error);
      return false;
    }
  },

  getTokenExpiration: () => {
    const token = tokenService.getToken();
    if (!token) return null;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp ? payload.exp * 1000 : null;
    } catch (error) {
      console.error('Error parsing token:', error);
      return null;
    }
  },

  isTokenExpired: () => {
    const expiration = tokenService.getTokenExpiration();
    if (!expiration) return true;
    
    return Date.now() >= expiration;
  },

  shouldRefreshToken: () => {
    const expiration = tokenService.getTokenExpiration();
    if (!expiration) return false;
    
    const fiveMinutes = 5 * 60 * 1000;
    return Date.now() >= (expiration - fiveMinutes);
  }
};