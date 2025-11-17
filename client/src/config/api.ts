// API Configuration - Use relative paths for better network compatibility
// This works with Vite proxy in development and serves from same origin in production

// Helper function to construct API URLs using relative paths
export const getApiUrl = (endpoint: string) => {
  // Remove leading slash if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `/api/${cleanEndpoint}`;
};

// For backward compatibility with existing code
export const apiUrl = '';