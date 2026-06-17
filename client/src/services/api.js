import axios from 'axios';

import env from '../../env.js';


const getApiUrl = () => {
  // Use the dedicated API_BASE_URL if available, otherwise construct from SERVER_BASE_URL
  const apiUrl = env.API_BASE_URL || `${env.SERVER_BASE_URL}/api`;

  console.log(`Connecting to API at:`, apiUrl);
  return apiUrl;
};
const API_URL = getApiUrl();

// Helper function to get full URL for images/uploads
export const getServerUrl = (path) => {
  if (!path) return null;
  // If it's already a full URL (starts with http/https), return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  // Otherwise, prepend the server base URL
  return `${env.SERVER_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

export { API_URL };


// Log API connection info
console.log('API connecting to:', API_URL);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Increase timeout for mobile networks
  timeout: 60000
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    console.log('API Request interceptor - Token found:', !!token);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('API Request - Authorization header set:', config.headers.Authorization ? 'Bearer [TOKEN]' : 'MISSING');
    } else {
      console.log('API Request - No token found in localStorage');
    }
    console.log('API Request to:', config.url);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid, clear it
      localStorage.removeItem('authToken');
      delete axios.defaults.headers.common['Authorization'];
      
      // Log the error but let AuthContext handle the state management
      console.log('API: Authentication failed, token cleared - letting AuthContext handle redirect');
    }
    return Promise.reject(error);
  }
);

// Notes API
export const notesApi = {
  // Get notes with pagination (main, archive, or trash)
  getNotes: async (page = 1, limit = 80, archived = false, deleted = false, oldestFirst = false, includeDetails = true, sortCriteria = null, truncateContent = true, contentLimit = 300) => {
    console.log(`API getNotes called with: page=${page}, archived=${archived}, deleted=${deleted}, sortCriteria=${sortCriteria}, truncateContent=${truncateContent}, view params`);
    // Convert string 'true'/'false' to boolean if needed
    const isArchived = archived === 'true' || archived === true;
    const isDeleted = deleted === 'true' || deleted === true;
    
    const params = { 
      page, 
      limit, 
      archived: isArchived, 
      deleted: isDeleted, 
      oldestFirst, 
      includeDetails,
      truncateContent,
      contentLimit
    };
    
    // Add sort criteria if provided
    if (sortCriteria) {
      params.sortCriteria = sortCriteria;
    }
    
    const response = await api.get('/notes', { params });
    return response.data;
  },

  // Search notes
  searchNotes: async (query, page = 1, limit = 80, sortOrder = 'updatedAt_desc', includeDetails = true, truncateContent = true, contentLimit = 300, tagIdMap = null) => {
    // sortOrder can be 'updatedAt_desc', 'createdAt_asc', 'createdAt_desc'
    const params = { query, page, limit, sortOrder, includeDetails, truncateContent, contentLimit };
    if (tagIdMap && Object.keys(tagIdMap).length > 0) {
      params.tagIds = JSON.stringify(tagIdMap);
    }
    const response = await api.get('/notes/search', { params });
    return response.data;
  },

  // Get a single note
  getNote: async (id, includeDetails = true) => {
    const response = await api.get(`/notes/${id}`, {
      params: { includeDetails }
    });
    return response.data;
  },
  
  // Direct method to fetch a note by ID - alternative implementation
  getNoteById: async (id) => {
    try {
      console.log("Direct getNoteById call for:", id);
      const response = await api.get(`/notes/${id}`);
      console.log("getNoteById response:", response.data);
      return response.data;
    } catch (error) {
      console.error("getNoteById failed:", error);
      throw error;
    }
  },

  // Create a new note
  createNote: async (note) => {
    const response = await api.post('/notes', note);
    return response.data;
  },

  // Update a note
  updateNote: async (id, note) => {
    const response = await api.put(`/notes/${id}`, note);
    return response.data;
  },

  // Delete a note permanently
  deleteNote: async (id) => {
    const response = await api.delete(`/notes/${id}`);
    return response.data;
  },

  // Archive a note
  archiveNote: async (id) => {
    const response = await api.patch(`/notes/${id}/archive`);
    return response.data;
  },

  // Unarchive a note
  unarchiveNote: async (id) => {
    const response = await api.patch(`/notes/${id}/unarchive`);
    return response.data;
  },

  // Move a note to trash
  trashNote: async (id) => {
    const response = await api.patch(`/notes/${id}/trash`);
    return response.data;
  },

  // Restore a note from trash
  restoreNote: async (id) => {
    const response = await api.patch(`/notes/${id}/restore`);
    return response.data;
  },

  // Toggle pin status
  togglePinNote: async (id) => {
    const response = await api.patch(`/notes/${id}/pin`);
    return response.data;
  },
  
  // Change note color
  changeNoteColor: async (id, color) => {
    const response = await api.patch(`/notes/${id}/color`, { color });
    return response.data;
  },
  
  // Get images for a note
  getNoteImages: async (noteId) => {
    const response = await api.get(`/notes/${noteId}/images`);
    return response.data;
  },
  
  // Add image to a note
  addNoteImage: async (noteId, imageData) => {
    const response = await api.post(`/notes/${noteId}/images`, imageData);
    return response.data;
  },
  
  // Delete an image
  deleteImage: async (imageId) => {
    const response = await api.delete(`/images/${imageId}`);
    return response.data;
  },

  // --- Bulk Actions ---
  bulkArchiveNotes: async (noteIds) => {
    const response = await api.post('/notes/bulk/archive', { noteIds });
    return response.data;
  },

  bulkUnarchiveNotes: async (noteIds) => {
    const response = await api.post('/notes/bulk/unarchive', { noteIds });
    return response.data;
  },

  bulkTrashNotes: async (noteIds) => {
    const response = await api.post('/notes/bulk/trash', { noteIds });
    return response.data;
  },

  bulkRestoreNotes: async (noteIds) => {
    const response = await api.post('/notes/bulk/restore', { noteIds });
    return response.data;
  },

  bulkDeletePermanently: async (noteIds) => {
    const response = await api.post('/notes/bulk/delete-permanently', { noteIds });
    return response.data;
  },

  bulkChangeColorNotes: async (noteIds, color) => {
    const response = await api.post('/notes/bulk/color', { noteIds, color });
    return response.data;
  },

  // Bulk download notes
  bulkDownloadNotes: async (noteIds) => {
    const response = await api.post('/notes/bulk-download', { noteIds }, {
      responseType: 'blob' // Important for file download
    });
    return response.data;
  },

  // Get ALL trashed notes (for empty trash functionality)
  getAllTrashedNotes: async () => {
    const response = await api.get('/notes/all-trashed');
    return response.data;
  },

  // Per-month note counts, for the calendar browser
  getNoteMonthCounts: async () => {
    const response = await api.get('/notes/month-counts');
    return response.data; // { counts: [{ year, month, count }] }
  },

  // Extract content from URL
  extractUrlContent: async (url, extractType, noteId = null, includeImages = false) => {
    const payload = { url, extractType };
    if (noteId) {
      payload.noteId = noteId;
    }
    if (includeImages) {
      payload.includeImages = includeImages;
    }
    const response = await api.post('/notes/extract-url', payload);
    return response.data; // Should return { title, content, images? }
  },

  // --- Version History ---
  getNoteVersions: async (noteId) => {
    const response = await api.get(`/notes/${noteId}/versions`);
    return response.data; // Should return { versions: [{ id, created_at }, ...] }
  },

  // Note: This doesn't fetch, just provides the URL for a direct browser download via <a> tag
  getNoteVersionDownloadUrl: (noteId, versionId) => {
    return `${API_URL}/notes/${noteId}/versions/${versionId}/download`;
  },

  restoreNoteVersion: async (noteId, versionId) => {
    const response = await api.post(`/notes/${noteId}/versions/${versionId}/restore`);
    return response.data; // Should return { note: {...} }
  },
  // --- End Version History ---
};

// Tags API
export const tagsApi = {
  // Get all tags
  getAllTags: async () => {
    const response = await api.get('/tags');
    return response.data;
  },
  
  // Create a new tag
  createTag: async (name, visible = true, isFolder = false, parentId = null) => {
    console.log('Creating tag with data:', { name, visible, isFolder, parentId });
    try {
      const response = await api.post('/tags', { name, visible, isFolder, parentId });
      console.log('Tag creation response:', response);
      return response.data;
    } catch (error) {
      console.error('Error in createTag API call:', error);
      throw error;
    }
  },
  
  // Update a tag
  updateTag: async (id, updates) => {
    const response = await api.put(`/tags/${id}`, updates);
    return response.data;
  },
  
  // Rename a tag
  renameTag: async (id, name) => {
    return await tagsApi.updateTag(id, { name });
  },
  
  // Toggle tag visibility
  toggleTagVisibility: async (id, visible) => {
    console.log(`API: Toggling tag ${id} visibility to ${visible}`);
    const response = await api.patch(`/tags/${id}/visibility`, { visible });
    console.log('API response for toggleTagVisibility:', response.data);
    return response.data;
  },
  
  // Delete a tag
  deleteTag: async (id, { withNotes = false } = {}) => {
    const response = await api.delete(`/tags/${id}`, withNotes ? { params: { withNotes: 'true' } } : {});
    return response.data;
  },
  
  // Get notes by tag
  getNotesByTag: async (tagId, page = 1, limit = 40) => {
    const response = await api.get(`/tags/${tagId}/notes`, {
      params: { page, limit }
    });
    return response.data;
  },
  
  // Add tag to note
  addTagToNote: async (noteId, tagId) => {
    const response = await api.post(`/notes/${noteId}/tags`, { tagId });
    return response.data;
  },
  
  // Remove tag from note
  removeTagFromNote: async (noteId, tagId) => {
    const response = await api.delete(`/notes/${noteId}/tags/${tagId}`);
    return response.data;
  },
  
  // Get tags for a note
  getNoteTags: async (noteId) => {
    const response = await api.get(`/notes/${noteId}/tags`);
    return response.data;
  },
  // Bulk tag operations
  bulkAddTagToNotes: (noteIds, tagId) => api.post('/tags/bulk-add', { noteIds, tagId }),
  bulkRemoveTagFromNotes: (noteIds, tagId) => api.post('/tags/bulk-remove', { noteIds, tagId }),
};

// AI API
export const aiApi = {
  suggestTags: async (noteContent, availableTags) => {
    const response = await api.post('/ai/suggest-tags', { noteContent, availableTags });
    return response.data;
  },
  summarize: async (noteContent) => {
    const response = await api.post('/ai/summarize', { noteContent });
    return response.data;
  },
  ocr: async (imageFile) => {
    const formData = new FormData();
    formData.append('image', imageFile);
    const response = await api.post('/ai/ocr', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  getModels: async () => {
    const response = await api.get('/ai/models');
    return response.data;
  },
};

// Objects API (centralized books, attachments, movies, etc.)
export const objectsApi = {
  // Get all objects, optionally filtered by type
  getObjects: async (type = null) => {
    const params = type ? { type } : {};
    const response = await api.get('/objects', { params });
    return response.data;
  },

  // Search objects (for @mention autocomplete)
  search: async (query, type = null, limit = 10) => {
    const params = { q: query, limit };
    if (type) params.type = type;
    const response = await api.get('/objects/search', { params });
    return response.data;
  },

  // Get a single object by ID
  getObject: async (id) => {
    const response = await api.get(`/objects/${id}`);
    return response.data;
  },

  // Create a new object
  create: async ({ type, title, thumbnail_url, source_url, metadata }) => {
    const response = await api.post('/objects', { type, title, thumbnail_url, source_url, metadata });
    return response.data;
  },

  // Find or create object (upsert by source_url)
  findOrCreate: async ({ type, title, thumbnail_url, source_url, metadata }) => {
    const response = await api.post('/objects/find-or-create', { type, title, thumbnail_url, source_url, metadata });
    return response.data;
  },

  // Update an object
  update: async (id, updates) => {
    const response = await api.patch(`/objects/${id}`, updates);
    return response.data;
  },

  // Update user state (reading progress, etc.)
  updateUserState: async (id, userState) => {
    const response = await api.patch(`/objects/${id}/user-state`, userState);
    return response.data.object;
  },

  // Delete an object
  delete: async (id) => {
    const response = await api.delete(`/objects/${id}`);
    return response.data;
  },

  // Get all notes referencing an object (backlinks)
  getBacklinks: async (id) => {
    const response = await api.get(`/objects/${id}/notes`);
    return response.data;
  },

  // Link object to note
  linkToNote: async (objectId, noteId) => {
    const response = await api.post(`/objects/${objectId}/link/${noteId}`);
    return response.data;
  },

  // Unlink object from note
  unlinkFromNote: async (objectId, noteId) => {
    const response = await api.delete(`/objects/${objectId}/link/${noteId}`);
    return response.data;
  }
};

// Foxit Snooper API (integration with Foxit PDF Reader monitor)
// Helper to get custom snooper URL from localStorage
const getFoxitSnooperUrl = () => {
  const url = localStorage.getItem('foxitSnooperUrl');
  return url && url.trim() ? url.trim() : null;
};

// Helper to add snooper URL header if configured
const foxitConfig = () => {
  const snooperUrl = getFoxitSnooperUrl();
  return snooperUrl ? { headers: { 'X-Foxit-Snooper-URL': snooperUrl } } : {};
};

export const foxitApi = {
  // Get current Foxit state (document title, page number)
  getInfo: async () => {
    const response = await api.get('/foxit/info', foxitConfig());
    return response.data;
  },

  // Get all documents seen by the snooper
  getDocuments: async () => {
    const response = await api.get('/foxit/documents', foxitConfig());
    return response.data;
  },

  // Get all document-to-book mappings
  getMappings: async () => {
    const response = await api.get('/foxit/mappings', foxitConfig());
    return response.data;
  },

  // Create or update a document-to-book mapping
  setMapping: async (documentTitle, objectId, bookTitle) => {
    const response = await api.post('/foxit/mapping', {
      document_title: documentTitle,
      object_id: objectId,
      book_title: bookTitle
    }, foxitConfig());
    return response.data;
  },

  // Delete a document mapping
  deleteMapping: async (documentTitle) => {
    const response = await api.delete('/foxit/mapping', {
      params: { doc: documentTitle },
      ...foxitConfig()
    });
    return response.data;
  },

  // Check if snooper is available
  checkHealth: async () => {
    const response = await api.get('/foxit/health', foxitConfig());
    return response.data;
  },

  // Get page for a specific book object (reverse lookup from mapping)
  getPageForObject: async (objectId) => {
    const response = await api.get(`/foxit/page-for-object/${objectId}`, foxitConfig());
    return response.data;
  }
};

export default api;
